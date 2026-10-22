import { and, eq, inArray, schema, sql, type Tx } from '@oms/database';

const R = schema.importRows; // (not imported from ./store: the session DTO there needs EMPTY_PLAN)

export interface PlanSummary {
  /** distinct products in the file */
  products: number;
  plan: { create: number; update: number; addVariant: number; skip: number };
  /** the planned effect of committing the rows that are ready (valid, with warnings, or already imported) */
  scope: { products: number; newProducts: number; updates: number };
}

export const EMPTY_PLAN: PlanSummary = { products: 0, plan: { create: 0, update: 0, addVariant: 0, skip: 0 }, scope: { products: 0, newProducts: 0, updates: 0 } };

const PLAN = sql<string>`coalesce(${R.data}->'__meta'->>'plan', '')`;
const NEW_ROW = sql`coalesce(${R.data}->'__meta'->>'createNew', 'false') = 'true'`;
const CODE = sql`lower(${R.productCode})`;
const READY = ['valid', 'warning', 'committed'];

/**
 * What committing the ready rows would do, from the rows' plan (decided by the duplicate strategy and the seller's per-row decisions):
 * create = new products, update = existing SKUs updated, addVariant = new SKUs under an existing product, skip = rows left out.
 * A row that is created as a new product although its SKU exists counts as one new product of its own.
 */
export async function planSummary(tx: Tx, vendorId: string, sessionId: string): Promise<PlanSummary> {
  const mine = and(eq(R.vendorId, vendorId), eq(R.sessionId, sessionId));
  const [file] = await tx.select({ n: sql<number>`count(distinct ${CODE})::int` }).from(R).where(and(mine, sql`${R.productCode} is not null`));
  const byPlan = await tx.select({ plan: PLAN, n: sql<number>`count(*)::int`, codes: sql<number>`count(distinct ${CODE}) filter (where not (${NEW_ROW}))::int`, fresh: sql<number>`count(*) filter (where ${NEW_ROW})::int` })
    .from(R).where(and(mine, inArray(R.status, READY))).groupBy(PLAN);
  const skipped = await tx.select({ n: sql<number>`count(*)::int` }).from(R).where(and(mine, inArray(R.status, ['skipped', 'ignored'])));
  const of = (p: string) => byPlan.find((x) => x.plan === p);
  const create = of('create');
  const newProducts = (create?.codes ?? 0) + (create?.fresh ?? 0); // forced-new rows share a code with an existing product: count them per row
  const [touched] = await tx.select({ n: sql<number>`count(distinct ${CODE})::int` }).from(R).where(and(mine, inArray(R.status, READY), sql`${PLAN} in ('update', 'add_variant')`));
  const updates = touched?.n ?? 0;
  return {
    products: file?.n ?? 0,
    plan: { create: create?.n ?? 0, update: of('update')?.n ?? 0, addVariant: of('add_variant')?.n ?? 0, skip: skipped[0]?.n ?? 0 },
    scope: { products: newProducts + updates, newProducts, updates },
  };
}
