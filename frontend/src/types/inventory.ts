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
  /** saved group id */
  group?: string;
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

export type MovementType = "order_deduction" | "order_release" | "inward" | "transfer" | "manual_adjustment" | "damage" | "return" | "quarantine" | "shrinkage";

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

export type TransferStatus = "draft" | "in_transit" | "received" | "cancelled";

export interface TransferLine {
  variantId: string;
  sku: string;
  title: string;
  quantity: number;
  receivedQuantity: number;
  /** drafts only: what the source warehouse can give today (nothing has moved yet) */
  availableAtSource: number | null;
}

/** a stock transfer document (GET /inventory/transfers): a draft moves nothing until it is submitted */
export interface StockTransfer {
  id: string;
  number: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: TransferStatus;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  shippedAt: string | null;
  receivedAt: string | null;
  items: TransferLine[];
}

export interface TransferDraftBody {
  fromWarehouseId: string;
  toWarehouseId: string;
  items: Array<{ variantId: string; quantity: number }>;
  notes?: string;
}

export interface TransferDraftPatch {
  fromWarehouseId?: string;
  toWarehouseId?: string;
  items?: Array<{ variantId: string; quantity: number }>;
  notes?: string | null;
  version?: number;
}

/** a saved filter of the Inventory screen: the whole filter state and the sort (GET/POST /views, screen "inventory") */
export interface InventoryPreset {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  sort: string | null;
  shared: boolean;
  mine: boolean;
  canEdit: boolean;
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

/** the filters as a JSON body (`/inventory/bulk` selection, selection-count): plain keys, empty values left out */
export function filterBody(f: InventoryFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(f)) if (value !== undefined && value !== "") out[key] = value as string | number;
  return out;
}

// ---- overview (GET /inventory/overview): stock pulse, horizon, signals, advisory, distribution, recent movements

export interface OverviewFeedItem {
  at: string;
  type: string;
  text: string;
  detail: string | null;
  ref: { type: string; id: string } | null;
}

export interface HorizonItem {
  variantId: string;
  productId: string;
  title: string;
  sku: string;
  thumbnailUrl: string | null;
  stock: number;
  unitsPerDay: number;
  coverDays: number | null;
  leadTimeDays: number;
  leadTimeSource: "variant" | "default";
  health: StockHealth;
  action: { key: string; label: string; href: string };
}

export interface SignalRow {
  key: InventorySignal;
  count: number;
  /** 7 daily points ending on asOf; null when the history cannot be derived */
  trend: number[] | null;
  tone: Tone;
  href: string;
}

export interface InventoryOverview {
  asOf: string;
  live: boolean;
  mode: "simple" | "warehouse";
  pulse: { available: number; reserved: number; incoming: number; returned: number; damaged: number; quarantined: number; flow: { incomingToday: number } };
  horizon: { leadTimeBasis: "variant" | "default"; defaultLeadTimeDays: number; windowDays: number; scaleMaxDays: number; items: HorizonItem[] };
  signals: SignalRow[];
  advisory: {
    title: string;
    text: string;
    recommendationOnly: true;
    recommendationId: string | null;
    items: Array<{ variantId: string; title: string; sku: string; units: number; coverDays: number; leadTimeDays: number }>;
  };
  distribution?: {
    byWarehouse: Array<{ warehouseId: string; name: string; units: number; sharePct: number; demandSharePct: number | null }>;
    insight: { text: string; warehouseId: string; advisoryOnly: true } | null;
  };
  location?: { id: string | null; name: string };
  recentMovements: OverviewFeedItem[];
  /** 0 = show the "Your inventory starts here" state */
  ledger: { total: number };
}

// ---- channel synchronisation state (GET /inventory/channel-sync)

export type ChannelState = "healthy" | "syncing" | "attention" | "failed" | "not_connected";

export interface ChannelSyncState {
  master: { available: number; lastUpdateAt: string | null };
  channels: Array<{
    channel: ChannelRef;
    accountName: string;
    state: ChannelState;
    lastSyncAt: string | null;
    lastSyncLabel: "reported" | "not_reported";
    sentUnits: number;
    listings: number;
    affectedSkus: number;
    affectedProducts: number;
  }>;
  incidents: Array<{
    id: string;
    channel: ChannelRef;
    title: string;
    reason: string;
    affected: { skus: number; variants: number; products: number };
    lastFailedAt: string | null;
    actions: Array<PanelAction & { body: Record<string, unknown> | null }>;
  }>;
  operations: {
    syncing: { channels: number; skus: number; progress: { done: number; total: number } | null };
    lastSuccessAt: string | null;
    requireReview: { skus: number; channels: number };
    failed: { channels: number };
  };
}

export interface AffectedListing {
  variantId: string;
  listingId: string;
  sku: string;
  title: string;
  masterAvailable: number;
  channelQuantity: number | null;
  requestedQuantity: number | null;
  lastError: { code: string | null; message: string | null } | null;
  lastTriedAt: string | null;
}

export interface AffectedPage {
  items: AffectedListing[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

// ---- adjustments by type (POST /inventory/adjustments[/preview])

export type AdjustmentType = "damage" | "return" | "correction" | "manual" | "shrinkage" | "other";
export type AdjustDirection = "increase" | "decrease";

export interface AdjustmentBody {
  variantId: string;
  warehouseId: string;
  type: AdjustmentType;
  quantity?: number;
  direction?: AdjustDirection;
  setOnHand?: number;
  disposition?: "hold" | "restock";
  reason: string;
  note?: string;
  idempotencyKey?: string;
}

export interface AdjustmentPreview {
  currentAvailable: number;
  adjustment: number;
  newAvailable: number;
  warnings: Array<{ code: string; message: string }>;
  buckets: { onHand: number; reserved: number; incoming: number; returned: number; damaged: number; quarantined: number };
}

export interface AdjustmentResult {
  duplicate: boolean;
  movement: { id: number };
  type: AdjustmentType;
  result: { currentAvailable: number; adjustment: number; newAvailable: number; warnings: Array<{ code: string; message: string }> };
  stock: { warehouseId: string; onHand: number; reserved: number; available: number; incoming: number; damaged: number; returned: number; quarantined: number };
}

// ---- bulk actions + saved groups

export interface InventoryGroup {
  id: string;
  name: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export type BulkSelection = { mode: "ids"; ids: string[] } | { mode: "all_matching"; filters: Record<string, unknown> };
export type BulkAction = "adjust" | "transfer" | "export" | "sync" | "group";

export interface BulkParams {
  type?: AdjustmentType;
  quantity?: number;
  direction?: AdjustDirection;
  reason?: string;
  note?: string;
  setOnHand?: number;
  disposition?: "hold" | "restock";
  warehouseId?: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  notes?: string;
  groupId?: string;
  groupName?: string;
}

export interface BulkBody {
  selection: BulkSelection;
  action: BulkAction;
  params: BulkParams;
}

export interface BulkResult {
  action: string;
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ variantId: string; sku: string | null; ok: boolean; error?: { code: string; message: string } }>;
  transfer?: { id: string; number: string; status: string; items: number };
  group?: InventoryGroup;
  export?: { filename: string; contentType: string; rows: number; csv: string };
  jobs?: Array<{ accountId: string; jobId: string | null; status: "queued" | "already_queued" | "failed"; error: { code: string; message: string } | null }>;
}
