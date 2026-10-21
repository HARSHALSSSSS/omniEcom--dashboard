/* eslint-disable @typescript-eslint/no-explicit-any -- marketplace wire payloads are untyped JSON */
import { fromMinor, SimulatedTransport, SimulatedWorld, simJson, toMinor, type SimBehavior, type SimListingStatus, type SimOrder, type SimProduct, type SimRequest, type SimSeller } from '@oms/marketplace-core';
import type { MeeAttributeRule, MeeProduct, MeeProductStatus, MeeReturn, MeeSubOrder } from './dto';

/**
 * In-process Meesho supplier SANDBOX over a shared `SimulatedWorld`. The wire format is PROVISIONAL (see capabilities.ts);
 * this proves OUR code, not Meesho's behaviour. Sandbox credentials: supplierId `<id>`, apiKey `mee-sandbox-<id>`.
 */
const PAGE = 5;
const CATEGORIES: Array<{ id: string; name: string; rules: MeeAttributeRule[] }> = [
  { id: 'kurtis', name: 'Kurtis', rules: [
    { key: 'name', label: 'Product name', required: true, kind: 'text', maxLen: 100 },
    { key: 'brand', label: 'Brand', required: true, kind: 'text', maxLen: 50 },
    { key: 'color', label: 'Colour', required: true, kind: 'text', maxLen: 30 },
    { key: 'size', label: 'Size', required: true, kind: 'list', options: ['S', 'M', 'L', 'XL'] },
  ] },
  { id: 'home-decor', name: 'Home decor', rules: [
    { key: 'name', label: 'Product name', required: true, kind: 'text', maxLen: 100 },
    { key: 'material', label: 'Material', required: true, kind: 'text', maxLen: 40 },
  ] },
];

export const meeshoWorld = new SimulatedWorld((s) => {
  s.seedCatalog(8, { skuPrefix: `MEE-${s.id}`, categoryId: 'kurtis', brand: 'SandboxBrand' });
  for (const p of s.products.values()) p.attributes = { color: 'Blue', size: 'M' };
});
for (const a of CATEGORIES) {
  meeshoWorld.categories.set(a.id, { id: a.id, name: a.name, requirements: a.rules.map((r) => ({ name: r.key, required: r.required, type: r.kind === 'list' ? 'enum' : r.kind === 'text' ? 'string' : r.kind, allowed: r.options, maxLength: r.maxLen })) });
}
const returnsBySeller = new Map<string, MeeReturn[]>();

const STATUS: Record<SimListingStatus, MeeProductStatus> = { active: 'LIVE', pending: 'UNDER_REVIEW', rejected: 'BLOCKED', correction_required: 'ACTION_REQUIRED', inactive: 'INACTIVE' };
const dec = (minor: number) => fromMinor(minor);

const toProduct = (p: SimProduct): MeeProduct => ({
  sku: p.sku, productId: p.listingId, name: p.title, brand: p.brand, categoryId: p.categoryId, mrp: p.mrpMinor ? dec(p.mrpMinor) : undefined, price: dec(p.priceMinor), stock: p.quantity,
  status: STATUS[p.status], errors: p.issues.map((i) => ({ code: i.code, message: i.message, field: i.attribute, warning: i.severity === 'warning' })), attributes: p.attributes, images: p.imageUrls,
});
const toSubOrder = (o: SimOrder): MeeSubOrder => ({
  subOrderId: o.id, placedOn: o.placedAt.toISOString(), modifiedOn: o.updatedAt.toISOString(), status: o.status as MeeSubOrder['status'], paymentMode: o.payment.method === 'cod' ? 'COD' : 'PREPAID',
  customerName: o.buyer.name, customerPhone: o.buyer.phone, address: { line1: o.address.line1, city: o.address.city, state: o.address.state, pincode: o.address.pincode, country: o.address.country },
  lines: o.items.map((i) => ({ lineId: i.itemId, sku: i.sku, name: i.title, quantity: i.quantity, supplierPrice: dec(i.unitPriceMinor), gst: dec(i.taxMinor), discount: dec(i.discountMinor) })),
  ...(o.tracking ? { shipment: { courier: o.tracking.carrier, awb: o.tracking.number } } : {}),
});

/** allowed supplier-driven transitions */
const NEXT: Record<string, string[]> = { PENDING: ['ACCEPTED'], ACCEPTED: ['READY_TO_SHIP'], READY_TO_SHIP: ['SHIPPED'] };
const CANCELLABLE = ['PENDING', 'ACCEPTED', 'READY_TO_SHIP'];

export function createMeeshoSimulator(world: SimulatedWorld = meeshoWorld): SimulatedTransport {
  const sellerOf = (req: SimRequest): SimSeller | null => {
    const id = req.headers['x-meesho-supplier'];
    const m = /^mee-sandbox-(.+)$/.exec(req.headers['x-meesho-key'] ?? '');
    return id && m && m[1] === id ? world.seller(id) : null;
  };
  const t = new SimulatedTransport((req) => {
    const seller = sellerOf(req);
    if (!seller) return simJson(401, { code: 'UNAUTHORIZED', message: 'Invalid supplier id or API key' });
    const fault = seller.checkBehavior();
    return fault ? { ...fault, body: { code: fault.status === 401 ? 'UNAUTHORIZED' : fault.status === 429 ? 'THROTTLED' : 'INTERNAL', message: fault.status === 401 ? 'API key rejected' : 'Simulated failure' } } : null;
  });

  t.on('GET', '/supplier/v1/profile', (req) => simJson(200, { supplierId: sellerOf(req)!.id, name: `Sandbox Supplier ${sellerOf(req)!.id}`, active: true }));

  // ---- sub-orders
  t.on('GET', '/supplier/v1/orders', (req) => {
    const after = req.query.modifiedAfter ? new Date(req.query.modifiedAfter) : null;
    const all = [...sellerOf(req)!.orders.values()].sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime()).filter((o) => !after || o.updatedAt >= after);
    const offset = Number(req.query.offset ?? 0);
    const limit = Math.min(Number(req.query.limit ?? PAGE), PAGE);
    return simJson(200, { subOrders: all.slice(offset, offset + limit).map(toSubOrder), total: all.length, offset });
  });
  t.on('GET', '/supplier/v1/orders/:id', (req) => {
    const o = sellerOf(req)!.orders.get(req.params.id!);
    return o ? simJson(200, toSubOrder(o)) : simJson(404, { code: 'NOT_FOUND', message: 'Sub-order not found' });
  });
  t.on('POST', '/supplier/v1/orders/:id/status', (req) => {
    const seller = sellerOf(req)!;
    const o = seller.orders.get(req.params.id!);
    if (!o) return simJson(404, { code: 'NOT_FOUND', message: 'Sub-order not found' });
    const to = String(req.body?.status);
    if (!NEXT[o.status]?.includes(to)) return simJson(409, { code: 'INVALID_TRANSITION', message: `Cannot move sub-order from ${o.status} to ${to}` });
    if (to === 'SHIPPED') o.tracking = { number: String(req.body?.awb ?? `MEEAWB${o.id}`), carrier: String(req.body?.courier ?? 'Meesho Logistics') };
    seller.setOrderStatus(o.id, to);
    return simJson(200, { subOrderId: o.id, status: to });
  });
  t.on('POST', '/supplier/v1/orders/:id/cancel', (req) => {
    const seller = sellerOf(req)!;
    const o = seller.orders.get(req.params.id!);
    if (!o) return simJson(404, { code: 'NOT_FOUND', message: 'Sub-order not found' });
    if (!CANCELLABLE.includes(o.status)) return simJson(409, { code: 'INVALID_TRANSITION', message: `A ${o.status} sub-order cannot be cancelled` });
    seller.setOrderStatus(o.id, 'CANCELLED');
    return simJson(200, { subOrderId: o.id, status: 'CANCELLED' });
  });
  t.on('GET', '/supplier/v1/returns', (req) => {
    const since = req.query.since ? new Date(req.query.since) : null;
    const all = (returnsBySeller.get(sellerOf(req)!.id) ?? []).filter((r) => !since || new Date(r.createdOn) >= since);
    const offset = Number(req.query.offset ?? 0);
    const limit = Math.min(Number(req.query.limit ?? PAGE), PAGE);
    return simJson(200, { returns: all.slice(offset, offset + limit), total: all.length, offset });
  });

  // ---- catalogue
  t.on('GET', '/supplier/v1/catalog', (req) => {
    const all = [...sellerOf(req)!.products.values()];
    const offset = Number(req.query.offset ?? 0);
    const limit = Math.min(Number(req.query.limit ?? PAGE), 20);
    return simJson(200, { products: all.slice(offset, offset + limit).map(toProduct), total: all.length, offset });
  });
  t.on('GET', '/supplier/v1/catalog/:sku', (req) => {
    const p = sellerOf(req)!.pollListing(req.params.sku!);
    return p ? simJson(200, toProduct(p)) : simJson(404, { code: 'NOT_FOUND', message: 'Product not found' });
  });
  t.on('POST', '/supplier/v1/catalog', (req) => {
    const seller = sellerOf(req)!;
    const results = ((req.body?.products ?? []) as Array<Record<string, any>>).map((s) => {
      const p = seller.submitListing({
        sku: s.sku, title: String(s.name ?? ''), description: s.description, brand: s.brand, barcode: s.barcode, categoryId: s.categoryId,
        priceMinor: s.price !== undefined ? toMinor(s.price) : 0, mrpMinor: s.mrp !== undefined ? toMinor(s.mrp) : undefined, currency: 'INR', quantity: s.stock, attributes: s.attributes ?? {}, imageUrls: s.images,
      });
      const bad = p.status === 'correction_required' || p.status === 'rejected';
      return { sku: p.sku, ok: !bad, code: bad ? p.issues[0]?.code : undefined, message: bad ? p.issues[0]?.message : undefined, ...(bad ? { errors: p.issues.map((i) => ({ code: i.code, message: i.message, field: i.attribute, warning: i.severity === 'warning' })) } : {}) };
    });
    return simJson(200, { results });
  });
  t.on('POST', '/supplier/v1/inventory', (req) => {
    const seller = sellerOf(req)!;
    const results = ((req.body?.items ?? []) as Array<{ sku: string; quantity: number }>).map((i) => {
      if (!seller.products.has(i.sku)) return { sku: i.sku, ok: false, code: 'NOT_FOUND', message: 'Product not found' };
      if (!Number.isInteger(i.quantity) || i.quantity < 0) return { sku: i.sku, ok: false, code: 'INVALID_QUANTITY', message: 'quantity must be a non-negative integer' };
      seller.setQuantity(i.sku, i.quantity);
      return { sku: i.sku, ok: true };
    });
    return simJson(200, { results });
  });
  t.on('POST', '/supplier/v1/prices', (req) => {
    const seller = sellerOf(req)!;
    const results = ((req.body?.items ?? []) as Array<{ sku: string; price: string }>).map((i) => {
      const p = seller.products.get(i.sku);
      if (!p) return { sku: i.sku, ok: false, code: 'NOT_FOUND', message: 'Product not found' };
      p.priceMinor = toMinor(i.price);
      return { sku: i.sku, ok: true };
    });
    return simJson(200, { results });
  });
  t.on('POST', '/supplier/v1/catalog/:sku/deactivate', (req) => {
    const p = sellerOf(req)!.products.get(req.params.sku!);
    if (!p) return simJson(404, { code: 'NOT_FOUND', message: 'Product not found' });
    p.status = 'inactive';
    return simJson(200, { sku: p.sku, status: 'INACTIVE' });
  });

  t.on('GET', '/supplier/v1/categories', (req) => {
    const q = req.query.q?.toLowerCase();
    return simJson(200, { categories: CATEGORIES.filter((a) => !q || a.name.toLowerCase().includes(q) || a.id.includes(q)).map((a) => ({ id: a.id, name: a.name })) });
  });
  t.on('GET', '/supplier/v1/categories/:id/attributes', (req) => {
    const a = CATEGORIES.find((x) => x.id === req.params.id);
    return a ? simJson(200, { attributes: a.rules }) : simJson(404, { code: 'NOT_FOUND', message: 'Category not found' });
  });
  return t;
}

export const meeshoSimulator = createMeeshoSimulator();

export const meeshoControl = {
  world: meeshoWorld,
  transport: meeshoSimulator,
  setBehavior: (sellerId: string, b: SimBehavior) => { meeshoWorld.seller(sellerId).behavior = { ...b }; },
  calls: (sellerId: string) => meeshoWorld.seller(sellerId).calls,
  placeOrder: (sellerId: string, items: Array<{ sku: string; quantity: number }>, o: { cod?: boolean } = {}) =>
    meeshoWorld.seller(sellerId).placeOrder(items, { initialStatus: 'PENDING', idPrefix: 'MEE', payment: o.cod ? { method: 'cod' } : { method: 'prepaid' } }),
  setOrderStatus: (sellerId: string, orderId: string, status: string) => meeshoWorld.seller(sellerId).setOrderStatus(orderId, status),
  order: (sellerId: string, orderId: string) => meeshoWorld.seller(sellerId).orders.get(orderId),
  listing: (sellerId: string, sku: string) => meeshoWorld.seller(sellerId).products.get(sku),
  /** a customer return the supplier will see in GET /returns */
  addReturn: (sellerId: string, subOrderId: string, reason: string): MeeReturn => {
    const r: MeeReturn = { returnId: `RET-${subOrderId}`, subOrderId, status: 'RETURN_INITIATED', reason, createdOn: new Date().toISOString() };
    returnsBySeller.set(sellerId, [...(returnsBySeller.get(sellerId) ?? []), r]);
    return r;
  },
  expireTokens: () => undefined,
  reset: () => { meeshoWorld.reset(); returnsBySeller.clear(); },
};
