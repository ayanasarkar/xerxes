import assert from 'node:assert/strict';
import test from 'node:test';
import { DAG } from '../src/pipeline/dag.js';
import type { ExecutionContext } from '../src/pipeline/execution-context.js';
import { PipelineRunner } from '../src/pipeline/pipeline-runner.js';
import { TaskState, type StateManager } from '../src/pipeline/state-manager.js';
import { Task } from '../src/pipeline/task.js';

const options = { timeout: 5_000 };

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('TaskState exposes the public state strings', options, () => {
  for (const state of ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'BLOCKED'] as const) {
    assert.equal(TaskState[state], state);
  }
});

test('runner executes an out-of-order diamond once and passes input and dependency outputs', options, async () => {
  const input = { seed: 3 };
  const calls: string[] = [];
  const contexts: ExecutionContext[] = [];
  const record = (name: string, context: ExecutionContext) => {
    assert.strictEqual(context.input, input);
    contexts.push(context);
    calls.push(name);
  };
  const tasks: readonly Task[] = [
    new Task({
      name: 'join', dependencies: ['left', 'right'],
      run: (context) => {
        record('join', context);
        assert.equal(context.results.root, 3);
        return Number(context.results.left) + Number(context.results.right);
      },
    }),
    new Task({
      name: 'right', dependencies: ['root'],
      run: async (context) => {
        record('right', context);
        return Number(context.results.root) * 4;
      },
    }),
    new Task({
      name: 'left', dependencies: ['root'],
      run: (context) => {
        record('left', context);
        return Number(context.results.root) * 2;
      },
    }),
    new Task({
      name: 'root',
      run: (context) => {
        record('root', context);
        return input.seed;
      },
    }),
  ];

  const result = await new PipelineRunner(new DAG(tasks)).run(input);

  assert.deepEqual(result, { root: 3, left: 6, right: 12, join: 18 });
  assert.strictEqual(result, contexts[0]!.results);
  assert.ok(contexts.every((context) => context === contexts[0]));
  assert.deepEqual(contexts[0]!.state.getStates(), {
    root: TaskState.SUCCESS, left: TaskState.SUCCESS,
    right: TaskState.SUCCESS, join: TaskState.SUCCESS,
  });
  assert.deepEqual(contexts[0]!.state.getErrors(), {});
  assert.equal(calls.length, 4);
  assert.deepEqual(new Set(calls), new Set(['root', 'left', 'right', 'join']));
  assert.equal(calls[0], 'root');
  assert.equal(calls[3], 'join');
});

test('ExecutionContext allows result entries to be updated by a task', options, async () => {
  const result = await new PipelineRunner(new DAG([
    new Task({
      name: 'writer',
      run: (context: ExecutionContext) => {
        context.results.note = 'before';
        context.results.note = 'after';
        return 'written';
      },
    }),
    new Task({
      name: 'reader', dependencies: ['writer'],
      run: (context) => context.results.note,
    }),
  ])).run(null);

  assert.deepEqual(result, { note: 'after', writer: 'written', reader: 'after' });
});

test('roots run concurrently and a dependent starts while an unrelated root is still running', options, async (t) => {
  const fastStarted = deferred();
  const slowStarted = deferred();
  const releaseFast = deferred();
  const releaseSlow = deferred();
  const childStarted = deferred();
  let state!: StateManager;
  let slowFinished = false;
  t.after(() => { releaseFast.resolve(); releaseSlow.resolve(); });

  const run = new PipelineRunner(new DAG([
    new Task({
      name: 'child', dependencies: ['fast'],
      run: (context) => {
        state = context.state;
        childStarted.resolve();
        assert.equal(slowFinished, false);
        assert.equal(context.results.fast, 'fast result');
        return 'child result';
      },
    }),
    new Task({
      name: 'fast',
      run: async () => {
        fastStarted.resolve();
        await releaseFast.promise;
        return 'fast result';
      },
    }),
    new Task({
      name: 'slow',
      run: async () => {
        slowStarted.resolve();
        await releaseSlow.promise;
        slowFinished = true;
        return 'slow result';
      },
    }),
  ])).run(undefined);

  await Promise.all([fastStarted.promise, slowStarted.promise]);
  releaseFast.resolve();
  await childStarted.promise;
  assert.equal(slowFinished, false);
  releaseSlow.resolve();

  const result = await run;
  assert.deepEqual(result, { fast: 'fast result', child: 'child result', slow: 'slow result' });
  assert.deepEqual(state.getStates(), {
    fast: TaskState.SUCCESS, child: TaskState.SUCCESS, slow: TaskState.SUCCESS,
  });
  assert.deepEqual(state.getErrors(), {});
});

test('a join waits for every prerequisite, not just the first to settle', options, async (t) => {
  const releaseRight = deferred();
  const rightStarted = deferred();
  const leftChildStarted = deferred();
  let state!: StateManager;
  let joinCalls = 0;
  t.after(() => releaseRight.resolve());

  const run = new PipelineRunner(new DAG([
    new Task({ name: 'left', run: () => 'left' }),
    new Task({
      name: 'right',
      run: async () => {
        rightStarted.resolve();
        await releaseRight.promise;
        return 'right';
      },
    }),
    new Task({
      name: 'leftChild', dependencies: ['left'],
      run: () => { leftChildStarted.resolve(); return 'left child'; },
    }),
    new Task({
      name: 'join', dependencies: ['left', 'right'],
      run: (context) => {
        state = context.state;
        joinCalls += 1;
        assert.equal(context.results.left, 'left');
        assert.equal(context.results.right, 'right');
        return 'joined';
      },
    }),
  ])).run(null);

  await Promise.all([rightStarted.promise, leftChildStarted.promise]);
  assert.equal(joinCalls, 0);
  releaseRight.resolve();
  const result = await run;
  assert.equal(joinCalls, 1);
  assert.equal(result.join, 'joined');
  assert.equal(state.getState('join'), TaskState.SUCCESS);
  assert.deepEqual(state.getErrors(), {});
});

for (const mode of ['sync', 'async'] as const) {
  test(`${mode} failure is retained, blocks descendants transitively, and leaves independent work running`, options, async () => {
    const failure = new Error(`${mode} failure`);
    const blockedCalls: string[] = [];
    const contexts: ExecutionContext[] = [];
    const run = new PipelineRunner(new DAG([
      new Task({
        name: 'grandchild', dependencies: ['child'],
        run: () => { blockedCalls.push('grandchild'); },
      }),
      new Task({
        name: 'child', dependencies: ['broken', 'independent'],
        run: () => { blockedCalls.push('child'); },
      }),
      new Task({
        name: 'broken',
        run: mode === 'sync'
          ? (context) => { contexts.push(context); throw failure; }
          : async (context) => { contexts.push(context); await Promise.resolve(); throw failure; },
      }),
      new Task({ name: 'independent', run: async () => 'ok' }),
      new Task({
        name: 'independentChild', dependencies: ['independent'],
        run: (context) => `${context.results.independent}!`,
      }),
    ])).run('input');

    await assert.rejects(run, (error: unknown) => error === failure);
    const context = contexts[0]!;
    assert.deepEqual(blockedCalls, []);
    assert.deepEqual(context.results, { independent: 'ok', independentChild: 'ok!' });
    assert.deepEqual(context.state.getStates(), {
      broken: TaskState.FAILED, child: TaskState.BLOCKED, grandchild: TaskState.BLOCKED,
      independent: TaskState.SUCCESS, independentChild: TaskState.SUCCESS,
    });
    assert.deepEqual(Object.keys(context.state.getErrors()), ['broken']);
    assert.strictEqual(context.state.getErrors().broken, failure);
  });
}

test('runner waits for unrelated running work and rejects with the first original failure', options, async (t) => {
  const failure = new Error('broken root');
  const laterFailure = new Error('later failure');
  const slowStarted = deferred();
  const releaseSlow = deferred();

  let state!: StateManager;
  let settled = false;
  let childFinished = false;
  t.after(() => releaseSlow.resolve());

  const run = new PipelineRunner(new DAG([
    new Task({
      name: 'broken',
      run: async (context) => {
        state = context.state;
        await slowStarted.promise;
        throw failure;
      },
    }),
    new Task({
      name: 'slow',
      run: async () => {
        slowStarted.resolve();
        await releaseSlow.promise;
        return 'slow result';
      },
    }),
    new Task({
      name: 'slowChild', dependencies: ['slow'],
      run: () => { childFinished = true; return 'child result'; },
    }),
    new Task({
      name: 'laterBroken', dependencies: ['slowChild'],
      run: () => { throw laterFailure; },
    }),
  ])).run(null);
  void run.then(() => { settled = true; }, () => { settled = true; });
  const rejection = assert.rejects(run, (error: unknown) => error === failure);

  await slowStarted.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(state.getState('broken'), TaskState.FAILED);
  assert.equal(state.getState('slow'), TaskState.RUNNING);
  assert.equal(settled, false);
  assert.equal(childFinished, false);

  releaseSlow.resolve();
  await rejection;
  assert.equal(childFinished, true);
  assert.deepEqual(state.getStates(), {
    broken: TaskState.FAILED, slow: TaskState.SUCCESS, slowChild: TaskState.SUCCESS,
    laterBroken: TaskState.FAILED,
  });
  assert.strictEqual(state.getErrors().broken, failure);
  assert.strictEqual(state.getErrors().laterBroken, laterFailure);
});

test('an empty runner returns an empty output record', options, async () => {
  assert.deepEqual(await new PipelineRunner(new DAG([])).run({ arbitrary: 'input' }), {});
});

test('concurrent runs on the same runner keep results, states, errors, and input isolated', options, async (t) => {
  const firstInput = { id: 'first' };
  const secondInput = { id: 'second' };
  const firstStarted = deferred();
  const secondStarted = deferred();
  const releaseFirst = deferred();
  const releaseSecond = deferred();
  const failure = new Error('first run only');
  const contexts: ExecutionContext[] = [];
  t.after(() => { releaseFirst.resolve(); releaseSecond.resolve(); });

  const runner = new PipelineRunner(new DAG([
    new Task({
      name: 'root',
      run: async (context) => {
        contexts.push(context);
        if (context.input === firstInput) {
          firstStarted.resolve();
          await releaseFirst.promise;
          throw failure;
        }
        assert.strictEqual(context.input, secondInput);
        secondStarted.resolve();
        await releaseSecond.promise;
        return secondInput;
      },
    }),
    new Task({
      name: 'child', dependencies: ['root'],
      run: (context) => {
        assert.strictEqual(context.input, secondInput);
        assert.strictEqual(context.results.root, secondInput);
        return 'second child';
      },
    }),
  ]));

  const firstRun = runner.run(firstInput);
  const firstRejection = assert.rejects(firstRun, (error: unknown) => error === failure);
  const secondRun = runner.run(secondInput);
  await Promise.all([firstStarted.promise, secondStarted.promise]);
  const first = contexts.find((context) => context.input === firstInput)!;
  const second = contexts.find((context) => context.input === secondInput)!;
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.results, second.results);
  assert.notStrictEqual(first.state, second.state);

  releaseSecond.resolve();
  const secondResult = await secondRun;
  assert.strictEqual(secondResult, second.results);
  assert.deepEqual(secondResult, { root: secondInput, child: 'second child' });
  assert.deepEqual(second.state.getStates(), { root: TaskState.SUCCESS, child: TaskState.SUCCESS });
  assert.deepEqual(second.state.getErrors(), {});
  assert.deepEqual(first.state.getStates(), { root: TaskState.RUNNING, child: TaskState.PENDING });
  assert.deepEqual(first.results, {});

  releaseFirst.resolve();
  await firstRejection;
  assert.deepEqual(first.results, {});
  assert.deepEqual(first.state.getStates(), { root: TaskState.FAILED, child: TaskState.BLOCKED });
  assert.strictEqual(first.state.getErrors().root, failure);
  assert.deepEqual(Object.keys(first.state.getErrors()), ['root']);
  assert.deepEqual(second.results, { root: secondInput, child: 'second child' });
  assert.deepEqual(second.state.getStates(), { root: TaskState.SUCCESS, child: TaskState.SUCCESS });
  assert.deepEqual(second.state.getErrors(), {});
});

test('repeated sequential runs reset state, errors, results, and input after failure and success', options, async () => {
  const failure = new Error('first run only');
  const inputs = [{ fail: true, value: 'first' }, { fail: false, value: 'second' }, { fail: false, value: 'third' }];
  const contexts: ExecutionContext[] = [];
  const runner = new PipelineRunner(new DAG([
    new Task({
      name: 'root',
      run: (context) => {
        contexts.push(context);
        assert.deepEqual(context.results, {});
        assert.deepEqual(context.state.getErrors(), {});
        assert.equal(context.state.getState('root'), TaskState.RUNNING);
        assert.equal(context.state.getState('child'), TaskState.PENDING);
        const input = context.input as (typeof inputs)[number];
        if (input.fail) throw failure;
        return input.value;
      },
    }),
    new Task({
      name: 'child', dependencies: ['root'],
      run: (context) => `${context.results.root}!`,
    }),
  ]));

  await assert.rejects(runner.run(inputs[0]), (error: unknown) => error === failure);
  const second = await runner.run(inputs[1]);
  const third = await runner.run(inputs[2]);

  assert.deepEqual(second, { root: 'second', child: 'second!' });
  assert.deepEqual(third, { root: 'third', child: 'third!' });
  assert.equal(contexts.length, 3);
  assert.equal(new Set(contexts).size, 3);
  assert.equal(new Set(contexts.map((context) => context.state)).size, 3);
  assert.equal(new Set(contexts.map((context) => context.results)).size, 3);
  assert.deepEqual(contexts[0]!.results, {});
  assert.deepEqual(contexts[0]!.state.getStates(), { root: TaskState.FAILED, child: TaskState.BLOCKED });
  assert.strictEqual(contexts[0]!.state.getErrors().root, failure);
  for (const [index, context] of contexts.entries()) {
    assert.strictEqual(context.input, inputs[index]);
    if (index === 0) continue;
    assert.deepEqual(context.state.getStates(), { root: TaskState.SUCCESS, child: TaskState.SUCCESS });
    assert.deepEqual(context.state.getErrors(), {});
  }
  assert.strictEqual(second, contexts[1]!.results);
  assert.strictEqual(third, contexts[2]!.results);
});
