import type { JobHandler } from '@oms/module-kit';
import { manifest } from './manifest';
import { issueRoutes } from './routes';
import { sweepAllVendors } from './engine';

export { manifest };
export { issueRoutes };
export { sweepVendor, upsertIssue, type SweepResult } from './engine';
export type { Detection as IssueDetection } from './detectors';
export { DETECTORS, type Detector } from './detectors';
export { issueCounts } from './service';

export const JOB_ISSUES_SWEEP = 'issues.sweep';

/** every 5 minutes: run all detectors for every active vendor (bounded batches; one vendor failing never stops the others) and wake expired snoozes */
const jobs: JobHandler[] = [{
  queue: 'maintenance',
  name: JOB_ISSUES_SWEEP,
  async handle(_env, c) {
    const r = await sweepAllVendors(c);
    c.logger.debug(r, 'issues sweep');
  },
}];

/** Issues: the operations issue queue ("Needs attention"). Detectors, lifecycle and endpoints live here. */
export const issuesModule = { manifest, routes: issueRoutes, jobs };
