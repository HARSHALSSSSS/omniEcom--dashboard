import { and, eq, escapeLike, gte, inArray, isNull, like, lt, or, schema, sql, type Tx } from '@oms/database';
import { Errors } from '@oms/shared';
import { windowsOverlap, type AccountFacts, type VariantFacts } from '../domain/eligibility';

const C = schema.promotionCampaigns;
const I = schema.promotionItems;
const V = schema.productVariants;
const P = schema.products;
const L = schema.marketplaceListings;
const MP = schema.marketplacePrices;
const A = schema.marketplaceAccounts;
const OI = schema.orderItems;
const O = schema.orders;

export type CampaignRow = typeof C.$inferSelect;
export type ItemRow = typeof I.$inferSelect;
export interface TargetAccount { id: string; marketplace: string; displayName: string }
export interface VariantInfo extends VariantFacts { id: string; sku: string; title: string; productId: string }

/** items of a campaign are capped: a campaign is evaluated as one unit, in memory */
export const MAX_ITEMS = 5000;

export async function loadCampaign(tx: Tx, vendorId: string, id: string, lock = false): Promise<CampaignRow> {
  const q = tx.select().from(C).where(and(eq(C.vendorId, vendorId), eq(C.id, id), isNull(C.deletedAt)));
  const [row] = await (lock ? q.for('update') : q);
  if (!row) throw Errors.notFound('Campaign', id);
  return row;
}

/** the accounts the campaign runs on: the listed ones, or every connected (active) account when the list is empty */
export async function targetAccounts(tx: Tx, vendorId: string, accountIds: string[]): Promise<TargetAccount[]> {
  const rows = await tx.select({ id: A.id, marketplace: A.marketplace, displayName: A.displayName }).from(A)
    .where(and(eq(A.vendorId, vendorId), accountIds.length ? inArray(A.id, accountIds) : eq(A.status, 'active'))).orderBy(A.createdAt);
  return rows;
}

/** every id must be one of the business's accounts (an account that is not connected can still be named; it just cannot take sales) */
export async function assertAccounts(tx: Tx, vendorId: string, accountIds: string[]): Promise<void> {
  if (accountIds.length === 0) return;
  const found = await tx.select({ id: A.id }).from(A).where(and(eq(A.vendorId, vendorId), inArray(A.id, accountIds)));
  const missing = accountIds.filter((id) => !found.some((f) => f.id === id));
  if (missing.length) throw Errors.notFound('Marketplace account', missing[0]);
}

export async function variantInfo(tx: Tx, vendorId: string, variantIds: string[]): Promise<Map<string, VariantInfo>> {
  if (variantIds.length === 0) return new Map();
  const rows = await tx.select({ id: V.id, sku: V.sku, productId: V.productId, title: P.title, price: V.sellingPriceMinor, cost: V.costPriceMinor, vStatus: V.status, vDeleted: V.deletedAt, pStatus: P.status, pDeleted: P.deletedAt })
    .from(V).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).where(and(eq(V.vendorId, vendorId), inArray(V.id, variantIds)));
  return new Map(rows.map((r) => [r.id, { id: r.id, sku: r.sku, title: r.title, productId: r.productId, sellingPriceMinor: r.price, costMinor: r.cost, active: r.vStatus === 'active' && r.pStatus === 'active' && !r.vDeleted && !r.pDeleted }]));
}

// ------------------------------------------------------------------------------------------------
// selecting products
// ------------------------------------------------------------------------------------------------
export interface Selection { variantIds?: string[]; categoryIds?: string[]; allActive?: boolean }
export interface Resolved { variantIds: string[]; skipped: Array<{ variantId: string; reason: string }>; droppedNoListing: number }

/** the category and everything below it (materialised path) */
async function categoryTree(tx: Tx, vendorId: string, ids: string[]): Promise<string[]> {
  const roots = await tx.select({ id: schema.categories.id, path: schema.categories.path }).from(schema.categories).where(and(eq(schema.categories.vendorId, vendorId), inArray(schema.categories.id, ids), isNull(schema.categories.deletedAt)));
  const missing = ids.filter((id) => !roots.some((r) => r.id === id));
  if (missing.length) throw Errors.notFound('Category', missing[0]);
  const all = await tx.select({ id: schema.categories.id }).from(schema.categories)
    .where(and(eq(schema.categories.vendorId, vendorId), isNull(schema.categories.deletedAt), or(...roots.flatMap((r) => [eq(schema.categories.path, r.path), like(schema.categories.path, `${escapeLike(r.path)}/%`)]))));
  return all.map((c) => c.id);
}

/**
 * Turn a product selection into variants. Named variants are kept even when they cannot run (the product table then says why);
 * categories and "all active products" only bring the active variants that are listed on a target account, so a whole-catalogue
 * campaign does not fill the table with products that were never on the channel.
 */
export async function resolveSelection(tx: Tx, vendorId: string, sel: Selection, accounts: TargetAccount[]): Promise<Resolved> {
  const out = new Map<string, true>();
  const skipped: Resolved['skipped'] = [];
  let droppedNoListing = 0;
  if (sel.variantIds?.length) {
    const info = await variantInfo(tx, vendorId, [...new Set(sel.variantIds)]);
    for (const id of new Set(sel.variantIds)) {
      const v = info.get(id);
      if (!v) skipped.push({ variantId: id, reason: 'variant_not_found' });
      else if (!v.sellingPriceMinor || v.sellingPriceMinor <= 0) skipped.push({ variantId: id, reason: 'no_price' });
      else out.set(id, true);
    }
  }
  if (sel.allActive || sel.categoryIds?.length) {
    const categories = sel.allActive ? null : await categoryTree(tx, vendorId, [...new Set(sel.categoryIds!)]);
    const rows = await tx.select({ id: V.id, listed: sql<boolean>`exists (select 1 from ${L} where ${L.vendorId} = ${V.vendorId} and ${L.variantId} = ${V.id} and ${L.status} = 'active' ${accounts.length ? sql`and ${inArray(L.marketplaceAccountId, accounts.map((a) => a.id))}` : sql`and false`})` })
      .from(V).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId)))
      .where(and(eq(V.vendorId, vendorId), isNull(V.deletedAt), isNull(P.deletedAt), eq(V.status, 'active'), eq(P.status, 'active'), sql`${V.sellingPriceMinor} > 0`, categories ? inArray(P.categoryId, categories) : undefined)).limit(MAX_ITEMS + 1);
    for (const r of rows) { if (r.listed) out.set(r.id, true); else droppedNoListing++; }
  }
  return { variantIds: [...out.keys()], skipped, droppedNoListing };
}

// ------------------------------------------------------------------------------------------------
// facts for the eligibility engine (batched: one query per fact, never per variant)
// ------------------------------------------------------------------------------------------------
export const sameTime = (a: Date | null, b: Date | null): boolean => (a === null ? b === null : b !== null && a.getTime() === b.getTime());

export async function accountFacts(tx: Tx, vendorId: string, campaign: CampaignRow, accounts: TargetAccount[], variants: Map<string, VariantInfo>, canPush: (marketplace: string) => boolean, now: Date): Promise<Map<string, AccountFacts[]>> {
  const variantIds = [...variants.keys()];
  const accountIds = accounts.map((a) => a.id);
  const out = new Map<string, AccountFacts[]>();
  if (variantIds.length === 0 || accountIds.length === 0) { for (const id of variantIds) out.set(id, []); return out; }
  const [listings, prices, others, policies] = await Promise.all([
    tx.select({ variantId: L.variantId, accountId: L.marketplaceAccountId }).from(L).where(and(eq(L.vendorId, vendorId), eq(L.status, 'active'), inArray(L.variantId, variantIds), inArray(L.marketplaceAccountId, accountIds))),
    tx.select().from(MP).where(and(eq(MP.vendorId, vendorId), inArray(MP.variantId, variantIds), inArray(MP.marketplaceAccountId, accountIds))),
    tx.select({ variantId: I.variantId, name: C.name, accountIds: C.accountIds, startsAt: C.startsAt, endsAt: C.endsAt }).from(I)
      .innerJoin(C, and(eq(C.vendorId, I.vendorId), eq(C.id, I.campaignId)))
      .where(and(eq(I.vendorId, vendorId), inArray(I.variantId, variantIds), inArray(C.status, ['scheduled', 'active']), sql`${C.id} <> ${campaign.id}`, isNull(C.deletedAt), sql`${I.status} not in ('ineligible', 'ended')`)),
    tx.select({ accountId: schema.pricingPolicies.accountId, bps: sql<number>`max(${schema.pricingPolicies.targetMarginMinBps})` }).from(schema.pricingPolicies)
      .where(and(eq(schema.pricingPolicies.vendorId, vendorId), eq(schema.pricingPolicies.status, 'active'))).groupBy(schema.pricingPolicies.accountId),
  ]);
  const listed = new Set(listings.map((l) => `${l.variantId}|${l.accountId}`));
  const price = new Map(prices.map((p) => [`${p.variantId}|${p.marketplaceAccountId}`, p]));
  const globalFloor = Number(policies.find((p) => p.accountId === null)?.bps ?? 0);
  const floorOf = (accountId: string) => Math.max(globalFloor, Number(policies.find((p) => p.accountId === accountId)?.bps ?? 0));
  const ownSales = campaign.status === 'scheduled' || campaign.status === 'active';
  for (const [variantId, v] of variants) {
    out.set(variantId, accounts.map((a): AccountFacts => {
      const row = price.get(`${variantId}|${a.id}`);
      const sale = row && row.salePriceMinor !== null && (row.saleEndsAt === null || row.saleEndsAt > now);
      const own = ownSales && row?.source === 'schedule' && sameTime(row.saleStartsAt, campaign.startsAt) && sameTime(row.saleEndsAt, campaign.endsAt);
      const clash = others.find((o) => o.variantId === variantId && (o.accountIds.length === 0 || o.accountIds.includes(a.id)) && windowsOverlap(campaign.startsAt, campaign.endsAt, o.startsAt, o.endsAt));
      return {
        accountId: a.id, label: a.displayName, hasActiveListing: listed.has(`${variantId}|${a.id}`), regularMinor: row?.priceMinor ?? v.sellingPriceMinor ?? 0,
        foreignSale: Boolean(sale) && !own, marginFloorBps: floorOf(a.id), conflictingCampaign: clash?.name ?? null, canPush: canPush(a.marketplace),
      };
    }));
  }
  return out;
}

/** the marketplace price rows (any account) of these variants: what the campaign applied is found and cleared through them */
export async function priceRows(tx: Tx, vendorId: string, variantIds: string[]) {
  if (variantIds.length === 0) return [];
  return tx.select().from(MP).where(and(eq(MP.vendorId, vendorId), inArray(MP.variantId, variantIds)));
}

// ------------------------------------------------------------------------------------------------
// results from real orders
// ------------------------------------------------------------------------------------------------
export interface SalesWindow { unitsByVariant: Map<string, number>; units: number; revenueMinor: number; orders: number }

/** units and revenue of the variants sold in [from, to) on the given accounts (none = all); cancelled and returned lines do not count */
export async function salesInWindow(tx: Tx, vendorId: string, variantIds: string[], accountIds: string[], from: Date, to: Date): Promise<SalesWindow> {
  const empty: SalesWindow = { unitsByVariant: new Map(), units: 0, revenueMinor: 0, orders: 0 };
  if (variantIds.length === 0 || to <= from) return empty;
  const where = and(
    eq(OI.vendorId, vendorId), inArray(OI.variantId, variantIds), gte(O.placedAt, from), lt(O.placedAt, to),
    sql`${O.status} not in ('cancelled', 'returned')`, sql`${OI.status} not in ('cancelled', 'returned')`,
    accountIds.length ? inArray(O.marketplaceAccountId, accountIds) : undefined,
  );
  const [perVariant, total] = await Promise.all([
    tx.select({ variantId: OI.variantId, units: sql<string>`coalesce(sum(${OI.quantity}), 0)`, revenue: sql<string>`coalesce(sum(${OI.unitPriceMinor} * ${OI.quantity} - ${OI.discountMinor}), 0)` })
      .from(OI).innerJoin(O, and(eq(O.id, OI.orderId), eq(O.vendorId, OI.vendorId))).where(where).groupBy(OI.variantId),
    tx.select({ orders: sql<string>`count(distinct ${O.id})` }).from(OI).innerJoin(O, and(eq(O.id, OI.orderId), eq(O.vendorId, OI.vendorId))).where(where),
  ]);
  const unitsByVariant = new Map(perVariant.filter((r) => r.variantId).map((r) => [r.variantId!, Number(r.units)]));
  return { unitsByVariant, units: perVariant.reduce((s, r) => s + Number(r.units), 0), revenueMinor: perVariant.reduce((s, r) => s + Number(r.revenue), 0), orders: Number(total[0]?.orders ?? 0) };
}
