/**
 * Integer money helpers for the report files. Amounts are minor units (paise) all the way to the file: they are turned into
 * text with integer arithmetic only, so no float ever touches a rupee value.
 */

/** 123456 -> "1234.56"; -5 -> "-0.05" */
export function formatMinor(minor: number): string {
  const v = Math.trunc(minor);
  const abs = Math.abs(v);
  return `${v < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Indian digit grouping for printed documents: 1234567.5 -> "12,34,567.50" */
export function formatMinorIndian(minor: number): string {
  const [whole, frac] = formatMinor(minor).split('.') as [string, string];
  const neg = whole.startsWith('-');
  const digits = neg ? whole.slice(1) : whole;
  const head = digits.slice(0, -3);
  const grouped = (head ? head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + digits.slice(-3);
  return `${neg ? '-' : ''}${grouped}.${frac}`;
}

/** basis points as a percent with two decimals: 1800 -> "18.00" */
export function formatBps(bps: number): string {
  const v = Math.trunc(bps);
  const abs = Math.abs(v);
  return `${v < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** basis points as the decimal fraction a spreadsheet percent cell stores: 1800 -> "0.1800" */
export function bpsFraction(bps: number): string {
  const v = Math.trunc(bps);
  const abs = Math.abs(v);
  return `${v < 0 ? '-' : ''}${Math.floor(abs / 10_000)}.${String(abs % 10_000).padStart(4, '0')}`;
}

/**
 * Split `total` into integer parts proportional to `weights` so that the parts add up to `total` exactly (largest remainder, ties go to
 * the earlier part). All-zero weights put everything on the first part. BigInt inside: no overflow for large amounts.
 */
export function splitProportional(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((s, w) => s + BigInt(Math.max(0, Math.trunc(w))), 0n);
  if (sum === 0n) return weights.map((_, i) => (i === 0 ? total : 0));
  const t = BigInt(Math.trunc(total));
  const sign = t < 0n ? -1n : 1n;
  const abs = t * sign;
  const parts = weights.map((w) => (abs * BigInt(Math.max(0, Math.trunc(w)))) / sum);
  const rems = weights.map((w, i) => ({ i, r: (abs * BigInt(Math.max(0, Math.trunc(w)))) % sum }));
  let left = abs - parts.reduce((s, p) => s + p, 0n);
  rems.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of rems) {
    if (left <= 0n) break;
    parts[i]! += 1n;
    left -= 1n;
  }
  return parts.map((p) => Number(p * sign));
}

/** GST on an intra-state supply is half central, half state; the odd paisa (if any) goes to the state share. */
export function splitHalf(taxMinor: number): { cgst: number; sgst: number } {
  const cgst = Math.floor(taxMinor / 2);
  return { cgst, sgst: taxMinor - cgst };
}

/** round(a * b / c) for non-negative integers, half up, exact (BigInt inside); 0 when c is 0 */
export function mulDivRound(a: number, b: number, c: number): number {
  if (c === 0) return 0;
  const [A, B, C] = [BigInt(Math.trunc(a)), BigInt(Math.trunc(b)), BigInt(Math.trunc(c))];
  return Number((A * B * 2n + C) / (2n * C));
}
