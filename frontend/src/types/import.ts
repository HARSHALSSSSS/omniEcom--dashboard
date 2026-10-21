/**
 * Guided product import (`/imports*`). Shapes follow the API (backend/modules/product-import); the screens never
 * invent ids, counters or statuses.
 */

export type ImportSource = "csv_excel" | "csv" | "xlsx" | "tsv" | "shopify" | "amazon" | "flipkart" | "marketplace" | "erp";

export type ImportStatus =
  | "created"
  | "uploaded"
  | "analyzed"
  | "validating"
  | "validated"
  | "committing"
  | "committed"
  | "partially_committed"
  | "failed"
  | "cancelled";

export const IMPORT_STATUSES: readonly ImportStatus[] = [
  "created",
  "uploaded",
  "analyzed",
  "validating",
  "validated",
  "committing",
  "committed",
  "partially_committed",
  "failed",
  "cancelled",
];

/** the status vocabulary of the wizard screens (`uiStatus`) */
export type ImportUiStatus = "pending" | "uploading" | "analyzing" | "mapping" | "processing" | "completed" | "needs_attention" | "failed";

export type DuplicateStrategy = "skip" | "update" | "create_variant_for_new_sku";
export type CurrencyUnit = "rupees" | "paise";
export type CommitMode = "clean_only" | "include_resolved";

export interface ImportSettings {
  duplicateStrategy: DuplicateStrategy;
  assignAllChannels: boolean;
  accountIds: string[];
  /** creates draft listings for the imported variants (publishing stays with the listings workspace) */
  autoPublish: boolean;
  warehouseId: string | null;
  defaultCategoryId: string | null;
  currencyUnit: CurrencyUnit;
}

export interface ImportCounters {
  total: number;
  processed: number;
  valid: number;
  warning: number;
  error: number;
  ignored: number;
  skipped: number;
  committed: number;
  failed: number;
  percent: number;
  etaSeconds: number | null;
}

export interface ImportIssueTotals {
  total: number;
  open: number;
  resolved: number;
  ignored: number;
  openErrors: number;
  openWarnings: number;
}

export interface ImportResults {
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
}

export interface ImportSession {
  id: string;
  source: string;
  fileName: string | null;
  fileSizeBytes: number | null;
  status: ImportStatus;
  uiStatus: ImportUiStatus;
  headers: string[];
  settings: ImportSettings;
  counters: ImportCounters;
  issues: ImportIssueTotals;
  results: ImportResults;
  failureMessage: string | null;
  requestedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

// ---------------------------------------------------------------- options

export interface TargetField {
  key: string;
  label: string;
  group: string;
  required: boolean;
  recommended: boolean;
  example: string;
  description: string;
}

export interface ImportOptions {
  limits: { maxFileBytes: number; maxRows: number; maxColumns: number; formats: string[] };
  targetFields: TargetField[];
  duplicateStrategies: Array<{ value: string; label: string; description: string }>;
  currencyUnits: Array<{ value: string; label: string }>;
  presets: Array<{ code: string; label: string; description: string }>;
  sources: string[];
  defaults: ImportSettings;
  commitModes: Array<{ value: string; label: string; description: string }>;
}

// ---------------------------------------------------------------- mapping / upload

export interface ImportPreset {
  code: "shopify" | "amazon" | "generic";
  label: string;
  confidence: number;
}

export interface MappingColumn {
  sourceColumn: string;
  /** null = the column is not imported ("ignore") */
  targetField: string | null;
  confidence: number;
  sampleValues: string[];
  isRequired: boolean;
  status: "matched" | "unmatched" | "manual";
}

export interface MissingField {
  key: string;
  label: string;
}

export interface MappingView {
  preset: ImportPreset;
  columns: MappingColumn[];
  /** target field -> source column */
  mapping: Record<string, string>;
  missingRequired: MissingField[];
}

export interface UploadAnalysis {
  format: "csv" | "tsv" | "xlsx";
  delimiter: string | null;
  sheetName: string | null;
  totalRows: number;
  headers: string[];
  preview: Array<{ rowNumber: number; values: Record<string, string> }>;
  preset: ImportPreset;
  mapping: MappingColumn[];
  missingRequired: MissingField[];
}

export interface UploadResult {
  session: ImportSession;
  analysis: UploadAnalysis;
}

/** `{ sourceColumn, targetField }` maps one column; `targetField: null` unmaps it */
export interface MappingChange {
  sourceColumn: string;
  targetField: string | null;
}

export type SettingsPatch = Partial<ImportSettings>;

// ---------------------------------------------------------------- issues and rows

export type IssueSeverity = "error" | "warning";
export type IssueStatus = "open" | "resolved" | "ignored";
export type IssueAction = "accept_suggestion" | "custom_value" | "ignore";

export interface IssueSuggestion {
  kind: "set_value" | "map_category" | "skip_row";
  field?: string;
  value?: string;
  label?: string;
}

export interface ImportIssue {
  id: string;
  rowNumber: number;
  code: string;
  type: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  field: string | null;
  affectedFields: string[];
  sourceValue: string | null;
  suggestion: IssueSuggestion | null;
  suggestedFix: string | null;
  currentFix: string | null;
  status: IssueStatus;
  resolution: Record<string, unknown> | null;
  resolvedAt: string | null;
  productData: {
    sku?: string;
    title?: string;
    category?: string;
    price?: number;
    barcode?: string;
    imageUrl?: string;
    source: Record<string, string>;
  };
  unit: CurrencyUnit;
}

export interface IssuesQuery {
  code?: string;
  severity?: IssueSeverity;
  status?: IssueStatus;
  q?: string;
  page: number;
  pageSize: number;
}

export interface ImportSummary {
  total: number;
  open: number;
  resolved: number;
  ignored: number;
  errors: number;
  warnings: number;
  byCode: Array<{ code: string; title: string; total: number; open: number; resolved: number; ignored: number; errors: number; warnings: number }>;
  knownCodes: Array<{ code: string; title: string }>;
  rows: Record<string, number>;
}

export interface ResolveInput {
  issueId: string;
  action: IssueAction;
  customValue?: string;
}

export interface ResolveResult {
  issue: ImportIssue;
  issues: ImportIssueTotals;
  counters: ImportCounters;
}

export interface BulkResolveInput {
  code: string;
  action: IssueAction;
  customValue?: string;
  /** only the issues that show exactly this value */
  sourceValue?: string;
}

export interface BulkResult {
  matched: number;
  applied: number;
  skippedCount: number;
  skipped: Array<{ issueId: string; rowNumber: number; reason: string }>;
  issues: ImportIssueTotals;
  counters: ImportCounters;
}

export type RowStatus = "pending" | "valid" | "warning" | "error" | "ignored" | "committed" | "skipped";
export const ROW_STATUSES: readonly RowStatus[] = ["pending", "valid", "warning", "error", "ignored", "committed", "skipped"];

export interface ImportRow {
  rowNumber: number;
  status: string;
  sku: string | null;
  productCode: string | null;
  title: string | null;
  issueCount: number;
  plan: "create" | "add_variant" | "update" | null;
  skipReason: string | null;
  fixed: boolean;
  result: {
    action: "created" | "updated" | "variant_added" | "skipped";
    productId?: string;
    variantId?: string;
    stock?: "received" | "counted" | "unchanged" | "none";
    listingDrafts?: number;
    notes?: string[];
  } | null;
  productId: string | null;
  variantId: string | null;
  values: Record<string, unknown>;
  raw: Record<string, string>;
}

export interface RowsQuery {
  status?: RowStatus;
  q?: string;
  page: number;
  pageSize: number;
}

export interface HistoryQuery {
  status?: ImportStatus;
  q?: string;
  page: number;
  pageSize: number;
}

export interface RevalidationResult {
  queued: boolean;
  status: "clean" | "issues_remain" | "queued";
  revalidatedCount: number;
  resolvedCount: number;
  remainingIssuesCount: number;
  session: ImportSession;
}

/** GET /imports/{id}/commit-preview: the exact rows each commit choice would import */
export interface CommitPreview {
  cleanOnly: number;
  includeResolved: number;
  pendingFixes: number;
}

export interface CommitStart {
  session: ImportSession;
  eligibleRows: number;
}

export interface WarehouseChoice {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
}

export interface AccountChoice {
  id: string;
  marketplace: string;
  displayName: string;
  status: string;
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}
