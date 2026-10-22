/**
 * The listings selected in the last bulk review. The Publishing preparation screen says how many of them are a separate scope; the count
 * arrives as `?selected=<n>` on the link into the screen, or, when the link carries none, from here.
 */
export const BULK_SCOPE_KEY = "oms.listings.lastBulkSelection";

export interface BulkScope {
  count: number;
  ids: string[];
}

/** the bulk review calls this with the ids it is showing */
export function rememberBulkSelection(ids: string[]): void {
  try {
    if (ids.length === 0) sessionStorage.removeItem(BULK_SCOPE_KEY);
    else sessionStorage.setItem(BULK_SCOPE_KEY, JSON.stringify({ count: ids.length, ids: ids.slice(0, 100) }));
  } catch {
    /* storage can be unavailable (private window): the screen then shows the generic text */
  }
}

export function readBulkScope(): BulkScope | null {
  try {
    const raw = sessionStorage.getItem(BULK_SCOPE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<BulkScope>;
    return typeof v.count === "number" && v.count > 0 && Array.isArray(v.ids) ? { count: Math.floor(v.count), ids: v.ids.filter((x): x is string => typeof x === "string") } : null;
  } catch {
    return null;
  }
}

/** `?selected=18` as a positive whole number, else null */
export function selectedParam(value: string | null): number | null {
  if (!value || !/^\d{1,6}$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}
