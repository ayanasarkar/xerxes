export interface StageContext {
  input: unknown;
  results: Record<string, unknown>;
}

export class Stage {
  constructor(
    public readonly name: string,
    private readonly handler: (context: StageContext) => unknown,
  ) {}

  async run(context: StageContext): Promise<unknown> {
    return this.handler(context);
  }
}
