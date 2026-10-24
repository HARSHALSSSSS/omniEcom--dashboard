/**
 * Utility helpers — pure functions, no React, no imports from components.
 * Always use these; never do formatting inline in JSX.
 */

// ---- Business formatting preferences (Settings > Regional) ----

export interface FormatPreferences {
  /** ISO 4217 code, e.g. "INR" */
  currency: string;
  /** "indian" groups 12,34,567 and abbreviates L / Cr; "international" groups 1,234,567 and abbreviates K / M / B */
  numberFormat: "indian" | "international";
  /** IANA time zone the dates are shown in */
  timezone: string;
}

const DEFAULT_PREFERENCES: FormatPreferences = { currency: "INR", numberFormat: "indian", timezone: "Asia/Kolkata" };
let preferences: FormatPreferences = DEFAULT_PREFERENCES;

/** The session layer calls this with the business settings from the shell; unknown or invalid values fall back to the defaults. */
export function setFormatPreferences(next: Partial<FormatPreferences> | null | undefined): void {
  const currency = typeof next?.currency === "string" && /^[A-Za-z]{3}$/.test(next.currency.trim()) ? next.currency.trim().toUpperCase() : DEFAULT_PREFERENCES.currency;
  const numberFormat = next?.numberFormat === "international" ? "international" : "indian";
  let timezone = DEFAULT_PREFERENCES.timezone;
  if (typeof next?.timezone === "string" && next.timezone) {
    try {
      new Intl.DateTimeFormat("en-IN", { timeZone: next.timezone });
      timezone = next.timezone;
    } catch {
      // an unknown zone keeps the default
    }
  }
  try {
    new Intl.NumberFormat("en-IN", { style: "currency", currency });
  } catch {
    preferences = { currency: DEFAULT_PREFERENCES.currency, numberFormat, timezone };
    return;
  }
  preferences = { currency, numberFormat, timezone };
}

export const getFormatPreferences = (): FormatPreferences => preferences;

const numberLocale = () => (preferences.numberFormat === "international" ? "en-US" : "en-IN");

/** the currency symbol alone (₹, $, €), as the number locale writes it */
export function currencySymbol(currency: string = preferences.currency): string {
  const part = new Intl.NumberFormat(numberLocale(), { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).formatToParts(0).find((p) => p.type === "currency");
  return part?.value ?? currency;
}

// ---- Currency / numbers ----

/**
 * Format an integer minor-unit value (paise for INR) as the business currency, grouped by the business number format.
 * E.g. 284000 paise → ₹2,840 or 28400000 paise → ₹2.84L
 */
export function formatINR(paise: number, compact = false): string {
  const rupees = paise / 100;
  if (compact) {
    return formatLakh(rupees);
  }
  // whole rupees stay short (₹2,500); a price with paise shows them (₹2,499.50) so nothing is silently rounded
  const hasPaise = Math.abs(paise) % 100 !== 0;
  return new Intl.NumberFormat(numberLocale(), {
    style: "currency",
    currency: preferences.currency,
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(rupees);
}

/**
 * Format an amount in compact notation: lakh / crore (₹2.84L, ₹1Cr) for the Indian number format,
 * thousand / million / billion (₹284K, ₹2.84M) for the international one.
 */
export function formatLakh(rupees: number): string {
  const symbol = currencySymbol();
  if (preferences.numberFormat === "international") {
    if (rupees >= 1_000_000_000) return `${symbol}${(rupees / 1_000_000_000).toFixed(2)}B`;
    if (rupees >= 1_000_000) return `${symbol}${(rupees / 1_000_000).toFixed(2)}M`;
    if (rupees >= 1_000) return `${symbol}${(rupees / 1_000).toFixed(1)}K`;
    return `${symbol}${rupees.toFixed(0)}`;
  }
  if (rupees >= 1_00_00_000) {
    return `${symbol}${(rupees / 1_00_00_000).toFixed(2)}Cr`;
  }
  if (rupees >= 1_00_000) {
    return `${symbol}${(rupees / 1_00_000).toFixed(2)}L`;
  }
  if (rupees >= 1_000) {
    return `${symbol}${(rupees / 1_000).toFixed(1)}K`;
  }
  return `${symbol}${rupees.toFixed(0)}`;
}

/**
 * Format an integer minor-unit amount in any currency (an order or return can be in a currency other than the business one),
 * grouped by the business number format. The business currency goes through formatINR so paise rules stay in one place.
 */
export function formatCurrency(minor: number, currency?: string | null): string {
  const code = (currency ?? "").trim().toUpperCase();
  if (!code || code === preferences.currency) return formatINR(minor);
  try {
    return new Intl.NumberFormat(numberLocale(), { style: "currency", currency: code }).format(minor / 100);
  } catch {
    return formatINR(minor);
  }
}

/**
 * Format a plain number with the business grouping (12,34,567 Indian, 1,234,567 international).
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(numberLocale()).format(value);
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

/**
 * Format an ISO UTC timestamp to DD/MM/YYYY in the business time zone (IST until the settings say otherwise).
 * E.g. "2026-10-15T06:00:00Z" → "15/10/2026"
 */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(IST_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: preferences.timezone,
  }).format(new Date(iso));
}

/**
 * Format as DD/MM/YYYY HH:MM in the business time zone.
 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(IST_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: preferences.timezone,
  }).format(new Date(iso));
}

/**
 * Format an ISO timestamp with your own Intl options (e.g. "21 Oct, 10:57 am") in the business time zone.
 */
export function formatInZone(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(IST_LOCALE, { ...options, timeZone: preferences.timezone }).format(new Date(iso));
}

/**
 * Format as relative time — "2 min ago", "3 days ago".
 */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  // a moment still ahead of us ("Expires in 7d"), not "just now"
  if (diffMs <= -60_000) {
    const ahead = Math.floor(-diffMs / 60_000);
    if (ahead < 60) return `in ${ahead} min`;
    const aheadHr = Math.floor(ahead / 60);
    if (aheadHr < 24) return `in ${aheadHr}h`;
    const aheadDay = Math.floor(aheadHr / 24);
    if (aheadDay < 7) return `in ${aheadDay}d`;
    return formatDate(iso);
  }
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
