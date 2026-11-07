import { DAG } from '../pipeline/dag.js';
import { Task } from '../pipeline/task.js';
import { buildSecurityPipeline as buildMockPipeline } from './mock-pipeline.js';
import type { ScanResult } from '../modules/web-security/types.js';

export interface ScannerTask { scan(input: unknown): Promise<ScanResult>; }

/** Preserve the legacy mocks and risk ownership; only add scanner output to aggregation. */
export function buildSecurityPipeline(scanner: ScannerTask): DAG {
  const legacy = buildMockPipeline();
  const assessment = legacy.getTask('securityAssessment');
  return new DAG([
    ...legacy.tasks.filter((task) => task.name !== 'securityAssessment'),
    new Task({ name: 'webSecurityScan', run: (context) => scanner.scan(context.input) }),
    new Task({
      name: 'securityAssessment',
      dependencies: [...assessment.dependencies, 'webSecurityScan'],
      run: async (context) => {
        const previous = await assessment.run(context) as { findings: string[] };
        const scan = context.results.webSecurityScan as ScanResult;
        return { ...previous, webSecurity: { status: scan.status, counts: scan.counts, findings: scan.findings, coverageLimitations: scan.coverageLimitations } };
      },
    }),
  ]);
}
