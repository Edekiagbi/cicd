# LumenBoard: beginner-friendly React CI/CD portfolio

This project deploys a small React frontend through:

```text
VS Code → GitHub → GitHub Actions → private Docker Hub → Amazon ECS on Fargate
```

It uses Docker, GitHub Actions, AWS IAM, Secrets Manager, and ECS. It does **not** use Docker Compose, Terraform, Kubernetes, a backend, a database, or real user authentication. The buttons and sample activity are frontend demo data.

## Architecture

```text
                         push to main
 VS Code ── Git ──> GitHub repository
                         │
                         ▼
             GitHub Actions: npm ci → lint → tests → build
                         │ quality succeeds
                         ▼
          Build image tagged <full-git-commit-sha> and push
                         │
          ┌──────────────┴────────────────────┐
          ▼                                   ▼
 Docker Hub private repo              GitHub OIDC → AWS IAM role
 (immutable SHA tag)                            │
                                                ▼
                                   Register ECS task revision
                                   with that exact image tag
                                                │
                                                ▼
                           ECS Fargate service replaces its task
                           │                    │
                           │                    └─ execution role reads
                           │                       Docker Hub pull secret
                           ▼
                 Public task IP:8080 → React site
                 CloudWatch Logs ← Nginx stdout/stderr
```

### Project files

```text
.
├── .dockerignore
├── .gitignore
├── .github/
│   └── workflows/
│       └── cicd.yaml
├── Dockerfile
├── eslint.config.js
├── implementation.md
├── index.html
├── nginx.conf
├── package-lock.json                 # created by npm install
├── package.json
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── metrics.js
│   └── styles.css
├── task-definition.json
├── tests/
│   └── metrics.test.js
└── vite.config.js
```

The source, dependency manifest/lockfile, ignores, Dockerfile, Nginx configuration, task definition, and workflow are the complete project files in this folder. `package-lock.json` is generated from the pinned `package.json`; commit it so `npm ci` is deterministic.

## Names and placeholders

Use the same names below unless you deliberately update the matching workflow variables and task definition:

| Item | Value to create or obtain |
|---|---|
| Docker Hub repository | `<DOCKERHUB_NAMESPACE>/lumenboard` (make it **Private**) |
| AWS Region | `<AWS_REGION>` such as `us-east-1`; use one region consistently |
| ECS cluster | `lumenboard-cluster` |
| ECS service | `lumenboard-service` |
| Task definition family | `lumenboard` |
| Container name | `lumenboard` |
| CloudWatch log group | `/ecs/lumenboard` |
| Task execution role | `ecsTaskExecutionRoleLumenboard` |
| GitHub deploy role | `GitHubActionsLumenboardDeploy` |
| Task security group | `lumenboard-task-sg` |
| Docker Hub read secret | `lumenboard/dockerhub-pull` in AWS Secrets Manager |
| GitHub repository | `<GITHUB_OWNER>/<GITHUB_REPOSITORY>` |
| AWS account ID | `<12_DIGIT_AWS_ACCOUNT_ID>` |
| GitHub OIDC role ARN | `arn:aws:iam::<12_DIGIT_AWS_ACCOUNT_ID>:role/GitHubActionsLumenboardDeploy` |
| Task execution role ARN | `arn:aws:iam::<12_DIGIT_AWS_ACCOUNT_ID>:role/ecsTaskExecutionRoleLumenboard` |
| Docker Hub secret ARN | Copy the complete ARN shown by Secrets Manager; it includes the region and a generated suffix |

These are placeholders, not credentials. Do not send passwords, access tokens, or AWS keys to anyone or commit them. Account IDs and ARNs identify resources but are not passwords.

## 1. Create the GitHub project and run it locally

### On your computer

Open this folder in VS Code. In the VS Code terminal (PowerShell), verify Node.js 24+ and Docker Desktop are available:

```powershell
node --version
npm --version
docker --version
```

Install the exact dependencies, run the automated quality checks, and start the dev server:

```powershell
npm install
npm run lint
npm test
npm run build
npm run dev
```

Open the localhost URL printed by Vite (normally `http://localhost:5173`). Stop the dev server with `Ctrl+C`. `npm install` creates `package-lock.json`; keep that file in the repository.

### Build and test the production container locally

Run these commands from the project folder:

```powershell
docker build -t lumenboard:local .
docker run --rm -d --name lumenboard-local -p 8080:8080 lumenboard:local
docker ps
Invoke-WebRequest http://localhost:8080/health
```

Open `http://localhost:8080` in a browser. The footer should say `Build local`. When finished:

```powershell
docker stop lumenboard-local
```

The multi-stage `Dockerfile` builds static React files with Node 24, then serves only those files from an unprivileged Nginx container on port 8080. `.dockerignore` keeps Git metadata and local dependencies out of the image. The health endpoint is `/health`.

## 2. Create the private Docker Hub repository

### Account setup you complete in Docker Hub

1. Sign in to Docker Hub and create a repository named `lumenboard`.
2. Set its visibility to **Private**. Note your exact Docker Hub namespace/username.
3. Create two separate access tokens:
   - **CI push token:** permission to push (Read & Write if Docker Hub offers only combined permissions). Store it only as GitHub secret `DOCKERHUB_TOKEN`.
   - **ECS pull token:** read-only permission. Use this token as the `password` in AWS Secrets Manager in step 4. Do not reuse your personal account password.

### Push a bootstrap image for first-time ECS setup

The first ECS service needs a task definition and image before GitHub Actions can update it. After the local Docker test succeeds, sign in interactively (Docker prompts for the token; do not put it in a command):

```powershell
docker login --username <DOCKERHUB_USERNAME>
docker tag lumenboard:local <DOCKERHUB_NAMESPACE>/lumenboard:bootstrap
docker push <DOCKERHUB_NAMESPACE>/lumenboard:bootstrap
```

Replace the angle-bracketed placeholders with your own namespace and username. This bootstrap tag is only for creating the initial ECS service; later workflow deployments use the full Git SHA.

## 3. Create AWS networking and the pull secret

Complete these steps in the AWS Console using your own account. Select `<AWS_REGION>` at the top-right and keep ECS, Secrets Manager, IAM, and CloudWatch in that region. Do not share or add AWS sign-in credentials to GitHub.

### VPC and security group

Use a VPC with **two public subnets in different Availability Zones**, an Internet Gateway, and a route from both subnets to that gateway (`0.0.0.0/0`). The default VPC often already has these. Do not create a NAT Gateway for this demo.

Create a security group named `lumenboard-task-sg` in that VPC:

- Inbound: Custom TCP, port `8080`, source `0.0.0.0/0` (public demo access).
- Outbound: allow all (needed for the task to reach Docker Hub, Secrets Manager, and CloudWatch).

This exposes the demo over plain HTTP, not HTTPS. Do not put private or sensitive data in the frontend. A real production deployment should put an HTTPS Application Load Balancer and domain in front and restrict network access appropriately.

### AWS Secrets Manager: Docker Hub pull credentials

1. In Secrets Manager, create a secret of type **Other type of secret**.
2. Add exactly these JSON key/value pairs (enter your actual values in the console):

   ```json
   {
     "username": "<DOCKERHUB_USERNAME>",
     "password": "<DOCKERHUB_READ_ONLY_ACCESS_TOKEN>"
   }
   ```

3. Name it `lumenboard/dockerhub-pull`. Use the default AWS-managed encryption key for this beginner setup.
4. Copy the full **Secret ARN**, including its generated suffix. It will become the GitHub repository variable `DOCKERHUB_SECRET_ARN`.

Keep the ECS pull token separate from the GitHub push token. The task definition references the secret ARN; the secret value itself never belongs in Git.

### CloudWatch log group

In CloudWatch Logs, create log group `/ecs/lumenboard`. Set a short retention such as 7 days to avoid retaining demo logs indefinitely. The task definition sends container logs here.

## 4. Create IAM roles

### ECS task execution role

In IAM → Roles → Create role, choose AWS service → Elastic Container Service → Elastic Container Service Task. Name it `ecsTaskExecutionRoleLumenboard`.

Attach the AWS managed policy `AmazonECSTaskExecutionRolePolicy` (ECR authentication/image-pull defaults and CloudWatch Logs permissions). Add this inline policy, replacing the account ID, region, and secret ARN with your own values:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadDockerHubPullSecret",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "<DOCKERHUB_SECRET_ARN>"
    }
  ]
}
```

ECS uses the **execution role** before the container starts to fetch the private image and write logs. The application does not receive this role's permissions. If you encrypt the secret with a customer-managed KMS key instead of the default key, also grant `kms:Decrypt` on that exact key and allow the role in the key policy.

### GitHub Actions OIDC provider and deploy role

OIDC lets GitHub exchange a short-lived identity token for AWS credentials. No long-lived AWS access key is stored in GitHub.

1. In IAM → Identity providers, add provider URL `https://token.actions.githubusercontent.com`, provider type OpenID Connect, audience `sts.amazonaws.com`. If the provider already exists in this account, reuse it.
2. Create role `GitHubActionsLumenboardDeploy`, with this trust relationship. Replace `<GITHUB_OWNER>` and `<GITHUB_REPOSITORY>` exactly (case-sensitive):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Federated": "arn:aws:iam::<12_DIGIT_AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
         },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": {
             "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
             "token.actions.githubusercontent.com:sub": "repo:<GITHUB_OWNER>/<GITHUB_REPOSITORY>:ref:refs/heads/main"
           }
         }
       }
     ]
   }
   ```

3. Attach this permissions policy to the role. Replace all placeholders. It allows registration, but limits service updates and role passing to this project:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "RegisterTaskDefinition",
         "Effect": "Allow",
         "Action": [
           "ecs:RegisterTaskDefinition",
           "ecs:DescribeTaskDefinition"
         ],
         "Resource": "*"
       },
       {
         "Sid": "UpdateOnlyLumenboardService",
         "Effect": "Allow",
         "Action": [
           "ecs:DescribeServices",
           "ecs:UpdateService"
         ],
         "Resource": "arn:aws:ecs:<AWS_REGION>:<12_DIGIT_AWS_ACCOUNT_ID>:service/lumenboard-cluster/lumenboard-service"
       },
       {
         "Sid": "PassOnlyTaskExecutionRole",
         "Effect": "Allow",
         "Action": "iam:PassRole",
         "Resource": "arn:aws:iam::<12_DIGIT_AWS_ACCOUNT_ID>:role/ecsTaskExecutionRoleLumenboard",
         "Condition": {
           "StringEquals": {
             "iam:PassedToService": "ecs-tasks.amazonaws.com"
           }
         }
       }
     ]
   }
   ```

   AWS may require `ecs:RegisterTaskDefinition` on `"Resource": "*"` because the new revision does not exist when the authorization check occurs. The GitHub role does not get permission to create IAM roles, read the Docker Hub secret, or update arbitrary ECS services.
4. Copy the role ARN. It is the GitHub Actions secret `AWS_ROLE_ARN`.

Protect the `main` branch in GitHub (require review/checks if appropriate) because only pushes to that branch are trusted by the AWS OIDC role.

## 5. Create the ECS cluster, initial task, and service

### Cluster

In ECS → Clusters, create `lumenboard-cluster` using the standard networking/cluster option. Fargate is serverless; do not provision EC2 container instances.

### Initial task definition

In ECS → Task definitions → Create new task definition:

- Family: `lumenboard`
- Launch type/infrastructure: AWS Fargate
- Operating system/architecture: Linux/X86_64
- Network mode: `awsvpc`
- Task size: `0.25 vCPU` and `0.5 GB` memory (`256` CPU / `512` MiB)
- Task execution role: `ecsTaskExecutionRoleLumenboard`
- Task role: none (this frontend calls no AWS APIs)
- Container name: `lumenboard`
- Image URI: `<DOCKERHUB_NAMESPACE>/lumenboard:bootstrap`
- Port mapping: container port `8080`, TCP
- Private registry authentication: choose the Secrets Manager secret `lumenboard/dockerhub-pull`
- Logging: `awslogs`, log group `/ecs/lumenboard`, region `<AWS_REGION>`, stream prefix `app`
- Container health check command: `CMD-SHELL`, `wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1`; interval 30 sec, timeout 5 sec, retries 3, start period 10 sec.

Create/register the task definition. This first revision uses the manually pushed `bootstrap` image. Future revisions are generated from the checked-in `task-definition.json` by GitHub Actions; the workflow fills in the role, secret ARN, region, and exact SHA-tagged image.

### Service

In the cluster, create an ECS service:

- Compute option: Fargate
- Family/revision: `lumenboard` and the initial task definition revision
- Service name: `lumenboard-service`
- Desired tasks: `1`
- Deployment configuration: rolling update; enable the deployment circuit breaker and automatic rollback if available
- Networking: your VPC, both public subnets, security group `lumenboard-task-sg`, **Auto-assign public IP: Enabled**
- Load balancer: none for this portfolio demo

Create it and wait until the task is `RUNNING` and the service is stable. One task in two possible AZs is not high availability; setting desired count to 2 improves resilience but approximately doubles task compute cost.

## 6. Configure GitHub secrets and variables

In your GitHub repository, open Settings → Secrets and variables → Actions. Add repository **secrets**:

| Secret | Value |
|---|---|
| `AWS_ROLE_ARN` | `arn:aws:iam::<12_DIGIT_AWS_ACCOUNT_ID>:role/GitHubActionsLumenboardDeploy` |
| `DOCKERHUB_USERNAME` | Your Docker Hub username/namespace |
| `DOCKERHUB_TOKEN` | The Docker Hub CI push access token (not the ECS read-only token) |

Add repository **variables**:

| Variable | Value |
|---|---|
| `AWS_REGION` | Your chosen region, e.g. `us-east-1` |
| `ECS_CLUSTER` | `lumenboard-cluster` |
| `ECS_SERVICE` | `lumenboard-service` |
| `ECS_TASK_FAMILY` | `lumenboard` |
| `CONTAINER_NAME` | `lumenboard` |
| `ECS_TASK_EXECUTION_ROLE_ARN` | Full ARN for `ecsTaskExecutionRoleLumenboard` |
| `DOCKERHUB_NAMESPACE` | Your Docker Hub namespace (without `/lumenboard`) |
| `DOCKERHUB_SECRET_ARN` | Full ARN of `lumenboard/dockerhub-pull` |

Names and ARNs aren't passwords, but keep the AWS policy scoped to your exact resources. Never add an AWS access key secret; this workflow uses OIDC.

## 7. Commit, push, and observe a deployment

### In VS Code

1. Open Source Control, review the changed files, and ensure `.env`, credentials, and local generated files are not staged. Do not commit any token.
2. Enter a message such as `Build LumenBoard ECS delivery pipeline`, select **Commit**, then **Sync Changes** / **Push** to `main`.

Equivalent PowerShell commands from the project folder:

```powershell
git status
git add .gitignore .dockerignore Dockerfile eslint.config.js index.html nginx.conf package.json package-lock.json src tests vite.config.js task-definition.json .github implementation.md
git commit -m "Build LumenBoard ECS delivery pipeline"
git push origin main
```

Before committing, make sure this folder is the **root of the new GitHub repository**: `git rev-parse --show-toplevel` should print this project folder. If it prints a parent folder (for example, because this workspace is nested inside another repository), do not push to that parent repository. Create an empty GitHub repository, clone it into a separate folder, copy these project files there (not `node_modules`, `dist`, or `.git`), open that clone in VS Code, and commit from there. Git identity and authentication are configured locally in VS Code/Git; never paste credentials into this guide or source files.

### GitHub Actions

Open the repository's **Actions** tab, select the `CI/CD` run for your commit, and inspect both jobs:

1. `quality` must pass dependency installation, ESLint, unit tests, and Vite production build.
2. Only then can `deploy` run. It logs into Docker Hub, builds/pushes `<DOCKERHUB_NAMESPACE>/lumenboard:<full-commit-sha>`, assumes the AWS role using OIDC, registers the new task revision, updates the service, and waits for service stability.
3. In Docker Hub → `lumenboard` → Tags, confirm a tag matching the full commit SHA. `latest` is also pushed for convenience, but ECS deploys the immutable SHA tag, not `latest`.

### Confirm the exact version is live

In ECS → cluster `lumenboard-cluster` → service `lumenboard-service` → Tasks:

1. Confirm a task is `RUNNING` on the newest task-definition revision.
2. Open the task's Networking section and copy its public IP.
3. Open `http://<PUBLIC_TASK_IP>:8080` in a browser. The footer's **Build** value must equal the commit SHA shown in the Actions run. The task definition's container image must also end in that SHA.
4. `http://<PUBLIC_TASK_IP>:8080/health` should return `ok`.

The task's public IP can change on replacement. For a stable production URL and HTTPS, add an Application Load Balancer and domain; those are outside this first version.

## 8. What may cost money

Check current AWS/Docker Hub pricing for your region and account; prices and free tiers change.

- **Fargate task:** CPU and memory are billed while the task runs. Desired count 1 is the smallest continuously available service; stopping/deleting the service stops task compute charges.
- **Public IPv4 address:** AWS charges for public IPv4 usage, including addresses attached to running tasks.
- **CloudWatch Logs:** ingestion and retained storage may be charged. Keep a short retention period.
- **Secrets Manager:** each stored secret has an ongoing monthly charge and API calls may be charged.
- **Data transfer:** internet egress can incur charges.
- **Docker Hub:** private repository limits/features depend on your plan.
- **ECS cluster/service:** ECS control-plane usage itself generally has no charge for Fargate, but the resources above do.
- **NAT Gateway:** deliberately not used; it has hourly and data processing costs. The demo task instead has a public IP in a public subnet.

To stop ongoing AWS costs, first set the ECS service desired count to 0 or delete the service, then deregister/delete the cluster resources you no longer need. Delete the Secrets Manager secret and CloudWatch log group if finished. Removing a cluster alone does not necessarily remove all associated resources. Check the billing console after cleanup.

## 9. Troubleshooting

| Symptom | What to check |
|---|---|
| `npm ci` fails | Ensure `package-lock.json` is committed and was generated by `npm install`; use Node 24. |
| Lint/test/build fails | Open the failing step in the `quality` job. `deploy` is gated by `needs: quality`, so it will not deploy after a failed check. |
| Docker Hub login/push returns `unauthorized` | Confirm repository is private but exists; `DOCKERHUB_USERNAME` is the account namespace; `DOCKERHUB_TOKEN` is a valid token with push permission. Recreate/update the GitHub secret if rotated. |
| ECS says `CannotPullContainerError` / image pull denied | Check task definition image namespace and SHA tag in Docker Hub; check secret JSON key names are exactly `username` and `password`; check it contains a valid Docker Hub **read-only** token; check the execution role has `secretsmanager:GetSecretValue`; ensure the task and secret are in the same AWS Region. |
| ECS cannot reach Docker Hub or Secrets Manager | Verify task is in a public subnet with a default route to an Internet Gateway, has **Auto-assign public IP** enabled, and security group outbound permits traffic. No NAT Gateway is needed with this topology. |
| `AccessDenied` reading secret | Add the exact secret ARN to the task execution role's policy. For a customer KMS key, grant `kms:Decrypt` and update its key policy. Do not grant the GitHub deploy role access to the secret. |
| ECS task is unhealthy | In ECS task details, inspect stopped reason and container health; in CloudWatch `/ecs/lumenboard`, inspect logs. Confirm port 8080 in the task definition and security group, health check path `/health`, and Fargate platform Linux. |
| Browser times out | Confirm the service task is `RUNNING`, use its current **public** IP, include `:8080`, and allow inbound TCP 8080 to the task security group. |
| OIDC `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Check role ARN secret, `token.actions.githubusercontent.com` provider and `sts.amazonaws.com` audience, exact owner/repository/branch in the trust policy, and that the run is a push to `main`. |
| Register task definition denied | Verify the GitHub role has `ecs:RegisterTaskDefinition` and `iam:PassRole` for the execution role. Ensure the role ARN variable is the correct role in the same account. |
| Update service denied / service not found | Verify region, cluster, service, and task family variables exactly match the created resources and that the GitHub IAM policy service ARN includes the correct cluster and service names. |
| Deployment step times out or rolls back | Open ECS service → Events and the task's stopped reason. Check that the image was pushed before AWS deployment, that the execution role can pull it, and that health check/network settings are correct. |
| Workflow reports missing/empty variables | Confirm all names in the GitHub Actions secrets/variables tables are repository-level entries and spelled exactly. |

## 10. Ready-to-deploy checklist

- [ ] `npm install`, `npm run lint`, `npm test`, `npm run build` pass.
- [ ] Local Docker image serves the app at `localhost:8080`, and `/health` returns `ok`.
- [ ] Docker Hub `lumenboard` repository is private; bootstrap image exists.
- [ ] Separate Docker Hub write token (GitHub) and read token (ECS) were created.
- [ ] AWS VPC has two public subnets with Internet Gateway routes; no NAT Gateway was created.
- [ ] Task security group allows inbound TCP 8080 and outbound internet traffic.
- [ ] Secrets Manager JSON contains `username` and `password`; its ARN is copied.
- [ ] Task execution role has `AmazonECSTaskExecutionRolePolicy` and scoped `GetSecretValue`.
- [ ] CloudWatch log group `/ecs/lumenboard` exists with retention configured.
- [ ] GitHub OIDC provider and branch-scoped deploy role are configured; no AWS access key is stored in GitHub.
- [ ] ECS cluster, initial task definition, and service are running with a public IP.
- [ ] All three GitHub secrets and all eight repository variables are set.
- [ ] Changes are pushed to `main`; `quality` and `deploy` pass in Actions.
- [ ] ECS task image URI ends with the commit SHA, and the website footer shows the same SHA.
- [ ] Billing resources are understood, and cleanup steps are known.
