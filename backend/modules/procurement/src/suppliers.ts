import { and, eq, ilike, inArray, isNull, or, schema, sql, escapeLike, pgError, PG, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { nextCounter } from '@oms/mod-inventory';
import { getSupplierRow, rule, type Fx, type SupplierRow } from './common';
import { BLOCKING_PO_STATUSES, OPEN_PO_STATUSES, round1, scorecard, supplierCodeFor, type DeliveryStats } from './domain';

const S = schema.suppliers;
const SP = schema.supplierProducts;
const V = schema.productVariants;
const P = schema.products;
const PO = schema.purchaseOrders;

const rows = async (tx: Tx, q: ReturnType<typeof sql>): Promise<Array<Record<string, unknown>>> => (await tx.execute<Record<string, unknown>>(q)).rows;
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const idList = (ids: string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);

export interface SupplierInput {
  code?: string; name: string; contactPerson?: string | null; email?: string | null; phone?: string | null; gstin?: string | null; city?: string | null; state?: string | null;
  address?: Record<string, unknown>; paymentTerms?: string | null; leadTimeDays?: number; currency?: string; status?: 'active' | 'inactive' | 'blocked'; notes?: string | null;
}

// ------------------------------------------------------------------------------------------------
// scorecards: ONE grouped query per metric for a whole page of suppliers (no per-row loops)
// ------------------------------------------------------------------------------------------------
export interface SupplierStats extends DeliveryStats { activeSkus: number; openPurchaseOrders: number; averageLeadTimeDays: number | null }

/** deliveries = fully received POs; on time = received by the end of the expected day (UTC); lead time = submitted -> fully received */
export async function supplierDeliveryStats(tx: Tx, vendorId: string, supplierIds?: string[]): Promise<Map<string, DeliveryStats & { averageLeadTimeDays: number | null }>> {
  const scope = supplierIds ? sql`and p.supplier_id in (${idList(supplierIds)})` : sql``;
  const found = await rows(tx, sql`select p.supplier_id,
      count(*)::int delivered,
      count(*) filter (where p.expected_at is null or p.received_at <= ((date_trunc('day', p.expected_at at time zone 'UTC') + interval '1 day') at time zone 'UTC' - interval '1 millisecond'))::int on_time,
      coalesce(sum(l.received), 0)::int units_received, coalesce(sum(l.damaged), 0)::int units_damaged,
      avg(extract(epoch from (p.received_at - p.submitted_at)) / 86400) filter (where p.submitted_at is not null) avg_lead
    from purchase_orders p
    left join (select purchase_order_id, sum(quantity_received) received, sum(quantity_damaged) damaged from purchase_order_lines where vendor_id = ${vendorId} group by 1) l on l.purchase_order_id = p.id
    where p.vendor_id = ${vendorId} and p.status = 'received' and p.received_at is not null ${scope} group by p.supplier_id`);
  return new Map(found.map((r) => [String(r.supplier_id), {
    delivered: num(r.delivered), onTime: num(r.on_time), unitsReceived: num(r.units_received), unitsDamaged: num(r.units_damaged),
    averageLeadTimeDays: r.avg_lead === null || r.avg_lead === undefined ? null : round1(Number(r.avg_lead)),
  }]));
}

async function statsFor(tx: Tx, vendorId: string, ids: string[]): Promise<Map<string, SupplierStats>> {
  const out = new Map<string, SupplierStats>(ids.map((id) => [id, { delivered: 0, onTime: 0, unitsReceived: 0, unitsDamaged: 0, activeSkus: 0, openPurchaseOrders: 0, averageLeadTimeDays: null }]));
  if (ids.length === 0) return out;
  const skus = await tx.select({ id: SP.supplierId, n: sql<number>`count(*)::int` }).from(SP).where(and(eq(SP.vendorId, vendorId), inArray(SP.supplierId, ids))).groupBy(SP.supplierId);
  const open = await tx.select({ id: PO.supplierId, n: sql<number>`count(*)::int` }).from(PO).where(and(eq(PO.vendorId, vendorId), inArray(PO.supplierId, ids), inArray(PO.status, [...OPEN_PO_STATUSES]))).groupBy(PO.supplierId);
  for (const r of skus) out.get(r.id)!.activeSkus = r.n;
  for (const r of open) out.get(r.id)!.openPurchaseOrders = r.n;
  for (const [id, d] of await supplierDeliveryStats(tx, vendorId, ids)) Object.assign(out.get(id)!, d);
  return out;
}

export const toSupplierDto = (s: SupplierRow, st: SupplierStats) => {
  const card = scorecard(st);
  return {
    id: s.id, code: s.code, name: s.name, contactPerson: s.contactPerson, email: s.email, phone: s.phone, gstin: s.gstin, city: s.city, state: s.state,
    location: [s.city, s.state].filter(Boolean).join(', ') || null, address: s.address, paymentTerms: s.paymentTerms, leadTimeDays: s.leadTimeDays, currency: s.currency.trim(),
    status: s.status as 'active' | 'inactive' | 'blocked', notes: s.notes, version: s.version,
    activeSkusCount: st.activeSkus, openPurchaseOrders: st.openPurchaseOrders, deliveredPurchaseOrders: st.delivered, averageLeadTimeDays: st.averageLeadTimeDays,
    onTimeRatePercent: card.onTimeRatePercent, rating: card.rating, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
  };
};

// ------------------------------------------------------------------------------------------------
// CRUD
// ------------------------------------------------------------------------------------------------
async function codeTaken(tx: Tx, vendorId: string, code: string, exceptId?: string): Promise<boolean> {
  const [hit] = await tx.select({ id: S.id }).from(S).where(and(eq(S.vendorId, vendorId), isNull(S.deletedAt), sql`lower(${S.code}) = lower(${code})`, exceptId ? sql`${S.id} <> ${exceptId}` : undefined));
  return !!hit;
}
const duplicateCode = (code: string) => new AppError('CONFLICT', `Supplier code ${code} is already used`, { details: { rule: 'duplicate_code', field: 'code' } });

export async function createSupplier(tx: Tx, vendorId: string, fx: Fx, input: SupplierInput) {
  let code = input.code;
  if (code) { if (await codeTaken(tx, vendorId, code)) throw duplicateCode(code); }
  else {
    do code = supplierCodeFor(input.name, await nextCounter(tx, vendorId, 'supplier')); while (await codeTaken(tx, vendorId, code));
  }
  let row: SupplierRow;
  try {
    [row] = await tx.insert(S).values({
      vendorId, code, name: input.name, contactPerson: input.contactPerson ?? null, email: input.email ?? null, phone: input.phone ?? null, gstin: input.gstin ?? null, city: input.city ?? null, state: input.state ?? null,
      address: input.address ?? {}, paymentTerms: input.paymentTerms ?? null, leadTimeDays: input.leadTimeDays ?? 7, currency: input.currency ?? 'INR', status: input.status ?? 'active', notes: input.notes ?? null,
    }).returning() as [SupplierRow];
  } catch (e) {
    if (pgError(e)?.code === PG.UNIQUE_VIOLATION) throw duplicateCode(code);
    throw e;
  }
  await fx.audit({ action: 'supplier.create', resourceType: 'supplier', resourceId: row.id, after: { code: row.code, name: row.name, status: row.status } });
  return row;
}

export async function updateSupplier(tx: Tx, vendorId: string, fx: Fx, id: string, patch: Partial<SupplierInput> & { version?: number }) {
  const before = await getSupplierRow(tx, vendorId, id);
  if (patch.version !== undefined && patch.version !== before.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: before.version } });
  if (patch.code && patch.code.toLowerCase() !== before.code.toLowerCase() && (await codeTaken(tx, vendorId, patch.code, id))) throw duplicateCode(patch.code);
  const pick = <K extends keyof SupplierInput>(k: K, current: unknown) => (patch[k] !== undefined ? patch[k] : current);
  let after: SupplierRow;
  try {
    [after] = await tx.update(S).set({
      code: patch.code ?? before.code, name: patch.name ?? before.name, contactPerson: pick('contactPerson', before.contactPerson) as string | null, email: pick('email', before.email) as string | null,
      phone: pick('phone', before.phone) as string | null, gstin: pick('gstin', before.gstin) as string | null, city: pick('city', before.city) as string | null, state: pick('state', before.state) as string | null,
      address: patch.address ?? before.address, paymentTerms: pick('paymentTerms', before.paymentTerms) as string | null, leadTimeDays: patch.leadTimeDays ?? before.leadTimeDays,
      currency: patch.currency ?? before.currency, status: patch.status ?? before.status, notes: pick('notes', before.notes) as string | null, version: sql`${S.version} + 1`,
    }).where(and(eq(S.id, id), eq(S.vendorId, vendorId), eq(S.version, before.version))).returning() as [SupplierRow];
  } catch (e) {
    if (pgError(e)?.code === PG.UNIQUE_VIOLATION) throw duplicateCode(patch.code ?? before.code);
    throw e;
  }
  if (!after) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: before.version + 1 } });
  await fx.audit({ action: 'supplier.update', resourceType: 'supplier', resourceId: id, before: { name: before.name, status: before.status, leadTimeDays: before.leadTimeDays }, after: { name: after.name, status: after.status, leadTimeDays: after.leadTimeDays } });
  return { before, after };
}

/** soft delete; refused while the supplier still has a draft or open purchase order (cancel or finish them first) */
export async function deleteSupplier(tx: Tx, vendorId: string, fx: Fx, id: string): Promise<SupplierRow> {
  const s = await getSupplierRow(tx, vendorId, id);
  const [open] = await tx.select({ n: sql<number>`count(*)::int` }).from(PO).where(and(eq(PO.vendorId, vendorId), eq(PO.supplierId, id), inArray(PO.status, [...BLOCKING_PO_STATUSES])));
  if ((open?.n ?? 0) > 0) throw rule('The supplier still has open purchase orders', 'has_open_purchase_orders', { openPurchaseOrders: open!.n });
  await tx.update(S).set({ deletedAt: new Date(), version: sql`${S.version} + 1` }).where(and(eq(S.id, id), eq(S.vendorId, vendorId)));
  await fx.audit({ action: 'supplier.delete', resourceType: 'supplier', resourceId: id, before: { code: s.code, name: s.name } });
  return s;
}

export async function listSuppliers(tx: Tx, vendorId: string, q: { page: { limit: number; offset: number }; q?: string; status?: string; sort: 'name' | '-name' | 'createdAt' | '-createdAt' }) {
  const search = q.q ? or(ilike(S.name, `%${escapeLike(q.q)}%`), ilike(S.code, `%${escapeLike(q.q)}%`), ilike(S.contactPerson, `%${escapeLike(q.q)}%`), ilike(S.city, `%${escapeLike(q.q)}%`)) : undefined;
  const where = and(eq(S.vendorId, vendorId), isNull(S.deletedAt), q.status ? eq(S.status, q.status) : undefined, search);
  const col = q.sort.endsWith('createdAt') ? S.createdAt : S.name;
  const [{ total } = { total: 0 }] = await tx.select({ total: sql<number>`count(*)::int` }).from(S).where(where);
  const page = await tx.select().from(S).where(where).orderBy(q.sort.startsWith('-') ? sql`${col} desc` : sql`${col} asc`, S.id).limit(q.page.limit).offset(q.page.offset);
  const counts = await tx.select({ status: S.status, n: sql<number>`count(*)::int` }).from(S).where(and(eq(S.vendorId, vendorId), isNull(S.deletedAt), search)).groupBy(S.status);
  const stats = await statsFor(tx, vendorId, page.map((s) => s.id));
  return { items: page.map((s) => toSupplierDto(s, stats.get(s.id)!)), total, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number> };
}

export async function getSupplierDetail(tx: Tx, vendorId: string, id: string) {
  const s = await getSupplierRow(tx, vendorId, id);
  const stats = await statsFor(tx, vendorId, [id]);
  const products = await listSupplierProducts(tx, vendorId, id, { limit: 200, offset: 0 });
  const recent = await tx.select({ id: PO.id, poNumber: PO.poNumber, status: PO.status, totalMinor: PO.totalMinor, currency: PO.currency, orderDate: PO.orderDate, expectedAt: PO.expectedAt }).from(PO).where(and(eq(PO.vendorId, vendorId), eq(PO.supplierId, id))).orderBy(sql`${PO.createdAt} desc`).limit(10);
  return {
    ...toSupplierDto(s, stats.get(id)!), products: products.items,
    recentPurchaseOrders: recent.map((p) => ({ id: p.id, poNumber: p.poNumber, status: p.status as (typeof schema.PURCHASE_ORDER_STATUSES)[number], totalMinor: p.totalMinor, currency: p.currency.trim(), orderDate: p.orderDate.toISOString(), expectedAt: p.expectedAt ? p.expectedAt.toISOString() : null })),
  };
}

// ------------------------------------------------------------------------------------------------
// what the supplier sells us
// ------------------------------------------------------------------------------------------------
export interface SupplierProductInput { variantId: string; supplierSku?: string | null; costMinor: number; leadTimeDays?: number | null; minOrderQuantity?: number; isPreferred?: boolean }

export async function listSupplierProducts(tx: Tx, vendorId: string, supplierId: string, q: { limit: number; offset: number; q?: string }) {
  await getSupplierRow(tx, vendorId, supplierId);
  const search = q.q ? or(ilike(V.sku, `%${escapeLike(q.q)}%`), ilike(P.title, `%${escapeLike(q.q)}%`), ilike(SP.supplierSku, `%${escapeLike(q.q)}%`)) : undefined;
  const where = and(eq(SP.vendorId, vendorId), eq(SP.supplierId, supplierId), search);
  const base = tx.select({ sp: SP, sku: V.sku, title: P.title, variantCost: V.costPriceMinor }).from(SP)
    .innerJoin(V, and(eq(V.id, SP.variantId), eq(V.vendorId, SP.vendorId))).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId)));
  const [{ total } = { total: 0 }] = await tx.select({ total: sql<number>`count(*)::int` }).from(SP)
    .innerJoin(V, and(eq(V.id, SP.variantId), eq(V.vendorId, SP.vendorId))).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).where(where);
  const found = await base.where(where).orderBy(V.sku).limit(q.limit).offset(q.offset);
  return {
    total,
    items: found.map((r) => ({
      id: r.sp.id, variantId: r.sp.variantId, sku: r.sku, productTitle: r.title, supplierSku: r.sp.supplierSku, costMinor: r.sp.costMinor, variantCostMinor: r.variantCost, leadTimeDays: r.sp.leadTimeDays,
      minOrderQuantity: r.sp.minOrderQuantity, isPreferred: r.sp.isPreferred, updatedAt: r.sp.updatedAt.toISOString(),
    })),
  };
}

/** upsert a batch of the supplier's products; marking one preferred makes the other suppliers of that variant not preferred */
export async function putSupplierProducts(tx: Tx, vendorId: string, fx: Fx, supplierId: string, items: SupplierProductInput[]) {
  await getSupplierRow(tx, vendorId, supplierId);
  if (new Set(items.map((i) => i.variantId)).size !== items.length) throw new AppError('BAD_REQUEST', 'Each variant may appear once', { details: { rule: 'duplicate_variant' } });
  const variants = await tx.select({ id: V.id }).from(V).where(and(eq(V.vendorId, vendorId), isNull(V.deletedAt), inArray(V.id, items.map((i) => i.variantId))));
  const known = new Set(variants.map((v) => v.id));
  const missing = items.filter((i) => !known.has(i.variantId));
  if (missing.length) throw Errors.notFound('Variant', missing[0]!.variantId);
  for (const i of items) {
    const values = { supplierSku: i.supplierSku ?? null, costMinor: i.costMinor, leadTimeDays: i.leadTimeDays ?? null, minOrderQuantity: i.minOrderQuantity ?? 1, isPreferred: i.isPreferred ?? false };
    if (values.isPreferred) await tx.update(SP).set({ isPreferred: false }).where(and(eq(SP.vendorId, vendorId), eq(SP.variantId, i.variantId), eq(SP.isPreferred, true)));
    await tx.insert(SP).values({ vendorId, supplierId, variantId: i.variantId, ...values }).onConflictDoUpdate({ target: [SP.supplierId, SP.variantId], set: { ...values, updatedAt: new Date() } });
  }
  await fx.audit({ action: 'supplier.products_set', resourceType: 'supplier', resourceId: supplierId, after: { variants: items.length } });
}

export async function removeSupplierProduct(tx: Tx, vendorId: string, fx: Fx, supplierId: string, variantId: string): Promise<void> {
  await getSupplierRow(tx, vendorId, supplierId);
  const gone = await tx.delete(SP).where(and(eq(SP.vendorId, vendorId), eq(SP.supplierId, supplierId), eq(SP.variantId, variantId))).returning({ id: SP.id });
  if (gone.length === 0) throw Errors.notFound('Supplier product', variantId);
  await fx.audit({ action: 'supplier.product_removed', resourceType: 'supplier', resourceId: supplierId, before: { variantId } });
}
