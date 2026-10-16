import type {
  GstinEntry,
  BusinessSettings,
  OperationalPreferences,
  NotificationItem,
} from "@/types/settings";

export const MOCK_BUSINESS_SETTINGS: BusinessSettings = {
  legalEntityName: "Nova Living Brands Private Limited",
  brandName: "Nova Living",
  cinOrPan: "U74999MH2021PTC368942 / AABCN8412P",
  supportEmail: "care@novaliving.in",
  supportPhone: "+91 22 4920 1800",
  registeredCity: "Mumbai, Maharashtra",
  currency: "INR (₹)",
  numberFormat: "lakhs",
  timezone: "Asia/Kolkata (IST · UTC+5:30)",
};

export const MOCK_GSTIN_ENTRIES: GstinEntry[] = [
  {
    id: "gst-01",
    state: "Maharashtra",
    stateCode: "27",
    gstin: "27AABCN8412P1ZA",
    legalTradeName: "Nova Living Brands Pvt Ltd",
    isDefault: true,
    registeredAddress: "402 Peninsula Spire, Lower Parel, Mumbai - 400013",
  },
  {
    id: "gst-02",
    state: "Karnataka",
    stateCode: "29",
    gstin: "29AABCN8412P1ZB",
    legalTradeName: "Nova Living Brands Pvt Ltd (BLR Hub)",
    isDefault: false,
    registeredAddress: "Warehouse 12B, Soukya Road, Whitefield, Bengaluru - 560067",
  },
  {
    id: "gst-03",
    state: "Haryana (Delhi NCR Hub)",
    stateCode: "06",
    gstin: "06AABCN8412P1ZC",
    legalTradeName: "Nova Living Brands Pvt Ltd (NCR Facility)",
    isDefault: false,
    registeredAddress: "Plot 88, Sector 34, Infocity, Gurugram - 122001",
  },
];

export const MOCK_OPERATIONAL_PREFERENCES: OperationalPreferences = {
  defaultInventoryBufferPercent: 5,
  lowStockThresholdUnits: 15,
  autoAcknowledgeOrders: true,
  defaultFulfillmentMethod: "marketplace",
  defaultWarehouseLocation: "Mumbai Hub B2",
  roundPriceToNine: true,
  enableAdvisoryAI: true,
};

export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-01",
    title: "Urgent SLA Warning",
    message: "Flipkart order ORD-IN-90804 requires dispatch packaging in 25 minutes.",
    category: "order",
    timestamp: "10 min ago",
    read: false,
    actionUrl: "/orders",
  },
  {
    id: "notif-02",
    title: "Stock Runway Alert",
    message: "Premium Travel Bag (TRV-1042-BLK) reached critical 8-day inventory threshold.",
    category: "inventory",
    timestamp: "45 min ago",
    read: false,
    actionUrl: "/inventory",
  },
  {
    id: "notif-03",
    title: "Amazon Connection Token Refreshed",
    message: "OAuth SP-API token successfully refreshed. Next renewal in 28 days.",
    category: "connector",
    timestamp: "2 hours ago",
    read: true,
    actionUrl: "/marketplace-hub/health",
  },
  {
    id: "notif-04",
    title: "Purchase Order Submitted",
    message: "PO-2026-0048 sent to Vanguard Luggage Components for 150 units.",
    category: "order",
    timestamp: "4 hours ago",
    read: true,
    actionUrl: "/procurement",
  },
];
