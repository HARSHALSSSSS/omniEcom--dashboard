import { and, eq, inArray, isNull, schema, sql, withVendor, type Tx } from '@oms/database';
import { AppError, newId } from '@oms/shared';
import { markDirty, requestInventorySync } from './channel';
import { inheritedContentHash, isLive, masterContentOf, overriddenFields, unionFields, type ContentField } from './content-domain';
import { REPUBLISH_MESSAGE, requestContentSync, requestListingContentSync, supportsUpdate } from './content';
import { getListingRow } from './context';
import { fx, type Ctx } from './ctx';
import * as svc from './service';

const L = schema.marketplaceListings;
const V = schema.productVariants;
const P = schema.products;
const A = schema.marketplaceAccounts;
const PMD = schema.productMarketplaceData;

type Scalar = string | number | boolean;

// ------------------------------------------------------------------------------------------------
// edit: price / MRP / stock limits / attribute overrides on the listing, title / description / bullets / search terms / brand as channel content
// ------------------------------------------------------------------------------------------------
export interface ChannelContentPatch { title?: string | null; description?: string | null; bulletPoints?: string[] | null; searchTerms?: string[] | null; brand?: string | null }
export interface EditInput extends svc.UpdateListingInput, ChannelContentPatch { attributeOverrides?: Record<string, Scalar | null> }

/** API field -> the keys of product_marketplace_data it lives under (the first is the one written) and the master content field it overrides */
const CONTENT_KEYS: Record<keyof ChannelContentPatch, { keys: string[]; field: ContentField }> = {
  title: { keys: ['title'], field: 'title' },
  description: { keys: ['description'], field: 'description' },
  bulletPoints: { keys: ['bullet_points', 'bullets', 'bulletPoints'], field: 'description' },
  searchTerms: { keys: ['search_terms', 'searchTerms', 'keywords', 'tags'], field: 'tags' },
  brand: { keys: ['brand'], field: 'brand' },
};

const clean = (v: unknown): unknown => {
  if (v === null) return null;
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (Array.isArray(v)) { const xs = v.map((x) => String(x).trim()).filter(Boolean); return xs.length ? xs : null; }
  return v;
};

/**
 * Applies a channel-content patch to product_marketplace_data of (product, marketplace) and marks every listing of that product on the
 * marketplace: a live one is queued for a content sync (or needs a republish when the connector cannot update), a draft / approved one
 * loses its validation and approval (the merchant approved other content). Returns the changed API fields and the accounts to sync.
 * NOTE: the table belongs to the catalog module, which exports no writer for it; this is the one place listings writes it.
 */
async function applyChannelContent(tx: Tx, ctx: Ctx, listingId: string, patch: ChannelContentPatch): Promise<{ changed: string[]; accountsToSync: string[] }> {
  const { vendorId, c } = ctx;
  const l = await getListingRow(tx, vendorId, listingId);
  const [ref] = await tx.select({ product: P, marketplace: A.marketplace }).from(V)
    .innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).innerJoin(A, and(eq(A.id, l.marketplaceAccountId), eq(A.vendorId, V.vendorId))).where(and(eq(V.id, l.variantId), eq(V.vendorId, vendorId)));
  const { product, marketplace } = ref!;
  const [existing] = await tx.select().from(PMD).where(and(eq(PMD.vendorId, vendorId), eq(PMD.productId, product.id), eq(PMD.marketplace, marketplace)));
  const before = existing?.data ?? {};
  const data: Record<string, unknown> = { ...before };
  const changed: string[] = [];
  const touched = new Set<ContentField>();
  for (const name of Object.keys(CONTENT_KEYS) as Array<keyof ChannelContentPatch>) {
    if (patch[name] === undefined) continue;
    const { keys, field } = CONTENT_KEYS[name];
    const next = clean(patch[name]);
    const was = keys.map((k) => before[k]).find((x) => x !== undefined);
    if (JSON.stringify(clean(was) ?? null) === JSON.stringify(next ?? null)) continue;
    for (const k of keys) delete data[k];
    if (next !== null) data[keys[0]!] = next;
    changed.push(name);
    touched.add(field);
  }
  if (changed.length === 0) return { changed, accountsToSync: [] };

  if (existing) await tx.update(PMD).set({ data, version: sql`${PMD.version} + 1` }).where(eq(PMD.id, existing.id));
  else await tx.insert(PMD).values({ vendorId, productId: product.id, marketplace, data });
  const hash = inheritedContentHash(masterContentOf(product as never), overriddenFields(data));

  const affected = await tx.select({ l: L }).from(L).innerJoin(V, and(eq(V.id, L.variantId), eq(V.vendorId, L.vendorId))).innerJoin(A, and(eq(A.id, L.marketplaceAccountId), eq(A.vendorId, L.vendorId)))
    .where(and(eq(L.vendorId, vendorId), eq(V.productId, product.id), eq(A.marketplace, marketplace), isNull(V.deletedAt)));
  const accounts = new Set<string>();
  const now = new Date();
  for (const { l: row } of affected) {
    const bump = row.id === listingId ? {} : { version: sql`${L.version} + 1` };
    if (isLive(row.status)) {
      const supports = supportsUpdate(c.connectors, marketplace);
      const state = row.contentState === 'needs_review' ? 'needs_review' : supports ? 'sync_pending' : 'needs_republish';
      await tx.update(L).set({
        contentState: state, contentHash: hash, contentChangedAt: now, contentChangedFields: unionFields(row.contentState === 'synced' ? [] : row.contentChangedFields, [...touched]),
        contentError: state === 'needs_republish' ? REPUBLISH_MESSAGE : null, ...(state === 'needs_review' ? {} : { contentReview: {} }), ...bump,
      }).where(eq(L.id, row.id));
      if (state === 'sync_pending') accounts.add(row.marketplaceAccountId);
    } else {
      const reset = row.status === 'ready' || row.status === 'approved' ? { status: 'draft' } : {};
      await tx.update(L).set({ contentHash: hash, validation: {}, approvedHash: null, approvedAt: null, approvedBy: null, ...reset, ...bump }).where(eq(L.id, row.id));
    }
  }
  await fx(tx, ctx).audit({ action: 'listing.channel_content_update', resourceType: 'listing', resourceId: listingId, before: { fields: changed }, after: { fields: changed }, metadata: { marketplace, listingsMarked: affected.map((a) => a.l.id) } });
  return { changed, accountsToSync: [...accounts] };
}

/** PATCH /listings/{id}: the existing rules of svc.updateListing plus channel content and attribute overrides, in one transaction */
export async function editListing(ctx: Ctx, id: string, input: EditInput) {
  const { attributeOverrides, title, description, bulletPoints, searchTerms, brand, ...core } = input;
  const content: ChannelContentPatch = { title, description, bulletPoints, searchTerms, brand };
  const hasContent = Object.values(content).some((v) => v !== undefined);
  return withVendor(ctx.c.database.db, ctx.vendorId, async (tx) => {
    const before = await getListingRow(tx, ctx.vendorId, id);
    const patch: svc.UpdateListingInput = { ...core };
    if (attributeOverrides) {
      if (core.attributeValues) throw new AppError('VALIDATION_FAILED', 'Send either attributeValues (replace all) or attributeOverrides (merge), not both', { details: { rule: 'attribute_patch_ambiguous' } });
      const merged: Record<string, Scalar> = { ...before.attributeValues };
      for (const [k, v] of Object.entries(attributeOverrides)) { if (v === null) delete merged[k]; else merged[k] = v; }
      patch.attributeValues = merged;
    }
    if (patch.priceMinor !== undefined || patch.mrpMinor !== undefined) {
      const [v] = await tx.select({ price: V.sellingPriceMinor, mrp: V.mrpMinor }).from(V).where(and(eq(V.id, before.variantId), eq(V.vendorId, ctx.vendorId)));
      const price = patch.priceMinor !== undefined ? patch.priceMinor : before.priceMinor;
      const mrp = patch.mrpMinor !== undefined ? patch.mrpMinor : before.mrpMinor;
      const effPrice = price ?? v?.price ?? null;
      const effMrp = mrp ?? v?.mrp ?? null;
      if (effPrice !== null && effMrp !== null && effPrice > effMrp) throw new AppError('VALIDATION_FAILED', 'The selling price cannot be higher than the MRP', { details: { rule: 'price_above_mrp', priceMinor: effPrice, mrpMinor: effMrp } });
    }
    const res = await svc.updateListing(tx, ctx, id, patch);
    const applied = hasContent ? await applyChannelContent(tx, ctx, id, content) : { changed: [], accountsToSync: [] };
    return { ...res, dto: applied.changed.length ? await svc.getListingDto(tx, ctx.vendorId, id) : res.dto, contentChanged: applied.changed, contentSyncAccounts: applied.accountsToSync };
  });
}

// ------------------------------------------------------------------------------------------------
// publish flow: validate -> approve -> publish
// ------------------------------------------------------------------------------------------------
export interface FlowStep { step: 'validate' | 'approve' | 'publish'; status: 'ok' | 'failed' | 'skipped' | 'not_run'; message: string; code: string | null; durationMs: number; details: Record<string, unknown> | null }
export interface FlowResult { listingId: string; outcome: 'queued' | 'blocked' | 'failed' | 'not_applicable'; steps: FlowStep[]; job: Awaited<ReturnType<typeof svc.requestPublish>>['job'] | null; alreadyQueued: boolean }

export async function publishFlow(ctx: Ctx, listingId: string): Promise<FlowResult> {
  const current = await withVendor(ctx.c.database.db, ctx.vendorId, (tx) => getListingRow(tx, ctx.vendorId, listingId));
  const steps: FlowStep[] = [];
  const skipRest = (from: FlowStep['step'][]) => { for (const s of from) steps.push({ step: s, status: 'not_run', message: 'Not run: an earlier step did not pass', code: null, durationMs: 0, details: null }); };
  if (isLive(current.status)) {
    steps.push({ step: 'validate', status: 'skipped', message: `The listing is already ${current.status === 'active' ? 'live' : 'under review'}`, code: null, durationMs: 0, details: null });
    skipRest(['approve', 'publish']);
    return { listingId, outcome: 'not_applicable', steps, job: null, alreadyQueued: false };
  }
  const run = async <T>(step: FlowStep['step'], fn: () => Promise<T>): Promise<{ ok: true; value: T; ms: number } | { ok: false; error: AppError; ms: number }> => {
    const t0 = Date.now();
    try { return { ok: true, value: await fn(), ms: Date.now() - t0 }; } catch (e) { if (e instanceof AppError) return { ok: false, error: e, ms: Date.now() - t0 }; throw e; }
  };
  const fail = (step: FlowStep['step'], e: AppError, ms: number, outcome: FlowResult['outcome'], rest: FlowStep['step'][]): FlowResult => {
    steps.push({ step, status: 'failed', message: e.message, code: e.code, durationMs: ms, details: (e.details as Record<string, unknown> | undefined) ?? null });
    skipRest(rest);
    return { listingId, outcome, steps, job: null, alreadyQueued: false };
  };

  // an approval that is still current needs neither a new validation nor a new approval; publishing again returns the job that is already queued
  if (current.status === 'approved') {
    const pv = await run('validate', () => svc.previewListing(ctx, listingId));
    if (pv.ok && pv.value.validation.ready && pv.value.approval.current) {
      steps.push({ step: 'validate', status: 'skipped', message: 'Already validated for the current content', code: null, durationMs: pv.ms, details: null });
      steps.push({ step: 'approve', status: 'skipped', message: 'The current content is already approved', code: null, durationMs: 0, details: null });
      const p = await run('publish', () => svc.requestPublish(ctx, listingId));
      if (!p.ok) return fail('publish', p.error, p.ms, 'failed', []);
      steps.push({ step: 'publish', status: 'ok', message: p.value.created ? 'Publishing started' : 'Publishing was already queued for this approval', code: null, durationMs: p.ms, details: { jobId: p.value.job.id } });
      return { listingId, outcome: 'queued', steps, job: p.value.job, alreadyQueued: !p.value.created };
    }
  }

  const v = await run('validate', () => svc.validateListing(ctx, listingId));
  if (!v.ok) return fail('validate', v.error, v.ms, 'failed', ['approve', 'publish']);
  if (!v.value.validation.ready) {
    const n = v.value.validation.errors.length;
    steps.push({ step: 'validate', status: 'failed', message: `${n} blocking issue${n === 1 ? '' : 's'}: ${v.value.validation.errors[0]?.message ?? ''}`, code: 'LISTING_NOT_READY', durationMs: v.ms, details: { errors: v.value.validation.errors, warnings: v.value.validation.warnings } });
    skipRest(['approve', 'publish']);
    return { listingId, outcome: 'blocked', steps, job: null, alreadyQueued: false };
  }
  steps.push({ step: 'validate', status: 'ok', message: `Valid${v.value.validation.warnings.length ? ` with ${v.value.validation.warnings.length} warning(s)` : ''}`, code: null, durationMs: v.ms, details: { warnings: v.value.validation.warnings } });

  if (v.value.listing.status === 'approved' && v.value.listing.approval.approved) steps.push({ step: 'approve', status: 'skipped', message: 'The current content is already approved', code: null, durationMs: 0, details: null });
  else {
    const a = await run('approve', () => svc.approveListing(ctx, listingId));
    if (!a.ok) return fail('approve', a.error, a.ms, 'blocked', ['publish']);
    steps.push({ step: 'approve', status: 'ok', message: 'Approved', code: null, durationMs: a.ms, details: null });
  }

  const p = await run('publish', () => svc.requestPublish(ctx, listingId));
  if (!p.ok) return fail('publish', p.error, p.ms, 'failed', []);
  steps.push({ step: 'publish', status: 'ok', message: p.value.created ? 'Publishing started' : 'Publishing was already queued for this approval', code: null, durationMs: p.ms, details: { jobId: p.value.job.id } });
  return { listingId, outcome: 'queued', steps, job: p.value.job, alreadyQueued: !p.value.created };
}

// ------------------------------------------------------------------------------------------------
// bulk actions: per-item results, partial success
// ------------------------------------------------------------------------------------------------
export const BULK_ACTIONS = ['validate', 'publish', 'unpublish', 'retry', 'sync_inventory'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
export interface BulkItem { index: number; id: string; sku: string | null; ok: boolean; status: 'done' | 'skipped' | 'failed'; outcome: string | null; message: string; jobId: string | null; error: { code: string; message: string } | null }

export async function bulkAction(ctx: Ctx, action: BulkAction, rawIds: string[]) {
  const ids = [...new Set(rawIds)];
  const rows = await withVendor(ctx.c.database.db, ctx.vendorId, (tx) => tx.select({ l: L, sku: V.sku }).from(L).innerJoin(V, and(eq(V.id, L.variantId), eq(V.vendorId, L.vendorId))).where(and(eq(L.vendorId, ctx.vendorId), inArray(L.id, ids))));
  const byId = new Map(rows.map((r) => [r.l.id, r]));
  const items: BulkItem[] = [];
  const stockTargets: Array<{ index: number; accountId: string; id: string }> = [];

  const record = (id: string, status: BulkItem['status'], message: string, extra: Partial<Pick<BulkItem, 'outcome' | 'jobId'>> & { code?: string } = {}) => {
    items.push({ index: items.length, id, sku: byId.get(id)?.sku ?? null, ok: status === 'done', status, outcome: extra.outcome ?? null, message, jobId: extra.jobId ?? null, error: status === 'failed' ? { code: extra.code ?? 'ERROR', message } : null });
  };

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) { record(id, 'failed', 'Listing not found', { code: 'NOT_FOUND' }); continue; }
    try {
      if (action === 'validate') {
        const r = await svc.validateListing(ctx, id);
        if (r.validation.ready) record(id, 'done', `Ready (${r.validation.warnings.length} warning(s))`, { outcome: 'ready' });
        else record(id, 'failed', `${r.validation.errors.length} blocking issue(s): ${r.validation.errors[0]?.message ?? ''}`, { code: 'LISTING_NOT_READY', outcome: 'blocked' });
      } else if (action === 'publish') {
        const r = await publishFlow(ctx, id);
        const failed = r.steps.find((s) => s.status === 'failed');
        if (r.outcome === 'queued') record(id, 'done', r.alreadyQueued ? 'Publishing was already queued' : 'Publishing started', { outcome: r.outcome, jobId: r.job?.id });
        else if (r.outcome === 'not_applicable') record(id, 'skipped', r.steps[0]!.message, { outcome: r.outcome });
        else record(id, 'failed', failed?.message ?? 'Could not publish', { code: failed?.code ?? 'ERROR', outcome: r.outcome });
      } else if (action === 'unpublish') {
        const r = await svc.requestUnpublish(ctx, id);
        record(id, 'done', 'Unpublish started', { jobId: r.job.id });
      } else if (action === 'retry') await retryOne(ctx, row.l, (s, m, e) => record(id, s, m, e));
      else if (row.l.status !== 'active') record(id, 'skipped', 'Only an active listing carries stock on the marketplace');
      else {
        stockTargets.push({ index: items.length, accountId: row.l.marketplaceAccountId, id });
        record(id, 'done', 'Stock sync queued');
      }
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      record(id, 'failed', e.message, { code: e.code });
    }
  }

  // stock sync: flag the listings, then one coalesced job per account
  const accounts = [...new Set(stockTargets.map((t) => t.accountId))];
  if (accounts.length) {
    await withVendor(ctx.c.database.db, ctx.vendorId, (tx) => markDirty(tx, ctx.vendorId, { listingIds: stockTargets.map((t) => t.id) }));
    for (const accountId of accounts) {
      const job = await requestInventorySync(ctx.c, ctx.vendorId, accountId, 'manual', ctx.actor.type === 'user' ? ctx.actor.id : null);
      for (const t of stockTargets.filter((x) => x.accountId === accountId)) items[t.index]!.jobId = job.job.id;
    }
  }

  const done = items.filter((i) => i.status === 'done');
  if (done.length) {
    await withVendor(ctx.c.database.db, ctx.vendorId, async (tx) => {
      const f = fx(tx, ctx);
      for (const i of done) await f.audit({ action: 'listing.bulk_action', resourceType: 'listing', resourceId: i.id, metadata: { action, total: items.length, batchId: `bulk_${ids.length}_${newId()}` } });
    });
  }
  return {
    action, summary: { total: items.length, succeeded: done.length, failed: items.filter((i) => i.status === 'failed').length, skipped: items.filter((i) => i.status === 'skipped').length },
    results: items,
  };
}

/** retry: rejected / correction required -> the publish flow again; a failed content update -> the content sync; pending -> check the marketplace */
async function retryOne(ctx: Ctx, l: svc.ListingJoin['l'], record: (s: BulkItem['status'], m: string, e?: { outcome?: string; jobId?: string }) => void): Promise<void> {
  if (l.status === 'rejected' || l.status === 'correction_required') {
    const r = await publishFlow(ctx, l.id);
    const failed = r.steps.find((s) => s.status === 'failed');
    if (r.outcome === 'queued') record('done', 'Publishing started again', { outcome: r.outcome, jobId: r.job?.id });
    else throw new AppError('LISTING_NOT_READY', failed?.message ?? 'Could not publish', { details: { rule: 'retry_blocked' } });
  } else if (isLive(l.status) && l.contentState === 'failed') {
    const out = await withVendor(ctx.c.database.db, ctx.vendorId, (tx) => requestListingContentSync(tx, ctx, l.id));
    const res = await requestContentSync(ctx.c, ctx.vendorId, out.accountId, 'manual');
    record('done', 'Content sync queued again', { jobId: res.job.id });
  } else if (l.status === 'pending') {
    const res = await svc.requestStatusRefresh(ctx, l.marketplaceAccountId, [l.id]);
    record('done', 'Status check queued', { jobId: res.job.id });
  } else record('skipped', 'Nothing to retry for this listing');
}
