import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ConnectorError,
  NO_CAPABILITIES,
  type ConnectorCapabilities,
  type ConnectorContext,
  type ConnectorErrorKind,
  type CredentialSet,
  type InventoryUpdate,
  type ListingInput,
  type ListingResult,
  type MarketplaceConnector,
  type NormalizedOrder,
  type NormalizedReturn,
  type OperationResult,
  type Paged,
  type PriceUpdate,
  type RemoteAccount,
  type RemoteProduct,
  type ShipmentInput,
  type ShipmentResult,
} from '@oms/marketplace-core';

/**
 * MOCK / SANDBOX marketplace.
 *
 * A fully working in-memory marketplace so the whole platform can be developed and tested WITHOUT production
 * marketplace credentials. It supports every capability and can simulate failures on demand:
 *
 *   authorization   code "sandbox-code[:sellerId[:ttlSeconds]]"  or  credentials { sellerId, apiKey: "sandbox_..." }
 *   products        25 deterministic sample products per seller (paged), listings can be created/updated
 *   inventory/price push updates the seller's catalogue; unknown SKUs return per-item errors
 *   orders/returns  5 deterministic orders per seller; status updates, cancellation, shipments
 *   errors/retries  `mockControl.setBehavior(sellerId, { failNext: 2, failKind: 'transient' })` makes the next 2 calls fail,
 *                   `rateLimitNext` simulates 429 + Retry-After, `expireTokens` invalidates issued access tokens
 *
 * State lives in the module-level `mockControl` (process memory, reset on restart; credentials re-authenticate via refresh token).
 */

export interface MockBehavior {
  /** next N operations fail with `failKind` (default transient) */
  failNext?: number;
  failKind?: Extract<ConnectorErrorKind, 'transient' | 'permanent' | 'auth'>;
  /** next N operations are rate limited (429) with this Retry-After */
  rateLimitNext?: number;
  retryAfterMs?: number;
}

interface MockSeller {
  sellerId: string;
  products: Map<string, RemoteProduct>;
  orders: Map<string, NormalizedOrder>;
  returns: NormalizedReturn[];
  behavior: MockBehavior;
  calls: number;
  listingSeq: number;
}

const DAY = 86_400_000;

export class MockMarketplaceState {
  readonly sellers = new Map<string, MockSeller>();
  /** accessToken -> expiry epoch ms */
  readonly accessTokens = new Map<string, number>();
  /** valid refresh tokens (rotated on use) */
  readonly refreshTokens = new Map<string, string>();
  now: () => Date = () => new Date();

  seller(sellerId: string): MockSeller {
    let s = this.sellers.get(sellerId);
    if (!s) {
      s = { sellerId, products: new Map(), orders: new Map(), returns: [], behavior: {}, calls: 0, listingSeq: 100 };
      this.seed(s);
      this.sellers.set(sellerId, s);
    }
    return s;
  }

  private seed(s: MockSeller): void {
    const base = this.now().getTime();
    for (let i = 1; i <= 25; i++) {
      const sku = `MOCK-${s.sellerId}-SKU-${String(i).padStart(3, '0')}`;
      s.products.set(sku, {
        externalListingId: `MP-${String(i).padStart(5, '0')}`,
        externalSku: sku,
        title: `Sandbox Product ${i}`,
        brand: i % 2 ? 'SandboxBasics' : 'SandboxPro',
        priceMinor: 49_900 + i * 1_000,
        currency: 'INR',
        quantity: 10 * i,
        imageUrls: [`https://sandbox.mock-marketplace.local/img/${i}.jpg`],
        attributes: { color: i % 3 ? 'Blue' : 'Red', size: ['S', 'M', 'L'][i % 3] },
      });
    }
    for (let i = 1; i <= 5; i++) {
      const sku = `MOCK-${s.sellerId}-SKU-${String(i).padStart(3, '0')}`;
      const unit = 49_900 + i * 1_000;
      const id = `MO-${s.sellerId}-${1000 + i}`;
      s.orders.set(id, {
        externalOrderId: id,
        status: 'new',
        placedAt: new Date(base - i * DAY),
        currency: 'INR',
        totalMinor: unit * 2,
        items: [{ externalItemId: `${id}-1`, sku, title: `Sandbox Product ${i}`, quantity: 2, unitPriceMinor: unit, taxMinor: 0, discountMinor: 0 }],
        shippingAddress: { name: 'Sandbox Buyer', city: 'Bengaluru', pincode: '560001', country: 'IN' },
        raw: { sandbox: true },
      });
    }
    s.returns.push({ externalReturnId: `MR-${s.sellerId}-1`, externalOrderId: `MO-${s.sellerId}-1005`, status: 'requested', reason: 'size_issue', requestedAt: new Date(base - DAY) });
  }

  issueTokens(sellerId: string, ttlSeconds: number): { accessToken: string; refreshToken: string; expiresAt: Date } {
    const accessToken = `mock_at_${randomBytes(12).toString('hex')}`;
    const refreshToken = `mock_rt_${randomBytes(12).toString('hex')}`;
    const expiresAt = new Date(this.now().getTime() + ttlSeconds * 1000);
    this.accessTokens.set(accessToken, expiresAt.getTime());
    this.refreshTokens.set(refreshToken, sellerId);
    return { accessToken, refreshToken, expiresAt };
  }
}

/** Test/dev control surface for the sandbox. */
export const mockState = new MockMarketplaceState();
export const mockControl = {
  state: mockState,
  setBehavior(sellerId: string, behavior: MockBehavior): void { mockState.seller(sellerId).behavior = { ...behavior }; },
  calls(sellerId: string): number { return mockState.seller(sellerId).calls; },
  /** make every issued access token expire immediately */
  expireAllAccessTokens(): void { for (const k of mockState.accessTokens.keys()) mockState.accessTokens.set(k, 0); },
  reset(): void {
    mockState.sellers.clear();
    mockState.accessTokens.clear();
    mockState.refreshTokens.clear();
    mockState.now = () => new Date();
  },
};

const DEFAULT_TTL = 3600;
const WEBHOOK_SECRET_HEADER = 'x-mock-signature';

export class MockConnector implements MarketplaceConnector {
  readonly code = 'mock' as const;
  readonly displayName = 'Mock Marketplace (Sandbox)';
  readonly implementation = 'beta' as const;
  readonly capabilities: ConnectorCapabilities = {
    ...NO_CAPABILITIES,
    auth: { type: 'oauth2', refreshable: true, redirectFlow: true },
    account: { fetchProfile: true },
    catalog: { import: true },
    listings: { create: true, update: true, deactivate: true, fetch: true, requiresCategoryMapping: false },
    inventory: { push: true, pull: true, batch: true },
    pricing: { push: true, pull: true },
    orders: { fetch: true, webhook: true, acknowledge: true, updateStatus: true, cancel: true, maxLookbackDays: 90 },
    returns: { fetch: true, webhook: false },
    shipping: { createShipment: true, generateLabel: true, marketplaceManagedLogistics: false, manifest: false },
    limits: { requestsPerSecond: 50, burst: 100, maxBatchSize: 100 },
  };

  constructor(private readonly state: MockMarketplaceState = mockState) {}

  // ------------------------------------------------------------------ authorization
  buildAuthorizationUrl({ state, redirectUri }: { state: string; redirectUri: string }): string {
    const u = new URL('https://sandbox.mock-marketplace.local/oauth/authorize');
    u.searchParams.set('client_id', 'oms-sandbox');
    u.searchParams.set('state', state);
    u.searchParams.set('redirect_uri', redirectUri);
    return u.toString();
  }

  /** code = "sandbox-code[:sellerId[:ttlSeconds]]" */
  async exchangeAuthorizationCode({ code }: { code: string }): Promise<CredentialSet & { externalAccountId: string }> {
    const [prefix, sellerId = 'SANDBOX-001', ttl] = code.split(':');
    if (prefix !== 'sandbox-code') throw new ConnectorError('auth', 'Invalid authorization code', { code: 'invalid_grant' });
    return this.credentialSet(sellerId, ttl ? Number(ttl) : DEFAULT_TTL);
  }

  async authenticate({ credentials }: { credentials: Record<string, unknown> }): Promise<CredentialSet & { externalAccountId: string }> {
    const sellerId = typeof credentials.sellerId === 'string' ? credentials.sellerId : '';
    const apiKey = typeof credentials.apiKey === 'string' ? credentials.apiKey : '';
    if (!sellerId || !apiKey.startsWith('sandbox_')) throw new ConnectorError('auth', 'Invalid sandbox API key (must start with "sandbox_")', { code: 'invalid_api_key' });
    return this.credentialSet(sellerId, typeof credentials.ttlSeconds === 'number' ? credentials.ttlSeconds : DEFAULT_TTL);
  }

  async refreshCredentials(ctx: ConnectorContext): Promise<CredentialSet> {
    await this.simulate(ctx, false);
    const rt = ctx.credentials.refreshToken;
    const sellerId = String(ctx.credentials.sellerId ?? ctx.externalAccountId ?? '');
    // Sandbox is lenient on purpose: any well-formed refresh token works, so credentials survive a process restart.
    if (typeof rt !== 'string' || !rt.startsWith('mock_rt_')) {
      throw new ConnectorError('auth', 'Refresh token rejected', { code: 'invalid_grant' });
    }
    this.state.refreshTokens.delete(rt);
    const set = this.credentialSet(sellerId, Number(ctx.credentials.ttlSeconds ?? DEFAULT_TTL));
    return { credentials: set.credentials, expiresAt: set.expiresAt, scopes: set.scopes };
  }

  async verifyConnection(ctx: ConnectorContext): Promise<{ ok: boolean; message?: string }> {
    await this.simulate(ctx);
    return { ok: true, message: `Sandbox seller ${this.sellerOf(ctx)} reachable` };
  }

  // ------------------------------------------------------------------ account / catalogue
  async getAccount(ctx: ConnectorContext): Promise<RemoteAccount> {
    await this.simulate(ctx);
    const id = this.sellerOf(ctx);
    return { externalAccountId: id, displayName: `Sandbox Seller ${id}`, region: 'IN', status: 'active', scopes: ['catalog', 'inventory', 'orders', 'returns', 'shipping'] };
  }

  async importProducts(ctx: ConnectorContext, { cursor, limit = 10 }: { cursor?: string | null; limit?: number }): Promise<Paged<RemoteProduct>> {
    await this.simulate(ctx);
    const all = [...this.state.seller(this.sellerOf(ctx)).products.values()];
    const start = cursor ? Number(cursor) : 0;
    const items = all.slice(start, start + limit);
    return { items, nextCursor: start + limit < all.length ? String(start + limit) : null };
  }

  // ------------------------------------------------------------------ listings / inventory / pricing
  async createListing(ctx: ConnectorContext, input: ListingInput): Promise<ListingResult> {
    await this.simulate(ctx);
    const s = this.state.seller(this.sellerOf(ctx));
    if (s.products.has(input.externalSku)) throw new ConnectorError('permanent', `SKU ${input.externalSku} already listed`, { code: 'duplicate_sku' });
    const externalListingId = `MP-${++s.listingSeq}`;
    s.products.set(input.externalSku, { externalListingId, externalSku: input.externalSku, title: input.title, priceMinor: input.priceMinor, currency: input.currency, quantity: input.quantity ?? 0, imageUrls: input.imageUrls, attributes: input.attributes });
    return { externalListingId, status: 'live' };
  }

  async updateListing(ctx: ConnectorContext, input: ListingInput & { externalListingId: string }): Promise<ListingResult> {
    await this.simulate(ctx);
    const s = this.state.seller(this.sellerOf(ctx));
    const existing = [...s.products.values()].find((p) => p.externalListingId === input.externalListingId);
    if (!existing) throw new ConnectorError('permanent', 'Listing not found', { code: 'listing_not_found' });
    Object.assign(existing, { title: input.title, priceMinor: input.priceMinor, currency: input.currency, ...(input.quantity !== undefined ? { quantity: input.quantity } : {}), ...(input.attributes ? { attributes: input.attributes } : {}) });
    return { externalListingId: existing.externalListingId, status: 'live' };
  }

  async pushInventory(ctx: ConnectorContext, updates: InventoryUpdate[]): Promise<OperationResult[]> {
    await this.simulate(ctx);
    const s = this.state.seller(this.sellerOf(ctx));
    return updates.map((u) => {
      const p = s.products.get(u.externalSku);
      if (!p) return { externalSku: u.externalSku, ok: false, errorCode: 'SKU_NOT_FOUND', message: 'Unknown SKU' };
      if (u.quantity < 0) return { externalSku: u.externalSku, ok: false, errorCode: 'INVALID_QUANTITY', message: 'Quantity must be >= 0' };
      p.quantity = u.quantity;
      return { externalSku: u.externalSku, ok: true };
    });
  }

  async pushPrices(ctx: ConnectorContext, updates: PriceUpdate[]): Promise<OperationResult[]> {
    await this.simulate(ctx);
    const s = this.state.seller(this.sellerOf(ctx));
    return updates.map((u) => {
      const p = s.products.get(u.externalSku);
      if (!p) return { externalSku: u.externalSku, ok: false, errorCode: 'SKU_NOT_FOUND', message: 'Unknown SKU' };
      p.priceMinor = u.priceMinor;
      p.currency = u.currency;
      return { externalSku: u.externalSku, ok: true };
    });
  }

  // ------------------------------------------------------------------ orders / returns / shipping
  async fetchOrders(ctx: ConnectorContext, { since, cursor }: { since: Date; cursor?: string | null }): Promise<Paged<NormalizedOrder>> {
    await this.simulate(ctx);
    const all = [...this.state.seller(this.sellerOf(ctx)).orders.values()].filter((o) => o.placedAt >= since).sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());
    const start = cursor ? Number(cursor) : 0;
    const items = all.slice(start, start + 3);
    return { items, nextCursor: start + 3 < all.length ? String(start + 3) : null };
  }

  async updateOrderStatus(ctx: ConnectorContext, { externalOrderId, status }: { externalOrderId: string; status: string }): Promise<OperationResult> {
    await this.simulate(ctx);
    const o = this.state.seller(this.sellerOf(ctx)).orders.get(externalOrderId);
    if (!o) return { ok: false, errorCode: 'ORDER_NOT_FOUND', message: 'Unknown order' };
    o.status = status;
    return { ok: true };
  }

  async cancelOrder(ctx: ConnectorContext, { externalOrderId }: { externalOrderId: string; reason?: string }): Promise<OperationResult> {
    await this.simulate(ctx);
    const o = this.state.seller(this.sellerOf(ctx)).orders.get(externalOrderId);
    if (!o) return { ok: false, errorCode: 'ORDER_NOT_FOUND', message: 'Unknown order' };
    if (o.status === 'shipped' || o.status === 'delivered') return { ok: false, errorCode: 'NOT_CANCELLABLE', message: `Order is ${o.status}` };
    o.status = 'cancelled';
    return { ok: true };
  }

  async fetchReturns(ctx: ConnectorContext, { since }: { since: Date; cursor?: string | null }): Promise<Paged<NormalizedReturn>> {
    await this.simulate(ctx);
    return { items: this.state.seller(this.sellerOf(ctx)).returns.filter((r) => r.requestedAt >= since), nextCursor: null };
  }

  async createShipment(ctx: ConnectorContext, { externalOrderId, carrier }: ShipmentInput): Promise<ShipmentResult> {
    await this.simulate(ctx);
    const o = this.state.seller(this.sellerOf(ctx)).orders.get(externalOrderId);
    if (!o) throw new ConnectorError('permanent', 'Unknown order', { code: 'order_not_found' });
    o.status = 'shipped';
    return { trackingNumber: `MOCKTRK${externalOrderId.replace(/\W/g, '').slice(-8)}`, carrier: carrier ?? 'SandboxExpress', labelUrl: `https://sandbox.mock-marketplace.local/labels/${externalOrderId}.pdf` };
  }

  // ------------------------------------------------------------------ webhooks
  verifyWebhook({ headers, rawBody, secret }: { headers: Record<string, string | undefined>; rawBody: Buffer; secret: string }): boolean {
    const sig = headers[WEBHOOK_SECRET_HEADER];
    if (!sig) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook({ body }: { headers: Record<string, string | undefined>; body: unknown }) {
    const b = body as { event: string; id: string };
    return { eventType: b.event, externalId: b.id, idempotencyKey: `mock:${b.id}`, payload: body };
  }

  // ------------------------------------------------------------------ internals
  private credentialSet(sellerId: string, ttlSeconds: number): CredentialSet & { externalAccountId: string } {
    const t = this.state.issueTokens(sellerId, ttlSeconds);
    this.state.seller(sellerId);
    return {
      externalAccountId: sellerId,
      credentials: { sellerId, accessToken: t.accessToken, refreshToken: t.refreshToken, ttlSeconds },
      expiresAt: t.expiresAt,
      scopes: ['catalog', 'inventory', 'orders', 'returns', 'shipping'],
    };
  }

  private sellerOf(ctx: ConnectorContext): string {
    const id = ctx.externalAccountId ?? (typeof ctx.credentials.sellerId === 'string' ? ctx.credentials.sellerId : null);
    if (!id) throw new ConnectorError('permanent', 'No seller id on context');
    return id;
  }

  /** Applies scripted failures and (optionally) validates the access token. Called at the start of every operation. */
  private async simulate(ctx: ConnectorContext, requireToken = true): Promise<void> {
    const s = this.state.seller(this.sellerOf(ctx));
    s.calls++;
    const b = s.behavior;
    if (b.rateLimitNext && b.rateLimitNext > 0) {
      b.rateLimitNext--;
      throw new ConnectorError('rate_limited', 'Sandbox rate limit exceeded', { code: 'throttled', retryAfterMs: b.retryAfterMs ?? 10 });
    }
    if (b.failNext && b.failNext > 0) {
      b.failNext--;
      const kind = b.failKind ?? 'transient';
      throw new ConnectorError(kind, `Simulated ${kind} failure`, { code: `simulated_${kind}` });
    }
    if (requireToken) {
      const token = ctx.credentials.accessToken;
      const exp = typeof token === 'string' ? this.state.accessTokens.get(token) : undefined;
      if (exp === undefined || exp <= this.state.now().getTime()) throw new ConnectorError('auth', 'Access token expired or invalid', { code: 'token_expired' });
    }
  }
}

export const createMockConnector = (): MarketplaceConnector => new MockConnector();
