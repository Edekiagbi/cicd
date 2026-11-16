import test from 'node:test';
import assert from 'node:assert/strict';
import { completionPercentage, filterTasks } from '../src/metrics.js';

const tasks = [
  { name: 'Website refresh', owner: 'Olivia', status: 'In progress' },
  { name: 'Research', owner: 'Lana', status: 'Complete' },
];

test('completionPercentage returns the completed share rounded to a whole percent', () => {
  assert.equal(completionPercentage(tasks), 50);
});

test('completionPercentage safely handles an empty task list', () => {
  assert.equal(completionPercentage([]), 0);
});

test('filterTasks searches names, owners, and status without case sensitivity', () => {
  assert.deepEqual(filterTasks(tasks, ' OLIVIA '), [tasks[0]]);
  assert.deepEqual(filterTasks(tasks, 'complete'), [tasks[1]]);
});

test('filterTasks returns all tasks for a blank query', () => {
  assert.equal(filterTasks(tasks, '  '), tasks);
});
