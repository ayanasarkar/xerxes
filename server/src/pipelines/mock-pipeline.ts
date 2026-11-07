import { DAG } from '../pipeline/dag.js';

import { Task } from '../pipeline/task.js';

export function buildSecurityPipeline(): DAG {
  return new DAG([
    new Task({ name: 'threatAnalysis', run: () => ({ verdict: 'unknown', score: 0 }) }),
    new Task({ name: 'securityAssessment', run: () => ({ findings: [] }) }),
    new Task({ name: 'certificateValidation', run: () => ({ valid: null }) }),
    new Task({ name: 'threatIntelligence', run: () => ({ matches: [] }) }),
  ]);
}
