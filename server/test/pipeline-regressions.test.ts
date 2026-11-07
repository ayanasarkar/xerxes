import assert from 'node:assert/strict';
import test from 'node:test';
import { DAG } from '../src/pipeline/dag.js';
import type { ExecutionContext } from '../src/pipeline/execution-context.js';
import { PipelineRunner } from '../src/pipeline/pipeline-runner.js';
import { Task } from '../src/pipeline/task.js';

const options = { timeout: 5_000 };

for (const firstError of [new Error('first failure'), undefined]) {
  test(`numeric task names preserve the first recorded ${firstError === undefined ? 'undefined rejection' : 'error'}`, options, async () => {
    const laterError = new Error('later failure');
    let context!: ExecutionContext;
    const runner = new PipelineRunner(new DAG([
      new Task({ name: '3', dependencies: ['wait'], run: () => { throw laterError; } }),
      new Task({
        name: '20',
        run: (current) => { context = current; throw firstError; },
      }),
      new Task({
        name: 'wait',
        run: async () => {
          await new Promise<void>((resolve) => setImmediate(resolve));
          return 'done';
        },
      }),
    ]));

    await assert.rejects(runner.run(null), (error: unknown) => {
      assert.strictEqual(error, firstError);
      return true;
    });
    assert.equal(context.state.allTasksFinished(), true);
    assert.strictEqual(context.state.getErrors()['20'], firstError);
    assert.strictEqual(context.state.getErrors()['3'], laterError);
  });
}

for (const output of [{ marker: 'output' }, 'text', undefined]) {
  test(`prototype-like task names store own output properties for ${typeof output} values`, options, async () => {
    const names = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];
    const runner = new PipelineRunner(new DAG([
      ...names.map((name) => new Task({ name, run: () => output })),
      new Task({
        name: 'consumer',
        dependencies: names,
        run: (context) => {
          assert.strictEqual(Object.getPrototypeOf(context.results), Object.prototype);
          for (const name of names) {
            assert.equal(Object.hasOwn(context.results, name), true, `missing own output for ${name}`);
            assert.strictEqual(context.results[name], output);
            assert.strictEqual(context.state.getResult(name), output);
          }
          return 'read all outputs';
        },
      }),
    ]));

    const result = await runner.run(null);
    assert.equal(result.consumer, 'read all outputs');
    assert.deepEqual(Object.keys(result).sort(), [...names, 'consumer'].sort());
    assert.strictEqual(Object.getPrototypeOf(result), Object.prototype);
    if (output !== undefined) {
      const serialized = JSON.parse(JSON.stringify(result));
      for (const name of names) {
        assert.equal(Object.hasOwn(serialized, name), true);
        assert.deepEqual(serialized[name], output);
      }
    }
  });
}
