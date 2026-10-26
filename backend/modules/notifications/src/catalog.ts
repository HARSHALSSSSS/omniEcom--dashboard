import type { schema } from '@oms/database';
import type { AlertGate } from '@oms/mod-vendors';

/**
 * Which domain events become notifications, and how. A notification type is a stable string users can set preferences for;
 * the event is just where it comes from. Adding an alert = adding a line here (and the event in the module's `consumes`).
 */
type Severity = (typeof schema.NOTIFICATION_SEVERITIES)[number];
type Channel = (typeof schema.NOTIFICATION_CHANNELS)[number];
type P = Record<string, unknown>;
const s = (v: unknown, d = ''): string => (v === undefined || v === null || v === '' ? d : String(v));
const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
/** "₹1,234.50" (Indian digit grouping, like the screens); an unknown currency keeps its code in front */
export const money = (minor: unknown, currency = 'INR'): string => {
  if (typeof minor !== 'number' || !Number.isFinite(minor)) return '';
  const amount = (minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbol = SYMBOLS[currency];
  return symbol ? `${symbol}${amount}` : `${currency} ${amount}`;
};
/** the marketplace as a person reads it: the connector's display name when the service resolved it, the code otherwise */
const marketplaceName = (p: P): string => s(p.marketplaceName ?? p.marketplace);

export const CATEGORIES = ['order', 'inventory', 'connector', 'security', 'returns', 'system'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Spec {
  type: string;
  /** the bucket the notification panel groups by */
  category: Category;
  /** the alert family (Settings > Alerts, legacy notification switches) that can switch this type off; none = always on */
  gate?: AlertGate;
  /** where "Take action" leads: an app route */
  action?: (aggregateId: string, p: P) => string | null;
  label: string;
  severity: Severity;
  title: (p: P) => string;
  body?: (p: P) => string;
  entity?: (aggregateId: string, p: P) => { type: string; id: string } | null;
  /** same key + same recipient while the previous one is unread = one notification (alert storms collapse) */
  dedupe?: (aggregateId: string, p: P) => string | null;
}

export const DEFAULT_CHANNELS: Record<Severity, Channel[]> = { info: ['in_app'], warning: ['in_app', 'email'], critical: ['in_app', 'email', 'push'] };

export const SPECS: Record<string, Spec> = {
  'order.created': { type: 'order.new', category: 'order', gate: 'orderAlerts', action: (id) => `/orders/${id}`, label: 'New order received', severity: 'info', title: (p) => `New order ${s(p.orderNumber)}`, body: (p) => [marketplaceName(p), money(p.totalMinor)].filter(Boolean).join(' · '), entity: (id) => ({ type: 'order', id }) },
  'order.needs_attention': { type: 'order.attention', category: 'order', gate: 'orderAlerts', action: (id) => `/orders/${id}`, label: 'An order needs attention', severity: 'warning', title: (p) => `Order needs attention: ${s(p.reason, 'check the order')}`, entity: (id) => ({ type: 'order', id }), dedupe: (id, p) => `order-attention:${id}:${s(p.reason)}` },
  'order.cancellation_requested': { type: 'order.cancellation_requested', category: 'order', gate: 'orderAlerts', action: (id) => `/orders/${id}`, label: 'A cancellation was requested', severity: 'warning', title: (p) => `Cancellation requested for ${s(p.orderNumber)}`, body: (p) => `By ${s(p.initiator)}: ${s(p.reasonCode)}`, entity: (id) => ({ type: 'order', id }) },
  'inventory.low_stock': { type: 'inventory.low_stock', category: 'inventory', gate: 'lowStock', action: (_id, p) => (p.variantId ? `/inventory?search=${encodeURIComponent(s(p.sku ?? p.variantId))}` : '/inventory'), label: 'Low stock', severity: 'warning', title: (p) => `Low stock: ${s(p.available)} left (reorder level ${s(p.reorderLevel)})`, entity: (_id, p) => (p.variantId ? { type: 'variant', id: s(p.variantId) } : null), dedupe: (_id, p) => `low-stock:${s(p.variantId)}:${s(p.warehouseId)}` },
  'sync.failed': { type: 'sync.failed', category: 'connector', gate: 'syncFailures', action: () => '/marketplace-hub/health', label: 'A marketplace sync failed', severity: 'warning', title: (p) => `${s(p.type, 'Sync')} sync failed`, body: (p) => s(p.error), entity: (id) => ({ type: 'sync_job', id }), dedupe: (_id, p) => `sync-failed:${s(p.accountId)}:${s(p.type)}` },
  'sync.dead_lettered': { type: 'sync.dead_lettered', category: 'connector', gate: 'syncFailures', action: () => '/marketplace-hub/health', label: 'A marketplace sync gave up', severity: 'critical', title: (p) => `${s(p.type, 'Sync')} sync gave up after ${s(p.attempts, 'several')} attempts`, body: (p) => s(p.error), entity: (id) => ({ type: 'sync_job', id }), dedupe: (_id, p) => `sync-dead:${s(p.accountId)}:${s(p.type)}` },
  'listing.failed': { type: 'listing.rejected', category: 'connector', action: (id) => `/listings/${id}`, label: 'A listing was rejected', severity: 'warning', title: (p) => `Listing ${s(p.sku ?? p.externalSku, '')} was rejected`.replace('  ', ' '), body: (p) => s(p.reason ?? p.error), entity: (id) => ({ type: 'listing', id }) },
  'return.received': { type: 'return.received', category: 'returns', gate: 'returns', action: (id) => `/returns/${id}`, label: 'A return arrived', severity: 'info', title: (p) => `Return ${s(p.number)} received (${s(p.units)} unit(s))`, body: () => 'Inspect it to restock or write it off.', entity: (id) => ({ type: 'return', id }) },
  'marketplace_account.authorization_expired': { type: 'marketplace.authorization_expired', category: 'connector', gate: 'tokenRenewals', action: () => '/marketplace-hub/health', label: 'A marketplace authorisation expired', severity: 'critical', title: () => 'A marketplace authorisation expired: reconnect it', entity: (id) => ({ type: 'marketplace_account', id }), dedupe: (id) => `auth-expired:${id}` },
  'marketplace_account.disconnected': { type: 'marketplace.disconnected', category: 'connector', action: () => '/marketplace-hub/health', label: 'A marketplace was disconnected', severity: 'critical', title: () => 'A marketplace account was disconnected', body: () => 'Orders and stock are no longer synchronised for it.', entity: (id) => ({ type: 'marketplace_account', id }), dedupe: (id) => `disconnected:${id}` },
  'fulfillment.exception_raised': { type: 'fulfillment.exception', category: 'order', action: () => '/fulfillment', label: 'A warehouse exception', severity: 'warning', title: (p) => `Warehouse exception on ${s(p.number)}: ${s(p.kind)}`, entity: (id) => ({ type: 'fulfillment', id }) },
  'shipment.ndr_raised': { type: 'shipment.ndr', category: 'order', action: () => '/shipping', label: 'A delivery attempt failed (NDR)', severity: 'warning', title: (p) => `Delivery failed for ${s(p.number)} (attempt ${s(p.attemptNo)})`, body: (p) => s(p.reason), entity: (id) => ({ type: 'shipment', id }), dedupe: (id, p) => `ndr:${id}:${s(p.attemptNo)}` },
  'shipment.rto_started': { type: 'shipment.rto', category: 'order', action: () => '/shipping', label: 'A shipment is returning to origin', severity: 'warning', title: (p) => `Shipment ${s(p.number)} is returning to origin (RTO)`, entity: (id) => ({ type: 'shipment', id }) },
  'return.created': { type: 'return.requested', category: 'returns', gate: 'returns', action: (id) => `/returns/${id}`, label: 'A return was requested', severity: 'info', title: (p) => `Return requested for order ${s(p.orderNumber)}`, body: (p) => `${s(p.units)} unit(s), reason ${s(p.reasonCode)}`, entity: (id) => ({ type: 'return', id }) },
  // bulk product import finished (the screens link to the processing page of the import)
  'import.committed': { type: 'import.finished', category: 'system', action: (id) => `/products/import/${id}/processing`, label: 'A product import finished', severity: 'info', title: (p) => `Import finished: ${s(p.created ?? p.productsCreated, '0')} created, ${s(p.updated ?? p.productsUpdated, '0')} updated, ${s(p.failed, '0')} failed`, body: (p) => (p.status === 'partially_committed' ? 'Some rows still need attention.' : 'All imported rows are in your catalogue.'), entity: (id) => ({ type: 'import_session', id }) },
  'import.failed': { type: 'import.failed', category: 'system', action: (id) => `/products/import/${id}/processing`, label: 'A product import failed', severity: 'warning', title: (p) => `Import finished: ${s(p.created, '0')} created, ${s(p.updated, '0')} updated, ${s(p.failed, '0')} failed`, body: (p) => s(p.message, 'The import could not be completed.'), entity: (id) => ({ type: 'import_session', id }) },
  // purchasing and stock work the seller does themselves: they get a trace of it (and so does the rest of the team)
  'purchase_order.submitted': { type: 'procurement.po_submitted', category: 'inventory', action: (id) => `/procurement?po=${id}`, label: 'A purchase order was sent to the supplier', severity: 'info', title: (p) => `Purchase order ${s(p.poNumber)} sent to the supplier`, body: (p) => `${s(p.units, '0')} unit(s) ordered. They now count as incoming stock.`, entity: (id) => ({ type: 'purchase_order', id }) },
  'purchase_order.received': { type: 'procurement.po_received', category: 'inventory', action: (id) => `/procurement?po=${id}`, label: 'Stock arrived for a purchase order', severity: 'info', title: (p) => (p.complete ? `Purchase order ${s(p.poNumber)} fully received` : `Purchase order ${s(p.poNumber)} partly received`), body: (p) => `${s(p.units, '0')} unit(s) received${Number(p.damaged) > 0 ? `, ${s(p.damaged)} damaged` : ''}.`, entity: (id) => ({ type: 'purchase_order', id }) },
  'purchase_order.cancelled': { type: 'procurement.po_cancelled', category: 'inventory', action: (id) => `/procurement?po=${id}`, label: 'A purchase order was cancelled', severity: 'warning', title: (p) => `Purchase order ${s(p.poNumber)} cancelled`, body: (p) => s(p.reason, 'No reason given'), entity: (id) => ({ type: 'purchase_order', id }) },
  'inventory.stock_adjusted': { type: 'inventory.stock_adjusted', category: 'inventory', action: (_id, p) => (p.sku ? `/inventory?search=${encodeURIComponent(s(p.sku))}` : '/inventory'), label: 'Stock was adjusted', severity: 'info', title: (p) => `Stock adjusted (${s(p.adjustmentType, 'adjustment').replace(/_/g, ' ')}): ${s(p.sku, 'a product')}`, body: (p) => `${s(p.availableBefore)} to ${s(p.availableAfter)} available${p.warehouseName ? ` in ${s(p.warehouseName)}` : ''}. ${s(p.reason)}`, entity: (_id, p) => (p.variantId ? { type: 'variant', id: s(p.variantId) } : null), dedupe: (_id, p) => `stock_adjusted:${s(p.variantId)}:${s(p.warehouseId)}` },
  'inventory.transferred': { type: 'inventory.transferred', category: 'inventory', action: () => '/inventory', label: 'A stock transfer completed', severity: 'info', title: (p) => `Stock transfer ${s(p.number)} completed`, body: (p) => `${s(p.units, '0')} unit(s) moved from ${s(p.fromName)} to ${s(p.toName)}${Number(p.shortUnits) > 0 ? `; ${s(p.shortUnits)} unit(s) did not arrive and went back` : ''}.`, entity: (id) => ({ type: 'stock_transfer', id }) },
  // pricing: a proposal waits for review (collapsed while unread, a policy run can make many) and a price change was applied
  'pricing.proposal_created': { type: 'pricing.proposal_created', category: 'system', action: () => '/pricing?view=proposals', label: 'A price proposal is waiting for review', severity: 'info', title: () => 'Price proposals are waiting for your review', body: (p) => `${s(p.sku, 'A product')}: ${money(p.currentPriceMinor)} to ${money(p.proposedPriceMinor)}. Nothing changes until you approve.`, entity: (id) => ({ type: 'price_proposal', id }), dedupe: () => 'pricing-proposals-waiting' },
  'pricing.proposal_approved': { type: 'pricing.price_applied', category: 'system', action: () => '/pricing?view=history', label: 'A price change was applied', severity: 'info', title: (p) => (p.auto ? 'A price was updated automatically' : 'A price change was approved'), body: (p) => `${money(p.currentPriceMinor)} to ${money(p.proposedPriceMinor)}${p.pushSkipped ? '. Change it in the marketplace seller panel too.' : ''}`, entity: (id) => ({ type: 'price_proposal', id }) },
  // promotions: a campaign was created, started, or finished (with what it earned)
  'promotion.created': { type: 'promotion.created', category: 'system', action: (id) => `/promotions?view=campaigns&open=${id}`, label: 'A promotion campaign was created', severity: 'info', title: (p) => `Campaign ${s(p.name)} created as a draft`, body: (p) => `Code ${s(p.code)}. Nothing is on a marketplace until it is scheduled or started.`, entity: (id) => ({ type: 'promotion_campaign', id }) },
  'promotion.activated': { type: 'promotion.activated', category: 'system', action: (id) => `/promotions?view=campaigns&open=${id}`, label: 'A promotion campaign started', severity: 'info', title: (p) => `Campaign ${s(p.name)} is running`, body: () => 'The sale prices are on the marketplace prices; Listings and Pricing show them.', entity: (id) => ({ type: 'promotion_campaign', id }) },
  'promotion.ended': { type: 'promotion.ended', category: 'system', action: (id) => `/promotions?view=campaigns&open=${id}`, label: 'A promotion campaign ended', severity: 'info', title: (p) => `Campaign ${s(p.name)} ended`, body: (p) => `${s(p.reason).replace(/_/g, ' ') || 'Ended'}. ${s(p.unitsMoved, '0')} unit(s) sold, ${money(p.revenueMinor)} revenue, ${money(p.spendMinor)} discount given. The regular prices are back.`, entity: (id) => ({ type: 'promotion_campaign', id }) },
  'user.invited': { type: 'security.user_invited', category: 'security', action: () => '/settings', label: 'A team member was invited', severity: 'info', title: () => 'A team member was invited', body: (p) => `Role: ${s(p.roleKey).replace('vendor_', '')}`, entity: (id) => ({ type: 'invitation', id }) },
  'user.deactivated': { type: 'security.user_removed', category: 'security', action: () => '/settings', label: 'A team member was removed', severity: 'warning', title: () => 'A team member was removed', body: () => 'Their sessions were ended.', entity: (id) => ({ type: 'user', id }) },
  'webhook.dead_lettered': { type: 'webhook.dead_lettered', category: 'connector', action: () => '/marketplace-hub/health', label: 'A marketplace webhook could not be processed', severity: 'warning', title: () => 'A marketplace webhook could not be processed', entity: (id) => ({ type: 'webhook', id }) },
};

/**
 * Alerts produced by a scheduled scan (`notifications.scan-alerts`) instead of a domain event: they have no event to subscribe to.
 * They are notification types like the others (preferences, categories, de-duplication).
 */
export const SCAN_SPECS: Record<string, Spec> = {
  'order.sla_breach': { type: 'order.sla_breach', category: 'order', gate: 'dispatchSlaBreach', action: () => '/orders?attention=true', label: 'Orders about to miss their dispatch deadline', severity: 'critical', title: (p) => `${s(p.count)} order(s) must be dispatched within ${s(p.thresholdMinutes)} minutes`, body: (p) => s(p.sample) },
  'marketplace_account.token_expiring': { type: 'marketplace.token_expiring', category: 'connector', gate: 'tokenRenewals', action: () => '/marketplace-hub/health', label: 'A marketplace token is about to expire', severity: 'warning', title: (p) => `${s(p.account, 'A marketplace')} token expires in ${s(p.hours)} hours and could not be renewed`, body: () => 'Reconnect the account before it expires.' },
};

const ALL_SPECS: Record<string, Spec> = { ...SPECS, ...SCAN_SPECS };
export const TYPE_CATALOG = Object.entries(ALL_SPECS).map(([event, sp]) => ({ type: sp.type, label: sp.label, event, category: sp.category, severity: sp.severity, defaultChannels: DEFAULT_CHANNELS[sp.severity] }));

/** notification type -> category ('system' for types that are not catalogued, e.g. automation notices) */
export const categoryOfType = (type: string): Category => Object.values(ALL_SPECS).find((x) => x.type === type)?.category ?? 'system';

/** app route behind "Take action": stored with the notification, else derived from the entity it is about */
export function actionUrlFor(n: { type: string; entityType: string | null; entityId: string | null; data: unknown }): string | null {
  const stored = (n.data as { actionUrl?: unknown } | null)?.actionUrl;
  if (typeof stored === 'string') return stored;
  const spec = Object.values(ALL_SPECS).find((x) => x.type === n.type);
  return spec?.action?.(n.entityId ?? '', {}) ?? null;
}
export const NOTIFICATION_TYPES = TYPE_CATALOG.map((t) => t.type);
