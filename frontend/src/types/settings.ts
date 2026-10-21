/** Settings screen: the shapes GET/PATCH /settings, the GSTIN registry, the team and the account security endpoints return. */

export type NumberFormat = "indian" | "international";
export type FulfillmentMethod = "marketplace" | "seller" | "third_party";
export type GstinStatus = "active" | "inactive" | "cancelled";

export interface Address {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export interface BusinessInfo {
  legalName: string;
  displayName: string;
  cin: string | null;
  pan: string | null;
  gstin: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  address: Address;
  registeredCity: string | null;
  operatingLocation: string | null;
  businessType: string | null;
}

export interface RegionalInfo {
  currency: string;
  currencyLabel: string;
  timezone: string;
  timezoneLabel: string;
  utcOffset: string;
  numberFormat: NumberFormat;
  /** fields the screen shows read-only */
  locked: string[];
}

export interface Gstin {
  id: string;
  gstin: string;
  stateCode: string;
  stateName: string;
  legalName: string | null;
  tradeName: string | null;
  registeredAddress: string | null;
  address: Record<string, unknown>;
  isPrimary: boolean;
  status: GstinStatus;
  verifiedAt: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperationsInfo {
  autoAcknowledgeOrders: boolean;
  roundPriceToNine: boolean;
  defaultInventoryBufferPercent: number;
  defaultFulfillmentMethod: FulfillmentMethod | null;
  defaultWarehouseId: string | null;
  lowStockThreshold: number;
  effectiveWarehouseId: string | null;
}

export interface AlertsInfo {
  dispatchSlaBreach: { enabled: boolean; thresholdMinutes: number };
  criticalStockouts: boolean;
  tokenRenewals: boolean;
  syncFailures: boolean;
  returns: boolean;
}

export type AlertKey = "dispatchSlaBreach" | "criticalStockouts" | "tokenRenewals" | "syncFailures" | "returns";

export interface AlertRow {
  key: AlertKey;
  label: string;
  description: string;
  enabled: boolean;
  thresholdMinutes: number | null;
  events: string[];
}

export interface WarehouseChoice {
  id: string;
  code: string;
  name: string;
  city: string | null;
  isDefault: boolean;
  status: string;
}

export interface SettingsOverview {
  business: BusinessInfo;
  regional: RegionalInfo;
  gstins: Gstin[];
  operations: OperationsInfo;
  alerts: AlertsInfo;
  alertMatrix: AlertRow[];
  ai: { enabled: boolean; mode: string; manageUrl: string };
  warehouses: WarehouseChoice[];
  version: number;
  updatedAt: string;
}

/** PATCH /settings body: only the groups that changed, plus the version that was read */
export interface SettingsPatch {
  business?: {
    legalName?: string;
    displayName?: string;
    cin?: string | null;
    pan?: string | null;
    businessEmail?: string | null;
    phone?: string | null;
    address?: Address;
    operatingLocation?: string;
  };
  regional?: { timezone?: string; currency?: string; numberFormat?: NumberFormat };
  operations?: {
    autoAcknowledgeOrders?: boolean;
    roundPriceToNine?: boolean;
    defaultInventoryBufferPercent?: number;
    defaultFulfillmentMethod?: FulfillmentMethod | null;
    defaultWarehouseId?: string | null;
    lowStockThreshold?: number;
  };
  alerts?: {
    dispatchSlaBreach?: { enabled?: boolean; thresholdMinutes?: number };
    criticalStockouts?: boolean;
    tokenRenewals?: boolean;
    syncFailures?: boolean;
    returns?: boolean;
  };
  version?: number;
}

// ---- GSTIN registry -----------------------------------------------------------------------------

export interface GstState {
  code: string;
  name: string;
}

export type GstinProblem = "format" | "state_code" | "checksum";

export interface GstinCheck {
  valid: boolean;
  gstin: string;
  problem: GstinProblem | null;
  stateCode: string | null;
  stateName: string | null;
  pan: string | null;
  panMatchesBusiness: boolean | null;
  expectedCheckChar: string | null;
}

export interface GstinCreateBody {
  gstin: string;
  legalName?: string | null;
  tradeName?: string | null;
  registeredAddress?: string;
  status?: GstinStatus;
  notes?: string | null;
  makePrimary?: boolean;
}

export interface GstinPatchBody {
  gstin?: string;
  legalName?: string | null;
  tradeName?: string | null;
  registeredAddress?: string;
  status?: GstinStatus;
  notes?: string | null;
  version: number;
}

// ---- AI --------------------------------------------------------------------------------------------

export interface AiSettings {
  enabled: boolean;
  mode: string;
  automatedActions: string[];
  isDefault: boolean;
}

// ---- Team and access ---------------------------------------------------------------------------------

export type VendorRoleKey = "vendor_admin" | "vendor_staff" | "vendor_viewer";
export type MemberStatus = "invited" | "active" | "disabled";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Member {
  id: string;
  email: string;
  fullName: string;
  status: MemberStatus;
  roleKey: string | null;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  roleKey: string;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  invitedBy: string | null;
  createdAt: string;
}

export interface Role {
  key: string;
  name: string;
  userType: "vendor" | "platform";
  permissions: string[];
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ---- Account security ---------------------------------------------------------------------------------

export interface AccountSession {
  id: string;
  current: boolean;
  startedAt: string;
  lastActiveAt: string;
  userAgent: string | null;
  ip: string | null;
}

export type SettingsModule = "business" | "regional" | "gstin" | "operations" | "notifications" | "team" | "security";
