import { inventoryReport, ordersReport, productsReport, returnsReport, salesReport } from '../queries';
import { localDay } from '../tz';
import type { Cell, Column, ReportDocument, Sheet } from '../tabular';
import type { BuildCtx, BuildResult } from './types';

/** The existing JSON reports as documents (csv / xlsx / pdf): the same numbers, laid out as tables. */
const text = (header: string, width = 20): Column => ({ header, type: 'text', width });
const int = (header: string): Column => ({ header, type: 'int', width: 12 });
const money = (header: string): Column => ({ header, type: 'money', width: 16 });
const pct = (header: string): Column => ({ header, type: 'percent', width: 10 });
const bps = (ratio: number): number => Math.round(ratio * 10_000);

/** a Metric / Count / Amount summary sheet */
const metrics = (name: string, title: string, rows: Array<[string, number | null, number | null]>, notes?: string[]): Sheet => ({
  name, title, columns: [text('Metric', 34), int('Count'), money('Amount')], rows, notes,
});

function finish(ctx: BuildCtx, type: string, title: string, sheets: Sheet[], primarySheet: number): BuildResult {
  const document: ReportDocument = { type, title, businessName: ctx.businessName, subtitle: ctx.window.label, generatedAt: ctx.now, timezone: ctx.timezone, sheets, primarySheet };
  return { document, meta: { warnings: 0, notes: [] } };
}

const day = (iso: string, tz: string): string => localDay(new Date(iso), tz);
const granularity = (p: Record<string, unknown>): 'day' | 'week' | 'month' => (p.granularity as 'day' | 'week' | 'month' | undefined) ?? 'day';
const marketplace = (p: Record<string, unknown>): string | undefined => (typeof p.marketplace === 'string' ? p.marketplace : undefined);

export async function buildSales(ctx: BuildCtx): Promise<BuildResult> {
  const r = await salesReport(ctx.tx, ctx.vendorId, ctx.window, { period: granularity(ctx.params), marketplace: marketplace(ctx.params) });
  const t = r.totals;
  const sheets: Sheet[] = [
    metrics('Summary', 'Sales summary', [['Orders (cancelled excluded)', t.orders, null], ['Units', t.units, null], ['Subtotal', null, t.subtotalMinor], ['Tax', null, t.taxMinor], ['Shipping', null, t.shippingMinor], ['Discounts', null, t.discountMinor], ['Gross sales', null, t.grossMinor], ['Average order value', null, t.averageOrderValueMinor]]),
    { name: 'Trend', title: `Sales by ${r.period}`, columns: [{ header: 'Period start', type: 'date', width: 14 }, int('Orders'), money('Gross sales')], rows: r.series.map((s) => [day(s.bucket, ctx.timezone), s.orders, s.grossMinor]) },
    { name: 'By marketplace', title: 'Sales by marketplace', columns: [text('Marketplace'), int('Orders'), money('Gross sales')], rows: r.byMarketplace.map((m) => [m.marketplace, m.orders, m.grossMinor]) },
    { name: 'By payment method', title: 'Sales by payment method', columns: [text('Payment method'), int('Orders'), money('Gross sales')], rows: r.byPaymentMethod.map((m) => [m.method, m.orders, m.grossMinor]) },
  ];
  return finish(ctx, 'sales', 'Sales report', sheets, 1);
}

export async function buildOrders(ctx: BuildCtx): Promise<BuildResult> {
  const r = await ordersReport(ctx.tx, ctx.vendorId, ctx.window, { period: granularity(ctx.params), marketplace: marketplace(ctx.params) });
  const t = r.totals;
  const sheets: Sheet[] = [
    metrics('Summary', 'Order summary', [['Orders', t.orders, null], ['Cancelled', t.cancelled, null], ['Needing attention', t.needingAttention, null]], [
      `Cancellation rate: ${(t.cancellationRate * 100).toFixed(2)}%.`, `Average hours from order to dispatch: ${t.avgHoursToDispatch ?? 'n/a'}. Average hours from dispatch to delivery: ${t.avgHoursToDeliver ?? 'n/a'}.`]),
    { name: 'Trend', title: `Orders by ${r.period}`, columns: [{ header: 'Period start', type: 'date', width: 14 }, int('Orders'), int('Cancelled')], rows: r.series.map((s) => [day(s.bucket, ctx.timezone), s.orders, s.cancelled]) },
    { name: 'By status', title: 'Orders by status', columns: [text('Status'), int('Orders')], rows: r.byStatus.map((s) => [s.status, s.orders]) },
    { name: 'By marketplace', title: 'Orders by marketplace', columns: [text('Marketplace'), int('Orders'), int('Cancelled')], rows: r.byMarketplace.map((m) => [m.marketplace, m.orders, m.cancelled]) },
    { name: 'Cancellations', title: 'Cancellation reasons', columns: [text('Reason'), text('Initiated by'), int('Count')], rows: r.cancellationReasons.map((c) => [c.reasonCode, c.initiator, c.count]) },
  ];
  return finish(ctx, 'orders', 'Order report', sheets, 1);
}

export async function buildInventory(ctx: BuildCtx): Promise<BuildResult> {
  const r = await inventoryReport(ctx.tx, ctx.vendorId, ctx.window, { warehouseId: typeof ctx.params.warehouseId === 'string' ? ctx.params.warehouseId : undefined });
  const t = r.totals;
  const sheets: Sheet[] = [
    metrics('Summary', 'Inventory snapshot (now)', [['Stock lines', t.stockLines, null], ['On hand', t.onHand, null], ['Reserved', t.reserved, null], ['Available', t.available, null], ['Incoming', t.incoming, null], ['Damaged', t.damaged, null], ['Returned', t.returned, null], ['Out of stock lines', t.outOfStock, null], ['Low stock lines', t.lowStock, null], ['Stock value at cost', null, t.stockValueMinor]]),
    { name: 'By warehouse', title: 'Stock by warehouse', columns: [text('Code', 12), text('Warehouse', 26), int('On hand'), int('Reserved'), int('Damaged'), int('Returned'), money('Value at cost')], rows: r.byWarehouse.map((w) => [w.code, w.name, w.onHand, w.reserved, w.damaged, w.returned, w.stockValueMinor]) },
    { name: 'Movements', title: 'Ledger movements in the period', columns: [text('Type'), int('Movements'), int('Change in on hand'), int('Change in reserved')], rows: r.movements.map((m) => [m.type, m.count, m.deltaOnHand, m.deltaReserved]) },
    { name: 'Low stock', title: 'Lines at or below their reorder level', columns: [text('SKU', 22), int('Available'), int('Reorder level')], rows: r.lowStock.map((l) => [l.sku, l.available, l.reorderLevel]) },
  ];
  return finish(ctx, 'inventory', 'Inventory report', sheets, 1);
}

export async function buildProducts(ctx: BuildCtx): Promise<BuildResult> {
  const sort = ctx.params.sort === 'units' ? 'units' : 'revenue';
  const r = await productsReport(ctx.tx, ctx.vendorId, ctx.window, { marketplace: marketplace(ctx.params), sort, limit: typeof ctx.params.limit === 'number' ? ctx.params.limit : 200 });
  const rows: Cell[][] = r.products.map((p) => [p.sku, p.title, p.units, p.orders, p.revenueMinor, p.returnedUnits, bps(p.returnRate)]);
  const sheet: Sheet = { name: 'Products', title: `Best sellers by ${sort}`, columns: [text('SKU', 22), text('Title', 40), int('Units'), int('Orders'), money('Revenue'), int('Returned units'), pct('Return rate')], rows, notes: [`${r.skusSold} SKU(s) sold in the period.`] };
  return finish(ctx, 'products', 'Product performance report', [sheet], 0);
}

export async function buildReturns(ctx: BuildCtx): Promise<BuildResult> {
  const r = await returnsReport(ctx.tx, ctx.vendorId, ctx.window);
  const t = r.totals;
  const sheets: Sheet[] = [
    { ...metrics('Summary', 'Returns summary', [['Returns', t.returns, null], ['Units requested', t.unitsRequested, null], ['Units received', t.unitsReceived, null], ['Units restocked', t.unitsRestocked, null], ['Units decided', t.unitsDecided, null]]), notes: [`Unit return rate ${(t.unitReturnRate * 100).toFixed(2)}%. Average days to receive: ${t.avgDaysToReceive ?? 'n/a'}; to complete: ${t.avgDaysToComplete ?? 'n/a'}.`] },
    { name: 'By status', title: 'Returns by status', columns: [text('Status'), int('Returns')], rows: r.byStatus.map((s) => [s.status, s.count]) },
    { name: 'By reason', title: 'Returns by reason', columns: [text('Reason'), int('Returns')], rows: r.byReason.map((s) => [s.reasonCode, s.count]) },
    { name: 'By source', title: 'Returns by source', columns: [text('Source'), int('Returns')], rows: r.bySource.map((s) => [s.source, s.count]) },
    { name: 'Dispositions', title: 'Units by disposition', columns: [text('Disposition'), int('Units')], rows: r.dispositions.map((s) => [s.disposition, s.units]) },
    { name: 'Refunds', title: 'Refunds', columns: [text('Refund status'), int('Returns'), money('Amount')], rows: r.refunds.map((s) => [s.status, s.count, s.amountMinor]) },
  ];
  return finish(ctx, 'returns', 'Returns report', sheets, 1);
}
