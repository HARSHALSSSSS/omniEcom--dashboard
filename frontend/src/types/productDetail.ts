/** Product detail screen (/products/:id): the shapes of GET /products/{id}/overview and its tab endpoints. */

export type InventoryStatus = "healthy" | "low" | "out";
export type ChannelListingStatus = "active" | "attention" | "pending" | "draft" | "unpublished";
export type ContentState = "ok" | "needs_review" | "not_published";
export type FieldState = "complete" | "missing" | "needs_review" | ContentState;
export type ActivityType = "inventory" | "content" | "listings" | "variants";
export type ActivityScope = "all" | "master" | "variants" | "channels";
export type ProductStatus = "draft" | "active" | "archived";

export const PRODUCT_TABS = ["overview", "variants", "inventory", "listings", "content", "activity", "media"] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

export interface ChannelRef {
  code: string;
  name: string;
  accountId?: string | null;
}

export interface ProductAction {
  key: string;
  label: string;
  method: string;
  href: string;
  enabled: boolean;
  disabledReason: string | null;
}

export interface ActivityActor {
  type: string;
  id: string | null;
  name: string | null;
}

export interface ActivityItem {
  at: string;
  type: ActivityType;
  event: string;
  params: Record<string, string | number | boolean | null>;
  text: string;
  actor: ActivityActor | null;
}

export interface FieldRow {
  key: string;
  state: FieldState;
}

export interface OverviewProduct {
  id: string;
  productCode: string;
  title: string;
  description: string | null;
  brand: string | null;
  productType: "physical" | "digital" | "service";
  status: ProductStatus;
  variantCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string } | null;
  skuFamily: string;
}

export interface OverviewVariantItem {
  variantId: string;
  name: string;
  sku: string;
  optionValues: Record<string, string>;
  available: number;
  stockStatus: InventoryStatus;
  status: "active" | "inactive";
}

export interface OverviewChannelItem {
  channel: ChannelRef;
  listingStatus: ChannelListingStatus;
  lastSyncAt: string | null;
  action: { key: string; href: string };
}

export interface MediaItem {
  id: string;
  fileName: string;
  isPrimary: boolean;
  url: string;
}

export interface ProductOverview {
  product: OverviewProduct;
  primaryImage: { id: string; url: string } | null;
  health: { state: "ready" | "incomplete"; missing: string[]; text: string };
  inventory: {
    available: number;
    reserved: number;
    incoming: number;
    lowStockVariants: number;
    status: InventoryStatus;
    byWarehouse: Array<{ warehouseId: string; warehouse: string; available: number }>;
  };
  variants: {
    count: number;
    sellable: number;
    options: Record<string, string[]>;
    items: OverviewVariantItem[];
  };
  channels: { connected: number; active: number; attention: number; items: OverviewChannelItem[] };
  content: { pct: number; marketplaceContent: ContentState; fields: FieldRow[] };
  attentionBanner: { key: string; text: string; action: { key: string; href: string } } | null;
  statusPanel: {
    catalog: "ready" | "incomplete";
    inventory: InventoryStatus;
    listings: { state: "not_published" | "published"; active: number; attention: number };
    content: { pct: number; state: ContentState };
    syncLastAt: string | null;
  };
  media: { total: number; items: MediaItem[] };
  recentActivity: ActivityItem[];
  actions: ProductAction[];
}

export interface InventoryVariantRow {
  variantId: string;
  name: string;
  sku: string;
  available: number;
  reserved: number;
  incoming: number;
  threshold: number;
  status: InventoryStatus;
}

export interface ProductInventory {
  productId: string;
  totals: { available: number; reserved: number; incoming: number; lowStockVariants: number };
  health: { status: InventoryStatus; variants: number; lowStockThreshold: number };
  byVariant: InventoryVariantRow[];
  byWarehouse: Array<{
    warehouseId: string;
    code: string;
    name: string;
    available: number;
    onHand: number;
    reserved: number;
    incoming: number;
  }>;
  lowStock: {
    count: number;
    variants: Array<{ variantId: string; name: string; sku: string; available: number; status: "low" | "out" }>;
  } | null;
}

export interface ProductListings {
  productId: string;
  summary: { connected: number; active: number; attention: number; lastSyncAt: string | null };
  channels: Array<{
    channel: ChannelRef;
    listingStatus: ChannelListingStatus;
    listings: number;
    lastSyncAt: string | null;
    error: string | null;
  }>;
  items: Array<{
    channel: ChannelRef;
    listingId: string;
    variantId: string;
    sku: string;
    status: ChannelListingStatus;
    rawStatus: string;
    lastSyncAt: string | null;
    error: string | null;
  }>;
  publicationModel: "master>listing>marketplace";
}

export interface ProductContent {
  productId: string;
  readiness: { pct: number; ready: boolean; errors: number; warnings: number; fields: FieldRow[] };
  masterAttributes: Array<{
    attribute: string;
    value: string | number | boolean | null;
    state: "complete" | "missing" | "needs_review";
  }>;
  marketplaceContent: Array<{
    channel: { code: string; name: string };
    hasMasterData: boolean;
    state: ContentState;
    issues: Array<{ code: string; message: string; severity: string }>;
  }>;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

/** one row of GET /products/{id}/variant-grid */
export interface VariantGridRow {
  id: string;
  productId: string;
  sku: string;
  name: string;
  optionValues: Record<string, string>;
  status: "active" | "inactive";
  lifecycle: "active" | "draft" | "archived";
  stock: { available: number; threshold: number; status: InventoryStatus };
  channels: Array<{ code: string; name: string; listingStatus: ChannelListingStatus }>;
}

export interface VariantGridCounts {
  all: number;
  active: number;
  lowStock: number;
  outOfStock: number;
  draft: number;
  archived: number;
}

export interface ProductDocument {
  id: string;
  productId: string;
  kind: "image" | "document" | "video";
  purpose: "product_image" | "product_document" | "listing_document";
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  sortOrder: number;
  isPrimary: boolean;
  isPlaceholder: boolean;
  width: number | null;
  height: number | null;
  warnings: Array<"low_resolution">;
  status: "pending_upload" | "uploaded" | "processed" | "rejected";
  downloadUrl: string | null;
  createdAt: string;
}

export interface DocumentUploadInstruction {
  strategy: "presigned" | "api";
  method: string;
  url: string;
  headers: Record<string, string>;
}

export interface ProductBulkResult {
  action: string;
  summary: { total: number; succeeded: number; failed: number };
  results: Array<{
    index: number;
    id: string | null;
    ok: boolean;
    error: { code: string; message: string } | null;
    productId: string;
    status?: string;
  }>;
}

export interface MarketplaceAccountOption {
  id: string;
  marketplace: string;
  displayName: string;
  status: string;
  connectionStatus: string;
}

export interface CreatedListing {
  id: string;
  marketplaceAccountId: string;
  variantId: string;
  status: string;
}
