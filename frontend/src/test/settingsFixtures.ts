import { useWorkspaceStore } from "@/store/workspace.store";
import type { AlertRow, Gstin, SettingsOverview } from "@/types/settings";

export const WAREHOUSE_A = "11111111-1111-4111-8111-111111111111";
export const WAREHOUSE_B = "22222222-2222-4222-8222-222222222222";

export const gstin = (over: Partial<Gstin> = {}): Gstin => ({
  id: "g-mh",
  gstin: "27AABCN8412P1Z1",
  stateCode: "27",
  stateName: "Maharashtra",
  legalName: "Nova Living Brands Pvt Ltd",
  tradeName: "Nova Living",
  registeredAddress: "402 Peninsula Spire, Lower Parel, Mumbai - 400013",
  address: {},
  isPrimary: true,
  status: "active",
  verifiedAt: null,
  notes: null,
  version: 1,
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-01T08:00:00.000Z",
  ...over,
});

const matrix = (): AlertRow[] => [
  { key: "dispatchSlaBreach", label: "Marketplace dispatch SLA breaches", description: "Orders that must be dispatched within 45 minutes", enabled: true, thresholdMinutes: 45, events: ["order.sla_breach"] },
  { key: "criticalStockouts", label: "Critical SKU stockouts and inventory runway warnings", description: "A SKU reached its reorder level or ran out of stock", enabled: true, thresholdMinutes: null, events: ["inventory.low_stock"] },
  { key: "tokenRenewals", label: "Channel API token renewals", description: "A marketplace authorisation expired or cannot be renewed", enabled: true, thresholdMinutes: null, events: [] },
  { key: "syncFailures", label: "Marketplace sync failures", description: "A sync with a marketplace failed or gave up", enabled: true, thresholdMinutes: null, events: [] },
  { key: "returns", label: "New return requests and inspection items", description: "A return was requested or arrived at the warehouse", enabled: true, thresholdMinutes: null, events: [] },
];

export const settings = (over: Partial<SettingsOverview> = {}): SettingsOverview => ({
  business: {
    legalName: "Nova Living Brands Pvt Ltd",
    displayName: "Nova Living",
    cin: "U74999MH2021PTC368942",
    pan: "AABCN8412P",
    gstin: "27AABCN8412P1Z1",
    supportEmail: "care@novaliving.test",
    supportPhone: "+91 98200 00000",
    address: { line1: "402 Peninsula Spire", line2: "Lower Parel", city: "Mumbai", state: "Maharashtra", pincode: "400013", country: "IN" },
    registeredCity: "Mumbai, Maharashtra",
    operatingLocation: "Mumbai",
    businessType: "d2c_brand",
  },
  regional: { currency: "INR", currencyLabel: "INR (₹)", timezone: "Asia/Kolkata", timezoneLabel: "Asia/Kolkata (UTC+05:30)", utcOffset: "+05:30", numberFormat: "indian", locked: ["currency", "timezone"] },
  gstins: [gstin()],
  operations: { autoAcknowledgeOrders: false, roundPriceToNine: false, defaultInventoryBufferPercent: 10, defaultFulfillmentMethod: "seller", defaultWarehouseId: null, lowStockThreshold: 5, effectiveWarehouseId: WAREHOUSE_A },
  alerts: { dispatchSlaBreach: { enabled: true, thresholdMinutes: 45 }, criticalStockouts: true, tokenRenewals: true, syncFailures: true, returns: true },
  alertMatrix: matrix(),
  ai: { enabled: true, mode: "recommend", manageUrl: "/api/v1/ai/settings" },
  warehouses: [
    { id: WAREHOUSE_A, code: "MUM", name: "Mumbai Hub", city: "Mumbai", isDefault: true, status: "active" },
    { id: WAREHOUSE_B, code: "BLR", name: "Bengaluru Hub", city: "Bengaluru", isDefault: false, status: "active" },
  ],
  version: 7,
  updatedAt: "2026-10-20T08:46:00.000Z",
  ...over,
});

/** a signed-in session with the given permissions and platform feature flags */
export function signIn(permissions: string[], features: Record<string, boolean> = { "ai.enabled": true }) {
  useWorkspaceStore.getState().setSession({
    user: { id: "u1", fullName: "Asha Admin", email: "asha@novaliving.test", businessName: "Nova Living", role: "owner" },
    permissions,
    shell: {
      user: { id: "u1", name: "Asha Admin", initials: "AA", roleLabel: "Business owner" },
      business: { id: "b1", name: "Nova Living", plan: "free", tier: "starter" },
      badges: { needsAttention: 0, orders: 0, returns: 0, notifications: 0 },
      features,
    },
    onboardingStatus: "completed",
    onboardingResumeStep: "ready",
  });
}

export const ADMIN = ["vendors:read", "vendors:write", "ai:use", "users:read", "users:write", "roles:read"];
