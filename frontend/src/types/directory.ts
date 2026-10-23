/** Connector directory and guided connect (GET /marketplace-hub/directory, POST /marketplace-hub/connect, POST /marketplace-hub/oauth/complete). */

export type ConnectorCategory = "marketplace" | "storefront" | "shipping";
export type DirectoryStatus =
  "available" | "connected" | "needs_attention" | "unavailable";
export type Implementation = "planned" | "beta" | "ga";

/** one field of a connector's credential form */
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

export interface AuthFlow {
  type: string;
  mode: "redirect" | "credentials" | "both";
  fields: AuthField[];
  redirectFields: AuthField[];
  partnerGated: boolean;
  refreshable: boolean;
}

export interface DirectoryItem {
  /** the connector code */
  id: string;
  name: string;
  category: ConnectorCategory;
  description: string;
  logoKey: string;
  supportedRegions: string[];
  implementation: Implementation;
  status: DirectoryStatus;
  statusReason: string | null;
  accountCount: number;
  partnerGated: boolean;
  authFlow: AuthFlow;
  /** flat capability strings, e.g. orders.fetch */
  capabilities: string[];
  capabilityTags: string[];
  readiness: { sandbox: boolean; live: boolean; notes: string };
  limits: { requestsPerSecond: number; burst: number; maxBatchSize: number };
  webhooks: boolean;
}

export interface DirectorySummary {
  total: number;
  connected: number;
  needsAttention: number;
  available: number;
  unavailable: number;
}

export interface Directory {
  items: DirectoryItem[];
  summary: DirectorySummary;
}

export interface ConnectorReadiness {
  code: string;
  sandbox: boolean;
  live: boolean;
  notes: string;
  defaultMode: "live" | "sandbox";
}

export interface SyncOptions {
  syncCatalog: boolean;
  syncOrders: boolean;
  syncInventory: boolean;
  runFirstSync: boolean;
}

export type ConnectStepName =
  "create_account" | "authorize" | "test" | "first_sync";

export interface ConnectStep {
  name: ConnectStepName;
  ok: boolean;
  skipped: boolean;
  message: string | null;
  durationMs: number;
}

export interface ConnectedAccount {
  id: string;
  name: string;
  marketplace: string;
  connectorName: string;
  mode: "live" | "sandbox";
  accountIdentifier: string | null;
  accountStatus: string;
}

export interface ConnectResult {
  status: "connected" | "awaiting_authorization" | "failed";
  ok: boolean;
  steps: ConnectStep[];
  account: ConnectedAccount | null;
  /** a half-created account was removed after the failure */
  cleanedUp: boolean;
  redirect: {
    accountId: string;
    authorizationUrl: string;
    state: string;
    expiresInSeconds: number;
  } | null;
  jobs: Array<{ id: string; type: string; status: string }>;
  error: { code: string; message: string } | null;
}

export interface ConnectInput {
  marketplace: string;
  displayName: string;
  region?: string;
  mode?: "live" | "sandbox";
  credentials?: Record<string, string>;
  config?: Record<string, string>;
  redirectUri?: string;
  syncOptions: SyncOptions;
}

export interface OauthCompleteInput {
  state: string;
  code: string;
  redirectUri?: string;
  externalAccountId?: string;
  syncOptions?: SyncOptions;
}

/** what the setup page keeps in sessionStorage while the seller approves access on the marketplace (never credentials) */
export interface PendingOauth {
  connectorCode: string;
  connectorName: string;
  accountId: string;
  state: string;
  syncOptions: SyncOptions;
  redirectUri: string;
  returnPath: string;
  startedAt: number;
}
