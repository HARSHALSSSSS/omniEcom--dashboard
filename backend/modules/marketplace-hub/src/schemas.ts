import { z } from 'zod';
import { IsoDate } from '@oms/contracts';
import { SyncJobSchema } from '@oms/mod-sync';
import { AuthFlowSchema } from '@oms/mod-marketplace-connectors';

export const HealthStatusSchema = z.enum(['healthy', 'warning', 'error', 'paused']);

export const AccountCardSchema = z
  .object({
    id: z.string(),
    marketplace: z.string().describe('Connector code, e.g. flipkart'),
    name: z.string().describe('The seller-chosen display name of the account'),
    connectorName: z.string(),
    category: z.enum(['marketplace', 'storefront', 'shipping']),
    logoKey: z.string(),
    accountIdentifier: z.string().nullable().describe('Seller / shop id assigned by the marketplace'),
    mode: z.enum(['live', 'sandbox']),
    region: z.string(),
    status: HealthStatusSchema.describe('healthy | warning | error | paused, from the health score and the account state'),
    accountStatus: z.enum(['pending_authorization', 'active', 'paused', 'error', 'revoked']),
    connectionStatus: z.enum(['unknown', 'connected', 'degraded', 'disconnected', 'error']),
    authType: z.string(),
    connectedAt: IsoDate.nullable(),
    lastSyncAt: IsoDate.nullable(),
    nextSyncAt: IsoDate.nullable().describe('Last sync + the polling interval of the connector; null when nothing is scheduled'),
    syncState: z.enum(['idle', 'syncing', 'error', 'paused']),
    syncProgress: z.number().int().min(0).max(100).nullable().describe('Percent done of the running sync jobs; null when none runs or the total is unknown'),
    stats: z.object({
      activeListings: z.number().int(), pendingOrders: z.number().int(), syncedInventoryItems: z.number().int(),
      errorCount: z.number().int().describe('Listings the marketplace rejected or wants corrected + sync runs that failed in the last 24 hours'),
    }),
    health: z.object({
      pulseScore: z.number().int().min(0).max(100),
      riskLevel: z.enum(['low', 'medium', 'high']),
      frictionPoints: z.array(z.string()),
      rateLimitRemainingPct: z.number().int().min(0).max(100).nullable().describe('Percent of the per-account request allowance (token bucket, burst) that is free right now; measured in this server process, so it is 100 after a restart. null when the account is not active'),
      tokenExpiresInDays: z.number().int().nullable().describe('null when the credential does not expire'),
      tokenExpiresAt: IsoDate.nullable(),
      syncSuccessRate24h: z.number().nullable().describe('Percent of finished sync runs in the last 24 hours that completed; null when none finished'),
      syncRuns24h: z.object({ finished: z.number().int(), failed: z.number().int() }),
    }),
    capabilities: z.array(z.string()).describe('Flat list, e.g. orders.fetch'),
    capabilityTags: z.array(z.string()).describe('Screen chips: product_import, listings, inventory, orders, shipping, returns, promotions'),
    implementation: z.enum(['planned', 'beta', 'ga']),
    version: z.number().int(),
  })
  .meta({ id: 'HubAccountCard' });

export const SummarySchema = z.object({ total: z.number().int(), healthy: z.number().int(), warning: z.number().int(), error: z.number().int(), paused: z.number().int() });

export const DirectoryItemSchema = z
  .object({
    id: z.string().describe('Connector code'),
    name: z.string(),
    category: z.enum(['marketplace', 'storefront', 'shipping']),
    description: z.string(),
    logoKey: z.string(),
    supportedRegions: z.array(z.string()),
    implementation: z.enum(['planned', 'beta', 'ga']),
    status: z.enum(['available', 'connected', 'needs_attention', 'unavailable']),
    statusReason: z.string().nullable().describe('Why the connector is unavailable, or what needs attention'),
    accountCount: z.number().int(),
    partnerGated: z.boolean(),
    authFlow: AuthFlowSchema,
    capabilities: z.array(z.string()),
    capabilityTags: z.array(z.string()),
    readiness: z.object({ sandbox: z.boolean(), live: z.boolean(), notes: z.string() }).describe('Whether the connector is verified against a sandbox and against the live marketplace'),
    limits: z.object({ requestsPerSecond: z.number(), burst: z.number().int(), maxBatchSize: z.number().int() }).describe('Documented platform limits the host enforces per account'),
    webhooks: z.boolean().describe('The marketplace can push events (orders) to this platform'),
    rating: z.null(), reviewsCount: z.null(), pricing: z.null(),
  })
  .meta({ id: 'HubDirectoryItem' });

export const WebhookStatusSchema = z.object({
  supported: z.boolean(), configured: z.boolean().describe('A signing secret exists for this account'), secretRotatedAt: IsoDate.nullable(), signatureHeader: z.string().nullable(),
  lastEventAt: IsoDate.nullable(), events24h: z.record(z.string(), z.number().int()).describe('Webhook deliveries of the last 24 hours by status'),
});

export const InventoryPolicySchema = z.object({
  mode: z.enum(['sync', 'paused']), safetyBuffer: z.number().int(), allocationPercent: z.number().int(), maxQuantity: z.number().int().nullable(), warehouseIds: z.array(z.string()), isDefault: z.boolean(),
});

export const AccountDetailSchema = AccountCardSchema.extend({
  capabilityMatrix: z.record(z.string(), z.unknown()).describe('Nested capability flags of the connector'),
  readiness: z.object({ sandbox: z.boolean(), live: z.boolean(), notes: z.string() }),
  recentJobs: z.array(SyncJobSchema),
  lanes: z.array(z.object({ key: z.string(), label: z.string(), status: z.enum(['healthy', 'warning', 'error', 'idle']), jobs: z.number().int(), finished: z.number().int(), failed: z.number().int(), successRate: z.number().nullable(), itemsProcessed: z.number().int(), itemsPerHour: z.number() })),
  webhook: WebhookStatusSchema,
  inventoryPolicy: InventoryPolicySchema,
  listingsByStatus: z.record(z.string(), z.number().int()),
  authorization: z.object({ status: z.string(), scopes: z.array(z.string()), lastRefreshedAt: IsoDate.nullable(), rotationCount: z.number().int() }).nullable(),
}).meta({ id: 'HubAccountDetail' });

export const SYNC_SCOPES = ['orders', 'inventory', 'listings', 'catalog'] as const;
export const SyncBody = z.object({ scopes: z.array(z.enum(SYNC_SCOPES)).min(1).max(4).optional().describe('Default: everything the connector supports') });

export const SyncStartSchema = z.object({
  accountId: z.string(),
  jobs: z.array(z.object({ scope: z.enum(SYNC_SCOPES), job: SyncJobSchema, created: z.boolean().describe('false = an equivalent queued job was reused') })),
  skipped: z.array(z.object({ scope: z.enum(SYNC_SCOPES), reason: z.string() })),
});

export const SyncStatusSchema = z.object({
  accountId: z.string(),
  state: z.enum(['idle', 'syncing', 'error', 'paused']),
  progress: z.number().int().min(0).max(100).nullable(),
  active: z.array(SyncJobSchema),
  latest: z.array(SyncJobSchema).describe('The most recent job of every type in the last 24 hours'),
  lastSyncedAt: IsoDate.nullable(),
  nextSyncAt: IsoDate.nullable(),
});

export const ConnectBody = z
  .object({
    marketplace: z.string().trim().min(2).max(40).meta({ example: 'flipkart', description: 'Connector code from GET /marketplace-hub/directory' }),
    displayName: z.string().trim().min(2).max(120).meta({ example: 'Acme - Flipkart' }),
    region: z.string().trim().length(2).toUpperCase().default('IN'),
    mode: z.enum(['live', 'sandbox']).optional().describe('Default: live when the connector is verified for live use, otherwise sandbox'),
    credentials: z.record(z.string(), z.unknown()).optional().describe('The form from the connector authFlow.fields (secrets are sent once, stored encrypted, never returned)'),
    config: z.record(z.string(), z.unknown()).optional().describe('Non-secret account configuration, e.g. the Shopify shopDomain for the redirect flow'),
    code: z.string().min(1).max(2000).optional().describe('Authorization code returned after the redirect (needs `state`; the account is the one the state was issued for)'),
    state: z.string().min(10).max(1000).optional(),
    externalAccountId: z.string().min(1).max(100).optional().describe('Seller id returned next to the code by marketplaces that send it separately (e.g. Amazon selling_partner_id)'),
    redirectUri: z.url().optional().describe('Where the marketplace sends the seller back; required to START a redirect connection'),
    syncOptions: z.object({ syncCatalog: z.boolean().default(true), syncOrders: z.boolean().default(true), syncInventory: z.boolean().default(true), runFirstSync: z.boolean().default(true) }).default({ syncCatalog: true, syncOrders: true, syncInventory: true, runFirstSync: true }),
  })
  .refine((b) => !(b.credentials !== undefined && b.code !== undefined), { message: 'Send either `credentials` or `code`, not both' })
  .refine((b) => b.code === undefined || b.state !== undefined, { message: '`state` is required with `code`', path: ['state'] });

export const StepSchema = z.object({ name: z.enum(['create_account', 'authorize', 'test', 'first_sync']), ok: z.boolean(), skipped: z.boolean(), message: z.string().nullable(), durationMs: z.number().int() });

export const ConnectResultSchema = z
  .object({
    status: z.enum(['connected', 'awaiting_authorization', 'failed']),
    ok: z.boolean(),
    steps: z.array(StepSchema),
    account: AccountCardSchema.nullable().describe('null when the attempt failed and the half-created account was removed'),
    cleanedUp: z.boolean().describe('A half-created account was removed after the failure'),
    redirect: z.object({ accountId: z.string(), authorizationUrl: z.string(), state: z.string(), expiresInSeconds: z.number().int() }).nullable(),
    jobs: z.array(SyncJobSchema),
    error: z.object({ code: z.string(), message: z.string() }).nullable(),
  })
  .meta({ id: 'HubConnectResult' });

export const OauthCompleteBody = z.object({ state: z.string().min(10).max(1000), code: z.string().min(1).max(2000), redirectUri: z.url().optional(), externalAccountId: z.string().min(1).max(100).optional(), syncOptions: ConnectBody.shape.syncOptions.optional() });

export const HealthSchema = z
  .object({
    overallPulseScore: z.number().int().nullable().describe('Average health score of the active connections; null when none is connected'),
    networkStatus: z.enum(['optimal', 'degraded', 'critical', 'not_connected']),
    connectionsCount: z.number().int(),
    totalActiveListings: z.number().int(),
    totalPendingOrders: z.number().int(),
    syncReliability: z.object({ windowHours: z.number().int(), finished: z.number().int(), failed: z.number().int(), successRate: z.number().nullable() }),
    dataFlowLanes: z.array(z.object({ key: z.string(), label: z.string(), status: z.enum(['healthy', 'warning', 'error', 'idle']), jobs: z.number().int(), finished: z.number().int(), failed: z.number().int(), successRate: z.number().nullable(), itemsProcessed: z.number().int(), itemsPerHour: z.number() })),
    summary: SummarySchema,
    connections: z.array(AccountCardSchema),
    tokenWarnings: z.array(z.object({ accountId: z.string(), name: z.string(), marketplace: z.string(), daysLeft: z.number().int().nullable(), expired: z.boolean() })),
  })
  .meta({ id: 'HubHealth' });
