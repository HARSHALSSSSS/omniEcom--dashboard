import { and, desc, eq, gt, inArray, or, schema, sql, withVendor, type Tx } from '@oms/database';
import { Errors, newId } from '@oms/shared';
import { createSyncJob, dispatchSyncJob, executeSyncJob, getSyncJobRow, syncJobName, type SyncJobRow, type SyncRunner } from '@oms/mod-sync';
import type { JobHandler, OpCtx } from '@oms/module-kit';
import { verifyMethod } from './methods';
import { SYNC_KIND, syncScope, syncShipping } from './workspace';

/**
 * Sync Shipping as a background job on the shared sync engine (a `tracking` job without a marketplace account): POST /shipping/sync
 * creates the durable row and answers 202 at once; the worker runs it and reports `progress { total, done, failed }` after every
 * item, which GET /shipping/sync/{id} (and the generic /sync/jobs/{id}) shows while it runs. Finished: `stats` hold the counts.
 */
const S = schema.syncJobs;
const isShippingSync = sql`${S.payload} ->> 'kind' = ${SYNC_KIND}`;
/** a job that is waiting, or running for less than ten minutes (a lost worker is recovered by the sweep and must not block a new sync forever) */
const inFlight = () => or(inArray(S.status, ['queued', 'retrying']), and(eq(S.status, 'running'), gt(S.startedAt, new Date(Date.now() - 10 * 60_000))));

const shippingSyncRunner: SyncRunner = async (ctx) => {
  const payload = ctx.payload as { allowedWarehouses?: string[] | null };
  const op: OpCtx = { c: ctx.c, vendorId: ctx.vendorId, actor: ctx.job.requestedBy ? { type: 'user', id: ctx.job.requestedBy } : { type: 'system', id: 'shipping-sync' } };
  const res = await syncShipping(op, payload.allowedWarehouses ?? null, async (tx, c2, id) => ({ ok: (await verifyMethod(tx, c2, id)).ok }), {
    onPlan: (total) => ctx.progress({ total, done: 0, failed: 0 }),
    onItem: (p) => ctx.progress(p),
    onFailure: (f) => ctx.addFailure({ ref: f.ref, code: 'tracking_sync_failed', message: f.message }),
  });
  return {
    stats: {
      orders: res.orders, statuses: res.statuses, processed: res.processed, updated: res.updated, requireAttention: res.requireAttention,
      methodsChecked: res.methods.checked, methodsVerified: res.methods.verified, methodsNotVerified: res.methods.notVerified,
      trackingProcessed: res.tracking.processed, trackingUpdated: res.tracking.updated, trackingFailed: res.tracking.failed,
    },
  };
};

/** the worker side: the sync engine runs a `tracking` job through this runner */
export const shippingSyncJobs: JobHandler[] = [{ queue: 'syncMarketplace', name: syncJobName('tracking'), handle: (env, c) => executeSyncJob(c, env, shippingSyncRunner) }];

/** start a sync, or hand back the one that is already on its way (a double click starts nothing twice) */
export async function startShippingSync(ctx: OpCtx, allowed: string[] | null): Promise<{ job: SyncJobRow; created: boolean }> {
  const res = await withVendor(ctx.c.database.db, ctx.vendorId, async (tx) => {
    const [open] = await tx.select().from(S).where(and(eq(S.vendorId, ctx.vendorId), eq(S.type, 'tracking'), isShippingSync, inFlight())).orderBy(S.createdAt).limit(1);
    if (open) return { job: open, created: false };
    const scope = await syncScope(tx, ctx.vendorId, allowed);
    return createSyncJob(tx, ctx.c, {
      vendorId: ctx.vendorId, accountId: null, type: 'tracking', trigger: ctx.actor.type === 'user' ? 'manual' : 'system', idempotencyKey: `shipping-sync:${ctx.vendorId}:${Date.now()}-${newId()}`,
      payload: { kind: SYNC_KIND, orders: scope.orders, allowedWarehouses: allowed }, requestedBy: ctx.actor.type === 'user' ? ctx.actor.id : null, maxAttempts: 2,
    });
  });
  if (res.created) await dispatchSyncJob(ctx.c, res.job);
  return res;
}

/** one shipping sync of this vendor (404 for any other sync job: this route only speaks about Sync Shipping) */
export async function getShippingSync(tx: Tx, vendorId: string, id: string): Promise<SyncJobRow> {
  const job = await getSyncJobRow(tx, vendorId, id);
  if (job.type !== 'tracking' || (job.payload as { kind?: string }).kind !== SYNC_KIND) throw Errors.notFound('Shipping sync', id);
  return job;
}

/** the latest Sync Shipping of the vendor, so a reloaded page can pick a running sync up again */
export async function latestShippingSync(tx: Tx, vendorId: string): Promise<SyncJobRow | null> {
  const [job] = await tx.select().from(S).where(and(eq(S.vendorId, vendorId), eq(S.type, 'tracking'), isShippingSync)).orderBy(desc(S.createdAt)).limit(1);
  return job ?? null;
}
