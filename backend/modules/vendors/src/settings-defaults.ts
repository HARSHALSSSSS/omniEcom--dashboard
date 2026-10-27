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

/** the screens a business may pick as its landing page after sign-in (the frontend maps each to its route) */
export const LANDING_ROUTES = ['/', '/orders', '/listings', '/inventory', '/pricing', '/reports', '/products', '/profitability', '/product-intelligence', '/returns', '/shipping', '/procurement'] as const;
export const LANGUAGES = ['en-IN', 'en-US', 'en-GB'] as const;
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const CATALOG_VIEWS = ['all_active', 'low_stock', 'primary_warehouse'] as const;
export const REPORTING_PERIODS = ['7d', '30d', 'qtd', 'fytd'] as const;
export const TELEMETRY_SECONDS = [15, 30, 60] as const;
export const SKU_CASINGS = ['uppercase', 'lowercase', 'as_is'] as const;
export const SYNC_SOVEREIGNTY = ['master_catalog', 'channel_autonomous'] as const;
export const PRICE_ENDINGS = ['nine', 'zero', 'exact'] as const;
export const TIER_STATUSES = ['active', 'draft', 'paused'] as const;

export const PREFERENCES_DEFAULTS = {
  defaultRoute: '/' as (typeof LANDING_ROUTES)[number],
  language: 'en-IN' as (typeof LANGUAGES)[number],
  pageSize: 25 as (typeof PAGE_SIZES)[number],
  catalogView: 'all_active' as (typeof CATALOG_VIEWS)[number],
  reportingPeriod: '30d' as (typeof REPORTING_PERIODS)[number],
  telemetrySeconds: 30 as (typeof TELEMETRY_SECONDS)[number],
  showThumbnails: true,
  guardrails: { bulkConfirm: true, stockAllocationConfirm: true, zeroStockDelistWarning: true },
};
export const CATALOG_DEFAULTS = {
  requireHsn: false,
  skuPrefix: '',
  skuTemplate: '[BRAND]-[CAT3]-[SEQ6]',
  /** true once the seller saved a formula: only then is it enforced (the default template is a suggestion) */
  skuTemplateSet: false,
  skuSeparator: '-' as '-' | '_' | '/',
  skuCasing: 'uppercase' as (typeof SKU_CASINGS)[number],
  strictEan: false,
  gates: { hsnCode: false, countryOfOrigin: false, gstRateSlab: false },
  syncSovereignty: 'master_catalog' as (typeof SYNC_SOVEREIGNTY)[number],
};
export const INVENTORY_DEFAULTS = {
  mode: 'simple' as 'simple' | 'warehouse',
  startingMethod: null as 'manual' | 'marketplace' | 'file' | null,
  defaultLeadTimeDays: 7,
  minSafetyStockUnits: 0,
  spikeProtectionUnitsPerHour: 200,
  negativeStockTwoStepApproval: false,
};
export interface ChannelTier {
  baseMarkupBps: number; fixedFeeBufferMinor: number; hardFloorMinor: number | null; maxDiscountBps: number; repriceIntervalMinutes: number;
  minNetMarginBps: number | null; autoDelistOnBreach: boolean; dealFloorMinor: number | null; mandate2faForMarkdown: boolean; status: (typeof TIER_STATUSES)[number];
}
export const TIER_DEFAULTS: ChannelTier = {
  baseMarkupBps: 0, fixedFeeBufferMinor: 0, hardFloorMinor: null, maxDiscountBps: 2000, repriceIntervalMinutes: 60,
  minNetMarginBps: null, autoDelistOnBreach: false, dealFloorMinor: null, mandate2faForMarkdown: false, status: 'active',
};
/** 1% TCS + 0.1% TDS 194-O of the sale value: what the toggle "withhold buffer" means */
export const TCS_TDS_BUFFER_BPS = 110;
export const PRICING_DEFAULTS = {
  marginFloorBps: null as number | null,
  maxVelocityShiftBps: 1500,
  legalMetrologyMrpGate: true,
  withholdBufferBps: 0,
  autoDelistOnBreach: false,
  mandate2faBulkMarkdown: false,
};

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
  preferences: typeof PREFERENCES_DEFAULTS;
  catalog: typeof CATALOG_DEFAULTS;
  inventory: typeof INVENTORY_DEFAULTS;
  pricing: typeof PRICING_DEFAULTS & { priceEnding: (typeof PRICE_ENDINGS)[number]; channelTiers: Record<string, ChannelTier> };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown, d: number | null): number | null => (v === null ? null : typeof v === 'number' && Number.isFinite(v) ? v : d);
const pick = <T extends string | number>(list: readonly T[], v: unknown, d: T): T => list.find((x) => x === v) ?? d;

/** The settings document with every default applied (what the screens show and what producers consult). */
export function resolveSettings(raw: unknown): ResolvedSettings {
  const s = obj(raw);
  const op = obj(s.operations);
  const al = obj(s.alerts);
  const sla = obj(al.dispatchSlaBreach);
  const nt = obj(s.notifications);
  const pf = obj(s.preferences);
  const gr = obj(pf.guardrails);
  const ca = obj(s.catalog);
  const ga = obj(ca.gates);
  const iv = obj(s.inventory);
  const pr = obj(s.pricing);
  const tiers = obj(pr.channelTiers);
  const roundNine = bool(op.roundPriceToNine, OPERATIONS_DEFAULTS.roundPriceToNine);
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
    preferences: {
      defaultRoute: pick(LANDING_ROUTES, pf.defaultRoute, PREFERENCES_DEFAULTS.defaultRoute),
      language: pick(LANGUAGES, pf.language, PREFERENCES_DEFAULTS.language),
      pageSize: pick(PAGE_SIZES, pf.pageSize, PREFERENCES_DEFAULTS.pageSize),
      catalogView: pick(CATALOG_VIEWS, pf.catalogView, PREFERENCES_DEFAULTS.catalogView),
      reportingPeriod: pick(REPORTING_PERIODS, pf.reportingPeriod, PREFERENCES_DEFAULTS.reportingPeriod),
      telemetrySeconds: pick(TELEMETRY_SECONDS, pf.telemetrySeconds, PREFERENCES_DEFAULTS.telemetrySeconds),
      showThumbnails: bool(pf.showThumbnails, PREFERENCES_DEFAULTS.showThumbnails),
      guardrails: {
        bulkConfirm: bool(gr.bulkConfirm, true), stockAllocationConfirm: bool(gr.stockAllocationConfirm, true), zeroStockDelistWarning: bool(gr.zeroStockDelistWarning, true),
      },
    },
    catalog: {
      requireHsn: bool(ca.requireHsn, CATALOG_DEFAULTS.requireHsn),
      skuPrefix: typeof ca.skuPrefix === 'string' ? ca.skuPrefix : CATALOG_DEFAULTS.skuPrefix,
      skuTemplate: typeof ca.skuTemplate === 'string' && ca.skuTemplate ? ca.skuTemplate : CATALOG_DEFAULTS.skuTemplate,
      skuTemplateSet: typeof ca.skuTemplate === 'string' && ca.skuTemplate.trim().length > 0,
      skuSeparator: pick(['-', '_', '/'] as const, ca.skuSeparator, CATALOG_DEFAULTS.skuSeparator),
      skuCasing: pick(SKU_CASINGS, ca.skuCasing, CATALOG_DEFAULTS.skuCasing),
      strictEan: bool(ca.strictEan, CATALOG_DEFAULTS.strictEan),
      gates: { hsnCode: bool(ga.hsnCode, CATALOG_DEFAULTS.gates.hsnCode), countryOfOrigin: bool(ga.countryOfOrigin, false), gstRateSlab: bool(ga.gstRateSlab, false) },
      syncSovereignty: pick(SYNC_SOVEREIGNTY, ca.syncSovereignty, CATALOG_DEFAULTS.syncSovereignty),
    },
    inventory: {
      mode: iv.mode === 'warehouse' ? 'warehouse' : 'simple',
      startingMethod: (['manual', 'marketplace', 'file'] as const).find((m) => m === iv.startingMethod) ?? null,
      defaultLeadTimeDays: num(iv.defaultLeadTimeDays, INVENTORY_DEFAULTS.defaultLeadTimeDays),
      minSafetyStockUnits: num(iv.minSafetyStockUnits, INVENTORY_DEFAULTS.minSafetyStockUnits),
      spikeProtectionUnitsPerHour: num(iv.spikeProtectionUnitsPerHour, INVENTORY_DEFAULTS.spikeProtectionUnitsPerHour),
      negativeStockTwoStepApproval: bool(iv.negativeStockTwoStepApproval, INVENTORY_DEFAULTS.negativeStockTwoStepApproval),
    },
    pricing: {
      marginFloorBps: numOrNull(pr.marginFloorBps, PRICING_DEFAULTS.marginFloorBps),
      maxVelocityShiftBps: num(pr.maxVelocityShiftBps, PRICING_DEFAULTS.maxVelocityShiftBps),
      // one setting seen two ways: the older switch "round to 9" and the three-way ending
      priceEnding: pick(PRICE_ENDINGS, pr.priceEnding, roundNine ? 'nine' : 'exact'),
      legalMetrologyMrpGate: bool(pr.legalMetrologyMrpGate, PRICING_DEFAULTS.legalMetrologyMrpGate),
      withholdBufferBps: num(pr.withholdBufferBps, PRICING_DEFAULTS.withholdBufferBps),
      autoDelistOnBreach: bool(pr.autoDelistOnBreach, false),
      mandate2faBulkMarkdown: bool(pr.mandate2faBulkMarkdown, false),
      channelTiers: Object.fromEntries(Object.entries(tiers).map(([id, t]) => {
        const o = obj(t);
        return [id, {
          baseMarkupBps: num(o.baseMarkupBps, TIER_DEFAULTS.baseMarkupBps), fixedFeeBufferMinor: num(o.fixedFeeBufferMinor, 0), hardFloorMinor: numOrNull(o.hardFloorMinor, null),
          maxDiscountBps: num(o.maxDiscountBps, TIER_DEFAULTS.maxDiscountBps), repriceIntervalMinutes: num(o.repriceIntervalMinutes, TIER_DEFAULTS.repriceIntervalMinutes),
          minNetMarginBps: numOrNull(o.minNetMarginBps, null), autoDelistOnBreach: bool(o.autoDelistOnBreach, false), dealFloorMinor: numOrNull(o.dealFloorMinor, null),
          mandate2faForMarkdown: bool(o.mandate2faForMarkdown, false), status: pick(TIER_STATUSES, o.status, 'active'),
        } satisfies ChannelTier];
      })),
    },
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
