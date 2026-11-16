export function completionPercentage(tasks) {
  if (tasks.length === 0) return 0;

  const completed = tasks.filter((task) => task.status === 'Complete').length;
  return Math.round((completed / tasks.length) * 100);
}

export function filterTasks(tasks, searchText) {
  const query = searchText.trim().toLowerCase();
  if (!query) return tasks;

  return tasks.filter((task) =>
    `${task.name} ${task.owner} ${task.status}`.toLowerCase().includes(query),
  );
}
