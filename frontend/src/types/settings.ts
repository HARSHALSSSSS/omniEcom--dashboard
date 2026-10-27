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
  preferences: WorkspacePreferences;
  catalog: CatalogSettings;
  inventory: InventorySettings;
  pricing: PricingSettings;
  channels: SettingsChannel[];
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
  preferences?: Partial<Omit<WorkspacePreferences, "guardrails">> & { guardrails?: Partial<WorkspacePreferences["guardrails"]> };
  catalog?: Partial<Omit<CatalogSettings, "gates" | "requireHsn" | "skuPrefix">> & { gates?: Partial<CatalogSettings["gates"]> };
  inventory?: Partial<Pick<InventorySettings, "minSafetyStockUnits" | "spikeProtectionUnitsPerHour" | "negativeStockTwoStepApproval">>;
  pricing?: Partial<Omit<PricingSettings, "channelTiers">> & { channelTiers?: Record<string, Partial<ChannelTier>> };
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

/** GET/PATCH /me/profile */
export interface MyProfile {
  user: { id: string; email: string; fullName: string; emailVerified: boolean; lastLoginAt: string | null; phone: string | null; roleTitle: string | null; roles: string[] };
  vendor: { id: string; displayName: string } | null;
}

export interface AccountSession {
  id: string;
  current: boolean;
  startedAt: string;
  lastActiveAt: string;
  userAgent: string | null;
  ip: string | null;
}

export type SettingsModule =
  | "general"
  | "business"
  | "regional"
  | "gstin"
  | "operations"
  | "listings"
  | "inventory"
  | "fulfillment"
  | "pricing"
  | "integrations"
  | "notifications"
  | "team"
  | "security"
  | "profile";

// ---- Workspace preferences, catalog, inventory and pricing settings --------------------------------------

export type ReportingPeriod = "7d" | "30d" | "qtd" | "fytd";
export type CatalogView = "all_active" | "low_stock" | "primary_warehouse";

export interface WorkspacePreferences {
  defaultRoute: string;
  language: string;
  pageSize: number;
  catalogView: CatalogView;
  reportingPeriod: ReportingPeriod;
  telemetrySeconds: number;
  showThumbnails: boolean;
  guardrails: { bulkConfirm: boolean; stockAllocationConfirm: boolean; zeroStockDelistWarning: boolean };
}

export interface CatalogSettings {
  requireHsn: boolean;
  skuPrefix: string;
  skuTemplate: string;
  skuSeparator: "-" | "_" | "/";
  skuCasing: "uppercase" | "lowercase" | "as_is";
  strictEan: boolean;
  gates: { hsnCode: boolean; countryOfOrigin: boolean; gstRateSlab: boolean };
  syncSovereignty: "master_catalog" | "channel_autonomous";
}

export interface InventorySettings {
  mode: "simple" | "warehouse";
  startingMethod: "manual" | "marketplace" | "file" | null;
  defaultLeadTimeDays: number;
  minSafetyStockUnits: number;
  spikeProtectionUnitsPerHour: number;
  negativeStockTwoStepApproval: boolean;
}

/** one channel's pricing tier as the server stores it (money in minor units, rates in basis points) */
export interface ChannelTier {
  baseMarkupBps: number;
  fixedFeeBufferMinor: number;
  hardFloorMinor: number | null;
  maxDiscountBps: number;
  repriceIntervalMinutes: number;
  minNetMarginBps: number | null;
  autoDelistOnBreach: boolean;
  dealFloorMinor: number | null;
  mandate2faForMarkdown: boolean;
  status: "active" | "draft" | "paused";
}

export type PriceEnding = "nine" | "zero" | "exact";

export interface PricingSettings {
  marginFloorBps: number | null;
  maxVelocityShiftBps: number;
  priceEnding: PriceEnding;
  legalMetrologyMrpGate: boolean;
  withholdBufferBps: number;
  autoDelistOnBreach: boolean;
  mandate2faBulkMarkdown: boolean;
  channelTiers: Record<string, ChannelTier>;
}

export interface SettingsChannel {
  id: string;
  name: string;
  marketplace: string;
  status: string;
}

/** what the Pricing tier dialog edits: one real channel with its tier in the units the seller types (percent, rupees) */
export interface PricingTierConfig {
  id: string;
  channelName: string;
  channelCode: string;
  baseMarkupPercent: number;
  fixedFeeBufferInr: number;
  hardUndercutFloorInr: number;
  maxDiscountDepthPercent: number;
  repriceIntervalMinutes: number;
  minNetMarginPercent: number;
  autoDelistOnBreach: boolean;
  dealFloorInr: number;
  mandate2faForMarkdown: boolean;
  status: "active" | "draft" | "paused";
}

/** POST /pricing/simulate: the unit economics of one price on a real variant and channel */
export interface PriceSimulation {
  variant: { id: string; sku: string; title: string; costMinor: number | null; mrpMinor: number | null; sellingPriceMinor: number | null; gstRateBps: number | null };
  account: { id: string; name: string; marketplace: string; feesConfigured: boolean; feeBps: number | null; fixedFeeMinor: number | null } | null;
  rules: { workspaceFloorBps: number | null; effectiveTargetBps: number | null; withholdBufferBps: number; legalMetrologyMrpGate: boolean };
  priceMinor: number;
  breakdown: { gstMinor: number | null; feeMinor: number | null; withholdMinor: number; costMinor: number | null; netRealizationMinor: number | null; contributionMinor: number | null };
  marginBps: number | null;
  belowTarget: boolean | null;
  floorPriceMinor: number | null;
  exceedsMrp: boolean;
}

/** the channel inventory policy of one marketplace account (reserve share and unit buffer) */
export interface ChannelInventoryPolicy {
  marketplaceAccountId: string;
  mode: "sync" | "paused";
  safetyBuffer: number;
  allocationPercent: number;
  maxQuantity: number | null;
  warehouseIds: string[];
  isDefault: boolean;
  version: number;
  updatedAt: string | null;
}
