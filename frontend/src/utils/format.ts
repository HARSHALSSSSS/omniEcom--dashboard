/**
 * Utility helpers — pure functions, no React, no imports from components.
 * Always use these; never do formatting inline in JSX.
 */

// ---- Currency / numbers ----

/**
 * Format an integer paise value as INR with lakh/crore grouping.
 * E.g. 284000 paise → ₹2,840 or 28400000 paise → ₹2.84L
 */
export function formatINR(paise: number, compact = false): string {
  const rupees = paise / 100;
  if (compact) {
    return formatLakh(rupees);
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rupees);
}

/**
 * Format a rupee number in compact lakh/crore notation.
 * E.g. 284000 → ₹2.84L | 10000000 → ₹1Cr
 */
export function formatLakh(rupees: number): string {
  if (rupees >= 1_00_00_000) {
    return `₹${(rupees / 1_00_00_000).toFixed(2)}Cr`;
  }
  if (rupees >= 1_00_000) {
    return `₹${(rupees / 1_00_000).toFixed(2)}L`;
  }
  if (rupees >= 1_000) {
    return `₹${(rupees / 1_000).toFixed(1)}K`;
  }
  return `₹${rupees.toFixed(0)}`;
}

/**
 * Format a plain number with en-IN grouping (e.g. 12,34,567).
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

/**
 * Format a percentage (0–100).
 * E.g. formatPercent(4.8) → "4.8%"
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a delta value with sign, used for KPI change indicators.
 * E.g. formatDelta(12) → "+12%" | formatDelta(-3.5) → "-3.5%"
 */
export function formatDelta(value: number, decimals = 1): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(decimals)}%`;
}

/**
 * Returns Tailwind class for a delta — green for positive, red for negative.
 */
export function deltaClass(value: number): string {
  if (value > 0) return "text-green-600";
  if (value < 0) return "text-red-600";
  return "text-muted-foreground";
}

// ---- Dates ----

const IST_LOCALE = "en-IN";
const IST_TZ = "Asia/Kolkata";

/**
 * Format an ISO UTC timestamp to DD/MM/YYYY in IST.
 * E.g. "2026-10-15T06:00:00Z" → "15/10/2026"
 */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(IST_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: IST_TZ,
  }).format(new Date(iso));
}

/**
 * Format as DD/MM/YYYY HH:MM in IST.
 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(IST_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: IST_TZ,
  }).format(new Date(iso));
}

/**
 * Format as relative time — "2 min ago", "3 days ago".
 */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(iso);
}

/**
 * Format a duration in minutes to "2h 15m" style.
 */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ---- String helpers ----

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert snake_case or kebab-case to "Title Case".
 */
export function toTitleCase(str: string): string {
  return str
    .replace(/[_-]/g, " ")
    .split(" ")
    .map((word) => capitalize(word))
    .join(" ");
}

/**
 * Truncate a string to maxLength, adding ellipsis.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}
