import type {
  AlertKey,
  CatalogSettings,
  FulfillmentMethod,
  InventorySettings,
  NumberFormat,
  PricingSettings,
  SettingsOverview,
  SettingsPatch,
  SettingsModule,
  WorkspacePreferences,
} from "@/types/settings";

/** the parts of the catalog and inventory groups the Products & Listings tab edits (the rest is owned by other screens) */
export type EditableCatalog = Pick<CatalogSettings, "skuTemplate" | "skuSeparator" | "skuCasing" | "strictEan" | "gates" | "syncSovereignty">;
export type EditableInventory = Pick<InventorySettings, "minSafetyStockUnits" | "spikeProtectionUnitsPerHour" | "negativeStockTwoStepApproval">;

/** the nested groups of the General, Products & Listings and Pricing & Margins tabs, edited as whole objects */
export interface SettingsExt {
  preferences: WorkspacePreferences;
  catalog: EditableCatalog;
  inventory: EditableInventory;
  pricing: PricingSettings;
}
export type ExtGroup = keyof SettingsExt;
export const EXT_GROUPS: ExtGroup[] = ["preferences", "catalog", "inventory", "pricing"];
export const extKey = (g: ExtGroup): FormKey => `ext:${g}`;

/** the server's defaults of the General tab (what "Reset defaults" goes back to) */
export const PREFERENCE_DEFAULTS: Omit<WorkspacePreferences, "guardrails"> = { defaultRoute: "/", language: "en-IN", pageSize: 25, catalogView: "all_active", reportingPeriod: "30d", telemetrySeconds: 30, showThumbnails: true };

const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** CIN: listed company L / unlisted U, 5 digits, 2 letters (state), 4 digits (year), 3 letters (type), 6 digits */
export const CIN_PATTERN = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const ALERT_KEYS: AlertKey[] = ["dispatchSlaBreach", "criticalStockouts", "tokenRenewals", "syncFailures", "returns"];

export const FULFILLMENT_OPTIONS: Array<{ value: FulfillmentMethod; label: string; hint: string }> = [
  { value: "marketplace", label: "Fulfilled by the marketplace", hint: "The marketplace stores, packs and ships (for example Amazon FBA)." },
  { value: "seller", label: "Shipped by me", hint: "You pack and ship from your own warehouse." },
  { value: "third_party", label: "Third-party logistics", hint: "A fulfilment partner packs and ships for you." },
];

/** every editable value of the screen as the inputs hold it (text stays text until it is saved) */
export interface SettingsForm {
  legalName: string;
  displayName: string;
  cin: string;
  pan: string;
  supportEmail: string;
  supportPhone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  operatingLocation: string;
  timezone: string;
  currency: string;
  numberFormat: NumberFormat;
  autoAcknowledgeOrders: boolean;
  roundPriceToNine: boolean;
  bufferPercent: string;
  lowStockThreshold: string;
  fulfillmentMethod: "" | FulfillmentMethod;
  warehouseId: string;
  aiEnabled: boolean;
  slaMinutes: string;
  alerts: Record<AlertKey, boolean>;
  ext: SettingsExt;
}

export type TextKey =
  | "legalName"
  | "displayName"
  | "cin"
  | "pan"
  | "supportEmail"
  | "supportPhone"
  | "line1"
  | "line2"
  | "city"
  | "state"
  | "pincode"
  | "operatingLocation"
  | "timezone"
  | "currency"
  | "bufferPercent"
  | "lowStockThreshold"
  | "slaMinutes"
  | "warehouseId";
/** a field of the form: used for dirty marks, error placement and focus */
export type FormKey = TextKey | `ext:${ExtGroup}` | "numberFormat" | "autoAcknowledgeOrders" | "roundPriceToNine" | "fulfillmentMethod" | "aiEnabled" | `alert:${AlertKey}`;
export type FieldProblems = Partial<Record<FormKey, string>>;

const BUSINESS_KEYS: FormKey[] = ["legalName", "displayName", "cin", "pan", "supportEmail", "supportPhone", "line1", "line2", "city", "state", "pincode", "operatingLocation"];
const REGIONAL_KEYS: FormKey[] = ["timezone", "currency", "numberFormat"];
const ALERT_FORM_KEYS: FormKey[] = ["slaMinutes", ...ALERT_KEYS.map((k) => `alert:${k}` as FormKey)];

/** which tab a field lives on (dirty dots, "this tab has a problem") */
export function tabOf(key: FormKey): SettingsModule {
  if (key === "ext:preferences") return "general";
  if (key === "ext:catalog" || key === "ext:inventory") return "listings";
  if (key === "ext:pricing") return "pricing";
  if (BUSINESS_KEYS.includes(key)) return "business";
  if (REGIONAL_KEYS.includes(key)) return "regional";
  if (ALERT_FORM_KEYS.includes(key)) return "notifications";
  return "operations";
}

export function toForm(s: SettingsOverview): SettingsForm {
  const a = s.business.address;
  return {
    legalName: s.business.legalName,
    displayName: s.business.displayName,
    cin: s.business.cin ?? "",
    pan: s.business.pan ?? "",
    supportEmail: s.business.supportEmail ?? "",
    supportPhone: s.business.supportPhone ?? "",
    line1: a.line1 ?? "",
    line2: a.line2 ?? "",
    city: a.city ?? "",
    state: a.state ?? "",
    pincode: a.pincode ?? "",
    operatingLocation: s.business.operatingLocation ?? "",
    timezone: s.regional.timezone,
    currency: s.regional.currency,
    numberFormat: s.regional.numberFormat,
    autoAcknowledgeOrders: s.operations.autoAcknowledgeOrders,
    roundPriceToNine: s.operations.roundPriceToNine,
    bufferPercent: String(s.operations.defaultInventoryBufferPercent),
    lowStockThreshold: String(s.operations.lowStockThreshold),
    fulfillmentMethod: s.operations.defaultFulfillmentMethod ?? "",
    // the warehouse that is actually in force is shown even when none was chosen explicitly
    warehouseId: s.operations.defaultWarehouseId ?? "",
    aiEnabled: s.ai.enabled,
    slaMinutes: String(s.alerts.dispatchSlaBreach.thresholdMinutes),
    alerts: {
      dispatchSlaBreach: s.alerts.dispatchSlaBreach.enabled,
      criticalStockouts: s.alerts.criticalStockouts,
      tokenRenewals: s.alerts.tokenRenewals,
      syncFailures: s.alerts.syncFailures,
      returns: s.alerts.returns,
    },
    ext: {
      preferences: copy(s.preferences),
      catalog: copy({ skuTemplate: s.catalog.skuTemplate, skuSeparator: s.catalog.skuSeparator, skuCasing: s.catalog.skuCasing, strictEan: s.catalog.strictEan, gates: s.catalog.gates, syncSovereignty: s.catalog.syncSovereignty }),
      inventory: copy({ minSafetyStockUnits: s.inventory.minSafetyStockUnits, spikeProtectionUnitsPerHour: s.inventory.spikeProtectionUnitsPerHour, negativeStockTwoStepApproval: s.inventory.negativeStockTwoStepApproval }),
      pricing: copy(s.pricing),
    },
  };
}

const norm = (v: string) => v.trim();
const same = (a: string, b: string) => norm(a) === norm(b);

/** the fields whose value differs from the baseline */
export function modifiedKeys(base: SettingsForm, cur: SettingsForm): FormKey[] {
  const out: FormKey[] = [];
  const text: TextKey[] = ["legalName", "displayName", "cin", "pan", "supportEmail", "supportPhone", "line1", "line2", "city", "state", "pincode", "operatingLocation", "timezone", "currency", "bufferPercent", "lowStockThreshold", "slaMinutes", "warehouseId"];
  for (const k of text) {
    // codes are compared without case: "u74999mh2021ptc368942" is the stored CIN typed in lower case
    const a = k === "cin" || k === "pan" ? norm(base[k]).toUpperCase() : base[k];
    const b = k === "cin" || k === "pan" ? norm(cur[k]).toUpperCase() : cur[k];
    if (!same(a, b)) out.push(k);
  }
  if (base.numberFormat !== cur.numberFormat) out.push("numberFormat");
  if (base.autoAcknowledgeOrders !== cur.autoAcknowledgeOrders) out.push("autoAcknowledgeOrders");
  if (base.roundPriceToNine !== cur.roundPriceToNine) out.push("roundPriceToNine");
  if (base.fulfillmentMethod !== cur.fulfillmentMethod) out.push("fulfillmentMethod");
  if (base.aiEnabled !== cur.aiEnabled) out.push("aiEnabled");
  for (const k of ALERT_KEYS) if (base.alerts[k] !== cur.alerts[k]) out.push(`alert:${k}`);
  for (const g of EXT_GROUPS) if (JSON.stringify(base.ext[g]) !== JSON.stringify(cur.ext[g])) out.push(extKey(g));
  return out;
}

export const isDirty = (base: SettingsForm, cur: SettingsForm) => modifiedKeys(base, cur).length > 0;

/** whole number inside a range, or an error message */
function intIn(raw: string, min: number, max: number, what: string): { value: number } | { error: string } {
  const t = raw.trim();
  if (!/^-?\d+$/.test(t)) return { error: `${what} must be a whole number between ${min.toLocaleString("en-IN")} and ${max.toLocaleString("en-IN")}.` };
  const n = Number(t);
  if (n < min || n > max) return { error: `${what} must be between ${min.toLocaleString("en-IN")} and ${max.toLocaleString("en-IN")}.` };
  return { value: n };
}

/** the validation of ONE field (same rules as the API, so the seller sees the problem before saving) */
export function validateField(key: FormKey, v: SettingsForm): string | null {
  const t = (k: TextKey) => v[k].trim();
  switch (key) {
    case "legalName":
      return t("legalName").length < 2 || t("legalName").length > 200 ? "Legal name must be 2 to 200 characters." : null;
    case "displayName":
      return t("displayName").length < 2 || t("displayName").length > 120 ? "Brand name must be 2 to 120 characters." : null;
    case "cin":
      return t("cin") && !CIN_PATTERN.test(t("cin").toUpperCase()) ? "Enter a valid 21 character CIN, for example U74999MH2021PTC368942." : null;
    case "pan":
      return t("pan") && !PAN_PATTERN.test(t("pan").toUpperCase()) ? "Enter a valid 10 character PAN, for example AABCN8412P." : null;
    case "supportEmail":
      return !t("supportEmail") ? null : !EMAIL_PATTERN.test(t("supportEmail")) || t("supportEmail").length > 254 ? "Enter a valid email address." : null;
    case "supportPhone":
      return !t("supportPhone") ? null : t("supportPhone").length < 7 || t("supportPhone").length > 20 ? "Phone number must be 7 to 20 characters." : null;
    case "line1":
    case "line2":
      return t(key).length > 200 ? "Use at most 200 characters." : null;
    case "city":
    case "state":
      return t(key).length > 100 ? "Use at most 100 characters." : null;
    case "pincode":
      return t("pincode") && !PINCODE_PATTERN.test(t("pincode")) ? "Enter a valid 6 digit PIN code." : null;
    case "operatingLocation":
      return t("operatingLocation").length < 2 || t("operatingLocation").length > 160 ? "Operating location must be 2 to 160 characters." : null;
    case "timezone":
      return t("timezone").length < 2 ? "Choose a time zone." : null;
    case "currency":
      return !/^[A-Za-z]{3}$/.test(t("currency")) ? "Use a 3 letter currency code." : null;
    case "bufferPercent": {
      const r = intIn(v.bufferPercent, 0, 100, "The reserve");
      return "error" in r ? r.error : null;
    }
    case "lowStockThreshold": {
      const r = intIn(v.lowStockThreshold, 0, 1_000_000, "The threshold");
      return "error" in r ? r.error : null;
    }
    case "slaMinutes": {
      const r = intIn(v.slaMinutes, 5, 1440, "The alert window");
      return "error" in r ? r.error : null;
    }
    default:
      return null;
  }
}

const inRange = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;
const optBps = (n: number | null) => n === null || inRange(n, 0, 10_000);
const optMinor = (n: number | null) => n === null || inRange(n, 0, 100_000_000_000);

/** the same limits as the API for the nested groups; the first problem of a group becomes its message */
export function validateExt(group: ExtGroup, ext: SettingsExt): string | null {
  switch (group) {
    case "catalog":
      return ext.catalog.skuTemplate.trim().length < 1 || ext.catalog.skuTemplate.trim().length > 60 ? "The SKU formula must be 1 to 60 characters." : null;
    case "inventory": {
      const i = ext.inventory;
      if (!Number.isInteger(i.minSafetyStockUnits) || !inRange(i.minSafetyStockUnits, 0, 1_000_000)) return "The minimum safety stock must be a whole number of units, 0 or more.";
      if (!Number.isInteger(i.spikeProtectionUnitsPerHour) || !inRange(i.spikeProtectionUnitsPerHour, 1, 1_000_000)) return "The spike limit must be at least 1 unit per hour.";
      return null;
    }
    case "pricing": {
      const p = ext.pricing;
      if (!optBps(p.marginFloorBps)) return "The margin floor must be between 0% and 100%.";
      if (!inRange(p.maxVelocityShiftBps, 0, 10_000)) return "The maximum shift must be between 0% and 100%.";
      for (const t of Object.values(p.channelTiers)) {
        if (!inRange(t.baseMarkupBps, 0, 100_000)) return "A channel markup must be between 0% and 1,000%.";
        if (!inRange(t.maxDiscountBps, 0, 10_000)) return "A maximum discount must be between 0% and 100%.";
        if (!inRange(t.repriceIntervalMinutes, 5, 1440)) return "A re-price interval must be between 5 and 1,440 minutes.";
        if (!optBps(t.minNetMarginBps)) return "A minimum net margin must be between 0% and 100%.";
        if (!optMinor(t.hardFloorMinor) || !optMinor(t.dealFloorMinor) || !inRange(t.fixedFeeBufferMinor, 0, 100_000_000_000)) return "Prices and fee buffers cannot be negative.";
      }
      return null;
    }
    default:
      return null;
  }
}

export interface BuiltPatch {
  /** the body of PATCH /settings (without `version`) */
  patch: SettingsPatch;
  /** the AI switch is saved through /ai/settings: its new value, or null when unchanged */
  ai: boolean | null;
  problems: FieldProblems;
  modified: FormKey[];
}

/**
 * The save body: only the groups and fields that changed. A cleared CIN or PAN is sent as null (removes it); a cleared
 * address part is left out of the address (the API replaces the address as a whole).
 */
export function buildPatch(s: SettingsOverview, base: SettingsForm, cur: SettingsForm): BuiltPatch {
  const modified = modifiedKeys(base, cur);
  const problems: FieldProblems = {};
  for (const k of modified) {
    const p = k.startsWith("ext:") ? validateExt(k.slice(4) as ExtGroup, cur.ext) : validateField(k, cur);
    if (p) problems[k] = p;
  }
  const has = (k: FormKey) => modified.includes(k);
  const locked = new Set(s.regional.locked);
  const patch: SettingsPatch = {};

  const business: NonNullable<SettingsPatch["business"]> = {};
  if (has("legalName")) business.legalName = cur.legalName.trim();
  if (has("displayName")) business.displayName = cur.displayName.trim();
  if (has("cin")) business.cin = cur.cin.trim() ? cur.cin.trim().toUpperCase() : null;
  if (has("pan")) business.pan = cur.pan.trim() ? cur.pan.trim().toUpperCase() : null;
  if (has("supportEmail")) business.businessEmail = cur.supportEmail.trim() || null;
  if (has("supportPhone")) business.phone = cur.supportPhone.trim() || null;
  if (has("operatingLocation")) business.operatingLocation = cur.operatingLocation.trim();
  if (["line1", "line2", "city", "state", "pincode"].some((k) => has(k as FormKey))) {
    const address: NonNullable<NonNullable<SettingsPatch["business"]>["address"]> = {};
    if (cur.line1.trim()) address.line1 = cur.line1.trim();
    if (cur.line2.trim()) address.line2 = cur.line2.trim();
    if (cur.city.trim()) address.city = cur.city.trim();
    if (cur.state.trim()) address.state = cur.state.trim();
    if (cur.pincode.trim()) address.pincode = cur.pincode.trim();
    if (s.business.address.country) address.country = s.business.address.country;
    business.address = address;
  }
  if (Object.keys(business).length) patch.business = business;

  const regional: NonNullable<SettingsPatch["regional"]> = {};
  if (has("timezone") && !locked.has("timezone")) regional.timezone = cur.timezone.trim();
  if (has("currency") && !locked.has("currency")) regional.currency = cur.currency.trim().toUpperCase();
  if (has("numberFormat")) regional.numberFormat = cur.numberFormat;
  if (Object.keys(regional).length) patch.regional = regional;

  const operations: NonNullable<SettingsPatch["operations"]> = {};
  if (has("autoAcknowledgeOrders")) operations.autoAcknowledgeOrders = cur.autoAcknowledgeOrders;
  if (has("roundPriceToNine")) operations.roundPriceToNine = cur.roundPriceToNine;
  if (has("bufferPercent") && !problems.bufferPercent) operations.defaultInventoryBufferPercent = Number(cur.bufferPercent.trim());
  if (has("lowStockThreshold") && !problems.lowStockThreshold) operations.lowStockThreshold = Number(cur.lowStockThreshold.trim());
  if (has("fulfillmentMethod")) operations.defaultFulfillmentMethod = cur.fulfillmentMethod || null;
  if (has("warehouseId")) operations.defaultWarehouseId = cur.warehouseId || null;
  if (Object.keys(operations).length) patch.operations = operations;

  const alerts: NonNullable<SettingsPatch["alerts"]> = {};
  const sla: { enabled?: boolean; thresholdMinutes?: number } = {};
  if (has("alert:dispatchSlaBreach")) sla.enabled = cur.alerts.dispatchSlaBreach;
  if (has("slaMinutes") && !problems.slaMinutes) sla.thresholdMinutes = Number(cur.slaMinutes.trim());
  if (Object.keys(sla).length) alerts.dispatchSlaBreach = sla;
  if (has("alert:criticalStockouts")) alerts.criticalStockouts = cur.alerts.criticalStockouts;
  if (has("alert:tokenRenewals")) alerts.tokenRenewals = cur.alerts.tokenRenewals;
  if (has("alert:syncFailures")) alerts.syncFailures = cur.alerts.syncFailures;
  if (has("alert:returns")) alerts.returns = cur.alerts.returns;
  if (Object.keys(alerts).length) patch.alerts = alerts;

  if (has("ext:preferences") && !problems["ext:preferences"]) patch.preferences = cur.ext.preferences;
  if (has("ext:catalog") && !problems["ext:catalog"]) {
    // only what changed travels: sending the untouched SKU formula would count as saving one, and a saved formula is enforced
    const b = base.ext.catalog;
    const c = cur.ext.catalog;
    const catalog: NonNullable<SettingsPatch["catalog"]> = {};
    if (c.skuTemplate.trim() !== b.skuTemplate) catalog.skuTemplate = c.skuTemplate.trim();
    if (c.skuSeparator !== b.skuSeparator) catalog.skuSeparator = c.skuSeparator;
    if (c.skuCasing !== b.skuCasing) catalog.skuCasing = c.skuCasing;
    if (c.strictEan !== b.strictEan) catalog.strictEan = c.strictEan;
    if (c.syncSovereignty !== b.syncSovereignty) catalog.syncSovereignty = c.syncSovereignty;
    const gates: Partial<typeof c.gates> = {};
    for (const k of ["hsnCode", "countryOfOrigin", "gstRateSlab"] as const) if (c.gates[k] !== b.gates[k]) gates[k] = c.gates[k];
    if (Object.keys(gates).length) catalog.gates = gates;
    if (Object.keys(catalog).length) patch.catalog = catalog;
  }
  if (has("ext:inventory") && !problems["ext:inventory"]) patch.inventory = cur.ext.inventory;
  if (has("ext:pricing") && !problems["ext:pricing"]) {
    const { channelTiers, ...rest } = cur.ext.pricing;
    // only the channels whose tier changed travel; the others stay as the server has them
    const tiers = Object.fromEntries(Object.entries(channelTiers).filter(([id, t]) => JSON.stringify(t) !== JSON.stringify(base.ext.pricing.channelTiers[id])));
    patch.pricing = { ...rest, ...(Object.keys(tiers).length ? { channelTiers: tiers } : {}) };
  }

  return { patch, ai: has("aiEnabled") ? cur.aiEnabled : null, problems, modified };
}

/** API field paths (`business.cin`, `operations.defaultWarehouseId`, `pan`...) -> form fields */
const PATH_TO_KEY: Record<string, FormKey> = {
  legalName: "legalName",
  displayName: "displayName",
  cin: "cin",
  pan: "pan",
  businessEmail: "supportEmail",
  phone: "supportPhone",
  operatingLocation: "operatingLocation",
  "address.line1": "line1",
  "address.line2": "line2",
  "address.city": "city",
  "address.state": "state",
  "address.pincode": "pincode",
  timezone: "timezone",
  currency: "currency",
  numberFormat: "numberFormat",
  autoAcknowledgeOrders: "autoAcknowledgeOrders",
  roundPriceToNine: "roundPriceToNine",
  defaultInventoryBufferPercent: "bufferPercent",
  defaultFulfillmentMethod: "fulfillmentMethod",
  defaultWarehouseId: "warehouseId",
  lowStockThreshold: "lowStockThreshold",
  "dispatchSlaBreach.thresholdMinutes": "slaMinutes",
  "dispatchSlaBreach.enabled": "alert:dispatchSlaBreach",
  criticalStockouts: "alert:criticalStockouts",
  tokenRenewals: "alert:tokenRenewals",
  syncFailures: "alert:syncFailures",
  returns: "alert:returns",
};

/** splits the API's field errors into form fields and messages that belong to no field */
export function mapServerErrors(fields: Record<string, string>): { byKey: FieldProblems; other: string[] } {
  const byKey: FieldProblems = {};
  const other: string[] = [];
  for (const [path, message] of Object.entries(fields)) {
    const group = /^(preferences|catalog|inventory|pricing)\./.exec(path)?.[1] as ExtGroup | undefined;
    if (group) {
      byKey[extKey(group)] ??= message;
      continue;
    }
    const bare = path.replace(/^(business|regional|operations|alerts)\./, "");
    const key = PATH_TO_KEY[bare];
    if (key) byKey[key] ??= message;
    else other.push(message);
  }
  return { byKey, other };
}

/** the DOM id of an input, so a problem can be scrolled to and focused */
export const fieldId = (key: FormKey) => `settings-${key.replace(":", "-")}`;
