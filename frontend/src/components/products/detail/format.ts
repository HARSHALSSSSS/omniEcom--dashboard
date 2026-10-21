import { formatDistanceToNow, parseISO } from "date-fns";
import { isApiError } from "@/api/errors";
import type { ChannelListingStatus, ContentState, FieldState, InventoryStatus, ProductAction, ProductStatus } from "@/types/productDetail";

export const relative = (iso: string | null | undefined): string => {
  if (!iso) return "Never";
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "Unknown";
  }
};

export const statusLabel = (s: ProductStatus): string => (s === "active" ? "Active" : s === "draft" ? "Draft" : "Archived");

export const inventoryLabel = (s: InventoryStatus): string => (s === "healthy" ? "Healthy" : s === "low" ? "Low stock" : "Out of stock");

export const listingStatusLabel = (s: ChannelListingStatus): string =>
  ({ active: "Active", attention: "Needs attention", pending: "Pending", draft: "Draft", unpublished: "Unpublished" })[s];

export const contentStateLabel = (s: ContentState): string => (s === "ok" ? "Ready" : s === "needs_review" ? "Needs review" : "Not published yet");

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  images: "Images",
  attributes: "Attributes",
  marketplace_content: "Marketplace content",
};

export const fieldLabel = (key: string): string => FIELD_LABELS[key] ?? humanize(key);

export function fieldStateLabel(key: string, state: FieldState): string {
  if (key === "marketplace_content" && (state === "ok" || state === "needs_review" || state === "not_published")) return contentStateLabel(state);
  if (state === "complete" || state === "ok") return "Complete";
  if (state === "needs_review") return "Needs review";
  if (state === "not_published") return "Not published yet";
  return "Incomplete";
}

export function humanize(code: string): string {
  const s = code.replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : code;
}

const ATTRIBUTE_LABELS: Record<string, string> = {
  hsn_code: "HSN code",
  gst_rate_bps: "GST rate",
  country_of_origin: "Country of origin",
};

export const attributeLabel = (code: string): string => ATTRIBUTE_LABELS[code] ?? humanize(code);

/** a readable master value for one attribute row */
export function attributeValue(attribute: string, value: string | number | boolean | null, categoryName?: string | null): string {
  if (value === null || value === "") return "Not set";
  if (attribute === "category") return categoryName ?? "Set";
  if (attribute === "gst_rate_bps" && typeof value === "number") return `${value / 100}%`;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

const DISABLED_REASONS: Record<string, string> = {
  archived: "Archived products cannot be changed. Unarchive the product first.",
  readiness_incomplete: "Complete the missing product information before publishing.",
  no_active_variant: "This product has no active variant yet.",
};

export const disabledReasonText = (reason: string | null): string | undefined => (reason ? (DISABLED_REASONS[reason] ?? humanize(reason)) : undefined);

export const NO_PERMISSION = "You do not have permission to do this.";

export const findAction = (actions: ProductAction[] | undefined, key: string): ProductAction | undefined => actions?.find((a) => a.key === key);

export const optionColumns = (options: Record<string, string[]>): string[] => Object.keys(options).slice(0, 2);

/** the product's code names the downloaded file */
export const exportFileName = (code: string): string => `${code.replace(/[^A-Za-z0-9._-]+/g, "-")}.csv`;

/** an id the API does not know (or that is not an id at all) */
export const isNotFound = (e: unknown): boolean => isApiError(e) && (e.status === 404 || e.status === 400 || e.status === 422);

export const tabId = (tab: string) => `product-tab-${tab}`;
export const panelId = (tab: string) => `product-panel-${tab}`;
