import type { DAG } from './dag.js';
import { type StateManager, TaskState } from './state-manager.js';
import type { Task } from './task.js';

export class Scheduler {
  constructor(
    private readonly dag: DAG,
    private readonly state: StateManager,
  ) {}

  getReadyTasks(): readonly Task[] {
    // Repeat so blocked states propagate even when dependents were registered first.
    let changed: boolean;
    do {
      changed = false;
      for (const task of this.dag.tasks) {
        if (this.state.getState(task.name) !== TaskState.PENDING) continue;

        const blocked = this.dag.getDependencies(task.name).some((name) => {
          const dependencyState = this.state.getState(name);
          return dependencyState === TaskState.FAILED || dependencyState === TaskState.BLOCKED;
        });
        if (blocked) {
          this.state.markBlocked(task.name);
          changed = true;
        }
      }
    } while (changed);

    return this.dag.tasks.filter((task) =>
      this.state.getState(task.name) === TaskState.PENDING &&
      this.dag.getDependencies(task.name).every((name) => this.state.isSuccess(name)),
    );
  }
}
