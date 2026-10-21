/** Variants & SKU workspace: DTOs of the catalog variant endpoints (money is always integer minor units / paise). */

export type VariantStockStatus = "healthy" | "low" | "out";
export type VariantLifecycle = "active" | "draft" | "archived";
export type VariantRecordStatus = "active" | "inactive";
export type ListingStatus = "active" | "attention" | "pending" | "draft" | "unpublished";

export interface VariantGridChannel {
  code: string;
  name: string;
  listingStatus: ListingStatus;
}

/** one row of GET /products/{id}/variant-grid */
export interface VariantGridItem {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  name: string;
  optionValues: Record<string, string>;
  currency: string;
  mrpMinor: number | null;
  sellingPriceMinor: number | null;
  status: VariantRecordStatus;
  lifecycle: VariantLifecycle;
  stock: { available: number; threshold: number; status: VariantStockStatus };
  channels: VariantGridChannel[];
  leadTimeDays: number | null;
  thumbnailUrl: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface VariantGridPage {
  items: VariantGridItem[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

/** GET /products/{id}/variant-grid/counts */
export interface VariantCounts {
  all: number;
  active: number;
  lowStock: number;
  outOfStock: number;
  draft: number;
  archived: number;
}

export type VariantTab = "all" | "active" | "low_stock" | "out_of_stock" | "draft" | "archived";
export type VariantSort = "sku" | "inventory" | "updatedAt" | "createdAt";

/** what the screen asks the grid for (the URL carries the same values) */
export interface VariantGridParams {
  tab: VariantTab;
  q: string;
  /** option name (as the product stores it) -> chosen value */
  options: Record<string, string>;
  channel: string;
  inventory: "" | VariantStockStatus;
  /** "sku", "-sku", "inventory", ... (a leading "-" is descending) */
  sort: string;
  page: number;
  pageSize: number;
}

/** the slice of GET /products/{id}/overview the screen header and the filter options need */
export interface VariantsProductHeader {
  id: string;
  title: string;
  productCode: string;
  status: "draft" | "active" | "archived";
  version: number;
  imageUrl: string | null;
  variantCount: number;
  sellableCount: number;
  availableUnits: number;
  lowStockVariants: number;
  connectedChannels: number;
  /** option name -> the values the product's variants use */
  options: Record<string, string[]>;
  /** channels the product is listed on (filter options) */
  channels: { code: string; name: string }[];
}

/** GET /variants/{id} */
export interface VariantDetail {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  optionValues: Record<string, string>;
  currency: string;
  mrpMinor: number | null;
  sellingPriceMinor: number | null;
  costPriceMinor: number | null;
  taxRateBps: number | null;
  weightGrams: number | null;
  dimensionsMm: { length: number; width: number; height: number } | null;
  status: VariantRecordStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** body of POST /products/{id}/variants and (partial, plus version) PATCH /variants/{id} */
export interface VariantWritePayload {
  sku?: string;
  barcode?: string | null;
  optionValues?: Record<string, string>;
  currency?: string;
  mrpMinor?: number | null;
  sellingPriceMinor?: number | null;
  costPriceMinor?: number | null;
  taxRateBps?: number | null;
  weightGrams?: number | null;
  dimensionsMm?: { length: number; width: number; height: number } | null;
  status?: VariantRecordStatus;
}

export type VariantBulkAction = "archive" | "activate" | "delete";

export interface VariantBulkResult {
  action: string;
  summary: { total: number; succeeded: number; failed: number };
  results: { index: number; id: string | null; ok: boolean; error: { code: string; message: string } | null }[];
}

export interface LeadTimeResult {
  variantId: string;
  productId: string;
  sku: string;
  leadTimeDays: number | null;
  version: number;
}

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
  isDefault: boolean;
}

export type StockReason = "audit_correction" | "damaged" | "shrinkage" | "manual_addition";

export interface QuickAdjustPayload {
  variantId: string;
  warehouseId?: string;
  reason: StockReason;
  quantityDelta: number;
  notes?: string;
  idempotencyKey?: string;
}

export interface QuickAdjustResult {
  duplicate: boolean;
  variant: { id: string; sku: string; title: string };
  warehouse: { id: string; name: string };
  result: { currentAvailable: number; adjustment: number; newAvailable: number };
}
