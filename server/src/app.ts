import express from 'express';
import { PipelineRunner } from './pipeline/pipeline-runner.js';
import { buildSecurityPipeline } from './pipelines/mock-pipeline.js';

export function createApp() {
  const dag = buildSecurityPipeline();
  const runner = new PipelineRunner(dag);
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/analyze', async (req, res) => {
    const results = await runner.run(req.body);
    res.json(results);
  });

  return app;
}
