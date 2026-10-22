import type { ListingRow } from "@/types/listing";
import type { BulkContentEdits, ChannelScreenStatus, FixSuggestion, ListingFixSuggestions, SuggestionSource } from "@/types/listingFlows";
import type { ListingStudio, ReadinessItem, StudioAttribute } from "@/types/listingStudio";
import { MAX_SELECTION } from "@/types/listingFlows";

export type AttributeValue = string | number | boolean;

/** the colours of the design, by what a listing is doing (not by marketplace) */
export const STATUS_COLOR: Record<ChannelScreenStatus, string> = {
  live: "#16A34A",
  ready: "#16A34A",
  needs_review: "#D97706",
  blocked: "#DC2626",
  failed: "#DC2626",
  syncing: "#2563EB",
  not_listed: "#9CA3AF",
};

export const STATUS_LABEL: Record<ChannelScreenStatus, string> = {
  live: "Live",
  ready: "Ready",
  needs_review: "Needs review",
  blocked: "Blocked",
  failed: "Failed",
  syncing: "Syncing",
  not_listed: "Not listed",
};

/** header status line of the quick view */
export const DRAWER_STATUS_LABEL: Record<ChannelScreenStatus, string> = {
  live: "Live",
  ready: "Ready to publish",
  needs_review: "Needs review",
  blocked: "Blocked",
  failed: "Failed",
  syncing: "Syncing",
  not_listed: "Not listed",
};

export const isGood = (s: ChannelScreenStatus): boolean => s === "live" || s === "ready";

/** every readiness check that stops publishing */
export const failingItems = (studio: ListingStudio): ReadinessItem[] => studio.readiness.groups.flatMap((g) => g.items).filter((i) => i.status === "fail");

export interface AttributeIssue {
  item: ReadinessItem;
  attribute: StudioAttribute;
}

/** the first failing check that is a missing or invalid category attribute (fixable with one value), with its definition */
export function attributeIssueOf(studio: ListingStudio): AttributeIssue | null {
  for (const item of failingItems(studio)) {
    if (item.fix?.action !== "fill_attribute" || !item.field) continue;
    const attribute = studio.category.attributes.find((a) => a.key === item.field);
    if (attribute) return { item, attribute };
  }
  return null;
}

/** text of the form -> the value the API stores for this attribute (null: nothing usable typed) */
export function coerceAttribute(attribute: StudioAttribute, text: string): AttributeValue | null {
  const t = text.trim();
  if (!t) return null;
  if (attribute.type === "number") {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  if (attribute.type === "boolean") return t === "true";
  return t;
}

/** "Meets Amazon India category taxonomy requirements for Apparel." (the limits of the attribute follow) */
export const attributeHint = (attribute: StudioAttribute, marketplaceName: string, categoryName?: string | null): string => {
  const parts = [`Meets ${marketplaceName} category taxonomy requirements${categoryName ? ` for ${categoryName}` : ""}`];
  if (attribute.maxLength) parts.push(`up to ${attribute.maxLength} characters`);
  if (attribute.type === "number") parts.push("a number");
  return `${parts.join(", ")}.`;
};

/** the brand colour of each marketplace: the left bar and the dot of the channel name in the "other channels" tables and chips */
export const MARKETPLACE_ACCENT: Record<string, string> = {
  amazon: "#FF9900",
  flipkart: "#2874F0",
  meesho: "#F43397",
  myntra: "#FF3F6C",
  snapdeal: "#E40046",
  shopify: "#5E8E3E",
  mock: "#6B7280",
};

export function accentOf(marketplace: string): string {
  const m = marketplace.toLowerCase();
  const hit = Object.keys(MARKETPLACE_ACCENT).find((k) => m.includes(k));
  return hit ? (MARKETPLACE_ACCENT[hit] as string) : "#9CA3AF";
}

/** where a suggested value comes from, in the words of the screen */
export const SUGGESTION_SOURCE_LABEL: Record<SuggestionSource, string> = {
  product_attribute: "Product attributes",
  variant_option: "Variant option",
  master_field: "Product details",
  other_listing: "Another listing of this product",
  other_channel: "Another channel",
  keyword_match: "Matched in the title or description",
  brand_default: "Same brand",
  category_default: "Same category",
};

export const CONFIDENCE_LABEL: Record<"high" | "medium" | "low", string> = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };

/** the suggestion of the engine for one attribute (the failing one the screen is fixing) */
export const suggestionFor = (res: ListingFixSuggestions | undefined, key: string | undefined): FixSuggestion | null => (res && key ? res.suggestions.find((s) => s.kind === "attribute" && s.key === key) ?? null : null);

type TextOp = "prefix" | "suffix" | "replace" | "set";
type DescriptionOp = "append" | "prepend" | "replace" | "set";
type ListOp = "add" | "remove" | "set" | "clear";

/** the fields of the bulk content editor: each section is only sent when its box is ticked */
export interface BulkContentForm {
  title: { on: boolean; op: TextOp; text: string; find: string };
  description: { on: boolean; op: DescriptionOp; text: string; find: string };
  bulletPoints: { on: boolean; op: ListOp; text: string };
  searchTerms: { on: boolean; op: ListOp; text: string };
  brand: { on: boolean; op: "set" | "clear"; text: string };
}

export const emptyBulkForm = (): BulkContentForm => ({
  title: { on: false, op: "prefix", text: "", find: "" },
  description: { on: false, op: "append", text: "", find: "" },
  bulletPoints: { on: false, op: "add", text: "" },
  searchTerms: { on: false, op: "add", text: "" },
  brand: { on: false, op: "set", text: "" },
});

const lines = (text: string, alsoCommas: boolean): string[] => text.split(alsoCommas ? /[\n,]/ : /\n/).map((s) => s.trim()).filter(Boolean);

/** the form -> the request edits, or what is still missing (the same limits the API enforces) */
export function buildBulkContentEdits(f: BulkContentForm): { edits: BulkContentEdits; error: string | null } {
  const edits: BulkContentEdits = {};
  const missing = (what: string) => ({ edits: {}, error: what });
  if (f.title.on) {
    if (f.title.op === "replace") {
      if (!f.title.find) return missing("Enter the text to find in the titles.");
      edits.title = { op: "replace", find: f.title.find, value: f.title.text };
    } else {
      if (!f.title.text) return missing(f.title.op === "set" ? "Enter the new title." : "Enter the text to add to the titles.");
      edits.title = { op: f.title.op, value: f.title.text };
    }
  }
  if (f.description.on) {
    if (f.description.op === "replace") {
      if (!f.description.find) return missing("Enter the text to find in the descriptions.");
      edits.description = { op: "replace", find: f.description.find, value: f.description.text };
    } else {
      if (!f.description.text.trim()) return missing("Enter the description text.");
      edits.description = { op: f.description.op, value: f.description.text };
    }
  }
  for (const [key, label, commas] of [["bulletPoints", "bullet point", false], ["searchTerms", "search term", true]] as const) {
    const s = f[key];
    if (!s.on) continue;
    if (s.op === "clear") edits[key] = { op: "clear" };
    else {
      const values = lines(s.text, commas);
      if (values.length === 0) return missing(`Enter at least one ${label}${commas ? " (separated by commas or new lines)" : " (one per line)"}.`);
      if (key === "bulletPoints" && (values.length > 10 || values.some((v) => v.length > 500))) return missing("Bullet points: at most 10, up to 500 characters each.");
      if (key === "searchTerms" && (values.length > 50 || values.some((v) => v.length > 100))) return missing("Search terms: at most 50, up to 100 characters each.");
      edits[key] = { op: s.op, values };
    }
  }
  if (f.brand.on) {
    if (f.brand.op === "clear") edits.brand = { op: "clear" };
    else if (!f.brand.text.trim()) return missing("Enter the brand.");
    else edits.brand = { op: "set", value: f.brand.text.trim() };
  }
  if (Object.keys(edits).length === 0) return missing("Tick at least one thing to change.");
  return { edits, error: null };
}

/** `?ids=a,b,a` -> unique ids, at most MAX_SELECTION; `extra` is how many were left out */
export function parseIds(raw: string | null): { ids: string[]; extra: number } {
  const all = [...new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  return { ids: all.slice(0, MAX_SELECTION), extra: Math.max(0, all.length - MAX_SELECTION) };
}

const csvCell = (v: string | number): string => `"${String(v).replace(/"/g, '""')}"`;

/** CSV of the selected listings as the screen shows them */
export function selectionCsv(rows: ListingRow[]): string {
  const head = ["Listing", "SKU", "Marketplace", "Account", "Readiness", "Status", "Listing ID"];
  const lines = rows.map((r) => [r.productTitle, r.sku, r.table.marketplaceName, r.table.accountName, `${r.table.readiness.percent}%`, STATUS_LABEL[r.table.screenStatus], r.id].map(csvCell).join(","));
  return [head.map(csvCell).join(","), ...lines].join("\r\n");
}

export function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
