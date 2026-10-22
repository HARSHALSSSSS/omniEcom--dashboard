import type { ImportIssue, ImportOptions, ImportSession, ImportSummary, MappingView } from "@/types/import";

/** test data for the import screens */
export const IMPORT_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_ID = "22222222-2222-4222-8222-222222222222";
export const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
export const WAREHOUSE_ID = "44444444-4444-4444-8444-444444444444";
export const CATEGORY_ID = "55555555-5555-4555-8555-555555555555";

export function session(over: Partial<ImportSession> = {}): ImportSession {
  return {
    id: IMPORT_ID,
    source: "csv",
    fileName: "festive.csv",
    fileSizeBytes: 2048,
    status: "analyzed",
    uiStatus: "mapping",
    headers: ["SKU_CODE", "PRODUCT_NAME", "PRICE"],
    settings: { duplicateStrategy: "skip", assignAllChannels: false, accountIds: [], autoPublish: false, warehouseId: null, defaultCategoryId: null, currencyUnit: "rupees" },
    counters: { total: 120, processed: 0, valid: 0, warning: 0, error: 0, ignored: 0, skipped: 0, committed: 0, failed: 0, percent: 0, etaSeconds: null },
    issues: { total: 0, open: 0, resolved: 0, ignored: 0, openErrors: 0, openWarnings: 0 },
    results: { productsCreated: 0, productsUpdated: 0, variantsCreated: 0, variantsUpdated: 0 },
    products: 0,
    plan: { create: 0, update: 0, addVariant: 0, skip: 0 },
    scope: { products: 0, newProducts: 0, updates: 0 },
    failureMessage: null,
    requestedBy: null,
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-01-02T10:00:00.000Z",
    updatedAt: "2026-01-02T10:05:00.000Z",
    version: 3,
    ...over,
  };
}

/** a validated import with open issues */
export const validated = (over: Partial<ImportSession> = {}): ImportSession =>
  session({
    status: "validated",
    uiStatus: "needs_attention",
    counters: { total: 120, processed: 120, valid: 100, warning: 8, error: 12, ignored: 0, skipped: 0, committed: 0, failed: 0, percent: 100, etaSeconds: null },
    issues: { total: 20, open: 18, resolved: 2, ignored: 0, openErrors: 12, openWarnings: 6 },
    ...over,
  });

export const OPTIONS: ImportOptions = {
  limits: { maxFileBytes: 25 * 1024 * 1024, maxRows: 10_000, maxColumns: 200, formats: ["csv", "tsv", "xlsx"] },
  targetFields: [
    { key: "sku", label: "SKU", group: "identity", required: true, recommended: false, example: "TRV-1", description: "Your SKU" },
    { key: "title", label: "Product title", group: "content", required: true, recommended: false, example: "Jacket", description: "Name" },
    { key: "category", label: "Category", group: "taxonomy", required: true, recommended: true, example: "Men", description: "Category" },
    { key: "sellingPrice", label: "Selling price", group: "pricing", required: true, recommended: false, example: "3499", description: "Price" },
    { key: "imageUrl", label: "Primary image URL", group: "media", required: true, recommended: true, example: "https://x/y.jpg", description: "Image" },
    { key: "mrp", label: "MRP", group: "pricing", required: false, recommended: false, example: "4999", description: "MRP" },
  ],
  duplicateStrategies: [
    { value: "skip", label: "Skip existing", description: "Leave existing products untouched." },
    { value: "update", label: "Update existing", description: "Update existing products with the file values." },
    { value: "create_variant_for_new_sku", label: "Add new variants", description: "New SKUs become variants." },
  ],
  currencyUnits: [
    { value: "rupees", label: "Rupees (499.50)" },
    { value: "paise", label: "Paise (49950)" },
  ],
  presets: [
    { code: "shopify", label: "Shopify product export", description: "Products CSV from Shopify." },
    { code: "amazon", label: "Amazon inventory loader", description: "Flat file from Seller Central." },
    { code: "generic", label: "Generic CSV / Excel", description: "Any spreadsheet." },
  ],
  sources: ["csv", "xlsx", "tsv", "shopify", "amazon", "flipkart", "marketplace", "erp"],
  defaults: { duplicateStrategy: "skip", assignAllChannels: false, accountIds: [], autoPublish: false, warehouseId: null, defaultCategoryId: null, currencyUnit: "rupees" },
  commitModes: [
    { value: "clean_only", label: "Clean rows only", description: "Rows without issues." },
    { value: "include_resolved", label: "Include resolved rows", description: "Clean rows and the rows you fixed." },
  ],
};

export function mapping(over: Partial<MappingView> = {}): MappingView {
  return {
    preset: { code: "generic", label: "Generic CSV / Excel", confidence: 0 },
    columns: [
      { sourceColumn: "SKU_CODE", targetField: "sku", confidence: 95, sampleValues: ["TRV-1", "TRV-2"], isRequired: true, status: "matched", autoTargetField: "sku" },
      { sourceColumn: "PRODUCT_NAME", targetField: "title", confidence: 90, sampleValues: ["Jacket"], isRequired: true, status: "matched", autoTargetField: "title" },
      { sourceColumn: "PRICE", targetField: null, confidence: 0, sampleValues: ["3499"], isRequired: false, status: "unmatched", autoTargetField: null },
    ],
    mapping: { sku: "SKU_CODE", title: "PRODUCT_NAME" },
    missingRequired: [
      { key: "category", label: "Category" },
      { key: "sellingPrice", label: "Selling price" },
      { key: "imageUrl", label: "Primary image URL" },
    ],
    ...over,
  };
}

export function issue(over: Partial<ImportIssue> = {}): ImportIssue {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    rowNumber: 7,
    code: "category_unmapped",
    type: "category_unmapped",
    title: "Unrecognized category",
    description: 'The category "Kurtis" does not exist in your catalogue.',
    severity: "warning",
    field: "category",
    affectedFields: ["category"],
    sourceValue: "Kurtis",
    suggestion: { kind: "map_category", field: "category", value: CATEGORY_ID, label: "Women > Kurtas", confidence: "medium", confidenceReason: "Fuzzy match on the category name." },
    suggestedFix: "Women > Kurtas",
    currentFix: null,
    status: "open",
    resolution: null,
    resolvedAt: null,
    productData: { sku: "KUR-7", title: "Cotton Kurti", category: "Kurtis", price: 799, barcode: "8901234567890", existing: null, source: { SKU_CODE: "KUR-7", PRODUCT_NAME: "Cotton Kurti" } },
    duplicateMatch: null,
    whyItMatters: "Products without a category cannot be listed.",
    impact: "The row is imported once its category is mapped.",
    unit: "rupees",
    ...over,
  };
}

export const ISSUE_A = issue();
export const ISSUE_B = issue({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  rowNumber: 9,
  code: "missing_sku",
  type: "missing_sku",
  title: "Missing SKU identifier",
  description: "This row has no SKU.",
  severity: "error",
  field: "sku",
  affectedFields: ["sku"],
  sourceValue: null,
  suggestion: null,
  suggestedFix: null,
  productData: { title: "Silk Saree", existing: null, source: { PRODUCT_NAME: "Silk Saree" } },
});

export function summary(over: Partial<ImportSummary> = {}): ImportSummary {
  return {
    total: 20,
    open: 18,
    resolved: 2,
    ignored: 0,
    errors: 12,
    warnings: 6,
    byCode: [
      { code: "missing_sku", title: "Missing SKU identifier", total: 12, open: 12, resolved: 0, ignored: 0, errors: 12, warnings: 0 },
      { code: "category_unmapped", title: "Unrecognized category", total: 8, open: 6, resolved: 2, ignored: 0, errors: 0, warnings: 6 },
    ],
    knownCodes: [],
    rows: { valid: 100, warning: 8, error: 12 },
    products: 0,
    plan: { create: 0, update: 0, addVariant: 0, skip: 0 },
    scope: { products: 0, newProducts: 0, updates: 0 },
    ...over,
  };
}

export const paged = <T>(items: T[], over: Partial<{ page: number; pages: number; total: number; pageSize: number }> = {}) => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  pages: 1,
  ...over,
});
