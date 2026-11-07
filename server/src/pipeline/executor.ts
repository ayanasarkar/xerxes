import type { ExecutionContext } from './execution-context.js';
import type { StateManager } from './state-manager.js';
import type { Task } from './task.js';

export class Executor {
  async execute(task: Task, context: ExecutionContext, state: StateManager): Promise<void> {
    state.markRunning(task.name);
    try {
      const result = await task.run(context);
      // Define an own property so task names cannot invoke inherited setters.
      Object.defineProperty(context.results, task.name, {
        value: result,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      state.markSuccess(task.name, result);
    } catch (error) {
      state.markFailed(task.name, error);
      throw error;
    }
  }
}
