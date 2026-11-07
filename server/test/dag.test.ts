import assert from 'node:assert/strict';
import test from 'node:test';
import { DAG } from '../src/pipeline/dag.js';
import { PipelineRunner } from '../src/pipeline/pipeline-runner.js';
import { Task } from '../src/pipeline/task.js';

const options = { timeout: 5_000 };
const task = (name: string, dependencies: readonly string[] = []) =>
  new Task({ name, dependencies, run: () => name });

test('DAG accepts out-of-order registration and exposes its tasks by name', options, () => {
  const finish = task('finish', ['start']);
  const start = task('start');
  const tasks: readonly Task[] = [finish, start];
  const dag = new DAG(tasks);
  assert.doesNotThrow(() => dag.validate());

  assert.equal(dag.tasks.length, 2);
  assert.deepEqual(new Set(dag.tasks), new Set(tasks));
  assert.strictEqual(dag.getTask('start'), start);
  assert.strictEqual(dag.getTask('finish'), finish);
});

test('DAG accepts an empty graph', options, () => {
  const dag = new DAG();
  assert.deepEqual(dag.tasks, []);
  assert.doesNotThrow(() => dag.validate());
});

test('DAG validates missing dependencies after registration is complete', options, () => {
  const dag = new DAG();
  const consumer = task('consumer', ['source']);
  dag.register(consumer);

  assert.strictEqual(dag.getTask('consumer'), consumer);
  assert.deepEqual(dag.getDependencies('consumer'), ['source']);
  assert.throws(() => dag.validate(), /missing dependency "source"/);

  const source = task('source');
  dag.register(source);
  assert.deepEqual(dag.tasks, [consumer, source]);
  assert.deepEqual(dag.getDependencies('source'), []);
  assert.doesNotThrow(() => dag.validate());
});

test('DAG rejects duplicate task names during construction', options, () => {
  assert.throws(() => new DAG([task('same'), task('same')]));
});

test('DAG rejects a cycle even in a disconnected component', options, () => {
  const dag = new DAG([
    task('independent'),
    task('a', ['c']),
    task('b', ['a']),
    task('c', ['b']),
  ]);
  assert.throws(() => dag.validate(), /Circular dependency/);
});

test('DAG rejects a self-cycle during validation', options, () => {
  const dag = new DAG([task('self', ['self'])]);
  assert.throws(() => dag.validate(), /Circular dependency/);
});

test('DAG rejects duplicate registrations without replacing the original task', options, () => {
  const original = task('same');
  const dag = new DAG([original]);
  assert.throws(() => dag.register(task('same')), /Duplicate task name/);
  assert.strictEqual(dag.getTask('same'), original);
});

test('DAG reports unknown tasks for task and dependency lookups', options, () => {
  const dag = new DAG();
  assert.throws(() => dag.getTask('missing'), /Unknown task: missing/);
  assert.throws(() => dag.getDependencies('missing'), /Unknown task: missing/);
});

test('DAG validation checks tasks added after an earlier successful validation', options, () => {
  const dag = new DAG([task('valid')]);
  dag.validate();
  dag.register(task('broken', ['missing']));
  assert.throws(() => dag.validate(), /missing dependency "missing"/);
});

test('runner validates missing references and cycles before executing any task', options, () => {
  let calls = 0;
  const invalid = new Task({ name: 'invalid', dependencies: ['missing'], run: () => { calls += 1; } });
  assert.throws(() => new PipelineRunner(new DAG([invalid])), /missing dependency/);
  assert.throws(() => new PipelineRunner(new DAG([task('a', ['b']), task('b', ['a'])])), /Circular dependency/);
  assert.equal(calls, 0);
});
