import { sql, type Tx } from '@oms/database';

/**
 * Detectors: pure READ queries over the other areas' tables. Each one reports the groups it sees right now (none = the condition is gone);
 * the engine turns that into issue rows. Every query filters vendor_id, is bounded (first 50 affected records, window count for the total)
 * and uses the existing (vendor, status ...) indexes.
 */
export type IssueArea = 'orders' | 'inventory' | 'listings' | 'channels' | 'returns' | 'shipping' | 'products';
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low';
export interface Affected { type: string; id: string; label: string }
export interface Detection {
  key: string;
  /** distinguishes several issues of one detector (e.g. one per marketplace account) */
  scopeHash: string;
  area: IssueArea;
  priority: IssuePriority;
  /** the group sentence shown as the row title, e.g. "7 orders are at risk of missing dispatch" */
  title: string;
  /** one line under the title */
  explanation: string;
  /** the "Impact" column */
  impact: string;
  count: number;
  affected: Affected[];
  dueAt: Date | null;
  recommendedAction: { text: string; label: string; href: string };
  details: Record<string, unknown>;
}

export interface DetectCtx {
  vendorId: string;
  tz: string;
  now: Date;
  /** last instant of the business day (23:59:59 local) and of tomorrow */
  dueToday: Date;
  dueTomorrow: Date;
  settings: { lowStockThreshold: number; atRiskMinutes: number; approachingMinutes: number; inspectionOverdueHours: number; awaitingFirstScanHours: number };
}

export interface Detector { key: string; area: IssueArea; run(tx: Tx, ctx: DetectCtx): Promise<Detection[]> }

type Row = Record<string, unknown>;
const rows = async (tx: Tx, q: ReturnType<typeof sql>): Promise<Row[]> => (await tx.execute<Row>(q)).rows;
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const date = (ms: unknown): Date | null => (ms === null || ms === undefined ? null : new Date(Number(ms)));
const affected = (rs: Row[], type: string, label: (r: Row) => string, id: (r: Row) => string = (r) => String(r.id)): Affected[] => rs.map((r) => ({ type, id: id(r), label: label(r) }));
const noun = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** "7 orders are ..." / "1 order is ..." */
const group = (n: number, one: string, many: string, rest: string) => `${n} ${n === 1 ? one : many} ${n === 1 ? 'is' : 'are'} ${rest}`;

export const CHANNEL_NAMES: Record<string, string> = { amazon_in: 'Amazon', flipkart: 'Flipkart', myntra: 'Myntra', snapdeal: 'Snapdeal', mock: 'Sandbox marketplace' };
const OPEN_ORDER = sql`('dispatched', 'in_transit', 'delivered', 'cancelled', 'returned')`;

// ------------------------------------------------------------------------------------------------
// orders
// ------------------------------------------------------------------------------------------------
const ordersDispatchRisk: Detector = {
  key: 'orders_dispatch_risk', area: 'orders',
  async run(tx, c) {
    const { atRiskMinutes: atRisk, approachingMinutes } = c.settings;
    const approaching = Math.max(approachingMinutes, atRisk);
    const rs = await rows(tx, sql`select o.id, o.order_number, extract(epoch from o.dispatch_due_at) * 1000 due_ms, count(*) over ()::int total,
        (count(*) filter (where o.dispatch_due_at <= now()) over ())::int breached,
        (count(*) filter (where o.dispatch_due_at <= now() + make_interval(mins => ${atRisk}::int)) over ())::int risky
      from orders o
      where o.vendor_id = ${c.vendorId} and o.dispatch_due_at is not null and o.status not in ${OPEN_ORDER} and o.dispatch_due_at <= now() + make_interval(mins => ${approaching}::int)
      order by o.dispatch_due_at, o.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    const risky = num(rs[0]!.risky);
    const critical = risky > 0;
    return [{
      key: this.key, scopeHash: '', area: 'orders', priority: critical ? 'critical' : 'high',
      title: critical ? group(total, 'order', 'orders', 'at risk of missing dispatch') : `${total} ${total === 1 ? 'order is approaching its' : 'orders are approaching their'} dispatch deadline`,
      explanation: critical ? 'Orders past or close to their dispatch cut-off may not reach the courier in time.' : 'These orders will reach their dispatch cut-off soon.',
      impact: 'Customer delivery risk', count: total, affected: affected(rs, 'order', (r) => String(r.order_number)), dueAt: date(rs[0]!.due_ms),
      recommendedAction: { text: 'Review picking and packing status for the affected orders.', label: 'Review orders', href: '/orders?filter[sla]=at_risk' },
      details: { whyItMatters: 'Orders that miss the dispatch deadline can lead to marketplace penalties, cancellations and unhappy customers.', breached: num(rs[0]!.breached), atRisk: risky, approaching: total },
    }];
  },
};

// ------------------------------------------------------------------------------------------------
// inventory
// ------------------------------------------------------------------------------------------------
export interface LowStockRow { variantId: string; sku: string; title: string | null; available: number; threshold: number; sold7d: number }
/** variants whose available stock (all warehouses) is at or under their reorder level / the business threshold, with units sold in the last 7 days */
export async function lowStockRows(tx: Tx, vendorId: string, defaultThreshold: number): Promise<LowStockRow[]> {
  const rs = await rows(tx, sql`with s as (
      select i.variant_id, sum(i.quantity_on_hand - i.quantity_reserved)::int available, max(i.reorder_level)::int reorder from inventory i where i.vendor_id = ${vendorId} group by i.variant_id
    ), sold as (
      select oi.variant_id, sum(oi.quantity)::int units from order_items oi join orders o on o.id = oi.order_id and o.vendor_id = oi.vendor_id
      where oi.vendor_id = ${vendorId} and oi.variant_id is not null and o.placed_at >= now() - interval '7 days' and o.status <> 'cancelled' and oi.status <> 'cancelled' group by oi.variant_id
    )
    select s.variant_id, v.sku, p.title, s.available, coalesce(s.reorder, ${defaultThreshold}::int) threshold, coalesce(sold.units, 0) sold7d
    from s join product_variants v on v.id = s.variant_id and v.vendor_id = ${vendorId} join products p on p.id = v.product_id and p.vendor_id = v.vendor_id
    left join sold on sold.variant_id = s.variant_id
    where v.deleted_at is null and s.available <= coalesce(s.reorder, ${defaultThreshold}::int)
    order by s.available, coalesce(sold.units, 0) desc, v.sku limit 5000`);
  return rs.map((r) => ({ variantId: String(r.variant_id), sku: String(r.sku), title: r.title ? String(r.title) : null, available: num(r.available), threshold: num(r.threshold), sold7d: num(r.sold7d) }));
}

const stockBelowThreshold: Detector = {
  key: 'stock_below_threshold', area: 'inventory',
  async run(tx, c) {
    const low = await lowStockRows(tx, c.vendorId, c.settings.lowStockThreshold);
    if (low.length === 0) return [];
    const stockoutWithSales = low.filter((l) => l.available <= 0 && l.sold7d > 0).length;
    return [{
      key: this.key, scopeHash: '', area: 'inventory', priority: stockoutWithSales > 0 ? 'critical' : 'high',
      title: low.length === 1 ? '1 product is below its stock threshold' : `${low.length} products are below their stock threshold`,
      explanation: 'Low stock may lead to missed sales if not replenished soon.', impact: 'Potential stockout', count: low.length,
      affected: low.slice(0, 50).map((l) => ({ type: 'variant', id: l.variantId, label: l.sku })), dueAt: c.dueToday,
      recommendedAction: { text: 'Review stock levels and replenish the products that are selling fastest.', label: 'Review inventory', href: '/inventory?health=low' },
      details: { whyItMatters: 'Products that run out of stock stop selling and can lose marketplace ranking.', outOfStockWithSales: stockoutWithSales, soldAtLeast3: low.filter((l) => l.sold7d >= 3).length },
    }];
  },
};

const inventoryMismatch: Detector = {
  key: 'inventory_mismatch', area: 'inventory',
  async run(tx, c) {
    const rs = await rows(tx, sql`select d.variant_id id, coalesce(v.sku, d.variant_id::text) sku, count(*) over ()::int total from inventory_ledger_drift(${c.vendorId}) d left join product_variants v on v.id = d.variant_id and v.vendor_id = ${c.vendorId} order by sku limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'inventory', priority: 'low',
      title: group(total, 'stock record', 'stock records', "out of step with the movement ledger"), explanation: 'The stock shown does not match the recorded stock movements.', impact: 'Stock accuracy', count: total,
      affected: affected(rs, 'variant', (r) => String(r.sku)), dueAt: null,
      recommendedAction: { text: 'Run a stock check and correct the affected records.', label: 'Review inventory', href: '/inventory' },
      details: { whyItMatters: 'Drift between stock and its ledger makes availability numbers unreliable.' },
    }];
  },
};

const warehouseImbalance: Detector = {
  key: 'warehouse_imbalance', area: 'inventory',
  async run(tx, c) {
    const rs = await rows(tx, sql`with w as (select count(*)::int n from warehouses where vendor_id = ${c.vendorId} and status = 'active' and deleted_at is null),
      s as (select i.variant_id, sum(i.quantity_on_hand)::int tot, max(i.quantity_on_hand)::int mx, count(*) filter (where i.quantity_on_hand > 0)::int holders from inventory i where i.vendor_id = ${c.vendorId} group by i.variant_id)
      select s.variant_id id, v.sku, count(*) over ()::int total from s join product_variants v on v.id = s.variant_id and v.vendor_id = ${c.vendorId}, w
      where w.n > 1 and v.deleted_at is null and s.tot >= 10 and s.mx >= 0.9 * s.tot and s.holders < w.n order by s.tot desc, v.sku limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'inventory', priority: 'low', title: group(total, 'product', 'products', 'concentrated in a single warehouse'),
      explanation: 'Most of the stock sits in one warehouse while others hold none.', impact: 'Uneven stock distribution', count: total, affected: affected(rs, 'variant', (r) => String(r.sku)), dueAt: null,
      recommendedAction: { text: 'Consider transferring stock between warehouses.', label: 'Review inventory', href: '/inventory' },
      details: { whyItMatters: 'Uneven distribution can lengthen delivery times and cause avoidable stockouts in one location.' },
    }];
  },
};

// ------------------------------------------------------------------------------------------------
// listings and channels
// ------------------------------------------------------------------------------------------------
const listingsIncomplete: Detector = {
  key: 'listings_incomplete', area: 'listings',
  async run(tx, c) {
    const rs = await rows(tx, sql`select l.id, l.external_sku, count(*) over ()::int total from marketplace_listings l
      where l.vendor_id = ${c.vendorId} and l.status in ('draft', 'correction_required', 'rejected') order by l.updated_at desc, l.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'listings', priority: 'high', title: group(total, 'marketplace listing', 'marketplace listings', 'incomplete'),
      explanation: 'Missing listing details may limit product discovery.', impact: 'Reduced product visibility', count: total, affected: affected(rs, 'listing', (r) => String(r.external_sku)), dueAt: c.dueToday,
      recommendedAction: { text: 'Complete or correct the listing details so the products can be published.', label: 'Fix listings', href: '/listings?filter[status]=needs_fix' },
      details: { whyItMatters: 'Incomplete or rejected listings cannot be published, so the product is not visible on the marketplace.' },
    }];
  },
};

/** live listings whose product category changed: the seller has to confirm the marketplace category (the listing keeps the old one meanwhile) */
const listingContentReview: Detector = {
  key: 'listing_content_review', area: 'listings',
  async run(tx, c) {
    const rs = await rows(tx, sql`select l.id, l.external_sku, count(*) over ()::int total from marketplace_listings l
      where l.vendor_id = ${c.vendorId} and l.content_state = 'needs_review' order by l.content_changed_at desc nulls last, l.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'listings', priority: 'medium', title: `${total} ${noun(total, 'listing needs', 'listings need')} a category mapping review`,
      explanation: 'The product category changed. Confirm the marketplace category before these listings are updated.', impact: 'Listing accuracy', count: total, affected: affected(rs, 'listing', (r) => String(r.external_sku)), dueAt: null,
      recommendedAction: { text: 'Review the suggested marketplace category of each listing and accept it or keep the current one.', label: 'Review listings', href: '/listings?filter[contentState]=needs_review' },
      details: { whyItMatters: 'Until the category is confirmed the listing keeps its old marketplace category, so category-specific content may not match the product.' },
    }];
  },
};

/** live listings that did not receive the latest master content: the update failed, or the marketplace cannot update live listings */
const listingContentFailed: Detector = {
  key: 'listing_content_failed', area: 'listings',
  async run(tx, c) {
    const rs = await rows(tx, sql`select l.id, l.external_sku, count(*) over ()::int total, (count(*) filter (where l.content_state = 'failed') over ())::int failed,
        (count(*) filter (where l.content_state = 'needs_republish') over ())::int republish
      from marketplace_listings l where l.vendor_id = ${c.vendorId} and l.content_state in ('failed', 'needs_republish') order by l.content_changed_at desc nulls last, l.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'listings', priority: 'high', title: `${total} ${noun(total, 'listing', 'listings')} could not be updated with the latest product content`,
      explanation: 'The marketplace still shows older product content for these listings.', impact: 'Outdated marketplace content', count: total, affected: affected(rs, 'listing', (r) => String(r.external_sku)), dueAt: c.dueToday,
      recommendedAction: { text: 'Retry the update, or republish listings on marketplaces that cannot update live listings.', label: 'Fix listings', href: '/listings?filter[contentState]=failed' },
      details: { whyItMatters: 'Buyers see outdated titles, descriptions or attributes until the listing is updated.', failed: num(rs[0]!.failed), needsRepublish: num(rs[0]!.republish) },
    }];
  },
};

const channelSyncFailing: Detector = {
  key: 'channel_sync_failing', area: 'channels',
  async run(tx, c) {
    const rs = await rows(tx, sql`select a.id, a.marketplace, a.display_name, a.status, a.connection_status, extract(epoch from a.last_success_at) * 1000 last_success_ms,
        (select count(*)::int from sync_jobs j where j.vendor_id = a.vendor_id and j.marketplace_account_id = a.id and j.status in ('failed', 'partially_failed', 'dead_lettered')
           and j.updated_at > now() - interval '24 hours' and (a.last_success_at is null or j.updated_at > a.last_success_at)) failed_jobs,
        (select count(*)::int from marketplace_authorizations z where z.vendor_id = a.vendor_id and z.marketplace_account_id = a.id and z.status in ('expired', 'error')) auth_bad,
        (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'label', x.type)), '[]'::jsonb) from (
           select j2.id, j2.type from sync_jobs j2 where j2.vendor_id = a.vendor_id and j2.marketplace_account_id = a.id and j2.status in ('failed', 'partially_failed', 'dead_lettered')
             and j2.updated_at > now() - interval '24 hours' and (a.last_success_at is null or j2.updated_at > a.last_success_at) order by j2.updated_at desc limit 10) x) jobs
      from marketplace_accounts a where a.vendor_id = ${c.vendorId} and a.status in ('active', 'error') order by a.created_at, a.id limit 200`);
    const out: Detection[] = [];
    const staleBefore = c.now.getTime() - 60 * 60_000;
    for (const a of rs) {
      const authProblem = a.status === 'error' || num(a.auth_bad) > 0;
      const connProblem = ['error', 'degraded', 'disconnected'].includes(String(a.connection_status));
      const failed = num(a.failed_jobs);
      const count = failed + (authProblem || connProblem ? 1 : 0);
      if (count === 0) continue;
      const lastOk = date(a.last_success_ms);
      const stale = lastOk === null || lastOk.getTime() < staleBefore;
      const channel = a.marketplace === 'mock' ? String(a.display_name) : (CHANNEL_NAMES[String(a.marketplace)] ?? String(a.display_name));
      const jobs = (typeof a.jobs === 'string' ? JSON.parse(a.jobs) : a.jobs) as Array<{ id: string; label: string }>;
      out.push({
        key: this.key, scopeHash: String(a.id), area: 'channels', priority: authProblem || stale ? 'high' : 'medium',
        title: `${channel} connection has ${count} synchronization ${noun(count, 'issue', 'issues')}`,
        explanation: `Catalog and order updates may not reach ${channel} until sync succeeds.`, impact: 'Catalog sync', count,
        affected: [{ type: 'account', id: String(a.id), label: String(a.display_name) }, ...jobs.map((j) => ({ type: 'sync_job', id: j.id, label: `${j.label} sync` }))].slice(0, 50), dueAt: c.dueToday,
        recommendedAction: { text: 'Check the connection, retry the sync, then mark the issue resolved.', label: 'Check connection', href: `/channels/${a.id}` },
        details: { whyItMatters: `Until synchronization succeeds, stock, prices and orders may be out of date between this business and ${channel}.`, accountId: String(a.id), failedJobs: failed, authProblem, connectionStatus: String(a.connection_status), lastSuccessAt: lastOk?.toISOString() ?? null },
      });
    }
    return out;
  },
};

// ------------------------------------------------------------------------------------------------
// returns
// ------------------------------------------------------------------------------------------------
const returnsAwaitingApproval: Detector = {
  key: 'returns_awaiting_approval', area: 'returns',
  async run(tx, c) {
    const rs = await rows(tx, sql`select r.id, r.number, count(*) over ()::int total from return_orders r where r.vendor_id = ${c.vendorId} and r.status = 'requested' order by r.created_at, r.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'returns', priority: 'medium', title: group(total, 'return', 'returns', 'waiting for approval'),
      explanation: 'Customers are waiting for a decision on their return request.', impact: 'Customer resolution delay', count: total, affected: affected(rs, 'return', (r) => String(r.number)), dueAt: c.dueTomorrow,
      recommendedAction: { text: 'Approve or reject the pending return requests.', label: 'Review returns', href: '/returns?filter[status]=requested' },
      details: { whyItMatters: 'Return requests left unanswered delay customer refunds and can breach marketplace return policies.' },
    }];
  },
};

const returnsInspectionOverdue: Detector = {
  key: 'returns_inspection_overdue', area: 'returns',
  async run(tx, c) {
    const rs = await rows(tx, sql`select r.id, r.number, count(*) over ()::int total from return_orders r
      where r.vendor_id = ${c.vendorId} and r.status = 'received' and r.inspection_status = 'not_started' and r.received_at < now() - make_interval(hours => ${c.settings.inspectionOverdueHours}::int)
      order by r.received_at, r.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'returns', priority: 'medium', title: group(total, 'returned parcel', 'returned parcels', 'waiting for inspection'),
      explanation: `Received returns have not been inspected within ${c.settings.inspectionOverdueHours} hours.`, impact: 'Delayed restocking and refunds', count: total, affected: affected(rs, 'return', (r) => String(r.number)), dueAt: c.dueToday,
      recommendedAction: { text: 'Start inspecting the received returns.', label: 'Review returns', href: '/returns?filter[status]=received' },
      details: { whyItMatters: 'Returned items stay out of sellable stock and refunds stay blocked until they are inspected.' },
    }];
  },
};

const refundFailed: Detector = {
  key: 'refund_failed', area: 'returns',
  async run(tx, c) {
    const rs = await rows(tx, sql`select r.id, r.number, count(*) over ()::int total from return_orders r where r.vendor_id = ${c.vendorId} and r.refund_status = 'failed' order by r.updated_at desc, r.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'returns', priority: 'high', title: `${total} ${total === 1 ? 'refund has' : 'refunds have'} failed`,
      explanation: 'The refund did not go through and the customer has not been paid back.', impact: 'Customer refund delay', count: total, affected: affected(rs, 'return', (r) => String(r.number)), dueAt: c.dueToday,
      recommendedAction: { text: 'Check the refund error and retry or record the refund manually.', label: 'Review refunds', href: '/returns?filter[refund]=failed' },
      details: { whyItMatters: 'A failed refund leaves the customer unpaid and often triggers a dispute or a negative review.' },
    }];
  },
};

const quantityMismatch: Detector = {
  key: 'quantity_mismatch', area: 'returns',
  async run(tx, c) {
    const rs = await rows(tx, sql`select r.id, r.number, count(*) over ()::int total from return_orders r
      where r.vendor_id = ${c.vendorId} and r.status in ('received', 'inspecting', 'completed') and r.updated_at > now() - interval '30 days'
        and exists (select 1 from return_items i where i.vendor_id = r.vendor_id and i.return_order_id = r.id and i.received_quantity <> i.quantity)
      order by r.updated_at desc, r.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'returns', priority: 'medium', title: group(total, 'return', 'returns', 'received with a different quantity than expected'),
      explanation: 'The units received do not match the units the customer said they returned.', impact: 'Possible loss or dispute', count: total, affected: affected(rs, 'return', (r) => String(r.number)), dueAt: c.dueToday,
      recommendedAction: { text: 'Compare the received units with the return request and record the difference.', label: 'Review returns', href: '/returns' },
      details: { whyItMatters: 'Quantity differences affect the refund amount and may need a claim with the courier or marketplace.' },
    }];
  },
};

const dispositionMissing: Detector = {
  key: 'disposition_missing', area: 'returns',
  async run(tx, c) {
    const rs = await rows(tx, sql`select r.id, r.number, count(*) over ()::int total from return_orders r
      where r.vendor_id = ${c.vendorId} and r.refund_status = 'processed' and r.status not in ('cancelled', 'rejected') and r.updated_at > now() - interval '90 days'
        and exists (select 1 from return_items i where i.vendor_id = r.vendor_id and i.return_order_id = r.id and i.received_quantity > i.dispositioned_quantity)
      order by r.updated_at desc, r.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'returns', priority: 'medium', title: group(total, 'refunded return', 'refunded returns', 'missing a stock disposition'),
      explanation: 'The customer has been refunded but the returned units were not sent to stock, damaged or disposed.', impact: 'Stock accuracy', count: total, affected: affected(rs, 'return', (r) => String(r.number)), dueAt: c.dueToday,
      recommendedAction: { text: 'Choose a disposition (restock, damaged, dispose ...) for the returned units.', label: 'Review returns', href: '/returns' },
      details: { whyItMatters: 'Units without a disposition are neither sellable nor written off, so stock numbers drift.' },
    }];
  },
};

// ------------------------------------------------------------------------------------------------
// shipping
// ------------------------------------------------------------------------------------------------
const shippingNoMethod: Detector = {
  key: 'shipping_no_method', area: 'shipping',
  async run(tx, c) {
    const rs = await rows(tx, sql`select o.id, o.order_number, extract(epoch from min(o.dispatch_due_at) over ()) * 1000 due_ms, count(*) over ()::int total
      from fulfillments f join orders o on o.id = f.order_id and o.vendor_id = f.vendor_id
      where f.vendor_id = ${c.vendorId} and f.status in ('packed', 'ready_to_ship') and f.ship_confirmed_at is null order by o.dispatch_due_at nulls last, o.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'shipping', priority: 'high', title: group(total, 'packed order', 'packed orders', 'waiting for a shipping method'),
      explanation: 'Choose how these orders will ship so they can be dispatched on time.', impact: 'Dispatch delay', count: total, affected: affected(rs, 'order', (r) => String(r.order_number)), dueAt: date(rs[0]!.due_ms) ?? c.dueToday,
      recommendedAction: { text: 'Confirm a shipping method for the packed orders.', label: 'Choose shipping', href: '/shipping?filter[method]=missing' },
      details: { whyItMatters: 'Without a confirmed shipping method no label can be created, so the parcel cannot leave the warehouse.' },
    }];
  },
};

const labelUnavailable: Detector = {
  key: 'label_unavailable', area: 'shipping',
  async run(tx, c) {
    const rs = await rows(tx, sql`select s.id, s.number, count(*) over ()::int total from shipments s
      where s.vendor_id = ${c.vendorId} and s.status = 'created' and s.created_at < now() - interval '15 minutes' order by s.created_at, s.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'shipping', priority: 'high', title: group(total, 'shipment', 'shipments', 'missing a shipping label'),
      explanation: 'The courier did not return a label for these shipments.', impact: 'Dispatch delay', count: total, affected: affected(rs, 'shipment', (r) => String(r.number)), dueAt: c.dueToday,
      recommendedAction: { text: 'Retry creating the label or switch to another shipping method.', label: 'Review shipments', href: '/shipping?filter[status]=created' },
      details: { whyItMatters: 'A parcel without a label cannot be handed to the courier.' },
    }];
  },
};

const trackingNotReceived: Detector = {
  key: 'tracking_not_received', area: 'shipping',
  async run(tx, c) {
    const rs = await rows(tx, sql`select s.id, s.number, count(*) over ()::int total from shipments s
      where s.vendor_id = ${c.vendorId} and s.status = 'dispatched' and s.is_rto = false and s.dispatched_at < now() - make_interval(hours => ${c.settings.awaitingFirstScanHours}::int)
      order by s.dispatched_at, s.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'shipping', priority: 'medium', title: group(total, 'shipment', 'shipments', `still waiting for a first courier scan`),
      explanation: `No tracking update arrived within ${c.settings.awaitingFirstScanHours} hours of dispatch.`, impact: 'Delivery visibility', count: total, affected: affected(rs, 'shipment', (r) => String(r.number)), dueAt: c.dueToday,
      recommendedAction: { text: 'Check with the courier that the parcels were picked up.', label: 'Review shipments', href: '/shipping?filter[tracking]=awaiting_first_scan' },
      details: { whyItMatters: 'A parcel that is never scanned may be lost or never collected.' },
    }];
  },
};

const shippingSyncFailed: Detector = {
  key: 'shipping_sync_failed', area: 'shipping',
  async run(tx, c) {
    const rs = await rows(tx, sql`select s.id, s.number, count(*) over ()::int total from shipments s
      where s.vendor_id = ${c.vendorId} and s.status in ('dispatched', 'in_transit', 'out_for_delivery') and s.last_tracked_at is not null and s.last_tracked_at < now() - interval '6 hours'
      order by s.last_tracked_at, s.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'shipping', priority: 'medium', title: group(total, 'shipment', 'shipments', 'not updating from the courier'),
      explanation: 'Tracking has not been refreshed for several hours.', impact: 'Delivery visibility', count: total, affected: affected(rs, 'shipment', (r) => String(r.number)), dueAt: c.dueToday,
      recommendedAction: { text: 'Refresh tracking or check the courier connection.', label: 'Review shipments', href: '/shipping' },
      details: { whyItMatters: 'Stale tracking hides delays and failed deliveries from you and your customers.' },
    }];
  },
};

const shippingSlaRisk: Detector = {
  key: 'shipping_sla_risk', area: 'shipping',
  async run(tx, c) {
    const rs = await rows(tx, sql`select s.id, s.number, count(*) over ()::int total from shipments s
      where s.vendor_id = ${c.vendorId} and s.status in ('dispatched', 'in_transit', 'out_for_delivery', 'delivery_failed') and s.estimated_delivery_at is not null and s.estimated_delivery_at < now()
      order by s.estimated_delivery_at, s.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'shipping', priority: 'medium', title: group(total, 'shipment', 'shipments', 'past the estimated delivery date'),
      explanation: 'These parcels should already have been delivered.', impact: 'Customer delivery risk', count: total, affected: affected(rs, 'shipment', (r) => String(r.number)), dueAt: c.dueToday,
      recommendedAction: { text: 'Contact the courier about the delayed parcels.', label: 'Review shipments', href: '/shipping?filter[delayed]=true' },
      details: { whyItMatters: 'Late deliveries lead to complaints, returns and marketplace delivery-performance penalties.' },
    }];
  },
};

const connectorCapabilityLimit: Detector = {
  key: 'connector_capability_limit', area: 'shipping',
  async run(tx, c) {
    const rs = await rows(tx, sql`select p.id, p.label, count(*) over ()::int total from vendor_shipping_providers p
      where p.vendor_id = ${c.vendorId} and p.status = 'active' and coalesce(p.verification->>'state', 'unverified') <> 'verified'
        and exists (select 1 from fulfillments f where f.vendor_id = p.vendor_id and f.ship_provider_id = p.id and f.status in ('packed', 'ready_to_ship'))
      order by p.label, p.id limit 50`);
    if (rs.length === 0) return [];
    const total = num(rs[0]!.total);
    return [{
      key: this.key, scopeHash: '', area: 'shipping', priority: 'medium', title: group(total, 'shipping method', 'shipping methods', 'in use without verified capabilities'),
      explanation: 'Labels or tracking may not work until the method is verified.', impact: 'Shipping reliability', count: total, affected: affected(rs, 'provider', (r) => String(r.label)), dueAt: c.dueToday,
      recommendedAction: { text: 'Verify the capabilities of the shipping method.', label: 'Review shipping methods', href: '/shipping/methods' },
      details: { whyItMatters: 'Using a method whose capabilities are not verified risks failed labels and missing tracking.' },
    }];
  },
};

export const DETECTORS: Detector[] = [
  ordersDispatchRisk, stockBelowThreshold, listingsIncomplete, listingContentReview, listingContentFailed, channelSyncFailing, returnsAwaitingApproval, returnsInspectionOverdue, refundFailed, quantityMismatch, dispositionMissing,
  shippingNoMethod, labelUnavailable, trackingNotReceived, shippingSyncFailed, shippingSlaRisk, connectorCapabilityLimit, inventoryMismatch, warehouseImbalance,
];
