import { and, desc, eq, inArray, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { effects, type OpCtx } from '@oms/module-kit';

const CP = schema.competitorPrices;
const V = schema.productVariants;
const A = schema.marketplaceAccounts;

export interface CompetitorPrice { priceMinor: number; observedAt: Date; sellerName: string | null; accountId: string | null }

/**
 * The newest competitor price on record per variant (any account; observations are entered by the seller, nothing is scraped).
 * Variants without an observation are simply absent from the map.
 */
export async function latestCompetitorPrices(tx: Tx, vendorId: string, variantIds: string[]): Promise<Map<string, CompetitorPrice>> {
  const out = new Map<string, CompetitorPrice>();
  if (variantIds.length === 0) return out;
  const rows = await tx.selectDistinctOn([CP.variantId], { variantId: CP.variantId, priceMinor: CP.priceMinor, observedAt: CP.observedAt, sellerName: CP.sellerName, accountId: CP.accountId })
    .from(CP).where(and(eq(CP.vendorId, vendorId), inArray(CP.variantId, variantIds)))
    .orderBy(CP.variantId, desc(CP.observedAt), desc(CP.createdAt));
  for (const r of rows) out.set(r.variantId, { priceMinor: r.priceMinor, observedAt: r.observedAt, sellerName: r.sellerName, accountId: r.accountId });
  return out;
}

export const toCompetitorDto = (r: typeof CP.$inferSelect, sku?: string | null, title?: string | null, accountName?: string | null) => ({
  id: r.id, variantId: r.variantId, sku: sku ?? null, productTitle: title ?? null, accountId: r.accountId, accountName: accountName ?? null,
  priceMinor: r.priceMinor, currency: r.currency.trim(), sellerName: r.sellerName, source: r.source as 'manual' | 'import' | 'api', observedAt: r.observedAt.toISOString(), createdAt: r.createdAt.toISOString(),
});

export async function listCompetitorPrices(tx: Tx, vendorId: string, q: { variantId?: string; accountId?: string; q?: string; latestOnly: boolean; limit: number; offset: number }) {
  const P = schema.products;
  const where = and(
    eq(CP.vendorId, vendorId), q.variantId ? eq(CP.variantId, q.variantId) : undefined, q.accountId ? eq(CP.accountId, q.accountId) : undefined,
    q.q ? sql`(${V.sku} ILIKE ${`%${q.q}%`} OR ${P.title} ILIKE ${`%${q.q}%`} OR ${CP.sellerName} ILIKE ${`%${q.q}%`})` : undefined,
    // the newest observation of each variant: nothing newer exists for it
    q.latestOnly ? sql`NOT EXISTS (SELECT 1 FROM competitor_prices n WHERE n.vendor_id = ${CP.vendorId} AND n.variant_id = ${CP.variantId} AND (n.observed_at, n.created_at) > (${CP.observedAt}, ${CP.createdAt}))` : undefined,
  );
  const base = tx.select({ c: CP, sku: V.sku, title: P.title, account: A.displayName }).from(CP)
    .innerJoin(V, and(eq(V.id, CP.variantId), eq(V.vendorId, CP.vendorId))).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId)))
    .leftJoin(A, and(eq(A.id, CP.accountId), eq(A.vendorId, CP.vendorId))).where(where);
  const [rows, [total]] = await Promise.all([
    base.orderBy(desc(CP.observedAt), desc(CP.createdAt)).limit(q.limit).offset(q.offset),
    tx.select({ n: sql<number>`count(*)::int` }).from(CP).innerJoin(V, and(eq(V.id, CP.variantId), eq(V.vendorId, CP.vendorId))).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).where(where),
  ]);
  return { items: rows.map((r) => toCompetitorDto(r.c, r.sku, r.title, r.account)), total: total?.n ?? 0 };
}

export async function getCompetitorDto(tx: Tx, vendorId: string, id: string) {
  const [r] = await tx.select({ c: CP, sku: V.sku, title: schema.products.title, account: A.displayName }).from(CP)
    .innerJoin(V, and(eq(V.id, CP.variantId), eq(V.vendorId, CP.vendorId))).innerJoin(schema.products, and(eq(schema.products.id, V.productId), eq(schema.products.vendorId, V.vendorId)))
    .leftJoin(A, and(eq(A.id, CP.accountId), eq(A.vendorId, CP.vendorId))).where(and(eq(CP.id, id), eq(CP.vendorId, vendorId)));
  if (!r) throw Errors.notFound('Competitor price', id);
  return toCompetitorDto(r.c, r.sku, r.title, r.account);
}

export interface CompetitorInput { variantId: string; accountId?: string | null; priceMinor: number; sellerName?: string | null; observedAt?: Date | null; source?: 'manual' | 'import' | 'api' }

async function assertVariantAndAccount(tx: Tx, vendorId: string, variantId: string, accountId: string | null | undefined): Promise<void> {
  const [v] = await tx.select({ id: V.id }).from(V).where(and(eq(V.id, variantId), eq(V.vendorId, vendorId)));
  if (!v) throw Errors.notFound('Variant', variantId);
  if (accountId) {
    const [a] = await tx.select({ id: A.id }).from(A).where(and(eq(A.id, accountId), eq(A.vendorId, vendorId)));
    if (!a) throw Errors.notFound('Marketplace account', accountId);
  }
}

export async function addCompetitorPrice(tx: Tx, ctx: OpCtx, input: CompetitorInput) {
  await assertVariantAndAccount(tx, ctx.vendorId, input.variantId, input.accountId);
  if (input.observedAt && input.observedAt.getTime() > Date.now() + 5 * 60_000) throw new AppError('BAD_REQUEST', 'The observation time cannot be in the future', { details: { rule: 'observed_in_future' } });
  const [row] = await tx.insert(CP).values({
    vendorId: ctx.vendorId, variantId: input.variantId, accountId: input.accountId ?? null, priceMinor: input.priceMinor,
    sellerName: input.sellerName?.trim() || null, source: input.source ?? 'manual', ...(input.observedAt ? { observedAt: input.observedAt } : {}),
  }).returning();
  await effects(tx, ctx).audit({ action: 'pricing.competitor_price_added', resourceType: 'variant', resourceId: input.variantId, after: { priceMinor: input.priceMinor, accountId: input.accountId ?? null, sellerName: row!.sellerName, source: row!.source } });
  return row!;
}

export async function deleteCompetitorPrice(tx: Tx, ctx: OpCtx, id: string): Promise<void> {
  const [row] = await tx.delete(CP).where(and(eq(CP.id, id), eq(CP.vendorId, ctx.vendorId))).returning();
  if (!row) throw Errors.notFound('Competitor price', id);
  await effects(tx, ctx).audit({ action: 'pricing.competitor_price_deleted', resourceType: 'variant', resourceId: row.variantId, before: { priceMinor: row.priceMinor, accountId: row.accountId, sellerName: row.sellerName } });
}

// ---------------------------------------------------------------- CSV import (sku,price,seller)
export interface ImportRowResult { line: number; sku: string; status: 'imported' | 'skipped'; reason?: string }

/** split one CSV line honouring double quotes ("" is a quote); no multi-line cells */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const RUPEE_PREFIX = new RegExp('^(?:rs\\.?|inr|' + String.fromCharCode(0x20b9) + ')\\s*', 'i');
const BOM = new RegExp('^' + String.fromCharCode(0xfeff));

/** "499", "499.5", "1,299.00" (rupees) -> minor units without floats; null when it is not a positive amount */
export function rupeesToMinor(text: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text.replace(RUPEE_PREFIX, '').replace(/,/g, '').trim());
  if (!m) return null;
  const minor = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  return minor > 0 ? minor : null;
}

export const IMPORT_MAX_ROWS = 2_000;

/**
 * Import competitor prices from CSV text: header `sku,price,seller` (+ optional `account` = marketplace account id). Prices are in rupees.
 * Every line is reported; one bad line never blocks the others.
 */
export async function importCompetitorPrices(tx: Tx, ctx: OpCtx, csv: string): Promise<{ total: number; imported: number; skipped: number; rows: ImportRowResult[] }> {
  const lines = csv.replace(BOM, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new AppError('BAD_REQUEST', 'The CSV needs a header (sku,price,seller) and at least one row', { details: { rule: 'csv_empty' } });
  if (lines.length - 1 > IMPORT_MAX_ROWS) throw new AppError('BAD_REQUEST', `At most ${IMPORT_MAX_ROWS} rows per import`, { details: { rule: 'csv_too_large', max: IMPORT_MAX_ROWS } });
  const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const [iSku, iPrice, iSeller, iAccount] = [col('sku'), col('price'), col('seller'), col('account')];
  if (iSku < 0 || iPrice < 0) throw new AppError('BAD_REQUEST', 'The CSV header must contain sku and price', { details: { rule: 'csv_header', header } });
  const skus = [...new Set(lines.slice(1).map((l) => parseCsvLine(l)[iSku] ?? '').filter(Boolean))];
  const variants = skus.length ? await tx.select({ id: V.id, sku: V.sku }).from(V).where(and(eq(V.vendorId, ctx.vendorId), inArray(V.sku, skus), sql`${V.deletedAt} IS NULL`)) : [];
  const bySku = new Map(variants.map((v) => [v.sku, v.id]));
  const accounts = new Set((await tx.select({ id: A.id }).from(A).where(eq(A.vendorId, ctx.vendorId))).map((a) => a.id));
  const rows: ImportRowResult[] = [];
  const values: Array<typeof CP.$inferInsert> = [];
  lines.slice(1).forEach((line, i) => {
    const cells = parseCsvLine(line);
    const sku = cells[iSku] ?? '';
    const res = (status: ImportRowResult['status'], reason?: string) => rows.push({ line: i + 2, sku, status, ...(reason ? { reason } : {}) });
    const variantId = bySku.get(sku);
    const price = rupeesToMinor(cells[iPrice] ?? '');
    const account = iAccount >= 0 ? cells[iAccount] || null : null;
    if (!sku) return res('skipped', 'sku is empty');
    if (!variantId) return res('skipped', 'unknown sku');
    if (price === null) return res('skipped', 'price must be a positive amount in rupees, e.g. 499 or 499.50');
    if (account && !accounts.has(account)) return res('skipped', 'unknown marketplace account');
    values.push({ vendorId: ctx.vendorId, variantId, accountId: account, priceMinor: price, sellerName: (iSeller >= 0 ? cells[iSeller] : '') || null, source: 'import' });
    res('imported');
  });
  if (values.length) await tx.insert(CP).values(values);
  const imported = values.length;
  await effects(tx, ctx).audit({ action: 'pricing.competitor_prices_imported', resourceType: 'competitor_prices', resourceId: 'import', after: { total: rows.length, imported, skipped: rows.length - imported } });
  return { total: rows.length, imported, skipped: rows.length - imported, rows };
}

/** observations older than `days` are no basis for a price move: the engine ignores them */
export const STALE_COMPETITOR_DAYS = 14;
export const competitorIsFresh = (observedAt: Date, now = new Date()): boolean => now.getTime() - observedAt.getTime() <= STALE_COMPETITOR_DAYS * 86_400_000;
