import assert from 'node:assert/strict';
import test from 'node:test';
import { DAG } from '../src/pipeline/dag.js';
import { Scheduler } from '../src/pipeline/scheduler.js';
import { StateManager, TaskState } from '../src/pipeline/state-manager.js';
import { Task } from '../src/pipeline/task.js';

const task = (name: string, dependencies: readonly string[] = []) =>
  new Task({ name, dependencies, run: () => name });

function setup(tasks: readonly Task[]) {
  const dag = new DAG(tasks);
  dag.validate();
  const state = new StateManager();
  state.initialize(dag);
  return { state, scheduler: new Scheduler(dag, state) };
}

test('scheduler returns pending roots regardless of registration order', () => {
  const dependent = task('dependent', ['root']);
  const root = task('root');
  const independent = task('independent');
  const { state, scheduler } = setup([dependent, root, independent]);

  assert.deepEqual(scheduler.getReadyTasks(), [root, independent]);
  assert.deepEqual(scheduler.getReadyTasks(), [root, independent]);
  assert.equal(state.getState('root'), TaskState.PENDING);
});

test('scheduler waits until every dependency succeeds and observes state changes', () => {
  const join = task('join', ['left', 'right']);
  const { state, scheduler } = setup([join, task('left'), task('right')]);
  state.markSuccess('left', 'left result');
  state.markRunning('right');
  assert.deepEqual(scheduler.getReadyTasks(), []);

  state.markSuccess('right', 'right result');
  assert.deepEqual(scheduler.getReadyTasks(), [join]);
});

test('scheduler never returns running or completed tasks', () => {
  const pending = task('pending');
  const { state, scheduler } = setup([
    task('running'), task('success'), task('failed'), task('blocked'), pending,
  ]);
  state.markRunning('running');
  state.markSuccess('success', undefined);
  state.markFailed('failed', new Error('failed'));
  state.markBlocked('blocked');

  assert.deepEqual(scheduler.getReadyTasks(), [pending]);
});

test('scheduler blocks transitive dependents without blocking independent work', () => {
  const independent = task('independent');
  const { state, scheduler } = setup([
    task('grandchild', ['child']), task('child', ['failed']), task('failed'), independent,
  ]);
  state.markFailed('failed', new Error('failed'));

  assert.deepEqual(scheduler.getReadyTasks(), [independent]);
  assert.equal(state.getState('child'), TaskState.BLOCKED);
  assert.equal(state.getState('grandchild'), TaskState.BLOCKED);
});

test('schedulers for the same DAG use independent per-run states', () => {
  const root = task('root');
  const child = task('child', ['root']);
  const dag = new DAG([root, child]);
  const first = new StateManager();
  const second = new StateManager();
  first.initialize(dag);
  second.initialize(dag);
  const firstScheduler = new Scheduler(dag, first);
  const secondScheduler = new Scheduler(dag, second);
  first.markSuccess('root', 'first result');

  assert.deepEqual(firstScheduler.getReadyTasks(), [child]);
  assert.deepEqual(secondScheduler.getReadyTasks(), [root]);
});

test('scheduler returns no tasks for an empty DAG', () => {
  const { scheduler } = setup([]);
  assert.deepEqual(scheduler.getReadyTasks(), []);
});
