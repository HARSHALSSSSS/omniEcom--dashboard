import { sql, type Tx } from '@oms/database';
import { accountStates } from './channel';
import type { Can } from './shell';
import { ACTIVE_ISSUE, addDays, dayIn, marketplaceName, n, pct, rows, vendorFacts, type VendorFacts } from './util';

export const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;
export type SalesPeriod = keyof typeof PERIOD_DAYS;

/** order status -> pipeline stage of the dashboard (ready_to_dispatch waits in "packing": packed, not yet handed over) */
const STAGE_OF: Record<string, string> = { new: 'new', confirmed: 'confirmed', picking: 'picking', packed: 'packing', ready_to_dispatch: 'packing', dispatched: 'dispatched', in_transit: 'dispatched', delivered: 'delivered' };
export const STAGES = ['new', 'confirmed', 'picking', 'packing', 'dispatched', 'delivered'] as const;

const ATTENTION_ROWS = [
  // low stock counts only the stock-threshold issue; other inventory issues (stock concentrated in one warehouse, mismatches) are not "running low"
  { area: 'inventory', issueKey: 'low_stock', onlyKey: 'stock_below_threshold', title: 'Low stock', summary: (c: number) => `${c} ${c === 1 ? 'product is' : 'products are'} running low on inventory`, action: { label: 'Review inventory', href: '/inventory?health=low' } },
  { area: 'orders', issueKey: 'orders_at_risk', title: 'Orders at risk', summary: (c: number) => `${c} ${c === 1 ? 'order needs' : 'orders need'} action before dispatch`, action: { label: 'View orders', href: '/orders?attention=true' } },
  { area: 'listings', issueKey: 'listing_issue', title: 'Listing issue', summary: (c: number) => `${c} marketplace ${c === 1 ? 'listing needs' : 'listings need'} attention`, action: { label: 'Review listings', href: '/listings?status=attention' } },
  { area: 'channels', issueKey: 'sync_issue', title: 'Sync issue', summary: (c: number) => `${c} channel ${c === 1 ? 'connection needs' : 'connections need'} attention`, action: { label: 'Check connections', href: '/channels' } },
] as const;

async function needsAttention(tx: Tx, vendorId: string) {
  const r = await rows(tx, sql`select area, key, sum(greatest(count, 1))::int c from issues where vendor_id = ${vendorId} and status in ${ACTIVE_ISSUE} and area in ('inventory','orders','listings','channels') group by area, key`);
  const items = ATTENTION_ROWS.flatMap((d) => {
    const only = 'onlyKey' in d ? d.onlyKey : null;
    const count = r.filter((x) => x.area === d.area && (only === null || x.key === only)).reduce((sum, x) => sum + n(x.c), 0);
    return count > 0 ? [{ issueKey: d.issueKey, area: d.area, title: d.title, summary: d.summary(count), count, action: d.action }] : [];
  });
  return { items };
}

async function recommendation(tx: Tx, vendorId: string) {
  const [r] = await rows(tx, sql`select id, kind, severity, title, summary, status from ai_recommendations
    where vendor_id = ${vendorId} and status = 'open' and (expires_at is null or expires_at > now()) order by created_at desc, id limit 1`);
  return r ? { id: String(r.id), kind: String(r.kind), severity: String(r.severity), title: String(r.title), rationale: String(r.summary), status: String(r.status), actions: ['review', 'dismiss'], recommendationOnly: true } : null;
}

async function inventoryHealth(tx: Tx, vendorId: string, threshold: number) {
  const cte = sql`with v as (select pv.id, pv.product_id, pv.sku, coalesce(sum(i.quantity_on_hand - i.quantity_reserved), 0)::int available, max(i.reorder_level) reorder
      from product_variants pv left join inventory i on i.vendor_id = pv.vendor_id and i.variant_id = pv.id
      where pv.vendor_id = ${vendorId} and pv.deleted_at is null and pv.status = 'active' group by pv.id),
    c as (select *, case when available <= 0 then 'out' when available <= coalesce(reorder, ${threshold}) then 'low' else 'healthy' end st from v)`;
  const counts = await rows(tx, sql`${cte} select st, count(*)::int c from c group by st`);
  const worst = await rows(tx, sql`${cte} select c.product_id, c.sku, c.available, c.st, p.title from c join products p on p.id = c.product_id and p.vendor_id = ${vendorId}
    where c.st <> 'healthy' and p.deleted_at is null order by (c.st = 'out') desc, c.available asc, c.sku limit 3`);
  const get = (k: string) => n(counts.find((x) => x.st === k)?.c);
  return {
    healthy: get('healthy'), low: get('low'), out: get('out'),
    mostAffected: worst.map((w) => ({ productId: String(w.product_id), title: String(w.title), sku: String(w.sku), available: n(w.available), status: String(w.st) as 'low' | 'out' })),
  };
}

async function orderFlow(tx: Tx, vendorId: string, asOf: string) {
  const r = await rows(tx, sql`select status, count(*)::int c from orders where vendor_id = ${vendorId} and placed_at >= ${asOf}::date and placed_at < ${addDays(asOf, 1)}::date group by status`);
  const by: Record<string, number> = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const x of r) { const s = STAGE_OF[String(x.status)]; if (s) by[s] = (by[s] ?? 0) + n(x.c); }
  return STAGES.map((stage) => ({ stage, count: by[stage]! }));
}

async function channelHealth(tx: Tx, vendorId: string) {
  const states = (await accountStates(tx, vendorId)).filter((a) => a.connection !== 'not_connected');
  return states.map((a) => ({
    channel: { code: a.marketplace, name: a.name, accountId: a.id, availability: 'live' as const }, health: a.problems.length > 0 || a.connection !== 'connected' ? ('attention' as const) : ('healthy' as const),
    connection: a.connection, lastSyncAt: a.lastSyncAt, openIssues: a.problems.length, action: { key: a.problems.length > 0 ? 'review' : 'details', href: `/channels/${a.id}` },
  }));
}

/** sales analytics: ONE grouped read of the roll-up for (day, marketplace) over this period and the previous one; snapshot, series and channel split are derived from it */
async function salesSections(tx: Tx, vendorId: string, asOf: string, days: number, facts: VendorFacts, lowStockProducts: number | null) {
  const from = addDays(asOf, -(2 * days - 1));
  const r = await rows(tx, sql`select day::text d, marketplace, sum(orders)::int orders, sum(units)::int units, sum(gross_minor)::bigint gross, sum(returned_units)::int returned
    from analytics_daily_sales where vendor_id = ${vendorId} and day between ${from}::date and ${asOf}::date group by 1, 2`);
  const day = (d: string) => r.filter((x) => x.d === d);
  const total = (d: string) => {
    const xs = day(d);
    const sum = (k: string) => xs.reduce((a, x) => a + n(x[k]), 0);
    return { orders: sum('orders'), revenue: sum('gross'), units: sum('units'), returned: sum('returned') };
  };
  const today = total(asOf);
  const yday = total(addDays(asOf, -1));
  const rate = (t: { returned: number; units: number }) => (t.units > 0 ? Math.round((t.returned / t.units) * 1000) / 10 : 0);
  const metric = (key: string, value: number, previous: number) => ({ key, value, previous, changePct: pct(value, previous) });
  const metrics: Array<Record<string, unknown>> = [
    metric('orders', today.orders, yday.orders), metric('revenueMinor', today.revenue, yday.revenue), metric('units', today.units, yday.units), metric('returnRatePct', rate(today), rate(yday)),
  ];
  if (lowStockProducts !== null) metrics.push({ key: 'lowStockProducts', value: lowStockProducts, previous: null, changePct: null, note: lowStockProducts > 0 ? 'needs_review' : 'ok' });

  const series = Array.from({ length: days }, (_, i) => {
    const d = addDays(asOf, -(days - 1 - i));
    const t = total(d);
    return { day: d, revenueMinor: t.revenue, previousRevenueMinor: total(addDays(d, -days)).revenue, orders: t.orders };
  });
  const todayRows = day(asOf).filter((x) => n(x.gross) > 0 || n(x.orders) > 0);
  const gross = todayRows.reduce((a, x) => a + n(x.gross), 0);
  const channelContribution = todayRows.sort((a, b) => n(b.gross) - n(a.gross)).map((x) => ({
    channel: { code: String(x.marketplace), name: marketplaceName(String(x.marketplace)) }, revenueMinor: n(x.gross), orders: n(x.orders), sharePct: gross > 0 ? Math.round((n(x.gross) / gross) * 1000) / 10 : 0,
  }));
  return { snapshot: { period: 'today' as const, day: asOf, currency: facts.currency, metrics }, sales: { period: `${days}d`, currency: facts.currency, series, channelContribution } };
}

/**
 * The dashboard home aggregate. Sections the caller may not read are left out (not an error). Days are UTC dates like the roll-ups;
 * the sales numbers come from `analytics_daily_sales`, live tables are read only for the pipeline, stock and connections.
 */
export async function dashboard(tx: Tx, p: { vendorId: string; actorType: string; actorId: string }, can: Can, q: { asOf?: string; salesPeriod: SalesPeriod }) {
  const facts = await vendorFacts(tx, p.vendorId);
  const asOf = q.asOf ?? dayIn(facts.timezone);
  const days = PERIOD_DAYS[q.salesPeriod];
  const out: Record<string, unknown> = { asOf, generatedAt: new Date().toISOString() };

  let firstName: string | null = null;
  if (p.actorType === 'user') {
    const [u] = await rows(tx, sql`select full_name from users where id = ${p.actorId}::uuid and vendor_id = ${p.vendorId}`);
    firstName = u?.full_name ? String(u.full_name).trim().split(/\s+/)[0]! : null;
  }
  out.greeting = { firstName };

  if (can('issues:read')) out.needsAttention = await needsAttention(tx, p.vendorId);
  if (can('ai:use')) out.recommendation = await recommendation(tx, p.vendorId);
  const inv = can('inventory:read') ? await inventoryHealth(tx, p.vendorId, facts.lowStockThreshold) : null;
  Object.assign(out, await salesSections(tx, p.vendorId, asOf, days, facts, inv ? inv.low : null));
  if (can('orders:read')) out.orderFlow = await orderFlow(tx, p.vendorId, asOf);
  if (inv) out.inventoryHealth = inv;
  if (can('marketplace_accounts:read')) {
    const ch = await channelHealth(tx, p.vendorId);
    out.channelHealth = ch;
    const anyAttention = ch.some((c) => c.health === 'attention');
    const lastSyncedAt = ch.map((c) => c.lastSyncAt).filter((x): x is string => Boolean(x)).sort().pop() ?? null;
    out.sync = { lastSyncedAt, systemStatus: anyAttention ? 'degraded' : 'operational' };
  }
  return out;
}
