import assert from 'node:assert/strict';
import test from 'node:test';
import { DAG } from '../src/pipeline/dag.js';
import { StateManager, TaskState } from '../src/pipeline/state-manager.js';
import { Task } from '../src/pipeline/task.js';

const task = (name: string) => new Task({ name, run: () => name });

function initialize(...names: string[]) {
  const state = new StateManager();
  state.initialize(new DAG(names.map(task)));
  return state;
}

test('allTasksFinished is false while any task is pending or running', () => {
  const state = initialize('first', 'second');
  assert.equal(state.allTasksFinished(), false);
  state.markRunning('first');
  assert.equal(state.allTasksFinished(), false);
  state.markSuccess('first', 'done');
  assert.equal(state.allTasksFinished(), false);
  state.markRunning('second');
  assert.equal(state.allTasksFinished(), false);
  state.markSuccess('second', undefined);
  assert.equal(state.allTasksFinished(), true);
});

test('allTasksFinished treats failures and blocked tasks as terminal', () => {
  const state = initialize('success', 'failed', 'blocked');
  state.markSuccess('success', 'done');
  state.markFailed('failed', new Error('failed'));
  assert.equal(state.allTasksFinished(), false);
  state.markBlocked('blocked');
  assert.equal(state.allTasksFinished(), true);
  state.initialize(new DAG());
  assert.equal(state.allTasksFinished(), true);
});

test('initialize sets every task to PENDING without results or errors', () => {
  const state = initialize('first', 'second');
  assert.deepEqual(state.getStates(), { first: TaskState.PENDING, second: TaskState.PENDING });
  assert.deepEqual(state.getErrors(), {});
  assert.equal(state.getResult('first'), undefined);
  assert.equal(state.isSuccess('first'), false);
});

test('markSuccess stores the returned value and marks a running task successful', () => {
  const state = initialize('work');
  const output = { value: 42 };
  state.markRunning('work');
  assert.equal(state.getState('work'), TaskState.RUNNING);
  assert.equal(state.isSuccess('work'), false);
  state.markSuccess('work', output);
  assert.equal(state.getState('work'), TaskState.SUCCESS);
  assert.equal(state.isSuccess('work'), true);
  assert.strictEqual(state.getResult('work'), output);
});

test('an undefined result is still a successful output', () => {
  const state = initialize('work');
  state.markRunning('work');
  state.markSuccess('work', undefined);
  assert.equal(state.isSuccess('work'), true);
  assert.equal(state.getResult('work'), undefined);
});

test('failed and blocked tasks are not successful and have no output', () => {
  const state = initialize('broken', 'dependent');
  const failure = new Error('failed');
  state.markRunning('broken');
  state.markFailed('broken', failure);
  state.markBlocked('dependent');
  assert.deepEqual(state.getStates(), { broken: TaskState.FAILED, dependent: TaskState.BLOCKED });
  assert.strictEqual(state.getErrors().broken, failure);
  for (const name of ['broken', 'dependent']) {
    assert.equal(state.isSuccess(name), false);
    assert.equal(state.getResult(name), undefined);
  }
});

test('initialize clears previous statuses, results, and errors', () => {
  const state = initialize('success', 'failed', 'removed');
  state.markSuccess('success', 'previous output');
  state.markFailed('failed', new Error('previous failure'));
  state.initialize(new DAG([task('success'), task('failed'), task('new')]));
  assert.deepEqual(state.getStates(), {
    success: TaskState.PENDING, failed: TaskState.PENDING, new: TaskState.PENDING,
  });
  assert.deepEqual(state.getErrors(), {});
  assert.equal(state.getResult('success'), undefined);
  assert.equal(state.isSuccess('success'), false);
  assert.throws(() => state.getState('removed'), /Unknown task/);
});

test('lookups and transitions reject unregistered task names', () => {
  const state = initialize();
  for (const operation of [
    () => state.getResult('missing'),
    () => state.isSuccess('missing'),
    () => state.markRunning('missing'),
    () => state.markSuccess('missing', 'output'),
    () => state.markFailed('missing', new Error('failure')),
    () => state.markBlocked('missing'),
  ]) {
    assert.throws(operation, /Unknown task: missing/);
  }
  assert.deepEqual(state.getStates(), {});
  assert.deepEqual(state.getErrors(), {});
});
