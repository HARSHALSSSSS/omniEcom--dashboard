import { createRuntime, startOutboxRelay, startProcessors } from '@oms/runtime';
import { allModules } from '@oms/modules-registry';
import { newId } from '@oms/shared';
import { QUEUES, type QueueKey } from '@oms/messaging';
import { buildApp } from '../../api/src/app';
import { DbAccessDirectory } from '../../api/src/access-directory';
import { DbIdempotencyStore } from '../../api/src/idempotency-db';
import { maintenanceHandlers } from '../../worker/src/maintenance';
import { startBusinessMetrics } from '../../worker/src/business-metrics';
import { SCHEDULES } from '../../scheduler/src/schedules';

/**
 * Single-process deployment: API + worker + webhook-worker + scheduler in one container, for hosts where running four
 * services is impractical. One runtime (one DB pool, one Redis set) is shared. Each background part is started in its own
 * try/catch so a failure in one of them is logged loudly but never takes the HTTP API down. The four standalone apps are
 * unchanged and remain the way to scale or isolate workloads.
 */
const rt = await createRuntime('all-in-one');
const { config, logger } = rt;

const app = await buildApp({
  container: rt.container,
  logger,
  metrics: rt.metrics,
  health: rt.health,
  errorTracker: rt.errorTracker,
  access: new DbAccessDirectory(rt.container.database),
  idempotency: new DbIdempotencyStore(rt.container.database),
  modules: allModules,
  redis: rt.redisFast,
});
rt.onShutdown('http', () => app.close());
await app.listen({ host: config.HOST, port: config.PORT });
logger.info({ port: config.PORT, env: config.NODE_ENV, docs: config.swaggerEnabled ? `${config.PUBLIC_BASE_URL}/docs` : 'disabled' }, 'api started');

const part = async (name: string, start: () => void | Promise<void>) => {
  try { await start(); logger.info({ part: name }, `${name} started`); }
  catch (err) { logger.error({ err, part: name }, `${name} failed to start (api keeps running)`); rt.errorTracker.captureException(err); }
};

await part('worker', () => {
  startProcessors(rt, allModules, ['domainEvents', 'syncMarketplace', 'marketplacePush', 'notifications', 'heavy', 'maintenance'], maintenanceHandlers);
  startOutboxRelay(rt);
  if (config.METRICS_ENABLED) { const stop = startBusinessMetrics(rt); rt.onShutdown('business-metrics', async () => stop()); }
});

await part('webhook-worker', () => { startProcessors(rt, allModules, ['webhooksInbound']); });

await part('scheduler', async () => {
  for (const s of SCHEDULES) {
    await rt.container.queues.queue(s.queue as QueueKey).upsertJobScheduler(
      s.id,
      s.every ? { every: s.every } : { pattern: s.cron!, tz: 'Asia/Kolkata' },
      { name: s.job, data: { vendorId: null, correlationId: newId(), data: s.data ?? {} } },
    );
  }
  for (const key of Object.keys(QUEUES) as QueueKey[]) {
    const q = rt.container.queues.queue(key);
    const known = new Set(SCHEDULES.map((s) => s.id));
    for (const js of await q.getJobSchedulers()) if (js.key && !known.has(js.key)) await q.removeJobScheduler(js.key);
  }
  logger.info({ count: SCHEDULES.length }, 'schedules registered');
});

logger.info('all-in-one ready');
