/**
 * Local demo server for frontend work. Runs the REAL application (all modules, real routes, migrations, RLS) on an
 * in-process PostgreSQL (PGlite) with in-memory storage, mailer and queues, so no Postgres / Redis / MinIO is needed.
 * Data lives only as long as the process. Background work (domain events, sync jobs, imports) is pumped every second.
 *
 *   pnpm dev:local          -> http://localhost:3000   (docs at /docs)
 *
 * Demo logins (printed at start): an administrator whose onboarding is complete, and a staff and a viewer user.
 * Not for production: production uses apps/api with PostgreSQL, Redis and object storage.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { rollupRecent } from '../modules/analytics/src';
import { buildTestApp, clientFor, mockControl, PNG_1x1 } from '@oms/testing';

const PORT = Number(process.env.PORT ?? 3000);
const PASSWORD = 'Demo-Password-123';

const t = await buildTestApp({
  database: true,
  config: {
    CORS_ORIGINS: process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173',
    RATE_LIMIT_MAX: '100000',
    AUTH_RATE_LIMIT_MAX: '1000',
    EMAIL_VERIFICATION_REQUIRED: 'false',
  },
});
const c = clientFor(t);
// real storage (S3/MinIO) signs download links; the in-memory one cannot, and publishing a product with images needs them
(t.storage as unknown as { presignDownload: (key: string) => Promise<string> }).presignDownload = async (key) => `http://localhost:${PORT + 1}/${encodeURIComponent(key)}`;

// ...and the links it hands out must open: a tiny media server (the test app is already started, so it cannot take a new route) serves
// the stored objects. The keys are unguessable and carry the tenant prefix, as with real pre-signed links.
const MEDIA_PORT = PORT + 1;
const storedObjects = (t.storage as unknown as { objects: Map<string, { body: Buffer; contentType: string }> }).objects;
createServer((req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'cross-origin-resource-policy': 'cross-origin' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
  const object = storedObjects.get(decodeURIComponent((req.url ?? '/').slice(1).split('?')[0] ?? ''));
  if (!object) { res.writeHead(404, cors).end('not found'); return; }
  res.writeHead(200, { ...cors, 'content-type': object.contentType, 'cache-control': 'private, max-age=300' }).end(object.body);
}).listen(MEDIA_PORT, '0.0.0.0');

const admin = await c.registerVendor({ businessName: 'Nova Living', fullName: 'Aayush Kumar', email: 'admin@nova.test', password: PASSWORD });
await c.addMember(admin, 'vendor_staff', 'staff@nova.test');
await c.addMember(admin, 'vendor_viewer', 'viewer@nova.test');

// complete onboarding for the demo business so the whole workspace is reachable
const step = (path: string, body: unknown) => c.put(`/api/v1/onboarding/${path}`, body, admin);
await step('business', { businessName: 'Nova Living', businessType: 'd2c_brand', teamSize: 'just_me', operatingLocation: 'Mumbai, Maharashtra' });
await step('inventory', { mode: 'simple', startingMethod: 'manual', locationName: 'Home Inventory' });
await step('fulfillment', { defaultMethod: 'seller', defaultPreference: 'recommended', overrides: {} });
await c.post('/api/v1/onboarding/complete', {}, admin);

// demo data: a sandbox marketplace account, a few products with stock (one running low) and the marketplace's orders
const wh = (await c.get('/api/v1/warehouses', admin)).body.data[0] as { id: string };
const acct = await c.connectAccount(admin, 'mock', { displayName: 'Sandbox Store' });
// the sandbox marketplace already sells a few SKUs: give the first three a product here, so its orders match our catalogue
const sandboxSkus = [...mockControl.state.seller(acct.sellerId).products.keys()];
const [sku1, sku2, sku3] = [sandboxSkus[0]!, sandboxSkus[1]!, sandboxSkus[2]!];
const demo = [
  { sku: sku1, title: 'Premium Travel Bag', price: 149900, mrp: 249900, qty: 4 },
  { sku: sku2, title: 'Classic Backpack', price: 99900, mrp: 149900, qty: 8 },
  { sku: sku3, title: 'Leather Wallet', price: 59900, mrp: 79900, qty: 120 },
  { sku: 'CAP-3305', title: 'Canvas Cap', price: 29900, mrp: 39900, qty: 0 },
];
for (const d of demo) {
  const v = await c.makeVariant(admin, { sku: d.sku, title: d.title, priceMinor: d.price, mrpMinor: d.mrp, brand: 'Urban Carry' });
  if (d.qty > 0) await c.stock(admin, v.variantId, wh.id, d.qty);
}
// a richer catalogue for the product screens: categories, multi-variant products, an archived product, a draft and images
const cat = async (name: string) => (await c.post('/api/v1/categories', { name }, admin)).body.data.id as string;
const bags = await cat('Bags & Travel');
const accessories = await cat('Accessories');
const multi = async (o: { code: string; title: string; categoryId: string; brand: string; status?: 'active' | 'archived'; variants: Array<{ sku: string; color: string; size?: string; price: number; mrp: number; qty: number }> }) => {
  const r = await c.post('/api/v1/products', {
    productCode: o.code, title: o.title, brand: o.brand, description: `${o.title}: made to last, designed for everyday use.`, categoryId: o.categoryId, countryOfOrigin: 'IN', hsnCode: '4202', gstRateBps: 1800, status: 'active',
    variants: o.variants.map((v) => ({ sku: v.sku, sellingPriceMinor: v.price, mrpMinor: v.mrp, costPriceMinor: Math.round(v.price * 0.55), optionValues: v.size ? { color: v.color, size: v.size } : { color: v.color } })),
  }, admin);
  if (r.status !== 201) throw new Error(`seed product failed: ${r.status} ${JSON.stringify(r.body)}`);
  for (const [i, v] of r.body.data.variants.entries()) if (o.variants[i]!.qty > 0) await c.stock(admin, v.id, wh.id, o.variants[i]!.qty);
  if (o.status === 'archived') await c.patch(`/api/v1/products/${r.body.data.id}`, { status: 'archived' }, admin);
  return r.body.data.id as string;
};
const daypack = await multi({ code: 'UD-DAYPACK', title: 'Urban Daypack', categoryId: bags, brand: 'Urban Carry', variants: [
  { sku: 'UD-BLK-M', color: 'Black', size: 'M', price: 249900, mrp: 349900, qty: 40 }, { sku: 'UD-BLK-L', color: 'Black', size: 'L', price: 269900, mrp: 369900, qty: 6 },
  { sku: 'UD-NVY-M', color: 'Navy', size: 'M', price: 249900, mrp: 349900, qty: 0 }, { sku: 'UD-NVY-L', color: 'Navy', size: 'L', price: 269900, mrp: 369900, qty: 22 } ] });
await multi({ code: 'SL-CARDHOLDER', title: 'Slim Card Holder', categoryId: accessories, brand: 'Nova', variants: [
  { sku: 'SL-CH-TAN', color: 'Tan', price: 39900, mrp: 59900, qty: 75 }, { sku: 'SL-CH-BLK', color: 'Black', price: 39900, mrp: 59900, qty: 60 } ] });
await multi({ code: 'OLD-SATCHEL', title: 'Vintage Satchel (discontinued)', categoryId: bags, brand: 'Nova', status: 'archived', variants: [{ sku: 'OLD-SAT-BRN', color: 'Brown', price: 189900, mrp: 249900, qty: 3 }] });
await c.post('/api/v1/products/drafts', { title: 'Weekender Duffel', brand: 'Urban Carry', categoryId: bags }, admin);
// a real primary image on the daypack
const reg = await c.post(`/api/v1/products/${daypack}/documents`, { fileName: 'urban-daypack.png', mimeType: 'image/png', sizeBytes: PNG_1x1.length, purpose: 'product_image' }, admin);
if (reg.status === 201) await c.call('POST', reg.body.data.upload.url, { as: admin, raw: PNG_1x1, contentType: 'image/png' });
await t.pump();
mockControl.placeOrder(acct.sellerId, [{ sku: sku3, quantity: 2 }]);
mockControl.placeOrder(acct.sellerId, [{ sku: sku2, quantity: 1 }, { sku: sku3, quantity: 1 }]);
mockControl.placeOrder(acct.sellerId, [{ sku: sku1, quantity: 1 }]);
await c.post(`/api/v1/marketplace-accounts/${acct.id}/sync-orders`, {}, admin);
await t.pump();
// a second warehouse with its own stock, more orders (one COD), and orders in different stages
const hub = await c.makeWarehouse(admin, { code: 'MUM-HUB', name: 'Mumbai Hub' });
const daypackVariant = (await c.get(`/api/v1/products/${daypack}`, admin)).body.data.variants[0].id as string;
await c.stock(admin, daypackVariant, hub.id, 15);
mockControl.placeOrder(acct.sellerId, [{ sku: sku3, quantity: 3 }], { cod: true });
mockControl.placeOrder(acct.sellerId, [{ sku: sku2, quantity: 2 }]);
mockControl.placeOrder(acct.sellerId, [{ sku: sku3, quantity: 1 }, { sku: sku1, quantity: 1 }]);
mockControl.placeOrder(acct.sellerId, [{ sku: sku2, quantity: 1 }]);
await c.post(`/api/v1/marketplace-accounts/${acct.id}/sync-orders`, {}, admin);
await t.pump();
const orders = (await c.get('/api/v1/orders?limit=20', admin)).body.data as Array<{ id: string; version: number; status: string }>;
for (const o of orders.slice(0, 3)) await c.post(`/api/v1/orders/${o.id}/transition`, { status: 'confirmed', version: o.version }, admin);
if (orders[5]) await c.post(`/api/v1/orders/${orders[5].id}/cancel`, { reason: 'Customer changed their mind' }, admin);
await t.pump();
// channel listings: two products published on the sandbox marketplace, one prepared but not published
{
  const wanted = ['UD-BLK-M', 'UD-BLK-L', 'SL-CH-TAN', 'SL-CH-BLK'];
  const catalogue = (await c.get('/api/v1/variants?limit=100', admin)).body?.data as Array<{ id: string; sku: string }> | undefined;
  const bySku = new Map((catalogue ?? []).map((v) => [v.sku, v.id]));
  for (const [i, sku] of wanted.entries()) {
    const variantId = bySku.get(sku);
    if (!variantId) { console.warn('seed: listing variant missing', sku); continue; }
    try {
      const l = await c.post('/api/v1/listings', { marketplaceAccountId: acct.id, variantId, marketplaceCategoryId: 'mock-apparel' }, admin);
      if (l.status !== 201) { console.warn('seed: listing', sku, l.status); continue; }
      if (i < 3) await c.post(`/api/v1/listings/${l.body.data.id}/publish-flow`, {}, admin);
    } catch (e) { console.warn('seed: listing', sku, (e as Error).message); }
  }
  await t.pump();
}
// warehouse work in every stage: awaiting pick, picking, ready to ship, in transit, delivered (with a return in progress)
const safe = async (label: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { console.warn('seed:', label, (e as Error).message); } };
const fulfil = async (orderId: string) => (await c.post(`/api/v1/orders/${orderId}/fulfillment`, {}, admin)).body.data.fulfillments[0] as { id: string; items: Array<{ id: string; quantity: number }> };
const pickPack = async (f: { id: string; items: Array<{ id: string; quantity: number }> }) => {
  const pl = await c.post('/api/v1/pick-lists', { fulfillmentIds: [f.id] }, admin);
  for (const task of pl.body.data.tasks as Array<{ id: string; sku: string; quantity: number }>) {
    await c.post(`/api/v1/pick-tasks/${task.id}/scan`, { itemBarcode: task.sku }, admin);
    await c.post(`/api/v1/pick-tasks/${task.id}/pick`, { quantity: task.quantity }, admin);
  }
  await t.pump();
  const pkg = await c.post(`/api/v1/fulfillments/${f.id}/packages`, { boxType: 'small', items: f.items.map((i) => ({ fulfillmentItemId: i.id, quantity: i.quantity })) }, admin);
  for (const line of pkg.body.data.items as Array<{ sku: string }>) await c.post(`/api/v1/packages/${pkg.body.data.id}/scan`, { itemBarcode: line.sku }, admin);
  await c.post(`/api/v1/packages/${pkg.body.data.id}/close`, { weightGrams: 600, lengthMm: 300, widthMm: 200, heightMm: 50 }, admin);
  await t.pump();
};
await safe('enable sandbox courier', async () => { await c.post('/api/v1/shipping/providers', { providerCode: 'sandbox' }, admin); });
const confirmed = (await c.get('/api/v1/orders?limit=20', admin)).body.data.filter((o: { status: string }) => o.status === 'confirmed') as Array<{ id: string }>;
await safe('awaiting pick', async () => { await fulfil(confirmed[0]!.id); });
await safe('picking', async () => { const f = await fulfil(confirmed[1]!.id); await c.post('/api/v1/pick-lists', { fulfillmentIds: [f.id] }, admin); });
await safe('ready to ship', async () => { const f = await fulfil(confirmed[2]!.id); await pickPack(f); await c.post('/api/v1/shipments', { fulfillmentId: f.id, providerCode: 'sandbox' }, admin); });
const shipped: string[] = [];
for (const sku of [sku1, sku2]) {
  mockControl.placeOrder(acct.sellerId, [{ sku, quantity: 1 }]);
}
await c.post(`/api/v1/marketplace-accounts/${acct.id}/sync-orders`, {}, admin);
await t.pump();
const fresh = (await c.get('/api/v1/orders?limit=20&filter[status]=new', admin)).body.data as Array<{ id: string; version: number }>;
for (const o of fresh.slice(0, 2)) {
  await safe('ship order', async () => {
    await c.post(`/api/v1/orders/${o.id}/transition`, { status: 'confirmed', version: o.version }, admin);
    const f = await fulfil(o.id);
    await pickPack(f);
    const sh = await c.post('/api/v1/shipments', { fulfillmentId: f.id, providerCode: 'sandbox' }, admin);
    await c.post(`/api/v1/shipments/${sh.body.data.id}/dispatch`, {}, admin);
    await t.pump();
    shipped.push(sh.body.data.id as string);
    await c.post(`/api/v1/shipments/${sh.body.data.id}/simulate`, { status: 'in_transit' }, admin);
    await t.pump();
  });
}
await safe('delivered + return', async () => {
  const id = shipped[0]!;
  await c.post(`/api/v1/shipments/${id}/simulate`, { status: 'delivered' }, admin);
  await t.pump();
  const shipment = (await c.get(`/api/v1/shipments/${id}`, admin)).body.data as { orderId: string };
  const order = (await c.get(`/api/v1/orders/${shipment.orderId}`, admin)).body.data as { items: Array<{ id: string }> };
  const ret = await c.post('/api/v1/returns', { orderId: shipment.orderId, reasonCode: 'size_fit', pickupRequired: true, items: [{ orderItemId: order.items[0]!.id, quantity: 1 }] }, admin);
  if (ret.status === 201) await c.post(`/api/v1/returns/${ret.body.data.id}/approve`, {}, admin);
});
await t.pump();
await rollupRecent(t.container, 2); // sales velocity and the dashboard read the daily roll-ups
await c.post('/api/v1/issues/refresh', {}, admin);

// jobs and events run in the background like the real worker would
setInterval(() => { t.pump().catch(() => undefined); }, 1000);
setInterval(() => { rollupRecent(t.container, 2).catch(() => undefined); }, 60_000);
// The real deployment has a scheduler process that enqueues these jobs; the demo has none, so alerts, issues, scheduled
// campaigns, price sales and report schedules would never move on their own. Run the ones that keep the screens current
// (the marketplace fan-outs are left out: Sync Now on the Hub stays the way to pull data here).
const DEMO_SCHEDULES: Array<{ queue: 'maintenance'; job: string; everyMs: number }> = [
  { queue: 'maintenance', job: 'issues.sweep', everyMs: 30_000 },
  { queue: 'maintenance', job: 'promotions.tick', everyMs: 30_000 },
  { queue: 'maintenance', job: 'pricing.process-sales', everyMs: 30_000 },
  { queue: 'maintenance', job: 'notifications.scan-alerts', everyMs: 60_000 },
  { queue: 'maintenance', job: 'automation.scan', everyMs: 60_000 },
  { queue: 'maintenance', job: 'reports.run-schedules', everyMs: 60_000 },
  { queue: 'maintenance', job: 'pricing.proposals-tick', everyMs: 5 * 60_000 },
];
for (const s of DEMO_SCHEDULES) {
  setInterval(() => {
    (t.container.queues as unknown as { enqueue: (q: string, job: string, env: unknown) => Promise<unknown> })
      .enqueue(s.queue, s.job, { vendorId: null, correlationId: randomUUID(), data: {} })
      .catch(() => undefined);
  }, s.everyMs);
}


await t.app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`\nOMS local server on http://localhost:${PORT}  (docs: /docs)\n  admin@nova.test / ${PASSWORD}  (owner, onboarding complete)\n  staff@nova.test / staff-password-123\n  viewer@nova.test / staff-password-123\n`);

const stop = async () => { await t.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
