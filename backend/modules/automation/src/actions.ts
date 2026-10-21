import { AppError } from '@oms/shared';
import { z } from 'zod';
import { systemOpCtx } from '@oms/module-kit';
import { AI_ACTIONS, createRecommendation } from '@oms/mod-ai';
import { cancelFulfillment, startFulfillment } from '@oms/mod-fulfillment';
import { notifyVendor } from '@oms/mod-notifications';
import { SyncWork, createPriceProposal, decideProposal } from '@oms/mod-pricing';
import { createDraftPurchaseOrder } from '@oms/mod-procurement';
import { getSyncJobRow, resetForManualRetry } from '@oms/mod-sync';
import type { Facts } from '@oms/mod-rules';
import { render, type ActionDef } from './kit';

const Sev = z.enum(['info', 'warning', 'critical']);
const SYSTEM = { type: 'system' as const, id: 'automation' };
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ------------------------------------------------------------------------------------------------
// pure helpers shared with the approvals view (what a waiting run would do)
// ------------------------------------------------------------------------------------------------
const DraftPoParams = z.object({
  quantity: z.number().int().min(1).max(1_000_000).optional(),
  targetLevel: z.number().int().min(1).max(1_000_000).optional(),
  supplierId: z.uuid().optional(),
  warehouseId: z.uuid().optional(),
  unitCostMinor: z.number().int().min(0).optional(),
  notes: z.string().max(300).optional(),
}).refine((p) => p.quantity !== undefined || p.targetLevel !== undefined, { message: 'Give a quantity or a targetLevel to order up to', path: ['quantity'] });

/** units to order: a fixed quantity, or what is missing to reach `targetLevel` (at least 1) */
export function draftPoQuantity(params: Record<string, unknown>, facts: Facts): number {
  if (typeof params.quantity === 'number') return params.quantity;
  return Math.max(1, Number(params.targetLevel ?? 1) - (num(facts.available) ?? 0));
}

const ChannelPriceParams = z.object({
  undercutBps: z.number().int().min(0).max(5000).default(0),
  minPriceMinor: z.number().int().min(1).optional(),
  expiresInHours: z.number().int().min(1).max(720).optional(),
});

/** the price to propose: the competitor's price less `undercutBps`, never below the floor */
export function proposedChannelPrice(params: Record<string, unknown>, facts: Facts): number | null {
  const competitor = num(facts.competitorPriceMinor);
  if (competitor === null) return null;
  const undercut = Math.round((competitor * (10_000 - Number(params.undercutBps ?? 0))) / 10_000);
  return Math.max(undercut, Number(params.minPriceMinor ?? 1));
}

// ------------------------------------------------------------------------------------------------
// actions: a closed whitelist; each validates its params, runs inside the module APIs, and says how to undo itself (when it can)
// ------------------------------------------------------------------------------------------------
export const ACTIONS: Record<string, ActionDef> = {
  notify: {
    description: 'Tell the team (in-app, plus e-mail / push by severity). Templates may use {{fact}} placeholders.', triggers: '*',
    schema: z.object({ title: z.string().min(2).max(200), body: z.string().max(500).optional(), severity: Sev.default('info') }),
    async run(x, p) {
      const input = { type: 'automation.notice', severity: p.severity as 'info', title: render(String(p.title), x.facts), body: p.body ? render(String(p.body), x.facts) : null, dedupeKey: `automation:${x.ruleId}:${x.event.id}` };
      x.after.push(() => notifyVendor(x.c, x.vendorId, input)); // after commit: it has its own transactions
      return { result: { queued: true, title: input.title } };
    },
  },
  create_recommendation: {
    description: 'Create a recommendation for a person to review (optionally with a whitelisted action to approve).', triggers: '*',
    schema: z.object({ kind: z.string().min(2).max(40).default('automation'), title: z.string().min(2).max(200), summary: z.string().max(500).default(''), severity: Sev.default('info') }),
    async run(x, p) {
      const r = await createRecommendation(x.tx, x.vendorId, { kind: String(p.kind), severity: p.severity as 'info', title: render(String(p.title), x.facts), summary: render(String(p.summary ?? ''), x.facts) || 'Created by an automation rule', evidence: { ruleId: x.ruleId, eventId: x.event.id, eventType: x.event.type }, source: 'automation', dedupeKey: `auto:${x.ruleId}:${x.event.id}` });
      return { result: { recommendationId: r.recommendation?.id ?? null, created: r.created } };
    },
  },
  retry_sync_job: {
    description: 'Re-queue the failed sync job from the event (max 5 automatic retries per job).', triggers: ['sync.failed', 'sync.dead_lettered'],
    schema: z.object({ maxAutomaticRetries: z.number().int().min(1).max(5).default(3) }),
    async run(x, p) {
      const job = await getSyncJobRow(x.tx, x.vendorId, x.event.aggregateId);
      const done = Number((job.stats as Record<string, number>).manualRetries ?? 0);
      if (done >= Number(p.maxAutomaticRetries)) throw new AppError('CONFLICT', `Already retried ${done} time(s); a person has to look at this job`, { details: { rule: 'retry_budget' } });
      const j = await resetForManualRetry(x.tx, x.vendorId, job.id, 'automation');
      x.work.add(j); // dispatched after the transaction commits
      return { result: { jobId: j.id, retried: done + 1 } };
    },
  },
  start_fulfillment: {
    description: 'Route the new order to a warehouse and create its fulfillment (stock is already reserved). Reversible until picking starts.', triggers: ['order.created'],
    schema: z.object({ maxOrderValueMinor: z.number().int().min(0).optional() }),
    async run(x, p) {
      if (p.maxOrderValueMinor !== undefined && Number(x.facts.totalMinor ?? 0) > Number(p.maxOrderValueMinor)) throw new AppError('CONFLICT', 'Order value is above the automatic limit: a person must start it', { details: { rule: 'above_limit' } });
      const ctx = systemOpCtx(x.c, x.vendorId, 'automation');
      const res = await startFulfillment(x.tx, ctx, x.work, x.event.aggregateId, {});
      return { result: { fulfillmentIds: res.fulfillments.map((f) => f.id), warehouses: res.fulfillments.map((f) => f.warehouseId) }, rollback: { fulfillmentIds: res.fulfillments.map((f) => f.id) } };
    },
    async undo(x, rb, work) {
      const ctx = systemOpCtx(x.c, x.vendorId, 'automation');
      for (const id of (rb.fulfillmentIds as string[]) ?? []) await cancelFulfillment(x.tx, ctx, work, id, 'automation rolled back');
    },
  },
  set_reorder_level: {
    description: 'Set the reorder level of the variant / warehouse in the event (needs a level). Reversible.', triggers: ['inventory.low_stock'],
    schema: z.object({ level: z.number().int().min(0).max(1_000_000) }),
    async run(x, p) {
      const variantId = String(x.facts.variantId ?? '');
      const warehouseId = String(x.facts.warehouseId ?? '');
      if (!variantId || !warehouseId) throw new AppError('BAD_REQUEST', 'The event has no variant / warehouse');
      return AI_ACTIONS.set_reorder_level!.apply(x.tx, x.vendorId, { variantId, warehouseId, level: p.level }, SYSTEM);
    },
    async undo(x, rb) { await AI_ACTIONS.set_reorder_level!.undo(x.tx, x.vendorId, rb, SYSTEM); },
  },
  draft_purchase_order: {
    description: 'Draft a purchase order for the low-stock variant (a fixed quantity, or up to a target level). Nothing is sent to the supplier: a person submits the draft. Not reversible here: cancel the draft in Procurement.', triggers: ['inventory.low_stock'],
    schema: DraftPoParams,
    async run(x, p) {
      const variantId = String(x.facts.variantId ?? '');
      if (!variantId) throw new AppError('BAD_REQUEST', 'The event has no variant');
      const quantity = draftPoQuantity(p, x.facts);
      const warehouseId = (p.warehouseId as string | undefined) ?? (typeof x.facts.warehouseId === 'string' ? x.facts.warehouseId : undefined);
      const po = await createDraftPurchaseOrder(x.tx, x.vendorId, {
        supplierId: p.supplierId as string | undefined, warehouseId,
        lines: [{ variantId, quantity, ...(typeof p.unitCostMinor === 'number' ? { unitCostMinor: p.unitCostMinor } : {}) }],
        reference: `automation:${x.ruleId}`, notes: typeof p.notes === 'string' ? render(p.notes, x.facts) : `Drafted by an automation rule (available ${String(x.facts.available ?? '?')}, reorder level ${String(x.facts.reorderLevel ?? '?')})`, actor: SYSTEM,
      });
      return { result: { purchaseOrderId: po.id, poNumber: po.poNumber, variantId, quantity } };
    },
  },
  adjust_channel_price: {
    description: 'Propose a new channel price against the competitor in the event (a price proposal for a person to approve; the live price is never changed directly). Reversible while the proposal is still pending.', triggers: ['price.competitor_lower'],
    schema: ChannelPriceParams,
    async run(x, p) {
      const variantId = String(x.facts.variantId ?? '');
      const accountId = String(x.facts.accountId ?? '');
      const proposed = proposedChannelPrice(p, x.facts);
      const ours = num(x.facts.ourPriceMinor);
      if (!variantId || !accountId || proposed === null) throw new AppError('BAD_REQUEST', 'The event has no variant / account / competitor price');
      if (ours !== null && proposed >= ours) throw new AppError('CONFLICT', 'The price floor keeps the price at or above the current one: nothing to propose', { details: { rule: 'floor_reached', proposedPriceMinor: proposed, currentPriceMinor: ours } });
      const seller = typeof x.facts.sellerName === 'string' && x.facts.sellerName ? x.facts.sellerName : 'a competitor';
      const pr = await createPriceProposal(x.tx, x.vendorId, {
        variantId, accountId, strategy: 'automated_match', proposedPriceMinor: proposed, competitorPriceMinor: num(x.facts.competitorPriceMinor),
        reasoning: `${seller} lists at ${(Number(x.facts.competitorPriceMinor) / 100).toFixed(2)}; proposed ${(proposed / 100).toFixed(2)} by an automation rule`,
        ...(p.expiresInHours ? { expiresAt: new Date(Date.now() + Number(p.expiresInHours) * 3_600_000) } : {}), actor: SYSTEM,
      });
      return { result: { proposalId: pr.id, status: pr.status, proposedPriceMinor: proposed }, rollback: { proposalId: pr.id } };
    },
    async undo(x, rb) {
      const out = await decideProposal(x.tx, systemOpCtx(x.c, x.vendorId, 'automation'), new SyncWork(), String(rb.proposalId), 'reject', { note: 'Automation run rolled back' });
      if (out.outcome !== 'rejected' && out.outcome !== 'unchanged') throw new AppError('INVALID_STATE', `The proposal ended as ${out.outcome}; it can no longer be withdrawn here`, { details: { rule: 'proposal_decided' } });
    },
  },
  snooze_listing: {
    description: 'Ask a person to snooze (pause) the listing in the event for a number of days. Listings has no per-listing pause to call, so this raises a recommendation with the listing and the snooze period; nothing is changed on the marketplace.', triggers: ['price.competitor_lower', 'listing.failed'],
    schema: z.object({ days: z.number().int().min(1).max(90).default(7), reason: z.string().max(300).optional() }),
    async run(x, p) {
      const listingId = String(x.facts.listingId ?? (x.event.type === 'listing.failed' ? x.event.aggregateId : ''));
      if (!listingId) throw new AppError('BAD_REQUEST', 'The event has no listing');
      const label = String(x.facts.sku ?? x.facts.externalSku ?? listingId);
      const reason = p.reason ? render(String(p.reason), x.facts) : 'Created by an automation rule';
      const r = await createRecommendation(x.tx, x.vendorId, { kind: 'snooze_listing', severity: 'info', title: `Snooze listing ${label} for ${String(p.days)} day(s)`, summary: reason, evidence: { listingId, days: p.days, ruleId: x.ruleId, eventId: x.event.id, eventType: x.event.type }, source: 'automation', dedupeKey: `auto:${x.ruleId}:${x.event.id}` });
      return { result: { listingId, days: p.days, mode: 'recommendation', recommendationId: r.recommendation?.id ?? null, created: r.created } };
    },
  },
};
