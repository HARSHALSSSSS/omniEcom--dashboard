import { and, asc, eq, gt, inArray, isNull, schema, sql, withVendor, type Tx } from '@oms/database';
import { hasCapability, requireCapability, type ConnectorRegistry, type ListingInput } from '@oms/marketplace-core';
import { AppError, Errors, newId } from '@oms/shared';
import { classifyFailure, enqueueSyncJob, type SyncRunner } from '@oms/mod-sync';
import type { Container } from '@oms/module-kit';
import { assertAccount } from './channel';
import {
  CHANNEL_NAMES, MAX_LISTINGS_PER_PRODUCT, changeFields, inheritedContentHash, isLive, LIVE_STATUSES, masterContentOf, overriddenFields, unionFields,
  type ContentField, type ListingImpact, type PlanState, type ProductChange,
} from './content-domain';
import { getListingRow, loadListingContext, type ListingRow } from './context';
import { fromReport } from './domain';
import { searchMarketplaceCategories } from './mappings';
import { storedRequirements } from './service';
import { fx, type Ctx } from './ctx';

const L = schema.marketplaceListings;
const V = schema.productVariants;
const P = schema.products;
const A = schema.marketplaceAccounts;
const PMD = schema.productMarketplaceData;
const CM = schema.categoryMappings;

export type { ContentField, ListingImpact, ProductChange } from './content-domain';
export type ContentState = (typeof schema.CONTENT_STATES)[number];

export const REPUBLISH_MESSAGE = 'This marketplace cannot update a live listing through its API. Unpublish and republish the listing to apply the latest product content.';

// ------------------------------------------------------------------------------------------------
// connector registry: the exported functions of the contract take a transaction (no container), so the registry is remembered
// from the first route / consumer / job that sees the container. Callers that have a container may pass it in `opts`.
// ------------------------------------------------------------------------------------------------
let knownRegistry: ConnectorRegistry | null = null;
export const rememberConnectors = (c: Pick<Container, 'connectors'>): void => { knownRegistry = c.connectors; };

export interface ChangeOptions {
  /** where the marketplace capabilities come from (defaults to the registry of the running container) */
  connectors?: Pick<ConnectorRegistry, 'get' | 'has'>;
  /** who made the change (audit of the listings that need a human decision) */
  actor?: { type: 'user' | 'api_key' | 'system' | 'webhook'; id: string | null };
  requestId?: string;
  /** no explicit field list (an event without `fields`): compare the content hash instead and mark what differs */
  detect?: boolean;
}

export function supportsUpdate(reg: Pick<ConnectorRegistry, 'get' | 'has'>, marketplace: string): boolean {
  if (!reg.has(marketplace)) return false;
  const conn = reg.get(marketplace);
  return conn.implementation !== 'planned' && hasCapability(conn, 'listings.update');
}

// ------------------------------------------------------------------------------------------------
// loading (batched: 4 queries however many listings)
// ------------------------------------------------------------------------------------------------
type ProductRow = typeof P.$inferSelect;
interface BaseRow { l: ListingRow; sku: string; accountName: string; marketplace: string }
interface Base { product: ProductRow; rows: BaseRow[]; overrides: Map<string, ContentField[]>; mappings: Map<string, { id: string; name: string | null }> }

async function loadBase(tx: Tx, vendorId: string, productId: string, categoryIds: string[]): Promise<Base> {
  const [product] = await tx.select().from(P).where(and(eq(P.id, productId), eq(P.vendorId, vendorId), isNull(P.deletedAt)));
  if (!product) throw Errors.notFound('Product', productId);
  const rows = await tx
    .select({ l: L, sku: V.sku, accountName: A.displayName, marketplace: A.marketplace })
    .from(L)
    .innerJoin(V, and(eq(V.id, L.variantId), eq(V.vendorId, L.vendorId)))
    .innerJoin(A, and(eq(A.id, L.marketplaceAccountId), eq(A.vendorId, L.vendorId)))
    .where(and(eq(L.vendorId, vendorId), eq(V.productId, productId), isNull(V.deletedAt)))
    .orderBy(asc(L.createdAt), asc(L.id))
    .limit(MAX_LISTINGS_PER_PRODUCT + 1);
  if (rows.length > MAX_LISTINGS_PER_PRODUCT) {
    const [{ n }] = (await tx.execute<{ n: number }>(sql`select count(*)::int n from marketplace_listings l join product_variants v on v.id = l.variant_id and v.vendor_id = l.vendor_id where l.vendor_id = ${vendorId} and v.product_id = ${productId} and v.deleted_at is null`)).rows as [{ n: number }];
    throw new AppError('PAYLOAD_TOO_LARGE', `This product has ${n} listings; at most ${MAX_LISTINGS_PER_PRODUCT} can be processed in one change. Archive or delete unused listings first.`, { details: { rule: 'too_many_listings', listings: n, max: MAX_LISTINGS_PER_PRODUCT } });
  }
  const dataRows = rows.length ? await tx.select({ marketplace: PMD.marketplace, data: PMD.data }).from(PMD).where(and(eq(PMD.vendorId, vendorId), eq(PMD.productId, productId))) : [];
  const overrides = new Map(dataRows.map((d) => [d.marketplace, overriddenFields(d.data)]));
  const marketplaces = [...new Set(rows.map((r) => r.marketplace))];
  const mappings = new Map<string, { id: string; name: string | null }>();
  if (categoryIds.length && marketplaces.length) {
    const ms = await tx.select().from(CM).where(and(eq(CM.vendorId, vendorId), inArray(CM.categoryId, categoryIds), inArray(CM.marketplace, marketplaces)));
    for (const m of ms) mappings.set(`${m.marketplace}:${m.categoryId}`, { id: m.marketplaceCategoryId, name: m.marketplaceCategoryName });
  }
  return { product, rows, overrides, mappings };
}

// ------------------------------------------------------------------------------------------------
// plan: one pure pass over the loaded rows, shared by the preview (no writes) and the apply
// ------------------------------------------------------------------------------------------------
interface Write {
  state: ContentState; hash: string; fields: string[]; review: Record<string, unknown> | undefined; pinCategory: string | null; error: string | null;
  /** only adopt the hash as the baseline of a listing that had none (nothing changed, nothing to report) */
  silent?: boolean;
}
interface Planned { row: BaseRow; impact: ListingImpact; state: PlanState; write: Write | null }

const stateToPlan = (s: string): PlanState => (s === 'sync_pending' ? 'sync_pending' : s === 'needs_review' ? 'needs_review' : s === 'needs_republish' ? 'needs_republish' : 'unchanged');

function plan(base: Base, change: ProductChange, reg: Pick<ConnectorRegistry, 'get' | 'has'>, opts: ChangeOptions): Planned[] {
  const fields = changeFields(change);
  const master = masterContentOf(base.product);
  const detect = opts.detect === true && fields.length === 0;
  return base.rows.map((row): Planned => {
    const { l } = row;
    const independent = base.overrides.get(row.marketplace) ?? [];
    const inherited = fields.filter((f) => !independent.includes(f));
    const live = isLive(l.status);
    const supports = supportsUpdate(reg, row.marketplace);
    const impact: ListingImpact = {
      listingId: l.id, variantId: l.variantId, sku: row.sku, accountId: l.marketplaceAccountId, accountName: row.accountName, marketplace: row.marketplace,
      marketplaceName: CHANNEL_NAMES[row.marketplace] ?? row.accountName, listingStatus: l.status, live, supportsUpdate: supports,
      independentFields: independent, inheritedFields: inherited, effect: 'unaffected',
    };
    if (!live) return { row, impact: { ...impact, effect: 'not_live' }, state: 'not_live', write: null };

    const isCategory = inherited.includes('category');
    if (isCategory) {
      impact.effect = 'may_need_remapping';
      const toId = change.category?.toId ?? null;
      const suggestion = toId ? base.mappings.get(`${row.marketplace}:${toId}`) ?? null : null;
      impact.mappingState = suggestion ? 'mapped' : 'needs_review';
      impact.suggestedMarketplaceCategoryId = suggestion?.id ?? null;
      impact.suggestedMarketplaceCategoryName = suggestion?.name ?? null;
    } else if (inherited.length > 0) impact.effect = 'inherited';
    else if (fields.length > 0) impact.effect = 'independent';

    const newHash = inheritedContentHash(master, independent);
    if (detect) {
      // no field list: the hash says whether anything this listing inherits moved. An unknown baseline is adopted silently.
      if (l.contentHash === newHash) return { row, impact, state: stateToPlan(l.contentState), write: null };
      if (l.contentHash === null) return { row, impact, state: stateToPlan(l.contentState), write: { state: l.contentState as ContentState, hash: newHash, fields: [...l.contentChangedFields], review: undefined, pinCategory: null, error: l.contentError, silent: true } };
      impact.effect = 'inherited';
      return { row, impact, ...transition(l, supports, newHash, [], undefined, null) };
    }
    if (impact.effect === 'independent') return { row, impact, state: 'independent', write: null };
    if (impact.effect === 'unaffected') return { row, impact, state: 'unchanged', write: null };
    // idempotent: the content this listing inherits is already the one that was marked / pushed
    if (l.contentHash === newHash) return { row, impact, state: stateToPlan(l.contentState), write: null };

    let review: Record<string, unknown> | undefined;
    let pin: string | null = null;
    if (isCategory) {
      const prev = l.contentState === 'needs_review' && (l.contentReview as { reason?: string }).reason === 'category_changed' ? (l.contentReview as { fromCategoryId?: string | null }).fromCategoryId ?? null : null;
      const fromId = prev ?? change.category?.fromId ?? null;
      review = { reason: 'category_changed', fromCategoryId: fromId, toCategoryId: change.category?.toId ?? null, suggestedMarketplaceCategoryId: impact.suggestedMarketplaceCategoryId ?? null, suggestedMarketplaceCategoryName: impact.suggestedMarketplaceCategoryName ?? null };
      // a listing that followed the category mapping must keep the marketplace category it has until the seller decides
      if (!l.marketplaceCategoryId && fromId) pin = base.mappings.get(`${row.marketplace}:${fromId}`)?.id ?? null;
    }
    return { row, impact, ...transition(l, supports, newHash, inherited, review, pin, isCategory) };
  });
}

/** the state a listing moves to when its inherited content changed */
function transition(l: ListingRow, supports: boolean, hash: string, inherited: ContentField[], review: Record<string, unknown> | undefined, pin: string | null, category = false): { state: PlanState; write: Write } {
  const fields = l.contentState === 'synced' ? [...inherited] : unionFields(l.contentChangedFields, inherited);
  if (category || l.contentState === 'needs_review') {
    return { state: 'needs_review', write: { state: 'needs_review', hash, fields, review, pinCategory: pin, error: null } };
  }
  if (!supports) return { state: 'needs_republish', write: { state: 'needs_republish', hash, fields, review: undefined, pinCategory: null, error: REPUBLISH_MESSAGE } };
  return { state: 'sync_pending', write: { state: 'sync_pending', hash, fields, review: undefined, pinCategory: null, error: null } };
}

function registryFor(opts: ChangeOptions): Pick<ConnectorRegistry, 'get' | 'has'> {
  const reg = opts.connectors ?? knownRegistry;
  if (!reg) throw new AppError('INTERNAL', 'The connector registry is not available to the listings module yet (no request, event or job has run in this process)');
  return reg;
}

// ------------------------------------------------------------------------------------------------
// exports of the contract
// ------------------------------------------------------------------------------------------------
/** Read-only: what a change of the master product would do to each listing. Four batched queries, no writes. */
export async function previewProductChange(tx: Tx, vendorId: string, productId: string, change: ProductChange, opts: ChangeOptions = {}): Promise<ListingImpact[]> {
  const ids = [change.category?.toId, change.category?.fromId].filter((x): x is string => Boolean(x));
  const base = await loadBase(tx, vendorId, productId, ids);
  return plan(base, change, registryFor(opts), opts).map((p) => p.impact);
}

export interface ProductChangePlan {
  listings: Array<{ listingId: string; accountId: string; marketplace: string; marketplaceName: string; state: 'sync_pending' | 'needs_review' | 'needs_republish' | 'independent' | 'unchanged' | 'not_live' }>;
  accountsToSync: string[];
}

/**
 * Marks the listings of a product in the CALLER's transaction after the master product changed (the product row must already hold the new values):
 *   live + connector can update           -> sync_pending           live + connector cannot update -> needs_republish
 *   category changed                      -> needs_review (+ content_review, the marketplace category stays as it is)
 *   every changed field overridden        -> independent (not touched)           not live -> not_live (not touched)
 * Idempotent: the content hash of what a listing inherits is compared with `content_hash`; the same change twice marks nothing twice.
 * Call `requestContentSync` for `accountsToSync` after the transaction commits.
 */
export async function applyProductChange(tx: Tx, vendorId: string, productId: string, change: ProductChange, opts: ChangeOptions = {}): Promise<ProductChangePlan> {
  const ids = [change.category?.toId, change.category?.fromId].filter((x): x is string => Boolean(x));
  const base = await loadBase(tx, vendorId, productId, ids);
  const planned = plan(base, change, registryFor(opts), opts);
  const now = new Date();

  // writes, grouped by identical content so a product with many listings costs a handful of statements
  const groups = new Map<string, { write: Write; ids: string[] }>();
  const pins: Array<{ id: string; category: string }> = [];
  for (const p of planned) {
    if (!p.write) continue;
    const key = JSON.stringify(p.write);
    const g = groups.get(key) ?? { write: p.write, ids: [] };
    g.ids.push(p.row.l.id);
    groups.set(key, g);
    if (p.write.pinCategory) pins.push({ id: p.row.l.id, category: p.write.pinCategory });
  }
  for (const { write, ids: listingIds } of groups.values()) {
    if (write.silent) { await tx.update(L).set({ contentHash: write.hash }).where(and(eq(L.vendorId, vendorId), inArray(L.id, listingIds), isNull(L.contentHash))); continue; }
    await tx.update(L).set({
      contentState: write.state, contentHash: write.hash, contentChangedAt: now, contentChangedFields: write.fields, contentError: write.error,
      ...(write.review !== undefined ? { contentReview: write.review } : write.state === 'sync_pending' || write.state === 'needs_republish' ? { contentReview: {} } : {}),
    }).where(and(eq(L.vendorId, vendorId), inArray(L.id, listingIds)));
  }
  for (const pin of pins) await tx.update(L).set({ marketplaceCategoryId: pin.category }).where(and(eq(L.vendorId, vendorId), eq(L.id, pin.id), isNull(L.marketplaceCategoryId)));

  // states that need a person are audited, one record per listing (a single multi-row insert)
  const human = planned.filter((p) => p.write && (p.write.state === 'needs_review' || p.write.state === 'needs_republish') && p.write.state !== (p.row.l.contentState as ContentState));
  if (human.length) {
    const actor = opts.actor ?? { type: 'system' as const, id: 'listings' };
    await tx.insert(schema.auditLogs).values(human.map((p) => ({
      vendorId, actorType: actor.type, actorId: actor.id, action: p.write!.state === 'needs_review' ? 'listing.content_needs_review' : 'listing.content_needs_republish', source: actor.type === 'system' ? 'job' : 'api',
      resourceType: 'listing', resourceId: p.row.l.id, requestId: opts.requestId ?? null, before: { contentState: p.row.l.contentState },
      after: { contentState: p.write!.state, changedFields: p.write!.fields, ...(p.write!.review ? { review: p.write!.review } : {}) }, metadata: { productId, marketplace: p.row.marketplace },
    })));
  }

  const accounts = new Set<string>();
  for (const p of planned) if (p.state === 'sync_pending') accounts.add(p.row.l.marketplaceAccountId);
  return {
    listings: planned.map((p) => ({ listingId: p.row.l.id, accountId: p.row.l.marketplaceAccountId, marketplace: p.row.marketplace, marketplaceName: p.impact.marketplaceName, state: p.state })),
    accountsToSync: [...accounts],
  };
}

/** After commit: one coalesced content-sync job per account (many edits in a row share one run). Idempotent. */
export async function requestContentSync(c: Container, vendorId: string, accountId: string, trigger: 'event' | 'manual' = 'event') {
  rememberConnectors(c);
  return enqueueSyncJob(c, { vendorId, accountId, type: 'listings', trigger, coalesce: true, idempotencyKey: `content:${accountId}:${newId()}`, payload: { kind: 'content' } });
}

/** counts for the readiness panel: listings of the product by content state / status needing attention */
export async function productListingContentSummary(tx: Tx, vendorId: string, productId: string): Promise<{ total: number; needsReview: number; syncPending: number; failed: number; needsRepublish: number; rejected: number }> {
  const r = (await tx.execute<Record<string, number>>(sql`select count(*)::int total,
      (count(*) filter (where l.content_state = 'needs_review'))::int needs_review, (count(*) filter (where l.content_state = 'sync_pending'))::int sync_pending,
      (count(*) filter (where l.content_state = 'failed'))::int failed, (count(*) filter (where l.content_state = 'needs_republish'))::int needs_republish,
      (count(*) filter (where l.status in ('rejected', 'correction_required')))::int rejected
    from marketplace_listings l join product_variants v on v.id = l.variant_id and v.vendor_id = l.vendor_id
    where l.vendor_id = ${vendorId} and v.product_id = ${productId} and v.deleted_at is null`)).rows[0]!;
  const n = (k: string) => Number(r[k] ?? 0);
  return { total: n('total'), needsReview: n('needs_review'), syncPending: n('sync_pending'), failed: n('failed'), needsRepublish: n('needs_republish'), rejected: n('rejected') };
}

// ------------------------------------------------------------------------------------------------
// product.updated consumer: edits that did not go through the explicit apply (plain PATCH, CSV import, AI apply ...)
// ------------------------------------------------------------------------------------------------
export async function onProductUpdated(c: Container, vendorId: string, productId: string, payloadFields: ContentField[], hadFields: boolean): Promise<string[]> {
  rememberConnectors(c);
  // a payload that lists fields none of which is content (status, product code ...) changes nothing for listings
  if (hadFields && payloadFields.length === 0) return [];
  try {
    const out = await withVendor(c.database.db, vendorId, async (tx) => {
      const [product] = await tx.select({ categoryId: P.categoryId }).from(P).where(and(eq(P.id, productId), eq(P.vendorId, vendorId), isNull(P.deletedAt)));
      if (!product) return null;
      const change: ProductChange = { fields: payloadFields, ...(payloadFields.includes('category') ? { category: { fromId: null, toId: product.categoryId } } : {}) };
      return applyProductChange(tx, vendorId, productId, change, { connectors: c.connectors, actor: { type: 'system', id: 'listings' }, detect: !hadFields });
    });
    return out?.accountsToSync ?? [];
  } catch (e) {
    if (e instanceof AppError && e.code === 'PAYLOAD_TOO_LARGE') { c.logger.warn({ productId, vendorId }, 'product has too many listings for automatic content marking'); return []; }
    throw e;
  }
}

// ------------------------------------------------------------------------------------------------
// the content-sync runner (job type `listings`, payload { kind: 'content' }): master content -> marketplace
// ------------------------------------------------------------------------------------------------
const BATCH = 50;
const MAX_ROUNDS = 100;

export const contentSyncRunner: SyncRunner = async (ctx) => {
  const { c, vendorId, accountId, host } = ctx;
  if (!accountId) throw new AppError('BAD_REQUEST', 'content sync needs an account');
  rememberConnectors(c);
  const db = c.database.db;
    const account = await withVendor(db, vendorId, (tx) => assertAccount(tx, vendorId, accountId));
  const connector = c.connectors.get(account.marketplace);
  const stats = { synced: 0, failed: 0, needsRepublish: 0, skipped: 0 };
  const pendingWhere = and(eq(L.vendorId, vendorId), eq(L.marketplaceAccountId, accountId), eq(L.contentState, 'sync_pending'), inArray(L.status, [...LIVE_STATUSES]));

  const total = await withVendor(db, vendorId, async (tx) => Number((await tx.select({ n: sql<number>`count(*)::int` }).from(L).where(pendingWhere))[0]!.n));
  await ctx.progress({ total, done: 0, failed: 0 });

  const audit = (tx: Tx, rows: ListingRow[], action: string, state: ContentState, error: string | null) =>
    rows.length ? tx.insert(schema.auditLogs).values(rows.map((l) => ({ vendorId, actorType: 'system' as const, actorId: 'listing-content-sync', action, source: 'job', resourceType: 'listing', resourceId: l.id, requestId: null, before: { contentState: l.contentState }, after: { contentState: state, error }, metadata: { accountId, jobId: ctx.job.id } }))) : Promise.resolve();

  /** the connector cannot update live listings (any more): they need a republish, a person must act */
  if (!hasCapability(connector, 'listings.update') || connector.implementation === 'planned') {
    await ctx.log('warn', `${connector.displayName} cannot update live listings; the listings need to be republished`);
    const rows = await withVendor(db, vendorId, async (tx) => {
      const found = await tx.select().from(L).where(pendingWhere).limit(5000);
      if (found.length) {
        await tx.update(L).set({ contentState: 'needs_republish', contentError: REPUBLISH_MESSAGE }).where(and(eq(L.vendorId, vendorId), inArray(L.id, found.map((l) => l.id)), eq(L.contentState, 'sync_pending')));
        await audit(tx, found, 'listing.content_needs_republish', 'needs_republish', REPUBLISH_MESSAGE);
      }
      return found;
    });
    return { stats: { ...stats, needsRepublish: rows.length } };
  }

  const markFailed = async (l: ListingRow, code: string, message: string, extra: Partial<typeof L.$inferInsert> = {}) => {
    const text = message.slice(0, 300);
    await withVendor(db, vendorId, async (tx) => {
      const res = await tx.update(L).set({ contentState: 'failed', contentError: text, ...extra }).where(and(eq(L.id, l.id), eq(L.vendorId, vendorId), eq(L.contentState, 'sync_pending'))).returning({ id: L.id });
      if (res.length) await audit(tx, [l], 'listing.content_sync_failed', 'failed', text);
    });
    ctx.addFailure({ ref: l.externalSku, code, message: text });
    stats.failed++;
  };

  const needStatusCheck: string[] = [];
  let lastId = '00000000-0000-0000-0000-000000000000';
  let done = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const batch = await withVendor(db, vendorId, (tx) => tx.select().from(L).where(and(pendingWhere, gt(L.id, lastId))).orderBy(asc(L.id)).limit(BATCH));
    if (batch.length === 0) break;
    for (const l of batch) {
      lastId = l.id;
      try {
        const context = await withVendor(db, vendorId, (tx) => loadListingContext(tx, c, vendorId, l.id, { requirements: storedRequirements(l) }));
        const cur = context.listing;
        if (cur.contentState !== 'sync_pending' || !isLive(cur.status)) { stats.skipped++; continue; } // changed under us: another job / the seller moved it
        if (!cur.externalListingId) { await markFailed(cur, 'NO_EXTERNAL_ID', 'The listing has no marketplace id yet, so it cannot be updated'); continue; }
        const input: ListingInput & { externalListingId: string } = { ...context.input, externalListingId: cur.externalListingId };
        const result = await host.run(vendorId, accountId, async (conn, cctx) => {
          requireCapability(conn, 'listings.update');
          return conn.updateListing!(cctx, input);
        });
        const status = fromReport(result.status);
        const errors = result.issues.filter((i) => i.severity === 'error');
        const became = { status, externalStatus: result.marketplaceStatus, issues: result.issues, externalListingId: result.externalListingId || cur.externalListingId, lastErrorCode: errors[0]?.code ?? null, lastPolledAt: new Date() };
        if (status === 'rejected' || status === 'correction_required' || errors.length > 0) {
          await markFailed(cur, errors[0]?.code ?? status, errors[0]?.message ?? `The marketplace answered: ${result.marketplaceStatus}`, became);
          continue;
        }
        const outcome = await withVendor(db, vendorId, async (tx) => {
          const now = new Date();
          await tx.update(L).set({ ...became, syncHash: context.hash, payload: { ...context.input, imageUrls: undefined, imageKeys: context.imageKeys }, ...(status === 'active' && cur.status !== 'active' ? { quantityDirty: true, quantityDirtyAt: now } : {}) }).where(eq(L.id, cur.id));
          // only the content this push was built from may be recorded as synced: a newer edit moved content_hash and stays pending
          return tx.update(L).set({ contentState: 'synced', contentHash: context.inheritedHash, contentSyncedAt: now, contentError: null, contentChangedFields: [], contentReview: {} })
            .where(and(eq(L.id, cur.id), eq(L.vendorId, vendorId), eq(L.contentState, 'sync_pending'), sql`(${L.contentHash} IS NULL OR ${L.contentHash} = ${context.inheritedHash})`)).returning({ id: L.id });
        });
        if (outcome.length) stats.synced++; else stats.skipped++;
        if (status === 'pending') needStatusCheck.push(cur.id);
      } catch (e) {
        const f = classifyFailure(e);
        const systemic = f.retryable || (e instanceof AppError && (['ACCOUNT_NOT_CONNECTED', 'CAPABILITY_UNSUPPORTED', 'RATE_LIMITED'].includes(e.code) || (e.code === 'UPSTREAM_ERROR' && (e.details as { kind?: string } | undefined)?.kind === 'auth')));
        // a transient problem: keep the listings pending and let the engine retry the job with backoff (what is done stays done)
        if (f.retryable && !ctx.isLastAttempt) throw e;
        await markFailed(l, f.code, f.message);
        if (!systemic) continue;
        // the account itself cannot be reached (auth, outage after the last attempt): do not call the marketplace for each remaining listing
        const rest = await withVendor(db, vendorId, async (tx) => {
          const found = await tx.select().from(L).where(pendingWhere).limit(5000);
          if (found.length) {
            await tx.update(L).set({ contentState: 'failed', contentError: f.message.slice(0, 300) }).where(and(eq(L.vendorId, vendorId), inArray(L.id, found.map((x) => x.id)), eq(L.contentState, 'sync_pending')));
            await audit(tx, found, 'listing.content_sync_failed', 'failed', f.message.slice(0, 300));
          }
          return found.length;
        });
        stats.failed += rest;
        throw e;
      }
      done++;
      if (done % 10 === 0) await ctx.progress({ done, failed: stats.failed });
    }
  }
  await ctx.progress({ done: stats.synced + stats.failed + stats.skipped, failed: stats.failed });
  if (needStatusCheck.length) {
    await enqueueSyncJob(c, { vendorId, accountId, type: 'listing_status', trigger: 'event', coalesce: true, idempotencyKey: `listing-status:${accountId}:content-${Date.now()}`, payload: { listingIds: needStatusCheck } });
  }
  return { stats };
};

// ------------------------------------------------------------------------------------------------
// endpoints: retry / force a content sync, resolve a review
// ------------------------------------------------------------------------------------------------
const stateError = (message: string, rule: string, extra: Record<string, unknown> = {}) => new AppError('INVALID_STATE', message, { details: { rule, ...extra } });

/** `POST /listings/{id}/content-sync`: retry a failed listing, force a pending one. Returns what to enqueue after the commit. */
export async function requestListingContentSync(tx: Tx, ctx: Ctx, listingId: string): Promise<{ listing: ListingRow; accountId: string }> {
  const { vendorId, c } = ctx;
  rememberConnectors(c);
  const l = await getListingRow(tx, vendorId, listingId);
  if (!isLive(l.status)) throw stateError(`A ${l.status} listing is not live; publish it to send the latest content`, 'not_live', { status: l.status });
  if (l.contentState === 'needs_review') throw stateError('Resolve the category review first', 'needs_review');
  if (l.contentState === 'synced') throw stateError('This listing already shows the current product content', 'nothing_to_sync');
  const [acc] = await tx.select().from(A).where(and(eq(A.id, l.marketplaceAccountId), eq(A.vendorId, vendorId)));
  if (!acc || !supportsUpdate(c.connectors, acc.marketplace)) throw stateError(REPUBLISH_MESSAGE, 'update_not_supported', { marketplace: acc?.marketplace });
  const context = await loadListingContext(tx, c, vendorId, listingId, { signImages: false, requirements: storedRequirements(l) });
  const f = fx(tx, ctx);
  if (l.contentState !== 'sync_pending') {
    await tx.update(L).set({ contentState: 'sync_pending', contentError: null, contentHash: context.inheritedHash, contentChangedAt: new Date() }).where(eq(L.id, l.id));
    await f.audit({ action: 'listing.content_sync_requested', resourceType: 'listing', resourceId: l.id, before: { contentState: l.contentState, contentError: l.contentError }, after: { contentState: 'sync_pending' } });
  }
  return { listing: await getListingRow(tx, vendorId, listingId), accountId: l.marketplaceAccountId };
}

export type ReviewAction = { action: 'accept_mapping' } | { action: 'keep_current' } | { action: 'set_category'; marketplaceCategoryId: string };

/**
 * `POST /listings/{id}/content-review/resolve`. accept_mapping: take the suggested marketplace category and push; keep_current: keep the
 * marketplace category the listing has (pushing only other pending changes); set_category: use another category of the marketplace tree.
 * The marketplace category tree is read from the marketplace BEFORE the transaction (never a network call inside it): pass the result in `known`.
 */
export async function resolveContentReview(tx: Tx, ctx: Ctx, listingId: string, body: ReviewAction, known?: { categoryId: string; name: string }): Promise<{ listing: ListingRow; syncQueued: boolean }> {
  const { vendorId, c } = ctx;
  const l = await getListingRow(tx, vendorId, listingId);
  if (l.contentState !== 'needs_review') throw stateError('This listing has no pending content review', 'not_in_review', { contentState: l.contentState });
  if (!isLive(l.status)) throw stateError(`A ${l.status} listing is not live; publish it again instead`, 'not_live', { status: l.status });
  const review = l.contentReview as { suggestedMarketplaceCategoryId?: string | null };
  const [acc] = await tx.select().from(A).where(and(eq(A.id, l.marketplaceAccountId), eq(A.vendorId, vendorId)));
  const supports = Boolean(acc) && supportsUpdate(c.connectors, acc!.marketplace);
  const others = l.contentChangedFields.filter((x) => x !== 'category');
  const set: Partial<typeof L.$inferInsert> = { contentReview: {}, contentError: null, contentChangedAt: new Date(), version: sql`${L.version} + 1` as never };
  let nextState: ContentState;
  let chosen: string | null = null;
  if (body.action === 'keep_current') {
    set.contentChangedFields = others;
    nextState = others.length === 0 ? 'synced' : supports ? 'sync_pending' : 'needs_republish';
    if (nextState === 'synced') set.contentSyncedAt = new Date();
  } else {
    chosen = body.action === 'accept_mapping' ? review.suggestedMarketplaceCategoryId ?? null : body.marketplaceCategoryId;
    if (!chosen) throw new AppError('VALIDATION_FAILED', 'There is no suggested marketplace category for this listing; choose one with action set_category', { details: { rule: 'no_suggestion' } });
    if (body.action === 'set_category' && known?.categoryId !== chosen) throw new AppError('VALIDATION_FAILED', 'That category does not exist in the marketplace category tree', { details: { rule: 'unknown_marketplace_category', marketplaceCategoryId: chosen } });
    set.marketplaceCategoryId = chosen;
    set.contentChangedFields = unionFields(l.contentChangedFields, ['category']);
    nextState = supports ? 'sync_pending' : 'needs_republish';
    if (nextState === 'needs_republish') set.contentError = REPUBLISH_MESSAGE;
  }
  set.contentState = nextState;
  if (nextState === 'sync_pending') {
    const context = await loadListingContext(tx, c, vendorId, listingId, { signImages: false, requirements: storedRequirements(l) });
    set.contentHash = context.inheritedHash;
  }
  await tx.update(L).set(set).where(eq(L.id, l.id));
  await fx(tx, ctx).audit({
    action: 'listing.content_review_resolved', resourceType: 'listing', resourceId: l.id,
    before: { contentState: l.contentState, marketplaceCategoryId: l.marketplaceCategoryId, review: l.contentReview }, after: { contentState: nextState, marketplaceCategoryId: chosen ?? l.marketplaceCategoryId }, metadata: { action: body.action },
  });
  return { listing: await getListingRow(tx, vendorId, listingId), syncQueued: nextState === 'sync_pending' };
}

/** validates a marketplace category id against the marketplace's tree (network read, outside any transaction) */
export async function lookupMarketplaceCategory(c: Container, vendorId: string, accountId: string, id: string): Promise<{ categoryId: string; name: string } | undefined> {
  const exact = (await searchMarketplaceCategories(c, vendorId, accountId)).find((x) => x.id === id);
  if (exact) return { categoryId: exact.id, name: exact.name };
  const byId = (await searchMarketplaceCategories(c, vendorId, accountId, id)).find((x) => x.id === id);
  return byId ? { categoryId: byId.id, name: byId.name } : undefined;
}

// ------------------------------------------------------------------------------------------------
// per-product view for "View affected listings"
// ------------------------------------------------------------------------------------------------
export async function productListingContent(tx: Tx, vendorId: string, productId: string) {
  const [prod] = await tx.select({ id: P.id }).from(P).where(and(eq(P.id, productId), eq(P.vendorId, vendorId)));
  if (!prod) throw Errors.notFound('Product', productId);
  const rows = await tx
    .select({ l: L, sku: V.sku, accountName: A.displayName, marketplace: A.marketplace })
    .from(L)
    .innerJoin(V, and(eq(V.id, L.variantId), eq(V.vendorId, L.vendorId)))
    .innerJoin(A, and(eq(A.id, L.marketplaceAccountId), eq(A.vendorId, L.vendorId)))
    .where(and(eq(L.vendorId, vendorId), eq(V.productId, productId), isNull(V.deletedAt)))
    .orderBy(asc(L.createdAt), asc(L.id))
    .limit(MAX_LISTINGS_PER_PRODUCT);
  const summary = await productListingContentSummary(tx, vendorId, productId);
  return {
    productId, summary,
    listings: rows.map((r) => ({
      listingId: r.l.id, variantId: r.l.variantId, sku: r.sku, accountId: r.l.marketplaceAccountId, accountName: r.accountName, marketplace: r.marketplace, marketplaceName: CHANNEL_NAMES[r.marketplace] ?? r.accountName,
      status: r.l.status, live: isLive(r.l.status), contentState: r.l.contentState as ContentState, contentChangedFields: r.l.contentChangedFields, contentReview: r.l.contentReview, contentError: r.l.contentError,
      contentChangedAt: r.l.contentChangedAt ? r.l.contentChangedAt.toISOString() : null, contentSyncedAt: r.l.contentSyncedAt ? r.l.contentSyncedAt.toISOString() : null, marketplaceCategoryId: r.l.marketplaceCategoryId,
    })),
  };
}
