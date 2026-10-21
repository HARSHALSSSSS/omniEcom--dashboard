import { ApiError, errorMessage, isApiError } from "@/api/errors";
import type { ImportSession, ImportSource, ImportStatus } from "@/types/import";
import { formatInZone, formatNumber } from "@/utils/format";

export const BYTES_MB = 1024 * 1024;

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "–";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < BYTES_MB) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / BYTES_MB).toFixed(bytes < 10 * BYTES_MB ? 2 : 1)} MB`;
}

export const num = (n: number | null | undefined): string => (n === null || n === undefined ? "–" : formatNumber(n));

/** "about 2 min", "under a minute" ... (null while the server cannot estimate yet) */
export function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "Estimating…";
  if (seconds < 5) return "a few seconds left";
  if (seconds < 60) return `about ${Math.ceil(seconds / 5) * 5} seconds left`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `about ${minutes} min left` : `about ${Math.ceil(minutes / 60)} h left`;
}

export const when = (iso: string | null | undefined): string =>
  iso ? formatInZone(iso, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "–";

// ---------------------------------------------------------------- sources

export interface SourceInfo {
  id: ImportSource;
  title: string;
  description: string;
  /** file extensions the picker offers */
  accept: string;
  recommended?: boolean;
}

const ANY_FILE = ".csv,.tsv,.txt,.xlsx";

/** presentation of the sources the API accepts (`GET /imports/options` -> sources); unknown ones fall back to a generic card */
export const SOURCE_INFO: Record<ImportSource, SourceInfo> = {
  csv_excel: { id: "csv_excel", title: "CSV or Excel spreadsheet", description: "Any spreadsheet with a header row (.csv, .tsv, .xlsx). Columns are matched by name.", accept: ANY_FILE, recommended: true },
  shopify: { id: "shopify", title: "Shopify product export", description: "The products CSV from the Shopify admin: one row per variant.", accept: ANY_FILE },
  amazon: { id: "amazon", title: "Amazon inventory file", description: "An inventory loader or flat file from Seller Central.", accept: ANY_FILE },
  flipkart: { id: "flipkart", title: "Flipkart listing export", description: "A listings report downloaded from the Flipkart Seller Hub.", accept: ANY_FILE },
  marketplace: { id: "marketplace", title: "Other marketplace export", description: "A catalogue export from another marketplace or supplier portal.", accept: ANY_FILE },
  erp: { id: "erp", title: "ERP or accounting export", description: "Item master exported from Tally, Zoho, Busy or another ERP.", accept: ANY_FILE },
  csv: { id: "csv", title: "CSV file", description: "Comma separated values (.csv).", accept: ".csv,.txt" },
  tsv: { id: "tsv", title: "TSV file", description: "Tab separated values (.tsv).", accept: ".tsv,.txt" },
  xlsx: { id: "xlsx", title: "Excel workbook", description: "The first sheet of an .xlsx workbook.", accept: ".xlsx" },
};

export const SOURCE_ORDER: ImportSource[] = ["csv_excel", "shopify", "amazon", "flipkart", "marketplace", "erp", "csv", "tsv", "xlsx"];

export function sourceInfo(id: string): SourceInfo {
  return SOURCE_INFO[id as ImportSource] ?? { id: id as ImportSource, title: id.replace(/_/g, " "), description: "", accept: ANY_FILE };
}

export const FILE_EXTENSION = /\.(csv|tsv|txt|xlsx)$/i;

// ---------------------------------------------------------------- status

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const STATUS_META: Record<ImportStatus, { label: string; tone: Tone }> = {
  created: { label: "Not started", tone: "neutral" },
  uploaded: { label: "Uploaded", tone: "info" },
  analyzed: { label: "Ready to validate", tone: "info" },
  validating: { label: "Validating", tone: "info" },
  validated: { label: "Validated", tone: "warning" },
  committing: { label: "Importing", tone: "info" },
  committed: { label: "Imported", tone: "success" },
  partially_committed: { label: "Partly imported", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-blue-50 text-blue-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
};

export const isBusy = (status: ImportStatus): boolean => status === "validating" || status === "committing";
export const isFinished = (status: ImportStatus): boolean => status === "committed" || status === "partially_committed" || status === "cancelled";
/** the statuses a seller can still pick up and continue in the wizard */
export const isResumable = (status: ImportStatus): boolean => status !== "committed" && status !== "cancelled";
/** after a validation the issues can be fixed and the rows imported */
export const canReview = (status: ImportStatus): boolean => status === "validated" || status === "partially_committed";
/** the file has been analysed, so a mapping and settings exist */
export const hasFile = (s: Pick<ImportSession, "headers">): boolean => s.headers.length > 0;

// ---------------------------------------------------------------- errors

/** upload / import failures in the seller's words (413 and 415 are the file's fault, 409 carries the rule's message) */
export function importErrorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isApiError(e)) {
    if (e.status === 413) return "That file is too large. Files can be at most 25 MB and 10,000 rows.";
    if (e.status === 415) return "That file type is not supported. Upload a .csv, .tsv or .xlsx file.";
    if (e.fields) return Object.values(e.fields).join(" ");
    if (e.code === "NOT_FOUND") return "This import no longer exists.";
  }
  return errorMessage(e, fallback);
}

export const isNotFound = (e: unknown): boolean => e instanceof ApiError && e.status === 404;
export const ruleOf = (e: unknown): string | null => (isApiError(e) ? e.rule : null);

// ---------------------------------------------------------------- issue codes

const CODE_TITLES: Record<string, string> = {
  missing_sku: "Missing SKU",
  invalid_sku: "Invalid SKU",
  duplicate_sku: "Duplicate SKU",
  missing_title: "Missing title",
  invalid_field: "Invalid value",
  category_unmapped: "Unrecognised category",
  invalid_image: "Invalid image URL",
  duplicate_barcode: "Duplicate barcode",
  invalid_barcode: "Invalid barcode",
  pricing_invalid: "Invalid pricing",
  stock_invalid: "Invalid stock",
  missing_warehouse: "No warehouse",
  commit_failed: "Import failed",
};

export const codeLabel = (code: string): string => CODE_TITLES[code] ?? code.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
