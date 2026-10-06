import { AppError, Errors } from '@oms/shared';

/**
 * Marketplace connector contract.
 *
 * Marketplaces differ wildly (auth model, push vs poll, rate limits, catalogue rules), so the core system NEVER
 * assumes a feature exists: it asks the connector's declared `capabilities` first and degrades or skips.
 * A connector implements only what its marketplace supports.
 *
 * Connectors are pure adapters: no database access, no business rules. They receive a short-lived
 * `ConnectorContext` (decrypted credentials injected by the host at call time) and return NORMALISED data.
 * All marketplace-specific shapes stay inside the connector package.
 */

/** `mock` is the built-in sandbox adapter used for development/testing without marketplace approval. */
export const MARKETPLACES = ['amazon_in', 'flipkart', 'myntra', 'snapdeal', 'mock'] as const;
export type MarketplaceCode = (typeof MARKETPLACES)[number];

export type ImplementationStatus = 'planned' | 'beta' | 'ga';
export type AuthType = 'oauth2_lwa' | 'oauth2' | 'api_key' | 'basic' | 'custom';

export interface ConnectorCapabilities {
  auth: { type: AuthType; refreshable: boolean; /** supports a redirect-based seller authorization flow */ redirectFlow?: boolean };
  account: { fetchProfile: boolean };
  catalog: { import: boolean };
  listings: { create: boolean; update: boolean; deactivate: boolean; fetch: boolean; requiresCategoryMapping: boolean };
  inventory: { push: boolean; pull: boolean; batch: boolean };
  pricing: { push: boolean; pull: boolean };
  orders: { fetch: boolean; webhook: boolean; acknowledge: boolean; updateStatus: boolean; cancel: boolean; maxLookbackDays?: number };
  returns: { fetch: boolean; webhook: boolean };
  shipping: { createShipment: boolean; generateLabel: boolean; marketplaceManagedLogistics: boolean; manifest: boolean };
  /** documented platform limits used by the host's rate limiter / batcher */
  limits: { requestsPerSecond: number; burst: number; maxBatchSize: number };
}

/** Every capability switched off; connectors spread this and enable what their marketplace supports. */
export const NO_CAPABILITIES: Omit<ConnectorCapabilities, 'auth'> = {
  account: { fetchProfile: false },
  catalog: { import: false },
  listings: { create: false, update: false, deactivate: false, fetch: false, requiresCategoryMapping: false },
  inventory: { push: false, pull: false, batch: false },
  pricing: { push: false, pull: false },
  orders: { fetch: false, webhook: false, acknowledge: false, updateStatus: false, cancel: false },
  returns: { fetch: false, webhook: false },
  shipping: { createShipment: false, generateLabel: false, marketplaceManagedLogistics: false, manifest: false },
  limits: { requestsPerSecond: 1, burst: 1, maxBatchSize: 1 },
};

/** Dotted capability path, e.g. "orders.fetch", "inventory.push". */
export type CapabilityPath =
  | 'account.fetchProfile' | 'catalog.import'
  | 'listings.create' | 'listings.update' | 'listings.deactivate' | 'listings.fetch'
  | 'inventory.push' | 'inventory.pull' | 'pricing.push' | 'pricing.pull'
  | 'orders.fetch' | 'orders.webhook' | 'orders.acknowledge' | 'orders.updateStatus' | 'orders.cancel'
  | 'returns.fetch' | 'returns.webhook'
  | 'shipping.createShipment' | 'shipping.generateLabel';

export function hasCapability(c: Pick<MarketplaceConnector, 'capabilities'>, path: CapabilityPath): boolean {
  const [group, key] = path.split('.') as [keyof ConnectorCapabilities, string];
  return Boolean((c.capabilities[group] as Record<string, unknown> | undefined)?.[key]);
}

/** All enabled capabilities as flat strings (used by the API capability matrix). */
export function enabledCapabilities(c: Pick<MarketplaceConnector, 'capabilities'>): string[] {
  const out: string[] = [];
  for (const [group, caps] of Object.entries(c.capabilities)) {
    if (group === 'limits' || group === 'auth') continue;
    for (const [k, v] of Object.entries(caps as Record<string, unknown>)) if (v === true) out.push(`${group}.${k}`);
  }
  return out;
}

export class CapabilityUnsupportedError extends AppError {
  constructor(marketplace: string, capability: string) {
    super('CAPABILITY_UNSUPPORTED', `${marketplace} does not support ${capability}`, { details: { marketplace, capability } });
  }
}

export function requireCapability(c: Pick<MarketplaceConnector, 'capabilities' | 'code'>, path: CapabilityPath): void {
  if (!hasCapability(c, path)) throw new CapabilityUnsupportedError(c.code, path);
}

// ---- errors ----------------------------------------------------------------------------------
export type ConnectorErrorKind =
  | 'auth' // credentials rejected/expired: host refreshes once, then marks the authorization expired
  | 'rate_limited' // 429 / throttled: retry after delay
  | 'transient' // 5xx / network: retry with backoff
  | 'permanent' // 4xx validation etc.: never retry
  | 'unsupported';

export class ConnectorError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly kind: ConnectorErrorKind,
    message: string,
    readonly opts: { code?: string; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = 'ConnectorError';
    this.retryable = kind === 'rate_limited' || kind === 'transient';
  }
  get code(): string { return this.opts.code ?? this.kind; }
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** injectable for tests */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: ConnectorError }) => void;
}

/** Exponential backoff with full jitter; honours `retryAfterMs`; retries only retryable ConnectorErrors. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions = {}): Promise<T> {
  const attempts = o.attempts ?? 3;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const rnd = o.random ?? Math.random;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (!(e instanceof ConnectorError) || !e.retryable || attempt >= attempts) throw e;
      const backoff = Math.min(o.maxDelayMs ?? 5_000, (o.baseDelayMs ?? 200) * 2 ** (attempt - 1));
      const delayMs = Math.max(e.opts.retryAfterMs ?? 0, Math.round(rnd() * backoff));
      o.onRetry?.({ attempt, delayMs, error: e });
      await sleep(delayMs);
    }
  }
}

// ---- credentials / context -------------------------------------------------------------------
export interface ConnectorCredentials {
  /** opaque to core; shape defined by the connector's own validation */
  [key: string]: unknown;
}

export interface CredentialSet {
  credentials: ConnectorCredentials;
  /** when the ACCESS token expires (drives proactive refresh) */
  expiresAt?: Date;
  scopes?: string[];
}

export interface ConnectorContext {
  vendorId: string;
  marketplaceAccountId: string;
  externalAccountId: string | null;
  mode: 'live' | 'sandbox';
  credentials: ConnectorCredentials;
  signal?: AbortSignal;
  requestId?: string;
}

// ---- normalised models -----------------------------------------------------------------------
export interface Paged<T> { items: T[]; nextCursor: string | null }

export interface RemoteAccount { externalAccountId: string; displayName: string; region?: string; status?: string; scopes?: string[] }

export interface RemoteProduct {
  externalListingId: string;
  externalSku: string;
  title: string;
  brand?: string;
  priceMinor?: number;
  currency?: string;
  quantity?: number;
  imageUrls?: string[];
  attributes?: Record<string, unknown>;
  raw?: unknown;
}

export interface ListingInput { externalSku: string; title: string; priceMinor: number; currency: string; quantity?: number; attributes?: Record<string, unknown>; marketplaceCategoryId?: string; imageUrls?: string[] }
export interface ListingResult { externalListingId: string; status: 'live' | 'pending' | 'inactive' | 'error'; message?: string }

export interface NormalizedOrderItem { externalItemId: string; sku: string; title: string; quantity: number; unitPriceMinor: number; taxMinor: number; discountMinor: number }
export interface NormalizedOrder {
  externalOrderId: string; status: string; placedAt: Date; currency: string; totalMinor: number;
  items: NormalizedOrderItem[]; shippingAddress?: Record<string, unknown>; raw: unknown;
}
export interface NormalizedReturn { externalReturnId: string; externalOrderId: string; status: string; reason?: string; requestedAt: Date; raw?: unknown }
export interface InventoryUpdate { externalSku: string; quantity: number }
export interface PriceUpdate { externalSku: string; priceMinor: number; currency: string }
export interface OperationResult { externalSku?: string; ok: boolean; errorCode?: string; message?: string }
export interface ShipmentInput { externalOrderId: string; carrier?: string; weightGrams?: number }
export interface ShipmentResult { trackingNumber: string; carrier: string; labelUrl?: string }

export interface MarketplaceConnector {
  readonly code: MarketplaceCode;
  readonly displayName: string;
  /** planned = contract + capability declaration only (core refuses to schedule work); beta/ga = implemented and conformance-tested */
  readonly implementation: ImplementationStatus;
  readonly capabilities: ConnectorCapabilities;

  // -- authenticate / authorize seller
  buildAuthorizationUrl?(input: { state: string; redirectUri: string }): string;
  exchangeAuthorizationCode?(input: { code: string; redirectUri?: string }): Promise<CredentialSet & { externalAccountId: string }>;
  /** direct credential validation + normalisation (API-key style marketplaces) */
  authenticate?(input: { credentials: ConnectorCredentials }): Promise<CredentialSet & { externalAccountId: string }>;
  refreshCredentials?(ctx: ConnectorContext): Promise<CredentialSet>;
  verifyConnection(ctx: ConnectorContext): Promise<{ ok: boolean; message?: string }>;

  // -- account / catalogue
  getAccount?(ctx: ConnectorContext): Promise<RemoteAccount>;
  importProducts?(ctx: ConnectorContext, input: { cursor?: string | null; limit?: number }): Promise<Paged<RemoteProduct>>;

  // -- listings, inventory, pricing
  createListing?(ctx: ConnectorContext, input: ListingInput): Promise<ListingResult>;
  updateListing?(ctx: ConnectorContext, input: ListingInput & { externalListingId: string }): Promise<ListingResult>;
  pushInventory?(ctx: ConnectorContext, updates: InventoryUpdate[]): Promise<OperationResult[]>;
  pushPrices?(ctx: ConnectorContext, updates: PriceUpdate[]): Promise<OperationResult[]>;

  // -- orders, returns, shipping
  fetchOrders?(ctx: ConnectorContext, input: { since: Date; cursor?: string | null }): Promise<Paged<NormalizedOrder>>;
  updateOrderStatus?(ctx: ConnectorContext, input: { externalOrderId: string; status: string }): Promise<OperationResult>;
  cancelOrder?(ctx: ConnectorContext, input: { externalOrderId: string; reason?: string }): Promise<OperationResult>;
  fetchReturns?(ctx: ConnectorContext, input: { since: Date; cursor?: string | null }): Promise<Paged<NormalizedReturn>>;
  createShipment?(ctx: ConnectorContext, input: ShipmentInput): Promise<ShipmentResult>;

  // -- webhooks
  verifyWebhook?(input: { headers: Record<string, string | undefined>; rawBody: Buffer; secret: string }): boolean;
  parseWebhook?(input: { headers: Record<string, string | undefined>; body: unknown }): { eventType: string; externalId: string; idempotencyKey: string; payload: unknown };
}

/** Throw when core calls an operation the connector doesn't support; always check capabilities first. */
export const unsupported = (code: MarketplaceCode, op: string): AppError => Errors.notImplemented(`${code}.${op}`);

export class ConnectorRegistry {
  private readonly connectors = new Map<MarketplaceCode, MarketplaceConnector>();

  register(connector: MarketplaceConnector): this {
    if (this.connectors.has(connector.code)) throw new Error(`Connector already registered: ${connector.code}`);
    this.connectors.set(connector.code, connector);
    return this;
  }

  has(code: string): boolean { return this.connectors.has(code as MarketplaceCode); }

  get(code: string): MarketplaceConnector {
    const c = this.connectors.get(code as MarketplaceCode);
    if (!c) throw Errors.notFound('Marketplace connector', code);
    return c;
  }

  list(): MarketplaceConnector[] { return [...this.connectors.values()]; }

  /** e.g. registry.supporting(c => c.capabilities.orders.fetch) */
  supporting(pred: (c: MarketplaceConnector) => boolean): MarketplaceConnector[] { return this.list().filter(pred); }
}
