/** Pure return rules: the state machine, reason catalogue and what a disposition does to stock. */
export const RETURN_STATUSES = ['requested', 'approved', 'rejected', 'pickup_scheduled', 'picked_up', 'in_transit', 'received', 'inspecting', 'completed', 'cancelled'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const TRANSITIONS: Record<ReturnStatus, readonly ReturnStatus[]> = {
  requested: ['approved', 'rejected', 'cancelled'],
  approved: ['pickup_scheduled', 'picked_up', 'in_transit', 'received', 'cancelled'],
  pickup_scheduled: ['picked_up', 'approved', 'cancelled'],
  picked_up: ['in_transit', 'received'],
  in_transit: ['received'],
  received: ['inspecting', 'completed'],
  inspecting: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
};
export const canMove = (from: ReturnStatus, to: ReturnStatus): boolean => TRANSITIONS[from].includes(to);
/** states in which goods can still be received */
export const RECEIVABLE: readonly ReturnStatus[] = ['approved', 'pickup_scheduled', 'picked_up', 'in_transit', 'received'];
/** states that still "use up" the quantity of an order line (a rejected/cancelled return does not) */
export const ACTIVE: readonly ReturnStatus[] = ['requested', 'approved', 'pickup_scheduled', 'picked_up', 'in_transit', 'received', 'inspecting', 'completed'];

export const RETURN_REASONS = [
  { code: 'damaged_in_transit', label: 'Arrived damaged', sources: ['customer', 'marketplace'] },
  { code: 'defective', label: 'Defective / not working', sources: ['customer', 'marketplace'] },
  { code: 'wrong_item_sent', label: 'Wrong item received', sources: ['customer', 'marketplace'] },
  { code: 'not_as_described', label: 'Not as described', sources: ['customer', 'marketplace'] },
  { code: 'size_fit', label: 'Size / fit issue', sources: ['customer', 'marketplace'] },
  { code: 'changed_mind', label: 'Customer changed their mind', sources: ['customer', 'marketplace'] },
  { code: 'late_delivery', label: 'Delivered too late', sources: ['customer', 'marketplace'] },
  { code: 'undeliverable', label: 'Could not be delivered (RTO)', sources: ['rto'] },
  { code: 'recall', label: 'Recalled by the seller', sources: ['seller'] },
  { code: 'other', label: 'Other', sources: ['customer', 'marketplace', 'seller', 'rto'] },
] as const;

export type Disposition = 'restock' | 'damaged' | 'dispose' | 'return_to_vendor' | 'quarantine' | 'rejected' | 'repair';
export type StockEffectKind = 'to_onhand' | 'to_damaged' | 'leave' | 'to_quarantine' | 'none';
/**
 * what an inspection decision does to the stock buckets (units are in `returned` until decided).
 * `strictQuarantine` (the dashboard disposition flow): quarantine really moves the units into the quarantined bucket. The legacy
 * `inspect` endpoint keeps its old meaning (quarantine = leave the units in `returned`, decide later).
 */
export function stockEffect(d: Disposition, strictQuarantine = false): { kind: StockEffectKind; final: boolean; reason: string } {
  switch (d) {
    case 'restock': return { kind: 'to_onhand', final: true, reason: 'restocked' };
    case 'damaged': return { kind: 'to_damaged', final: true, reason: 'damaged' };
    case 'dispose': case 'return_to_vendor': return { kind: 'leave', final: true, reason: d };
    case 'rejected': return { kind: 'leave', final: true, reason: 'rejected' };
    case 'repair': return { kind: 'to_quarantine', final: true, reason: 'repair' };
    case 'quarantine': return strictQuarantine ? { kind: 'to_quarantine', final: true, reason: 'quarantine' } : { kind: 'none', final: false, reason: 'quarantine' };
  }
}

/** the six choices of the design -> what is stored */
export const DISPOSITION_KINDS = ['sellable', 'damaged', 'rejected', 'quarantine', 'repair', 'write_off'] as const;
export type DispositionKind = (typeof DISPOSITION_KINDS)[number];
export const KIND_TO_STORED: Record<DispositionKind, Disposition> = { sellable: 'restock', damaged: 'damaged', rejected: 'rejected', quarantine: 'quarantine', repair: 'repair', write_off: 'dispose' };
export const STORED_TO_KIND: Record<Disposition, DispositionKind | 'return_to_vendor'> = { restock: 'sellable', damaged: 'damaged', rejected: 'rejected', quarantine: 'quarantine', repair: 'repair', dispose: 'write_off', return_to_vendor: 'return_to_vendor' };
export const DISPOSITION_OPTIONS: Array<{ kind: DispositionKind; label: string; description: string }> = [
  { kind: 'sellable', label: 'Return to sellable stock', description: 'Suitable for resale' },
  { kind: 'damaged', label: 'Damaged', description: 'Keep out of sellable stock' },
  { kind: 'rejected', label: 'Rejected', description: 'Do not accept into stock' },
  { kind: 'quarantine', label: 'Quarantine', description: 'Hold until further review' },
  { kind: 'repair', label: 'Repair', description: 'Repair before resale' },
  { kind: 'write_off', label: 'Write-off', description: 'Should not return to inventory' },
];
/** the item condition recorded for a disposition chosen through the dashboard */
export const CONDITION_FOR_KIND: Record<DispositionKind, 'sellable' | 'damaged' | 'defective'> = { sellable: 'sellable', damaged: 'damaged', rejected: 'damaged', quarantine: 'sellable', repair: 'defective', write_off: 'damaged' };

export const INSPECTION_RESULTS = ['pass', 'fail', 'needs_review'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];
export const RESULT_TO_STATUS: Record<InspectionResult, 'passed' | 'failed' | 'requires_review'> = { pass: 'passed', fail: 'failed', needs_review: 'requires_review' };

/** suggestion only: nothing is applied until an operator confirms */
export function recommend(o: { inspectionStatus: string; quantityMismatch: { expected: number; received: number } | null }): { kind: DispositionKind | null; reason: string; suggestedOnly: true } {
  if (o.quantityMismatch) return { kind: 'quarantine', reason: `Expected ${o.quantityMismatch.expected}, received ${o.quantityMismatch.received}`, suggestedOnly: true };
  if (o.inspectionStatus === 'passed') return { kind: 'sellable', reason: 'Inspection passed', suggestedOnly: true };
  if (o.inspectionStatus === 'failed') return { kind: 'damaged', reason: 'Inspection failed', suggestedOnly: true };
  if (o.inspectionStatus === 'requires_review') return { kind: 'quarantine', reason: 'Inspection needs review: hold the units until it is resolved', suggestedOnly: true };
  return { kind: null, reason: 'Pending inspection', suggestedOnly: true };
}

/** the reasons catalogue label of a code */
export const reasonLabel = (code: string): string => RETURN_REASONS.find((r) => r.code === code)?.label ?? code;

/** a unit that is not sellable cannot be restocked */
export function validateDecision(condition: string, disposition: Disposition): string | null {
  if (disposition === 'restock' && condition !== 'sellable') return `A ${condition} item cannot be restocked`;
  if (condition === 'missing' && disposition !== 'dispose') return 'A missing item can only be written off (dispose)';
  return null;
}

/** refund = what the customer paid for the returned units (unit price + its tax), pro-rated per unit */
export function refundFor(lines: Array<{ quantity: number; returned: number; unitPriceMinor: number; taxMinor: number; discountMinor: number }>): number {
  return lines.reduce((n, l) => n + Math.max(0, Math.round(((l.unitPriceMinor * l.quantity + l.taxMinor - l.discountMinor) * l.returned) / Math.max(1, l.quantity))), 0);
}

/** the stages the Returns screen shows (a coarser, flow-oriented view of the status vocabulary; the statuses themselves do not change) */
export const RETURN_STAGES = ['requested', 'approved', 'in_transit', 'received', 'inspecting', 'resolution', 'refunded', 'closed', 'rejected', 'cancelled'] as const;
export type ReturnStage = (typeof RETURN_STAGES)[number];
export const STAGE_LABELS: Record<ReturnStage, string> = {
  requested: 'Requested', approved: 'Approved', in_transit: 'In transit', received: 'Received', inspecting: 'Inspecting', resolution: 'Resolution', refunded: 'Refunded', closed: 'Closed', rejected: 'Rejected', cancelled: 'Cancelled',
};
export function returnStage(r: { status: string; inspectionStatus: string; refundStatus: string }): ReturnStage {
  switch (r.status) {
    case 'requested': case 'approved': case 'rejected': case 'cancelled': return r.status;
    case 'pickup_scheduled': case 'picked_up': case 'in_transit': return 'in_transit';
    case 'completed': return 'closed';
    default: { // received | inspecting
      if (['passed', 'failed'].includes(r.inspectionStatus)) return r.refundStatus === 'processed' ? 'refunded' : 'resolution';
      if (r.refundStatus === 'processed') return 'refunded';
      return r.inspectionStatus === 'not_started' && r.status === 'received' ? 'received' : 'inspecting';
    }
  }
}
