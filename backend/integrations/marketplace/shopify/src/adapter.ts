import {
  ConnectorError,
  type ConnectorContext, type ConnectorCredentials, type CredentialSet, type HttpTransport, type InternalOrderStatus, type InventoryUpdate, type ListingInput, type ListingPreview,
  type ListingResult, type ListingStatusReport, type MarketplaceConnector, type NormalizedOrder, type NormalizedProduct, type NormalizedWebhook, type OperationResult, type Paged,
  type PriceUpdate, type RemoteAccount,
} from '@oms/marketplace-core';
import { buildAuthorizeUrl, exchangeCode } from './authorization';
import { capabilities, polling, readiness } from './capabilities';
import { ShopifyClient } from './client';
import type { ShpProduct, ShpVariant } from './dto';
import { SCOPES, normalizeShopDomain, selectTarget, shopOf, targetOf, type ShopifyAppCredentials } from './environment';
import { buildProduct, mapOrder, mapProductReport, issuesFromError, mapProductToProduct } from './mappers';
import { shopifySimulator } from './simulator';
import { parseWebhook, verifyWebhook } from './webhooks';

export interface ShopifyOptions {
  /** platform-level Shopify app (SHOPIFY_CLIENT_ID / _SECRET) for the redirect flow. Sandbox needs none. */
  app?: ShopifyAppCredentials;
  simulator?: HttpTransport;
}

const SANDBOX_APP: ShopifyAppCredentials = { clientId: 'sandbox-app', clientSecret: 'sandbox-secret' };
const PAGE = 50;
/** a store with more products than this is read page by page through the catalogue import, not scanned for one SKU */
const MAX_SCAN_PAGES = 20;

const rejected = (sku: string | undefined, e: ConnectorError): OperationResult => ({ externalSku: sku, ok: false, errorCode: e.code, message: e.message });
/** a validation failure is a business answer (reported per item); anything else (auth, outage, throttling) must abort so the engine retries */
const isBusinessError = (e: unknown): e is ConnectorError => e instanceof ConnectorError && e.kind === 'permanent';

export class ShopifyConnector implements MarketplaceConnector {
  readonly code = 'shopify' as const;
  readonly displayName = 'Shopify';
  readonly implementation = 'beta' as const;
  readonly capabilities = capabilities;
  readonly readiness = readiness;
  readonly polling = polling;
  readonly webhook = { signatureHeader: 'x-shopify-hmac-sha256', algorithm: 'HMAC-SHA256 (base64) of the raw body', description: 'Add this URL as a webhook (orders, products, inventory levels) in the Shopify admin and use the secret below as the signing secret' };

  private readonly app: ShopifyAppCredentials;
  private readonly simulator: HttpTransport;
  constructor(opts: ShopifyOptions = {}) { this.app = opts.app ?? SANDBOX_APP; this.simulator = opts.simulator ?? shopifySimulator; }

  private client(ctx: ConnectorContext): ShopifyClient { return ShopifyClient.from(ctx, targetOf(ctx, this.simulator).transport, shopOf(ctx.credentials, ctx.config)); }

  /** the location stock is kept at: the account's configured one, else the first active location of the shop */
  private async locationId(ctx: ConnectorContext, client: ShopifyClient): Promise<number> {
    const configured = Number(ctx.config?.locationId ?? ctx.credentials.locationId);
    if (Number.isInteger(configured) && configured > 0) return configured;
    const first = (await client.locations()).find((l) => l.active);
    if (!first) throw new ConnectorError('permanent', 'The Shopify store has no active location to hold stock', { code: 'no_location' });
    return first.id;
  }

  /** SKU -> (product, variant). Uses the known product id when there is one, else scans the catalogue page by page. */
  private async resolve(client: ShopifyClient, wanted: Array<{ sku: string; productId?: string }>): Promise<Map<string, { product: ShpProduct; variant: ShpVariant }>> {
    const found = new Map<string, { product: ShpProduct; variant: ShpVariant }>();
    const take = (p: ShpProduct) => { for (const v of p.variants) if (v.sku) found.set(v.sku, { product: p, variant: v }); };
    for (const w of wanted.filter((x) => x.productId)) {
      try { take(await client.product(w.productId!)); } catch (e) { if (!(e instanceof ConnectorError && e.code === 'not_found')) throw e; }
    }
    const missing = () => wanted.some((w) => !found.has(w.sku));
    let sinceId: number | undefined;
    for (let page = 0; page < MAX_SCAN_PAGES && missing(); page++) {
      const products = await client.products({ sinceId, limit: 250 });
      products.forEach(take);
      if (products.length < 250) break;
      sinceId = products[products.length - 1]!.id;
    }
    return found;
  }

  // ---------------------------------------------------------------- authorization
  buildAuthorizationUrl({ state, redirectUri, config }: { state: string; redirectUri: string; config?: Record<string, unknown> }): string {
    return buildAuthorizeUrl(this.app, normalizeShopDomain(config?.shopDomain), state, redirectUri);
  }

  async exchangeAuthorizationCode(input: { code: string; redirectUri?: string; mode?: 'live' | 'sandbox'; config?: Record<string, unknown> }): Promise<CredentialSet & { externalAccountId: string }> {
    const shop = normalizeShopDomain(input.config?.shopDomain);
    const target = selectTarget({ mode: input.mode, config: input.config, shop }, this.simulator);
    const { accessToken, scopes } = await exchangeCode(target.transport, shop, this.app, input.code);
    await this.assertShop(target.transport, shop, accessToken);
    return { externalAccountId: shop, credentials: { accessToken, shopDomain: shop }, scopes };
  }

  /** a custom app's Admin API access token ("shpat_...") created in the store's admin */
  async authenticate({ credentials, mode, config }: { credentials: ConnectorCredentials; mode?: 'live' | 'sandbox'; config?: Record<string, unknown> }): Promise<CredentialSet & { externalAccountId: string }> {
    const accessToken = typeof credentials.accessToken === 'string' ? credentials.accessToken.trim() : '';
    if (!accessToken || !(credentials.shopDomain ?? config?.shopDomain)) throw new ConnectorError('auth', 'shopDomain and accessToken are required', { code: 'invalid_credentials' });
    const shop = normalizeShopDomain(credentials.shopDomain ?? config?.shopDomain);
    const target = selectTarget({ mode, config, shop }, this.simulator);
    await this.assertShop(target.transport, shop, accessToken);
    return { externalAccountId: shop, credentials: { accessToken, shopDomain: shop }, scopes: SCOPES };
  }

  private async assertShop(transport: HttpTransport, shop: string, token: string): Promise<void> {
    const s = await new ShopifyClient(transport, shop, token).shop();
    if (s.myshopify_domain !== shop) throw new ConnectorError('auth', 'The access token belongs to a different store', { code: 'shop_mismatch' });
  }

  async verifyConnection(ctx: ConnectorContext): Promise<{ ok: boolean; message?: string }> {
    const s = await this.client(ctx).shop();
    return { ok: true, message: `Store ${s.name} (${s.myshopify_domain}) is reachable` };
  }

  async getAccount(ctx: ConnectorContext): Promise<RemoteAccount> {
    const s = await this.client(ctx).shop();
    return { externalAccountId: s.myshopify_domain, displayName: s.name, region: s.country_code, status: 'active', scopes: SCOPES };
  }

  // ---------------------------------------------------------------- catalogue (cursor = id of the last product read)
  async importProducts(ctx: ConnectorContext, { cursor, limit = 10 }: { cursor?: string | null; limit?: number }): Promise<Paged<NormalizedProduct>> {
    const take = Math.min(limit, PAGE);
    const products = await this.client(ctx).products({ sinceId: cursor ? Number(cursor) || undefined : undefined, limit: take });
    return {
      items: products.flatMap((p) => p.variants.filter((v) => v.sku).map((v) => mapProductToProduct(p, v))),
      nextCursor: products.length === take ? String(products[products.length - 1]!.id) : null,
    };
  }

  // ---------------------------------------------------------------- listings (a product is live as soon as it exists: no review step)
  previewListing(input: ListingInput): ListingPreview {
    const warnings: string[] = [];
    if (!input.imageUrls?.length) warnings.push('No image URLs: the product page will have no pictures');
    if (!input.mrpMinor) warnings.push('No MRP: the compare-at price (the struck-through price) will not be shown');
    return { endpoint: 'POST /admin/api/2024-10/products.json', payload: { product: buildProduct(input) }, warnings };
  }

  async createListing(ctx: ConnectorContext, input: ListingInput): Promise<ListingResult> {
    const client = this.client(ctx);
    try {
      const product = await client.createProduct(buildProduct(input));
      const issues = await this.setStock(ctx, client, product.variants[0]!, input.quantity);
      return { externalListingId: String(product.id), status: 'active', marketplaceStatus: product.status, issues };
    } catch (e) {
      if (!isBusinessError(e)) throw e;
      return { externalListingId: input.externalSku, status: 'correction_required', marketplaceStatus: 'rejected', issues: issuesFromError(e.message) };
    }
  }

  async updateListing(ctx: ConnectorContext, input: ListingInput & { externalListingId: string }): Promise<ListingResult> {
    const client = this.client(ctx);
    try {
      const current = await client.product(input.externalListingId);
      const variant = current.variants.find((v) => v.sku === input.externalSku) ?? current.variants[0];
      const product = await client.updateProduct(current.id, { id: current.id, ...buildProduct(input, { variantId: variant?.id }) });
      return { externalListingId: String(product.id), status: 'active', marketplaceStatus: product.status, issues: [] };
    } catch (e) {
      if (!isBusinessError(e)) throw e;
      return { externalListingId: input.externalListingId, status: 'correction_required', marketplaceStatus: 'rejected', issues: issuesFromError(e.message) };
    }
  }

  private async setStock(ctx: ConnectorContext, client: ShopifyClient, variant: ShpVariant, quantity: number | undefined): Promise<ListingResult['issues']> {
    if (quantity === undefined) return [];
    try {
      await client.setInventory({ locationId: await this.locationId(ctx, client), inventoryItemId: variant.inventory_item_id, available: quantity });
      return [];
    } catch (e) {
      if (!isBusinessError(e)) throw e;
      return [{ code: e.code, message: `The product was created but its stock could not be set: ${e.message}`, severity: 'warning' }];
    }
  }

  async getListingStatus(ctx: ConnectorContext, { externalSku, externalListingId }: { externalSku: string; externalListingId?: string }): Promise<ListingStatusReport> {
    const client = this.client(ctx);
    if (externalListingId) return mapProductReport(await client.product(externalListingId), externalSku);
    const hit = (await this.resolve(client, [{ sku: externalSku }])).get(externalSku);
    if (!hit) throw new ConnectorError('permanent', `No Shopify product has the SKU ${externalSku}`, { code: 'not_found' });
    return mapProductReport(hit.product, externalSku);
  }

  /** unpublishing = draft: the product stays in the admin with its history, but the storefront no longer sells it */
  async deactivateListing(ctx: ConnectorContext, { externalSku, externalListingId }: { externalSku: string; externalListingId?: string }): Promise<OperationResult> {
    const client = this.client(ctx);
    try {
      const hit = (await this.resolve(client, [{ sku: externalSku, productId: externalListingId }])).get(externalSku);
      if (!hit) return { externalSku, ok: false, errorCode: 'not_found', message: `No Shopify product has the SKU ${externalSku}` };
      await client.updateProduct(hit.product.id, { id: hit.product.id, status: 'draft' });
      return { externalSku, ok: true };
    } catch (e) {
      if (isBusinessError(e)) return rejected(externalSku, e);
      throw e;
    }
  }

  // ---------------------------------------------------------------- inventory / pricing (one call per SKU)
  async pushInventory(ctx: ConnectorContext, updates: InventoryUpdate[]): Promise<OperationResult[]> {
    const client = this.client(ctx);
    const known = await this.resolve(client, updates.map((u) => ({ sku: u.externalSku, productId: u.externalListingId })));
    const locationId = await this.locationId(ctx, client);
    const out: OperationResult[] = [];
    for (const u of updates) {
      const hit = known.get(u.externalSku);
      if (!hit) { out.push({ externalSku: u.externalSku, ok: false, errorCode: 'not_found', message: `No Shopify product has the SKU ${u.externalSku}` }); continue; }
      try {
        await client.setInventory({ locationId, inventoryItemId: hit.variant.inventory_item_id, available: u.quantity });
        out.push({ externalSku: u.externalSku, ok: true });
      } catch (e) {
        if (!isBusinessError(e)) throw e;
        out.push(rejected(u.externalSku, e));
      }
    }
    return out;
  }

  async pushPrices(ctx: ConnectorContext, updates: PriceUpdate[]): Promise<OperationResult[]> {
    const client = this.client(ctx);
    const known = await this.resolve(client, updates.map((u) => ({ sku: u.externalSku })));
    const out: OperationResult[] = [];
    for (const u of updates) {
      const hit = known.get(u.externalSku);
      if (!hit) { out.push({ externalSku: u.externalSku, ok: false, errorCode: 'not_found', message: `No Shopify product has the SKU ${u.externalSku}` }); continue; }
      try {
        await client.updateVariant(hit.variant.id, { price: (u.priceMinor / 100).toFixed(2) });
        out.push({ externalSku: u.externalSku, ok: true });
      } catch (e) {
        if (!isBusinessError(e)) throw e;
        out.push(rejected(u.externalSku, e));
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- orders (cursor = id of the last order read)
  async fetchOrders(ctx: ConnectorContext, { since, cursor }: { since: Date; cursor?: string | null }): Promise<Paged<NormalizedOrder>> {
    const orders = await this.client(ctx).orders({ updatedSince: since, sinceId: cursor ? Number(cursor) || undefined : undefined, limit: PAGE });
    return { items: orders.map(mapOrder), nextCursor: orders.length === PAGE ? String(orders[orders.length - 1]!.id) : null };
  }

  async getOrder(ctx: ConnectorContext, { externalOrderId }: { externalOrderId: string }): Promise<NormalizedOrder | null> {
    try { return mapOrder(await this.client(ctx).order(externalOrderId)); }
    catch (e) {
      if (e instanceof ConnectorError && e.kind === 'permanent' && e.code === 'not_found') return null;
      throw e;
    }
  }

  /** the only thing a seller tells Shopify about an order is "shipped" (a fulfilment with tracking) */
  canRequestOrderStatus(status: InternalOrderStatus): boolean { return status === 'dispatched'; }

  async updateOrderStatus(ctx: ConnectorContext, input: { externalOrderId: string; status: InternalOrderStatus; tracking?: { number: string; carrier: string } }): Promise<OperationResult & { marketplaceStatus?: string }> {
    if (input.status !== 'dispatched') return { ok: false, errorCode: 'UNSUPPORTED_STATUS', message: `Shopify cannot be told "${input.status}"` };
    const client = this.client(ctx);
    try {
      const open = (await client.fulfillmentOrders(input.externalOrderId)).filter((f) => f.status === 'open' || f.status === 'in_progress');
      if (!open.length) return { ok: false, errorCode: 'NOTHING_TO_FULFIL', message: 'The order has nothing left to fulfil (already shipped or cancelled)' };
      await client.createFulfillment({
        line_items_by_fulfillment_order: open.map((f) => ({ fulfillment_order_id: f.id })),
        ...(input.tracking ? { tracking_info: { number: input.tracking.number, company: input.tracking.carrier } } : {}), notify_customer: false,
      });
      return { ok: true, marketplaceStatus: 'fulfilled' };
    } catch (e) {
      if (isBusinessError(e)) return { ok: false, errorCode: e.code, message: e.message };
      throw e;
    }
  }

  async cancelOrder(ctx: ConnectorContext, { externalOrderId, reason }: { externalOrderId: string; reason?: string }): Promise<OperationResult> {
    try { await this.client(ctx).cancelOrder(externalOrderId, reason ?? 'Cancelled by seller'); return { ok: true }; }
    catch (e) {
      if (isBusinessError(e)) return { ok: false, errorCode: e.code, message: e.message };
      throw e;
    }
  }

  // ---------------------------------------------------------------- webhooks
  verifyWebhook(input: { headers: Record<string, string | undefined>; rawBody: Buffer; secret: string }): boolean { return verifyWebhook(input); }
  parseWebhook(input: { headers: Record<string, string | undefined>; body: unknown }): NormalizedWebhook | null { return parseWebhook(input); }
}
