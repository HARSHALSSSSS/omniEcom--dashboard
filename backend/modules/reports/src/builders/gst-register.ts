import { sql } from '@oms/database';
import { AppError } from '@oms/shared';
import { checkGstin, stateNameForCode, vendorGstRegistrations } from '@oms/mod-vendors';
import { creditNoteLines, groupLines, invoiceRows, type GoodsLine, type LineIn, type SupplyRow } from '../gst/calc';
import { stateCodeOf } from '../gst/state';
import { mulDivRound } from '../money';
import { localDateTime, localDay } from '../tz';
import type { Cell, Column, Sheet } from '../tabular';
import { MAX_SOURCE_ROWS, chunk, n, rows, str, tooLarge, ts, uuidList, type BuildCtx, type BuildResult } from './types';

type Reg = Awaited<ReturnType<typeof vendorGstRegistrations>>[number];
interface Warn { ref: string; code: string; message: string }

const pos = (code: string | null): string => (code ? `${code}-${stateNameForCode(code) ?? ''}` : '');

/** the buyer's GSTIN when the marketplace passed one (B2B); an invalid number is treated as B2C and reported */
function buyerGstin(buyer: Record<string, unknown>, ref: string, warns: Warn[]): string | null {
  const raw = str(buyer.gstin) ?? str(buyer.gstNumber) ?? str(buyer.gst_number) ?? str(buyer.buyerGstin);
  if (!raw) return null;
  const c = checkGstin(raw);
  if (c.valid) return c.gstin;
  warns.push({ ref, code: 'invalid_buyer_gstin', message: `Buyer GSTIN ${raw} is not valid (${c.problem}); treated as B2C` });
  return null;
}

interface Supply { reg: Reg; placeCode: string | null; interState: boolean; gstin: string | null }

function supplyOf(o: { ref: string; buyer: Record<string, unknown>; address: Record<string, unknown>; warehouseAddress: Record<string, unknown> | null }, regs: Reg[], warns: Warn[]): Supply {
  const whState = o.warehouseAddress ? stateCodeOf(o.warehouseAddress) : null;
  let reg = whState ? regs.find((r) => r.stateCode === whState) : undefined;
  if (!reg) {
    reg = regs[0]!;
    if (whState) warns.push({ ref: o.ref, code: 'supply_state_not_registered', message: `The dispatch warehouse is in ${pos(whState)} but the business has no active GSTIN there; the primary GSTIN is used` });
  }
  const gstin = buyerGstin(o.buyer, o.ref, warns);
  const placeCode = stateCodeOf(o.address) ?? (gstin ? gstin.slice(0, 2) : null);
  if (!placeCode) {
    warns.push({ ref: o.ref, code: 'place_of_supply_unknown', message: 'The delivery state is missing or not recognised; the supply is treated as intra-state' });
  }
  return { reg, placeCode, interState: placeCode !== null && placeCode !== reg.stateCode, gstin };
}

const COLS: Column[] = [
  { header: 'Invoice no', type: 'text', width: 16 }, { header: 'Invoice date', type: 'date', width: 13 }, { header: 'Marketplace', type: 'text', width: 13 }, { header: 'Account', type: 'text', width: 16 },
  { header: 'Type', type: 'text', width: 6 }, { header: 'Buyer GSTIN', type: 'text', width: 17 }, { header: 'Supplier GSTIN', type: 'text', width: 17 }, { header: 'Place of supply', type: 'text', width: 20 },
  { header: 'Supply type', type: 'text', width: 12 }, { header: 'HSN', type: 'text', width: 9 }, { header: 'Rate %', type: 'percent', width: 8 }, { header: 'Qty', type: 'int', width: 6 },
  { header: 'Taxable value', type: 'money', width: 14 }, { header: 'IGST', type: 'money', width: 12 }, { header: 'CGST', type: 'money', width: 12 }, { header: 'SGST/UTGST', type: 'money', width: 12 },
  { header: 'Total tax', type: 'money', width: 12 }, { header: 'Line total', type: 'money', width: 14 }, { header: 'Notes', type: 'text', width: 30 },
];

const sum = (rs: SupplyRow[], k: 'taxableMinor' | 'igstMinor' | 'cgstMinor' | 'sgstMinor' | 'taxMinor'): number => rs.reduce((s, r) => s + r[k], 0);

export async function buildGstRegister(ctx: BuildCtx): Promise<BuildResult> {
  const { tx, vendorId, timezone: tz, window: w } = ctx;
  const regs = (await vendorGstRegistrations(tx, vendorId)).filter((r) => r.status === 'active');
  if (regs.length === 0) {
    throw new AppError('INVALID_STATE', 'Add an active GSTIN under Settings > GSTIN before generating the GST register', { details: { rule: 'gst_registration_required' } });
  }
  const warns: Warn[] = [];
  const whs = new Map((await rows(tx, sql`select id, address from warehouses where vendor_id = ${vendorId}`)).map((r) => [String(r.id), (r.address ?? {}) as Record<string, unknown>]));

  // ---- invoices: every order of the period that was not cancelled
  const orders = await rows(tx, sql`select o.id, o.order_number, o.marketplace, a.display_name account_name, o.placed_at, o.shipping_minor, o.tax_minor, o.buyer, o.shipping_address, o.warehouse_id
    from orders o left join marketplace_accounts a on a.id = o.marketplace_account_id and a.vendor_id = o.vendor_id
    where o.vendor_id = ${vendorId} and o.placed_at >= ${w.from} and o.placed_at < ${w.to} and o.status <> 'cancelled' order by o.placed_at, o.order_number limit ${MAX_SOURCE_ROWS + 1}`);
  if (orders.length > MAX_SOURCE_ROWS) throw tooLarge('orders');
  const itemsByOrder = new Map<string, LineIn[]>();
  for (const ids of chunk(orders.map((o) => String(o.id)), 500)) {
    const items = await rows(tx, sql`select i.order_id, i.sku, i.quantity, (i.unit_price_minor * i.quantity - i.discount_minor) taxable, i.tax_minor, p.hsn_code, coalesce(v.tax_rate_bps, p.gst_rate_bps) rate
      from order_items i left join product_variants v on v.id = i.variant_id and v.vendor_id = i.vendor_id left join products p on p.id = v.product_id and p.vendor_id = v.vendor_id
      where i.vendor_id = ${vendorId} and i.order_id in (${uuidList(ids)}) and i.status <> 'cancelled' order by i.created_at, i.id`);
    for (const i of items) {
      const k = String(i.order_id);
      (itemsByOrder.get(k) ?? itemsByOrder.set(k, []).get(k)!).push({ hsn: str(i.hsn_code), sku: String(i.sku), qty: n(i.quantity), taxableMinor: n(i.taxable), taxMinor: n(i.tax_minor), catalogRateBps: i.rate === null ? null : n(i.rate) });
    }
  }

  const body: Cell[][] = [];
  const all: Array<{ b2b: boolean; rows: SupplyRow[] }> = [];
  const outward: SupplyRow[] = [];
  for (const o of orders) {
    const ref = String(o.order_number);
    const s = supplyOf({ ref, buyer: (o.buyer ?? {}) as Record<string, unknown>, address: (o.shipping_address ?? {}) as Record<string, unknown>, warehouseAddress: o.warehouse_id ? whs.get(String(o.warehouse_id)) ?? null : null }, regs, warns);
    const lines = itemsByOrder.get(String(o.id)) ?? [];
    if (lines.length === 0) warns.push({ ref, code: 'no_items', message: 'The order has no billable items; only its shipping charges (if any) are listed' });
    const calc = invoiceRows({ lines, shippingMinor: n(o.shipping_minor), orderTaxMinor: n(o.tax_minor), interState: s.interState });
    for (const x of calc.warnings) warns.push({ ref, ...x });
    if (lines.some((l) => !l.hsn)) warns.push({ ref, code: 'missing_hsn', message: 'An item has no HSN code (unmapped SKU or product without HSN)' });
    const date = localDay(ts(o.placed_at), tz);
    for (const r of calc.rows) {
      body.push([ref, date, String(o.marketplace), str(o.account_name), s.gstin ? 'B2B' : 'B2C', s.gstin, s.reg.gstin, pos(s.placeCode ?? s.reg.stateCode), s.interState ? 'Inter-State' : 'Intra-State',
        r.hsn || null, r.rateBps, r.qty || null, r.taxableMinor, r.igstMinor, r.cgstMinor, r.sgstMinor, r.taxMinor, r.taxableMinor + r.taxMinor, r.note || null]);
      if (r.hsn || !r.note) outward.push(r);
    }
    all.push({ b2b: s.gstin !== null, rows: calc.rows });
  }
  const invoiceSheet: Sheet = {
    name: 'Invoices', title: 'Outward supplies (invoice level, rate-wise)', columns: COLS, rows: body,
    totals: ['Total', null, null, null, null, null, null, null, null, null, null, body.reduce((s, r) => s + (Number(r[11]) || 0), 0), ...[12, 13, 14, 15, 16, 17].map((k) => body.reduce((s, r) => s + Number(r[k]), 0)), null],
    notes: ['Invoice no is the order number and the invoice date is the order date. Cancelled orders are excluded.', 'Tax amounts are the tax recorded on each order line; CGST and SGST are equal halves (an odd paisa goes to SGST).'],
  };

  // ---- credit notes: refunds that were processed in the period
  const returns = await rows(tx, sql`select r.id, r.number, r.refunded_at, r.refund_amount_minor, o.order_number, o.placed_at, o.marketplace, a.display_name account_name, o.buyer, o.shipping_address, o.warehouse_id, o.subtotal_minor, o.discount_minor, o.tax_minor
    from return_orders r join orders o on o.id = r.order_id and o.vendor_id = r.vendor_id left join marketplace_accounts a on a.id = o.marketplace_account_id and a.vendor_id = o.vendor_id
    where r.vendor_id = ${vendorId} and r.refund_status = 'processed' and r.refund_amount_minor > 0 and r.refunded_at >= ${w.from} and r.refunded_at < ${w.to} order by r.refunded_at, r.number limit ${MAX_SOURCE_ROWS + 1}`);
  if (returns.length > MAX_SOURCE_ROWS) throw tooLarge('credit notes');
  const goodsByReturn = new Map<string, GoodsLine[]>();
  for (const ids of chunk(returns.map((r) => String(r.id)), 500)) {
    const items = await rows(tx, sql`select ri.return_order_id, ri.quantity, oi.quantity order_qty, oi.sku, oi.unit_price_minor, oi.discount_minor, oi.tax_minor, p.hsn_code, coalesce(v.tax_rate_bps, p.gst_rate_bps) rate
      from return_items ri join order_items oi on oi.id = ri.order_item_id and oi.vendor_id = ri.vendor_id left join product_variants v on v.id = oi.variant_id and v.vendor_id = oi.vendor_id left join products p on p.id = v.product_id and p.vendor_id = v.vendor_id
      where ri.vendor_id = ${vendorId} and ri.return_order_id in (${uuidList(ids)})`);
    for (const i of items) {
      const oq = n(i.order_qty);
      const taxable = mulDivRound(n(i.unit_price_minor) * oq - n(i.discount_minor), n(i.quantity), oq);
      const tax = mulDivRound(n(i.tax_minor), n(i.quantity), oq);
      const k = String(i.return_order_id);
      (goodsByReturn.get(k) ?? goodsByReturn.set(k, []).get(k)!).push({ hsn: str(i.hsn_code), sku: String(i.sku), qty: n(i.quantity), taxableMinor: taxable, taxMinor: tax, catalogRateBps: i.rate === null ? null : n(i.rate), gross: taxable + tax });
    }
  }
  const cnBody: Cell[][] = [];
  const cnRows: SupplyRow[] = [];
  const cnB2b = new Set<string>();
  for (const r of returns) {
    const ref = String(r.number);
    const s = supplyOf({ ref, buyer: (r.buyer ?? {}) as Record<string, unknown>, address: (r.shipping_address ?? {}) as Record<string, unknown>, warehouseAddress: r.warehouse_id ? whs.get(String(r.warehouse_id)) ?? null : null }, regs, warns);
    const refund = n(r.refund_amount_minor);
    let goods = goodsByReturn.get(String(r.id)) ?? [];
    if (goods.length === 0) {
      const taxable = n(r.subtotal_minor) - n(r.discount_minor);
      goods = [{ hsn: null, sku: '', qty: 0, taxableMinor: taxable, taxMinor: n(r.tax_minor), catalogRateBps: null, gross: taxable + n(r.tax_minor) }];
      warns.push({ ref, code: 'credit_note_without_items', message: 'The return lists no items; the credit note is spread over the whole order' });
    }
    const goodsValue = goods.reduce((x, g) => x + g.gross, 0);
    const groups = groupLines(creditNoteLines(refund, goods), s.interState);
    const note = Math.abs(goodsValue - refund) > 1 ? 'Refund differs from the value of the returned goods (shipping or goodwill included)' : '';
    for (const g of groups) {
      cnBody.push([ref, localDay(ts(r.refunded_at), tz), String(r.order_number), localDay(ts(r.placed_at), tz), s.gstin ? 'B2B' : 'B2C', s.gstin, pos(s.placeCode ?? s.reg.stateCode), s.interState ? 'Inter-State' : 'Intra-State',
        g.hsn || null, g.rateBps, g.taxableMinor, g.igstMinor, g.cgstMinor, g.sgstMinor, g.taxMinor, g.taxableMinor + g.taxMinor, note || null]);
      cnRows.push(g);
    }
    if (s.gstin) cnB2b.add(ref);
  }
  const cnCols: Column[] = [
    { header: 'Credit note no', type: 'text', width: 16 }, { header: 'Credit note date', type: 'date', width: 13 }, { header: 'Original invoice', type: 'text', width: 16 }, { header: 'Invoice date', type: 'date', width: 13 },
    { header: 'Type', type: 'text', width: 6 }, { header: 'Buyer GSTIN', type: 'text', width: 17 }, { header: 'Place of supply', type: 'text', width: 20 }, { header: 'Supply type', type: 'text', width: 12 },
    { header: 'HSN', type: 'text', width: 9 }, { header: 'Rate %', type: 'percent', width: 8 }, { header: 'Taxable value', type: 'money', width: 14 }, { header: 'IGST', type: 'money', width: 12 },
    { header: 'CGST', type: 'money', width: 12 }, { header: 'SGST/UTGST', type: 'money', width: 12 }, { header: 'Total tax', type: 'money', width: 12 }, { header: 'Credit note value', type: 'money', width: 14 }, { header: 'Notes', type: 'text', width: 30 },
  ];
  const creditSheet: Sheet = {
    name: 'Credit notes', title: 'Credit notes (refunds processed in the period)', columns: cnCols, rows: cnBody,
    totals: ['Total', ...Array(9).fill(null), ...[10, 11, 12, 13, 14, 15].map((k) => cnBody.reduce((s, r) => s + Number(r[k]), 0)), null],
    notes: ['A credit note is raised for every refund that was marked as processed in the period; the refund is treated as tax inclusive.'],
  };

  // ---- HSN summary (outward supplies)
  const hsn = new Map<string, { hsn: string; rateBps: number; qty: number; taxable: number; igst: number; cgst: number; sgst: number }>();
  for (const r of outward) {
    const key = `${r.hsn}|${r.rateBps}`;
    const h = hsn.get(key) ?? { hsn: r.hsn, rateBps: r.rateBps, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    h.qty += r.qty; h.taxable += r.taxableMinor; h.igst += r.igstMinor; h.cgst += r.cgstMinor; h.sgst += r.sgstMinor;
    hsn.set(key, h);
  }
  const hsnList = [...hsn.values()].sort((a, b) => (a.hsn === b.hsn ? a.rateBps - b.rateBps : a.hsn < b.hsn ? -1 : 1));
  const hsnSheet: Sheet = {
    name: 'HSN summary', title: 'HSN-wise summary of outward supplies',
    columns: [{ header: 'HSN', type: 'text', width: 12 }, { header: 'UQC', type: 'text', width: 8 }, { header: 'Total quantity', type: 'int', width: 12 }, { header: 'Rate %', type: 'percent', width: 8 }, { header: 'Taxable value', type: 'money', width: 14 },
      { header: 'IGST', type: 'money', width: 12 }, { header: 'CGST', type: 'money', width: 12 }, { header: 'SGST/UTGST', type: 'money', width: 12 }, { header: 'Total value', type: 'money', width: 14 }],
    rows: hsnList.map((h) => [h.hsn || '(missing)', 'PCS', h.qty, h.rateBps, h.taxable, h.igst, h.cgst, h.sgst, h.taxable + h.igst + h.cgst + h.sgst]),
    totals: ['Total', null, hsnList.reduce((s, h) => s + h.qty, 0), null, ...(['taxable', 'igst', 'cgst', 'sgst'] as const).map((k) => hsnList.reduce((s, h) => s + h[k], 0)), hsnList.reduce((s, h) => s + h.taxable + h.igst + h.cgst + h.sgst, 0)],
    notes: ['Goods lines only: shipping and other charges are not part of the HSN summary. Credit notes are listed on their own sheet.'],
  };

  // ---- summary
  const b2b = all.filter((x) => x.b2b).flatMap((x) => x.rows);
  const b2c = all.filter((x) => !x.b2b).flatMap((x) => x.rows);
  const line = (label: string, count: number, rs: SupplyRow[], sign = 1): Cell[] => [label, null, count, ...(['taxableMinor', 'igstMinor', 'cgstMinor', 'sgstMinor', 'taxMinor'] as const).map((k) => sign * sum(rs, k))];
  const outwardRows = [...b2b, ...b2c];
  const summary: Sheet = {
    name: 'Summary', title: 'GST register summary',
    columns: [{ header: 'Section', type: 'text', width: 30 }, { header: 'Details', type: 'text', width: 30 }, { header: 'Documents', type: 'int', width: 11 }, { header: 'Taxable value', type: 'money', width: 15 },
      { header: 'IGST', type: 'money', width: 14 }, { header: 'CGST', type: 'money', width: 14 }, { header: 'SGST/UTGST', type: 'money', width: 14 }, { header: 'Total tax', type: 'money', width: 14 }],
    rows: [
      ['Business', ctx.businessName, null, null, null, null, null, null],
      ['Period', w.label, null, null, null, null, null, null],
      ['Supplier GSTIN(s)', regs.map((r) => r.gstin).join(', '), null, null, null, null, null, null],
      line('B2B supplies (buyer GSTIN known)', all.filter((x) => x.b2b).length, b2b),
      line('B2C supplies', all.filter((x) => !x.b2b).length, b2c),
      line('Total outward supplies', all.length, outwardRows),
      line('Credit notes', new Set(cnBody.map((r) => r[0])).size, cnRows, -1),
      ['Net supplies less credit notes', null, null, ...(['taxableMinor', 'igstMinor', 'cgstMinor', 'sgstMinor', 'taxMinor'] as const).map((k) => sum(outwardRows, k) - sum(cnRows, k))],
      ['Warnings', 'see the Warnings sheet', warns.length, null, null, null, null, null],
    ],
    notes: [`Generated ${localDateTime(ctx.now, tz)} (${tz}). Prepared from marketplace orders; review before filing.`, `${cnB2b.size} credit note(s) are B2B.`],
  };

  const sheets = [summary, invoiceSheet, creditSheet, hsnSheet];
  const shown = warns.slice(0, 2000);
  if (warns.length > 0) {
    sheets.push({
      name: 'Warnings', title: 'Data quality warnings', rows: shown.map((x) => [x.ref, x.code, x.message]),
      columns: [{ header: 'Reference', type: 'text', width: 18 }, { header: 'Code', type: 'text', width: 26 }, { header: 'Message', type: 'text', width: 90 }],
      notes: warns.length > shown.length ? [`Only the first ${shown.length} of ${warns.length} warnings are listed.`] : undefined,
    });
  }
  return {
    document: { type: 'gst_register', title: 'GST tax and sales invoicing register (GSTR-1 style)', businessName: ctx.businessName, subtitle: w.label, generatedAt: ctx.now, timezone: tz, sheets, primarySheet: 1 },
    meta: { warnings: warns.length, notes: [] },
  };
}
