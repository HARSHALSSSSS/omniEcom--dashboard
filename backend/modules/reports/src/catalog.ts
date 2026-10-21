import { sql, type Tx } from '@oms/database';
import { buildGstRegister } from './builders/gst-register';
import { buildInventoryValuation } from './builders/inventory-valuation';
import { buildInventory, buildOrders, buildProducts, buildReturns, buildSales } from './builders/standard';
import { buildSettlementAudit } from './builders/settlement-audit';
import { n, rows, type BuildCtx, type BuildResult } from './builders/types';
import { invalid, makeWindow, parseParams, resolveWindow, WINDOW_PARAMS, type ParamSpec, type ResolvedWindow } from './params';
import { REPORT_FORMATS, type ReportFormat } from './tabular';
import { localDay, parseDay } from './tz';

export const REPORT_TYPES = ['gst_register', 'settlement_audit', 'inventory_valuation', 'sales', 'orders', 'inventory', 'products', 'returns'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface ReportDef {
  type: ReportType;
  title: string;
  description: string;
  category: 'compliance' | 'finance' | 'inventory' | 'sales' | 'operations';
  formats: readonly ReportFormat[];
  defaultFormat: ReportFormat;
  schedulable: boolean;
  params: ParamSpec[];
  /** what the sheets of the xlsx / pdf are, and what the single-table csv contains */
  sheets: string[];
  csvSheet: string;
  /** the window the report covers for these parameters */
  resolve(params: Record<string, unknown>, tz: string, now: Date): ResolvedWindow;
  /** cheap size guess (source rows) deciding between inline generation and a background job */
  estimate(tx: Tx, vendorId: string, window: ResolvedWindow): Promise<number>;
  build(ctx: BuildCtx): Promise<BuildResult>;
}

const ALL = REPORT_FORMATS;
const MP: ParamSpec = { key: 'marketplace', type: 'string', label: 'Marketplace', description: 'Only this marketplace code (for example amazon_in).', relative: true };
const GRAN: ParamSpec = { key: 'granularity', type: 'enum', label: 'Trend granularity', description: 'Bucket of the trend sheet.', options: ['day', 'week', 'month'], default: 'day', relative: true };
const WAREHOUSE: ParamSpec = { key: 'warehouseId', type: 'uuid', label: 'Warehouse', description: 'Only this warehouse.', relative: true };

const countOrders = async (tx: Tx, vendorId: string, w: ResolvedWindow): Promise<number> =>
  n((await rows(tx, sql`select count(*)::int c from orders where vendor_id = ${vendorId} and placed_at >= ${w.from} and placed_at < ${w.to}`))[0]?.c);
const small = async (): Promise<number> => 0;

/** the as-of day of the valuation: `asOf` or today */
function asOfWindow(params: Record<string, unknown>, tz: string, now: Date): ResolvedWindow {
  const day = typeof params.asOf === 'string' ? params.asOf : localDay(now, tz);
  if (!parseDay(day)) throw invalid('asOf is not a calendar date', 'bad_date', 'params.asOf');
  if (day > localDay(now, tz)) throw invalid('asOf cannot be in the future', 'bad_date', 'params.asOf');
  return makeWindow(day, day, tz, day);
}

export const REPORT_DEFS: Record<ReportType, ReportDef> = {
  gst_register: {
    type: 'gst_register', title: 'GST tax and sales invoicing register', category: 'compliance', formats: ALL, defaultFormat: 'xlsx', schedulable: true,
    description: 'GSTR-1 style register of outward supplies: invoice level rows with place of supply, B2B or B2C, HSN, taxable value and CGST/SGST or IGST, credit notes for processed refunds, and an HSN summary.',
    params: WINDOW_PARAMS, sheets: ['Summary', 'Invoices', 'Credit notes', 'HSN summary', 'Warnings'], csvSheet: 'Invoices',
    resolve: (p, tz, now) => resolveWindow(p, tz, now, 'this_month'), estimate: countOrders, build: buildGstRegister,
  },
  settlement_audit: {
    type: 'settlement_audit', title: 'Marketplace settlement and deduction audit', category: 'finance', formats: ALL, defaultFormat: 'csv', schedulable: true,
    description: 'For orders delivered in the period: expected payout from order value, recorded marketplace fees, penalties and refunds, fees compared with each account\'s commission terms, and missing settlement data flagged.',
    params: [...WINDOW_PARAMS, { key: 'accountId', type: 'uuid', label: 'Marketplace account', description: 'Only this account.', relative: true }, { key: 'toleranceMinor', type: 'integer', label: 'Variance tolerance (paise)', description: 'Fee differences up to this many paise per order count as a match.', default: 100, min: 0, max: 100_000_000, relative: true }],
    sheets: ['Summary by account', 'Order detail'], csvSheet: 'Order detail',
    resolve: (p, tz, now) => resolveWindow(p, tz, now, 'previous_month'), estimate: countOrders, build: buildSettlementAudit,
  },
  inventory_valuation: {
    type: 'inventory_valuation', title: 'Inventory valuation', category: 'inventory', formats: ALL, defaultFormat: 'pdf', schedulable: true,
    description: 'Stock on hand as of a date, per warehouse and category, valued at the weighted average cost of purchase receipts (variant cost price otherwise). Stock without a cost is listed separately.',
    params: [{ key: 'asOf', type: 'date', label: 'As of', description: 'The day, YYYY-MM-DD (default today). Past dates are rebuilt from the stock ledger.', relative: false }, WAREHOUSE,
      { key: 'categoryId', type: 'uuid', label: 'Category', description: 'Only this category and its sub-categories.', relative: true }],
    sheets: ['Summary', 'Stock lines', 'Missing cost'], csvSheet: 'Stock lines',
    resolve: asOfWindow,
    estimate: async (tx, vendorId) => n((await rows(tx, sql`select count(*)::int c from inventory where vendor_id = ${vendorId}`))[0]?.c), build: buildInventoryValuation,
  },
  sales: {
    type: 'sales', title: 'Sales report', category: 'sales', formats: ALL, defaultFormat: 'xlsx', schedulable: true,
    description: 'Orders placed in the period (cancelled excluded): totals, a trend, and the split by marketplace and payment method.',
    params: [...WINDOW_PARAMS, GRAN, MP], sheets: ['Summary', 'Trend', 'By marketplace', 'By payment method'], csvSheet: 'Trend',
    resolve: (p, tz, now) => resolveWindow(p, tz, now, 'last_30_days'), estimate: small, build: buildSales,
  },
  orders: {
    type: 'orders', title: 'Order report', category: 'operations', formats: ALL, defaultFormat: 'xlsx', schedulable: true,
    description: 'Order volume by status and marketplace, cancellation rate and reasons, and average time to dispatch and deliver.',
    params: [...WINDOW_PARAMS, GRAN, MP], sheets: ['Summary', 'Trend', 'By status', 'By marketplace', 'Cancellations'], csvSheet: 'Trend',
    resolve: (p, tz, now) => resolveWindow(p, tz, now, 'last_30_days'), estimate: small, build: buildOrders,
  },
  inventory: {
    type: 'inventory', title: 'Inventory report', category: 'inventory', formats: ALL, defaultFormat: 'xlsx', schedulable: true,
    description: 'Stock now per warehouse (on hand, reserved, damaged, returned, value at cost), ledger activity in the period and the lines below their reorder level.',
    params: [...WINDOW_PARAMS, WAREHOUSE], sheets: ['Summary', 'By warehouse', 'Movements', 'Low stock'], csvSheet: 'By warehouse',
    resolve: (p, tz, now) => resolveWindow(p, tz, now, 'last_30_days'), estimate: small, build: buildInventory,
  },
  products: {
    type: 'products', title: 'Product performance report', category: 'sales', formats: ALL, defaultFormat: 'xlsx', schedulable: true,
    description: 'Best selling SKUs by revenue or units with their return rate.',
    params: [...WINDOW_PARAMS, MP, { key: 'sort', type: 'enum', label: 'Sort by', description: 'Ranking.', options: ['revenue', 'units'], default: 'revenue', relative: true }, { key: 'limit', type: 'integer', label: 'Rows', description: 'How many SKUs (1-200).', default: 200, min: 1, max: 200, relative: true }],
    sheets: ['Products'], csvSheet: 'Products',
    resolve: (p, tz, now) => resolveWindow(p, tz, now, 'last_30_days'), estimate: small, build: buildProducts,
  },
  returns: {
    type: 'returns', title: 'Returns report', category: 'operations', formats: ALL, defaultFormat: 'xlsx', schedulable: true,
    description: 'Returns by status, source and reason, units received and restocked, dispositions and refunds.',
    params: WINDOW_PARAMS, sheets: ['Summary', 'By status', 'By reason', 'By source', 'Dispositions', 'Refunds'], csvSheet: 'By status',
    resolve: (p, tz, now) => resolveWindow(p, tz, now, 'last_30_days'), estimate: small, build: buildReturns,
  },
};

export const defOf = (type: string): ReportDef | null => (REPORT_DEFS as Record<string, ReportDef | undefined>)[type] ?? null;

/** Validates the parameters of a request or a schedule. A schedule may only carry parameters that are relative to its run time. */
export function checkParams(def: ReportDef, raw: unknown, o: { forSchedule: boolean }): Record<string, unknown> {
  const params = parseParams(def.params, raw);
  if (o.forSchedule) {
    for (const spec of def.params) {
      if (!spec.relative && params[spec.key] !== undefined) throw invalid(`A schedule cannot use a fixed ${spec.label.toLowerCase()}; use a relative period (range) so every run covers its own period`, 'schedule_params_must_be_relative', `params.${spec.key}`);
    }
  }
  return params;
}

export function assertFormat(def: ReportDef, format: ReportFormat): void {
  if (!def.formats.includes(format)) throw invalid(`${def.title} is not available as ${format}`, 'format_not_supported', 'format', { supported: def.formats });
}

export const toCatalogEntry = (d: ReportDef) => ({
  type: d.type, title: d.title, description: d.description, category: d.category, formats: [...d.formats], defaultFormat: d.defaultFormat, schedulable: d.schedulable, sheets: d.sheets, csvSheet: d.csvSheet,
  params: d.params.map((p) => ({ key: p.key, type: p.type, label: p.label, description: p.description, options: p.options ? [...p.options] : null, default: p.default ?? null, min: p.min ?? null, max: p.max ?? null, relative: p.relative })),
});
