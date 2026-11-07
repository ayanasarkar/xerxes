import type { StateManager } from './state-manager.js';

export class ExecutionContext {
  readonly results: Record<string, unknown> = {};

  constructor(
    public readonly input: unknown,
    public readonly state: StateManager,
  ) {}
}
