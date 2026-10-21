import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withVendor } from '@oms/database';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';
import { buildWorld, orderArrives, pickAndPack, ship, type World } from '../helpers/stage4';
import { search } from '../../modules/workspace/src/search';
import { dashboard } from '../../modules/workspace/src/dashboard';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
let w: World;
let admin: Actor;
let staff: Actor;
let viewer: Actor;
let other: Actor;

/** run SQL as the table owner (bypasses RLS): arrange facts the API cannot produce on purpose */
const owner = async <T = any>(q: string, params: unknown[] = []): Promise<T[]> => {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { return (await pg.query<T>(q, params)).rows; } finally { await pg.exec('SET ROLE oms_app'); }
};
const addIssue = (vendorId: string, o: { key: string; area: string; count?: number; status?: string; priority?: string; title?: string; scope?: string; action?: object; details?: object }) =>
  owner(`insert into issues (vendor_id, key, scope_hash, area, priority, status, title, count, recommended_action, details) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`,
    [vendorId, o.key, o.scope ?? '', o.area, o.priority ?? 'high', o.status ?? 'open', o.title ?? o.key, o.count ?? 1, JSON.stringify(o.action ?? {}), JSON.stringify(o.details ?? {})]);
const shell = async (as: Actor) => (await c.get('/api/v1/workspace/shell', as)).body.data;
const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, k: number) => day(new Date(Date.parse(d) + k * 86_400_000));

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  w = await buildWorld(t, c, { warehouses: 1, stock: [20], sku: 'TRV-1042' });
  admin = w.admin;
  staff = await c.addMember(admin, 'vendor_staff');
  viewer = await c.addMember(admin, 'vendor_viewer');
  other = await c.registerVendor({ businessName: 'Other Co' });
});
afterAll(() => t.close());

describe('shell', () => {
  it('returns the user, business, flags and today', async () => {
    const r = await c.get('/api/v1/workspace/shell', admin);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      user: { id: admin.userId, name: 'Asha Admin', initials: 'AA', roleLabel: 'Business owner' },
      business: { id: admin.vendorId, tier: 'starter' }, businesses: [{ id: admin.vendorId, current: true }],
      badges: { needsAttention: 0, orders: 0, returns: 0, notifications: 0 }, inventoryMode: null,
    });
    expect(r.body.data.business.name).toMatch(/^Stage4 /);
    expect(r.body.data.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof r.body.data.features).toBe('object');
    expect((await shell(viewer)).user.roleLabel).toBe('Viewer');
    expect((await shell(staff)).user.roleLabel).toBe('Team member');
  });

  it('derives the tier from the team size and reads the inventory mode', async () => {
    await owner(`update vendors set team_size = '6_20', settings = settings || '{"inventory":{"mode":"warehouse"}}'::jsonb where id = $1`, [admin.vendorId]);
    expect(await shell(admin)).toMatchObject({ business: { tier: 'growing' }, inventoryMode: 'warehouse' });
    await owner(`update vendors set team_size = '50_plus' where id = $1`, [admin.vendorId]);
    expect((await shell(admin)).business.tier).toBe('scale');
    await owner(`update vendors set team_size = 'just_me' where id = $1`, [admin.vendorId]);
    expect((await shell(admin)).business.tier).toBe('starter');
  });

  it('GET /me/businesses lists the one business', async () => {
    const r = await c.get('/api/v1/me/businesses', admin);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([expect.objectContaining({ id: admin.vendorId, current: true, roleLabel: 'Business owner' })]);
    expect((await c.get('/api/v1/me/businesses', other)).body.data[0].id).toBe(other.vendorId);
  });

  it('requires a signed-in user', async () => {
    expect((await c.get('/api/v1/workspace/shell')).status).toBe(401);
    expect((await c.get('/api/v1/me/businesses')).status).toBe(401);
  });

  it('badges follow the data: open issue groups, orders needing attention, notifications', async () => {
    const v = admin.vendorId!;
    await addIssue(v, { key: 'stock_below_threshold', area: 'inventory', count: 18 });
    await addIssue(v, { key: 'orders_dispatch_risk', area: 'orders', count: 7, status: 'in_progress' });
    await addIssue(v, { key: 'listings_incomplete', area: 'listings', status: 'snoozed' });
    await addIssue(v, { key: 'refund_failed', area: 'returns', status: 'resolved' });
    expect((await shell(admin)).badges.needsAttention).toBe(2); // groups, not records; snoozed and resolved are out
    expect((await shell(viewer)).badges.needsAttention).toBe(2);

    const order = await orderArrives(t, c, w, 1);
    expect((await shell(admin)).badges.orders).toBe(0);
    await owner(`update orders set attention_reason = 'unmapped_sku' where id = $1`, [order.id]);
    expect((await shell(admin)).badges.orders).toBe(1);
    await owner(`update orders set attention_reason = null, dispatch_due_at = now() + interval '30 minutes' where id = $1`, [order.id]); // inside the at-risk window
    expect((await shell(admin)).badges.orders).toBe(1);
    await owner(`update orders set dispatch_due_at = now() + interval '10 hours' where id = $1`, [order.id]);
    expect((await shell(admin)).badges.orders).toBe(0);
    await owner(`update orders set dispatch_due_at = now() - interval '1 hour', status = 'dispatched' where id = $1`, [order.id]); // already gone: not "needs attention"
    expect((await shell(admin)).badges.orders).toBe(0);

    const baseAdmin = (await shell(admin)).badges.notifications;
    const baseStaff = (await shell(staff)).badges.notifications;
    await owner(`insert into notifications (vendor_id, user_id, type, title) values ($1,$2,'low_stock','Low stock'), ($1,$2,'sync_failed','Sync failed'), ($1,$3,'low_stock','Not yours')`, [v, admin.userId, staff.userId]);
    expect((await shell(admin)).badges.notifications).toBe(baseAdmin + 2);
    expect((await shell(staff)).badges.notifications).toBe(baseStaff + 1);
    expect((await c.post('/api/v1/notifications/read', { all: true }, admin)).status).toBe(200);
    expect((await shell(admin)).badges.notifications).toBe(0);
  });

  it('is tenant isolated', async () => {
    expect((await shell(other)).badges).toEqual({ needsAttention: 0, orders: 0, returns: 0, notifications: 0 });
  });
});

describe('search', () => {
  const q = async (qs: string, as: Actor = admin) => c.get(`/api/v1/search?${qs}`, as);
  const group = (r: any, type: string) => r.body.data.groups.find((g: any) => g.type === type);
  let bag: { productId: string; variantId: string };

  beforeAll(async () => {
    bag = await c.makeVariant(admin, { sku: 'BAG-1', title: 'Premium Travel Bag', barcode: '8901234567890' });
    await c.stock(admin, bag.variantId, w.warehouses[0]!.id, 3);
    await c.makeVariant(admin, { sku: 'COT-100', title: 'Cotton 100% Tee' });
    await c.makeVariant(admin, { sku: 'COT-1000', title: 'Cotton 1000 Tee' });
    for (let i = 1; i <= 7; i++) await c.makeVariant(admin, { sku: `WID-${i}`, title: `Limit Widget ${i}` });
  });

  it('finds products with their stock status', async () => {
    const r = await q('q=travel');
    expect(r.status).toBe(200);
    const g = group(r, 'product');
    expect(g).toMatchObject({ label: 'Products', total: 1 });
    expect(g.items[0]).toMatchObject({ id: bag.productId, title: 'Premium Travel Bag', subtitle: 'BAG-1 · 3 available · Low stock', badge: { key: 'low_stock', tone: 'warn' }, href: `/products/${bag.productId}` });
    expect(group(r, 'order').total).toBe(0);
    // a barcode and a SKU find the same product
    expect(group(await q('q=8901234567890'), 'product').items[0].title).toBe('Premium Travel Bag');
    expect(group(await q('q=bag-1'), 'product').total).toBe(1);
  });

  it('finds SKU rows per warehouse with available and threshold', async () => {
    const r = await q('q=TRV-1042&scope=skus');
    expect(r.body.data.groups.map((g: any) => g.type)).toEqual(['sku']);
    const available = await c.available(admin, w.variant.variantId);
    expect(group(r, 'sku').items[0]).toMatchObject({ title: 'TRV-1042 / Warehouse MAIN', subtitle: `Available ${available} · Threshold 5`, badge: { key: 'in_stock' }, href: `/inventory/variants/${w.variant.variantId}` });
    const low = group(await q('q=BAG-1&scope=skus'), 'sku').items[0];
    expect(low).toMatchObject({ subtitle: 'Available 3 · Threshold 5', badge: { key: 'low_stock' } });
  });

  it('finds orders by number and customer, with the stage and the dispatch deadline', async () => {
    const order = (await c.get('/api/v1/orders?limit=100', admin)).body.data[0];
    await owner(`update orders set status = 'confirmed', attention_reason = null, buyer = '{"name":"Priya Sharma"}'::jsonb, dispatch_due_at = now() where id = $1`, [order.id]);
    for (const term of [order.orderNumber, 'priya sha']) {
      const g = group(await q(`q=${encodeURIComponent(term)}&scope=orders`), 'order');
      expect(g.total).toBe(1);
      expect(g.items[0]).toMatchObject({ id: order.id, title: `Order ${order.orderNumber}`, subtitle: 'Stage 4 tee · Sandbox marketplace · Confirmed · Dispatch today', href: `/orders/${order.id}` });
    }
    await owner(`update orders set dispatch_due_at = (date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '36 hours') at time zone 'Asia/Kolkata' where id = $1`, [order.id]);
    expect(group(await q('q=priya&scope=orders'), 'order').items[0].subtitle).toMatch(/Dispatch tomorrow$/);
    await owner(`update orders set dispatch_due_at = now() - interval '3 days' where id = $1`, [order.id]);
    expect(group(await q('q=priya&scope=orders'), 'order').items[0].subtitle).toMatch(/Dispatch overdue$/);
    await owner(`update orders set status = 'delivered', attention_reason = 'x' where id = $1`, [order.id]);
    const done = group(await q('q=priya&scope=orders'), 'order').items[0];
    expect(done.subtitle).toBe('Stage 4 tee · Sandbox marketplace · Delivered'); // nothing left to dispatch
    expect(done.badge).toMatchObject({ key: 'needs_attention' });
  });

  it('limits every group and reports the full total', async () => {
    const r = await q('q=limit%20widget&limit=3&scope=products');
    expect(r.status).toBe(200);
    expect(group(r, 'product')).toMatchObject({ total: 7 });
    expect(group(r, 'product').items).toHaveLength(3);
    expect(r.body.data).toMatchObject({ total: 7, shown: 3 });
    expect(group(await q('q=limit%20widget'), 'product').items).toHaveLength(5); // default limit
    expect((await q('q=limit%20widget&limit=11')).status).toBe(400);
    expect((await q('q=limit%20widget&limit=0')).status).toBe(400);
  });

  it('needs two characters and a known scope', async () => {
    expect((await q('q=a')).status).toBe(400);
    expect((await q('q=')).status).toBe(400);
    expect((await q('q=%20%20x%20%20')).status).toBe(400); // trimmed first
    expect((await q('q=ab&scope=everything')).status).toBe(400);
    expect((await c.get('/api/v1/search?q=ab')).status).toBe(401);
  });

  it('treats % and _ typed by the user as plain characters', async () => {
    expect(group(await q('q=100%25&scope=products'), 'product')).toMatchObject({ total: 1 });
    expect(group(await q('q=100%25&scope=products'), 'product').items[0].title).toBe('Cotton 100% Tee');
    expect(group(await q('q=%25%25&scope=products'), 'product').total).toBe(0); // not "match everything"
    expect(group(await q('q=__&scope=products'), 'product').total).toBe(0);
    expect(group(await q('q=Cotton%20100_&scope=products'), 'product').total).toBe(0);
    expect(group(await q('q=cotton&scope=products'), 'product').total).toBe(2);
    expect(group(await q('q=%5C%5C&scope=products'), 'product').total).toBe(0);
    expect((await q('q=%5C%5C%25%25')).status).toBe(200); // a backslash is not an SQL escape either
  });

  it('omits the groups the caller cannot read', async () => {
    const run = (can: (p: string) => boolean) => withVendor(t.database!.db, admin.vendorId!, (tx) => search(tx, admin.vendorId!, can, { q: 'TRV', scope: 'all', limit: 5 }));
    expect((await run(() => true)).groups.map((g) => g.type)).toEqual(['product', 'order', 'sku']);
    expect((await run((p) => p === 'products:read')).groups.map((g) => g.type)).toEqual(['product']);
    expect((await run((p) => p === 'orders:read' || p === 'inventory:read')).groups.map((g) => g.type)).toEqual(['order', 'sku']);
    expect(await run(() => false)).toMatchObject({ groups: [], total: 0 });
    // the real roles that exist all read these three; a viewer gets everything
    expect((await q('q=TRV', viewer)).body.data.groups).toHaveLength(3);
  });

  it('never returns another tenant\'s data', async () => {
    const r = await q('q=TRV', other);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ total: 0, shown: 0 });
    expect(r.body.data.groups.every((g: any) => g.items.length === 0)).toBe(true);
    for (const term of ['travel', 'priya', 'Cotton', 'BAG-1']) expect((await q(`q=${term}`, other)).body.data.total).toBe(0);
  });
});

describe('saved views', () => {
  const create = (body: object, as: Actor = admin) => c.post('/api/v1/views', body, as);
  const list = async (qs = '', as: Actor = admin) => (await c.get(`/api/v1/views${qs}`, as)).body.data as any[];
  let mine: any;
  let shared: any;

  it('saves a view with filters and lists it for its creator only', async () => {
    const r = await create({ screen: 'products', name: 'Low stock bags', filters: { q: 'bag', status: 'active', channel: ['amazon_in', 'mock'], needsAttention: true }, sort: '-updatedAt' });
    expect(r.status).toBe(201);
    mine = r.body.data;
    expect(mine).toMatchObject({ screen: 'products', name: 'Low stock bags', shared: false, sort: '-updatedAt', mine: true, canEdit: true, filters: { q: 'bag', channel: ['amazon_in', 'mock'], needsAttention: true } });
    expect((await list('?screen=products')).map((v) => v.id)).toContain(mine.id);
    expect(await list('?screen=orders')).toEqual([]);
    expect(await list('', viewer)).toEqual([]); // private
    expect(await list('', staff)).toEqual([]);
    expect((await c.get('/api/v1/views?screen=nope', admin)).status).toBe(400);
  });

  it('shared views are visible to the business; only the creator or an admin changes them', async () => {
    const r = await create({ screen: 'products', name: 'Team view', filters: { status: 'draft' }, shared: true }, staff);
    expect(r.status).toBe(201);
    shared = r.body.data;
    const asViewer = (await list('?screen=products', viewer)).find((v) => v.id === shared.id);
    expect(asViewer).toMatchObject({ mine: false, canEdit: false, shared: true });
    expect((await list('?screen=products', admin)).find((v) => v.id === shared.id)).toMatchObject({ mine: false, canEdit: true });
    expect((await c.patch(`/api/v1/views/${shared.id}`, { name: 'Hijack' }, viewer)).status).toBe(403); // viewers have no views:write at all
    // another staff member (not the creator, not admin) cannot touch it
    const staff2 = await c.addMember(admin, 'vendor_staff');
    expect((await c.patch(`/api/v1/views/${shared.id}`, { name: 'Hijack' }, staff2)).status).toBe(403);
    expect((await c.del(`/api/v1/views/${shared.id}`, staff2)).status).toBe(403);
    // ... and cannot see or touch the private view of somebody else (it does not exist for them)
    expect((await c.patch(`/api/v1/views/${mine.id}`, { name: 'Hijack' }, staff2)).status).toBe(404);
    expect((await c.del(`/api/v1/views/${mine.id}`, staff2)).status).toBe(404);
    // the creator can, and so can an admin
    const own = await c.patch(`/api/v1/views/${shared.id}`, { name: 'Team view v2', filters: { status: 'active', q: 'x' } }, staff);
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({ name: 'Team view v2', filters: { status: 'active', q: 'x' }, version: 2 });
    expect((await c.patch(`/api/v1/views/${shared.id}`, { shared: false }, admin)).body.data.shared).toBe(false);
    expect((await list('?screen=products', viewer)).find((v) => v.id === shared.id)).toBeUndefined();
  });

  it('a viewer can read but not write', async () => {
    expect((await create({ screen: 'orders', name: 'Mine', filters: {} }, viewer)).status).toBe(403);
    expect((await c.del(`/api/v1/views/${mine.id}`, viewer)).status).toBe(403);
    expect((await c.get('/api/v1/views', viewer)).status).toBe(200);
    expect((await c.get('/api/v1/views')).status).toBe(401);
  });

  it('names are unique per user and screen', async () => {
    const dup = await create({ screen: 'products', name: 'Low stock bags', filters: {} });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toMatchObject({ rule: 'saved_view_name_taken' });
    expect((await create({ screen: 'inventory', name: 'Low stock bags', filters: { health: 'low' } })).status).toBe(201); // other screen
    expect((await create({ screen: 'products', name: 'Low stock bags', filters: {} }, staff)).status).toBe(201); // other user
    const renamed = await c.patch(`/api/v1/views/${mine.id}`, { name: 'Low stock bags' }, admin); // itself is fine
    expect(renamed.status).toBe(200);
    const second = (await create({ screen: 'products', name: 'Another', filters: {} })).body.data;
    expect((await c.patch(`/api/v1/views/${second.id}`, { name: 'Low stock bags' }, admin)).status).toBe(409);
  });

  it('allows at most 50 views per user and screen', async () => {
    for (let i = 1; i <= 50; i++) expect((await create({ screen: 'returns', name: `View ${i}`, filters: { tab: 'open' } }, staff)).status).toBe(201);
    const over = await create({ screen: 'returns', name: 'View 51', filters: {} }, staff);
    expect(over.status).toBe(409);
    expect(over.body.error.details).toMatchObject({ rule: 'saved_view_limit', limit: 50 });
    expect((await create({ screen: 'returns', name: 'Admin one', filters: {} }, admin)).status).toBe(201); // the limit is per user
    const first = (await list('?screen=returns', staff)).find((v) => v.name === 'View 1');
    expect((await c.del(`/api/v1/views/${first.id}`, staff)).status).toBe(200);
    expect((await create({ screen: 'returns', name: 'View 51', filters: {} }, staff)).status).toBe(201);
  });

  it('rejects filters that are not on the screen allow-list or not simple values', async () => {
    const bad = async (screen: string, filters: unknown) => (await create({ screen, name: `bad ${Math.random()}`, filters })).status;
    expect(await bad('products', { bogus: 1 })).toBe(400);
    expect(await bad('products', { health: 'low' })).toBe(400); // an inventory filter on the products screen
    expect(await bad('inventory', { status: 'active' })).toBe(400);
    expect(await bad('orders', { q: { nested: true } })).toBe(400);
    expect(await bad('orders', { q: [['a']] })).toBe(400);
    expect(await bad('orders', { q: null })).toBe(400);
    expect(await bad('orders', { q: 'x'.repeat(201) })).toBe(400);
    expect(await bad('orders', { q: Array.from({ length: 51 }, () => 'a') })).toBe(400);
    expect(await bad('returns', { tab: Array.from({ length: 50 }, () => 'y'.repeat(200)) })).toBe(400); // > 8 KB
    expect(await bad('nope', {})).toBe(400);
    const err = await create({ screen: 'products', name: 'Err', filters: { bogus: 1 } });
    expect(JSON.stringify(err.body.error.details)).toContain('filters.bogus');
    for (const [screen, filters] of [['products', { productType: 'simple', categoryId: 'c1' }], ['inventory', { warehouse: 'w', stockMin: 1, stockMax: 9, movement: 'out', signal: 'x' }], ['orders', { marketplace: ['a'], slaState: 'at_risk', payment: 'cod', fulfillment: 'picking', attention: true, date: '2026-10-05' }], ['returns', { signal: 's', inspectionStatus: 'x', refundStatus: 'y', disposition: 'restock', marketplace: 'm' }]] as const) {
      expect(await bad(screen, filters)).toBe(201);
    }
    expect((await c.patch(`/api/v1/views/${mine.id}`, { filters: { bogus: 1 } }, admin)).status).toBe(400); // updates are validated against the stored screen
    expect((await create({ screen: 'products', name: 'x', filters: {}, extra: 1 })).status).toBe(400);
  });

  it('deletes a view and audits the writes', async () => {
    const del = await c.del(`/api/v1/views/${mine.id}`, admin);
    expect(del.status).toBe(200);
    expect(del.body.data).toEqual({ deleted: true });
    expect((await c.del(`/api/v1/views/${mine.id}`, admin)).status).toBe(404);
    expect((await list('?screen=products')).find((v) => v.id === mine.id)).toBeUndefined();
    const actions = (await owner<{ action: string }>(`select action from audit_logs where vendor_id = $1 and action like 'saved_view.%'`, [admin.vendorId])).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['saved_view.create', 'saved_view.update', 'saved_view.delete']));
  });

  it('is tenant isolated', async () => {
    const v = (await create({ screen: 'orders', name: 'Secret', filters: { q: 'x' }, shared: true })).body.data;
    expect(await list('', other)).toEqual([]);
    expect((await c.patch(`/api/v1/views/${v.id}`, { name: 'x' }, other)).status).toBe(404);
    expect((await c.del(`/api/v1/views/${v.id}`, other)).status).toBe(404);
    expect((await create({ screen: 'orders', name: 'Secret', filters: {} }, other)).status).toBe(201); // names are per tenant too
  });
});

describe('channel overview', () => {
  it('shows a healthy connection with its actions', async () => {
    const r = await c.get(`/api/v1/channels/${w.account.id}/overview`, admin);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      channel: { code: 'mock', name: 'Sandbox marketplace', accountId: w.account.id, availability: 'live' }, connection: 'connected', health: 'healthy', syncMode: 'automatic', openIssueCount: 0, openIssues: [],
      actions: [
        { key: 'retry_sync', method: 'POST', href: `/api/v1/marketplace-accounts/${w.account.id}/inventory-sync`, enabled: true, disabledReason: null },
        { key: 'manage', method: 'GET', enabled: true },
      ],
    });
    await owner(`update marketplace_accounts set config = config || '{"syncMode":"manual"}'::jsonb where id = $1`, [w.account.id]);
    expect((await c.get(`/api/v1/channels/${w.account.id}/overview`, admin)).body.data.syncMode).toBe('manual');
    await owner(`update marketplace_accounts set config = config - 'syncMode' where id = $1`, [w.account.id]);
  });

  it('lists failing sync jobs and the last failure, and recovers after a good run', async () => {
    mockControl.placeOrder(w.account.sellerId, [{ sku: w.variant.sku, quantity: 1 }]);
    mockControl.setBehavior(w.account.sellerId, { failNext: 1000, failKind: 'permanent' });
    expect((await c.post(`/api/v1/marketplace-accounts/${w.account.id}/sync-orders`, {}, admin)).status).toBeLessThan(300);
    await t.pump();
    const r = await c.get(`/api/v1/channels/${w.account.id}/overview`, admin);
    expect(r.body.data.health).toBe('attention');
    const issue = r.body.data.openIssues.find((i: any) => i.code === 'sync_orders_failed');
    expect(issue).toMatchObject({ title: 'Order sync failed', action: { label: 'View sync log' } });
    expect(issue.explanation.length).toBeGreaterThan(3);
    expect(issue.action.href).toMatch(/^\/sync\/jobs\/[0-9a-f-]{36}$/);
    expect(r.body.data.openIssueCount).toBe(r.body.data.openIssues.length);

    mockControl.setBehavior(w.account.sellerId, { failNext: 0 });
    await c.post(`/api/v1/marketplace-accounts/${w.account.id}/sync-orders`, {}, admin);
    await t.pump();
    const ok = await c.get(`/api/v1/channels/${w.account.id}/overview`, admin);
    expect(ok.body.data.openIssues.find((i: any) => i.code === 'sync_orders_failed')).toBeUndefined();
  });

  it('includes open issues scoped to the account and hides resolved ones', async () => {
    const v = admin.vendorId!;
    await addIssue(v, { key: 'inventory_push_rejected', area: 'channels', scope: w.account.id, title: 'Inventory update rejected', action: { label: 'Review mapping', href: '/channels/x/mapping' }, details: {} });
    await addIssue(v, { key: 'old_problem', area: 'channels', scope: w.account.id, status: 'resolved' });
    await addIssue(v, { key: 'elsewhere', area: 'listings', details: { accountId: '00000000-0000-4000-8000-000000000000' } });
    const r = await c.get(`/api/v1/channels/${w.account.id}/overview`, admin);
    const mine = r.body.data.openIssues.filter((i: any) => ['inventory_push_rejected', 'old_problem', 'elsewhere'].includes(i.code));
    expect(mine).toEqual([expect.objectContaining({ code: 'inventory_push_rejected', title: 'Inventory update rejected', action: { label: 'Review mapping', href: '/channels/x/mapping' } })]);
    await owner(`delete from issues where vendor_id = $1 and key = 'inventory_push_rejected'`, [v]);
  });

  it('disables Retry sync for roles that cannot start a sync, and refuses unknown or foreign accounts', async () => {
    const r = await c.get(`/api/v1/channels/${w.account.id}/overview`, viewer);
    expect(r.status).toBe(200);
    expect(r.body.data.actions[0]).toMatchObject({ key: 'retry_sync', enabled: false });
    expect(r.body.data.actions[0].disabledReason).toMatch(/role/);
    expect((await c.get('/api/v1/channels/00000000-0000-4000-8000-000000000000/overview', admin)).status).toBe(404);
    expect((await c.get(`/api/v1/channels/${w.account.id}/overview`, other)).status).toBe(404);
    expect((await c.get('/api/v1/channels/not-a-uuid/overview', admin)).status).toBe(400);
    expect((await c.get(`/api/v1/channels/${w.account.id}/overview`)).status).toBe(401);
  });
});

describe('dashboard', () => {
  let dw: World;
  let dAdmin: Actor;
  let asOf: string;
  const totals = {} as Record<string, number> & { today: number; yesterday: number; weekAgo: number };
  const dash = async (qs = '', as: Actor = dAdmin) => c.get(`/api/v1/dashboard${qs}`, as);
  const metric = (d: any, key: string) => d.snapshot.metrics.find((m: any) => m.key === key);

  beforeAll(async () => {
    dw = await buildWorld(t, c, { warehouses: 1, stock: [30], sku: 'DASH-1' });
    dAdmin = dw.admin;
    // orders: A (new), B (picking), F (in transit), H (delivered, then returned), I (ready to dispatch), E (cancelled) arrive today;
    // C yesterday; D seven days before
    const A = await orderArrives(t, c, dw, 2);
    const B = await orderArrives(t, c, dw, 3);
    const F = await orderArrives(t, c, dw, 1);
    const H = await orderArrives(t, c, dw, 1);
    const I = await orderArrives(t, c, dw, 1);
    const E = await orderArrives(t, c, dw, 1);
    const C = await orderArrives(t, c, dw, 1);
    const D = await orderArrives(t, c, dw, 1);
    asOf = day(new Date(A.placedAt));
    // a real return for H: ship it, return one unit
    const ful = (await c.post(`/api/v1/orders/${H.id}/fulfillment`, {}, dAdmin)).body.data.fulfillments[0];
    await pickAndPack(t, c, dw, ful.id);
    await ship(t, c, dw, ful.id);
    expect((await c.post('/api/v1/returns', { orderId: H.id, reasonCode: 'other', items: [{ orderItemId: H.items[0].id, quantity: 1 }] }, dAdmin)).status).toBe(201);
    const set = (o: any, status: string | null, placed = '0 days') => owner(`update orders set ${status ? `status = '${status}',` : ''} placed_at = placed_at - interval '${placed}' where id = $1`, [o.id]);
    await set(A, 'new');
    await set(B, 'picking');
    await set(F, 'in_transit');
    await set(H, 'delivered');
    await set(I, 'ready_to_dispatch');
    await set(E, 'cancelled');
    await set(C, null, '1 day');
    await set(D, null, '7 days');
    // keep every order on the right UTC day even when the test runs right after midnight
    const rows = await owner<{ id: string; placed_at: Date }>(`select id, placed_at from orders where vendor_id = $1`, [dAdmin.vendorId]);
    expect(rows).toHaveLength(8);
    const today = (await c.get('/api/v1/orders?limit=100', dAdmin)).body.data as any[];
    const total = (o: any) => today.find((x) => x.id === o.id).totalMinor as number;
    Object.assign(totals, { today: total(A) + total(B) + total(F) + total(H) + total(I), yesterday: total(C), weekAgo: total(D), A: total(A), D: total(D) });
    // the roll-up is built from the orders: rebuild the window (as the 15-minute job would)
    expect((await c.post('/api/v1/analytics/rollups/rebuild', { from: addDays(asOf, -120), to: asOf }, dAdmin)).status).toBe(200);
  });

  it('snapshot: today against yesterday from real orders (cancelled excluded, returns counted)', async () => {
    const r = await dash(`?asOf=${asOf}`);
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({ asOf, snapshot: { period: 'today', day: asOf, currency: 'INR' }, greeting: { firstName: 'Asha' } });
    expect(metric(d, 'orders')).toEqual({ key: 'orders', value: 5, previous: 1, changePct: 400 });
    expect(metric(d, 'units')).toEqual({ key: 'units', value: 8, previous: 1, changePct: 700 });
    expect(metric(d, 'revenueMinor')).toMatchObject({ value: totals.today, previous: totals.yesterday, changePct: Math.round(((totals.today - totals.yesterday) / totals.yesterday) * 1000) / 10 });
    expect(metric(d, 'returnRatePct')).toMatchObject({ value: 12.5, previous: 0, changePct: null }); // 1 of 8 units; null when the previous period had none
    expect(d.generatedAt).toMatch(/Z$/);
  });

  it('no previous data means changePct is null', async () => {
    const d = (await dash(`?asOf=${addDays(asOf, -1)}`)).body.data; // yesterday vs the day before (nothing)
    expect(metric(d, 'orders')).toEqual({ key: 'orders', value: 1, previous: 0, changePct: null });
    expect(metric(d, 'revenueMinor')).toMatchObject({ value: totals.yesterday, previous: 0, changePct: null });
    const empty = (await dash('?asOf=2020-01-01')).body.data;
    expect(metric(empty, 'orders')).toEqual({ key: 'orders', value: 0, previous: 0, changePct: null });
  });

  it('sales: zero-filled daily series with the previous period shifted by its length, and the channel split', async () => {
    const d = (await dash(`?asOf=${asOf}&salesPeriod=7d`)).body.data;
    expect(d.sales).toMatchObject({ period: '7d', currency: 'INR' });
    expect(d.sales.series).toHaveLength(7);
    expect(d.sales.series.map((s: any) => s.day)).toEqual(Array.from({ length: 7 }, (_, i) => addDays(asOf, i - 6)));
    const last = d.sales.series[6];
    expect(last).toEqual({ day: asOf, revenueMinor: totals.today, previousRevenueMinor: totals.weekAgo, orders: 5 }); // D (seven days before) is the comparison of today
    expect(d.sales.series[5]).toMatchObject({ day: addDays(asOf, -1), revenueMinor: totals.yesterday, orders: 1 });
    expect(d.sales.series.slice(0, 5).every((s: any) => s.revenueMinor === 0 && s.orders === 0)).toBe(true); // zero-filled
    expect(d.sales.channelContribution).toEqual([{ channel: { code: 'mock', name: 'Sandbox marketplace' }, revenueMinor: totals.today, orders: 5, sharePct: 100 }]);
    for (const [p, n] of [['30d', 30], ['90d', 90]] as const) expect((await dash(`?asOf=${asOf}&salesPeriod=${p}`)).body.data.sales.series).toHaveLength(n);
    const month = (await dash(`?asOf=${asOf}`)).body.data.sales; // default 30d
    expect(month.period).toBe('30d');
    expect(month.series.reduce((a: number, s: any) => a + s.revenueMinor, 0)).toBe(totals.today + totals.yesterday + totals.weekAgo);
  });

  it('order flow counts the orders created that day by stage', async () => {
    const d = (await dash(`?asOf=${asOf}`)).body.data;
    expect(d.orderFlow).toEqual([
      { stage: 'new', count: 1 }, { stage: 'confirmed', count: 0 }, { stage: 'picking', count: 1 }, { stage: 'packing', count: 1 }, { stage: 'dispatched', count: 1 }, { stage: 'delivered', count: 1 },
    ]);
    expect((await dash(`?asOf=${addDays(asOf, -1)}`)).body.data.orderFlow.reduce((a: number, s: any) => a + s.count, 0)).toBe(1);
  });

  it('inventory health and the most affected products', async () => {
    const low = await c.makeVariant(dAdmin, { sku: 'LOW-1', title: 'Classic Backpack' });
    await c.stock(dAdmin, low.variantId, dw.warehouses[0]!.id, 4);
    const lower = await c.makeVariant(dAdmin, { sku: 'LOW-2', title: 'Weekender Duffel' });
    await c.stock(dAdmin, lower.variantId, dw.warehouses[0]!.id, 2);
    const out = await c.makeVariant(dAdmin, { sku: 'OUT-1', title: 'Cotton Overshirt' }); // never stocked
    const d = (await dash(`?asOf=${asOf}`)).body.data;
    expect(d.inventoryHealth).toMatchObject({ healthy: 1, low: 2, out: 1 });
    expect(d.inventoryHealth.mostAffected).toEqual([
      { productId: out.productId, title: 'Cotton Overshirt', sku: 'OUT-1', available: 0, status: 'out' },
      { productId: lower.productId, title: 'Weekender Duffel', sku: 'LOW-2', available: 2, status: 'low' },
      { productId: low.productId, title: 'Classic Backpack', sku: 'LOW-1', available: 4, status: 'low' },
    ]);
    expect(metric(d, 'lowStockProducts')).toEqual({ key: 'lowStockProducts', value: 2, previous: null, changePct: null, note: 'needs_review' });
    await owner(`update vendors set settings = settings || '{"lowStockThreshold":1}'::jsonb where id = $1`, [dAdmin.vendorId]); // threshold from the business settings
    expect((await dash(`?asOf=${asOf}`)).body.data.inventoryHealth).toMatchObject({ healthy: 3, low: 0, out: 1 });
  });

  it('needs attention: one row per area with records, omitted at zero', async () => {
    const v = dAdmin.vendorId!;
    expect((await dash()).body.data.needsAttention).toEqual({ items: [] });
    await addIssue(v, { key: 'stock_below_threshold', area: 'inventory', count: 18 });
    await addIssue(v, { key: 'orders_dispatch_risk', area: 'orders', count: 7, status: 'in_progress' });
    await addIssue(v, { key: 'channel_sync_failing', area: 'channels', count: 2, status: 'snoozed' });
    await addIssue(v, { key: 'listings_incomplete', area: 'listings', count: 0, status: 'open' }); // an open group of unknown size counts as one record
    const items = (await dash()).body.data.needsAttention.items;
    expect(items.map((i: any) => [i.issueKey, i.count])).toEqual([['low_stock', 18], ['orders_at_risk', 7], ['listing_issue', 1]]);
    expect(items[0]).toMatchObject({ area: 'inventory', title: 'Low stock', summary: '18 products are running low on inventory', action: { label: 'Review inventory', href: '/inventory?health=low' } });
    expect(items[1].summary).toBe('7 orders need action before dispatch');
    expect(items[2].summary).toBe('1 marketplace listing needs attention');
    await owner(`update issues set status = 'open' where vendor_id = $1 and key = 'channel_sync_failing'`, [v]);
    expect((await dash()).body.data.needsAttention.items.map((i: any) => i.issueKey)).toEqual(['low_stock', 'orders_at_risk', 'listing_issue', 'sync_issue']);
    expect((await dash()).body.data.needsAttention.items[3].summary).toBe('2 channel connections need attention');
    expect((await shell(dAdmin)).badges).toMatchObject({ needsAttention: 4, returns: 1 }); // groups; and the return waiting for approval
  });

  it('recommendation: the latest open one, or null', async () => {
    const v = dAdmin.vendorId!;
    expect((await dash()).body.data.recommendation).toBeNull();
    await owner(`insert into ai_recommendations (vendor_id, kind, title, summary, status, created_at) values ($1,'reorder','Old advice','old','open', now() - interval '2 days'), ($1,'reorder','Dismissed','x','rejected', now()), ($1,'reorder','Expired','x','open', now() - interval '3 days')`, [v]);
    await owner(`update ai_recommendations set expires_at = now() - interval '1 day' where title = 'Expired'`);
    await owner(`insert into ai_recommendations (vendor_id, kind, title, summary, status) values ($1,'reorder','18 products are approaching their stock threshold.','Based on recent sales velocity, replenishing 6 products this week could reduce potential stockouts.','open')`, [v]);
    const rec = (await dash()).body.data.recommendation;
    expect(rec).toMatchObject({ title: '18 products are approaching their stock threshold.', rationale: expect.stringContaining('replenishing 6 products'), status: 'open', actions: ['review', 'dismiss'], recommendationOnly: true });
    // a role without ai:use does not get the section at all
    const asViewer = await c.addMember(dAdmin, 'vendor_viewer');
    const vd = await dash('', asViewer);
    expect(vd.status).toBe(200);
    expect('recommendation' in vd.body.data).toBe(false);
    expect(vd.body.data.needsAttention.items.length).toBeGreaterThan(0);
  });

  it('channel health reflects connection and failing syncs, and the system status follows', async () => {
    let d = (await dash(`?asOf=${asOf}`)).body.data;
    expect(d.channelHealth).toEqual([expect.objectContaining({ channel: { code: 'mock', name: 'Sandbox marketplace', accountId: dw.account.id, availability: 'live' }, health: 'healthy', connection: 'connected', openIssues: 0, action: { key: 'details', href: `/channels/${dw.account.id}` } })]);
    expect(d.channelHealth[0].lastSyncAt).toMatch(/Z$/);
    expect(d.sync).toEqual({ lastSyncedAt: d.channelHealth[0].lastSyncAt, systemStatus: 'operational' });

    mockControl.placeOrder(dw.account.sellerId, [{ sku: dw.variant.sku, quantity: 1 }]);
    mockControl.setBehavior(dw.account.sellerId, { failNext: 1000, failKind: 'permanent' });
    await c.post(`/api/v1/marketplace-accounts/${dw.account.id}/sync-orders`, {}, dAdmin);
    await t.pump();
    d = (await dash(`?asOf=${asOf}`)).body.data;
    expect(d.channelHealth[0]).toMatchObject({ health: 'attention', action: { key: 'review' } });
    expect(d.channelHealth[0].openIssues).toBeGreaterThan(0);
    expect(d.sync.systemStatus).toBe('degraded');
    const overview = (await c.get(`/api/v1/channels/${dw.account.id}/overview`, dAdmin)).body.data;
    expect(d.channelHealth[0].openIssues).toBe(overview.openIssues.length); // the panel and the card agree
    mockControl.setBehavior(dw.account.sellerId, { failNext: 0 });
    // an account that was never authorized is not a connected channel
    await c.post('/api/v1/marketplace-accounts', { marketplace: 'mock', displayName: 'Pending one', mode: 'sandbox' }, dAdmin);
    expect((await dash(`?asOf=${asOf}`)).body.data.channelHealth.map((x: any) => x.channel.accountId)).toEqual([dw.account.id]);
  });

  it('omits the sections the caller may not read', async () => {
    const run = (can: (p: string) => boolean) => withVendor(t.database!.db, dAdmin.vendorId!, (tx) => dashboard(tx, { vendorId: dAdmin.vendorId!, actorType: 'user', actorId: dAdmin.userId }, can, { asOf, salesPeriod: '7d' })) as Promise<any>;
    const only = await run((p) => p === 'analytics:read');
    expect(Object.keys(only).sort()).toEqual(['asOf', 'generatedAt', 'greeting', 'sales', 'snapshot']);
    expect(only.snapshot.metrics.map((m: any) => m.key)).toEqual(['orders', 'revenueMinor', 'units', 'returnRatePct']); // no stock permission, no stock metric
    const withOrders = await run((p) => p === 'analytics:read' || p === 'orders:read');
    expect(withOrders.orderFlow).toHaveLength(6);
    expect(withOrders.inventoryHealth).toBeUndefined();
    const all = await run(() => true);
    expect(Object.keys(all)).toEqual(expect.arrayContaining(['needsAttention', 'recommendation', 'orderFlow', 'inventoryHealth', 'channelHealth', 'sync']));
  });

  it('validates its query and requires a sign-in', async () => {
    expect((await dash('?asOf=2026-13-45')).status).toBe(400);
    expect((await dash('?asOf=yesterday')).status).toBe(400);
    expect((await dash('?asOf=2026-02-30')).status).toBe(400);
    expect((await dash('?salesPeriod=10d')).status).toBe(400);
    expect((await c.get('/api/v1/dashboard')).status).toBe(401);
  });

  it('a business with no data gets zeros, not errors', async () => {
    const fresh = await c.registerVendor({ businessName: 'Empty Co' });
    const r = await c.get('/api/v1/dashboard', fresh);
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.needsAttention).toEqual({ items: [] });
    expect(d.recommendation).toBeNull();
    expect(d.snapshot.metrics).toEqual([
      { key: 'orders', value: 0, previous: 0, changePct: null }, { key: 'revenueMinor', value: 0, previous: 0, changePct: null }, { key: 'units', value: 0, previous: 0, changePct: null },
      { key: 'returnRatePct', value: 0, previous: 0, changePct: null }, { key: 'lowStockProducts', value: 0, previous: null, changePct: null, note: 'ok' },
    ]);
    expect(d.sales.series).toHaveLength(30);
    expect(d.sales.series.every((s: any) => s.revenueMinor === 0 && s.previousRevenueMinor === 0 && s.orders === 0)).toBe(true);
    expect(d.sales.channelContribution).toEqual([]);
    expect(d.orderFlow.map((s: any) => s.count)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(d.inventoryHealth).toEqual({ healthy: 0, low: 0, out: 0, mostAffected: [] });
    expect(d.channelHealth).toEqual([]);
    expect(d.sync).toEqual({ lastSyncedAt: null, systemStatus: 'operational' });
    expect((await c.get('/api/v1/workspace/shell', fresh)).body.data.badges).toEqual({ needsAttention: 0, orders: 0, returns: 0, notifications: 0 });
  });

  it('is tenant isolated', async () => {
    const d = (await dash(`?asOf=${asOf}`, other)).body.data;
    expect(metric(d, 'orders').value).toBe(0);
    expect(d.orderFlow.every((s: any) => s.count === 0)).toBe(true);
    expect(d.channelHealth).toEqual([]);
    expect(d.inventoryHealth.mostAffected).toEqual([]);
    expect(d.needsAttention.items).toEqual([]);
  });
});
