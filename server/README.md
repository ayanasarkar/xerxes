# Server template

Express + TypeScript. No database, external calls, validation logic, or real analysis—only mock data.

```sh
pnpm install
pnpm dev
```

Defaults to port `3000` (override with `PORT`).

- `GET /health`
- `POST /api/analyze` — accepts JSON and returns `{ mock: true, results: ... }`.

```sh
curl -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'
```

## Structure

- `src/pipeline.ts` — reusable sequential `Pipeline` class.
- `src/stage.ts` — reusable `Stage` class and `StageContext`.
- `src/mock-pipeline.ts` — example stages with fixed outputs.
- `src/app.ts` — Express routes.
- `src/index.ts` — server entry point.

Stages run sequentially and receive the same mutable context object containing `input` and `results`. Each stage can read and update that context; changes are visible to later stages. Its returned output is stored in `context.results` under the stage name. Each pipeline run creates its own context, so requests do not share state. Handlers can be synchronous or asynchronous. Errors propagate normally to Express.

To add a stage, use `new Stage('name', (context) => result)` in the pipeline. Neither class knows anything about URLs or threat analysis, and neither uses TypeScript generic type parameters.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```
