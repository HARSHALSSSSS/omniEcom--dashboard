import { and, asc, eq, ilike, inArray, isNull, or, schema, sql, escapeLike, type Tx } from '@oms/database';
import { Errors } from '@oms/shared';
import { getSupplierRow } from './common';

const V = schema.productVariants;
const P = schema.products;
const SP = schema.supplierProducts;
const INV = schema.inventory;

export interface VariantOffer {
  variantId: string; sku: string; title: string; variantCostMinor: number | null; taxRateBps: number;
  available: number; onHand: number; incoming: number;
  offer: { costMinor: number; supplierSku: string | null; minOrderQuantity: number; leadTimeDays: number | null; isPreferred: boolean } | null;
}

/**
 * Products a purchase order line can be picked from: active variants (search by SKU, barcode or title) with the stock position
 * and, when a supplier is given, that supplier's price, MOQ and lead time. Listed products of the supplier come first.
 */
export async function searchVariantsForPo(tx: Tx, vendorId: string, input: { q?: string; supplierId?: string; onlySupplied?: boolean; limit: number; offset: number }) {
  if (input.onlySupplied && !input.supplierId) throw Errors.validation({ issues: [{ path: 'supplierId', message: 'supplierId is needed to list only supplied products' }], rule: 'supplier_required' });
  if (input.supplierId) await getSupplierRow(tx, vendorId, input.supplierId);
  const like = input.q ? `%${escapeLike(input.q)}%` : null;
  const search = like ? or(ilike(V.sku, like), ilike(P.title, like), ilike(V.barcode, like)) : undefined;
  const supplied = input.supplierId
    ? sql`exists (select 1 from supplier_products sp where sp.vendor_id = ${vendorId} and sp.supplier_id = ${input.supplierId} and sp.variant_id = ${V.id})`
    : undefined;
  const where = and(eq(V.vendorId, vendorId), isNull(V.deletedAt), eq(V.status, 'active'), isNull(P.deletedAt), search, input.onlySupplied && supplied ? supplied : undefined);
  const [{ total } = { total: 0 }] = await tx.select({ total: sql<number>`count(*)::int` }).from(V).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).where(where);
  const found = await tx.select({ id: V.id, sku: V.sku, title: P.title, cost: V.costPriceMinor, variantTax: V.taxRateBps, productTax: P.gstRateBps }).from(V)
    .innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).where(where)
    .orderBy(...(supplied ? [sql`${supplied} desc`] : []), asc(V.sku)).limit(input.limit).offset(input.offset);
  const ids = found.map((f) => f.id);
  const stock = ids.length === 0 ? [] : await tx.select({
    variantId: INV.variantId, onHand: sql<number>`coalesce(sum(${INV.quantityOnHand}), 0)::int`, reserved: sql<number>`coalesce(sum(${INV.quantityReserved}), 0)::int`, incoming: sql<number>`coalesce(sum(${INV.quantityIncoming}), 0)::int`,
  }).from(INV).where(and(eq(INV.vendorId, vendorId), inArray(INV.variantId, ids))).groupBy(INV.variantId);
  const stockOf = new Map(stock.map((s) => [s.variantId, s]));
  const offers = input.supplierId && ids.length > 0
    ? new Map((await tx.select().from(SP).where(and(eq(SP.vendorId, vendorId), eq(SP.supplierId, input.supplierId), inArray(SP.variantId, ids)))).map((o) => [o.variantId, o]))
    : new Map<string, typeof SP.$inferSelect>();
  const items = found.map((f): VariantOffer => {
    const s = stockOf.get(f.id);
    const o = offers.get(f.id);
    return {
      variantId: f.id, sku: f.sku, title: f.title, variantCostMinor: f.cost, taxRateBps: f.variantTax ?? f.productTax ?? 0,
      available: (s?.onHand ?? 0) - (s?.reserved ?? 0), onHand: s?.onHand ?? 0, incoming: s?.incoming ?? 0,
      offer: o ? { costMinor: o.costMinor, supplierSku: o.supplierSku, minOrderQuantity: o.minOrderQuantity, leadTimeDays: o.leadTimeDays, isPreferred: o.isPreferred } : null,
    };
  });
  return { total, items };
}
