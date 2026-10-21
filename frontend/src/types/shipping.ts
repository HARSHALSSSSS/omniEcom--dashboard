export interface ShippingPulse {
  readyToShip: number;
  readyToShipDiff: number;
  readyToShipAction: string;
  shippingSelected: number;
  shippingSelectedDiff: number;
  shippingSelectedAction: string;
  labelReady: number;
  labelReadyDiff: number;
  labelReadyAction: string;
  dispatched: number;
  dispatchedDiff: number;
  dispatchedAction: string;
  inTransit: number;
  inTransitDiff: number;
  inTransitAction: string;
}

export interface ShippingOrderRecord {
  id: string;
  orderNumber: string;
  marketplace: string;
  destination: string;
  warehouse: string;
  product: string;
  sku: string;
  weight: string;
  orderValue: string;
  availableMethodsSummary: string;
  merchantPreference: string;
  merchantPreferenceSub: string;
  selectedShipping: string;
  selectedShippingStatus: string;
  shippingMethodType: "marketplace" | "seller" | "third_party";
  slaText: string;
  labelStatus: "Ready" | "Printed" | "Pending" | "Unavailable";
  actionText: string;
}

export interface ShippingMethodItem {
  id: string;
  name: string;
  type: "marketplace" | "seller" | "third_party";
  carrier: string;
  serviceType: string;
  slaDays: string;
  costEstimateINR: number;
  status: "active" | "inactive";
  isDefault?: boolean;
  supportedChannels: string[];
}

export interface ShippingRuleItem {
  id: string;
  name: string;
  priority: number;
  marketplace: string;
  warehouse: string;
  conditionField: string;
  conditionOperator: string;
  conditionValue: string;
  preferredMethod: string;
  status: "active" | "paused";
}

export interface TrackingRecord {
  id: string;
  orderNumber: string;
  carrier: string;
  awbNumber: string;
  status: "In Transit" | "Out for Delivery" | "Delivered" | "Delayed" | "Sync Failed";
  origin: string;
  destination: string;
  lastCheckpoint: string;
  lastUpdated: string;
  estimatedDelivery: string;
  exceptionNote?: string;
}

export interface ShippingExceptionItem {
  id: string;
  type: "no_method" | "missing_rate" | "label_failed" | "tracking_delayed";
  orderNumber: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  suggestedAction: string;
}

export interface ShippingOverviewResponse {
  pulse: ShippingPulse;
  orders: ShippingOrderRecord[];
  methods: ShippingMethodItem[];
  rules: ShippingRuleItem[];
  tracking: TrackingRecord[];
  exceptions: ShippingExceptionItem[];
}
