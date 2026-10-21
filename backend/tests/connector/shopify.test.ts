import { beforeEach, describe, expect, it } from 'vitest';
import { createShopifyConnector, normalizeShopDomain, shopifyControl, toInternalShopifyOrderStatus } from '@oms/connector-shopify';
import { ConnectorError, enabledCapabilities, type ConnectorContext, type ListingInput } from '@oms/marketplace-core';

/**
 * Shopify connector against its in-process simulator, over the connector's REAL client (Admin REST paths, headers, JSON shapes, errors).
 * It proves OUR code (auth, mapping, error classification, per-item results), not Shopify's behaviour.
 */
const connector = createShopifyConnector();
const control = shopifyControl;
let seller: string;
let ctx: ConnectorContext;
let n = 0;

const creds = (s: string) => ({ shopDomain: `${s}.myshopify.com`, accessToken: `shpat_sandbox_${s}` });
const input = (sku: string, o: Partial<ListingInput> = {}): ListingInput => ({ externalSku: sku, title: 'A comfortable cotton tee shirt', brand: 'Acme', priceMinor: 49900, mrpMinor: 59900, currency: 'INR', quantity: 5, ...o });

beforeEach(async () => {
  control.reset();
  seller = `shop${++n}x`;
  const a = await connector.authenticate!({ credentials: creds(seller), mode: 'sandbox' });
  ctx = { vendorId: 'v1', marketplaceAccountId: 'a1', externalAccountId: a.externalAccountId, mode: 'sandbox', credentials: a.credentials };
});

describe('declaration', () => {
  it('is a beta connector, sandbox-ready and never claims live access it has not earned', () => {
    expect(connector).toMatchObject({ code: 'shopify', implementation: 'beta' });
    expect(connector.readiness).toMatchObject({ sandbox: true, live: false });
    expect(connector.readiness.notes.length).toBeGreaterThan(40);
    expect(connector.capabilities.auth).toMatchObject({ type: 'oauth2', refreshable: false, redirectFlow: true });
    expect(connector.refreshCredentials).toBeUndefined();
  });

  it('declares only what it implements, honestly (no categories, no review, one SKU per stock call)', () => {
    const have = new Set(enabledCapabilities(connector));
    for (const cap of ['orders.fetch', 'orders.webhook', 'orders.updateStatus', 'orders.cancel', 'inventory.push', 'pricing.push', 'listings.create', 'catalog.import']) expect(have.has(cap), cap).toBe(true);
    for (const cap of ['listings.categorySearch', 'returns.fetch', 'shipping.createShipment', 'inventory.batch']) expect(have.has(cap), cap).toBe(false);
    expect(connector.capabilities.listings.requiresCategoryMapping).toBe(false);
    expect(typeof connector.verifyWebhook).toBe('function');
    expect(connector.searchCategories).toBeUndefined();
  });
});

describe('shop domain', () => {
  it('accepts a store name, a domain or a pasted admin URL', () => {
    expect(normalizeShopDomain('My-Store')).toBe('my-store.myshopify.com');
    expect(normalizeShopDomain('my-store.myshopify.com')).toBe('my-store.myshopify.com');
    expect(normalizeShopDomain('https://my-store.myshopify.com/admin/products?x=1')).toBe('my-store.myshopify.com');
  });
  it('never accepts a host that is not *.myshopify.com (no server-side request to an arbitrary host)', () => {
    for (const bad of ['', 'evil.com', 'my-store.myshopify.com.evil.com', '127.0.0.1', 'localhost:8080', 'a b.myshopify.com', 'https://evil.com/my.myshopify.com', undefined, 42]) {
      expect(() => normalizeShopDomain(bad), String(bad)).toThrow(ConnectorError);
    }
  });
});

describe('authentication + authorization', () => {
  it('authenticates a custom-app token and returns the shop as the account id; no expiry, nothing to refresh', async () => {
    const a = await connector.authenticate!({ credentials: creds('alpha'), mode: 'sandbox' });
    expect(a.externalAccountId).toBe('alpha.myshopify.com');
    expect(a.credentials).toEqual({ accessToken: 'shpat_sandbox_alpha', shopDomain: 'alpha.myshopify.com' });
    expect(a.expiresAt).toBeUndefined();
    expect((await connector.verifyConnection({ ...ctx, credentials: a.credentials })).ok).toBe(true);
    expect(await connector.getAccount!(ctx)).toMatchObject({ externalAccountId: `${seller}.myshopify.com`, region: 'IN' });
  });

  it('takes the shop from the account configuration when the credentials carry only the token', async () => {
    const a = await connector.authenticate!({ credentials: { accessToken: `shpat_sandbox_${seller}` }, config: { shopDomain: `${seller}.myshopify.com` }, mode: 'sandbox' });
    expect(a.externalAccountId).toBe(`${seller}.myshopify.com`);
  });

  it('rejects bad credentials as an AUTH error that is never retried', async () => {
    await expect(connector.authenticate!({ credentials: { shopDomain: 'x.myshopify.com', accessToken: 'wrong' }, mode: 'sandbox' })).rejects.toMatchObject({ kind: 'auth', retryable: false });
    await expect(connector.authenticate!({ credentials: {}, mode: 'sandbox' })).rejects.toMatchObject({ kind: 'auth', code: 'invalid_credentials' });
    await expect(connector.authenticate!({ credentials: { shopDomain: 'evil.com', accessToken: 'shpat_sandbox_a' }, mode: 'sandbox' })).rejects.toMatchObject({ kind: 'auth', code: 'invalid_shop_domain' });
  });

  it('refuses a token that belongs to another store', async () => {
    await expect(connector.authenticate!({ credentials: { shopDomain: 'store-b.myshopify.com', accessToken: 'shpat_sandbox_storea' }, mode: 'sandbox' })).rejects.toMatchObject({ kind: 'auth', code: 'shop_mismatch' });
  });

  it('builds the consent URL on the shop with our state and scopes, and exchanges the code for a permanent token', async () => {
    const url = new URL(connector.buildAuthorizationUrl!({ state: 'STATE123', redirectUri: 'https://app.example/cb', config: { shopDomain: `${seller}.myshopify.com` } }));
    expect(url.host).toBe(`${seller}.myshopify.com`);
    expect(url.pathname).toBe('/admin/oauth/authorize');
    expect(url.searchParams.get('state')).toBe('STATE123');
    expect(url.searchParams.get('scope')).toContain('write_inventory');
    expect(() => connector.buildAuthorizationUrl!({ state: 's', redirectUri: 'https://app.example/cb', config: {} })).toThrow(ConnectorError);

    const done = await connector.exchangeAuthorizationCode!({ code: `shpsandbox:${seller}`, redirectUri: 'https://app.example/cb', mode: 'sandbox', config: { shopDomain: `${seller}.myshopify.com` } });
    expect(done.externalAccountId).toBe(`${seller}.myshopify.com`);
    expect(done.expiresAt).toBeUndefined();
    expect(done.scopes).toContain('read_orders');
    expect((await connector.verifyConnection({ ...ctx, credentials: done.credentials })).ok).toBe(true);
    await expect(connector.exchangeAuthorizationCode!({ code: 'garbage', mode: 'sandbox', config: { shopDomain: `${seller}.myshopify.com` } })).rejects.toMatchObject({ kind: 'auth', code: 'invalid_grant' });
  });

  it('a scripted 401 is an auth error; 429 carries Retry-After; 5xx is transient', async () => {
    control.setBehavior(seller, { authFailNext: 1 });
    await expect(connector.verifyConnection(ctx)).rejects.toMatchObject({ kind: 'auth' });
    control.setBehavior(seller, { rateLimitNext: 1, retryAfterSec: 7 });
    const e = await connector.fetchOrders!(ctx, { since: new Date(0) }).catch((x) => x);
    expect(e).toMatchObject({ kind: 'rate_limited', retryable: true });
    expect(e.opts.retryAfterMs).toBe(7000);
    control.setBehavior(seller, { failNext: 1, failStatus: 503 });
    expect(await connector.fetchOrders!(ctx, { since: new Date(0) }).catch((x) => x)).toMatchObject({ kind: 'transient', retryable: true });
  });

  it('error messages never contain the access token', async () => {
    control.setBehavior(seller, { failNext: 1, failStatus: 500 });
    const e = (await connector.fetchOrders!(ctx, { since: new Date(0) }).catch((x) => x)) as Error;
    expect(`${e.message} ${JSON.stringify((e as ConnectorError).opts)}`).not.toContain('shpat_sandbox');
  });
});

describe('catalogue and listings', () => {
  it('pages the whole catalogue by cursor and normalises money to minor units', async () => {
    const skus: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<NonNullable<typeof connector.importProducts>>> = await connector.importProducts!(ctx, { cursor, limit: 3 });
      pages++;
      for (const p of page.items) {
        skus.push(p.externalSku);
        expect(p).toMatchObject({ currency: 'INR', status: 'active' });
        expect(Number.isInteger(p.priceMinor)).toBe(true);
        expect(p.mrpMinor).toBeGreaterThan(p.priceMinor!);
      }
      cursor = page.nextCursor;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(skus).size).toBe(8);
  });

  it('previews the request without a network call', () => {
    const before = control.calls(seller);
    const p = connector.previewListing!(input('PREVIEW-1'));
    expect(JSON.stringify(p.payload)).toContain('PREVIEW-1');
    expect(p.warnings.length).toBeGreaterThan(0);
    expect(control.calls(seller)).toBe(before);
  });

  it('creates a listing that is live at once, with stock, MRP as compare-at price and the product id as listing id', async () => {
    const r = await connector.createListing!(ctx, input('NEW-1', { imageUrls: ['https://img.example/a.jpg'] }));
    expect(r).toMatchObject({ status: 'active', marketplaceStatus: 'active', issues: [] });
    expect(r.externalListingId).toMatch(/^\d+$/);
    const live = control.listing(seller, 'NEW-1')!;
    expect(live).toMatchObject({ priceMinor: 49900, mrpMinor: 59900, quantity: 5, status: 'active' });
    expect((await connector.getListingStatus!(ctx, { externalSku: 'NEW-1', externalListingId: r.externalListingId })).status).toBe('active');
    // without a listing id the product is found by SKU
    expect((await connector.getListingStatus!(ctx, { externalSku: 'NEW-1' })).externalListingId).toBe(r.externalListingId);
    const upd = await connector.updateListing!(ctx, { ...input('NEW-1', { title: 'A renamed cotton tee shirt', priceMinor: 45900 }), externalListingId: r.externalListingId });
    expect(upd.status).toBe('active');
    expect(control.listing(seller, 'NEW-1')).toMatchObject({ title: 'A renamed cotton tee shirt', priceMinor: 45900 });
  });

  it('maps Shopify validation errors to correction_required with the offending field', async () => {
    const blank = await connector.createListing!(ctx, input('BAD-1', { title: '   ' }));
    expect(blank.status).toBe('correction_required');
    expect(blank.issues).toEqual([expect.objectContaining({ code: 'validation_failed', attribute: 'title', severity: 'error' })]);
    await connector.createListing!(ctx, input('DUP-1'));
    const dup = await connector.createListing!(ctx, input('DUP-1'));
    expect(dup.status).toBe('correction_required');
    expect(dup.issues[0]).toMatchObject({ attribute: 'sku', message: expect.stringContaining('already been taken') });
  });

  it('unpublishing makes the product a draft; an unknown SKU is a per-item failure, not an exception', async () => {
    const [first] = (await connector.importProducts!(ctx, { limit: 1 })).items;
    expect(await connector.deactivateListing!(ctx, { externalSku: first!.externalSku })).toMatchObject({ ok: true });
    expect(control.listing(seller, first!.externalSku)?.status).toBe('inactive');
    expect((await connector.getListingStatus!(ctx, { externalSku: first!.externalSku, externalListingId: first!.externalListingId })).status).toBe('inactive');
    expect(await connector.deactivateListing!(ctx, { externalSku: 'NOPE' })).toMatchObject({ ok: false, errorCode: 'not_found' });
  });
});

describe('inventory and price push', () => {
  it('pushes quantities with a result PER SKU (one call each); an unknown SKU does not fail the batch', async () => {
    const [a, b] = (await connector.importProducts!(ctx, { limit: 2 })).items;
    const res = await connector.pushInventory!(ctx, [{ externalSku: a!.externalSku, quantity: 33 }, { externalSku: 'UNKNOWN-SKU', quantity: 1 }, { externalSku: b!.externalSku, quantity: 0, externalListingId: b!.externalListingId }]);
    expect(res.map((r) => r.ok)).toEqual([true, false, true]);
    expect(res[1]).toMatchObject({ externalSku: 'UNKNOWN-SKU', errorCode: 'not_found' });
    expect(control.listing(seller, a!.externalSku)?.quantity).toBe(33);
    expect(control.listing(seller, b!.externalSku)?.quantity).toBe(0);
  });

  it('a negative quantity and a location that cannot hold stock are rejections of that item', async () => {
    const [a] = (await connector.importProducts!(ctx, { limit: 1 })).items;
    expect((await connector.pushInventory!(ctx, [{ externalSku: a!.externalSku, quantity: -1 }]))[0]).toMatchObject({ ok: false, errorCode: 'validation_failed' });
    const closed = { ...ctx, config: { locationId: 90002 } };
    expect((await connector.pushInventory!(closed, [{ externalSku: a!.externalSku, quantity: 4 }]))[0]).toMatchObject({ ok: false, message: expect.stringContaining('not stocked') });
  });

  it('a transient failure aborts the push (so the engine retries); it is not reported per item', async () => {
    const [a] = (await connector.importProducts!(ctx, { limit: 1 })).items;
    control.setBehavior(seller, { failNext: 1, failStatus: 503 });
    await expect(connector.pushInventory!(ctx, [{ externalSku: a!.externalSku, quantity: 5 }])).rejects.toMatchObject({ kind: 'transient' });
  });

  it('pushes prices in minor units', async () => {
    const [a] = (await connector.importProducts!(ctx, { limit: 1 })).items;
    const res = await connector.pushPrices!(ctx, [{ externalSku: a!.externalSku, priceMinor: 123456, currency: 'INR' }, { externalSku: 'UNKNOWN-SKU', priceMinor: 100, currency: 'INR' }]);
    expect(res.map((r) => r.ok)).toEqual([true, false]);
    expect(control.listing(seller, a!.externalSku)?.priceMinor).toBe(123456);
  });
});

describe('orders', () => {
  const sellable = async () => (await connector.importProducts!(ctx, { limit: 1 })).items[0]!;

  it('normalises a new order: tax-inclusive lines, order tax and total, buyer, address and COD', async () => {
    const p = await sellable();
    control.placeOrder(seller, [{ sku: p.externalSku, quantity: 2 }], { cod: true });
    const [o] = (await connector.fetchOrders!(ctx, { since: new Date(0) })).items;
    expect(o).toMatchObject({ status: 'new', marketplaceStatus: 'pending/unfulfilled', currency: 'INR', buyer: { name: 'Sandbox Buyer' }, shippingAddress: expect.objectContaining({ city: 'Bengaluru', pincode: '560001' }), payment: { method: 'cod' } });
    expect(o!.items).toEqual([expect.objectContaining({ sku: p.externalSku, quantity: 2, unitPriceMinor: p.priceMinor, taxMinor: 0 })]);
    // prices include tax: the total is units x price, the tax is reported on the order and is part of the total, not on top
    expect(o!.totalMinor).toBe(p.priceMinor! * 2);
    expect(o!.taxMinor).toBe(Math.round(p.priceMinor! * 2 * 0.05));
    expect(o!.payment!.codAmountMinor).toBe(o!.totalMinor);
  });

  it('pages through more orders than one page holds without losing or repeating any', async () => {
    const p = await sellable();
    const ids = new Set<string>();
    for (let i = 0; i < 55; i++) ids.add(String(Number(control.placeOrder(seller, [{ sku: p.externalSku, quantity: 1 }]).id.split('-')[1])));
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<NonNullable<typeof connector.fetchOrders>>> = await connector.fetchOrders!(ctx, { since: new Date(0), cursor });
      seen.push(...page.items.map((o) => o.externalOrderId));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(55);
    expect(new Set(seen)).toEqual(ids);
  });

  it('`since` filters out older orders; a single order is fetched by id and null when unknown', async () => {
    const p = await sellable();
    const placed = control.placeOrder(seller, [{ sku: p.externalSku, quantity: 1 }]);
    expect((await connector.fetchOrders!(ctx, { since: new Date(Date.now() + 3_600_000) })).items).toHaveLength(0);
    expect((await connector.getOrder!(ctx, { externalOrderId: String(Number(placed.id.split('-')[1])) }))?.status).toBe('new');
    expect(await connector.getOrder!(ctx, { externalOrderId: '999999999' })).toBeNull();
  });

  it('marks an order shipped by creating a fulfilment with tracking; shipping twice is a rejection, not an exception', async () => {
    const p = await sellable();
    const placed = control.placeOrder(seller, [{ sku: p.externalSku, quantity: 1 }]);
    const id = String(Number(placed.id.split('-')[1]));
    expect(connector.canRequestOrderStatus!('dispatched')).toBe(true);
    for (const s of ['confirmed', 'packed', 'ready_to_dispatch', 'delivered', 'cancelled'] as const) expect(connector.canRequestOrderStatus!(s), s).toBe(false);
    expect(await connector.updateOrderStatus!(ctx, { externalOrderId: id, status: 'packed' })).toMatchObject({ ok: false, errorCode: 'UNSUPPORTED_STATUS' });
    expect(await connector.updateOrderStatus!(ctx, { externalOrderId: id, status: 'dispatched', tracking: { number: 'AWB-77', carrier: 'FastShip' } })).toMatchObject({ ok: true, marketplaceStatus: 'fulfilled' });
    expect(control.order(seller, placed.id)?.tracking).toMatchObject({ number: 'AWB-77', carrier: 'FastShip' });
    const after = await connector.getOrder!(ctx, { externalOrderId: id });
    expect(after).toMatchObject({ status: 'dispatched', marketplaceStatus: 'paid/fulfilled' });
    expect(await connector.updateOrderStatus!(ctx, { externalOrderId: id, status: 'dispatched' })).toMatchObject({ ok: false, errorCode: 'NOTHING_TO_FULFIL' });
    expect(await connector.updateOrderStatus!(ctx, { externalOrderId: '999999999', status: 'dispatched' })).toMatchObject({ ok: false, errorCode: 'not_found' });
  });

  it('cancels an unfulfilled order and refuses to cancel a shipped one', async () => {
    const p = await sellable();
    const open = control.placeOrder(seller, [{ sku: p.externalSku, quantity: 1 }]);
    const shipped = control.placeOrder(seller, [{ sku: p.externalSku, quantity: 1 }]);
    control.setOrderStatus(seller, shipped.id, 'FULFILLED');
    expect(await connector.cancelOrder!(ctx, { externalOrderId: String(Number(open.id.split('-')[1])), reason: 'Out of stock' })).toMatchObject({ ok: true });
    expect((await connector.getOrder!(ctx, { externalOrderId: String(Number(open.id.split('-')[1])) }))?.status).toBe('cancelled');
    expect(await connector.cancelOrder!(ctx, { externalOrderId: String(Number(shipped.id.split('-')[1])) })).toMatchObject({ ok: false });
  });

  it('derives one internal status from Shopify\'s three states', () => {
    const o = (x: Partial<Parameters<typeof toInternalShopifyOrderStatus>[0]>) => toInternalShopifyOrderStatus({ cancelled_at: null, fulfillment_status: null, financial_status: 'paid', fulfillments: [], ...x });
    expect(o({})).toBe('new');
    expect(o({ fulfillment_status: 'partial' })).toBe('confirmed');
    expect(o({ cancelled_at: '2026-01-01', fulfillment_status: 'fulfilled' })).toBe('cancelled');
    expect(o({ fulfillment_status: 'fulfilled', fulfillments: [{ id: 1, status: 'success', tracking_number: 'A', tracking_company: 'X', shipment_status: null }] })).toBe('dispatched');
    expect(o({ fulfillment_status: 'fulfilled', fulfillments: [{ id: 1, status: 'success', tracking_number: 'A', tracking_company: 'X', shipment_status: 'in_transit' }] })).toBe('in_transit');
    expect(o({ fulfillment_status: 'fulfilled', fulfillments: [{ id: 1, status: 'success', tracking_number: 'A', tracking_company: 'X', shipment_status: 'delivered' }] })).toBe('delivered');
    expect(o({ fulfillment_status: 'fulfilled', financial_status: 'refunded' })).toBe('returned');
  });
});

describe('webhooks', () => {
  const secret = 'whsec_shopify_test';
  const post = (topic: string, body: unknown) => control.signedWebhook(secret, topic, body);

  it('verifies the HMAC of the raw body and rejects a wrong secret, a missing header and a tampered body', () => {
    const w = post('orders/create', { id: 1 });
    expect(connector.verifyWebhook!({ headers: w.headers, rawBody: Buffer.from(w.rawBody), secret })).toBe(true);
    expect(connector.verifyWebhook!({ headers: w.headers, rawBody: Buffer.from(w.rawBody), secret: 'other' })).toBe(false);
    expect(connector.verifyWebhook!({ headers: {}, rawBody: Buffer.from(w.rawBody), secret })).toBe(false);
    expect(connector.verifyWebhook!({ headers: w.headers, rawBody: Buffer.from(`${w.rawBody} `), secret })).toBe(false);
  });

  it('parses order, cancellation, product and inventory notifications; unknown shapes are ignored', async () => {
    const p = (await connector.importProducts!(ctx, { limit: 1 })).items[0]!;
    const placed = control.placeOrder(seller, [{ sku: p.externalSku, quantity: 1 }]);
    const orderBody = control.orderJson(seller, placed.id);

    const created = connector.parseWebhook!({ headers: { 'x-shopify-topic': 'orders/create', 'x-shopify-event-id': 'evt-1' }, body: orderBody })!;
    expect(created).toMatchObject({ eventType: 'order.created', idempotencyKey: 'shopify-evt-1', externalOrderId: String(orderBody.id) });
    expect(created.order).toMatchObject({ status: 'new', totalMinor: p.priceMinor });
    // the stored event is parsed again later WITHOUT headers: same entity, still recognised
    const again = connector.parseWebhook!({ headers: {}, body: orderBody })!;
    expect(again).toMatchObject({ eventType: 'order.updated', externalOrderId: String(orderBody.id) });
    expect(again.idempotencyKey).toContain(`order-${orderBody.id}`);

    control.setOrderStatus(seller, placed.id, 'CANCELLED');
    expect(connector.parseWebhook!({ headers: {}, body: control.orderJson(seller, placed.id) })!.eventType).toBe('order.cancelled');

    const productBody = { id: Number(p.externalListingId), title: 'Renamed product', variants: [{ id: 1, sku: p.externalSku, price: '1.00' }], status: 'draft', updated_at: '2026-01-01T00:00:00Z' };
    expect(connector.parseWebhook!({ headers: {}, body: productBody })).toMatchObject({ eventType: 'listing.status_changed', listing: { externalSku: p.externalSku, status: 'inactive' } });

    expect(connector.parseWebhook!({ headers: {}, body: { inventory_item_id: 5, location_id: 9, available: 3 } })).toMatchObject({ eventType: 'inventory.updated', externalId: '5@9' });
    expect(connector.parseWebhook!({ headers: {}, body: { hello: 'world' } })).toBeNull();
    expect(connector.parseWebhook!({ headers: {}, body: null })).toBeNull();
  });
});
