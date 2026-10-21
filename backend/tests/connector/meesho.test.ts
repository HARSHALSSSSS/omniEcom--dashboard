import { beforeEach, describe, expect, it } from 'vitest';
import { createMeeshoConnector, meeshoControl, MEESHO_ORDER_STATUS_MAP } from '@oms/connector-meesho';
import { ConnectorError, ORDER_STATUSES, enabledCapabilities, type ConnectorContext, type ListingInput } from '@oms/marketplace-core';

/**
 * Meesho connector against its in-process simulator, over the connector's REAL client. The wire format is provisional (Meesho does not
 * publish its supplier API): this proves OUR code (auth, mapping, per-item results, error classification), not Meesho's behaviour.
 */
const connector = createMeeshoConnector();
const control = meeshoControl;
let seller: string;
let ctx: ConnectorContext;
let n = 0;

const creds = (s: string) => ({ supplierId: s, apiKey: `mee-sandbox-${s}` });
const input = (sku: string, o: Partial<ListingInput> = {}): ListingInput => ({
  externalSku: sku, title: 'A comfortable cotton kurti', brand: 'Acme', priceMinor: 39900, mrpMinor: 59900, currency: 'INR', quantity: 5, marketplaceCategoryId: 'kurtis',
  attributes: { name: 'A comfortable cotton kurti', brand: 'Acme', color: 'Blue', size: 'M' }, ...o,
});

beforeEach(async () => {
  control.reset();
  seller = `SUP${++n}`;
  const a = await connector.authenticate!({ credentials: creds(seller), mode: 'sandbox' });
  ctx = { vendorId: 'v1', marketplaceAccountId: 'a1', externalAccountId: a.externalAccountId, mode: 'sandbox', credentials: a.credentials };
});

describe('declaration', () => {
  it('is a beta connector, sandbox-only and honest about being provisional', () => {
    expect(connector).toMatchObject({ code: 'meesho', implementation: 'beta' });
    expect(connector.readiness).toMatchObject({ sandbox: true, live: false });
    expect(connector.readiness.notes).toMatch(/PROVISIONAL/);
    expect(connector.capabilities.auth).toMatchObject({ type: 'api_key', refreshable: false });
    expect(connector.refreshCredentials).toBeUndefined();
  });

  it('declares returns and cancellation but no webhooks and no own shipping (Meesho assigns the courier)', () => {
    const have = new Set(enabledCapabilities(connector));
    for (const cap of ['orders.fetch', 'orders.updateStatus', 'orders.cancel', 'returns.fetch', 'inventory.batch', 'listings.categorySearch', 'pricing.push']) expect(have.has(cap), cap).toBe(true);
    for (const cap of ['orders.webhook', 'shipping.createShipment', 'shipping.generateLabel']) expect(have.has(cap), cap).toBe(false);
    expect(connector.capabilities.shipping.marketplaceManagedLogistics).toBe(true);
    expect(connector.verifyWebhook).toBeUndefined();
    expect(connector.polling!.orders!.intervalSeconds).toBeLessThanOrEqual(600);
  });

  it('maps every Meesho status to a valid internal status', () => {
    for (const [native, internal] of Object.entries(MEESHO_ORDER_STATUS_MAP)) expect(ORDER_STATUSES, native).toContain(internal);
    expect(MEESHO_ORDER_STATUS_MAP.PENDING).toBe('new');
    expect(MEESHO_ORDER_STATUS_MAP.SHIPPED).toBe('dispatched');
    expect(MEESHO_ORDER_STATUS_MAP.RETURNED).toBe('returned');
  });
});

describe('authentication', () => {
  it('authenticates a supplier and returns the supplier id; a static key has no expiry', async () => {
    const a = await connector.authenticate!({ credentials: creds('SUP-A'), mode: 'sandbox' });
    expect(a.externalAccountId).toBe('SUP-A');
    expect(a.credentials).toEqual({ supplierId: 'SUP-A', apiKey: 'mee-sandbox-SUP-A' });
    expect(a.expiresAt).toBeUndefined();
    expect(await connector.getAccount!(ctx)).toMatchObject({ externalAccountId: seller, region: 'IN', status: 'active' });
  });

  it('rejects a wrong key, a key of another supplier and missing fields as AUTH errors (never retried)', async () => {
    await expect(connector.authenticate!({ credentials: { supplierId: 'X', apiKey: 'nope' }, mode: 'sandbox' })).rejects.toMatchObject({ kind: 'auth', retryable: false });
    await expect(connector.authenticate!({ credentials: { supplierId: 'X', apiKey: 'mee-sandbox-Y' }, mode: 'sandbox' })).rejects.toMatchObject({ kind: 'auth' });
    await expect(connector.authenticate!({ credentials: {}, mode: 'sandbox' })).rejects.toMatchObject({ kind: 'auth', code: 'invalid_credentials' });
  });

  it('classifies 401, 429 (with Retry-After) and 5xx', async () => {
    control.setBehavior(seller, { authFailNext: 1 });
    await expect(connector.verifyConnection(ctx)).rejects.toMatchObject({ kind: 'auth' });
    control.setBehavior(seller, { rateLimitNext: 1, retryAfterSec: 4 });
    const e = await connector.fetchOrders!(ctx, { since: new Date(0) }).catch((x) => x);
    expect(e).toBeInstanceOf(ConnectorError);
    expect(e).toMatchObject({ kind: 'rate_limited', opts: { retryAfterMs: 4000 } });
    control.setBehavior(seller, { failNext: 1, failStatus: 503 });
    expect(await connector.fetchOrders!(ctx, { since: new Date(0) }).catch((x) => x)).toMatchObject({ kind: 'transient' });
  });
});

describe('catalogue and listings', () => {
  it('pages the catalogue by offset and normalises prices to minor units', async () => {
    const skus: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<NonNullable<typeof connector.importProducts>>> = await connector.importProducts!(ctx, { cursor, limit: 3 });
      for (const p of page.items) { skus.push(p.externalSku); expect(Number.isInteger(p.priceMinor)).toBe(true); expect(p).toMatchObject({ currency: 'INR', status: 'active' }); }
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(skus).size).toBe(8);
  });

  it('searches categories and reads the attributes one demands', async () => {
    const cats = await connector.searchCategories!(ctx, { query: 'kurt' });
    expect(cats.map((c) => c.id)).toEqual(['kurtis']);
    const reqs = await connector.getCategoryRequirements!(ctx, { marketplaceCategoryId: 'kurtis' });
    expect(reqs.filter((r) => r.required).map((r) => r.name)).toEqual(expect.arrayContaining(['name', 'brand', 'color', 'size']));
    expect(reqs.find((r) => r.name === 'size')).toMatchObject({ type: 'enum', allowedValues: ['S', 'M', 'L', 'XL'] });
  });

  it('creates a listing that goes pending -> active after review; fixable problems are correction_required; a policy hit is a rejection', async () => {
    const r = await connector.createListing!(ctx, input('K-1'));
    expect(r).toMatchObject({ status: 'pending', issues: [] });
    expect((await connector.getListingStatus!(ctx, { externalSku: 'K-1' })).status).toBe('active');

    const bad = await connector.createListing!(ctx, input('K-BAD', { attributes: {} }));
    expect(bad.status).toBe('correction_required');
    expect(bad.issues.some((i) => i.attribute)).toBe(true);

    const policy = await connector.createListing!(ctx, input('K-FAKE', { title: 'A replica designer kurti' }));
    expect(policy.status).toBe('rejected');
  });

  it('deactivates a listing; an unknown SKU is a per-item failure', async () => {
    const [first] = (await connector.importProducts!(ctx, { limit: 1 })).items;
    expect(await connector.deactivateListing!(ctx, { externalSku: first!.externalSku })).toMatchObject({ ok: true });
    expect(control.listing(seller, first!.externalSku)?.status).toBe('inactive');
    expect(await connector.deactivateListing!(ctx, { externalSku: 'NOPE' })).toMatchObject({ ok: false, errorCode: 'not_found' });
  });
});

describe('inventory and price push', () => {
  it('returns one result per SKU and keeps going after a bad one', async () => {
    const all = (await connector.importProducts!(ctx, { limit: 100 })).items;
    const res = await connector.pushInventory!(ctx, [{ externalSku: all[0]!.externalSku, quantity: 33 }, { externalSku: 'UNKNOWN', quantity: 1 }, { externalSku: all[1]!.externalSku, quantity: -4 }, { externalSku: all[2]!.externalSku, quantity: 0 }]);
    expect(res.map((r) => r.ok)).toEqual([true, false, false, true]);
    expect(res[2]).toMatchObject({ errorCode: 'INVALID_QUANTITY' });
    expect(control.listing(seller, all[0]!.externalSku)?.quantity).toBe(33);
    expect(control.listing(seller, all[2]!.externalSku)?.quantity).toBe(0);
  });

  it('splits a large batch to the 50-item limit and pushes prices in minor units', async () => {
    const all = (await connector.importProducts!(ctx, { limit: 100 })).items;
    expect((await connector.pushInventory!(ctx, all.map((p, i) => ({ externalSku: p.externalSku, quantity: 100 + i })))).every((r) => r.ok)).toBe(true);
    const res = await connector.pushPrices!(ctx, [{ externalSku: all[0]!.externalSku, priceMinor: 123456, currency: 'INR' }, { externalSku: 'UNKNOWN', priceMinor: 100, currency: 'INR' }]);
    expect(res.map((r) => r.ok)).toEqual([true, false]);
    expect(control.listing(seller, all[0]!.externalSku)?.priceMinor).toBe(123456);
  });

  it('a transient failure aborts the push so the engine can retry', async () => {
    const [a] = (await connector.importProducts!(ctx, { limit: 1 })).items;
    control.setBehavior(seller, { failNext: 1, failStatus: 503 });
    await expect(connector.pushInventory!(ctx, [{ externalSku: a!.externalSku, quantity: 5 }])).rejects.toMatchObject({ kind: 'transient' });
  });
});

describe('orders and returns', () => {
  const sellable = async () => (await connector.importProducts!(ctx, { limit: 1 })).items[0]!;

  it('normalises a sub-order: status, supplier price + GST, buyer, address and COD', async () => {
    const p = await sellable();
    const placed = control.placeOrder(seller, [{ sku: p.externalSku, quantity: 2 }], { cod: true });
    const [o] = (await connector.fetchOrders!(ctx, { since: new Date(0) })).items;
    expect(o).toMatchObject({ externalOrderId: placed.id, status: 'new', marketplaceStatus: 'PENDING', currency: 'INR', payment: { method: 'cod' }, shippingAddress: expect.objectContaining({ pincode: '560001' }) });
    const calc = o!.items.reduce((s, i) => s + i.unitPriceMinor * i.quantity + i.taxMinor - i.discountMinor, 0);
    expect(o!.totalMinor).toBe(calc);
    expect(o!.payment!.codAmountMinor).toBe(o!.totalMinor);
    expect(o!.items[0]).toMatchObject({ sku: p.externalSku, quantity: 2, unitPriceMinor: p.priceMinor });
  });

  it('pages through many sub-orders without losing any and honours `since`', async () => {
    const p = await sellable();
    const ids = new Set<string>();
    for (let i = 0; i < 12; i++) ids.add(control.placeOrder(seller, [{ sku: p.externalSku, quantity: 1 }]).id);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<NonNullable<typeof connector.fetchOrders>>> = await connector.fetchOrders!(ctx, { since: new Date(0), cursor });
      seen.push(...page.items.map((o) => o.externalOrderId));
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(seen)).toEqual(ids);
    expect(seen).toHaveLength(12);
    expect((await connector.fetchOrders!(ctx, { since: new Date(Date.now() + 3_600_000) })).items).toHaveLength(0);
  });

  it('walks accepted -> ready to ship -> shipped; invalid steps and unsupported statuses are rejections', async () => {
    const p = await sellable();
    const o = control.placeOrder(seller, [{ sku: p.externalSku, quantity: 1 }]);
    for (const s of ORDER_STATUSES) expect(connector.canRequestOrderStatus!(s), s).toBe(['confirmed', 'ready_to_dispatch', 'dispatched'].includes(s));
    expect(await connector.updateOrderStatus!(ctx, { externalOrderId: o.id, status: 'dispatched' })).toMatchObject({ ok: false, errorCode: 'INVALID_TRANSITION' }); // cannot skip steps
    expect(await connector.updateOrderStatus!(ctx, { externalOrderId: o.id, status: 'delivered' })).toMatchObject({ ok: false, errorCode: 'UNSUPPORTED_STATUS' });
    for (const s of ['confirmed', 'ready_to_dispatch', 'dispatched'] as const) {
      expect(await connector.updateOrderStatus!(ctx, { externalOrderId: o.id, status: s, tracking: { number: 'AWB-9', carrier: 'FastShip' } }), s).toMatchObject({ ok: true });
    }
    expect(control.order(seller, o.id)).toMatchObject({ status: 'SHIPPED', tracking: { number: 'AWB-9', carrier: 'FastShip' } });
    expect((await connector.getOrder!(ctx, { externalOrderId: o.id }))?.status).toBe('dispatched');
    expect(await connector.updateOrderStatus!(ctx, { externalOrderId: 'NOPE', status: 'confirmed' })).toMatchObject({ ok: false, errorCode: 'not_found' });
  });

  it('cancels a sub-order that has not shipped and refuses one that has; unknown ids give null', async () => {
    const p = await sellable();
    const open = control.placeOrder(seller, [{ sku: p.externalSku, quantity: 1 }]);
    const shipped = control.placeOrder(seller, [{ sku: p.externalSku, quantity: 1 }]);
    control.setOrderStatus(seller, shipped.id, 'SHIPPED');
    expect(await connector.cancelOrder!(ctx, { externalOrderId: open.id, reason: 'Out of stock' })).toMatchObject({ ok: true });
    expect((await connector.getOrder!(ctx, { externalOrderId: open.id }))?.status).toBe('cancelled');
    expect(await connector.cancelOrder!(ctx, { externalOrderId: shipped.id })).toMatchObject({ ok: false, errorCode: 'INVALID_TRANSITION' });
    expect(await connector.getOrder!(ctx, { externalOrderId: 'DOES-NOT-EXIST' })).toBeNull();
  });

  it('fetches customer returns, paged, normalised', async () => {
    const p = await sellable();
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) { const o = control.placeOrder(seller, [{ sku: p.externalSku, quantity: 1 }]); control.addReturn(seller, o.id, 'Size too small'); ids.push(o.id); }
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<NonNullable<typeof connector.fetchReturns>>> = await connector.fetchReturns!(ctx, { since: new Date(0), cursor });
      for (const r of page.items) { seen.push(r.externalOrderId); expect(r).toMatchObject({ reason: 'Size too small', status: 'RETURN_INITIATED' }); expect(r.requestedAt).toBeInstanceOf(Date); }
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(ids);
  });
});
