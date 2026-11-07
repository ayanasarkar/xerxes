import { DAG } from '../pipeline/dag.js';
import { Task } from '../pipeline/task.js';

interface CertificateResult {
  valid: boolean | null;
}

interface IntelligenceResult {
  matches: string[];
}

interface ThreatResult {
  verdict: 'unknown' | 'suspicious';
  score: number;
}

export function buildSecurityPipeline(): DAG {
  return new DAG([
    new Task({ name: 'certificateValidation', run: () => ({ valid: false }) }),
    new Task({ name: 'threatIntelligence', run: () => ({ matches: [] }) }),
    new Task({
      name: 'threatAnalysis',
      dependencies: ['threatIntelligence'],
      run: (context): ThreatResult => {
        const intelligence = context.results.threatIntelligence as IntelligenceResult;
        // This score is only a deterministic mock, not a real risk assessment.
        const score = Math.min(intelligence.matches.length * 25, 100);
        return { verdict: score > 0 ? 'suspicious' : 'unknown', score };
      },
    }),
    new Task({
      name: 'securityAssessment',
      dependencies: ['certificateValidation', 'threatAnalysis'],
      run: (context) => {
        const certificate = context.results.certificateValidation as CertificateResult;
        const threat = context.results.threatAnalysis as ThreatResult;
        const findings: string[] = [];
        if (certificate.valid === false) findings.push('Mock certificate validation failed');
        if (threat.verdict === 'suspicious') findings.push('Mock threat intelligence match detected');
        return { findings };
      },
    }),
  ]);
}
