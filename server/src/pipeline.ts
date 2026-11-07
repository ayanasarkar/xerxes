import { Stage, type StageContext } from './stage.js';

export class Pipeline {
  constructor(private readonly stages: Stage[]) {}

  async run(input: unknown): Promise<Record<string, unknown>> {
    const context: StageContext = { input, results: {} };

    for (const stage of this.stages) {
      context.results[stage.name] = await stage.run(context);
    }

    return context.results;
  }
}
