import type { VariantGridItem, VariantStockStatus, VariantLifecycle, VariantTab } from "@/types/variants";

/* ------------------------------------------------------------------ money (exact, no float drift) */

/** "499", "1,299.5", "0.05" -> integer minor units (paise). null when it is not a plain amount with at most 2 decimals. */
export function rupeesToMinor(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}

/** 49900 -> "499.00" (input value, always two decimals) */
export function minorToRupees(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const abs = Math.abs(minor);
  return `${minor < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** GST percent text <-> basis points ("18" -> 1800, "12.5" -> 1250) */
export const percentToBps = (input: string): number | null => rupeesToMinor(input);
export function bpsToPercent(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return "";
  return minorToRupees(bps).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

/* ------------------------------------------------------------------ barcode (validate, never invent) */

/** GTIN-8/12/13/14 mod-10 check digit. */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop() ?? -1;
  let sum = 0;
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}

/** true when the value is numeric with a GTIN length but its check digit does not match (a likely typo) */
export const looksLikeBadGtin = (code: string): boolean =>
  /^\d+$/.test(code) && [8, 12, 13, 14].includes(code.length) && !isValidGtin(code);

/* ------------------------------------------------------------------ labels */

export const TAB_LABELS: { id: VariantTab; label: string }[] = [
  { id: "all", label: "All variants" },
  { id: "active", label: "Active" },
  { id: "low_stock", label: "Low stock" },
  { id: "out_of_stock", label: "Out of stock" },
  { id: "draft", label: "Draft" },
  { id: "archived", label: "Archived" },
];

export const STOCK_LABEL: Record<VariantStockStatus, string> = { healthy: "In stock", low: "Low stock", out: "Out of stock" };
export const LIFECYCLE_LABEL: Record<VariantLifecycle, string> = { active: "Active", draft: "Draft", archived: "Archived" };

/** "Color: Black · Size: Cabin" (the grid sends the options in no fixed order: color, size first, then A-Z) */
export function optionSummary(values: Record<string, string>): string {
  const order = (k: string) => (k.toLowerCase() === "color" ? 0 : k.toLowerCase() === "size" ? 1 : 2);
  return Object.entries(values)
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([k, v]) => `${k.charAt(0).toUpperCase()}${k.slice(1)}: ${v}`)
    .join(" · ");
}

export const titleCase = (s: string): string => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s);

/* ------------------------------------------------------------------ CSV export (built from the grid rows) */

/** a cell is quoted when needed; a leading = + - @ is neutralised so spreadsheets do not run it as a formula */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildVariantsCsv(items: VariantGridItem[]): string {
  const optionNames = [...new Set(items.flatMap((i) => Object.keys(i.optionValues)))].sort((a, b) => a.localeCompare(b));
  const header = ["SKU", "Barcode", "Variant", ...optionNames, "MRP", "Selling price", "Available", "Low stock threshold", "Stock status", "Lifecycle", "Channels", "Lead time (days)"];
  const lines = items.map((i) =>
    [
      i.sku,
      i.barcode,
      i.name,
      ...optionNames.map((n) => i.optionValues[n] ?? ""),
      minorToRupees(i.mrpMinor),
      minorToRupees(i.sellingPriceMinor),
      i.stock.available,
      i.stock.threshold,
      STOCK_LABEL[i.stock.status],
      LIFECYCLE_LABEL[i.lifecycle],
      i.channels.map((c) => c.name).join("; "),
      i.leadTimeDays,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...lines].join("\r\n");
}

export function downloadText(fileName: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
