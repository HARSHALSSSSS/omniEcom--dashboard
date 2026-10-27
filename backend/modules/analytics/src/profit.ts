import { sql, type Tx } from '@oms/database';

/**
 * Profitability with HONEST data. Every money component says where it came from and is never invented:
 *   actual    = recorded fact (order revenue, courier cost on the shipment, fee / penalty entered for the order, processed refunds)
 *   estimated = derived from stated assumptions (fee profile percentage, the variant's CURRENT cost price, pending refunds)
 *   missing   = nothing to base a number on: the amount is null, not zero
 * A contribution figure is produced only when no component is missing; otherwise `contributionMinor` is null and the figure is shown as
 * `knownPartMinor` plus the list of what is missing.
 */
export type Basis = 'actual' | 'estimated' | 'missing';
export interface Component { amountMinor: number | null; basis: Basis; coverage: number }
export interface Profit {
  revenue: Component; productCost: Component; shipping: Component; marketplaceFees: Component; penalties: Component; refunds: Component;
  contributionMinor: number | null; knownPartMinor: number; marginPercent: number | null; missing: string[]; completeness: 'complete' | 'estimated' | 'incomplete';
}

const inList = (ids: string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
const rows = async (tx: Tx, q: ReturnType<typeof sql>): Promise<Array<Record<string, unknown>>> => (await tx.execute<Record<string, unknown>>(q)).rows;
const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const nul = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

interface Line { variantId: string | null; sku: string; revenue: number; cost: number | null; qty: number }
interface Ord { id: string; number: string; marketplace: string; accountId: string; lines: Line[]; shipping: number | null; fee: number | null; penalty: number | null; refundProcessed: number; refundPending: number; feeProfile: { bps: number; fixed: number } | null }

export const comp = (amount: number | null, basis: Basis, coverage: number): Component => ({ amountMinor: amount, basis, coverage: Math.round(coverage * 1000) / 1000 });

/** pure: the profit of a set of orders (or a slice of one) from what is known about them */
export function computeProfit(orders: Array<{ revenue: number; costKnown: number; costCovered: number; shipping: number | null; fee: number | null; penalty: number | null; refundProcessed: number; refundPending: number; feeEstimate: number | null }>): Profit {
  const revenue = orders.reduce((s, o) => s + o.revenue, 0);
  const coveredRevenue = orders.reduce((s, o) => s + o.costCovered, 0);
  const cost = comp(coveredRevenue > 0 ? orders.reduce((s, o) => s + o.costKnown, 0) : null, coveredRevenue === 0 ? 'missing' : 'estimated', revenue > 0 ? coveredRevenue / revenue : 0);
  const shipN = orders.filter((o) => o.shipping !== null).length;
  const shipping = comp(shipN ? orders.reduce((s, o) => s + (o.shipping ?? 0), 0) : null, shipN === 0 ? 'missing' : 'actual', orders.length ? shipN / orders.length : 0);
  const feeActual = orders.filter((o) => o.fee !== null).length;
  const feeEst = orders.filter((o) => o.fee === null && o.feeEstimate !== null).length;
  const fees = comp(feeActual + feeEst ? orders.reduce((s, o) => s + (o.fee ?? o.feeEstimate ?? 0), 0) : null, feeActual + feeEst === 0 ? 'missing' : feeEst > 0 ? 'estimated' : 'actual', orders.length ? (feeActual + feeEst) / orders.length : 0);
  const penN = orders.filter((o) => o.penalty !== null).length;
  const penalties = comp(penN ? orders.reduce((s, o) => s + (o.penalty ?? 0), 0) : null, penN === 0 ? 'missing' : 'actual', orders.length ? penN / orders.length : 0);
  const refundPending = orders.reduce((s, o) => s + o.refundPending, 0);
  const refunds = comp(orders.reduce((s, o) => s + o.refundProcessed + o.refundPending, 0), refundPending > 0 ? 'estimated' : 'actual', 1);
  const missing: string[] = [];
  if (cost.basis === 'missing' || cost.coverage < 1) missing.push('productCost');
  if (shipping.basis === 'missing' || shipping.coverage < 1) missing.push('shipping');
  if (fees.basis === 'missing' || fees.coverage < 1) missing.push('marketplaceFees');
  if (penalties.basis === 'missing' || penalties.coverage < 1) missing.push('penalties');
  const known = revenue - (cost.amountMinor ?? 0) - (shipping.amountMinor ?? 0) - (fees.amountMinor ?? 0) - (penalties.amountMinor ?? 0) - (refunds.amountMinor ?? 0);
  const complete = missing.length === 0;
  const anyEstimate = [cost, fees, refunds].some((c) => c.basis === 'estimated');
  return {
    revenue: comp(revenue, 'actual', 1), productCost: cost, shipping, marketplaceFees: fees, penalties, refunds,
    contributionMinor: complete ? known : null, knownPartMinor: known, marginPercent: complete && revenue > 0 ? Math.round((known / revenue) * 1000) / 10 : null,
    missing, completeness: !complete ? 'incomplete' : anyEstimate ? 'estimated' : 'complete',
  };
}

export const MAX_ORDERS = 5000;
export const WINDOW_DAYS = 31;
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export interface Range { from: string; to: string }

/** a long range is read in consecutive windows so that no single query has to hold a year of orders */
export function splitWindows(r: Range, days = WINDOW_DAYS): Range[] {
  const out: Range[] = [];
  const end = Date.parse(r.to);
  for (let s = Date.parse(r.from); s <= end; s += days * DAY) out.push({ from: iso(s), to: iso(Math.min(s + (days - 1) * DAY, end)) });
  return out;
}

type Input = Parameters<typeof computeProfit>[0][number];
interface ChannelPart { inputs: Input[]; orders: Set<string>; units: number }
interface Group { key: string; label: string; inputs: Input[]; orders: Set<string>; units: number; byChannel: Map<string, ChannelPart> }
export type ProfitGroupBy = 'product' | 'marketplace' | 'order' | 'none';

/** one order (or a share of it) as inputs to computeProfit; `share` allocates order-level costs to a product by revenue share */
function toInput(o: Ord, lines: Line[], share: number): Input {
  const revenue = lines.reduce((s, l) => s + l.revenue, 0);
  const orderRevenue = o.lines.reduce((s, l) => s + l.revenue, 0);
  const covered = lines.filter((l) => l.cost !== null);
  return {
    revenue, costKnown: covered.reduce((s, l) => s + (l.cost ?? 0), 0), costCovered: covered.reduce((s, l) => s + l.revenue, 0),
    shipping: o.shipping === null ? null : Math.round(o.shipping * share), fee: o.fee === null ? null : Math.round(o.fee * share), penalty: o.penalty === null ? null : Math.round(o.penalty * share),
    refundProcessed: Math.round(o.refundProcessed * share), refundPending: Math.round(o.refundPending * share),
    feeEstimate: o.fee === null && o.feeProfile ? Math.round((orderRevenue * o.feeProfile.bps) / 10_000 * share + o.feeProfile.fixed * share) : null,
  };
}

/** the orders placed in one window with everything their profit depends on (newest first, at most MAX_ORDERS) */
async function loadWindow(tx: Tx, vendorId: string, r: Range): Promise<{ orders: Ord[]; inRange: number }> {
  const inRange = n((await rows(tx, sql`select count(*)::int c from orders o where o.vendor_id = ${vendorId} and o.status <> 'cancelled' and o.placed_at >= ${r.from}::date and o.placed_at < (${r.to}::date + 1)`))[0]?.c);
  const ords = await rows(tx, sql`select o.id, o.order_number, o.marketplace, o.marketplace_account_id acct,
      (select sum(s.cost_minor) from shipments s where s.order_id = o.id and s.vendor_id = o.vendor_id and s.status <> 'cancelled' and s.cost_minor is not null) ship_cost,
      (select count(*) from shipments s where s.order_id = o.id and s.vendor_id = o.vendor_id and s.status <> 'cancelled') ship_n,
      f.marketplace_fee_minor fee, f.penalty_minor penalty, fp.fee_percent_bps bps, fp.fixed_fee_minor fixed,
      (select coalesce(sum(rr.refund_amount_minor), 0) from return_orders rr where rr.order_id = o.id and rr.vendor_id = o.vendor_id and rr.refund_status = 'processed') refund_done,
      (select coalesce(sum(rr.refund_amount_minor), 0) from return_orders rr where rr.order_id = o.id and rr.vendor_id = o.vendor_id and rr.refund_status = 'pending' and rr.status not in ('rejected','cancelled')) refund_pending
    from orders o left join order_financials f on f.order_id = o.id and f.vendor_id = o.vendor_id left join fee_profiles fp on fp.marketplace_account_id = o.marketplace_account_id and fp.vendor_id = o.vendor_id
    where o.vendor_id = ${vendorId} and o.status <> 'cancelled' and o.placed_at >= ${r.from}::date and o.placed_at < (${r.to}::date + 1) order by o.placed_at desc limit ${MAX_ORDERS}`);
  const ids = ords.map((o) => String(o.id));
  const items = ids.length ? await rows(tx, sql`select i.order_id, i.variant_id, i.sku, i.quantity, (i.unit_price_minor * i.quantity - i.discount_minor) revenue, v.cost_price_minor cost from order_items i left join product_variants v on v.id = i.variant_id and v.vendor_id = i.vendor_id where i.vendor_id = ${vendorId} and i.order_id in (${inList(ids)}) and i.status <> 'cancelled'`) : [];
  const byOrder = new Map<string, Line[]>();
  for (const i of items) {
    const list = byOrder.get(String(i.order_id)) ?? [];
    list.push({ variantId: i.variant_id ? String(i.variant_id) : null, sku: String(i.sku), revenue: n(i.revenue), cost: nul(i.cost) === null ? null : n(i.cost) * n(i.quantity), qty: n(i.quantity) });
    byOrder.set(String(i.order_id), list);
  }
  return {
    inRange,
    orders: ords.map((o) => ({
      id: String(o.id), number: String(o.order_number), marketplace: String(o.marketplace), accountId: String(o.acct), lines: byOrder.get(String(o.id)) ?? [],
      shipping: n(o.ship_n) > 0 ? nul(o.ship_cost) : null, fee: nul(o.fee), penalty: nul(o.penalty), refundProcessed: n(o.refund_done), refundPending: n(o.refund_pending), feeProfile: o.bps === null ? null : { bps: n(o.bps), fixed: n(o.fixed) },
    })),
  };
}

export interface Collected { ordersAnalysed: number; ordersInRange: number; truncated: boolean; windows: number; inputs: Input[]; groups: Map<string, Group> }

/**
 * Reads the orders of a range window by window and folds them into per-order inputs (for the total) and per-group inputs.
 * `truncated` is true when any window held more than MAX_ORDERS orders: the figures then cover the newest MAX_ORDERS of that
 * window and `ordersInRange` says how many orders there really were.
 */
export async function collectProfit(tx: Tx, vendorId: string, r: Range, groupBy: ProfitGroupBy, only: { marketplace?: string } = {}): Promise<Collected> {
  const out: Collected = { ordersAnalysed: 0, ordersInRange: 0, truncated: false, windows: 0, inputs: [], groups: new Map() };
  const put = (key: string, label: string, input: Input, orderId: string, units = 0, marketplace = '') => {
    const g = out.groups.get(key) ?? { key, label, inputs: [], orders: new Set<string>(), units: 0, byChannel: new Map<string, ChannelPart>() };
    g.inputs.push(input); g.orders.add(orderId); g.units += units;
    const c = g.byChannel.get(marketplace) ?? { inputs: [], orders: new Set<string>(), units: 0 };
    c.inputs.push(input); c.orders.add(orderId); c.units += units; g.byChannel.set(marketplace, c);
    out.groups.set(key, g);
  };
  for (const w of splitWindows(r)) {
    const { orders, inRange } = await loadWindow(tx, vendorId, w);
    out.windows++; out.ordersInRange += inRange; out.ordersAnalysed += orders.length;
    if (inRange > orders.length) out.truncated = true;
    for (const o of orders) {
      if (only.marketplace && o.marketplace !== only.marketplace) continue;
      const orderRevenue = o.lines.reduce((s, l) => s + l.revenue, 0);
      out.inputs.push(toInput(o, o.lines, 1));
      if (groupBy === 'order') put(o.id, o.number, toInput(o, o.lines, 1), o.id);
      else if (groupBy === 'marketplace') put(o.marketplace, o.marketplace, toInput(o, o.lines, 1), o.id);
      else if (groupBy === 'product') for (const l of o.lines) put(l.variantId ?? `sku:${l.sku}`, l.sku, toInput(o, [l], orderRevenue > 0 ? l.revenue / orderRevenue : 0), o.id, l.qty, o.marketplace);
    }
  }
  return out;
}

export const MARGIN_STATUSES = ['healthy', 'below_target', 'low'] as const;
export type MarginStatus = (typeof MARGIN_STATUSES)[number];

/**
 * Where a margin stands: healthy at or above the target, below target from zero up to it, low when the contribution is negative.
 * Without a target there are two buckets by sign (healthy from zero, low below). An unknown margin (a cost is missing) has no status.
 */
export function marginStatus(marginPercent: number | null, targetBps: number | null): MarginStatus | null {
  if (marginPercent === null) return null;
  if (marginPercent < 0) return 'low';
  if (targetBps === null) return 'healthy';
  return marginPercent * 100 >= targetBps ? 'healthy' : 'below_target';
}

export async function profitability(tx: Tx, vendorId: string, r: Range, groupBy: Exclude<ProfitGroupBy, 'none'>, only: { marketplace?: string } = {}) {
  const c = await collectProfit(tx, vendorId, r, groupBy, only);
  const variantIds = groupBy === 'product' ? [...c.groups.keys()].filter((k) => !k.startsWith('sku:')) : [];
  const titles = new Map<string, string>();
  if (variantIds.length) for (const t of await rows(tx, sql`select v.id, p.title from product_variants v join products p on p.id = v.product_id and p.vendor_id = v.vendor_id where v.vendor_id = ${vendorId} and v.id in (${inList(variantIds)})`)) titles.set(String(t.id), String(t.title));
  return {
    range: r, groupBy, ordersAnalysed: c.ordersAnalysed, ordersInRange: c.ordersInRange, windows: c.windows, truncated: c.truncated, total: computeProfit(c.inputs),
    allocation: groupBy === 'product' ? 'order-level costs (shipping, fees, penalties, refunds) are allocated to products by revenue share' : null,
    groups: [...c.groups.values()].map((g) => ({
      key: g.key, label: g.label, title: titles.get(g.key) ?? null, orders: g.orders.size, unitsSold: g.units, ...computeProfit(g.inputs),
      /** per marketplace (product grouping only): the same figures for the orders of that marketplace */
      channels: groupBy === 'product' ? [...g.byChannel.entries()].map(([marketplace, p]) => { const pr = computeProfit(p.inputs); return { marketplace, orders: p.orders.size, units: p.units, revenueMinor: pr.revenue.amountMinor ?? 0, contributionMinor: pr.contributionMinor, marginPercent: pr.marginPercent }; }).sort((a, b) => b.revenueMinor - a.revenueMinor) : [],
    })).sort((a, b) => b.revenue.amountMinor! - a.revenue.amountMinor!).slice(0, 200),
  };
}
