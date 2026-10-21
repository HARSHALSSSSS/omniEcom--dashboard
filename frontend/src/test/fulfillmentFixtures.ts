import type {
  ActionView,
  ExceptionRow,
  ExceptionsPage,
  QueueCounts,
  QueuePage,
  QueueRow,
  Workspace,
  WorkspaceFulfillment,
} from "@/types/fulfillment";

export const counts = (over: Partial<QueueCounts> = {}): QueueCounts => ({ awaiting_pick: 3, picking: 2, packing: 1, ready_to_ship: 4, all: 10, onHold: 0, exceptions: 2, ...over });

export function row(over: Partial<QueueRow> = {}): QueueRow {
  return {
    fulfillmentId: "f1",
    number: "FUL-0001",
    orderId: "o1",
    orderNumber: "ORD-1001",
    channel: { code: "amazon_in", accountId: "a1", name: "Amazon India" },
    stage: "awaiting_pick",
    stageLabel: "Awaiting pick",
    status: "confirmed",
    onHold: false,
    priority: "normal",
    sla: { dueAt: "2026-10-21T12:00:00Z", minutesRemaining: 135, band: "approaching", label: "Due in 2h 15m" },
    placedAt: "2026-10-21T08:00:00Z",
    customerName: "Asha Rao",
    destination: { city: "Pune", state: "MH", pincode: "411001" },
    paymentMethod: "prepaid",
    warehouse: { id: "w1", code: "MAIN", name: "Main warehouse" },
    assignee: null,
    pickList: null,
    carrier: null,
    awb: null,
    shipmentId: null,
    shipmentStatus: null,
    itemCount: 1,
    unitCount: 2,
    pickedUnits: 0,
    packedUnits: 0,
    items: [{ sku: "TRV-1042", title: "Travel mug", quantity: 2, pickedQuantity: 0, packedQuantity: 0, pickState: "pending", bin: "A-04-02", binSuggested: false }],
    openExceptions: 0,
    nextAction: "start",
    ...over,
  };
}

export const queuePage = (items: QueueRow[], over: Partial<QueuePage> = {}): QueuePage => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  pages: 1,
  counts: counts(),
  ...over,
});

export const view = (action: ActionView["action"], over: Partial<ActionView> = {}): ActionView => ({
  action,
  label: { start: "Start picking", pick_all: "Pick all items", pack: "Pack", ready: "Create label (ready to ship)", handover: "Hand over to the courier", exception: "Report an exception" }[action],
  enabled: false,
  disabledReason: "Not now",
  requires: [],
  requiresOverride: false,
  ...over,
});

export function workspace(over: Partial<Workspace> = {}, focus: Partial<WorkspaceFulfillment> = {}): Workspace {
  const base = row();
  return {
    order: {
      id: "o1",
      orderNumber: "ORD-1001",
      externalOrderId: "402-1",
      status: "confirmed",
      placedAt: "2026-10-21T08:00:00Z",
      channel: base.channel,
      customer: { name: "Asha Rao", city: "Pune", state: "MH", pincode: "411001" },
      paymentMethod: "cod",
      codAmountMinor: 149900,
      totalMinor: 149900,
      currency: "INR",
      sla: base.sla,
      attentionReason: null,
    },
    fulfillments: [{ id: "f1", number: "FUL-0001", status: "confirmed", stage: "awaiting_pick", warehouse: base.warehouse, units: 2, focused: true }],
    fulfillment: {
      ...base,
      id: "f1",
      items: [{ id: "i1", sku: "TRV-1042", title: "Travel mug", barcode: null, quantity: 2, pickedQuantity: 0, packedQuantity: 0, shortQuantity: 0, pickState: "pending", bin: "A-04-02", scanned: false }],
      packages: [],
      shipment: null,
      exceptions: [],
      history: [{ at: "2026-10-21T08:05:00Z", from: null, to: "confirmed", note: null, actor: { id: "u1", name: "Staff One" } }],
      openTasks: 0,
      ...focus,
    },
    actions: [
      view("start", { enabled: true, disabledReason: null }),
      view("pick_all", { disabledReason: "Nothing is being picked" }),
      view("pack", { requires: ["weightGrams"], requiresOverride: true, disabledReason: "Only picked items can be packed" }),
      view("ready", { disabledReason: "Pack the order first" }),
      view("handover", { disabledReason: "Create the label first" }),
      view("exception", { enabled: true, disabledReason: null, requires: ["kind"] }),
    ],
    ...over,
  };
}

export function exception(over: Partial<ExceptionRow> = {}): ExceptionRow {
  return {
    id: "x1",
    kind: "damaged",
    kindLabel: "Damaged item",
    status: "open",
    details: { note: "box crushed" },
    resolution: null,
    fulfillment: { id: "f1", number: "FUL-0001", status: "confirmed" },
    orderId: "o1",
    orderNumber: "ORD-1001",
    channel: "amazon_in",
    warehouse: { id: "w1", code: "MAIN" },
    raisedBy: { id: "u1", name: "Staff One" },
    ageMinutes: 95,
    createdAt: "2026-10-21T08:30:00Z",
    resolvedAt: null,
    ...over,
  };
}

export const exceptionsPage = (items: ExceptionRow[]): ExceptionsPage => ({ items, page: 1, pageSize: 25, total: items.length, pages: 1, counts: { open: items.length, resolved: 0, dismissed: 0 } });
