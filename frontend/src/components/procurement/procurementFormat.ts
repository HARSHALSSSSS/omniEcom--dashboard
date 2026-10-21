import { formatCurrency, formatDate } from "@/utils/format";
import type { PurchaseOrder, PurchaseOrderStatus, PurchaseOrderSummary, SupplierStatus } from "@/types/procurement";

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  acknowledged: "Confirmed by supplier",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

/** short label for the narrow status tiles */
export const PO_TAB_LABEL: Record<PurchaseOrderStatus | "all", string> = {
  all: "All orders",
  draft: "Draft",
  submitted: "Submitted",
  acknowledged: "Confirmed",
  partially_received: "Part received",
  received: "Received",
  cancelled: "Cancelled",
};

export const PO_STATUS_CLASS: Record<PurchaseOrderStatus, string> = {
  draft: "bg-neutral-100 text-neutral-700 border-neutral-200",
  submitted: "bg-blue-50 text-blue-700 border-blue-200",
  acknowledged: "bg-indigo-50 text-indigo-700 border-indigo-200",
  partially_received: "bg-amber-50 text-amber-700 border-amber-200",
  received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

export const SUPPLIER_STATUS_LABEL: Record<SupplierStatus, string> = { active: "Active", inactive: "Inactive", blocked: "Blocked" };
export const SUPPLIER_STATUS_CLASS: Record<SupplierStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-neutral-100 text-neutral-700 border-neutral-200",
  blocked: "bg-rose-50 text-rose-700 border-rose-200",
};

/** the stages a purchase order can still be edited, approved, confirmed, received or cancelled in */
export const isDraft = (po: Pick<PurchaseOrderSummary, "status">): boolean => po.status === "draft";
export const canReceive = (po: Pick<PurchaseOrderSummary, "status">): boolean => po.status === "submitted" || po.status === "acknowledged" || po.status === "partially_received";
export const canCancel = (po: Pick<PurchaseOrderSummary, "status">): boolean => po.status !== "received" && po.status !== "cancelled";

// ---------------------------------------------------------------- money in, money out (no float drift)

/**
 * "1250", "1,250.5" or "1250.50" to integer minor units (125000, 125050, 125050), by string parsing only.
 * Returns null for anything else (letters, three decimals, negatives, empty).
 */
export function parseMinor(input: string): number | null {
  const text = input.trim().replace(/,/g, "");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? "").padEnd(2, "0"));
  const minor = whole * 100 + frac;
  return minor <= 1_000_000_000 ? minor : null;
}

/** integer minor units to the text of an input: 125000 -> "1250", 125050 -> "1250.50" */
export function minorToInput(minor: number): string {
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${minor < 0 ? "-" : ""}${whole}${frac === 0 ? "" : `.${String(frac).padStart(2, "0")}`}`;
}

/** whole units: "12" to 12, anything else null */
export function parseQty(input: string, max = 1_000_000): number | null {
  const t = input.trim();
  if (!/^\d{1,7}$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= max ? n : null;
}

/** GST of one line, in minor units, rounded half up (the same rule the server applies) */
export function lineTax(totalMinor: number, taxRateBps: number): number {
  return Math.floor((totalMinor * taxRateBps + 5000) / 10_000);
}

export interface DraftLineAmounts {
  quantity: number;
  unitCostMinor: number;
  taxRateBps: number;
}
/** subtotal, GST, shipping and total of a form, the way the server computes them (the server's numbers win after saving) */
export function previewTotals(lines: DraftLineAmounts[], shippingMinor: number) {
  let subtotalMinor = 0;
  let taxMinor = 0;
  for (const l of lines) {
    const total = l.quantity * l.unitCostMinor;
    subtotalMinor += total;
    taxMinor += lineTax(total, l.taxRateBps);
  }
  return { subtotalMinor, taxMinor, shippingMinor, totalMinor: subtotalMinor + taxMinor + shippingMinor };
}

export const gstLabel = (bps: number): string => `${bps % 100 === 0 ? bps / 100 : (bps / 100).toFixed(2)}%`;

// ---------------------------------------------------------------- dates

/** the calendar day (UTC) of an ISO timestamp, for `<input type="date">` */
export const dayOf = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : "");
/** a picked day as the ISO instant the server stores (the server compares UTC days) */
export const dayToIso = (day: string): string => `${day}T00:00:00.000Z`;
export const todayDay = (): string => new Date().toISOString().slice(0, 10);

export const dateOrDash = (iso: string | null | undefined): string => (iso ? formatDate(iso) : "—");

// ---------------------------------------------------------------- CSV and print

/** a cell safe for spreadsheets: quoted, and text that would run as a formula is neutralised */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
const csv = (rows: Array<Array<string | number | null | undefined>>): string => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
/** minor units as a plain decimal with two places: 125050 -> "1250.50" (a number cell, so nothing is neutralised) */
const rupees = (minor: number): number => Math.round(minor) / 100;

/** the order list, one row per purchase order (money in the currency's main unit, no symbols) */
export function ordersCsv(items: PurchaseOrderSummary[]): string {
  return csv([
    ["PO number", "Status", "Supplier", "Warehouse", "Order date", "Expected", "Lines", "Units ordered", "Units received", "Units damaged", "Subtotal", "GST", "Shipping", "Total", "Currency", "Late", "Reference"],
    ...items.map((p) => [p.poNumber, PO_STATUS_LABEL[p.status], p.supplierName, p.warehouseName, p.orderDate.slice(0, 10), p.expectedAt ? p.expectedAt.slice(0, 10) : "", p.itemsCount, p.unitsOrdered, p.unitsReceived, p.unitsDamaged, rupees(p.subtotalMinor), rupees(p.taxMinor), rupees(p.shippingMinor), rupees(p.totalMinor), p.currency, p.isLate ? "yes" : "no", p.reference]),
  ]);
}

/** one purchase order with its lines */
export function orderCsv(po: PurchaseOrder): string {
  return csv([
    ["PO number", po.poNumber],
    ["Status", PO_STATUS_LABEL[po.status]],
    ["Supplier", po.supplier.name],
    ["Supplier GSTIN", po.supplier.gstin],
    ["Deliver to", po.warehouse.name],
    ["Order date", po.orderDate.slice(0, 10)],
    ["Expected", po.expectedAt ? po.expectedAt.slice(0, 10) : ""],
    ["Payment terms", po.paymentTerms],
    ["Reference", po.reference],
    [],
    ["SKU", "Product", "Ordered", "Received", "Damaged", "Unit cost", "GST rate %", "GST", "Line total (before GST)"],
    ...po.lines.map((l) => [l.sku, l.title, l.quantityOrdered, l.quantityReceived, l.quantityDamaged, rupees(l.unitCostMinor), l.taxRateBps / 100, rupees(l.taxMinor), rupees(l.totalMinor)]),
    [],
    ["Subtotal", rupees(po.subtotalMinor)],
    ["GST", rupees(po.taxMinor)],
    ["Shipping", rupees(po.shippingMinor)],
    ["Total", rupees(po.totalMinor)],
    ["Currency", po.currency],
  ]);
}

const esc = (s: string | null | undefined): string => (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** a self-contained printable page of a purchase order (what goes to the supplier); everything is escaped */
export function orderPrintHtml(po: PurchaseOrder, businessName: string): string {
  const money = (m: number) => esc(formatCurrency(m, po.currency));
  const rows = po.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.sku)}</td><td>${esc(l.title)}</td><td class="n">${l.quantityOrdered}</td><td class="n">${money(l.unitCostMinor)}</td><td class="n">${esc(gstLabel(l.taxRateBps))}</td><td class="n">${money(l.totalMinor)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(po.poNumber)}</title><style>
body{font:13px/1.45 system-ui,Arial,sans-serif;color:#111;margin:32px}h1{font-size:20px;margin:0 0 4px}.muted{color:#555}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:20px 0}table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-size:11px;text-transform:uppercase}.n{text-align:right}
.tot{margin-left:auto;width:280px;margin-top:16px}.tot div{display:flex;justify-content:space-between;padding:3px 0}.tot .g{font-weight:700;border-top:2px solid #111;margin-top:4px;padding-top:6px}
@media print{body{margin:12mm}}</style></head><body>
<h1>Purchase order ${esc(po.poNumber)}</h1><div class="muted">${esc(businessName)} · ${esc(PO_STATUS_LABEL[po.status])} · ordered ${esc(formatDate(po.orderDate))}</div>
<div class="grid"><div><strong>Supplier</strong><br>${esc(po.supplier.name)}<br>${esc(po.supplier.contactPerson)}<br>${esc([po.supplier.city, po.supplier.state].filter(Boolean).join(", "))}<br>${po.supplier.gstin ? `GSTIN ${esc(po.supplier.gstin)}<br>` : ""}${esc(po.supplier.email)} ${esc(po.supplier.phone)}</div>
<div><strong>Deliver to</strong><br>${esc(po.warehouse.name)} (${esc(po.warehouse.code)})<br>Expected: ${po.expectedAt ? esc(formatDate(po.expectedAt)) : "to be confirmed"}<br>Payment terms: ${esc(po.paymentTerms) || "—"}<br>${po.reference ? `Reference: ${esc(po.reference)}` : ""}</div></div>
<table><thead><tr><th>SKU</th><th>Product</th><th class="n">Qty</th><th class="n">Unit cost</th><th class="n">GST</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot"><div><span>Subtotal</span><span>${money(po.subtotalMinor)}</span></div><div><span>GST</span><span>${money(po.taxMinor)}</span></div><div><span>Shipping</span><span>${money(po.shippingMinor)}</span></div><div class="g"><span>Total</span><span>${money(po.totalMinor)}</span></div></div>
${po.notes ? `<p><strong>Notes</strong><br>${esc(po.notes)}</p>` : ""}</body></html>`;
}

/** prints the page in a hidden frame (no pop-up blocker involved) */
export function printHtml(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const win = frame.contentWindow;
  const done = () => setTimeout(() => frame.remove(), 1000);
  win.onafterprint = done;
  setTimeout(() => {
    win.focus();
    win.print();
    done();
  }, 100);
}
