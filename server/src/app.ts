import express from 'express';
import { mockPipeline } from './mock-pipeline.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/analyze', async (req, res) => {
    const results = await mockPipeline.run(req.body);
    res.json(results);
  });

  return app;
}
