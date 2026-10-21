/**
 * Defaults and resolution of the business settings document (`vendors.settings`, validated by `VendorSettingsSchema`).
 *
 * Who reads which flag:
 *  - `lowStockThreshold`, `sla.*`, `returns.*`, `shipping.*`, `inventory.*`: issue detectors, inventory health, dashboards.
 *  - `notifications.{lowStock, orderAlerts, syncFailures}` (legacy switches) and `alerts.*` (the Settings > Alerts screen):
 *    the notifications module, see `alertGateFor`. A notification is created only when BOTH the legacy switch and the alert
 *    flag of its type are on (an absent flag counts as on).
 *  - `operations.*` and `numberFormat`: stored here and returned by `GET /settings`; the order, pricing and inventory modules
 *    read them through `resolveSettings` when they apply the behaviour (auto acknowledge, round to 9, channel stock buffer).
 */

export const FULFILLMENT_METHODS = ['marketplace', 'seller', 'third_party'] as const;
export const NUMBER_FORMATS = ['indian', 'international'] as const;

export const OPERATIONS_DEFAULTS = {
  autoAcknowledgeOrders: false,
  roundPriceToNine: false,
  defaultInventoryBufferPercent: 0,
  defaultFulfillmentMethod: null as (typeof FULFILLMENT_METHODS)[number] | null,
  defaultWarehouseId: null as string | null,
};

export const ALERT_DEFAULTS = {
  dispatchSlaBreach: { enabled: true, thresholdMinutes: 45 },
  criticalStockouts: true,
  tokenRenewals: true,
  syncFailures: true,
  returns: true,
};

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export interface ResolvedAlerts {
  dispatchSlaBreach: { enabled: boolean; thresholdMinutes: number };
  criticalStockouts: boolean;
  tokenRenewals: boolean;
  syncFailures: boolean;
  returns: boolean;
}
export type ResolvedOperations = typeof OPERATIONS_DEFAULTS;

export interface ResolvedSettings {
  lowStockThreshold: number;
  numberFormat: (typeof NUMBER_FORMATS)[number];
  operations: ResolvedOperations;
  alerts: ResolvedAlerts;
  notifications: { lowStock: boolean; orderAlerts: boolean; syncFailures: boolean };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/** The settings document with every default applied (what the screens show and what producers consult). */
export function resolveSettings(raw: unknown): ResolvedSettings {
  const s = obj(raw);
  const op = obj(s.operations);
  const al = obj(s.alerts);
  const sla = obj(al.dispatchSlaBreach);
  const nt = obj(s.notifications);
  const method = FULFILLMENT_METHODS.find((m) => m === op.defaultFulfillmentMethod) ?? null;
  return {
    lowStockThreshold: typeof s.lowStockThreshold === 'number' ? s.lowStockThreshold : DEFAULT_LOW_STOCK_THRESHOLD,
    numberFormat: s.numberFormat === 'international' ? 'international' : 'indian',
    operations: {
      autoAcknowledgeOrders: bool(op.autoAcknowledgeOrders, OPERATIONS_DEFAULTS.autoAcknowledgeOrders),
      roundPriceToNine: bool(op.roundPriceToNine, OPERATIONS_DEFAULTS.roundPriceToNine),
      defaultInventoryBufferPercent: typeof op.defaultInventoryBufferPercent === 'number' ? op.defaultInventoryBufferPercent : OPERATIONS_DEFAULTS.defaultInventoryBufferPercent,
      defaultFulfillmentMethod: method,
      defaultWarehouseId: typeof op.defaultWarehouseId === 'string' ? op.defaultWarehouseId : null,
    },
    alerts: {
      dispatchSlaBreach: {
        enabled: bool(sla.enabled, ALERT_DEFAULTS.dispatchSlaBreach.enabled),
        thresholdMinutes: typeof sla.thresholdMinutes === 'number' ? sla.thresholdMinutes : ALERT_DEFAULTS.dispatchSlaBreach.thresholdMinutes,
      },
      criticalStockouts: bool(al.criticalStockouts, ALERT_DEFAULTS.criticalStockouts),
      tokenRenewals: bool(al.tokenRenewals, ALERT_DEFAULTS.tokenRenewals),
      syncFailures: bool(al.syncFailures, ALERT_DEFAULTS.syncFailures),
      returns: bool(al.returns, ALERT_DEFAULTS.returns),
    },
    notifications: { lowStock: bool(nt.lowStock, true), orderAlerts: bool(nt.orderAlerts, true), syncFailures: bool(nt.syncFailures, true) },
  };
}

/** The alert families a notification type can be switched off by. */
export type AlertGate = 'orderAlerts' | 'lowStock' | 'syncFailures' | 'tokenRenewals' | 'returns' | 'dispatchSlaBreach';

/** Is this family of alerts switched on? (every family may also be on a legacy switch AND a screen flag; both must allow it) */
export function alertEnabled(settings: ResolvedSettings, gate: AlertGate): boolean {
  const { alerts, notifications } = settings;
  switch (gate) {
    case 'orderAlerts': return notifications.orderAlerts;
    case 'lowStock': return notifications.lowStock && alerts.criticalStockouts;
    case 'syncFailures': return notifications.syncFailures && alerts.syncFailures;
    case 'tokenRenewals': return alerts.tokenRenewals;
    case 'returns': return alerts.returns;
    case 'dispatchSlaBreach': return alerts.dispatchSlaBreach.enabled;
  }
}
