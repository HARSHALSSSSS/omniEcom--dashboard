import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";

/** the wizard steps, in order; the keys are also the route slugs of /onboarding/:step */
export const STEP_KEYS = ["business", "channels", "products", "inventory", "fulfillment", "ready"] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export type StepStatus = "not_started" | "in_progress" | "completed" | "skipped";

export type BusinessType = "d2c_brand" | "marketplace_seller" | "retail" | "wholesaler" | "social_commerce" | "other";
export type TeamSize = "just_me" | "2_5" | "6_20" | "21_50" | "50_plus";
export type FulfillmentMethod = "marketplace" | "seller" | "third_party";
export type FulfillmentPreference = "recommended" | "fastest" | "lowest_cost" | "best_rated";
export type StartingMethod = "manual" | "marketplace" | "file";
export type ConnectionState = "connected" | "needs_attention" | "not_connected";

export interface OnboardingBusiness {
  businessName: string;
  businessType: BusinessType | null;
  teamSize: TeamSize | null;
  operatingLocation: string | null;
  workspaceTier: "starter" | "growing" | "scale";
}

export interface OnboardingStepInfo {
  key: StepKey;
  title: string;
  order: number;
  skippable: boolean;
  status: StepStatus;
  completedAt: string | null;
  skippedAt: string | null;
}

/** GET /onboarding (also returned by every step save) */
export interface OnboardingProgress {
  status: "in_progress" | "completed";
  currentStep: StepKey;
  resumeStep: StepKey;
  percentComplete: number;
  completedAt: string | null;
  steps: OnboardingStepInfo[];
  drafts: Partial<Record<StepKey, Record<string, unknown>>>;
  selectedChannels: string[];
  business: OnboardingBusiness;
  version: number;
}

export interface OnboardingOptions {
  businessTypes: Array<{ value: BusinessType; label: string; description: string }>;
  teamSizes: Array<{ value: TeamSize; label: string }>;
  steps: Array<{ key: StepKey; title: string; order: number; skippable: boolean }>;
}

export interface BusinessInput {
  businessName: string;
  businessType: BusinessType;
  teamSize: TeamSize;
  operatingLocation: string;
}

export interface OnboardingChannel {
  code: string;
  name: string;
  kind: "marketplace" | "online_store" | "social";
  description: string;
  availability: "available" | "coming_soon";
  selected: boolean;
  connection: ConnectionState;
  account: {
    id: string;
    displayName: string;
    status: string;
    connectionStatus: string;
    lastSyncedAt: string | null;
    mode: string;
  } | null;
  accountCount: number;
  actions: Array<"connect" | "manage">;
}

export interface ChannelsResult {
  items: OnboardingChannel[];
  summary: { connected: number; selectedToConnect: number; interestedInComingSoon: number };
}

export interface ConnectChannelResult {
  accountId: string;
  created: boolean;
  status: string;
  next: { authorizationUrl: string; authorize: string };
}

/** one field of a connector's credential form (GET /marketplaces/{code} authFlow.fields) */
export interface AuthField {
  key: string;
  label: string;
  type: "text" | "password" | "select";
  required: boolean;
  secret: boolean;
  pattern: string | null;
  help: string | null;
  options?: Array<{ value: string; label: string }>;
}

export interface ConnectorForm {
  code: string;
  displayName: string;
  implementation: "planned" | "beta" | "ga";
  authFlow: {
    type: string;
    mode: "redirect" | "credentials" | "both";
    fields: AuthField[];
    redirectFields: AuthField[];
    partnerGated: boolean;
    refreshable: boolean;
  };
}

export interface CatalogItem {
  accountId: string;
  marketplace: string;
  name: string;
  connection: ConnectionState;
  productsAvailable: number | null;
  productsAvailableIsCapped: boolean;
  countedAt: string | null;
  importedProducts: number;
  awaitingReview: number;
  lastSyncedAt: string | null;
  importStatus: "not_imported" | "importing" | "imported" | "failed";
  lastImportAt: string | null;
  canImport: boolean;
}

export interface CatalogOverview {
  items: CatalogItem[];
  summary: { connected: number; productsAvailable: number; allCounted: boolean; masterProducts: number; masterVariants: number };
  ways: Record<string, boolean>;
}

export interface RefreshCountsResult {
  counted: Array<{ accountId: string; count: number; capped: boolean }>;
  failed: Array<{ accountId: string; message: string }>;
}

export type SyncJobStatus = "queued" | "running" | "retrying" | "succeeded" | "partially_failed" | "failed" | "dead_lettered" | "cancelled";
export interface SyncJob {
  id: string;
  type: string;
  status: SyncJobStatus;
  marketplaceAccountId: string | null;
  progress: { total: number; done: number; failed: number };
  error?: { code: string; message: string } | null;
}
export const SYNC_JOB_TERMINAL: SyncJobStatus[] = ["succeeded", "partially_failed", "failed", "dead_lettered", "cancelled"];

export interface ImportStarted {
  job: SyncJob;
  alreadyQueued: boolean;
}

export interface InventorySetup {
  mode: "simple" | "warehouse" | null;
  startingMethod: StartingMethod | null;
  location: { id: string; code: string; name: string; city: string | null; state: string | null; address: string | null } | null;
  warehouseCount: number;
  options: {
    modes?: Array<{ value: "simple" | "warehouse"; label: string; description: string; traits: string[] }>;
    startingMethods?: Array<{ value: StartingMethod; label: string }>;
  };
}

export type InventoryInput =
  | { mode: "simple"; startingMethod: StartingMethod; locationName: string }
  | { mode: "warehouse"; startingMethod: StartingMethod; warehouse: { name: string; location?: string; address?: string } };

export interface InventoryOverview {
  products: number;
  units: number;
  lowStock: number;
  outOfStock: number;
  lowStockThreshold: number;
  syncedChannels: Array<{ marketplace: string; name: string }>;
}

export interface FulfillmentSetup {
  configured: boolean;
  defaultMethod: FulfillmentMethod;
  defaultPreference: FulfillmentPreference;
  overrides: Record<string, FulfillmentMethod>;
  methods: Array<{
    value: FulfillmentMethod;
    label: string;
    description: string;
    hint: string;
    available: boolean;
    requiresConnection: boolean;
    unavailableReason: string | null;
  }>;
  preferenceOptions: Array<{ value: FulfillmentPreference; label: string }>;
  connections: {
    marketplaceShipping: { available: boolean; marketplaces: string[] };
    thirdParty: {
      available: boolean;
      providers: Array<{ id: string; code: string; label: string; isDefault: boolean }>;
      connectWith: { method: string; url: string };
    };
  };
  preview: Array<{ kind: "marketplace" | "default"; marketplace: string | null; label: string; method: FulfillmentMethod; isOverride: boolean }>;
  warnings: Array<{ code: string; message: string; marketplace?: string }>;
  flow: string[];
}

export interface FulfillmentInput {
  defaultMethod: FulfillmentMethod;
  defaultPreference: FulfillmentPreference;
  overrides: Record<string, FulfillmentMethod>;
}

export interface Readiness {
  items: Array<{
    key: Exclude<StepKey, "ready">;
    group: string;
    title: string;
    status: "complete" | "connected" | "ready" | "configured" | "needs_attention" | "skipped" | "pending";
  }>;
  percentComplete: number;
  canGoToDashboard: boolean;
  completed: boolean;
  whatHappensNext: Array<{ title: string; body: string }>;
}

export const onboardingApi = {
  get: async (signal?: AbortSignal) => unwrap<OnboardingProgress>(await client.get(ENDPOINTS.ONBOARDING, signal ? { signal } : undefined)),
  options: async (signal?: AbortSignal) => unwrap<OnboardingOptions>(await client.get(ENDPOINTS.ONBOARDING_OPTIONS, signal ? { signal } : undefined)),

  saveBusiness: async (input: BusinessInput) =>
    unwrap<{ business: OnboardingBusiness; state: OnboardingProgress }>(await client.put(ENDPOINTS.ONBOARDING_BUSINESS, input)),
  saveDraft: async (step: StepKey, data: Record<string, unknown>) =>
    unwrap<OnboardingProgress>(await client.put(ENDPOINTS.ONBOARDING_STEP_DRAFT(step), { data })),
  skip: async (step: StepKey) => unwrap<OnboardingProgress>(await client.post(ENDPOINTS.ONBOARDING_STEP_SKIP(step), {})),

  channels: async (signal?: AbortSignal) => unwrap<ChannelsResult>(await client.get(ENDPOINTS.ONBOARDING_CHANNELS, signal ? { signal } : undefined)),
  saveChannels: async (selected: string[]) =>
    unwrap<{ selected: string[]; state: OnboardingProgress }>(await client.put(ENDPOINTS.ONBOARDING_CHANNELS, { selected })),
  connectChannel: async (code: string, body: { displayName?: string; mode?: "live" | "sandbox" } = {}) =>
    unwrap<ConnectChannelResult>(await client.post(ENDPOINTS.ONBOARDING_CHANNEL_CONNECT(code), body)),
  connectorForm: async (code: string, signal?: AbortSignal) => unwrap<ConnectorForm>(await client.get(ENDPOINTS.ONBOARDING_CONNECTOR(code), signal ? { signal } : undefined)),
  /** sends the credentials once; the server validates them with the marketplace before storing them */
  authorizeAccount: async (accountId: string, credentials: Record<string, string>) =>
    unwrap<{ id: string; status: string; connectionStatus: string }>(
      await client.post(ENDPOINTS.ONBOARDING_ACCOUNT_AUTHORIZE(accountId), { credentials }),
    ),

  products: async (signal?: AbortSignal) => unwrap<CatalogOverview>(await client.get(ENDPOINTS.ONBOARDING_PRODUCTS, signal ? { signal } : undefined)),
  refreshCounts: async (accountId?: string) =>
    unwrap<RefreshCountsResult>(await client.post(ENDPOINTS.ONBOARDING_PRODUCTS_REFRESH_COUNTS, accountId ? { accountId } : {})),
  importCatalog: async (accountId: string) =>
    unwrap<ImportStarted>(await client.post(ENDPOINTS.ONBOARDING_PRODUCTS_IMPORT, { accountId })),
  syncJob: async (id: string, signal?: AbortSignal) => unwrap<SyncJob>(await client.get(ENDPOINTS.ONBOARDING_SYNC_JOB(id), signal ? { signal } : undefined)),
  continueProducts: async () => unwrap<OnboardingProgress>(await client.post(ENDPOINTS.ONBOARDING_PRODUCTS_CONTINUE, {})),

  inventory: async (signal?: AbortSignal) => unwrap<InventorySetup>(await client.get(ENDPOINTS.ONBOARDING_INVENTORY, signal ? { signal } : undefined)),
  saveInventory: async (input: InventoryInput) =>
    unwrap<{ warehouseId: string; created: boolean; setup: InventorySetup; state: OnboardingProgress }>(
      await client.put(ENDPOINTS.ONBOARDING_INVENTORY, input),
    ),
  inventoryOverview: async (signal?: AbortSignal) => unwrap<InventoryOverview>(await client.get(ENDPOINTS.ONBOARDING_INVENTORY_OVERVIEW, signal ? { signal } : undefined)),

  fulfillment: async (signal?: AbortSignal) => unwrap<FulfillmentSetup>(await client.get(ENDPOINTS.ONBOARDING_FULFILLMENT, signal ? { signal } : undefined)),
  saveFulfillment: async (input: FulfillmentInput) =>
    unwrap<{ fulfillment: FulfillmentSetup; state: OnboardingProgress }>(await client.put(ENDPOINTS.ONBOARDING_FULFILLMENT, input)),

  readiness: async (signal?: AbortSignal) => unwrap<Readiness>(await client.get(ENDPOINTS.ONBOARDING_READINESS, signal ? { signal } : undefined)),
  complete: async () => unwrap<{ alreadyCompleted: boolean; completedAt: string }>(await client.post(ENDPOINTS.ONBOARDING_COMPLETE, {})),
};
