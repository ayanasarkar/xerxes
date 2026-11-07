import type { DAG } from './dag.js';
import { ExecutionContext } from './execution-context.js';
import { Executor } from './executor.js';
import { Scheduler } from './scheduler.js';
import { StateManager } from './state-manager.js';

export class PipelineRunner {
  private readonly executor = new Executor();

  constructor(private readonly dag: DAG) {
    this.dag.validate();
  }

  async run(input: unknown): Promise<Record<string, unknown>> {
    const state = new StateManager();
    state.initialize(this.dag);
    const context = new ExecutionContext(input, state);
    const scheduler = new Scheduler(this.dag, state);
    const running = new Map<string, Promise<void>>();

    while (!state.allTasksFinished()) {
      for (const task of scheduler.getReadyTasks()) {
        const execution = this.executor.execute(task, context, state)
          .catch(() => {
            // Drain unrelated work before reporting the recorded failure.
          })
          .finally(() => {
            running.delete(task.name);
          });
        running.set(task.name, execution);
      }

      if (running.size > 0) {
        // Reschedule on each completion rather than waiting for an entire batch.
        await Promise.race(running.values());
      } else if (!state.allTasksFinished()) {
        throw new Error('Pipeline cannot make progress: no ready or running tasks');
      }
    }

    state.throwIfFailed();
    return context.results;
  }
}
