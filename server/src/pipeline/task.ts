import type { ExecutionContext } from './execution-context.js';

export interface TaskDefinition {
  name: string;
  dependencies?: readonly string[];
  run: (context: ExecutionContext) => unknown;
}

export class Task {
  readonly name: string;
  readonly dependencies: readonly string[];
  private readonly handler: TaskDefinition['run'];

  constructor(definition: TaskDefinition) {
    this.name = definition.name;
    this.dependencies = Object.freeze([...(definition.dependencies ?? [])]);
    this.handler = definition.run;
  }

  async run(context: ExecutionContext): Promise<unknown> {
    return this.handler(context);
  }
}
