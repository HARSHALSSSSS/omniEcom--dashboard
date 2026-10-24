import { and, desc, eq, inArray, isNull, or, schema, sql, withVendor, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import type { Ctx } from './ctx';
import { evaluate, joined } from './service';
import { enrichListings, marketplaceNameOf, notListedCounts, type LiveValidation } from './workspace-data';
import {
  PUBLISHABLE_STATUSES, channelsOf, cohortOf, healthOf, isPublishable, journeyOf, orderHealth, pickJourneyListing, spectrumOf, suggestionsOf, syncStateOf, syncStepsOf, SPECTRUM,
  type AuditListing, type JobFacts, type SpectrumState,
} from './audit-domain';
import { complianceChecks, loadProductFacts, qualityScores, variantChecks } from './audit-quality';
import { activePolicyFacts, pricingRuleOf, PUBLISH_LOCK, syncModeOf, type ConnectorSyncFacts } from './audit-prep';

const L = schema.marketplaceListings;
const V = schema.productVariants;
const P = schema.products;
const A = schema.marketplaceAccounts;
const J = schema.syncJobs;

/** at most this many listings are evaluated per call (newest first); the response says when the catalogue is larger */
export const AUDIT_CAP = 1000;
const CHUNK = 100;
/** the publish screen hands the ids to POST /listings/bulk-publish, 100 per call */
export const READY_IDS_CAP = 500;

const listableMarketplaces = (ctx: Ctx): string[] => ctx.c.connectors.supporting((x) => x.implementation !== 'planned' && x.capabilities.listings.create).map((x) => x.code);

interface Loaded { listings: AuditListing[]; total: number; truncated: boolean }

/** at most this many never-validated listings are validated live per call (the rest are still validated again when published) */
export const LIVE_VALIDATION_CAP = 100;

/**
 * "Ready" has to mean "can be published". A listing nobody validated yet has no stored validation, so its readiness could not see a
 * missing required attribute that the publish flow then refuses. This runs the very validation the publish flow runs (no write, the
 * category requirements are cached) for the never-validated publishable listings, newest first, and hands the outcome to the readiness.
 * Called before the read transaction opens: it uses its own connections.
 */
export async function liveValidations(ctx: Ctx): Promise<Map<string, LiveValidation>> {
  const ids = await withVendor(ctx.c.database.db, ctx.vendorId, async (tx) => (await tx.select({ id: L.id }).from(L)
    .innerJoin(V, and(eq(V.id, L.variantId), eq(V.vendorId, L.vendorId))).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId)))
    .where(and(eq(L.vendorId, ctx.vendorId), isNull(V.deletedAt), isNull(P.deletedAt), inArray(L.status, [...PUBLISHABLE_STATUSES]), sql`not (${L.validation} ? 'validatedAt')`))
    .orderBy(desc(L.updatedAt), desc(L.id)).limit(LIVE_VALIDATION_CAP)).map((r) => r.id));
  const out = new Map<string, LiveValidation>();
  for (const id of ids) {
    try {
      const ev = await evaluate(ctx, id, { signImages: false });
      out.set(id, { errors: ev.result.errors, warnings: ev.result.warnings, requiredAttributes: ev.requirements.filter((r) => r.required).length });
    } catch (e) {
      if (!(e instanceof AppError)) throw e; // a listing that cannot be evaluated keeps its stored readiness
    }
  }
  return out;
}

/** every listing (newest first, capped) with the stored readiness the Listings table shows: a fixed number of queries per chunk, no marketplace call */
async function loadListings(ctx: Ctx, tx: Tx, liveChecks?: Map<string, LiveValidation>): Promise<Loaded> {
  const live = and(isNull(V.deletedAt), isNull(P.deletedAt));
  const total = Number((await tx.select({ n: sql<number>`count(*)::int` }).from(L)
    .innerJoin(V, and(eq(V.id, L.variantId), eq(V.vendorId, L.vendorId))).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId)))
    .where(and(eq(L.vendorId, ctx.vendorId), live)))[0]!.n);
  const rows = await joined(tx, ctx.vendorId, live, { limit: AUDIT_CAP, order: [desc(L.updatedAt), desc(L.id)] });
  const out: AuditListing[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const blocks = await enrichListings(tx, ctx.c, ctx.vendorId, chunk, liveChecks);
    for (const r of chunk) {
      const b = blocks.get(r.l.id);
      if (!b) continue;
      const v = r.l.validation as { validatedAt?: string; errors?: Array<{ code?: string; attribute?: string }> };
      const errors = v.validatedAt ? (v.errors ?? []) : (liveChecks?.get(r.l.id)?.errors ?? []);
      const missing = v.validatedAt || liveChecks?.has(r.l.id) ? [...new Set(errors.filter((e) => e.code === 'attribute_missing' && e.attribute).map((e) => e.attribute!))] : [];
      out.push({
        id: r.l.id, productId: r.productId, variantId: r.l.variantId, sku: r.sku, productTitle: r.productTitle, marketplace: r.marketplace, marketplaceName: b.marketplaceName, accountName: b.accountName, accountId: r.l.marketplaceAccountId,
        status: r.l.status, screenStatus: b.screenStatus, marketplaceCategoryId: r.l.marketplaceCategoryId, marketplaceCategoryName: b.marketplaceCategoryName,
        attributeValues: r.l.attributeValues, missingAttributes: missing, readiness: b.readinessFull, priceMinor: b.priceMinor, mrpMinor: b.mrpMinor,
      });
    }
  }
  return { listings: out, total, truncated: total > rows.length };
}

// ------------------------------------------------------------------------------------------------
// readiness audit
// ------------------------------------------------------------------------------------------------
async function coverage(ctx: Ctx, tx: Tx) {
  const vendorId = ctx.vendorId;
  const totalProducts = Number((await tx.select({ n: sql<number>`count(*)::int` }).from(P).where(and(eq(P.vendorId, vendorId), isNull(P.deletedAt), eq(P.status, 'active'))))[0]!.n);
  const listed = (await tx.execute<{ m: string; n: number }>(sql`select a.marketplace m, count(distinct v.product_id)::int n
    from marketplace_listings l join product_variants v on v.id = l.variant_id and v.vendor_id = l.vendor_id join products p on p.id = v.product_id and p.vendor_id = v.vendor_id
    join marketplace_accounts a on a.id = l.marketplace_account_id and a.vendor_id = l.vendor_id
    where l.vendor_id = ${vendorId} and l.status = 'active' and v.deleted_at is null and p.deleted_at is null and p.status = 'active' group by a.marketplace`)).rows;
  const accounts = await tx.select({ marketplace: A.marketplace }).from(A).where(and(eq(A.vendorId, vendorId), eq(A.status, 'active')));
  const markets = [...new Set([...accounts.map((a) => a.marketplace), ...listed.map((r) => r.m)])].sort();
  return markets.map((m) => {
    const active = Number(listed.find((r) => r.m === m)?.n ?? 0);
    return { marketplace: m, name: marketplaceNameOf(ctx.c.connectors, m), activeProducts: active, totalProducts, percent: totalProducts ? Math.min(100, Math.round((100 * active) / totalProducts)) : 0 };
  });
}

/** distinct products that could still be listed on at least one connected account */
async function unlistedProducts(ctx: Ctx, tx: Tx): Promise<number> {
  const markets = listableMarketplaces(ctx);
  if (!markets.length) return 0;
  const rows = await tx.execute<{ n: number }>(sql`select count(distinct v.product_id)::int n from product_variants v
    join products p on p.id = v.product_id and p.vendor_id = v.vendor_id join marketplace_accounts a on a.vendor_id = v.vendor_id
    where v.vendor_id = ${ctx.vendorId} and v.deleted_at is null and p.deleted_at is null and p.status = 'active' and v.status = 'active' and a.status = 'active'
    and a.marketplace in (${sql.join(markets.map((m) => sql`${m}`), sql`, `)})
    and not exists (select 1 from marketplace_listings l where l.vendor_id = v.vendor_id and l.marketplace_account_id = a.id and l.variant_id = v.id)`);
  return Number(rows.rows[0]!.n);
}

/** the Variants and Compliance bars: scored from the master catalogue of every evaluated listing's product */
async function catalogueHealth(tx: Tx, vendorId: string, listings: AuditListing[]) {
  const facts = await loadProductFacts(tx, vendorId, listings.map((l) => l.productId));
  const perListing = listings.flatMap((l) => {
    const p = facts.get(l.productId);
    if (!p) return [];
    return [{
      variants: variantChecks(p, l.accountId),
      compliance: complianceChecks(p, { accountId: l.accountId, variantId: l.variantId, priceMinor: l.priceMinor ?? null, mrpMinor: l.mrpMinor ?? null, attributesChecked: l.readiness.attributesChecked, missingAttributes: l.missingAttributes }),
      attributesChecked: l.readiness.attributesChecked,
    }];
  });
  return qualityScores(perListing);
}

export async function readinessAudit(ctx: Ctx, tx: Tx, live?: Map<string, LiveValidation>) {
  const { listings, total, truncated } = await loadListings(ctx, tx, live);
  const cohort = listings.filter((l) => isPublishable(l.status));
  const ready = cohort.filter((l) => l.readiness.ready);
  const notListed = (await notListedCounts(tx, ctx.vendorId, listableMarketplaces(ctx), {})).reduce((a, r) => a + r.n, 0);
  const spectrum = Object.fromEntries(SPECTRUM.map((s) => [s, 0])) as Record<SpectrumState, number>;
  for (const l of listings) spectrum[spectrumOf(l.screenStatus)] += 1;
  spectrum.not_listed = notListed;

  const sample = pickJourneyListing(listings);
  const suggestions = suggestionsOf(listings, cohort);
  return {
    generatedAt: new Date().toISOString(),
    listingsEvaluated: listings.length, totalListings: total, truncated,
    overall: { readinessPct: cohort.length ? Math.round((100 * ready.length) / cohort.length) : null, readyListings: ready.length, cohortListings: cohort.length, readyProducts: new Set(ready.map((l) => l.productId)).size },
    spectrum,
    health: orderHealth([...healthOf(listings.map((l) => l.readiness)), ...(await catalogueHealth(tx, ctx.vendorId, listings))]),
    coverage: await coverage(ctx, tx),
    unlistedProducts: await unlistedProducts(ctx, tx),
    journey: sample ? {
      listingId: sample.id, productTitle: sample.productTitle, sku: sample.sku, marketplace: sample.marketplace, marketplaceName: sample.marketplaceName, accountName: sample.accountName,
      screenStatus: sample.screenStatus, steps: journeyOf(sample),
    } : null,
    suggestions,
  };
}

// ------------------------------------------------------------------------------------------------
// publishing preparation
// ------------------------------------------------------------------------------------------------
export async function publishingPreparation(ctx: Ctx, tx: Tx, live?: Map<string, LiveValidation>) {
  const { listings, truncated, total } = await loadListings(ctx, tx, live);
  const candidates = listings.filter((l) => isPublishable(l.status));
  const cohort = cohortOf(candidates);
  const accounts = (await tx.select({ id: A.id, name: A.displayName, marketplace: A.marketplace, status: A.status }).from(A).where(eq(A.vendorId, ctx.vendorId))).sort((a, b) => a.name.localeCompare(b.name));
  const policies = await activePolicyFacts(tx, ctx.vendorId);
  return {
    generatedAt: new Date().toISOString(),
    listingsEvaluated: listings.length, totalListings: total, truncated,
    candidateListings: candidates.length,
    readyListings: cohort.readyListings.length, blockedListings: cohort.blockedListings.length,
    readyProducts: cohort.readyProducts, readyVariants: cohort.readyVariants, potentialIssueProducts: cohort.issueProducts, unvalidatedListings: cohort.unvalidated,
    readyListingIds: cohort.readyListings.slice(0, READY_IDS_CAP).map((l) => l.id), readyIdsTruncated: cohort.readyListings.length > READY_IDS_CAP,
    issues: cohort.issues, issuesTotal: cohort.issuesTotal,
    channels: channelsOf(candidates, accounts, (m) => marketplaceNameOf(ctx.c.connectors, m)).map((ch) => ({
      ...ch,
      pricingRule: pricingRuleOf(policies, ch.accounts.map((a) => a.id)),
      sync: syncModeOf(connectorSyncFacts(ctx, ch.marketplace)),
    })),
    publishLock: { locked: [...PUBLISH_LOCK.locked], notLocked: [...PUBLISH_LOCK.notLocked], statement: PUBLISH_LOCK.statement },
  };
}

function connectorSyncFacts(ctx: Ctx, marketplace: string): ConnectorSyncFacts | null {
  if (!ctx.c.connectors.has(marketplace)) return null;
  const cn = ctx.c.connectors.get(marketplace);
  const cap = cn.capabilities;
  return {
    ordersWebhook: cap.orders.webhook, returnsWebhook: cap.returns.webhook, inventoryPush: cap.inventory.push, pricingPush: cap.pricing.push, listingUpdate: cap.listings.update,
    ordersPollSeconds: cn.polling?.orders?.intervalSeconds ?? null, listingStatusPollSeconds: cn.polling?.listingStatus?.intervalSeconds ?? null,
  };
}

// ------------------------------------------------------------------------------------------------
// sync telemetry of one listing
// ------------------------------------------------------------------------------------------------
const facts = (j: typeof J.$inferSelect | undefined): JobFacts | null =>
  j ? { id: j.id, type: j.type, status: j.status, progress: j.progress, startedAt: j.startedAt, scheduledAt: j.scheduledAt, finishedAt: j.finishedAt, error: j.error } : null;

export async function syncTelemetry(ctx: Ctx, tx: Tx, listingId: string) {
  const [row] = await joined(tx, ctx.vendorId, eq(L.id, listingId));
  if (!row) throw Errors.notFound('Listing', listingId);
  const l = row.l;
  const block = (await enrichListings(tx, ctx.c, ctx.vendorId, [row])).get(listingId)!;
  const jobs = await tx.select().from(J).where(and(
    eq(J.vendorId, ctx.vendorId),
    or(and(eq(J.type, 'listing_publish'), sql`${J.payload} ->> 'listingId' = ${listingId}`), and(eq(J.marketplaceAccountId, l.marketplaceAccountId), inArray(J.type, ['listings', 'inventory', 'listing_status']))),
  )).orderBy(desc(J.createdAt), desc(J.id)).limit(30);
  const newest = (type: string) => jobs.find((j) => j.type === type);
  const steps = syncStepsOf({
    status: l.status, contentState: l.contentState, contentError: l.contentError, contentSyncedAt: l.contentSyncedAt,
    quantityDirty: l.quantityDirty, sellableQuantity: l.sellableQuantity, pushedQuantity: l.pushedQuantity, quantityPushedAt: l.quantityPushedAt, publishedAt: l.publishedAt, issueCount: l.issues.length,
    publishJob: facts(newest('listing_publish')), contentJob: facts(newest('listings')), inventoryJob: facts(newest('inventory')), statusJob: facts(newest('listing_status')),
  });
  const running = steps.filter((s) => s.status === 'in_progress' && s.at).map((s) => s.at!).sort();
  const [variants] = await tx.select({ n: sql<number>`count(*)::int` }).from(V).where(and(eq(V.vendorId, ctx.vendorId), eq(V.productId, row.productId), isNull(V.deletedAt)));
  return {
    listingId, generatedAt: new Date().toISOString(),
    listing: {
      id: l.id, productId: row.productId, productTitle: row.productTitle, sku: row.sku, variantsCount: Number(variants?.n ?? 1), marketplace: row.marketplace, marketplaceName: block.marketplaceName, accountName: block.accountName,
      status: l.status, screenStatus: block.screenStatus, externalListingId: l.externalListingId,
    },
    state: syncStateOf(steps, l.status),
    startedAt: running[0] ?? null, lastSyncedAt: block.lastSyncAt,
    steps,
    jobs: jobs.slice(0, 8).map((j) => ({ id: j.id, type: j.type, status: j.status, scheduledAt: j.scheduledAt.toISOString(), startedAt: j.startedAt ? j.startedAt.toISOString() : null, finishedAt: j.finishedAt ? j.finishedAt.toISOString() : null, attempts: j.attempts, maxAttempts: j.maxAttempts, progress: j.progress, error: j.error })),
  };
}
