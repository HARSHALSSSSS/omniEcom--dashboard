export interface GstinEntry {
  id: string;
  state: string;
  stateCode: string;
  gstin: string;
  legalTradeName: string;
  isDefault: boolean;
  registeredAddress: string;
}

export interface BusinessSettings {
  legalEntityName: string;
  brandName: string;
  cinOrPan: string;
  supportEmail: string;
  supportPhone: string;
  registeredCity: string;
  currency: string;
  numberFormat: "lakhs" | "millions";
  timezone: string;
}

export interface OperationalPreferences {
  defaultInventoryBufferPercent: number;
  lowStockThresholdUnits: number;
  autoAcknowledgeOrders: boolean;
  defaultFulfillmentMethod: "marketplace" | "seller" | "third_party";
  defaultWarehouseLocation: string;
  roundPriceToNine: boolean;
  enableAdvisoryAI: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category: "order" | "inventory" | "connector" | "security";
  timestamp: string;
  read: boolean;
  actionUrl?: string;
}
