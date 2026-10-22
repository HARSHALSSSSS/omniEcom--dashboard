import { sql, type Tx } from '@oms/database';
import { DEFAULT_THRESHOLDS, classifyStock, stockLines, type InventoryFinding } from '@oms/mod-analytics';
import { channelOverview, accountStates } from './channel';
import type { Can } from './shell';
import { iso, n, rows, vendorFacts } from './util';

/** Days of cover the replenishment suggestion aims for (the figure the screen states: "14-day target cover, less available stock"). */
export const TARGET_COVER_DAYS = 14;

const MOVEMENT_LABEL: Record<string, string> = {
  receive: 'Stock received', incoming_receive: 'Stock received', return_restock: 'Return restocked', issue: 'Dispatched', commit: 'Dispatched', reserve: 'Reserved', release: 'Released',
  adjust: 'Adjusted', count: 'Stock count', damage: 'Marked damaged', undamage: 'Restored from damaged', transfer_out: 'Transferred out', transfer_in: 'Transferred in',
  shrinkage: 'Inventory shrinkage',
};
const label = (type: string): string => MOVEMENT_LABEL[type] ?? type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const NEEDS_STOCK = new Set(['out_of_stock', 'low_stock', 'stockout_risk']);

/** Units to add so that `days` of sales are covered, never negative; null without a sales rate (no velocity, no forecast). */
export function replenishmentUnits(f: Pick<InventoryFinding, 'unitsPerDay' | 'available'>, days = TARGET_COVER_DAYS): number | null {
  return f.unitsPerDay > 0 ? Math.max(0, Math.ceil(days * f.unitsPerDay - f.available)) : null;
}

/** Most urgent first: out of stock, then the shortest cover. */
const urgency = (a: InventoryFinding, b: InventoryFinding): number =>
  Number(b.flags.includes('out_of_stock')) - Number(a.flags.includes('out_of_stock')) || (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity) || a.sku.localeCompare(b.sku);

async function productCard(tx: Tx, vendorId: string, f: InventoryFinding, threshold: number) {
  const [info] = await rows(tx, sql`select p.id product_id, p.title, v.sku from product_variants v join products p on p.id = v.product_id and p.vendor_id = v.vendor_id
    where v.vendor_id = ${vendorId} and v.id = ${f.variantId}::uuid`);
  const places = await rows(tx, sql`select w.name from inventory i join warehouses w on w.id = i.warehouse_id and w.vendor_id = i.vendor_id
    where i.vendor_id = ${vendorId} and i.variant_id = ${f.variantId}::uuid and w.deleted_at is null order by w.priority, w.name`);
  const moves = await rows(tx, sql`select type, delta_on_hand, delta_reserved, delta_incoming, created_at from inventory_movements
    where vendor_id = ${vendorId} and variant_id = ${f.variantId}::uuid order by id desc limit 5`);
  const level = f.reorderLevel ?? threshold;
  const status = f.available <= 0 ? 'out' : f.available <= level ? 'low' : 'healthy';
  return {
    productId: String(info?.product_id ?? ''), variantId: f.variantId, title: String(info?.title ?? f.title ?? f.sku), sku: f.sku,
    location: places.length === 1 ? String(places[0]!.name) : places.length > 1 ? `${places.length} warehouses` : null,
    status: status as 'out' | 'low' | 'healthy', onHand: f.onHand, reserved: f.reserved, available: f.available, lowStockThreshold: level,
    salesVelocityPerDay: f.unitsPerDay, estimatedCoverDays: f.daysOfCover === null ? null : Math.floor(f.daysOfCover),
    recentMovements: moves.map((m) => {
      const type = String(m.type);
      const qty = type === 'reserve' || type === 'release' ? n(m.delta_reserved) : n(m.delta_on_hand) !== 0 ? n(m.delta_on_hand) : n(m.delta_incoming);
      return { at: iso(m.created_at)!, type, label: label(type), quantity: qty, positive: qty > 0 };
    }),
    actions: [
      { key: 'review_replenishment', label: 'Review replenishment', href: '/procurement' },
      { key: 'open_product', label: 'Open product', href: `/products/${String(info?.product_id ?? '')}` },
    ],
  };
}

export interface RecommendationsQuery { accountId?: string; variantId?: string; limit: number; targetDays: number }

/**
 * The three context cards of the Recommendations page, built from live data:
 *  - channel: the connection that needs attention (or the one asked for), with its open problems and the retry / manage actions;
 *  - product: the most urgent stock line (or the one asked for) with on hand / reserved / cover and its latest movements;
 *  - replenishment: the stock lines that need stock with suggested units = target days of sales - available.
 * A card the caller may not read, or that has nothing to show, is null. Recommendation only: nothing is changed.
 */
export async function recommendations(tx: Tx, vendorId: string, can: Can, q: RecommendationsQuery) {
  const facts = await vendorFacts(tx, vendorId);
  let channel: Awaited<ReturnType<typeof channelOverview>> | null = null;
  let channelCount = 0;
  if (can('marketplace_accounts:read')) {
    const states = (await accountStates(tx, vendorId)).filter((a) => a.connection !== 'not_connected');
    channelCount = states.length;
    const pick = q.accountId ? states.find((a) => a.id === q.accountId) : (states.find((a) => a.problems.length > 0 || a.connection !== 'connected') ?? null);
    if (pick) channel = await channelOverview(tx, vendorId, pick.id, can);
  }

  let product: Awaited<ReturnType<typeof productCard>> | null = null;
  let replenishment: Record<string, unknown> | null = null;
  if (can('inventory:read')) {
    const findings = (await stockLines(tx, vendorId, DEFAULT_THRESHOLDS.windowDays)).map((l) => classifyStock(l, DEFAULT_THRESHOLDS));
    // a line needs stock when the sales analysis says so OR when it is at or under the business's own low-stock threshold (the same rule the dashboard and the issue queue use)
    const needs = findings.filter((f) => f.flags.some((x) => NEEDS_STOCK.has(x)) || f.available <= facts.lowStockThreshold).sort(urgency);
    const focus = q.variantId ? findings.find((f) => f.variantId === q.variantId) : needs[0];
    if (focus) product = await productCard(tx, vendorId, focus, facts.lowStockThreshold);
    const items = needs.flatMap((f) => {
      const add = replenishmentUnits(f, q.targetDays);
      return add !== null && add > 0 ? [{ variantId: f.variantId, name: f.title ?? f.sku, sku: f.sku, available: f.available, salesVelocityPerDay: f.unitsPerDay, coverDays: f.daysOfCover, suggestedUnits: add }] : [];
    });
    replenishment = items.length === 0 ? null : {
      headline: `Replenish ${items.length} ${items.length === 1 ? 'product' : 'products'} this week`,
      approachingThreshold: needs.length,
      summary: `${needs.length} ${needs.length === 1 ? 'product is' : 'products are'} approaching ${needs.length === 1 ? 'its' : 'their'} stock threshold.`,
      rationale: `Based on units sold over the last ${DEFAULT_THRESHOLDS.windowDays} days, replenishing ${items.length === 1 ? 'this product' : `these ${items.length} products`} could reduce potential stockouts.`,
      targetDays: q.targetDays, formula: `${q.targetDays} days of sales minus available stock`, shown: Math.min(items.length, q.limit), totalProducts: items.length,
      items: items.slice(0, q.limit),
      note: 'Recommendation only. Review quantities and supplier lead times before deciding. No inventory changes have been made.',
      actions: [{ key: 'review_replenishment', label: 'Review replenishment', href: '/procurement' }],
    };
  }
  return { asOf: new Date().toISOString(), channel, channelConnections: channelCount, product, replenishment };
}
