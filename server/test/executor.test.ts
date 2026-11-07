import assert from 'node:assert/strict';
import test from 'node:test';
import { DAG } from '../src/pipeline/dag.js';
import { ExecutionContext } from '../src/pipeline/execution-context.js';
import { Executor } from '../src/pipeline/executor.js';
import { StateManager, TaskState } from '../src/pipeline/state-manager.js';
import { Task } from '../src/pipeline/task.js';

for (const fails of [false, true]) {
  test(`executor tracks PENDING and RUNNING before ${fails ? 'FAILED' : 'SUCCESS'}`, { timeout: 5_000 }, async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const failure = new Error('task failed');
    const task = new Task({
      name: 'work',
      run: async () => {
        await gate;
        if (fails) throw failure;
        return 'output';
      },
    });
    const state = new StateManager();
    state.initialize(new DAG([task]));
    const context = new ExecutionContext(null, state);
    assert.strictEqual(context.state, state);
    assert.equal(state.getState('work'), TaskState.PENDING);

    const execution = new Executor().execute(task, context, state);
    assert.equal(state.getState('work'), TaskState.RUNNING);
    assert.deepEqual(context.results, {});
    release();
    if (fails) {
      await assert.rejects(execution, (error: unknown) => {
        assert.strictEqual(error, failure);
        assert.equal(state.getState('work'), TaskState.FAILED);
        assert.strictEqual(state.getErrors().work, failure);
        return true;
      });
    } else {
      await execution;
    }

    assert.equal(state.getState('work'), fails ? TaskState.FAILED : TaskState.SUCCESS);
    assert.deepEqual(context.results, fails ? {} : { work: 'output' });
    assert.deepEqual(state.getErrors(), fails ? { work: failure } : {});
    assert.equal(state.getResult('work'), fails ? undefined : 'output');
    assert.equal(state.isSuccess('work'), !fails);
  });
}

test('executor records and rethrows synchronous handler errors', async () => {
  const failure = new Error('synchronous failure');
  const task = new Task({ name: 'work', run: () => { throw failure; } });
  const state = new StateManager();
  state.initialize(new DAG([task]));
  const context = new ExecutionContext(null, state);

  await assert.rejects(new Executor().execute(task, context, state), (error: unknown) => {
    assert.strictEqual(error, failure);
    assert.equal(state.getState('work'), TaskState.FAILED);
    assert.strictEqual(state.getErrors().work, failure);
    return true;
  });
  assert.deepEqual(context.results, {});
  assert.equal(state.getResult('work'), undefined);
});
