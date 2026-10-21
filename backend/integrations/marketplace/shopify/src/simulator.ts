/* eslint-disable @typescript-eslint/no-explicit-any -- marketplace wire payloads are untyped JSON */
import {
  fromMinor, SimulatedTransport, SimulatedWorld, simJson, type SimBehavior, type SimOrder, type SimProduct, type SimRequest, type SimSeller,
} from '@oms/marketplace-core';
import type { ShpFulfillment, ShpLocation, ShpOrder, ShpProduct } from './dto';
import { API_VERSION } from './environment';
import { sign, SIGNATURE_HEADER } from './webhooks';

/**
 * In-process Shopify SANDBOX over a shared `SimulatedWorld`: one store per seller (the seller id is the shop sub-domain), spoken in the
 * Admin REST paths and JSON the connector's real client uses. It proves OUR code, not Shopify's behaviour.
 *
 * Sandbox credentials: shopDomain `<seller>.myshopify.com`, accessToken `shpat_sandbox_<seller>`. Authorization code: `shpsandbox:<seller>`.
 * Two locations exist: 90001 (active, holds the stock) and 90002 (inactive: stock cannot be set there).
 * A shop's native order word: OPEN | PARTIAL | FULFILLED | IN_TRANSIT | DELIVERED | CANCELLED | REFUNDED.
 */
const PRIMARY = 90001;
const INACTIVE = 90002;
const OFFLINE_TOKEN_TTL = 10 * 365 * 86_400;
const PAGE_MAX = 250;
const BASE = `/admin/api/${API_VERSION}`;

export const shopifyWorld = new SimulatedWorld((s) => {
  s.seedCatalog(8, { skuPrefix: `SHP-${s.id}`, categoryId: 'default', brand: 'SandboxBrand' });
  for (const p of s.products.values()) p.attributes = {};
});
shopifyWorld.publishDelayPolls = 0;

const idOf = (text: string): number => Number(/(\d+)$/.exec(text)?.[1] ?? 0);
const money = (minor: number): string => fromMinor(minor);
const shopOf = (sellerId: string): string => `${sellerId.toLowerCase()}.myshopify.com`;

/** product ids are the numeric tail of the simulated listing id; the variant and inventory item ids derive from it */
const variantId = (p: SimProduct): number => 2_000_000 + idOf(p.listingId);
const inventoryItemId = (p: SimProduct): number => 3_000_000 + idOf(p.listingId);

const toProduct = (p: SimProduct): ShpProduct => ({
  id: idOf(p.listingId), title: p.title, body_html: p.description ?? null, vendor: p.brand ?? '', product_type: p.categoryId === 'default' ? '' : (p.categoryId ?? ''), status: p.status === 'inactive' ? 'draft' : 'active', tags: '',
  variants: [{ id: variantId(p), product_id: idOf(p.listingId), sku: p.sku, price: money(p.priceMinor), compare_at_price: p.mrpMinor ? money(p.mrpMinor) : null, barcode: p.barcode ?? null, inventory_item_id: inventoryItemId(p), inventory_quantity: p.quantity }],
  images: p.imageUrls.map((src, i) => ({ id: i + 1, src })), updated_at: p.updatedAt.toISOString(),
});

const SHIPMENT: Record<string, string> = { IN_TRANSIT: 'in_transit', DELIVERED: 'delivered' };
const toOrder = (o: SimOrder): ShpOrder => {
  const fulfilled = ['FULFILLED', 'IN_TRANSIT', 'DELIVERED', 'REFUNDED'].includes(o.status);
  const fulfillment: ShpFulfillment | null = fulfilled
    ? { id: idOf(o.id) + 700_000, status: 'success', tracking_number: o.tracking?.number ?? null, tracking_company: o.tracking?.carrier ?? null, shipment_status: o.status === 'REFUNDED' ? 'delivered' : (SHIPMENT[o.status] ?? null) }
    : null;
  const tax = o.items.reduce((n, i) => n + i.taxMinor, 0);
  const total = o.items.reduce((n, i) => n + i.unitPriceMinor * i.quantity - i.discountMinor, 0);
  const [first = '', ...rest] = o.buyer.name.split(' ');
  return {
    id: idOf(o.id), name: `#${idOf(o.id)}`, created_at: o.placedAt.toISOString(), updated_at: o.updatedAt.toISOString(), currency: o.currency, taxes_included: true,
    financial_status: o.status === 'REFUNDED' ? 'refunded' : o.payment.method === 'cod' && !fulfilled ? 'pending' : 'paid',
    fulfillment_status: o.status === 'PARTIAL' ? 'partial' : fulfilled ? 'fulfilled' : null, cancelled_at: o.status === 'CANCELLED' ? o.updatedAt.toISOString() : null,
    total_price: money(total), subtotal_price: money(total), total_tax: money(tax), total_discounts: money(o.items.reduce((n, i) => n + i.discountMinor, 0)),
    payment_gateway_names: [o.payment.method === 'cod' ? 'Cash on Delivery (COD)' : 'Razorpay'],
    customer: { first_name: first, last_name: rest.join(' '), email: o.buyer.email, phone: o.buyer.phone },
    shipping_address: { name: o.buyer.name, address1: o.address.line1, city: o.address.city, province: o.address.state, zip: o.address.pincode, country_code: o.address.country, phone: o.buyer.phone },
    line_items: o.items.map((i) => ({ id: idOf(i.itemId) + 500_000, product_id: null, variant_id: null, sku: i.sku, title: i.title, quantity: i.quantity, price: money(i.unitPriceMinor), total_discount: money(i.discountMinor), tax_lines: [{ title: 'GST', price: money(i.taxMinor) }] })),
    fulfillments: fulfillment ? [fulfillment] : [],
  };
};

const strip = (s: string | undefined): string => (s ?? '').replace(/\.json$/, '');
const err422 = (field: string, message: string) => simJson(422, { errors: { [field]: [message] } });

export function createShopifySimulator(world: SimulatedWorld = shopifyWorld): SimulatedTransport {
  const STATIC = /^shpat_sandbox_(.+)$/;
  const sellerOf = (req: SimRequest): SimSeller | null => {
    const token = req.headers['x-shopify-access-token'];
    const fixed = token ? STATIC.exec(token) : null;
    return fixed ? world.seller(fixed[1]!) : world.authenticate(token);
  };
  const orderById = (seller: SimSeller, id: string): SimOrder | undefined => [...seller.orders.values()].find((o) => String(idOf(o.id)) === strip(id));
  const productById = (seller: SimSeller, id: string): SimProduct | undefined => [...seller.products.values()].find((p) => String(idOf(p.listingId)) === strip(id));
  const variantById = (seller: SimSeller, id: number): SimProduct | undefined => [...seller.products.values()].find((p) => variantId(p) === id);

  const t = new SimulatedTransport((req) => {
    if (req.path === '/admin/oauth/access_token') return null;
    const seller = sellerOf(req);
    if (!seller) return simJson(401, { errors: '[API] Invalid API key or access token (unrecognized login or wrong password)' });
    const fault = seller.checkBehavior();
    return fault ? { ...fault, body: { errors: fault.status === 401 ? '[API] Invalid API key or access token' : fault.status === 429 ? 'Exceeded 2 calls per second for api client. Reduce request rates to resume uninterrupted service.' : 'Simulated failure' } } : null;
  });

  t.on('POST', '/admin/oauth/access_token', (req) => {
    const m = /^shpsandbox:(.+)$/.exec(String(req.body?.code ?? ''));
    if (req.body?.client_id !== 'sandbox-app' || req.body?.client_secret !== 'sandbox-secret') return simJson(400, { error: 'invalid_request', errors: 'The client id or secret is invalid' });
    if (!m) return simJson(400, { errors: 'The authorization code is invalid or expired' });
    return simJson(200, { access_token: world.issueToken(m[1]!, OFFLINE_TOKEN_TTL, 'shpat').accessToken, scope: 'read_products,write_products,read_inventory,write_inventory,read_orders,write_orders' });
  });

  t.on('GET', `${BASE}/shop.json`, (req) => {
    const id = sellerOf(req)!.id;
    return simJson(200, { shop: { id: idOf(id) + 1, name: `Sandbox Store ${id}`, myshopify_domain: shopOf(id), currency: 'INR', country_code: 'IN', taxes_included: true } });
  });
  t.on('GET', `${BASE}/locations.json`, () => simJson(200, { locations: [{ id: PRIMARY, name: 'Shop location', active: true }, { id: INACTIVE, name: 'Closed warehouse', active: false }] satisfies ShpLocation[] }));

  // ---- products
  t.on('GET', `${BASE}/products.json`, (req) => {
    const since = Number(req.query.since_id ?? 0);
    const limit = Math.min(Number(req.query.limit ?? 50), PAGE_MAX);
    const all = [...sellerOf(req)!.products.values()].sort((a, b) => idOf(a.listingId) - idOf(b.listingId)).filter((p) => idOf(p.listingId) > since);
    return simJson(200, { products: all.slice(0, limit).map(toProduct) });
  });
  t.on('GET', `${BASE}/products/:id`, (req) => {
    const p = productById(sellerOf(req)!, req.params.id!);
    return p ? simJson(200, { product: toProduct(p) }) : simJson(404, { errors: 'Not Found' });
  });
  const upsert = (seller: SimSeller, body: any, existing?: SimProduct) => {
    const v = body?.variants?.[0] ?? {};
    const title = String(body?.title ?? existing?.title ?? '').trim();
    if (!title) return err422('title', "can't be blank");
    const price = v.price !== undefined ? Number(v.price) : existing ? existing.priceMinor / 100 : NaN;
    if (!(price >= 0)) return err422('variants.price', 'is invalid');
    const sku = String(v.sku ?? existing?.sku ?? '');
    if (!sku) return err422('variants.sku', "can't be blank");
    if (!existing && seller.products.has(sku)) return err422('variants.sku', 'has already been taken');
    const now = world.now();
    const next: SimProduct = {
      listingId: existing?.listingId ?? `${seller.id}-L${1000 + seller.products.size + 1 + Math.floor(Math.random() * 1_000_000)}`, sku, title, description: body?.body_html ?? existing?.description, brand: body?.vendor ?? existing?.brand,
      barcode: v.barcode ?? existing?.barcode, categoryId: body?.product_type || existing?.categoryId || 'default', priceMinor: Math.round(price * 100), mrpMinor: v.compare_at_price ? Math.round(Number(v.compare_at_price) * 100) : existing?.mrpMinor,
      currency: 'INR', quantity: existing?.quantity ?? 0, status: body?.status === 'draft' || body?.status === 'archived' ? 'inactive' : 'active', issues: [], attributes: {},
      imageUrls: Array.isArray(body?.images) ? body.images.map((i: any) => String(i.src)) : (existing?.imageUrls ?? []), pendingPolls: 0, createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    seller.products.set(sku, next);
    return simJson(existing ? 200 : 201, { product: toProduct(next) });
  };
  t.on('POST', `${BASE}/products.json`, (req) => upsert(sellerOf(req)!, req.body?.product));
  t.on('PUT', `${BASE}/products/:id`, (req) => {
    const seller = sellerOf(req)!;
    const p = productById(seller, req.params.id!);
    if (!p) return simJson(404, { errors: 'Not Found' });
    const body = { ...req.body?.product };
    if (body.variants === undefined && body.status !== undefined) { p.status = body.status === 'active' ? 'active' : 'inactive'; p.updatedAt = world.now(); return simJson(200, { product: toProduct(p) }); }
    seller.products.delete(p.sku);
    const res = upsert(seller, body, p);
    if (res.status >= 400) seller.products.set(p.sku, p);
    return res;
  });
  t.on('PUT', `${BASE}/variants/:id`, (req) => {
    const p = variantById(sellerOf(req)!, Number(strip(req.params.id)));
    if (!p) return simJson(404, { errors: 'Not Found' });
    if (req.body?.variant?.price !== undefined) {
      const price = Number(req.body.variant.price);
      if (!(price >= 0)) return err422('price', 'is invalid');
      p.priceMinor = Math.round(price * 100);
      p.updatedAt = world.now();
    }
    return simJson(200, { variant: toProduct(p).variants[0] });
  });

  t.on('POST', `${BASE}/inventory_levels/set.json`, (req) => {
    const seller = sellerOf(req)!;
    const p = [...seller.products.values()].find((x) => inventoryItemId(x) === Number(req.body?.inventory_item_id));
    if (!p) return err422('inventory_item_id', 'is invalid');
    if (Number(req.body?.location_id) !== PRIMARY) return err422('location_id', 'Inventory item is not stocked at the location');
    if (!Number.isInteger(req.body?.available) || req.body.available < 0) return err422('available', 'must be a non-negative integer');
    seller.setQuantity(p.sku, req.body.available);
    return simJson(200, { inventory_level: { inventory_item_id: inventoryItemId(p), location_id: PRIMARY, available: p.quantity } });
  });

  // ---- orders
  t.on('GET', `${BASE}/orders.json`, (req) => {
    const after = req.query.updated_at_min ? new Date(req.query.updated_at_min) : null;
    const since = Number(req.query.since_id ?? 0);
    const limit = Math.min(Number(req.query.limit ?? 50), PAGE_MAX);
    const all = [...sellerOf(req)!.orders.values()].sort((a, b) => idOf(a.id) - idOf(b.id)).filter((o) => idOf(o.id) > since && (!after || o.updatedAt >= after));
    return simJson(200, { orders: all.slice(0, limit).map(toOrder) });
  });
  t.on('GET', `${BASE}/orders/:id`, (req) => {
    const o = orderById(sellerOf(req)!, req.params.id!);
    return o ? simJson(200, { order: toOrder(o) }) : simJson(404, { errors: 'Not Found' });
  });
  t.on('POST', `${BASE}/orders/:id/cancel.json`, (req) => {
    const seller = sellerOf(req)!;
    const o = orderById(seller, req.params.id!);
    if (!o) return simJson(404, { errors: 'Not Found' });
    if (['FULFILLED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(o.status)) return simJson(422, { errors: 'Cannot cancel an order that is fulfilled or already cancelled' });
    seller.setOrderStatus(o.id, 'CANCELLED');
    return simJson(200, { order: toOrder(o) });
  });
  t.on('GET', `${BASE}/orders/:id/fulfillment_orders.json`, (req) => {
    const o = orderById(sellerOf(req)!, req.params.id!);
    if (!o) return simJson(404, { errors: 'Not Found' });
    const open = o.status === 'OPEN' || o.status === 'PARTIAL';
    return simJson(200, { fulfillment_orders: [{ id: idOf(o.id) + 900_000, status: o.status === 'CANCELLED' ? 'cancelled' : open ? 'open' : 'closed', assigned_location_id: PRIMARY }] });
  });
  t.on('POST', `${BASE}/fulfillments.json`, (req) => {
    const seller = sellerOf(req)!;
    const foId = Number(req.body?.fulfillment?.line_items_by_fulfillment_order?.[0]?.fulfillment_order_id);
    const o = [...seller.orders.values()].find((x) => idOf(x.id) + 900_000 === foId);
    if (!o) return simJson(404, { errors: 'Not Found' });
    if (o.status !== 'OPEN' && o.status !== 'PARTIAL') return simJson(422, { errors: 'The fulfillment order is not open' });
    const tracking = req.body.fulfillment.tracking_info;
    if (tracking) o.tracking = { number: String(tracking.number ?? ''), carrier: String(tracking.company ?? '') };
    seller.setOrderStatus(o.id, 'FULFILLED');
    return simJson(201, { fulfillment: toOrder(o).fulfillments[0] });
  });
  return t;
}

export const shopifySimulator = createShopifySimulator();

export const shopifyControl = {
  world: shopifyWorld,
  transport: shopifySimulator,
  setBehavior: (sellerId: string, b: SimBehavior) => { shopifyWorld.seller(sellerId).behavior = { ...b }; },
  calls: (sellerId: string) => shopifyWorld.seller(sellerId).calls,
  placeOrder: (sellerId: string, items: Array<{ sku: string; quantity: number }>, o: { cod?: boolean } = {}) =>
    shopifyWorld.seller(sellerId).placeOrder(items, { initialStatus: 'OPEN', idPrefix: 'SHP', payment: o.cod ? { method: 'cod' } : { method: 'prepaid' } }),
  setOrderStatus: (sellerId: string, orderId: string, status: string) => shopifyWorld.seller(sellerId).setOrderStatus(orderId, status),
  order: (sellerId: string, orderId: string) => shopifyWorld.seller(sellerId).orders.get(orderId),
  listing: (sellerId: string, sku: string) => shopifyWorld.seller(sellerId).products.get(sku),
  expireTokens: () => shopifyWorld.expireAllTokens(),
  /** a webhook as Shopify would POST it: raw body plus the signature header */
  signedWebhook: (secret: string, topic: string, body: unknown) => {
    const raw = JSON.stringify(body);
    return { rawBody: raw, headers: { [SIGNATURE_HEADER]: sign(secret, raw), 'x-shopify-topic': topic, 'x-shopify-event-id': `evt-${Math.random().toString(36).slice(2, 10)}`, 'content-type': 'application/json' } };
  },
  /** the order in Shopify's own JSON (for building webhook bodies) */
  orderJson: (sellerId: string, orderId: string): ShpOrder => toOrder(shopifyWorld.seller(sellerId).orders.get(orderId)!),
  reset: () => { shopifyWorld.reset(); shopifyWorld.publishDelayPolls = 0; },
};
