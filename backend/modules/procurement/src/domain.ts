/**
 * Pure procurement rules: GSTIN shape, money maths in minor units, PO numbers, status vocabulary and the supplier scorecard.
 * No I/O here, so every rule is unit tested without a database.
 */
export const OPEN_PO_STATUSES = ['submitted', 'acknowledged', 'partially_received'] as const;
/** statuses that still owe goods (a draft is not yet an order) */
export const RECEIVABLE_STATUSES: readonly string[] = OPEN_PO_STATUSES;
/** a supplier cannot be removed while any of these exist */
export const BLOCKING_PO_STATUSES = ['draft', ...OPEN_PO_STATUSES] as const;
export const CANCELLABLE_STATUSES: readonly string[] = ['draft', ...OPEN_PO_STATUSES];

/** 15 characters: state code (01-38, 97, 99), PAN, entity number, Z, check character */
export const GSTIN_PATTERN = /^(0[1-9]|[12][0-9]|3[0-8]|97|99)[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const isGstin = (v: string): boolean => GSTIN_PATTERN.test(v);

/** a supplier needs this many fully received POs before its scorecard says anything (fewer = noise, shown as null) */
export const MIN_DELIVERIES_FOR_SCORE = 3;

const DAY_MS = 86_400_000;

export interface LineAmounts { totalMinor: number; taxMinor: number }

/** line total excludes tax; tax is the GST on it rounded half up to the paisa (BigInt: quantity x cost can pass 2^53 x rate) */
export function lineAmounts(quantity: number, unitCostMinor: number, taxRateBps: number): LineAmounts {
  const total = BigInt(quantity) * BigInt(unitCostMinor);
  const tax = (total * BigInt(taxRateBps) + 5000n) / 10_000n;
  return { totalMinor: Number(total), taxMinor: Number(tax) };
}

export interface PoTotals { subtotalMinor: number; taxMinor: number; shippingMinor: number; totalMinor: number }
export function poTotals(lines: LineAmounts[], shippingMinor: number): PoTotals {
  const subtotalMinor = lines.reduce((s, l) => s + l.totalMinor, 0);
  const taxMinor = lines.reduce((s, l) => s + l.taxMinor, 0);
  return { subtotalMinor, taxMinor, shippingMinor, totalMinor: subtotalMinor + taxMinor + shippingMinor };
}

export const formatPoNumber = (year: number, sequence: number): string => `PO-${year}-${String(sequence).padStart(4, '0')}`;

/** supplier code from the name when the user gives none: SUP-<three letters>-<nn> */
export function supplierCodeFor(name: string, sequence: number): string {
  const letters = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
  return `SUP-${letters}-${String(sequence).padStart(2, '0')}`;
}

/** end of the UTC day an order was expected: a delivery up to then is on time */
export const onTimeDeadline = (expectedAt: Date): Date => new Date(Math.floor(expectedAt.getTime() / DAY_MS) * DAY_MS + DAY_MS - 1);
export const isOnTime = (expectedAt: Date | null, receivedAt: Date): boolean => expectedAt === null || receivedAt.getTime() <= onTimeDeadline(expectedAt).getTime();

export interface DeliveryStats { delivered: number; onTime: number; unitsReceived: number; unitsDamaged: number }
export interface Scorecard { onTimeRatePercent: number | null; rating: number | null }

/**
 * Scorecard from REAL deliveries only. On-time rate = share of fully received POs delivered by the expected day.
 * Rating (0-5, one decimal) = 5 x (70% on-time rate + 30% undamaged share of the received units). Fewer than
 * MIN_DELIVERIES_FOR_SCORE deliveries -> both null: no invented numbers.
 */
export function scorecard(s: DeliveryStats): Scorecard {
  if (s.delivered < MIN_DELIVERIES_FOR_SCORE) return { onTimeRatePercent: null, rating: null };
  const onTime = s.onTime / s.delivered;
  const undamaged = s.unitsReceived > 0 ? 1 - s.unitsDamaged / s.unitsReceived : 1;
  return { onTimeRatePercent: Math.round(onTime * 1000) / 10, rating: Math.round(5 * (0.7 * onTime + 0.3 * undamaged) * 10) / 10 };
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** what a PO line still owes */
export const outstanding = (l: { quantityOrdered: number; quantityReceived: number }): number => Math.max(0, l.quantityOrdered - l.quantityReceived);

export const isLate = (status: string, expectedAt: Date | null, now = new Date()): boolean =>
  (OPEN_PO_STATUSES as readonly string[]).includes(status) && expectedAt !== null && now.getTime() > onTimeDeadline(expectedAt).getTime();

export function nextStatusAfterReceipt(lines: Array<{ quantityOrdered: number; quantityReceived: number }>): 'received' | 'partially_received' {
  return lines.every((l) => l.quantityReceived >= l.quantityOrdered) ? 'received' : 'partially_received';
}

/** a user id (or api key id) is a uuid; anything else must not end up in a uuid column */
export const asUuid = (id: string | null | undefined): string | null => (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null);
