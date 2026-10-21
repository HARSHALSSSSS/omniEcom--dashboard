import { and, eq, inArray, isNull, schema, sql, withSystem, withVendor, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { effects, systemOpCtx, type Container, type OpCtx } from '@oms/module-kit';
import { SyncWork, processSales } from '@oms/mod-pricing';
import { stepFor, type Action, type Status } from '../domain/lifecycle';
import { budgetExhausted } from '../domain/terms';
import { loadCampaign, type CampaignRow } from '../infrastructure/queries';
import { refreshResults } from './results';
import { applySales, clearSales, syncItemStates } from './sales';

const C = schema.promotionCampaigns;

export type EndReason = 'ended_manually' | 'window_closed' | 'budget_exhausted' | 'cancelled';

const payload = (c: CampaignRow, extra: Record<string, unknown> = {}) => ({ campaignId: c.id, code: c.code, name: c.name, status: c.status, startsAt: c.startsAt?.toISOString() ?? null, endsAt: c.endsAt?.toISOString() ?? null, ...extra });

async function save(tx: Tx, c: CampaignRow, set: Partial<typeof C.$inferInsert>): Promise<CampaignRow> {
  const [row] = await tx.update(C).set({ ...set, version: sql`${C.version} + 1` }).where(eq(C.id, c.id)).returning();
  return row!;
}

/** the campaign stops: its sale prices are removed, the items finish, the results are frozen and the event goes out */
async function finish(tx: Tx, ctx: OpCtx, work: SyncWork, c: CampaignRow, status: 'ended' | 'cancelled', reason: EndReason, now: Date): Promise<CampaignRow> {
  await clearSales(tx, ctx, work, c);
  const wasRunning = c.status === 'active';
  const floor = c.startsAt ? c.startsAt.getTime() + 1 : now.getTime();
  const endsAt = wasRunning ? (c.endsAt && c.endsAt <= now ? c.endsAt : new Date(Math.max(now.getTime(), floor))) : c.endsAt;
  const stopped = await save(tx, c, { status, endsAt });
  await syncItemStates(tx, ctx, stopped, now, reason);
  const final = await refreshResults(tx, stopped, now);
  const fx = effects(tx, ctx);
  await fx.audit({ action: status === 'ended' ? 'promotion.ended' : 'promotion.cancelled', resourceType: 'promotion_campaign', resourceId: c.id, before: { status: c.status }, after: { status, endsAt: endsAt?.toISOString() ?? null }, metadata: { reason, spendMinor: final.spendMinor, revenueMinor: final.revenueMinor, unitsMoved: final.unitsMoved } });
  if (status === 'ended') await fx.event({ type: 'promotion.ended', aggregateType: 'promotion_campaign', aggregateId: c.id, payload: payload(final, { reason, spendMinor: final.spendMinor, revenueMinor: final.revenueMinor, unitsMoved: final.unitsMoved }) });
  return final;
}

async function started(tx: Tx, ctx: OpCtx, c: CampaignRow, now: Date, set: Partial<typeof C.$inferInsert> = {}): Promise<CampaignRow> {
  const running = await save(tx, c, { status: 'active', ...set });
  await syncItemStates(tx, ctx, running, now);
  const fx = effects(tx, ctx);
  await fx.audit({ action: 'promotion.activated', resourceType: 'promotion_campaign', resourceId: c.id, before: { status: c.status }, after: { status: 'active', startsAt: running.startsAt?.toISOString() ?? null } });
  await fx.event({ type: 'promotion.activated', aggregateType: 'promotion_campaign', aggregateId: c.id, payload: payload(running) });
  return running;
}

const moves: Record<Action, string> = { schedule: 'scheduled', activate: 'activated', end: 'ended', cancel: 'cancelled' };

/**
 * Move a campaign along its lifecycle. The row is locked, so two requests cannot both apply; repeating an action on a campaign
 * that is already there is a no-op (`changed: false`). Schedule/activate put the sale prices on the marketplace prices.
 */
export async function transition(tx: Tx, ctx: OpCtx, work: SyncWork, id: string, action: Action, o: { version?: number } = {}): Promise<{ row: CampaignRow; changed: boolean }> {
  const now = new Date();
  const c = await loadCampaign(tx, ctx.vendorId, id, true);
  const step = stepFor(action, c.status as Status);
  if (step === 'noop') return { row: c, changed: false };
  if (step === 'invalid') throw new AppError('INVALID_STATE', `A ${c.status} campaign cannot be ${moves[action]}`, { details: { rule: 'invalid_transition', from: c.status, action } });
  if (o.version !== undefined && o.version !== c.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: c.version } });
  const fx = effects(tx, ctx);
  if (action === 'schedule') {
    if (!c.startsAt || !c.endsAt) throw Errors.validation({ rule: 'dates_required', issues: [{ path: 'startsAt', message: 'a scheduled campaign needs a start and an end' }] });
    if (c.endsAt <= now) throw Errors.validation({ rule: 'window_closed', issues: [{ path: 'endsAt', message: 'the end is already in the past' }] });
    await applySales(tx, ctx, work, c, c.startsAt, now);
    if (c.startsAt <= now) return { row: await started(tx, ctx, c, now), changed: true };
    const row = await save(tx, c, { status: 'scheduled' });
    await syncItemStates(tx, ctx, row, now);
    await fx.audit({ action: 'promotion.scheduled', resourceType: 'promotion_campaign', resourceId: c.id, before: { status: c.status }, after: { status: 'scheduled', startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString() } });
    return { row, changed: true };
  }
  if (action === 'activate') {
    if (c.endsAt && c.endsAt <= now) throw Errors.validation({ rule: 'window_closed', issues: [{ path: 'endsAt', message: 'the end is already in the past' }] });
    if (c.status === 'scheduled') await clearSales(tx, ctx, work, c); // the sale window changes: start now
    const moved = { ...c, startsAt: now };
    await applySales(tx, ctx, work, moved, now, now);
    return { row: await started(tx, ctx, c, now, { startsAt: now }), changed: true };
  }
  if (action === 'end') return { row: await finish(tx, ctx, work, c, 'ended', 'ended_manually', now), changed: true };
  return { row: await finish(tx, ctx, work, c, 'cancelled', 'cancelled', now), changed: true };
}

// ------------------------------------------------------------------------------------------------
// the scheduler tick
// ------------------------------------------------------------------------------------------------
export const JOB_TICK = 'promotions.tick';

/**
 * Every minute: scheduled campaigns whose start has come become active, campaigns whose end has passed (or whose budget is used up)
 * end with their reason, and the results of running campaigns are refreshed. Safe to run twice at once (rows are locked, a
 * locked campaign is skipped) and to run late (a campaign that missed its whole window ends directly).
 */
export async function tick(c: Container, now = new Date()): Promise<{ activated: number; ended: number; refreshed: number }> {
  await processSales(c, now); // the sale prices start and stop first, so the item statuses below reflect them
  const due = await withSystem(c.database.db, (tx) => tx.select({ id: C.id, vendorId: C.vendorId }).from(C).where(and(isNull(C.deletedAt), inArray(C.status, ['scheduled', 'active']), sql`(${C.status} = 'active' or ${C.startsAt} <= ${now} or ${C.endsAt} <= ${now})`)).limit(500));
  const out = { activated: 0, ended: 0, refreshed: 0 };
  for (const d of due) {
    const ctx = systemOpCtx(c, d.vendorId, 'promotions-tick');
    const work = new SyncWork();
    await withVendor(c.database.db, d.vendorId, async (tx) => {
      const [locked] = await tx.select().from(C).where(and(eq(C.id, d.id), eq(C.vendorId, d.vendorId), isNull(C.deletedAt))).for('update', { skipLocked: true });
      if (!locked || (locked.status !== 'scheduled' && locked.status !== 'active')) return;
      let row = locked;
      if (row.status === 'scheduled') {
        if (row.startsAt && row.startsAt <= now) { row = await started(tx, ctx, row, now); out.activated++; } else if (!(row.endsAt && row.endsAt <= now)) return;
      }
      if (row.endsAt && row.endsAt <= now) { await finish(tx, ctx, work, row, 'ended', 'window_closed', now); out.ended++; return; }
      row = await refreshResults(tx, row, now);
      out.refreshed++;
      await syncItemStates(tx, ctx, row, now);
      if (budgetExhausted(row.budgetMinor, row.spendMinor)) { await finish(tx, ctx, work, row, 'ended', 'budget_exhausted', now); out.ended++; }
    });
    await work.flush(c, d.vendorId);
  }
  return out;
}

