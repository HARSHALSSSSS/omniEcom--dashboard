import { and, asc, eq, escapeLike, inArray, isNull, or, schema, sql, type SQL, type Tx } from '@oms/database';
import type { ConnectorRegistry, ListingRequirement } from '@oms/marketplace-core';
import { availabilityFor } from '@oms/mod-inventory';
import type { Container } from '@oms/module-kit';
import { CHANNEL_NAMES } from './content-domain';
import { computeSellable, DEFAULT_POLICY, type ChannelPolicy } from './domain';
import type { ListingJoin } from './service';
import { buildReadiness, externalListingUrl, screenStatusOf, SCREEN_STATUS_SQL, SCREEN_STATUSES, type Readiness, type ReadinessFacts, type ScreenStatus } from './workspace-domain';

const V = schema.productVariants;
const P = schema.products;
const A = schema.marketplaceAccounts;
const POLICY = schema.channelInventoryPolicies;
const CM = schema.categoryMappings;
const MP = schema.marketplacePrices;
const DOC = schema.productDocuments;

export const marketplaceNameOf = (reg: Pick<ConnectorRegistry, 'get' | 'has'>, code: string): string => (reg.has(code) ? reg.get(code).displayName : CHANNEL_NAMES[code] ?? code);

// ------------------------------------------------------------------------------------------------
// the table block: everything the Listings screen shows besides the listing itself
// ------------------------------------------------------------------------------------------------
export interface TableBlock {
  screenStatus: ScreenStatus; barcode: string | null; thumbnailUrl: string | null; imageCount: number;
  categoryName: string | null; marketplaceName: string; accountName: string; marketplaceCategoryName: string | null;
  priceMinor: number | null; mrpMinor: number | null; salePriceMinor: number | null; saleEndsAt: string | null;
  stock: { available: number; sellable: number; pushed: number | null; dirty: boolean };
  readiness: { percent: number; ready: boolean; topBlocker: { message: string; field: string | null } | null; errors: number; warnings: number; attributesChecked: boolean };
  externalListingId: string | null; externalUrl: string | null; lastSyncAt: string | null;
}

export const asPolicy = (p: typeof POLICY.$inferSelect | undefined): ChannelPolicy => (p ? { mode: p.mode as ChannelPolicy['mode'], safetyBuffer: p.safetyBuffer, allocationPercent: p.allocationPercent, maxQuantity: p.maxQuantity } : DEFAULT_POLICY);
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const unique = <T>(xs: T[]): T[] => [...new Set(xs)];

/** facts the readiness of a listing is built from when the marketplace is NOT asked (the table): the stored validation stands in for the live one */
export function storedFacts(
  l: ListingJoin['l'], x: { title: string; description: string | null; brand: string | null; barcode: string | null; imageCount: number; primaryImage: ReadinessFacts['primaryImage']; priceMinor: number | null; mrpMinor: number | null; categoryId: string | null; categoryRequired: boolean; available: number; sellable: number },
): ReadinessFacts {
  const v = l.validation as { validatedAt?: string; errors?: ReadinessFacts['validation']['errors']; warnings?: ReadinessFacts['validation']['warnings']; requirements?: ListingRequirement[] };
  const validated = Boolean(v.validatedAt);
  return {
    title: x.title, description: x.description, brand: x.brand, barcode: x.barcode, imageCount: x.imageCount, primaryImage: x.primaryImage, priceMinor: x.priceMinor, mrpMinor: x.mrpMinor,
    marketplaceCategoryId: x.categoryId, categoryRequired: x.categoryRequired, available: x.available, sellable: x.sellable,
    validation: { validated, errors: validated ? v.errors ?? [] : [], warnings: validated ? v.warnings ?? [] : [], requiredAttributes: Array.isArray(v.requirements) ? v.requirements.filter((r) => r.required).length : null },
    marketplaceIssues: l.issues,
  };
}

const lastSync = (l: ListingJoin['l']): Date | null => {
  const ts = [l.lastPolledAt, l.quantityPushedAt, l.contentSyncedAt, l.publishedAt, l.lastSyncedAt].filter((d): d is Date => d instanceof Date);
  return ts.length ? new Date(Math.max(...ts.map((d) => d.getTime()))) : null;
};

/** Batched (a fixed number of queries however many rows): variants, accounts, policies, stock, images, categories, sales. */
export async function enrichListings(tx: Tx, c: Pick<Container, 'storage' | 'connectors'>, vendorId: string, rows: ListingJoin[]): Promise<Map<string, TableBlock & { readinessFull: Readiness }>> {
  const out = new Map<string, TableBlock & { readinessFull: Readiness }>();
  if (rows.length === 0) return out;
  const variantIds = unique(rows.map((r) => r.l.variantId));
  const productIds = unique(rows.map((r) => r.productId));
  const accountIds = unique(rows.map((r) => r.l.marketplaceAccountId));
  const markets = unique(rows.map((r) => r.marketplace));

  const variants = new Map((await tx.select({ id: V.id, barcode: V.barcode, productId: P.id, description: P.description, brand: P.brand, categoryId: P.categoryId })
    .from(V).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).where(and(eq(V.vendorId, vendorId), inArray(V.id, variantIds)))).map((r) => [r.id, r]));
  const accounts = new Map((await tx.select({ id: A.id, displayName: A.displayName, mode: A.mode }).from(A).where(and(eq(A.vendorId, vendorId), inArray(A.id, accountIds)))).map((r) => [r.id, r]));
  const policies = new Map((await tx.select().from(POLICY).where(and(eq(POLICY.vendorId, vendorId), inArray(POLICY.marketplaceAccountId, accountIds)))).map((p) => [p.marketplaceAccountId, p]));

  // central stock as each channel sees it (the policy decides which warehouses feed it)
  const available = new Map<string, number>();
  for (const accountId of accountIds) {
    const policy = policies.get(accountId);
    const vids = unique(rows.filter((r) => r.l.marketplaceAccountId === accountId).map((r) => r.l.variantId));
    const av = await availabilityFor(tx, vendorId, vids, policy?.warehouseIds?.length ? policy.warehouseIds : undefined);
    for (const [vid, a] of av) available.set(`${accountId}:${vid}`, a.available);
  }

  // images: count, primary (dimensions) and a signed thumbnail
  const docs = await tx.select({ productId: DOC.productId, storageKey: DOC.storageKey, width: DOC.width, height: DOC.height, isPrimary: DOC.isPrimary })
    .from(DOC).where(and(eq(DOC.vendorId, vendorId), inArray(DOC.productId, productIds), eq(DOC.kind, 'image'), isNull(DOC.deletedAt), inArray(DOC.status, ['uploaded', 'processed'])))
    .orderBy(sql`${DOC.isPrimary} desc`, asc(DOC.sortOrder), asc(DOC.createdAt));
  const imagesOf = new Map<string, typeof docs>();
  for (const d of docs) imagesOf.set(d.productId, [...(imagesOf.get(d.productId) ?? []), d]);
  const thumbs = new Map<string, string | null>();
  for (const [pid, list] of imagesOf) {
    try { thumbs.set(pid, await c.storage.presignDownload(list[0]!.storageKey, 3600)); } catch { thumbs.set(pid, null); }
  }

  // category names, category mappings (the marketplace category a product falls back to)
  const categoryIds = unique([...variants.values()].map((v) => v.categoryId).filter((x): x is string => Boolean(x)));
  const categoryNames = new Map(categoryIds.length ? (await tx.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).where(and(eq(schema.categories.vendorId, vendorId), inArray(schema.categories.id, categoryIds)))).map((r) => [r.id, r.name]) : []);
  const explicitIds = unique(rows.map((r) => r.l.marketplaceCategoryId).filter((x): x is string => Boolean(x)));
  const mappings = categoryIds.length || explicitIds.length
    ? await tx.select().from(CM).where(and(eq(CM.vendorId, vendorId), inArray(CM.marketplace, markets), or(categoryIds.length ? inArray(CM.categoryId, categoryIds) : undefined, explicitIds.length ? inArray(CM.marketplaceCategoryId, explicitIds) : undefined)))
    : [];
  const mappedFor = new Map(mappings.map((m) => [`${m.marketplace}:${m.categoryId}`, m]));
  const nameOfMarketplaceCategory = new Map(mappings.filter((m) => m.marketplaceCategoryName).map((m) => [`${m.marketplace}:${m.marketplaceCategoryId}`, m.marketplaceCategoryName!]));

  // a sale that is running right now
  const now = new Date();
  const sales = new Map((await tx.select().from(MP).where(and(eq(MP.vendorId, vendorId), inArray(MP.variantId, variantIds), inArray(MP.marketplaceAccountId, accountIds), sql`${MP.salePriceMinor} is not null`)))
    .filter((s) => (!s.saleStartsAt || s.saleStartsAt <= now) && (!s.saleEndsAt || s.saleEndsAt > now)).map((s) => [`${s.marketplaceAccountId}:${s.variantId}`, s]));

  for (const r of rows) {
    const v = variants.get(r.l.variantId);
    const acct = accounts.get(r.l.marketplaceAccountId);
    const connector = c.connectors.has(r.marketplace) ? c.connectors.get(r.marketplace) : null;
    const policy = asPolicy(policies.get(r.l.marketplaceAccountId));
    const avail = available.get(`${r.l.marketplaceAccountId}:${r.l.variantId}`) ?? 0;
    const sellable = computeSellable(avail, policy, { buffer: r.l.bufferOverride, max: r.l.maxQuantityOverride });
    const priceMinor = r.l.priceMinor ?? r.variantPriceMinor;
    const mrpMinor = r.l.mrpMinor ?? r.variantMrpMinor;
    const imgs = imagesOf.get(r.productId) ?? [];
    const mapped = v?.categoryId ? mappedFor.get(`${r.marketplace}:${v.categoryId}`) : undefined;
    const marketplaceCategoryId = r.l.marketplaceCategoryId ?? mapped?.marketplaceCategoryId ?? null;
    const readinessFull = buildReadiness(storedFacts(r.l, {
      title: r.productTitle, description: v?.description ?? null, brand: v?.brand ?? null, barcode: v?.barcode ?? null, imageCount: imgs.length,
      primaryImage: imgs[0] ? { width: imgs[0].width, height: imgs[0].height } : null, priceMinor, mrpMinor, categoryId: marketplaceCategoryId,
      categoryRequired: connector?.capabilities.listings.requiresCategoryMapping ?? false, available: avail, sellable,
    }));
    const sale = sales.get(`${r.l.marketplaceAccountId}:${r.l.variantId}`);
    const validation = r.l.validation as { validatedAt?: string; errors?: unknown[] };
    out.set(r.l.id, {
      screenStatus: screenStatusOf({ status: r.l.status, contentState: r.l.contentState, validation }),
      barcode: v?.barcode ?? null, thumbnailUrl: thumbs.get(r.productId) ?? null, imageCount: imgs.length,
      categoryName: v?.categoryId ? categoryNames.get(v.categoryId) ?? null : null, marketplaceName: marketplaceNameOf(c.connectors, r.marketplace), accountName: acct?.displayName ?? r.marketplace,
      marketplaceCategoryName: marketplaceCategoryId ? mapped?.marketplaceCategoryName ?? nameOfMarketplaceCategory.get(`${r.marketplace}:${marketplaceCategoryId}`) ?? null : null,
      priceMinor, mrpMinor, salePriceMinor: sale?.salePriceMinor ?? null, saleEndsAt: iso(sale?.saleEndsAt),
      stock: { available: avail, sellable, pushed: r.l.pushedQuantity, dirty: r.l.quantityDirty },
      readiness: {
        percent: readinessFull.percent, ready: readinessFull.ready, errors: readinessFull.summary.fail, warnings: readinessFull.summary.warn, attributesChecked: readinessFull.attributesChecked,
        topBlocker: readinessFull.topBlocker ? { message: readinessFull.topBlocker.message, field: readinessFull.topBlocker.field } : null,
      },
      externalListingId: r.l.externalListingId, externalUrl: externalListingUrl(r.marketplace, r.l.externalListingId, acct?.mode ?? 'live'), lastSyncAt: iso(lastSync(r.l)), readinessFull,
    });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// numbered table: filters, sort, counts per screen status
// ------------------------------------------------------------------------------------------------
export interface TableFilter {
  screenStatus?: ScreenStatus; status?: string; accountId?: string; marketplace?: string; contentState?: string; source?: string; attention?: boolean; q?: string;
}
const FROM = sql`from marketplace_listings l
  join product_variants v on v.id = l.variant_id and v.vendor_id = l.vendor_id
  join products p on p.id = v.product_id and p.vendor_id = v.vendor_id
  join marketplace_accounts a on a.id = l.marketplace_account_id and a.vendor_id = l.vendor_id`;
const STATUS_EXPR = sql.raw(`(${SCREEN_STATUS_SQL})`);

function where(vendorId: string, f: TableFilter, opts: { skipScreenStatus?: boolean } = {}): SQL {
  const parts: SQL[] = [sql`l.vendor_id = ${vendorId}`, sql`v.deleted_at is null`, sql`p.deleted_at is null`];
  if (f.accountId) parts.push(sql`l.marketplace_account_id = ${f.accountId}`);
  if (f.marketplace) parts.push(sql`a.marketplace = ${f.marketplace}`);
  if (f.status) parts.push(sql`l.status = ${f.status}`);
  if (f.contentState) parts.push(sql`l.content_state = ${f.contentState}`);
  if (f.source) parts.push(sql`l.source = ${f.source}`);
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    parts.push(sql`(l.external_sku ilike ${like} or p.title ilike ${like} or v.sku ilike ${like} or l.external_listing_id ilike ${like} or v.barcode ilike ${like})`);
  }
  if (!opts.skipScreenStatus) {
    if (f.screenStatus) parts.push(sql`${STATUS_EXPR} = ${f.screenStatus}`);
    if (f.attention) parts.push(sql`${STATUS_EXPR} in ('needs_review', 'failed', 'blocked')`);
  }
  return sql.join(parts, sql` and `);
}

const SORTS: Record<string, string> = { updatedAt: 'l.updated_at', createdAt: 'l.created_at', title: 'lower(p.title)', sku: 'lower(v.sku)', price: 'coalesce(l.price_minor, v.selling_price_minor)', status: 'l.status' };

export async function listTable(tx: Tx, vendorId: string, f: TableFilter, page: { limit: number; offset: number }, sort?: { field: string; direction: 'asc' | 'desc' }) {
  const expr = SORTS[sort?.field ?? 'updatedAt'] ?? SORTS.updatedAt!;
  const dir = sort ? (sort.direction === 'asc' ? 'asc' : 'desc') : 'desc';
  const ids = (await tx.execute<{ id: string }>(sql`select l.id ${FROM} where ${where(vendorId, f)} order by ${sql.raw(expr)} ${sql.raw(dir)} nulls last, l.id ${sql.raw(dir)} limit ${page.limit} offset ${page.offset}`)).rows.map((r) => r.id);
  const total = Number((await tx.execute<{ n: number }>(sql`select count(*)::int n ${FROM} where ${where(vendorId, f)}`)).rows[0]!.n);
  // counts per tab ignore the tab itself, so every tab shows what it would list
  const countRows = (await tx.execute<{ s: ScreenStatus; n: number }>(sql`select ${STATUS_EXPR} s, count(*)::int n ${FROM} where ${where(vendorId, f, { skipScreenStatus: true })} group by 1`)).rows;
  const counts = Object.fromEntries(SCREEN_STATUSES.map((s) => [s, 0])) as Record<ScreenStatus, number>;
  for (const r of countRows) counts[r.s] = Number(r.n);
  return { ids, total, counts: { all: Object.values(counts).reduce((a, b) => a + b, 0), ...counts } };
}

// ------------------------------------------------------------------------------------------------
// overview
// ------------------------------------------------------------------------------------------------
export interface OverviewFilter { accountId?: string; marketplace?: string }

export async function overviewCounts(tx: Tx, vendorId: string, f: OverviewFilter) {
  const rows = (await tx.execute<{ status: string; s: ScreenStatus; cs: string; m: string; n: number }>(
    sql`select l.status, ${STATUS_EXPR} s, l.content_state cs, a.marketplace m, count(*)::int n ${FROM} where ${where(vendorId, f)} group by 1, 2, 3, 4`,
  )).rows;
  return rows.map((r) => ({ ...r, n: Number(r.n) }));
}

/** variants x connected accounts that have no listing yet: what could still be listed (only marketplaces that accept listings through the API) */
export async function notListedCounts(tx: Tx, vendorId: string, listableMarketplaces: string[], f: OverviewFilter): Promise<Array<{ marketplace: string; accountId: string; n: number }>> {
  if (listableMarketplaces.length === 0) return [];
  const rows = await tx.execute<{ marketplace: string; account_id: string; n: number }>(sql`select a.marketplace, a.id account_id, count(*)::int n ${NOT_LISTED_FROM}
    where ${notListedWhere(vendorId, listableMarketplaces, f)} group by a.marketplace, a.id`);
  return rows.rows.map((r) => ({ marketplace: r.marketplace, accountId: r.account_id, n: Number(r.n) }));
}

const NOT_LISTED_FROM = sql`from product_variants v
  join products p on p.id = v.product_id and p.vendor_id = v.vendor_id
  join marketplace_accounts a on a.vendor_id = v.vendor_id`;
function notListedWhere(vendorId: string, marketplaces: string[], f: OverviewFilter & { q?: string }): SQL {
  const parts: SQL[] = [
    sql`v.vendor_id = ${vendorId}`, sql`v.deleted_at is null`, sql`p.deleted_at is null`, sql`p.status = 'active'`, sql`v.status = 'active'`, sql`a.status = 'active'`,
    sql`a.marketplace in (${sql.join(marketplaces.map((m) => sql`${m}`), sql`, `)})`,
    sql`not exists (select 1 from marketplace_listings l where l.vendor_id = v.vendor_id and l.marketplace_account_id = a.id and l.variant_id = v.id)`,
  ];
  if (f.accountId) parts.push(sql`a.id = ${f.accountId}`);
  if (f.marketplace) parts.push(sql`a.marketplace = ${f.marketplace}`);
  if (f.q) { const like = `%${escapeLike(f.q)}%`; parts.push(sql`(v.sku ilike ${like} or p.title ilike ${like} or v.barcode ilike ${like})`); }
  return sql.join(parts, sql` and `);
}

export async function listNotListed(tx: Tx, vendorId: string, listableMarketplaces: string[], f: OverviewFilter & { q?: string }, page: { limit: number; offset: number }) {
  if (listableMarketplaces.length === 0) return { rows: [], total: 0 };
  const w = notListedWhere(vendorId, listableMarketplaces, f);
  const rows = (await tx.execute<{ variant_id: string; sku: string; barcode: string | null; product_id: string; title: string; price: number | null; mrp: number | null; account_id: string; account_name: string; marketplace: string }>(
    sql`select v.id variant_id, v.sku, v.barcode, p.id product_id, p.title, v.selling_price_minor price, v.mrp_minor mrp, a.id account_id, a.display_name account_name, a.marketplace ${NOT_LISTED_FROM}
      where ${w} order by lower(p.title), v.sku, a.id limit ${page.limit} offset ${page.offset}`,
  )).rows;
  const total = Number((await tx.execute<{ n: number }>(sql`select count(*)::int n ${NOT_LISTED_FROM} where ${w}`)).rows[0]!.n);
  return { rows, total };
}
