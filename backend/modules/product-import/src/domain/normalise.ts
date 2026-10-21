import type { CurrencyUnit } from './catalogue';

/** Value parsers of the import: spreadsheet text in, integers (minor units, basis points, grams) out. Never floats. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

const MAX_MINOR = 1_000_000_000_000; // 10,000 crore rupees

/** "1,23,456.50", "Rs. 499", "₹499/-" ... -> minor units. `paise` reads the number as already being in paise. */
export function parseMoney(text: string, unit: CurrencyUnit): Parsed<number> {
  const t = text.replace(/₹|rs\.?|inr|\/-/gi, '').replace(/[\s,]/g, '');
  if (t === '') return { ok: false, reason: 'empty' };
  if (unit === 'paise') {
    const m = /^(\d+)(?:\.0+)?$/.exec(t);
    if (!m) return { ok: false, reason: 'In paise a price must be a whole number' };
    const minor = Number(m[1]);
    return minor > MAX_MINOR ? { ok: false, reason: 'The amount is too large' } : { ok: true, value: minor };
  }
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) return { ok: false, reason: `"${text}" is not a valid amount` };
  const frac = (m[2] ?? '').replace(/0+$/, '');
  if (frac.length > 2) return { ok: false, reason: 'A price can have at most 2 decimal places' };
  const minor = Number(m[1]) * 100 + Number(frac.padEnd(2, '0'));
  return minor > MAX_MINOR ? { ok: false, reason: 'The amount is too large' } : { ok: true, value: minor };
}

/** inverse of parseMoney, used to write a suggested value back in the unit of the file */
export function formatMoney(minor: number, unit: CurrencyUnit): string {
  if (unit === 'paise') return String(minor);
  const whole = Math.floor(minor / 100);
  const frac = String(minor % 100).padStart(2, '0');
  return frac === '00' ? String(whole) : `${whole}.${frac}`;
}

export function parseCount(text: string): Parsed<number> {
  const t = text.replace(/[\s,]/g, '');
  const m = /^(\d+)(?:\.0+)?$/.exec(t);
  if (!m) return { ok: false, reason: `"${text}" is not a whole number of units` };
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? { ok: true, value: n } : { ok: false, reason: 'The number is too large' };
}

/** "12", "12%", "12.5" -> basis points */
export function parsePercentBps(text: string): Parsed<number> {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.replace(/[%\s]/g, ''));
  if (!m) return { ok: false, reason: `"${text}" is not a percentage` };
  return { ok: true, value: Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0) };
}

/** grams; "0.5 kg" and "450 g" are understood */
export function parseGrams(text: string): Parsed<number> {
  const m = /^(\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|gms|gram|grams)?$/i.exec(text.trim());
  if (!m) return { ok: false, reason: `"${text}" is not a weight` };
  const kg = /^kg/i.test(m[2] ?? '');
  const grams = Math.round(Number(m[1]) * (kg ? 1000 : 1));
  if (grams <= 0 || grams > 1_000_000) return { ok: false, reason: 'The weight must be between 1 g and 1,000 kg' };
  return { ok: true, value: grams };
}

export const splitList = (text: string, separators: RegExp): string[] => [...new Set(text.split(separators).map((s) => s.trim()).filter(Boolean))];

/** a barcode as typed in a spreadsheet: spaces removed, a numeric ".0" tail dropped */
export const cleanBarcode = (text: string): string => text.replace(/\s+/g, '').replace(/^(\d+)\.0+$/, '$1');
export const BARCODE_PATTERN = /^[0-9A-Za-z-]{6,32}$/;
export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;

/** a SKU made of the allowed characters only (runs of anything else become one dash) */
export const sanitizeSku = (text: string): string => text.trim().replace(/[^A-Za-z0-9._\-/]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 64);

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']);

/** Syntax check only: the address is never requested. Returns the reason it is unusable, or null. */
export function imageUrlProblem(text: string): string | null {
  if (text.length > 2048) return 'The URL is longer than 2048 characters';
  if (/\s/.test(text)) return 'The URL contains spaces';
  let url: URL;
  try { url = new URL(text); } catch { return 'Not a valid URL'; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Only http and https image URLs are accepted';
  if (url.username || url.password) return 'The URL must not contain a user name or password';
  if (!url.hostname) return 'The URL has no host';
  const ext = /\.([A-Za-z0-9]{2,5})$/.exec(url.pathname)?.[1]?.toLowerCase();
  if (ext && !IMAGE_EXTENSIONS.has(ext)) return `".${ext}" is not an image file type`;
  return null;
}
