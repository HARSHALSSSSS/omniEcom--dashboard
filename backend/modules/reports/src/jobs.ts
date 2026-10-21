import type { JobHandler } from '@oms/module-kit';
import { executeRun, JOB_GENERATE, purgeExpiredFiles } from './runs';
import { tickSchedules } from './schedules';

export const JOB_RUN_SCHEDULES = 'reports.run-schedules';

export const reportJobs: JobHandler[] = [
  {
    /** builds and stores the file of one queued run (big reports, scheduled reports, "run now") */
    queue: 'heavy',
    name: JOB_GENERATE,
    async handle(env, c) {
      const { runId } = env.data as { runId: string };
      if (!env.vendorId || !runId) throw new Error('report job without tenant or run');
      await executeRun(c, env.vendorId, runId);
    },
  },
  {
    /** every minute: fire the schedules that are due, and drop the files that passed their retention */
    queue: 'maintenance',
    name: JOB_RUN_SCHEDULES,
    async handle(_env, c) {
      const r = await tickSchedules(c);
      const purged = await purgeExpiredFiles(c);
      if (r.created || r.requeued || purged) c.logger.info({ ...r, purged }, 'report schedules processed');
    },
  },
];
