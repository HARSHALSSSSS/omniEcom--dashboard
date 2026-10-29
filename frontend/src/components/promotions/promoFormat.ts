import { currencySymbol, formatCurrency, formatInZone, getFormatPreferences } from "@/utils/format";
import type { CampaignPrefill, PromotionCampaignRow, CandidateQuick, CandidateSort, CandidateStatus, ChannelCapability, ContributionBasis, Eligibility, PromotionCampaign, PromotionCandidate, PromotionThresholds, PromotionItemStatus, PromotionLifecycleAction, PromotionOverview, PromotionStatus, PromotionType } from "@/types/promotions";

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
  const parts = t.split(".");
  if (parts.length > 2 || parts.length === 0) return null;
  const [whole, frac] = parts;
  if (!whole || !/^\d{1,9}$/.test(whole)) return null;
  if (frac !== undefined && !/^\d{1,2}$/.test(frac)) return null;
  return Number(whole) * 100 + Number((frac ?? "").padEnd(2, "0") || "0");
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
  const parts = t.split(".");
  if (parts.length > 2 || parts.length === 0) return null;
  const [whole, frac] = parts;
  if (!whole || !/^\d{1,3}$/.test(whole)) return null;
  if (frac !== undefined && !/^\d{1,2}$/.test(frac)) return null;
  return Number(whole) * 100 + Number((frac ?? "").padEnd(2, "0") || "0");
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

// ---------------------------------------------------------------------------- Products tab (candidates)

export const candidateKey = (c: { variantId: string; accountId: string }): string => `${c.variantId}|${c.accountId}`;

export const ELIGIBILITY_LABELS: Record<Eligibility, string> = {
  eligible: "Eligible",
  margin_risk: "Margin risk",
  low_inventory: "Low inventory",
  verification_required: "Cost price needed",
  not_provided: "Not provided",
  conflict: "Conflict",
};

export const ELIGIBILITY_TONE: Record<Eligibility, string> = {
  eligible: "border-emerald-500/30 bg-emerald-50 text-emerald-700",
  margin_risk: "border-amber-500/30 bg-amber-50 text-amber-700",
  low_inventory: "border-amber-500/30 bg-amber-50 text-amber-700",
  verification_required: "border-amber-500/30 bg-amber-50 text-amber-700",
  not_provided: "border-red-500/30 bg-red-50 text-red-700",
  conflict: "border-red-500/30 bg-red-50 text-red-700",
};

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  recommended: "Recommended",
  review: "Review",
  not_selected: "Not selected",
  connector_unavailable: "Connector unavail.",
};

export const CANDIDATE_STATUS_TONE: Record<CandidateStatus, string> = {
  recommended: "border-blue-500/30 bg-blue-50 text-blue-700",
  review: "border-amber-500/30 bg-amber-50 text-amber-700",
  not_selected: "text-muted-foreground",
  connector_unavailable: "border-red-500/30 bg-red-50 text-red-700",
};

export const CANDIDATE_SORT_LABELS: Record<CandidateSort, string> = {
  priority: "Recommended first",
  sales: "Most sold (30 days)",
  margin: "Highest margin",
  stock: "Most stock",
  name: "Name",
};

const pctText = (bps: number): string => `${Number.isInteger(bps / 100) ? bps / 100 : (Math.round(bps / 10) / 10).toFixed(1)}%`;
export const percentLabel = pctText;

/** the label of a quick filter, with the real threshold the server uses (none until the thresholds are loaded) */
export function quickFilterLabel(id: CandidateQuick, t: PromotionThresholds | undefined): string {
  switch (id) {
    case "high_margin":
      return t ? `High margin (${pctText(t.highMarginBps)} or more)` : "High margin";
    case "strong_sellers":
      return t ? `Strong sellers (${t.strongSellerUnits30d}+ in 30 days)` : "Strong sellers";
    case "eligible":
      return "Promotion eligible";
    case "high_inventory":
      return t ? `High inventory (${t.highInventoryUnits}+ available)` : "High inventory";
    case "not_in_campaign":
      return "Not in a campaign";
  }
}

/**
 * A discount to start from for the picked products: 10%, lowered to the deepest discount that still keeps the margin target on every
 * product where that is known (rounded down to a whole percent). null when nothing is known or no discount keeps the target.
 */
export function suggestedDiscountBps(rows: Array<{ maxDiscountBps: number | null }>): number | null {
  const known = rows.map((r) => r.maxDiscountBps).filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  const whole = Math.floor(Math.min(...known) / 100) * 100;
  const pick = Math.min(1000, whole);
  return pick >= 100 ? pick : null;
}

/** the product-and-channel table as CSV: rupees, blank = unknown (no cost price, no fee profile, no target) */
export function candidatesCsv(rows: PromotionCandidate[]): string {
  const head = ["Product", "SKU", "Marketplace", "Channel", "Regular price", "Cost price", "Fees at regular price", "Margin %", "Target margin %", "Deepest discount keeping the target %", "Available stock", "Low stock", "Units sold (30 days)", "Existing campaign", "Conflicts", "Promotion status", "Eligibility", "Why"];
  const lines = rows.map((r) =>
    [
      r.productName,
      r.sku,
      marketplaceLabel(r.marketplace),
      r.channel,
      rupeeText(r.regularPriceMinor),
      rupeeText(r.unitCostMinor),
      rupeeText(r.feesMinor),
      percentOf(r.marginBps),
      percentOf(r.targetMarginBps),
      percentOf(r.maxDiscountBps),
      r.availableStock,
      r.lowStock ? "yes" : "no",
      r.unitsSold30d,
      r.existingCampaign ? `${r.existingCampaign.name} (${r.existingCampaign.status})` : "",
      r.conflicts.map((c) => c.message).join("; "),
      CANDIDATE_STATUS_LABELS[r.promotionStatus],
      ELIGIBILITY_LABELS[r.eligibility],
      r.eligibilityReason ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.map(csvCell).join(","), ...lines].join("\r\n");
}

/** what the Create Campaign dialog starts from for products of ONE channel: the real variants and prices, the channel, a margin-safe discount */
export function prefillFor(rows: PromotionCandidate[]): CampaignPrefill {
  return {
    accountId: rows[0]?.accountId ?? null,
    variants: rows.map((r) => ({ id: r.variantId, productId: r.productId, sku: r.sku, productTitle: r.productName, optionValues: {}, sellingPriceMinor: r.regularPriceMinor, status: "active" as const })),
    discountBps: suggestedDiscountBps(rows),
  };
}

// ---------------------------------------------------------------------------- Campaigns tab

/** the campaign list as CSV: rupees, blank = unknown (no cost price, nothing sold) */
export function campaignsCsv(rows: PromotionCampaignRow[]): string {
  const head = ["Campaign", "Code", "Status", "Type", "Discount", "Average discount %", "Channels", "Starts", "Ends", "Products", "Live", "Cannot run", "Units sold", "Revenue", "Discount given", "Budget", "Contribution", "Contribution margin %", "Below margin target", "Without cost price", "In conflict"];
  const lines = rows.map((c) =>
    [
      c.name,
      c.code,
      STATUS_LABELS[c.status],
      TYPE_LABELS[c.type],
      describeTerms(c),
      percentOf(c.avgDiscountBps),
      c.channels.map((ch) => ch.displayName).join("; "),
      c.startsAt ?? "",
      c.endsAt ?? "",
      c.itemCounts.total,
      c.itemCounts.live,
      c.itemCounts.ineligible,
      c.unitsMoved,
      rupeeText(c.revenueMinor),
      rupeeText(c.spendMinor),
      c.budgetMinor > 0 ? rupeeText(c.budgetMinor) : "",
      rupeeText(c.contributionMinor),
      percentOf(c.contributionBps),
      c.marginRisk ? c.marginRisk.belowTarget : "",
      c.marginRisk ? c.marginRisk.unknownCost : "",
      c.marginRisk ? c.marginRisk.conflicts : "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.map(csvCell).join(","), ...lines].join("\r\n");
}
