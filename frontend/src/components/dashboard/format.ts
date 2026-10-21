import { format, formatDistanceToNow, parseISO, subDays } from "date-fns";
import { formatDelta, formatINR, formatNumber, formatPercent } from "@/utils/format";
import type { DashboardMetric } from "@/types/dashboard";

const DEFAULT_TZ = "Asia/Kolkata";

/** hour of the day (0-23) in the business time zone */
export function hourIn(timeZone: string | undefined, at: Date): number {
  const zone = timeZone ?? DEFAULT_TZ;
  try {
    const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: zone })
      .formatToParts(at)
      .find((p) => p.type === "hour")?.value;
    return Number(h);
  } catch {
    return at.getHours();
  }
}

export function greetingFor(firstName: string | null, timeZone: string | undefined, at: Date = new Date()): string {
  const hour = hourIn(timeZone, at);
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return firstName ? `Good ${part}, ${firstName}.` : `Good ${part}.`;
}

/** "2026-10-05" (a calendar day, no zone) -> "Oct 5, 2026" */
export function formatDay(day: string): string {
  return format(parseISO(day), "MMM d, yyyy");
}

/** "2026-10-05" -> "Oct 5" */
export function formatShortDay(day: string): string {
  return format(parseISO(day), "MMM d");
}

export function shiftDay(day: string, days: number): string {
  return format(subDays(parseISO(day), days), "yyyy-MM-dd");
}

export function relativeTime(iso: string): string {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true });
}

/** revenue: exact rupees while small, lakh / crore notation once it is large */
export function formatMoney(minor: number): string {
  return formatINR(minor, Math.abs(minor) >= 1_00_00_000);
}

/** compact money for chart axes and the channel split */
export const formatMoneyCompact = (minor: number): string => formatINR(minor, true);

/** the big number of a snapshot tile */
export function metricValue(m: DashboardMetric): string {
  switch (m.key) {
    case "revenueMinor":
      return formatMoney(m.value);
    case "returnRatePct":
      return formatPercent(m.value);
    default:
      return formatNumber(m.value);
  }
}

/** the small line under the number: today against yesterday, as the API computes it */
export function metricChange(m: DashboardMetric): string {
  if (m.key === "lowStockProducts") return m.note === "needs_review" ? "Needs review" : "No action needed";
  if (m.changePct === null) return "No data yesterday to compare";
  return `${formatDelta(m.changePct)} vs yesterday`;
}

export const plural = (n: number, one: string, many = `${one}s`): string => `${formatNumber(n)} ${n === 1 ? one : many}`;
