# Server template

Express + TypeScript. No database, external calls, validation logic, or real analysis—only mock data.

```sh
pnpm install
pnpm dev
```

Defaults to port `3000` (override with `PORT`).

- `GET /health`
- `POST /api/analyze` — accepts JSON and returns the mock task outputs keyed by task name.

```sh
curl -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'
```

## Structure

```text
src/
  app.ts                     Express routes
  index.ts                   Server entry point
  pipeline/                  Reusable execution engine
    task.ts                  Task definitions and handlers
    dag.ts                   Dependency graph and validation
    scheduler.ts             Readiness checks and failure blocking
    executor.ts              Task invocation and output/error capture
    state-manager.ts         Per-run task states and errors
    execution-context.ts     Shared input and results for one run
    pipeline-runner.ts       Concurrent execution coordination

  pipelines/                 Business-specific pipeline definitions
    mock-pipeline.ts         Security DAG factory with mock analysis tasks
test/                        DAG engine and security pipeline tests
```

## Security pipeline

Build the security DAG separately from its runner. The factory returns a fresh graph containing the four existing independent mock tasks; it does not execute them.

```ts
import { PipelineRunner } from './src/pipeline/pipeline-runner.js';
import { buildSecurityPipeline } from './src/pipelines/mock-pipeline.js';

const dag = buildSecurityPipeline();
const runner = new PipelineRunner(dag);
const result = await runner.run({ url: 'https://example.com' });
```

The server constructs one runner per app and reuses it across requests, with isolated execution state for each run.

## DAG pipelines

```ts
import { DAG } from './src/pipeline/dag.js';
import { PipelineRunner } from './src/pipeline/pipeline-runner.js';
import { Task } from './src/pipeline/task.js';

const dag = new DAG([
  new Task({ name: 'source', run: (context) => context.input }),
  new Task({
    name: 'summary',
    dependencies: ['source'],
    run: (context) => ({ source: context.results.source }),
  }),
  new Task({ name: 'independent', run: async () => 'runs alongside source' }),
]);
const pipeline = new PipelineRunner(dag);

const results = await pipeline.run({ url: 'https://example.com' });
```

`DAG` stores tasks by their unique `Task.name` identifiers. Use `new DAG()` and `register(task)` to build a graph incrementally, or pass an initial task array. `getTask(name)` retrieves a task and `getDependencies(name)` returns its dependency names. Duplicate registrations throw rather than overwrite a task. Call `validate()` after registration to check for missing references and circular dependencies.

`Scheduler(dag, state)` is created separately for each run. `getReadyTasks()` returns only pending tasks whose dependencies have all succeeded, using the DAG's dependency lookups. It also marks tasks blocked by failed prerequisites, including transitive dependents.

Registration order does not matter. Dependencies refer to task names; the runner calls `validate()` when constructed, before any task executes. Each task runs once per pipeline run, after all its dependencies succeed. Independent asynchronous tasks run concurrently in the same process. A newly ready task starts without waiting for unrelated running tasks. This does not provide CPU parallelism or a concurrency limit.

Each run creates its own `StateManager`, `Scheduler`, and `ExecutionContext(input, state)`, so the same runner can handle concurrent requests. Execution uses `state.allTasksFinished()` to detect completion, including failed and blocked tasks. When nothing new is ready, the runner awaits the next running task rather than polling. Handlers receive `context.input`, `context.state`, and `context.results`; a successful return value is stored under the task's name, including `undefined`. Declare every dependency whose output you read. Prefer returning an output rather than mutating other tasks' entries, since independent handlers share the context. Inputs and returned values are not deep-cloned.

`StateManager.initialize(dag)` resets the per-run statuses, stored results, and errors. `markRunning(name)`, `markSuccess(name, result)`, `markFailed(name, error)`, and `markBlocked(name)` record transitions. `getResult(name)` retrieves a successful task's returned value, and `isSuccess(name)` checks its status. The executor also publishes successful outputs to the shared context for downstream handlers.

States begin at `PENDING` and change to `RUNNING`, then `SUCCESS` or `FAILED`. When a prerequisite fails or is blocked, its pending dependents become `BLOCKED` and are never invoked. Unrelated branches continue. On success, `run()` returns the context's results record directly. On failure, it waits for all executable work to finish and then rejects with the first recorded task error. A run with no tasks returns `{}`.

Task handlers can inspect per-run states, stored outputs, and original errors through `context.state.getStates()`, `getResult(name)`, and `getErrors()`.

`Executor.execute(task, context, state)` marks the task running, awaits its handler, and records its output or failure. On failure it rethrows the original error after updating state. The runner catches these errors while draining independent work, then rejects the run. There are no retries, persistence, or rollback of context mutations. The Express example's response shape is unchanged; pipeline errors propagate to Express.


```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```
