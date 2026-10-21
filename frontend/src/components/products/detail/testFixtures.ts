import type {
  ProductContent,
  ProductDocument,
  ProductInventory,
  ProductListings,
  ProductOverview,
  VariantGridRow,
} from "@/types/productDetail";

/** API-shaped payloads for the product detail tests (numbers differ from any design mock on purpose) */

export const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

const allActions = (over: Partial<Record<string, { enabled: boolean; disabledReason: string | null }>> = {}): ProductOverview["actions"] =>
  [
    ["edit_product", "Edit product", "PATCH", `/api/v1/products/${PRODUCT_ID}`],
    ["manage_variants", "Manage variants", "GET", `/api/v1/products/${PRODUCT_ID}/variant-grid`],
    ["update_inventory", "Update inventory", "POST", "/api/v1/inventory/receive"],
    ["manage_listings", "Manage listings", "GET", `/api/v1/products/${PRODUCT_ID}/listings`],
    ["publish_product", "Publish product", "POST", "/api/v1/listings"],
    ["duplicate", "Duplicate", "POST", `/api/v1/products/${PRODUCT_ID}/duplicate`],
    ["export", "Export product", "GET", "/api/v1/products/export?q=CARRY-77"],
  ].map(([key, label, method, href]) => ({
    key: key as string,
    label: label as string,
    method: method as string,
    href: href as string,
    enabled: over[key as string]?.enabled ?? true,
    disabledReason: over[key as string]?.disabledReason ?? null,
  }));

export const activeOverview = (over: Partial<ProductOverview> = {}): ProductOverview => ({
  product: {
    id: PRODUCT_ID,
    productCode: "CARRY-77",
    title: "Weekender Duffel",
    description: "Water resistant duffel for two day trips.",
    brand: "Northbound",
    productType: "physical",
    status: "active",
    variantCount: 5,
    version: 3,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    category: { id: "c1", name: "Bags & Luggage" },
    skuFamily: "CARRY-77",
  },
  primaryImage: { id: "d1", url: "https://cdn.example.test/p1.jpg" },
  health: { state: "ready", missing: [], text: "Product information is complete." },
  inventory: {
    available: 87,
    reserved: 9,
    incoming: 25,
    lowStockVariants: 1,
    status: "low",
    byWarehouse: [{ warehouseId: "w1", warehouse: "Pune Hub", available: 87 }],
  },
  variants: {
    count: 5,
    sellable: 5,
    options: { Color: ["Olive", "Sand"], Size: ["M", "L"] },
    items: [
      { variantId: "v1", name: "Olive / M", sku: "CARRY-77-OL-M", optionValues: { Color: "Olive", Size: "M" }, available: 40, stockStatus: "healthy", status: "active" },
      { variantId: "v2", name: "Olive / L", sku: "CARRY-77-OL-L", optionValues: { Color: "Olive", Size: "L" }, available: 22, stockStatus: "healthy", status: "active" },
      { variantId: "v3", name: "Sand / M", sku: "CARRY-77-SA-M", optionValues: { Color: "Sand", Size: "M" }, available: 21, stockStatus: "healthy", status: "active" },
      { variantId: "v4", name: "Sand / L", sku: "CARRY-77-SA-L", optionValues: { Color: "Sand", Size: "L" }, available: 4, stockStatus: "low", status: "active" },
    ],
  },
  channels: {
    connected: 2,
    active: 1,
    attention: 1,
    items: [
      { channel: { code: "amazon_in", name: "Amazon", accountId: "a1" }, listingStatus: "active", lastSyncAt: new Date(Date.now() - 18 * 60_000).toISOString(), action: { key: "view_listing", href: `/products/${PRODUCT_ID}?tab=listings` } },
      { channel: { code: "flipkart", name: "Flipkart", accountId: "a2" }, listingStatus: "attention", lastSyncAt: new Date(Date.now() - 3_600_000).toISOString(), action: { key: "review", href: `/products/${PRODUCT_ID}?tab=listings` } },
    ],
  },
  content: {
    pct: 73,
    marketplaceContent: "needs_review",
    fields: [
      { key: "title", state: "complete" },
      { key: "description", state: "complete" },
      { key: "images", state: "complete" },
      { key: "attributes", state: "missing" },
      { key: "marketplace_content", state: "needs_review" },
    ],
  },
  attentionBanner: { key: "listing_attention", text: "Flipkart listing requires review", action: { key: "review_listing", href: `/products/${PRODUCT_ID}?tab=listings` } },
  statusPanel: {
    catalog: "ready",
    inventory: "low",
    listings: { state: "published", active: 1, attention: 1 },
    content: { pct: 73, state: "needs_review" },
    syncLastAt: new Date(Date.now() - 18 * 60_000).toISOString(),
  },
  media: { total: 2, items: [{ id: "d1", fileName: "front.jpg", isPrimary: true, url: "https://cdn.example.test/p1.jpg" }, { id: "d2", fileName: "side.jpg", isPrimary: false, url: "https://cdn.example.test/p2.jpg" }] },
  recentActivity: [
    { at: new Date(Date.now() - 2 * 3_600_000).toISOString(), type: "inventory", event: "stock_received", params: {}, text: "Received 25 units of CARRY-77-OL-M", actor: { type: "user", id: "u1", name: "Asha" } },
    { at: new Date(Date.now() - 26 * 3_600_000).toISOString(), type: "listings", event: "listing_failed", params: {}, text: "Flipkart listing sync failed", actor: null },
  ],
  actions: allActions(),
  ...over,
});

/** an unpublished, incomplete draft */
export const draftOverview = (): ProductOverview =>
  activeOverview({
    product: { ...activeOverview().product, status: "draft", title: "Draft Tote", productCode: "TOTE-1", skuFamily: "TOTE-1", variantCount: 0, category: null, brand: null, description: null },
    primaryImage: null,
    health: { state: "incomplete", missing: ["brand", "image"], text: "Add missing attributes to improve listing readiness." },
    inventory: { available: 0, reserved: 0, incoming: 0, lowStockVariants: 0, status: "out", byWarehouse: [] },
    variants: { count: 0, sellable: 0, options: {}, items: [] },
    channels: { connected: 0, active: 0, attention: 0, items: [] },
    content: { pct: 20, marketplaceContent: "not_published", fields: [{ key: "title", state: "complete" }, { key: "marketplace_content", state: "not_published" }] },
    attentionBanner: { key: "product_incomplete", text: "Product information incomplete", action: { key: "complete_product", href: `/products/${PRODUCT_ID}/edit` } },
    statusPanel: { catalog: "incomplete", inventory: "out", listings: { state: "not_published", active: 0, attention: 0 }, content: { pct: 20, state: "not_published" }, syncLastAt: null },
    media: { total: 0, items: [] },
    recentActivity: [],
    actions: allActions({ publish_product: { enabled: false, disabledReason: "readiness_incomplete" }, update_inventory: { enabled: false, disabledReason: "no_active_variant" } }),
  });

export const archivedOverview = (): ProductOverview =>
  activeOverview({
    product: { ...activeOverview().product, status: "archived" },
    actions: allActions({ edit_product: { enabled: false, disabledReason: "archived" }, publish_product: { enabled: false, disabledReason: "archived" } }),
  });

export const inventoryTab = (over: Partial<ProductInventory> = {}): ProductInventory => ({
  productId: PRODUCT_ID,
  totals: { available: 87, reserved: 9, incoming: 25, lowStockVariants: 1 },
  health: { status: "low", variants: 4, lowStockThreshold: 10 },
  byVariant: [
    { variantId: "v1", name: "Olive / M", sku: "CARRY-77-OL-M", available: 40, reserved: 3, incoming: 25, threshold: 10, status: "healthy" },
    { variantId: "v4", name: "Sand / L", sku: "CARRY-77-SA-L", available: 4, reserved: 1, incoming: 0, threshold: 10, status: "low" },
  ],
  byWarehouse: [{ warehouseId: "w1", code: "PNQ", name: "Pune Hub", available: 87, onHand: 96, reserved: 9, incoming: 25 }],
  lowStock: { count: 1, variants: [{ variantId: "v4", name: "Sand / L", sku: "CARRY-77-SA-L", available: 4, status: "low" }] },
  ...over,
});

export const listingsTab = (over: Partial<ProductListings> = {}): ProductListings => ({
  productId: PRODUCT_ID,
  summary: { connected: 2, active: 1, attention: 1, lastSyncAt: new Date(Date.now() - 18 * 60_000).toISOString() },
  channels: [
    { channel: { code: "amazon_in", name: "Amazon", accountId: "a1" }, listingStatus: "active", listings: 2, lastSyncAt: new Date(Date.now() - 18 * 60_000).toISOString(), error: null },
    { channel: { code: "flipkart", name: "Flipkart", accountId: "a2" }, listingStatus: "attention", listings: 1, lastSyncAt: new Date(Date.now() - 3_600_000).toISOString(), error: "Image rejected by the marketplace" },
  ],
  items: [
    { channel: { code: "amazon_in", name: "Amazon", accountId: "a1" }, listingId: "l1", variantId: "v1", sku: "CARRY-77-OL-M", status: "active", rawStatus: "live", lastSyncAt: null, error: null },
    { channel: { code: "flipkart", name: "Flipkart", accountId: "a2" }, listingId: "l3", variantId: "v1", sku: "CARRY-77-OL-M", status: "attention", rawStatus: "rejected", lastSyncAt: null, error: "Image rejected by the marketplace" },
  ],
  publicationModel: "master>listing>marketplace",
  ...over,
});

export const contentTab = (over: Partial<ProductContent> = {}): ProductContent => ({
  productId: PRODUCT_ID,
  readiness: {
    pct: 73,
    ready: false,
    errors: 1,
    warnings: 0,
    fields: [
      { key: "title", state: "complete" },
      { key: "description", state: "complete" },
      { key: "images", state: "complete" },
      { key: "attributes", state: "missing" },
      { key: "marketplace_content", state: "needs_review" },
    ],
  },
  masterAttributes: [
    { attribute: "title", value: "Weekender Duffel", state: "complete" },
    { attribute: "category", value: "c1", state: "complete" },
    { attribute: "gst_rate_bps", value: 1200, state: "complete" },
    { attribute: "hsn_code", value: null, state: "missing" },
  ],
  marketplaceContent: [
    { channel: { code: "flipkart", name: "Flipkart" }, hasMasterData: true, state: "needs_review", issues: [{ code: "img", message: "Main image too small", severity: "error" }] },
    { channel: { code: "amazon_in", name: "Amazon" }, hasMasterData: true, state: "ok", issues: [] },
  ],
  ...over,
});

export const variantRow = (n: number, over: Partial<VariantGridRow> = {}): VariantGridRow => ({
  id: `vg${n}`,
  productId: PRODUCT_ID,
  sku: `CARRY-77-${n}`,
  name: `Variant ${n}`,
  optionValues: { Color: n % 2 ? "Olive" : "Sand", Size: "M" },
  status: "active",
  lifecycle: "active",
  stock: { available: 10 + n, threshold: 5, status: "healthy" },
  channels: [],
  ...over,
});

export const imageDoc = (n: number, over: Partial<ProductDocument> = {}): ProductDocument => ({
  id: `doc${n}`,
  productId: PRODUCT_ID,
  kind: "image",
  purpose: "product_image",
  fileName: `photo-${n}.jpg`,
  mimeType: "image/jpeg",
  sizeBytes: 1000,
  sortOrder: n - 1,
  isPrimary: n === 1,
  isPlaceholder: false,
  width: 1200,
  height: 1200,
  warnings: [],
  status: "uploaded",
  downloadUrl: `https://cdn.example.test/photo-${n}.jpg`,
  createdAt: "2026-09-01T10:00:00.000Z",
  ...over,
});
