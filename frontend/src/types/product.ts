import { z } from "zod";

export type ProductStatus = "active" | "draft" | "incomplete" | "archived";

export interface ChannelListingStatus {
  channelId: string;
  channelName: "Amazon" | "Flipkart" | "Shopify" | "Meesho" | "Snapdeal" | "QuickCommerce";
  status: "live" | "syncing" | "failed" | "not_listed" | "blocked";
  marketplaceSku?: string;
  price?: number;
  stock?: number;
  lastSyncedAt?: string;
  errors?: string[];
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  barcode?: string;
  title: string;
  options: Record<string, string>; // e.g. { Size: "L", Color: "Black" }
  price: number;
  mrp: number;
  costPrice?: number;
  inventory: number;
  weightGrams?: number;
  status: "active" | "draft" | "archived";
}

export interface ProductMedia {
  id: string;
  url: string;
  isPrimary: boolean;
  altText?: string;
}

export interface ProductAuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export interface Product {
  id: string;
  sku: string;
  title: string;
  brand: string;
  category: string;
  description: string;
  bullets: string[];
  status: ProductStatus;
  price: number;
  mrp: number;
  costPrice: number;
  taxRatePercent: number;
  hsnCode: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
  coverDays: number;
  readinessScore: number; // 0 to 100
  blockers: string[];
  media: ProductMedia[];
  variants: ProductVariant[];
  channels: ChannelListingStatus[];
  attributes: Record<string, string>;
  activity: ProductAuditLog[];
  createdAt: string;
  updatedAt: string;
}

export const createProductSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  sku: z.string().min(2, "Master SKU is required").regex(/^[A-Z0-9_-]+$/, "SKU must contain only uppercase letters, numbers, hyphens or underscores"),
  brand: z.string().min(1, "Brand is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  bullets: z.array(z.string()).default([]),
  price: z.number().min(0, "Selling price must be non-negative"),
  mrp: z.number().min(0, "MRP must be non-negative"),
  costPrice: z.number().min(0, "Cost price must be non-negative").default(0),
  hsnCode: z.string().min(4, "Valid 4-8 digit HSN code is required"),
  taxRatePercent: z.number().default(18),
  stock: z.number().int().min(0, "Stock must be a positive integer").default(0),
  attributes: z.record(z.string()).default({}),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

// ---------------------------------------------------------------------------------------------------------
// Products list (GET /products/catalog, /products/stats, /products/bulk-actions, /views, /products/export)
// ---------------------------------------------------------------------------------------------------------

export type CatalogProductStatus = "draft" | "active" | "archived";
export type CatalogProductType = "physical" | "digital" | "service";
export type CatalogInventoryStatus = "healthy" | "low" | "out";
export type CatalogListingStatus = "active" | "attention" | "pending" | "draft" | "unpublished";
export type CatalogPrimaryActionKey = "open" | "review_inventory" | "update_inventory" | "continue_editing";

export interface CatalogChannel {
  code: string;
  name: string;
  listingStatus: CatalogListingStatus;
}

export interface CatalogSummary {
  /** `/api/v1/documents/{id}/content`: bearer protected, load it through the API client */
  thumbnailUrl: string | null;
  skuFamily: string;
  variantCount: number;
  availableUnits: number;
  inventoryStatus: CatalogInventoryStatus;
  channels: CatalogChannel[];
  publishReadinessPct: number;
  hint: { key: string; text: string };
  primaryAction: { key: CatalogPrimaryActionKey; href: string };
}

/** one card of the Products list: the product core (only the fields the screen reads) plus the summary block */
export interface CatalogProduct {
  id: string;
  productCode: string;
  title: string;
  categoryId: string | null;
  productType: CatalogProductType;
  status: CatalogProductStatus;
  variantCount: number;
  version: number;
  updatedAt: string;
  summary: CatalogSummary;
}

export interface CatalogPage {
  items: CatalogProduct[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface CatalogStats {
  products: number;
  variants: number;
  activeProducts: number;
  activeVariants: number;
  draft: number;
  archived: number;
  needsAttention: number;
  tabs: { all: number; active: number; draft: number; archived: number; needsAttention: number };
}

/** the filters the catalog endpoints share (stats takes everything except status / needsAttention) */
export interface CatalogFilters {
  q?: string;
  status?: CatalogProductStatus;
  categoryId?: string;
  channel?: string;
  inventory?: CatalogInventoryStatus;
  productType?: CatalogProductType;
  needsAttention?: boolean;
}

export interface CatalogQuery extends CatalogFilters {
  page?: number;
  pageSize?: number;
  /** `updatedAt` (default, newest first), `title`, `sku`, `inventory`; a leading `-` flips the direction */
  sort?: string;
}

export type BulkProductAction = "archive" | "unarchive" | "duplicate" | "check_publish_readiness";

export interface BulkCheck {
  code: string;
  message: string;
}

export interface BulkResult {
  index: number;
  id: string | null;
  ok: boolean;
  error: BulkCheck | null;
  productId: string;
  status?: string;
  newProductId?: string;
  newProductCode?: string;
  canPublish?: boolean;
  missing?: BulkCheck[];
  warnings?: BulkCheck[];
}

export interface BulkResponse {
  action: BulkProductAction;
  summary: { total: number; succeeded: number; failed: number; canPublish?: number };
  results: BulkResult[];
}

export interface SavedView {
  id: string;
  screen: "products" | "inventory" | "orders" | "returns";
  name: string;
  filters: Record<string, unknown>;
  sort: string | null;
  shared: boolean;
  createdBy: string;
  mine: boolean;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CategoryNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  children: CategoryNode[];
}

/** a data job (the asynchronous CSV export) */
export interface DataJob {
  id: string;
  kind: "import" | "export";
  entity: string;
  status: string;
  format: string;
  hasOutput: boolean;
  errors: Array<{ row: number; message: string }>;
}
