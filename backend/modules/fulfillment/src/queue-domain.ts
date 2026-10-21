/**
 * Pure rules of the Fulfillment workspace read model: the four queue stages of the screen, the SLA label, and which one-click
 * actions (start / pick all / pack / ready / handover / exception) are available for an order and why not. No I/O.
 */

export const STAGES = ['awaiting_pick', 'picking', 'packing', 'ready_to_ship'] as const;
export type Stage = (typeof STAGES)[number];

/** fulfillment statuses that belong to each queue stage (a held fulfillment stays in the stage it was held from) */
export const STAGE_STATUSES: Record<Stage, readonly string[]> = {
  awaiting_pick: ['confirmed'],
  picking: ['picking'],
  packing: ['picked', 'packing'],
  ready_to_ship: ['packed', 'ready_to_ship'],
};

export const STAGE_LABELS: Record<Stage, string> = { awaiting_pick: 'Awaiting pick', picking: 'Picking', packing: 'Packing', ready_to_ship: 'Ready to ship' };

export function stageOf(status: string, holdFrom: string | null): Stage | null {
  const effective = status === 'on_hold' ? holdFrom : status;
  if (!effective) return null;
  return STAGES.find((s) => STAGE_STATUSES[s].includes(effective)) ?? null;
}

// ------------------------------------------------------------------------------------------------
// SLA
// ------------------------------------------------------------------------------------------------
export type SlaBand = 'safe' | 'approaching' | 'at_risk' | 'breached' | 'none';
export interface SlaThresholds { atRiskMinutes: number; approachingMinutes: number }

const span = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) { const h = Math.floor(minutes / 60); const m = minutes % 60; return m ? `${h}h ${m}m` : `${h}h`; }
  const d = Math.floor(minutes / 1440); const h = Math.floor((minutes % 1440) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
};

export function slaView(due: Date | null, th: SlaThresholds, now: Date = new Date()): { dueAt: string | null; minutesRemaining: number | null; band: SlaBand; label: string } {
  if (!due) return { dueAt: null, minutesRemaining: null, band: 'none', label: 'No deadline' };
  const m = Math.floor((due.getTime() - now.getTime()) / 60_000);
  const band: SlaBand = m < 0 ? 'breached' : m <= th.atRiskMinutes ? 'at_risk' : m <= th.approachingMinutes ? 'approaching' : 'safe';
  return { dueAt: due.toISOString(), minutesRemaining: m, band, label: m < 0 ? `Overdue by ${span(-m)}` : `Due in ${span(m)}` };
}

// ------------------------------------------------------------------------------------------------
// actions
// ------------------------------------------------------------------------------------------------
export const ACTIONS = ['start', 'pick_all', 'pack', 'ready', 'handover', 'exception'] as const;
export type FulfillmentAction = (typeof ACTIONS)[number];

export interface ActionFacts {
  orderStatus: string;
  /** the fulfillment the action would apply to (null = the order has no live fulfillment yet) */
  fulfillment: { status: string; holdFrom: string | null; openTasks: number; unverifiedTasks: number; unpackedUnits: number } | null;
  /** the live (not cancelled) shipment of that fulfillment */
  shipment: { status: string } | null;
}
export interface ActionView {
  action: FulfillmentAction;
  label: string;
  enabled: boolean;
  disabledReason: string | null;
  /** body fields the call needs besides `action` */
  requires: string[];
  /** true when the call must send `override: true` (units were not barcode-scanned, so the pick/close is a manual, audited one) */
  requiresOverride: boolean;
}

const START_ORDER_STATUSES = ['new', 'confirmed'];
const PRE_SHIP_STATUSES = ['confirmed', 'picking', 'picked', 'packing', 'packed', 'ready_to_ship'];

export function actionsFor(f: ActionFacts): ActionView[] {
  const fu = f.fulfillment;
  const held = fu?.status === 'on_hold';
  const view = (action: FulfillmentAction, label: string, reason: string | null, extra: Partial<Pick<ActionView, 'requires' | 'requiresOverride'>> = {}): ActionView =>
    ({ action, label, enabled: reason === null, disabledReason: reason, requires: extra.requires ?? [], requiresOverride: extra.requiresOverride ?? false });
  const blocked = (): string | null => {
    if (!fu) return 'No fulfillment has been started for this order';
    if (held) return 'The fulfillment is on hold: resume it first';
    return null;
  };

  let start: ActionView;
  if (!fu) {
    start = view('start', 'Start fulfillment', START_ORDER_STATUSES.includes(f.orderStatus) ? null : `A ${f.orderStatus} order cannot be fulfilled`);
  } else if (held) {
    start = view('start', 'Start picking', 'The fulfillment is on hold: resume it first');
  } else {
    start = view('start', 'Start picking', fu.status === 'confirmed' ? null : fu.status === 'cancelled' ? 'The fulfillment was cancelled' : 'Picking has already started');
  }

  const b = blocked();
  const pickAll = view('pick_all', 'Pick all items', b ?? (fu!.status !== 'picking' ? 'Nothing is being picked' : fu!.openTasks === 0 ? 'Every pick task is finished' : null), { requiresOverride: (fu?.unverifiedTasks ?? 0) > 0 });
  const pack = view('pack', 'Pack', b ?? (!['picked', 'packing'].includes(fu!.status) ? 'Only picked items can be packed' : fu!.unpackedUnits === 0 ? 'Every picked unit is already in a package' : null), { requires: ['weightGrams'], requiresOverride: true });
  const ready = view('ready', 'Create label (ready to ship)', b ?? (fu!.status === 'ready_to_ship' ? 'The label already exists' : fu!.status !== 'packed' ? 'Pack the order first' : f.shipment ? 'The fulfillment already has a shipment' : null));
  const handover = view('handover', 'Hand over to the courier', b ?? (fu!.status !== 'ready_to_ship' ? 'Create the label first' : !f.shipment || !['label_ready', 'manifested'].includes(f.shipment.status) ? 'There is no shipment ready for hand-over' : null));
  const exception = view('exception', 'Report an exception', fu === null ? 'No fulfillment has been started for this order' : PRE_SHIP_STATUSES.includes(fu.status) || held ? null : 'Exceptions can only be raised before the parcel ships', { requires: ['kind'] });
  return [start, pickAll, pack, ready, handover, exception];
}

/** what the row of the queue should offer as its primary button */
export function primaryAction(actions: ActionView[]): FulfillmentAction | null {
  return actions.find((a) => a.enabled && a.action !== 'exception')?.action ?? null;
}
