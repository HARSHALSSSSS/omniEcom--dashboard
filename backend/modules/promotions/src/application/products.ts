import { and, desc, eq, escapeLike, ilike, isNull, or, schema, sql, type SQL, type Tx } from '@oms/database';

const C = schema.promotionCampaigns;
const I = schema.promotionItems;
const V = schema.productVariants;
const P = schema.products;

export interface ProductFilters { campaignId?: string; status?: string; accountId?: string; q?: string }

const where = (vendorId: string, f: ProductFilters, withStatus: boolean): SQL | undefined => and(
  eq(I.vendorId, vendorId), isNull(C.deletedAt),
  f.campaignId ? eq(I.campaignId, f.campaignId) : undefined,
  // the "promoted SKUs" view shows what is current or coming; finished items are asked for with filter[status]=ended
  withStatus ? (f.status ? eq(I.status, f.status) : sql`${I.status} <> 'ended'`) : undefined,
  // a campaign without accounts runs on every connected account
  f.accountId ? sql`(${C.accountIds} @> ${JSON.stringify([f.accountId])}::jsonb or (jsonb_array_length(${C.accountIds}) = 0 and exists (select 1 from ${schema.marketplaceAccounts} a where a.vendor_id = ${I.vendorId} and a.id = ${f.accountId} and a.status = 'active')))` : undefined,
  f.q?.trim() ? or(ilike(V.sku, `%${escapeLike(f.q.trim())}%`), ilike(P.title, `%${escapeLike(f.q.trim())}%`)) : undefined,
);

/** the promoted products of one campaign or of all campaigns, with a count per item status for the filter chips */
export async function listPromotedProducts(tx: Tx, vendorId: string, f: ProductFilters, win: { limit: number; offset: number }) {
  const [rows, totals, grouped] = await Promise.all([
    tx.select({ item: I, campaign: { id: C.id, name: C.name, code: C.code, status: C.status, accountIds: C.accountIds }, sku: V.sku, productId: P.id, title: P.title }).from(I)
      .innerJoin(C, and(eq(C.vendorId, I.vendorId), eq(C.id, I.campaignId))).innerJoin(V, and(eq(V.vendorId, I.vendorId), eq(V.id, I.variantId))).innerJoin(P, and(eq(P.vendorId, V.vendorId), eq(P.id, V.productId)))
      .where(where(vendorId, f, true)).orderBy(desc(C.createdAt), desc(I.createdAt), I.id).limit(win.limit).offset(win.offset),
    tx.select({ n: sql<string>`count(*)` }).from(I)
      .innerJoin(C, and(eq(C.vendorId, I.vendorId), eq(C.id, I.campaignId))).innerJoin(V, and(eq(V.vendorId, I.vendorId), eq(V.id, I.variantId))).innerJoin(P, and(eq(P.vendorId, V.vendorId), eq(P.id, V.productId)))
      .where(where(vendorId, f, true)),
    tx.select({ status: I.status, n: sql<string>`count(*)` }).from(I)
      .innerJoin(C, and(eq(C.vendorId, I.vendorId), eq(C.id, I.campaignId))).innerJoin(V, and(eq(V.vendorId, I.vendorId), eq(V.id, I.variantId))).innerJoin(P, and(eq(P.vendorId, V.vendorId), eq(P.id, V.productId)))
      .where(where(vendorId, f, false)).groupBy(I.status),
  ]);
  const counts: Record<string, number> = { all: 0, eligible: 0, pending_sync: 0, live: 0, ineligible: 0, ended: 0 };
  for (const g of grouped) { counts[g.status] = Number(g.n); counts.all! += Number(g.n); }
  return { rows, total: Number(totals[0]?.n ?? 0), counts };
}
