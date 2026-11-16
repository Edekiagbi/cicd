import { useEffect, useMemo, useRef, useState } from 'react';
import { completionPercentage, filterTasks } from './metrics.js';

const initialTasks = [
  { id: 1, name: 'Website refresh', owner: 'Olivia Rhye', initials: 'OR', color: 'violet', status: 'In progress', due: 'Today', progress: 72 },
  { id: 2, name: 'Q4 launch plan', owner: 'Phoenix Baker', initials: 'PB', color: 'blue', status: 'In review', due: 'Oct 24', progress: 88 },
  { id: 3, name: 'Customer research', owner: 'Lana Steiner', initials: 'LS', color: 'amber', status: 'Complete', due: 'Oct 21', progress: 100 },
  { id: 4, name: 'Design system v2', owner: 'Demi Wilkinson', initials: 'DW', color: 'rose', status: 'In progress', due: 'Oct 28', progress: 46 },
];

const navigation = [
  { label: 'Overview', icon: '◫', path: '/overview' },
  { label: 'Projects', icon: '▦', path: '/projects' },
  { label: 'Inbox', icon: '✉', path: '/inbox', count: '3' },
  { label: 'Reports', icon: '▥', path: '/reports' },
];

const activities = [
  { initials: 'PB', color: 'a-blue', person: 'Phoenix Baker', action: 'completed a task in', project: 'Q4 launch plan', time: '10 minutes ago' },
  { initials: 'OR', color: 'a-violet', person: 'Olivia Rhye', action: 'added a new comment on', project: 'Website refresh', time: '1 hour ago', comment: '“The new direction is looking great!”' },
  { initials: 'DW', color: 'a-rose', person: 'Demi Wilkinson', action: 'uploaded 3 files to', project: 'Design system v2', time: '3 hours ago', file: 'brand-assets.zip' },
];

function routeFromHash() {
  const path = window.location.hash.replace(/^#/, '') || '/overview';
  return path.startsWith('/') ? path : `/${path}`;
}

function routeForProject(name) {
  return `/project/${encodeURIComponent(name.toLowerCase().replaceAll(' ', '-'))}`;
}

function Link({ to, className = '', children, ...props }) {
  return <a className={className} href={`#${to}`} {...props}>{children}</a>;
}

function Icon({ children, className = '' }) {
  return <span aria-hidden="true" className={`icon ${className}`}>{children}</span>;
}

function ProjectTable({ tasks, search, onSearch }) {
  return (
    <article className="panel projects-panel">
      <div className="panel-heading">
        <div><h2>Recent projects</h2><p>A snapshot of what your team is working on.</p></div>
        <Link className="text-button" to="/projects">View all <span>→</span></Link>
      </div>
      <label className="project-filter">
        <Icon>⌕</Icon>
        <input aria-label="Filter projects" placeholder="Filter projects by name, owner, or status" value={search} onChange={(event) => onSearch(event.target.value)} />
      </label>
      <div className="table-wrap">
        <table>
          <thead><tr><th>PROJECT NAME</th><th>STATUS</th><th>PROGRESS</th><th>DUE DATE</th><th>ACTIONS</th></tr></thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>
                  <Link className="project-cell project-cell-link" to={routeForProject(task.name)}>
                    <span className={`project-symbol ${task.color}`}>{task.name.slice(0, 1)}</span>
                    <span><strong>{task.name}</strong><small>{task.owner}</small></span>
                  </Link>
                </td>
                <td><span className={`status-pill ${task.status.toLowerCase().replaceAll(' ', '-')}`}><i />{task.status}</span></td>
                <td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${task.progress}%` }} /></div><small>{task.progress}%</small></div></td>
                <td className="due-date">{task.due}</td>
                <td><Link className="row-menu" to={routeForProject(task.name)} aria-label={`Open ${task.name}`}>Open →</Link></td>
              </tr>
            ))}
            {tasks.length === 0 && <tr><td className="empty-state" colSpan="5">No projects match “{search}”. Try another search.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="table-footer"><span>Showing <strong>{tasks.length}</strong> project{tasks.length === 1 ? '' : 's'}</span><Link className="text-button" to="/projects">Open projects <span>→</span></Link></div>
    </article>
  );
}

function ActivityList() {
  return (
    <div className="activity-list">
      {activities.map((activity) => (
        <div className="activity-item" key={activity.person}>
          <span className={`activity-avatar ${activity.color}`}>{activity.initials}</span>
          <div>
            <p><strong>{activity.person}</strong> {activity.action} <Link to={routeForProject(activity.project)}>{activity.project}</Link></p>
            <small>{activity.time}</small>
            {activity.comment && <blockquote>{activity.comment}</blockquote>}
            {activity.file && <Link className="file-chip" to={routeForProject(activity.project)}><span>▧</span>{activity.file}<span>2.4 MB</span></Link>}
          </div>
        </div>
      ))}
    </div>
  );
}

function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [search, setSearch] = useState('');
  const [tasks, setTasks] = useState(initialTasks);
  const [projectName, setProjectName] = useState('');
  const [profileName, setProfileName] = useState('Jamie Davis');
  const [email, setEmail] = useState('jamie@studionorth.co');
  const [saved, setSaved] = useState(false);
  const searchRef = useRef(null);
  const filteredTasks = useMemo(() => filterTasks(tasks, search), [tasks, search]);
  const completion = completionPercentage(tasks);
  const version = import.meta.env.VITE_APP_VERSION || 'local';
  const routeParts = route.split('/').filter(Boolean);
  const projectSlug = routeParts[0] === 'project' ? decodeURIComponent(routeParts.slice(1).join('/')) : '';
  const selectedProject = tasks.find((task) => task.name.toLowerCase().replaceAll(' ', '-') === projectSlug);

  useEffect(() => {
    const handleHashChange = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    function handleShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    setSaved(false);
  }, [route]);

  const activePage = route === '/overview' ? 'Overview'
    : route === '/new-project' ? 'New project'
      : selectedProject?.name || routeParts.map((part) => part.replaceAll('-', ' ')).join(' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Overview';

  function createProject(event) {
    event.preventDefault();
    const name = projectName.trim();
    if (!name) return;
    const task = {
      id: Date.now(),
      name,
      owner: profileName,
      initials: profileName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      color: 'violet',
      status: 'In progress',
      due: 'No due date',
      progress: 0,
    };
    setTasks((currentTasks) => [task, ...currentTasks]);
    setProjectName('');
    window.location.hash = routeForProject(name);
  }

  function saveSettings(event) {
    event.preventDefault();
    setSaved(true);
  }

  function renderOverview() {
    return (
      <>
        <section className="welcome-row">
          <div>
            <div className="eyebrow"><span className="sun-icon">✳</span> {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</div>
            <h1>Good morning, {profileName.split(' ')[0]} <span>✦</span></h1>
            <p className="welcome-subtitle">Here&apos;s what&apos;s happening with your workspace today.</p>
          </div>
          <Link className="primary-button" to="/new-project"><span>＋</span> New project</Link>
        </section>

        <section className="stats-grid" aria-label="Workspace metrics">
          <Link className="stat-card stat-card-link" to="/projects">
            <div className="stat-heading"><span>Active projects</span><span className="stat-icon purple-bg">▦</span></div>
            <div className="stat-value">{String(tasks.filter((task) => task.status !== 'Complete').length).padStart(2, '0')} <span className="stat-change positive">↗ 12.5%</span></div>
            <div className="stat-foot">View all workspace projects</div>
            <div className="sparkline purple-line"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          </Link>
          <Link className="stat-card stat-card-link" to="/reports">
            <div className="stat-heading"><span>Tasks completed</span><span className="stat-icon green-bg">✓</span></div>
            <div className="stat-value">24 <span className="stat-change positive">↗ 8.2%</span></div>
            <div className="stat-foot">Open workspace reports</div>
            <div className="sparkline green-line"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          </Link>
          <Link className="stat-card stat-card-link" to="/workspace">
            <div className="stat-heading"><span>Team members</span><span className="stat-icon blue-bg">♙</span></div>
            <div className="stat-value">05 <span className="stat-change neutral">— 0%</span></div>
            <div className="stat-foot">Open workspace settings</div>
            <div className="avatar-stack"><span className="mini-avatar a-violet">OR</span><span className="mini-avatar a-blue">PB</span><span className="mini-avatar a-amber">LS</span><span className="mini-avatar a-rose">DW</span><span className="mini-avatar a-more">+1</span></div>
          </Link>
          <Link className="stat-card stat-card-link" to="/reports">
            <div className="stat-heading"><span>Projects complete</span><span className="stat-icon amber-bg">◷</span></div>
            <div className="stat-value">{completion}% <span className="stat-change positive">↗ 4.3%</span></div>
            <div className="stat-foot">Across all your projects</div>
            <div className="delivery-meter"><span style={{ width: `${completion}%` }} /></div>
          </Link>
        </section>

        <section className="content-grid">
          <ProjectTable tasks={filteredTasks.slice(0, 4)} search={search} onSearch={setSearch} />
          <aside className="right-column">
            <article className="panel activity-panel">
              <div className="panel-heading compact-heading"><div><h2>Activity</h2><p>What&apos;s happening around you.</p></div><Link className="icon-button small-menu" to="/activity" aria-label="Open all activity">···</Link></div>
              <ActivityList />
              <Link className="activity-link" to="/activity">View all activity <span>→</span></Link>
            </article>
            <article className="upgrade-card">
              <div className="upgrade-spark">✦</div><h3>Make room for<br />bigger ideas.</h3><p>Unlock unlimited projects, advanced reports, and more.</p><Link className="upgrade-link" to="/billing">Explore plans <span>→</span></Link>
              <div className="upgrade-orb orb-one" /><div className="upgrade-orb orb-two" />
            </article>
          </aside>
        </section>
      </>
    );
  }

  function renderPage() {
    if (route === '/overview' || route === '/') return renderOverview();

    if (route === '/projects') {
      return (
        <section className="route-page">
          <div className="route-heading"><div><div className="eyebrow">WORKSPACE</div><h1>All projects</h1><p>Browse, search, and open your team&apos;s projects.</p></div><Link className="primary-button" to="/new-project"><span>＋</span> New project</Link></div>
          <ProjectTable tasks={filteredTasks} search={search} onSearch={setSearch} />
        </section>
      );
    }

    if (route === '/new-project') {
      return (
        <section className="route-page narrow-page">
          <div className="route-heading"><div><div className="eyebrow">PROJECTS</div><h1>Create a project</h1><p>Start a new project in your Studio North workspace.</p></div></div>
          <form className="panel form-panel" onSubmit={createProject}>
            <label htmlFor="project-name">Project name</label>
            <input id="project-name" autoFocus maxLength="60" placeholder="e.g. Mobile app launch" required value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            <p className="form-help">This sample project is stored in this browser session only. No backend is connected.</p>
            <div className="form-actions"><Link className="secondary-button" to="/projects">Cancel</Link><button className="primary-button" type="submit">Create project</button></div>
          </form>
        </section>
      );
    }

    if (route === '/inbox') {
      return (
        <section className="route-page">
          <div className="route-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Inbox</h1><p>Recent updates from your team.</p></div><span className="count-badge">3 updates</span></div>
          <article className="panel route-panel"><ActivityList /></article>
        </section>
      );
    }

    if (route === '/activity' || route === '/notifications') {
      const isNotifications = route === '/notifications';
      return (
        <section className="route-page">
          <div className="route-heading"><div><div className="eyebrow">WORKSPACE</div><h1>{isNotifications ? 'Notifications' : 'Activity'}</h1><p>{isNotifications ? 'Your latest workspace notifications.' : 'A complete feed of recent team activity.'}</p></div></div>
          <article className="panel route-panel"><ActivityList /></article>
        </section>
      );
    }

    if (route === '/reports') {
      return (
        <section className="route-page">
          <div className="route-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Reports</h1><p>A quick summary of the sample workspace project data.</p></div></div>
          <div className="stats-grid report-stats">
            <article className="stat-card"><div className="stat-heading"><span>Total projects</span></div><div className="stat-value">{tasks.length}</div><div className="stat-foot">In this demo workspace</div></article>
            <article className="stat-card"><div className="stat-heading"><span>Completed</span></div><div className="stat-value">{tasks.filter((task) => task.status === 'Complete').length}</div><div className="stat-foot">Marked complete</div></article>
            <article className="stat-card"><div className="stat-heading"><span>Overall completion</span></div><div className="stat-value">{completion}%</div><div className="stat-foot">Calculated from project statuses</div></article>
          </div>
          <ProjectTable tasks={filteredTasks} search={search} onSearch={setSearch} />
        </section>
      );
    }

    if (route === '/workspace' || route === '/settings') {
      const isWorkspace = route === '/workspace';
      return (
        <section className="route-page narrow-page">
          <div className="route-heading"><div><div className="eyebrow">{isWorkspace ? 'WORKSPACE' : 'ACCOUNT'}</div><h1>{isWorkspace ? 'Workspace settings' : 'Profile settings'}</h1><p>{isWorkspace ? 'Manage your Studio North workspace details.' : 'Update the name and email shown in this demo.'}</p></div></div>
          <form className="panel form-panel" onSubmit={saveSettings}>
            <label htmlFor="profile-name">{isWorkspace ? 'Workspace name' : 'Your name'}</label>
            <input id="profile-name" value={isWorkspace ? 'Studio North' : profileName} readOnly={isWorkspace} onChange={(event) => setProfileName(event.target.value)} />
            <label htmlFor="profile-email">Email address</label>
            <input id="profile-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <p className="form-help">Settings are only held in the current page session. There is no account service connected.</p>
            {saved && <p className="success-message" role="status">Settings saved for this session.</p>}
            <div className="form-actions"><button className="primary-button" type="submit">Save changes</button></div>
          </form>
        </section>
      );
    }

    if (route === '/billing') {
      return (
        <section className="route-page">
          <div className="route-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Plans and billing</h1><p>Plan details for the sample Studio North workspace.</p></div></div>
          <article className="panel plan-detail">
            <span className="stat-icon purple-bg">✦</span><h2>Free plan</h2><p>2 of 5 example seats used</p><p>This portfolio frontend does not process payments or connect to a billing provider.</p><Link className="secondary-button" to="/workspace">Manage workspace</Link>
          </article>
        </section>
      );
    }

    if (route === '/help') {
      return (
        <section className="route-page narrow-page">
          <div className="route-heading"><div><div className="eyebrow">SUPPORT</div><h1>Help center</h1><p>Quick links for exploring this frontend demo.</p></div></div>
          <article className="panel help-links">
            <Link to="/projects">Browse projects <span>→</span></Link>
            <Link to="/reports">View workspace reports <span>→</span></Link>
            <Link to="/workspace">Workspace settings <span>→</span></Link>
            <p>This is a frontend-only portfolio sample. Help requests are not sent to a support team.</p>
          </article>
        </section>
      );
    }

    if (route.startsWith('/project/')) {
      return selectedProject ? (
        <section className="route-page">
          <div className="route-heading"><div><div className="eyebrow"><Link to="/projects">PROJECTS</Link> / DETAILS</div><h1>{selectedProject.name}</h1><p>Project workspace overview and sample progress.</p></div><Link className="secondary-button" to="/projects">← All projects</Link></div>
          <div className="project-detail-grid">
            <article className="panel detail-card"><span className="detail-label">STATUS</span><span className={`status-pill ${selectedProject.status.toLowerCase().replaceAll(' ', '-')}`}><i />{selectedProject.status}</span></article>
            <article className="panel detail-card"><span className="detail-label">OWNER</span><strong>{selectedProject.owner}</strong></article>
            <article className="panel detail-card"><span className="detail-label">DUE DATE</span><strong>{selectedProject.due}</strong></article>
            <article className="panel detail-card"><span className="detail-label">PROGRESS</span><strong>{selectedProject.progress}%</strong><div className="progress-track"><span style={{ width: `${selectedProject.progress}%` }} /></div></article>
          </div>
          <article className="panel detail-note"><h2>Project activity</h2><p>This detail page uses sample frontend data. Tasks, comments, and files are not connected to a backend.</p><Link to="/activity">Open workspace activity →</Link></article>
        </section>
      ) : (
        <section className="route-page"><div className="panel not-found"><h1>Project not found</h1><p>This project may not exist in this browser session.</p><Link className="primary-button" to="/projects">Back to projects</Link></div></section>
      );
    }

    return (
      <section className="route-page">
        <div className="panel not-found"><h1>Page not found</h1><p>The page you requested is not part of this demo.</p><Link className="primary-button" to="/overview">Go to overview</Link></div>
      </section>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/overview" aria-label="LumenBoard home">
          <span className="brand-mark"><span /></span>
          <span>Lumen<span className="brand-light">Board</span></span>
        </Link>

        <Link className="workspace-switcher" to="/workspace">
          <span className="workspace-avatar">S</span>
          <span className="workspace-copy"><strong>Studio North</strong><small>Free workspace</small></span>
          <Icon>⌄</Icon>
        </Link>

        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace navigation">
          {navigation.map((item) => (
            <Link className={`nav-item ${route === item.path ? 'active' : ''}`} key={item.label} to={item.path} aria-current={route === item.path ? 'page' : undefined}>
              <Icon>{item.icon}</Icon>
              <span>{item.label}</span>
              {item.count && <span className="nav-count">{item.count}</span>}
            </Link>
          ))}
        </nav>

        <div className="side-label projects-label"><span>YOUR PROJECTS</span><Link to="/new-project" aria-label="Add project">+</Link></div>
        {tasks.slice(0, 3).map((task) => <Link className="project-link" key={task.id} to={routeForProject(task.name)}><span className={`project-dot dot-${task.color}`} />{task.name}</Link>)}

        <div className="sidebar-bottom">
          <div className="plan-card">
            <Link className="plan-card-link" to="/billing"><span className="plan-top"><span>Free plan</span><span>2/5 seats</span></span>
              <span className="plan-meter"><span /></span>
              <span className="plan-description">Invite your team to get more done together.</span>
              <span className="plan-action">Explore plans <span>→</span></span>
            </Link>
          </div>
          <Link className="profile" to="/settings">
            <span className="profile-avatar">JD</span>
            <span className="profile-copy"><strong>{profileName}</strong><small>{email}</small></span>
            <Icon>···</Icon>
          </Link>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><Link to="/overview">Workspace</Link><Icon>›</Icon><strong>{activePage}</strong></div>
          <div className="topbar-actions">
            <label className="search-box">
              <Icon>⌕</Icon>
              <input ref={searchRef} aria-label="Search projects" placeholder="Search projects..." value={search} onChange={(event) => setSearch(event.target.value)} />
              <kbd>⌘ K</kbd>
            </label>
            <Link className="icon-button notification-button" to="/notifications" aria-label="Notifications">♧<span /></Link>
            <span className="topbar-divider" />
            <Link className="help-button" to="/help"><span>?</span> Help</Link>
          </div>
        </header>

        <div className="page-content">
          {renderPage()}
          <footer className="page-footer"><span>Made for teams that do great work.</span><span>Build <code>{version}</code> · <Link to="/help">Frontend demo</Link></span></footer>
        </div>
      </main>
    </div>
  );
}

export default App;
