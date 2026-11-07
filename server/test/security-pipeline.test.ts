import assert from 'node:assert/strict';
import test from 'node:test';
import { PipelineRunner } from '../src/pipeline/pipeline-runner.js';
import { buildSecurityPipeline } from '../src/pipelines/mock-pipeline.js';

test('buildSecurityPipeline returns a fresh valid DAG of independent mock tasks', () => {
  const first = buildSecurityPipeline();
  const second = buildSecurityPipeline();

  assert.doesNotThrow(() => first.validate());
  assert.notStrictEqual(first, second);
  assert.deepEqual(first.tasks.map((task) => task.name), [
    'threatAnalysis', 'securityAssessment', 'certificateValidation', 'threatIntelligence',
  ]);
  for (const task of first.tasks) {
    assert.deepEqual(first.getDependencies(task.name), []);
    assert.notStrictEqual(task, second.getTask(task.name));
  }
});

test('a runner built from the security DAG preserves mock outputs across isolated runs', async () => {
  const dag = buildSecurityPipeline();
  const runner = new PipelineRunner(dag);
  const first = await runner.run({ url: 'https://example.com' });
  const second = await runner.run({ url: 'https://example.org' });

  assert.deepEqual(first, {
    threatAnalysis: { verdict: 'unknown', score: 0 },
    securityAssessment: { findings: [] },
    certificateValidation: { valid: null },
    threatIntelligence: { matches: [] },
  });
  assert.deepEqual(second, first);
  assert.notStrictEqual(first, second);
  for (const name of ['threatAnalysis', 'securityAssessment', 'certificateValidation', 'threatIntelligence'] as const) {
    assert.notStrictEqual(first[name], second[name]);
  }
});
