import { currencySymbol, formatCurrency, formatInZone, getFormatPreferences } from "@/utils/format";
import type { ChannelCapability, ContributionBasis, PromotionCampaign, PromotionItemStatus, PromotionLifecycleAction, PromotionOverview, PromotionStatus, PromotionType } from "@/types/promotions";

export const WRITE_REASON = "You need the promotions:write permission to change campaigns.";

export const TYPE_LABELS: Record<PromotionType, string> = {
  percentage_discount: "Percentage off",
  flat_discount: "Flat amount off",
  bogo: "Buy X get Y",
  bundle: "Bundle",
};

export const TYPE_HINTS: Record<PromotionType, string> = {
  percentage_discount: "A percentage taken off each product's price.",
  flat_discount: "A fixed amount taken off each product's price.",
  bogo: "Marketplaces take one price per listing, so this runs as the effective unit price (buy 2 get 1 = two thirds of the price).",
  bundle: "A percentage off when buying a set of items; applied as that percentage off the unit price.",
};

export const STATUS_LABELS: Record<PromotionStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  ended: "Ended",
  cancelled: "Cancelled",
};

export const STATUS_TONE: Record<PromotionStatus, string> = {
  draft: "border-neutral-200 bg-neutral-100 text-neutral-700",
  scheduled: "border-blue-200 bg-blue-50 text-blue-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ended: "border-neutral-200 bg-neutral-100 text-neutral-600",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
};

export const ITEM_STATUS_LABELS: Record<PromotionItemStatus, string> = {
  eligible: "Eligible",
  pending_sync: "Pending sync",
  live: "Live",
  ineligible: "Ineligible",
  ended: "Ended",
};

export const ITEM_STATUS_TONE: Record<PromotionItemStatus, string> = {
  eligible: "border-sky-200 bg-sky-50 text-sky-700",
  pending_sync: "border-amber-200 bg-amber-50 text-amber-700",
  live: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ineligible: "border-rose-200 bg-rose-50 text-rose-700",
  ended: "border-neutral-200 bg-neutral-100 text-neutral-600",
};

export const END_REASON_LABELS: Record<string, string> = {
  ended_manually: "Ended manually",
  window_closed: "The campaign window closed",
  budget_exhausted: "The discount budget was used up",
  cancelled: "Cancelled before it ran",
};

export const ACTION_LABELS: Record<PromotionLifecycleAction, { verb: string; done: string; title: string; body: string; destructive: boolean }> = {
  schedule: {
    verb: "Schedule",
    done: "scheduled",
    title: "Schedule this campaign?",
    body: "The sale prices are put on the marketplace prices for the campaign window and start by themselves. Products that cannot run are skipped.",
    destructive: false,
  },
  activate: {
    verb: "Start now",
    done: "started",
    title: "Start this campaign now?",
    body: "The campaign window starts now and the sale prices go to the marketplaces.",
    destructive: false,
  },
  end: {
    verb: "End now",
    done: "ended",
    title: "End this campaign?",
    body: "The sale prices are removed from the marketplaces and the results are frozen. This cannot be undone.",
    destructive: true,
  },
  cancel: {
    verb: "Cancel",
    done: "cancelled",
    title: "Cancel this campaign?",
    body: "Any scheduled sale prices are removed and the campaign will not run.",
    destructive: true,
  },
};

/** which lifecycle actions the campaign's state allows (mirrors the server's state machine) */
export function allowedActions(status: PromotionStatus): PromotionLifecycleAction[] {
  switch (status) {
    case "draft":
      return ["schedule", "activate", "cancel"];
    case "scheduled":
      return ["activate", "cancel"];
    case "active":
      return ["end"];
    default:
      return [];
  }
}

export const isDraft = (c: Pick<PromotionCampaign, "status">): boolean => c.status === "draft";

// ---- money and percentages: strings in, integers out, no floating point ----

/** "1499" or "1499.50" to minor units (149950); null when it is not a plain amount with at most two decimals */
export function parseMinor(text: string): number | null {
  const t = text.trim().replace(/,/g, "");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}

/** 149950 to "1499.5" for editing (no grouping, no trailing zeros) */
export function minorToInput(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const frac = String(Math.abs(minor % 100)).padStart(2, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

/** "12.5" percent to basis points (1250); null when it has more than two decimals */
export function parseBps(text: string): number | null {
  const t = text.trim();
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}

/** 1250 bps to "12.5" */
export const bpsToInput = (bps: number): string => minorToInput(bps);

export function formatBps(bps: number): string {
  const text = minorToInput(bps);
  return `${text}%`;
}

export const money = (minor: number, currency?: string | null): string => formatCurrency(minor, currency);

/** the discount as a seller reads it: "15% off", "₹200 off", "Buy 2 get 1", "Bundle of 3, 10% off" */
export function describeTerms(c: Pick<PromotionCampaign, "type" | "valueBps" | "valueMinor" | "buyQuantity" | "getQuantity" | "currency">): string {
  switch (c.type) {
    case "percentage_discount":
      return c.valueBps === null ? "Percentage off" : `${formatBps(c.valueBps)} off`;
    case "flat_discount":
      return c.valueMinor === null ? "Flat amount off" : `${money(c.valueMinor, c.currency)} off`;
    case "bogo":
      return `Buy ${c.buyQuantity ?? "?"} get ${c.getQuantity ?? "?"}`;
    case "bundle":
      return `Bundle of ${c.buyQuantity ?? "?"}${c.valueBps === null ? "" : `, ${formatBps(c.valueBps)} off`}`;
  }
}

/** "Oct 25, 10:00 am" in the business time zone, or a dash */
export const whenOf = (iso: string | null): string => (iso ? formatInZone(iso, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "—");

export function windowOf(c: Pick<PromotionCampaign, "startsAt" | "endsAt">): string {
  if (!c.startsAt && !c.endsAt) return "No dates set";
  return `${whenOf(c.startsAt)} → ${whenOf(c.endsAt)}`;
}

export const symbol = (): string => currencySymbol();

// ---- dates: <input type="datetime-local"> values in the business time zone ----

function zoneParts(ms: number, timeZone: string): Record<"year" | "month" | "day" | "hour" | "minute", number> {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** ISO instant to "YYYY-MM-DDTHH:mm" as the wall clock of the business time zone shows it */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const p = zoneParts(ms, getFormatPreferences().timezone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DDTHH:mm" read in the business time zone to an ISO instant; null when empty or invalid */
export function localInputToIso(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const tz = getFormatPreferences().timezone;
  // the zone's offset at that wall time: how far the zone's clock reading is from the UTC reading of the guess
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = zoneParts(guess, tz);
    guess += wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return Number.isNaN(guess) ? null : new Date(guess).toISOString();
}

// ---------------------------------------------------------------------------- Overview

/** "amazon_in" -> "Amazon In": the marketplace code as a label when the account has no display name */
export const marketplaceLabel = (code: string): string => code.split(/[_-]/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export const CAPABILITY_LABELS: Record<ChannelCapability, string> = {
  supported: "Supported",
  not_supported: "Not supported",
  verification_required: "Connection required",
};

export const CONTRIBUTION_NOTES: Record<ContributionBasis, string> = {
  after_cost_and_fees: "After cost and marketplace fees",
  after_cost_only: "After cost; a channel has no fee profile, so its fees count as zero",
};

const ACTIVITY_LABELS: Record<string, string> = {
  "promotion.created": "created",
  "promotion.updated": "edited",
  "promotion.scheduled": "scheduled",
  "promotion.activated": "started",
  "promotion.ended": "ended",
  "promotion.cancelled": "cancelled",
  "promotion.deleted": "draft deleted",
  "promotion.duplicated": "copied as a new draft",
  "promotion.products_changed": "products changed",
};

/** one audit row as a sentence: "Festive Flash started" */
export function activityText(a: { action: string; campaignName: string | null }): string {
  const verb = ACTIVITY_LABELS[a.action] ?? a.action.replace(/^promotion\./, "").replace(/_/g, " ");
  return a.campaignName ? `${a.campaignName} ${verb}` : `Campaign ${verb}`;
}

const csvCell = (value: string | number | null | undefined): string => {
  let text = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`; // a spreadsheet would run it as a formula
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const rupeeText = (minor: number | null): string => (minor === null ? "" : `${minor < 0 ? "-" : ""}${Math.floor(Math.abs(minor) / 100)}.${String(Math.abs(minor) % 100).padStart(2, "0")}`);
const percentOf = (bps: number | null): string => (bps === null ? "" : (bps / 100).toFixed(2));

/** the Overview as CSV: the summary figures (rupees, blank = unknown) then one row per channel */
export function overviewCsv(o: PromotionOverview): string {
  const rows: Array<Array<string | number | null>> = [
    ["Measure", "Value"],
    ["Active campaigns", o.activeCampaigns],
    ["Scheduled campaigns", o.scheduledCampaigns],
    ["Draft campaigns", o.draftCampaigns],
    ["Ended campaigns", o.endedCampaigns],
    ["Campaigns with results", o.resultsCampaigns],
    ["Products on promotion", o.productsOnPromotion],
    ["Live products", o.liveProducts],
    ["Eligible products", o.eligibleProducts],
    ["Opportunities", o.opportunities],
    ["Campaigns ending within " + o.thresholds.endingSoonHours + " hours", o.endingSoonCampaigns],
    ["Next campaign ends", o.nextEndsAt ?? ""],
    ["Products in conflict", o.conflictItems],
    ["Products below the margin target", o.belowMarginTargetItems],
    ["Units sold in campaigns", o.unitsMoved],
    ["Revenue (" + o.currency + ")", rupeeText(o.revenueMinor)],
    ["Discount given (" + o.currency + ")", rupeeText(o.spendMinor)],
    ["Discount budget (" + o.currency + ")", o.budgetMinor > 0 ? rupeeText(o.budgetMinor) : ""],
    ["Contribution (" + o.currency + ")", rupeeText(o.contributionMinor)],
    ["Contribution margin %", percentOf(o.contributionBps)],
    ["Contribution basis", o.contributionBasis ? CONTRIBUTION_NOTES[o.contributionBasis] : ""],
    ["Sales lift %", percentOf(o.velocityLiftBps)],
    ["Connector limitations", o.connectorLimitations],
  ];
  const channels: Array<Array<string | number | null>> = [
    [],
    ["Marketplace", "Account", "Account status", "Promotion capability", "Active campaigns", "Scheduled campaigns", "Live products", "Listed products", "Opportunities"],
    ...o.channels.map((c) => [marketplaceLabel(c.marketplace), c.displayName, c.status, CAPABILITY_LABELS[c.capability], c.activeCampaigns, c.scheduledCampaigns, c.liveProducts, c.listedProducts, c.opportunities]),
  ];
  return [...rows, ...channels].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
