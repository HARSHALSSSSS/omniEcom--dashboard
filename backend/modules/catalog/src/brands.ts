import { and, eq, escapeLike, ilike, isNotNull, isNull, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import type { Effects } from './effects';
import { BRAND_MAX, collapseSpaces, nameKey } from './fields';

const B = schema.brands;
export type BrandRow = typeof B.$inferSelect;

/**
 * The business's brand list. A brand typed on a product is added UNCONFIRMED (readiness tag "Confirm"); it is confirmed when the seller
 * confirms it, when it is created explicitly, or when it already existed confirmed. Names are unique ignoring case and repeated whitespace
 * (`name_key`), and the canonical spelling of an existing brand always wins over what the product form sent.
 */
export const toBrandDto = (b: BrandRow, productCount?: number) => ({
  id: b.id,
  name: b.name,
  confirmed: b.confirmedAt !== null,
  confirmedAt: b.confirmedAt ? b.confirmedAt.toISOString() : null,
  ...(productCount !== undefined ? { productCount } : {}),
  createdAt: b.createdAt.toISOString(),
});
export type BrandDto = ReturnType<typeof toBrandDto>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actor = (fx: Effects): string | null => (fx.actorId && UUID.test(fx.actorId) ? fx.actorId : null);

/** SQL expression: a product's brand text in `name_key` form */
const productBrandKey = sql`lower(regexp_replace(btrim(brand), '\\s+', ' ', 'g'))`;

export function assertBrandName(raw: string): string {
  const name = collapseSpaces(raw);
  if (name === '' || [...name].length > BRAND_MAX) throw Errors.validation({ issues: [{ path: 'brand', code: 'invalid_brand', message: `Brand must be 1-${BRAND_MAX} characters` }] });
  return name;
}

/**
 * Finds or creates the brand for a product save and returns its canonical record. Race-safe: concurrent saves of the same new brand produce one
 * row (INSERT ... ON CONFLICT DO NOTHING), everybody gets that row back.
 */
export async function upsertBrand(tx: Tx, vendorId: string, rawName: string, fx: Effects): Promise<{ id: string; name: string; confirmed: boolean }> {
  const name = assertBrandName(rawName);
  const key = nameKey(name);
  for (let attempt = 0; attempt < 3; attempt++) {
    const [existing] = await tx.select().from(B).where(and(eq(B.vendorId, vendorId), eq(B.nameKey, key)));
    if (existing) return { id: existing.id, name: existing.name, confirmed: existing.confirmedAt !== null };
    const [ins] = await tx.insert(B).values({ vendorId, name, nameKey: key, createdBy: actor(fx) }).onConflictDoNothing({ target: [B.vendorId, B.nameKey] }).returning();
    if (ins) {
      await fx.audit({ action: 'brand.created', resourceType: 'brand', resourceId: ins.id, after: { name: ins.name, confirmed: false }, metadata: { source: 'product_save' } });
      await fx.event({ type: 'brand.created', aggregateType: 'brand', aggregateId: ins.id, payload: { name: ins.name, confirmed: false } });
      return { id: ins.id, name: ins.name, confirmed: false };
    }
  }
  throw new AppError('CONFLICT', 'Could not save the brand, please retry', { details: { rule: 'brand_race' } });
}

export interface BrandListInput { q?: string; confirmed?: boolean; limit: number }

/** confirmed brands first, then alphabetical; `productCount` comes from ONE grouped query over the business's live products */
export async function listBrands(tx: Tx, vendorId: string, input: BrandListInput) {
  const rows = await tx
    .select()
    .from(B)
    .where(and(
      eq(B.vendorId, vendorId),
      input.q ? ilike(B.name, `%${escapeLike(input.q)}%`) : undefined,
      input.confirmed === undefined ? undefined : input.confirmed ? isNotNull(B.confirmedAt) : isNull(B.confirmedAt),
    ))
    .orderBy(sql`(${B.confirmedAt} is null)`, sql`lower(${B.name})`, B.id)
    .limit(input.limit);
  if (!rows.length) return [];
  const counts = await usageCounts(tx, vendorId, rows.map((r) => r.nameKey));
  return rows.map((r) => toBrandDto(r, counts.get(r.nameKey) ?? 0));
}

async function usageCounts(tx: Tx, vendorId: string, keys: string[]): Promise<Map<string, number>> {
  const list = sql.join(keys.map((k) => sql`${k}`), sql`, `);
  const res = await tx.execute(sql`
    select ${productBrandKey} as k, count(*)::int as n from products
    where vendor_id = ${vendorId} and deleted_at is null and brand is not null and ${productBrandKey} in (${list})
    group by 1`);
  return new Map((res.rows as Array<{ k: string; n: number }>).map((r) => [r.k, Number(r.n)]));
}

export async function createBrand(tx: Tx, vendorId: string, rawName: string, fx: Effects) {
  const name = assertBrandName(rawName);
  const key = nameKey(name);
  const [ins] = await tx.insert(B).values({ vendorId, name, nameKey: key, confirmedAt: new Date(), createdBy: actor(fx) }).onConflictDoNothing({ target: [B.vendorId, B.nameKey] }).returning();
  if (!ins) {
    const [existing] = await tx.select().from(B).where(and(eq(B.vendorId, vendorId), eq(B.nameKey, key)));
    throw new AppError('CONFLICT', `The brand "${existing?.name ?? name}" already exists`, { details: { rule: 'duplicate_brand', field: 'name', existing: existing ? toBrandDto(existing) : null } });
  }
  await fx.audit({ action: 'brand.created', resourceType: 'brand', resourceId: ins.id, after: { name: ins.name, confirmed: true }, metadata: { source: 'brand_list' } });
  await fx.event({ type: 'brand.created', aggregateType: 'brand', aggregateId: ins.id, payload: { name: ins.name, confirmed: true } });
  return toBrandDto(ins, 0);
}

export async function confirmBrand(tx: Tx, vendorId: string, id: string, fx: Effects) {
  const [row] = await tx.update(B).set({ confirmedAt: new Date() }).where(and(eq(B.id, id), eq(B.vendorId, vendorId), isNull(B.confirmedAt))).returning();
  if (row) {
    await fx.audit({ action: 'brand.confirmed', resourceType: 'brand', resourceId: id, after: { name: row.name } });
    await fx.event({ type: 'brand.confirmed', aggregateType: 'brand', aggregateId: id, payload: { name: row.name } });
    return toBrandDto(row);
  }
  const [existing] = await tx.select().from(B).where(and(eq(B.id, id), eq(B.vendorId, vendorId)));
  if (!existing) throw Errors.notFound('Brand', id);
  return toBrandDto(existing); // already confirmed: idempotent
}

export async function deleteBrand(tx: Tx, vendorId: string, id: string, fx: Effects) {
  const [brand] = await tx.select().from(B).where(and(eq(B.id, id), eq(B.vendorId, vendorId)));
  if (!brand) throw Errors.notFound('Brand', id);
  const used = (await usageCounts(tx, vendorId, [brand.nameKey])).get(brand.nameKey) ?? 0;
  if (used > 0) throw new AppError('CONFLICT', `This brand is used by ${used} product${used === 1 ? '' : 's'}`, { details: { rule: 'in_use', productCount: used } });
  await tx.delete(B).where(and(eq(B.id, id), eq(B.vendorId, vendorId)));
  await fx.audit({ action: 'brand.deleted', resourceType: 'brand', resourceId: id, before: { name: brand.name, confirmed: brand.confirmedAt !== null } });
  await fx.event({ type: 'brand.deleted', aggregateType: 'brand', aggregateId: id, payload: { name: brand.name } });
}

/** brand state for readiness: key -> confirmed? (one query for many names) */
export async function brandStates(tx: Tx, vendorId: string, names: string[]): Promise<Map<string, boolean>> {
  const keys = [...new Set(names.filter(Boolean).map(nameKey))];
  if (!keys.length) return new Map();
  const rows = await tx.select({ k: B.nameKey, c: B.confirmedAt }).from(B).where(and(eq(B.vendorId, vendorId), sql`${B.nameKey} in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`));
  return new Map(rows.map((r) => [r.k, r.c !== null]));
}
