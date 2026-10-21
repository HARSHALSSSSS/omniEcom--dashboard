import { mulDivRound, splitHalf, splitProportional } from '../money';

/** Pure GST arithmetic for the register: rates, intra/inter-state split, rate-wise grouping, credit-note allocation. All integers. */
export const GST_SLABS_BPS = [0, 25, 100, 300, 500, 1200, 1800, 2800] as const;
const SNAP_BPS = 15;

/** The rate a line was taxed at, from its own recorded numbers (rounding noise snaps to the nearest standard slab). */
export function deriveRateBps(taxableMinor: number, taxMinor: number, catalogRateBps: number | null): number {
  if (taxableMinor <= 0) return catalogRateBps ?? 0;
  const raw = mulDivRound(taxMinor, 10_000, taxableMinor);
  const slab = GST_SLABS_BPS.find((s) => Math.abs(s - raw) <= SNAP_BPS);
  return slab ?? raw;
}

export interface LineIn { hsn: string | null; sku: string; qty: number; taxableMinor: number; taxMinor: number; catalogRateBps: number | null }

export interface SupplyRow {
  hsn: string;
  rateBps: number;
  qty: number;
  taxableMinor: number;
  igstMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  taxMinor: number;
  note: string;
}

export function splitTax(taxMinor: number, interState: boolean): { igst: number; cgst: number; sgst: number } {
  if (interState) return { igst: taxMinor, cgst: 0, sgst: 0 };
  return { igst: 0, ...splitHalf(taxMinor) };
}

/** Lines grouped by (HSN, rate): the rate-wise rows of one invoice or credit note. */
export function groupLines(lines: LineIn[], interState: boolean): SupplyRow[] {
  const groups = new Map<string, SupplyRow>();
  for (const l of lines) {
    const rate = deriveRateBps(l.taxableMinor, l.taxMinor, l.catalogRateBps);
    const hsn = l.hsn ?? '';
    const key = `${hsn}|${rate}`;
    const g = groups.get(key) ?? { hsn, rateBps: rate, qty: 0, taxableMinor: 0, igstMinor: 0, cgstMinor: 0, sgstMinor: 0, taxMinor: 0, note: '' };
    g.qty += l.qty; g.taxableMinor += l.taxableMinor; g.taxMinor += l.taxMinor;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const s = splitTax(g.taxMinor, interState);
    return { ...g, igstMinor: s.igst, cgstMinor: s.cgst, sgstMinor: s.sgst };
  }).sort((a, b) => (a.hsn === b.hsn ? a.rateBps - b.rateBps : a.hsn < b.hsn ? -1 : 1));
}

export interface InvoiceCalc { rows: SupplyRow[]; warnings: Array<{ code: string; message: string }> }

/**
 * The rows of one invoice. Goods lines come from the order items; shipping and any tax the order carries beyond its lines are
 * shown as a separate "charges" row so the invoice adds up to the order.
 */
export function invoiceRows(o: { lines: LineIn[]; shippingMinor: number; orderTaxMinor: number; interState: boolean }): InvoiceCalc {
  const warnings: InvoiceCalc['warnings'] = [];
  const rows = groupLines(o.lines, o.interState);
  const lineTax = o.lines.reduce((s, l) => s + l.taxMinor, 0);
  let extraTax = o.orderTaxMinor - lineTax;
  if (extraTax < 0) { warnings.push({ code: 'tax_below_lines', message: `Order tax (${o.orderTaxMinor}) is below the sum of its lines (${lineTax}); line tax is used` }); extraTax = 0; }
  if (o.shippingMinor > 0 || extraTax > 0) {
    const s = splitTax(extraTax, o.interState);
    rows.push({
      hsn: '', rateBps: deriveRateBps(o.shippingMinor, extraTax, null), qty: 0, taxableMinor: o.shippingMinor, igstMinor: s.igst, cgstMinor: s.cgst, sgstMinor: s.sgst, taxMinor: extraTax,
      note: 'Shipping and other charges',
    });
  }
  return { rows, warnings };
}

export interface GoodsLine extends LineIn { /** value of the returned goods (taxable + tax) */ gross: number }

/**
 * A credit note for a refund: the refunded amount (tax inclusive) is spread over the returned goods by value, then each share is
 * split into taxable value and tax at the line's own tax ratio. The parts add up to the refund exactly.
 */
export function creditNoteLines(refundMinor: number, goods: GoodsLine[]): LineIn[] {
  const shares = splitProportional(refundMinor, goods.map((g) => g.gross));
  return goods.map((g, i) => {
    const share = shares[i]!;
    const tax = g.gross > 0 ? mulDivRound(share, g.taxMinor, g.gross) : 0;
    return { hsn: g.hsn, sku: g.sku, qty: g.qty, taxableMinor: share - tax, taxMinor: tax, catalogRateBps: g.catalogRateBps };
  });
}
