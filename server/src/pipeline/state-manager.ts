import type { DAG } from './dag.js';

export const TaskState = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
} as const;

export type TaskState = (typeof TaskState)[keyof typeof TaskState];

export class StateManager {
  private readonly states = new Map<string, TaskState>();
  private readonly results = new Map<string, unknown>();
  private readonly errors = new Map<string, unknown>();

  initialize(dag: DAG): void {
    this.states.clear();
    this.results.clear();
    this.errors.clear();
    for (const task of dag.tasks) {
      this.states.set(task.name, TaskState.PENDING);
    }
  }

  markRunning(name: string): void {
    this.setState(name, TaskState.RUNNING);
  }

  markSuccess(name: string, result: unknown): void {
    this.setState(name, TaskState.SUCCESS);
    this.results.set(name, result);
  }

  markFailed(name: string, error: unknown): void {
    this.setState(name, TaskState.FAILED);
    this.errors.set(name, error);
  }

  markBlocked(name: string): void {
    this.setState(name, TaskState.BLOCKED);
  }

  getResult(name: string): unknown {
    this.getState(name);
    return this.results.get(name);
  }

  isSuccess(name: string): boolean {
    return this.getState(name) === TaskState.SUCCESS;
  }

  allTasksFinished(): boolean {
    return [...this.states.values()].every((state) =>
      state === TaskState.SUCCESS || state === TaskState.FAILED || state === TaskState.BLOCKED,
    );
  }

  getState(name: string): TaskState {
    const state = this.states.get(name);
    if (!state) throw new Error(`Unknown task: ${name}`);
    return state;
  }

  private setState(name: string, state: TaskState): void {
    this.getState(name);
    this.states.set(name, state);
  }


  getStates(): Record<string, TaskState> {
    return Object.fromEntries(this.states);
  }

  getErrors(): Record<string, unknown> {
    return Object.fromEntries(this.errors);
  }

  throwIfFailed(): void {
    const firstError = this.errors.values().next();
    if (!firstError.done) throw firstError.value;
  }
}
