import { formatINR, getFormatPreferences } from "@/utils/format";
import type { Basis, Completeness, DateRange, RangePreset, SpendRow, Waterfall } from "@/types/profitability";

export const DASH = "—";
export const MAX_RANGE_DAYS = 366;
export const WRITE_REASON = "Recording advertising spend needs the pricing:write permission.";
const DAY = 86_400_000;

// ---- money ----

/** integer minor units as the business currency; null is "not known" and reads as an em dash, never as 0 */
export const money = (minor: number | null | undefined): string => (minor === null || minor === undefined ? DASH : formatINR(minor));

export const percent = (value: number | null | undefined, decimals = 1): string => (value === null || value === undefined ? DASH : `${value.toFixed(decimals)}%`);

/** signed change with an explicit plus, e.g. +12.4% */
export const signed = (value: number | null | undefined, unit: "%" | " pts"): string => (value === null || value === undefined ? DASH : `${value > 0 ? "+" : ""}${value.toFixed(1)}${unit}`);

export const coveragePercent = (coverage: number): string => `${Math.round(coverage * 100)}%`;

/** what the amount field shows when editing a row: whole rupees stay short, paise show two decimals */
export function minorToInput(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

/** "1,250.50" or "1250.5" in rupees to integer paise; null when it is not a plain amount with at most two decimals */
export function inputToMinor(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

// ---- dates (the API reads and writes UTC calendar days) ----

export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const dayMs = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
export const isRealDay = (iso: string | undefined | null): iso is string => Boolean(iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(dayMs(iso)) && isoDay(new Date(dayMs(iso))) === iso);
export const addDays = (iso: string, n: number): string => isoDay(new Date(dayMs(iso) + n * DAY));
export const spanDays = (r: DateRange): number => Math.round((dayMs(r.to) - dayMs(r.from)) / DAY) + 1;

export const PRESET_LABELS: Record<RangePreset, string> = {
  "30d": "Last 30 days",
  mtd: "This month",
  last_month: "Last month",
  "90d": "Last 90 days",
  ytd: "Year to date",
  custom: "Custom",
};

/** the real from/to of a preset, relative to `today` (a UTC day); a custom range comes from the URL */
export function presetRange(preset: Exclude<RangePreset, "custom">, today: string): DateRange {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  switch (preset) {
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "mtd":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "ytd":
      return { from: `${y}-01-01`, to: today };
    case "last_month": {
      const first = new Date(Date.UTC(y, m - 2, 1));
      return { from: isoDay(first), to: isoDay(new Date(Date.UTC(y, m - 1, 0))) };
    }
  }
}

/** why a custom range cannot be sent, or null when it is fine */
export function rangeProblem(from: string | undefined, to: string | undefined): string | null {
  if (!isRealDay(from) || !isRealDay(to)) return "Pick a start and an end date.";
  if (from > to) return "The start date must not be after the end date.";
  if (spanDays({ from, to }) > MAX_RANGE_DAYS) return `A range is at most ${MAX_RANGE_DAYS} days.`;
  return null;
}

export function rangeLabel(r: DateRange): string {
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return r.from === r.to ? fmt(r.from) : `${fmt(r.from)} to ${fmt(r.to)}`;
}

// ---- wording ----

export const BASIS_LABELS: Record<Basis, string> = { actual: "Actual", estimated: "Estimated", missing: "Missing" };
export const BASIS_TONE: Record<Basis, string> = {
  actual: "border-emerald-200 bg-emerald-50 text-emerald-800",
  estimated: "border-amber-200 bg-amber-50 text-amber-900",
  missing: "border-red-200 bg-red-50 text-red-800",
};

const MISSING_LABELS: Record<string, string> = {
  productCost: "product cost",
  shipping: "shipping cost",
  marketplaceFees: "marketplace fees",
  penalties: "penalties",
  advertising: "advertising spend",
};
export const missingLabel = (key: string): string => MISSING_LABELS[key] ?? key;
export const missingList = (keys: string[]): string => keys.map(missingLabel).join(", ");

export const COMPLETENESS_LABELS: Record<Completeness, string> = { complete: "Complete", estimated: "Estimated", incomplete: "Incomplete" };

/** where to fix a missing cost: advertising is recorded on this screen, the rest on products and orders */
export const MISSING_HELP: Record<string, string> = {
  productCost: "Set a cost price on your products.",
  shipping: "Courier costs are recorded on shipments.",
  marketplaceFees: "Enter fees on orders or set a fee profile in Pricing.",
  penalties: "Penalties come from the order financials.",
  advertising: "Record advertising spend below (a 0 confirms there were no ads).",
};

// ---- CSV ----

/** one field: quoted when needed, and a leading = + - @ is neutralised so a spreadsheet never runs it as a formula */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: Array<string | number | null | undefined>): string => cells.map(csvField).join(",");
const rupees = (minor: number | null | undefined): string => (minor === null || minor === undefined ? "" : (minor / 100).toFixed(2));
const numberOrBlank = (n: number | null | undefined): number | string => (n === null || n === undefined ? "" : n);

/** the waterfall as a CSV: one line per step, signed amounts in major units, blanks for unknown amounts */
export function waterfallCsv(w: Waterfall): string {
  const cur = getFormatPreferences().currency;
  const compare = w.comparison !== null;
  const head = ["Step", `Amount (${cur})`, "Basis", "Known for (%)", "Share of revenue (%)"];
  if (compare) head.push(`Previous period (${cur})`, "Change (%)");
  const lines = [row(["Profitability", `${w.range.from} to ${w.range.to}`]), w.comparison ? row(["Compared with", `${w.comparison.range.from} to ${w.comparison.range.to}`]) : "", row(head)].filter((l) => l !== "");
  for (const s of w.steps) {
    const cells: Array<string | number | null> = [s.label, rupees(s.amountMinor), s.basis, Math.round(s.coverage * 100), numberOrBlank(s.shareOfRevenuePercent)];
    if (compare) cells.push(rupees(s.previousAmountMinor ?? null), numberOrBlank(s.change?.changePercent));
    lines.push(row(cells));
  }
  if (w.netContributionMinor === null) lines.push(row(["Revenue minus known costs (not a profit figure)", rupees(w.knownPartMinor), "", "", ""]), row(["Missing", missingList(w.missing)]));
  return `${lines.join("\r\n")}\r\n`;
}

/** the per-marketplace table as a CSV */
export function channelsCsv(w: Waterfall): string {
  const cur = getFormatPreferences().currency;
  const head = ["Channel", "Orders", `Gross revenue (${cur})`, `Product cost (${cur})`, `Marketplace fees (${cur})`, `Shipping (${cur})`, `Returns and refunds (${cur})`, `Advertising (${cur})`, `Net profit (${cur})`, "Net margin (%)", "Missing"];
  const lines = [row(["Channels", `${w.range.from} to ${w.range.to}`]), row(head)];
  for (const c of w.channels) {
    lines.push(row([c.label, c.orders, rupees(c.grossRevenue.amountMinor), rupees(c.cogs.amountMinor), rupees(c.marketplaceFees.amountMinor), rupees(c.shippingCosts.amountMinor), rupees(c.returnsImpact.amountMinor), rupees(c.advertisingSpend.amountMinor), rupees(c.netProfitMinor), numberOrBlank(c.netMarginPercent), missingList(c.missing)]));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export const csvBlob = (text: string): Blob => new Blob(["﻿", text], { type: "text/csv;charset=utf-8" });
export const waterfallFileName = (w: Waterfall): string => `profitability-waterfall-${w.range.from}_to_${w.range.to}.csv`;
export const channelsFileName = (w: Waterfall): string => `profitability-channels-${w.range.from}_to_${w.range.to}.csv`;

export const spendAccountLabel = (r: Pick<SpendRow, "accountName" | "marketplace">): string => r.accountName ?? "Not tied to an account";
