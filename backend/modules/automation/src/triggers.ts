// ------------------------------------------------------------------------------------------------
// triggers: the domain events a rule can listen to, with the facts each one offers.
// `order.sla_at_risk`, `price.competitor_lower` and `schedule.cadence` are announced by the scheduled scan (scan.ts), not by another module.
// ------------------------------------------------------------------------------------------------
export const TRIGGERS: Record<string, { description: string; facts: string[] }> = {
  'order.created': { description: 'A marketplace order arrived and stock was reserved', facts: ['orderNumber', 'marketplace', 'totalMinor', 'status'] },
  'order.needs_attention': { description: 'An order needs a person (unmapped SKU, short stock, short pick)', facts: ['reason', 'orderItemId', 'quantity'] },
  'order.cancellation_requested': { description: 'Someone asked to cancel an order', facts: ['orderNumber', 'initiator', 'reasonCode', 'orderStatus'] },
  'order.sla_at_risk': { description: 'An order is close to (or past) its dispatch deadline', facts: ['orderNumber', 'marketplace', 'state', 'minutesToDue', 'dueAt', 'totalMinor'] },
  'inventory.low_stock': { description: 'Available stock fell to / below the reorder level', facts: ['variantId', 'warehouseId', 'available', 'reorderLevel'] },
  'price.competitor_lower': { description: 'A recorded competitor price is lower than our live price', facts: ['listingId', 'variantId', 'accountId', 'sku', 'ourPriceMinor', 'competitorPriceMinor', 'gapMinor', 'gapBps', 'sellerName', 'marketplace'] },
  'schedule.cadence': { description: 'A daily / weekly time slot arrived (hourly tick in the business time zone; add `hour` and optionally `weekday` conditions)', facts: ['date', 'hour', 'weekday', 'slot'] },
  'sync.failed': { description: 'A marketplace sync job failed (it will retry)', facts: ['type', 'accountId', 'error', 'attempts'] },
  'sync.dead_lettered': { description: 'A sync job gave up', facts: ['type', 'accountId', 'error', 'attempts'] },
  'listing.failed': { description: 'A marketplace rejected a listing', facts: ['sku', 'externalSku', 'reason', 'error'] },
  'return.received': { description: 'A return arrived at a warehouse', facts: ['number', 'orderId', 'units', 'source', 'warehouseId'] },
  'marketplace_account.disconnected': { description: 'A marketplace account was disconnected', facts: [] },
  'marketplace_account.authorization_expired': { description: 'A marketplace authorisation expired', facts: [] },
  'fulfillment.exception_raised': { description: 'A warehouse exception was raised', facts: ['number', 'kind', 'warehouseId'] },
  'shipment.ndr_raised': { description: 'A delivery attempt failed', facts: ['number', 'attemptNo', 'reason'] },
  'shipment.rto_started': { description: 'A shipment is returning to origin', facts: ['number'] },
};

/** events announced by the scan job */
export const SCAN_EVENTS = ['order.sla_at_risk', 'price.competitor_lower', 'schedule.cadence'] as const;

/** the screen's trigger vocabulary for the events it knows; every other event keeps its own name */
const SCREEN_TRIGGER: Record<string, string> = {
  'inventory.low_stock': 'stock_below_threshold',
  'order.sla_at_risk': 'order_sla_risk',
  'price.competitor_lower': 'buybox_price_drop',
  'sync.failed': 'listing_sync_failure',
  'sync.dead_lettered': 'listing_sync_failure',
  'listing.failed': 'listing_sync_failure',
  'schedule.cadence': 'scheduled_cadence',
};
/** the screen's action vocabulary; `notify` is the in-app / e-mail notice the screen shows as its channel notification */
const SCREEN_ACTION: Record<string, string> = { notify: 'notify_channel_slack' };

export const screenTrigger = (event: string): string => SCREEN_TRIGGER[event] ?? event;
export const screenAction = (type: string): string => SCREEN_ACTION[type] ?? type;
