import type { CarrierSummary, CarriersOverview, ShipmentCounts, ShipmentRow, ShipmentsPage, ShippingSummary } from "@/types/shipping";

export const carrier = (over: Partial<CarrierSummary> = {}): CarrierSummary => ({
  code: "delhivery",
  name: "Delhivery",
  awbCount: 34,
  preDispatch: 2,
  inTransit: 10,
  delivered: 20,
  ndr: 1,
  rto: 1,
  onTimePercent: 98.2,
  onTimeSample: 20,
  avgDeliveryDays: 3.5,
  ...over,
});

export const summary = (over: Partial<ShippingSummary> = {}): ShippingSummary => ({
  window: { days: 30, since: "2026-09-21T00:00:00.000Z" },
  carriers: [carrier(), carrier({ code: "bluedart", name: "Blue Dart", awbCount: 3, onTimePercent: null, onTimeSample: 0, avgDeliveryDays: null })],
  totals: { awbCount: 37, preDispatch: 2, inTransit: 10, delivered: 20, ndr: 1, rto: 1, onTimePercent: 98.2, onTimeSample: 20, avgDeliveryDays: 3.5 },
  exceptions: { shipments: 2, ndr: 1, rto: 1 },
  ...over,
});

export const row = (over: Partial<ShipmentRow> = {}): ShipmentRow => ({
  id: "s1",
  number: "SHP-1",
  awb: "DL100001",
  carrier: "Delhivery",
  providerCode: "delhivery",
  service: "surface",
  orderId: "o1",
  orderNumber: "ORD-1001",
  channel: "amazon_in",
  customerName: "Asha Rao",
  destination: { city: "Pune", state: "MH", pincode: "411001" },
  paymentMethod: "cod",
  codAmountMinor: 129900,
  status: "in_transit",
  statusLabel: "In transit",
  lastEvent: { status: "in_transit", rawStatus: null, location: "Mumbai hub", note: null, occurredAt: "2026-10-20T08:00:00.000Z" },
  estimatedDeliveryAt: "2026-10-23T12:00:00.000Z",
  dispatchedAt: "2026-10-19T08:00:00.000Z",
  deliveredAt: null,
  attempts: 0,
  isRto: false,
  labelAvailable: true,
  trackingUrl: null,
  manifestId: null,
  createdAt: "2026-10-18T08:00:00.000Z",
  ...over,
});

export const counts = (over: Partial<ShipmentCounts> = {}): ShipmentCounts => ({ all: 3, pre_dispatch: 1, in_transit: 1, delivered: 0, ndr: 1, rto: 0, cancelled: 0, ...over });

export const page = (items: ShipmentRow[], over: Partial<ShipmentsPage> = {}): ShipmentsPage => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  pages: 1,
  counts: counts({ all: items.length }),
  ...over,
});

export const carriersOverview = (over: Partial<CarriersOverview> = {}): CarriersOverview => ({
  items: [
    {
      id: "m1",
      kind: "third_party",
      name: "Delhivery",
      providerCode: "delhivery",
      status: "active",
      isDefault: true,
      verification: { state: "verified", verifiedAt: "2026-10-01T08:00:00.000Z" },
      shipmentsLast30d: 34,
      inTransit: 10,
      lastShipmentAt: "2026-10-20T08:00:00.000Z",
    },
  ],
  activeCount: 1,
  availableProviders: [{ code: "bluedart", name: "Blue Dart", description: "Blue Dart Apex" }],
  ...over,
});
