import { Pipeline } from './pipeline.js';
import { Stage } from './stage.js';

export const mockPipeline = new Pipeline([
  new Stage('threatAnalysis', () => ({ verdict: 'unknown', score: 0 })),
  new Stage('securityAssessment', () => ({ findings: [] })),
  new Stage('certificateValidation', () => ({ valid: null })),
  new Stage('threatIntelligence', () => ({ matches: [] })),
]);
