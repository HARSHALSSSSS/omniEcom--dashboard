/** The Inventory screen's contract (backend: GET /inventory/kpis, /ledger, /variants/{id}/panel, /movements/feed ...). */

export type StockStatus = "healthy" | "low_stock" | "out_of_stock" | "excess";
export type StockHealth = "stockout" | "critical" | "attention" | "healthy";
export type HealthFilter = StockHealth | "stockout_risk";
export type InventorySignal = "low_stock" | "stockout_risk" | "inventory_mismatch" | "slow_moving" | "high_velocity" | "aging_inventory" | "warehouse_imbalance";
export type MovementFilter = "received" | "adjusted" | "reserved" | "returned" | "synced";
export type RowChannelSync = "healthy" | "attention" | "failed" | "not_listed";
export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

export interface ChannelRef {
  code: string;
  name: string;
  accountId: string | null;
  availability: "live" | "coming_soon";
}

// ---- KPI tiles + reorder banner

export type SyncFreshness = "fresh" | "stale" | "failed" | "never_synced" | "not_connected";

export interface InventoryKpis {
  asOf: string;
  mode: "simple" | "warehouse";
  warehouseId: string | null;
  totals: { skus: number; unitsAvailable: number; unitsOnHand: number; unitsReserved: number; unitsIncoming: number; untrackedSkus: number };
  /** a partition of the SKUs: the four numbers add up to totals.skus */
  health: { healthy: number; lowStock: number; outOfStock: number; excess: number };
  stockoutRiskCount: number;
  /** minor units (paise), at cost; SKUs without a cost price are not counted in it */
  valuation: { amountMinor: number; currency: string; basis: string; skusCosted: number; skusWithoutCost: number };
  channelSync: {
    state: SyncFreshness;
    lastSuccessAt: string | null;
    minutesSinceLastSuccess: number | null;
    label: string;
    connectedChannels: number;
    syncingChannels: number;
    failedChannels: number;
    skusNeedingReview: number;
  };
  reorder: {
    show: boolean;
    recommendationOnly: boolean;
    title: string;
    text: string;
    lowStockCount: number;
    stockoutRiskCount: number;
    href: string;
    items: Array<{ sku: string; title: string; available: number; coverDays: number; leadTimeDays: number }>;
  };
}

// ---- ledger

export interface LedgerWarehouse {
  warehouseId: string;
  warehouseName: string;
  city: string | null;
  onHand: number;
  reserved: number;
  available: number;
  /** the reorder level of this location (null = none set) */
  safetyStock: number | null;
}

export interface LedgerRow {
  variantId: string;
  productId: string;
  thumbnailUrl: string | null;
  title: string;
  sku: string;
  barcode: string | null;
  available: number;
  reserved: number;
  incoming: number;
  returned: number;
  damaged: number;
  quarantined: number;
  onHand: number;
  unitsPerDay: number;
  /** null = no sales data to divide by */
  coverDays: number | null;
  leadTimeDays: number;
  warehouse: { id: string; name: string } | null;
  channelSync: RowChannelSync;
  health: StockHealth;
  lastMovementAt: string | null;
  borderTone: Tone;
  stockStatus: StockStatus;
  category: { id: string; name: string } | null;
  warehouses: LedgerWarehouse[];
}

export interface LedgerPage {
  items: LedgerRow[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface InventoryFilters {
  q?: string;
  stockStatus?: StockStatus;
  warehouse?: string;
  channel?: string;
  health?: HealthFilter;
  signal?: InventorySignal;
  movement?: MovementFilter;
  stockMin?: number;
  stockMax?: number;
}

export interface LedgerQuery extends InventoryFilters {
  page?: number;
  pageSize?: number;
  sort?: string;
}

// ---- channel allocations (per variant, listings module)

export interface VariantAllocation {
  variantId: string;
  available: number;
  /** stock held back from every channel (null = the variant is listed nowhere) */
  buffer: number | null;
  channels: Array<{
    channel: { code: string; name: string; accountId: string; accountName: string };
    listingId: string;
    allocated: number;
    pushed: number;
    dirty: boolean;
    mode: "sync" | "paused";
    allocationPercent: number;
    safetyBuffer: number;
    maxQuantity: number | null;
  }>;
}

// ---- side drawer

export interface PanelAction {
  key: string;
  label: string;
  method: string;
  href: string;
  enabled: boolean;
  disabledReason: string | null;
}

export interface Buckets {
  available: number;
  reserved: number;
  incoming: number;
  onHand: number;
  returned: number;
  damaged: number;
  quarantined: number;
}

export interface VariantPanel {
  product: { productId: string; variantId: string; title: string; sku: string; thumbnailUrl: string | null };
  snapshot: Buckets;
  byLocation: Array<Buckets & { warehouseId: string; name: string; code: string }>;
  channelAvailability: Array<{
    channel: ChannelRef;
    listingId: string;
    quantity: number | null;
    status: "healthy" | "syncing" | "failed";
    lastError: string | null;
    lastTriedAt: string | null;
  }>;
  health: { state: StockHealth; tone: Tone; text: string };
  metrics: { unitsPerDay: number; coverDays: number | null; leadTimeDays: number; windowDays: number; lowStockThreshold: number | null };
  recentMovements: Array<{ at: string; type: string; text: string; detail: string | null; ref: { type: string; id: string } | null }>;
  actions: PanelAction[];
}

/** GET /inventory/variants/{id}: the per-warehouse rows carry the reorder level the panel lacks */
export interface VariantStock {
  variantId: string;
  sku: string;
  warehouses: Array<{ warehouseId: string; reorderLevel: number | null; version: number }>;
}

// ---- movements feed

export type MovementType = "order_deduction" | "order_release" | "inward" | "transfer" | "manual_adjustment" | "damage" | "return" | "quarantine";

export interface FeedMovement {
  id: number;
  at: string;
  variantId: string;
  sku: string;
  productTitle: string;
  warehouse: { id: string; name: string };
  type: MovementType;
  typeLabel: string;
  quantityDelta: number;
  resultingAvailable: number;
  resultingOnHand: number;
  reference: { type: string; id: string | null; label: string | null } | null;
  reason: string | null;
  operator: { type: "user" | "api_key" | "system" | "webhook"; id: string | null; name: string };
}

export interface FeedPage {
  items: FeedMovement[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FeedQuery {
  type?: MovementType;
  warehouseId?: string;
}

// ---- writes

export type AdjustReason = "audit_correction" | "damaged" | "shrinkage" | "manual_addition";

export interface QuickAdjustBody {
  variantId: string;
  warehouseId: string;
  reason: AdjustReason;
  quantityDelta: number;
  notes?: string;
  idempotencyKey: string;
}

export interface QuickAdjustResult {
  duplicate: boolean;
  variant: { id: string; sku: string; title: string };
  warehouse: { id: string; name: string };
  result: { currentAvailable: number; adjustment: number; newAvailable: number };
}

export interface TransferBody {
  variantId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
}

export interface TransferResult {
  transfer: { id: string; number: string; status: string };
  variant: { id: string; sku: string; title: string };
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  city: string | null;
  isDefault: boolean;
}

// ---- channel sync

export interface SyncStartResult {
  requested: number;
  queued: number;
  results: Array<{
    accountId: string;
    channel: ChannelRef;
    jobId: string | null;
    status: "queued" | "already_queued" | "failed";
    error: { code: string; message: string } | null;
  }>;
}

export type SyncJobStatus = "queued" | "running" | "retrying" | "succeeded" | "partially_failed" | "failed" | "dead_lettered" | "cancelled";

export interface SyncJob {
  id: string;
  status: SyncJobStatus;
  marketplaceAccountId: string | null;
  progress: { total: number; done: number; failed: number } | null;
  error: { code?: string; message?: string } | null;
  failureDetails: Array<{ ref: string; code?: string; message: string }>;
}

export const SYNC_JOB_DONE: ReadonlyArray<SyncJobStatus> = ["succeeded", "partially_failed", "failed", "dead_lettered", "cancelled"];
