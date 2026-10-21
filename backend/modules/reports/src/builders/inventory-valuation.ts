import { sql } from '@oms/database';
import { Errors } from '@oms/shared';
import { localDay } from '../tz';
import type { Cell, Sheet } from '../tabular';
import { MAX_SOURCE_ROWS, n, nul, rows, str, tooLarge, type BuildCtx, type BuildResult } from './types';

export type CostSource = 'weighted_average' | 'variant_cost';

/** Pure: the unit cost of a variant and where it comes from (purchase receipts first, then the variant's own cost price). */
export function unitCost(receipt: { qty: number; costMinor: number } | undefined, variantCostMinor: number | null): { unitMinor: number; source: CostSource } | null {
  if (receipt && receipt.qty > 0) return { unitMinor: Math.round(receipt.costMinor / receipt.qty), source: 'weighted_average' };
  return variantCostMinor === null ? null : { unitMinor: variantCostMinor, source: 'variant_cost' };
}

const SOURCE_TEXT: Record<CostSource, string> = { weighted_average: 'Weighted average of purchase receipts', variant_cost: 'Variant cost price' };

export async function buildInventoryValuation(ctx: BuildCtx): Promise<BuildResult> {
  const { tx, vendorId, window: w, timezone: tz } = ctx;
  const asOfEnd = w.to; // start of the day after the as-of day
  const historic = asOfEnd.getTime() <= ctx.now.getTime();
  const warehouseId = typeof ctx.params.warehouseId === 'string' ? ctx.params.warehouseId : null;
  let categoryFilter = sql``;
  if (typeof ctx.params.categoryId === 'string') {
    const [cat] = await rows(tx, sql`select path from categories where id = ${ctx.params.categoryId}::uuid and vendor_id = ${vendorId} and deleted_at is null`);
    if (!cat) throw Errors.notFound('Category', ctx.params.categoryId);
    categoryFilter = sql`and (c.path = ${String(cat.path)} or c.path like ${`${String(cat.path)}/%`})`;
  }
  const whFilter = warehouseId ? sql`and i.warehouse_id = ${warehouseId}::uuid` : sql``;
  const after = historic ? sql`left join (select variant_id, warehouse_id, sum(delta_on_hand) d from inventory_movements where vendor_id = ${vendorId} and created_at >= ${asOfEnd} group by 1, 2) mv on mv.variant_id = i.variant_id and mv.warehouse_id = i.warehouse_id` : sql``;
  const qtyExpr = historic ? sql`(i.quantity_on_hand - coalesce(mv.d, 0))` : sql`i.quantity_on_hand`;
  const stock = await rows(tx, sql`select i.variant_id, i.warehouse_id, w.code wh_code, w.name wh_name, v.sku, p.title, v.cost_price_minor, c.name category, ${qtyExpr}::int qty
    from inventory i join warehouses w on w.id = i.warehouse_id and w.vendor_id = i.vendor_id join product_variants v on v.id = i.variant_id and v.vendor_id = i.vendor_id
      join products p on p.id = v.product_id and p.vendor_id = v.vendor_id left join categories c on c.id = p.category_id and c.vendor_id = p.vendor_id ${after}
    where i.vendor_id = ${vendorId} ${whFilter} ${categoryFilter} and ${qtyExpr} > 0 order by w.code, c.name nulls last, v.sku limit ${MAX_SOURCE_ROWS + 1}`);
  if (stock.length > MAX_SOURCE_ROWS) throw tooLarge('stock lines');

  const receipts = new Map<string, { qty: number; costMinor: number }>();
  for (const r of await rows(tx, sql`select (it->>'variantId') variant_id, sum((it->>'received')::bigint) qty, sum((it->>'received')::bigint * l.unit_cost_minor) cost
    from purchase_order_receipts r cross join lateral jsonb_array_elements(r.items) it join purchase_order_lines l on l.id = (it->>'lineId')::uuid and l.vendor_id = r.vendor_id
    where r.vendor_id = ${vendorId} and r.received_at < ${asOfEnd} group by 1`)) receipts.set(String(r.variant_id), { qty: n(r.qty), costMinor: n(r.cost) });

  const lines: Cell[][] = [];
  const missing: Cell[][] = [];
  const groups = new Map<string, { wh: string; cat: string; skus: number; units: number; value: number }>();
  for (const s of stock) {
    const qty = n(s.qty);
    const cost = unitCost(receipts.get(String(s.variant_id)), nul(s.cost_price_minor));
    const wh = `${String(s.wh_code)} - ${String(s.wh_name)}`;
    const cat = str(s.category) ?? 'Uncategorised';
    if (!cost) { missing.push([String(s.sku), String(s.title), wh, cat, qty]); continue; }
    const value = qty * cost.unitMinor;
    lines.push([wh, cat, String(s.sku), String(s.title), qty, cost.unitMinor, SOURCE_TEXT[cost.source], value]);
    const g = groups.get(`${wh}|${cat}`) ?? { wh, cat, skus: 0, units: 0, value: 0 };
    g.skus++; g.units += qty; g.value += value;
    groups.set(`${wh}|${cat}`, g);
  }
  const grouped = [...groups.values()];
  const asOf = localDay(new Date(asOfEnd.getTime() - 1), tz);
  const summary: Sheet = {
    name: 'Summary', title: `Inventory valuation as of ${asOf}`,
    columns: [{ header: 'Warehouse', type: 'text', width: 28 }, { header: 'Category', type: 'text', width: 26 }, { header: 'SKUs', type: 'int', width: 8 }, { header: 'Units', type: 'int', width: 10 }, { header: 'Value', type: 'money', width: 16 }],
    rows: grouped.map((g) => [g.wh, g.cat, g.skus, g.units, g.value]),
    totals: ['Total', null, grouped.reduce((s, g) => s + g.skus, 0), grouped.reduce((s, g) => s + g.units, 0), grouped.reduce((s, g) => s + g.value, 0)],
    notes: [
      `Business: ${ctx.businessName}. As of end of day ${asOf} (${tz}). Amounts in rupees.`,
      'Units are good stock on hand (reserved units included, damaged, returned and quarantined units excluded), rebuilt from the stock ledger for past dates.',
      'Unit cost is the weighted average cost of purchase order receipts up to the date; without receipts the variant cost price is used. This is not a FIFO layer valuation.',
      missing.length ? `${missing.length} stock line(s) have no cost and are not valued: see the Missing cost sheet.` : 'Every stock line has a cost.',
    ],
  };
  const detail: Sheet = {
    name: 'Stock lines', title: 'Stock lines valued', rows: lines,
    columns: [{ header: 'Warehouse', type: 'text', width: 26 }, { header: 'Category', type: 'text', width: 22 }, { header: 'SKU', type: 'text', width: 18 }, { header: 'Product', type: 'text', width: 34 }, { header: 'Units', type: 'int', width: 8 },
      { header: 'Unit cost', type: 'money', width: 12 }, { header: 'Cost basis', type: 'text', width: 34 }, { header: 'Value', type: 'money', width: 15 }],
    totals: ['Total', null, null, null, lines.reduce((s, r) => s + Number(r[4]), 0), null, null, lines.reduce((s, r) => s + Number(r[7]), 0)],
  };
  const sheets = [summary, detail];
  if (missing.length) {
    sheets.push({ name: 'Missing cost', title: 'Stock without a cost (not valued)', rows: missing, columns: [{ header: 'SKU', type: 'text', width: 18 }, { header: 'Product', type: 'text', width: 34 }, { header: 'Warehouse', type: 'text', width: 26 }, { header: 'Category', type: 'text', width: 22 }, { header: 'Units', type: 'int', width: 8 }] });
  }
  return {
    document: { type: 'inventory_valuation', title: 'Inventory valuation statement', businessName: ctx.businessName, subtitle: `As of ${asOf}`, generatedAt: ctx.now, timezone: tz, sheets, primarySheet: 1 },
    meta: { warnings: missing.length, notes: missing.length ? [`${missing.length} stock line(s) without cost`] : [] },
  };
}
