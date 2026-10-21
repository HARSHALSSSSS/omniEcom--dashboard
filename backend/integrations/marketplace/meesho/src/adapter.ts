import {
  ConnectorError,
  type ConnectorContext, type ConnectorCredentials, type CredentialSet, type HttpTransport, type InternalOrderStatus, type InventoryUpdate, type ListingInput, type ListingPreview,
  type ListingRequirement, type ListingResult, type ListingStatusReport, type MarketplaceCategory, type MarketplaceConnector, type NormalizedOrder, type NormalizedProduct, type NormalizedReturn,
  type OperationResult, type Paged, type PriceUpdate, type RemoteAccount,
} from '@oms/marketplace-core';
import { capabilities, polling, readiness } from './capabilities';
import { MeeshoClient } from './client';
import type { MeeBulkResult } from './dto';
import { selectTarget, targetOf } from './environment';
import { buildProduct, mapAttributes, mapProduct, mapProductReport, mapReturn, mapSubOrder, toIssues } from './mappers';
import { meeshoSimulator } from './simulator';

export interface MeeshoOptions { simulator?: HttpTransport }

const SCOPES = ['supplier'];
/** what a supplier may ask Meesho to do with a sub-order; Meesho assigns the courier and AWB itself */
const FORWARD: Partial<Record<InternalOrderStatus, string>> = { confirmed: 'ACCEPTED', ready_to_dispatch: 'READY_TO_SHIP', dispatched: 'SHIPPED' };

const perItem = (sku: string, results: MeeBulkResult): OperationResult => {
  const r = results.find((x) => x.sku === sku);
  return !r ? { externalSku: sku, ok: false, errorCode: 'NO_RESULT', message: 'Meesho returned no result for this SKU' } : r.ok ? { externalSku: sku, ok: true } : { externalSku: sku, ok: false, errorCode: r.code, message: r.message };
};
const business = (e: unknown): e is ConnectorError => e instanceof ConnectorError && e.kind === 'permanent';

export class MeeshoConnector implements MarketplaceConnector {
  readonly code = 'meesho' as const;
  readonly displayName = 'Meesho Supplier';
  readonly implementation = 'beta' as const;
  readonly capabilities = capabilities;
  readonly readiness = readiness;
  readonly polling = polling;

  private readonly simulator: HttpTransport;
  constructor(opts: MeeshoOptions = {}) { this.simulator = opts.simulator ?? meeshoSimulator; }

  private client(ctx: ConnectorContext): MeeshoClient { const t = targetOf(ctx, this.simulator); return MeeshoClient.from(ctx, t.transport, t.baseUrl); }

  // ---------------------------------------------------------------- authorization (supplier id + API key)
  async authenticate({ credentials, mode, config }: { credentials: ConnectorCredentials; mode?: 'live' | 'sandbox'; config?: Record<string, unknown> }): Promise<CredentialSet & { externalAccountId: string }> {
    const supplierId = typeof credentials.supplierId === 'string' ? credentials.supplierId.trim() : '';
    const apiKey = typeof credentials.apiKey === 'string' ? credentials.apiKey.trim() : '';
    if (!supplierId || !apiKey) throw new ConnectorError('auth', 'supplierId and apiKey are required', { code: 'invalid_credentials' });
    const target = selectTarget({ mode, config }, this.simulator);
    const profile = await new MeeshoClient(target.transport, target.baseUrl, supplierId, apiKey).profile();
    if (!profile.active) throw new ConnectorError('auth', 'The Meesho supplier account is not active', { code: 'supplier_inactive' });
    // the key is static: no expiry, nothing to refresh
    return { externalAccountId: profile.supplierId, credentials: { supplierId: profile.supplierId, apiKey }, scopes: SCOPES };
  }

  async verifyConnection(ctx: ConnectorContext): Promise<{ ok: boolean; message?: string }> {
    const p = await this.client(ctx).profile();
    return { ok: p.active, message: p.active ? `Supplier ${p.supplierId} is active` : 'Supplier account is not active' };
  }

  async getAccount(ctx: ConnectorContext): Promise<RemoteAccount> {
    const p = await this.client(ctx).profile();
    return { externalAccountId: p.supplierId, displayName: p.name, region: 'IN', status: p.active ? 'active' : 'inactive', scopes: SCOPES };
  }

  // ---------------------------------------------------------------- catalogue / categories
  async importProducts(ctx: ConnectorContext, { cursor, limit = 10 }: { cursor?: string | null; limit?: number }): Promise<Paged<NormalizedProduct>> {
    const offset = cursor ? Number(cursor) || 0 : 0;
    const page = await this.client(ctx).products({ offset, limit: Math.min(limit, 20) });
    const next = offset + page.products.length;
    return { items: page.products.map(mapProduct), nextCursor: page.products.length > 0 && next < page.total ? String(next) : null };
  }

  async searchCategories(ctx: ConnectorContext, { query }: { query?: string; parentId?: string | null }): Promise<MarketplaceCategory[]> {
    return (await this.client(ctx).categories(query)).map((c) => ({ id: c.id, name: c.name, path: c.name, parentId: null, leaf: true }));
  }

  async getCategoryRequirements(ctx: ConnectorContext, { marketplaceCategoryId }: { marketplaceCategoryId: string }): Promise<ListingRequirement[]> {
    return mapAttributes(await this.client(ctx).attributes(marketplaceCategoryId));
  }

  // ---------------------------------------------------------------- listings
  previewListing(input: ListingInput): ListingPreview {
    const warnings: string[] = [];
    if (!input.imageUrls?.length) warnings.push('No image URLs: Meesho will not take a product live without images');
    if (!input.mrpMinor) warnings.push('No MRP: Meesho requires MRP');
    return { endpoint: 'POST /supplier/v1/catalog', payload: { products: [buildProduct(input)] }, warnings };
  }

  async createListing(ctx: ConnectorContext, input: ListingInput): Promise<ListingResult> {
    const [r] = await this.client(ctx).upsertProduct(buildProduct(input));
    if (r && !r.ok) {
      const issues = toIssues(r.errors?.length ? r.errors : [{ code: r.code ?? 'INVALID', message: r.message ?? 'Rejected' }]);
      const policy = issues.some((i) => /^POLICY/i.test(i.code));
      return { externalListingId: input.externalSku, status: policy ? 'rejected' : 'correction_required', marketplaceStatus: policy ? 'BLOCKED' : 'ACTION_REQUIRED', issues };
    }
    return { externalListingId: input.externalSku, status: 'pending', marketplaceStatus: 'UNDER_REVIEW', issues: [] };
  }

  async updateListing(ctx: ConnectorContext, input: ListingInput & { externalListingId: string }): Promise<ListingResult> {
    return { ...(await this.createListing(ctx, input)), externalListingId: input.externalListingId };
  }

  async getListingStatus(ctx: ConnectorContext, { externalSku }: { externalSku: string }): Promise<ListingStatusReport> { return mapProductReport(await this.client(ctx).product(externalSku)); }

  async deactivateListing(ctx: ConnectorContext, { externalSku }: { externalSku: string }): Promise<OperationResult> {
    try { await this.client(ctx).deactivate(externalSku); return { externalSku, ok: true }; }
    catch (e) {
      if (business(e)) return { externalSku, ok: false, errorCode: e.code, message: e.message };
      throw e;
    }
  }

  // ---------------------------------------------------------------- inventory / pricing (bulk)
  async pushInventory(ctx: ConnectorContext, updates: InventoryUpdate[]): Promise<OperationResult[]> {
    const client = this.client(ctx);
    const out: OperationResult[] = [];
    for (let i = 0; i < updates.length; i += capabilities.limits.maxBatchSize) {
      const chunk = updates.slice(i, i + capabilities.limits.maxBatchSize);
      const results = await client.updateInventory(chunk.map((u) => ({ sku: u.externalSku, quantity: u.quantity })));
      for (const u of chunk) out.push(perItem(u.externalSku, results));
    }
    return out;
  }

  async pushPrices(ctx: ConnectorContext, updates: PriceUpdate[]): Promise<OperationResult[]> {
    const client = this.client(ctx);
    const out: OperationResult[] = [];
    for (let i = 0; i < updates.length; i += capabilities.limits.maxBatchSize) {
      const chunk = updates.slice(i, i + capabilities.limits.maxBatchSize);
      const results = await client.updatePrices(chunk.map((u) => ({ sku: u.externalSku, price: (u.priceMinor / 100).toFixed(2) })));
      for (const u of chunk) out.push(perItem(u.externalSku, results));
    }
    return out;
  }

  // ---------------------------------------------------------------- orders + returns (polled)
  async fetchOrders(ctx: ConnectorContext, { since, cursor }: { since: Date; cursor?: string | null }): Promise<Paged<NormalizedOrder>> {
    const offset = cursor ? Number(cursor) || 0 : 0;
    const page = await this.client(ctx).orders({ modifiedAfter: since, offset, limit: 20 });
    const next = offset + page.subOrders.length;
    return { items: page.subOrders.map(mapSubOrder), nextCursor: page.subOrders.length > 0 && next < page.total ? String(next) : null };
  }

  async getOrder(ctx: ConnectorContext, { externalOrderId }: { externalOrderId: string }): Promise<NormalizedOrder | null> {
    try { return mapSubOrder(await this.client(ctx).order(externalOrderId)); }
    catch (e) {
      if (e instanceof ConnectorError && e.kind === 'permanent' && e.code === 'not_found') return null;
      throw e;
    }
  }

  canRequestOrderStatus(status: InternalOrderStatus): boolean { return status in FORWARD; }

  async updateOrderStatus(ctx: ConnectorContext, input: { externalOrderId: string; status: InternalOrderStatus; tracking?: { number: string; carrier: string } }): Promise<OperationResult & { marketplaceStatus?: string }> {
    const to = FORWARD[input.status];
    if (!to) return { ok: false, errorCode: 'UNSUPPORTED_STATUS', message: `Meesho cannot be told "${input.status}"` };
    try {
      await this.client(ctx).transition(input.externalOrderId, { status: to, ...(to === 'SHIPPED' && input.tracking ? { courier: input.tracking.carrier, awb: input.tracking.number } : {}) });
      return { ok: true, marketplaceStatus: to };
    } catch (e) {
      if (business(e)) return { ok: false, errorCode: e.code, message: e.message };
      throw e;
    }
  }

  async cancelOrder(ctx: ConnectorContext, { externalOrderId, reason }: { externalOrderId: string; reason?: string }): Promise<OperationResult> {
    try { await this.client(ctx).cancel(externalOrderId, reason ?? 'Out of stock'); return { ok: true }; }
    catch (e) {
      if (business(e)) return { ok: false, errorCode: e.code, message: e.message };
      throw e;
    }
  }

  async fetchReturns(ctx: ConnectorContext, { since, cursor }: { since: Date; cursor?: string | null }): Promise<Paged<NormalizedReturn>> {
    const offset = cursor ? Number(cursor) || 0 : 0;
    const page = await this.client(ctx).returns({ since, offset, limit: 20 });
    const next = offset + page.returns.length;
    return { items: page.returns.map(mapReturn), nextCursor: page.returns.length > 0 && next < page.total ? String(next) : null };
  }
}
