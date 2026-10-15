import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let viewer: Actor;
let other: Actor;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  admin = await c.registerVendor({ businessName: 'Nova Living' });
  viewer = await c.addMember(admin, 'vendor_viewer');
  other = await c.registerVendor({ businessName: 'Other Co' });
});
afterAll(() => t.close());

const step = (state: any, key: string) => state.steps.find((s: any) => s.key === key);

describe('state and resume', () => {
  it('starts on the business step with 0% and lazily creates the row', async () => {
    const r = await c.get('/api/v1/onboarding', admin);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'in_progress', currentStep: 'business', resumeStep: 'business', percentComplete: 0 });
    expect(r.body.data.steps.map((s: any) => s.key)).toEqual(['business', 'channels', 'products', 'inventory', 'fulfillment', 'ready']);
    expect(step(r.body.data, 'business')).toMatchObject({ status: 'in_progress', skippable: false });
    expect(step(r.body.data, 'channels').skippable).toBe(true);
  });

  it('serves the choices for the business screen', async () => {
    const r = await c.get('/api/v1/onboarding/options', admin);
    expect(r.body.data.businessTypes.map((b: any) => b.value)).toEqual(['d2c_brand', 'marketplace_seller', 'retail', 'wholesaler', 'social_commerce', 'other']);
    expect(r.body.data.teamSizes.map((s: any) => s.label)).toEqual(['Just me', '2–5', '6–20', '21–50', '50+']);
  });

  it('keeps a draft for "Save & exit", never accepts secrets, and resumes on that step', async () => {
    const bad = await c.put('/api/v1/onboarding/steps/business/draft', { data: { password: 'x' } }, admin);
    expect(bad.status).toBe(400);
    const ok = await c.put('/api/v1/onboarding/steps/business/draft', { data: { businessName: 'Half typed' } }, admin);
    expect(ok.status).toBe(200);
    expect(ok.body.data.drafts.business).toEqual({ businessName: 'Half typed' });
    expect(ok.body.data.currentStep).toBe('business');
  });

  it('is per business and per permission', async () => {
    expect((await c.get('/api/v1/onboarding', other)).body.data.drafts).toEqual({});
    expect((await c.get('/api/v1/onboarding', viewer)).status).toBe(200);
    expect((await c.put('/api/v1/onboarding/business', { businessName: 'Nope', businessType: 'retail', teamSize: 'just_me', operatingLocation: 'Pune' }, viewer)).status).toBe(403);
    expect((await c.get('/api/v1/onboarding')).status).toBe(401);
  });
});

describe('02 business', () => {
  it('validates, saves into the vendor profile and completes the step', async () => {
    expect((await c.put('/api/v1/onboarding/business', { businessName: 'N', businessType: 'robot', teamSize: 'just_me', operatingLocation: 'Pune' }, admin)).status).toBe(400);
    const r = await c.put('/api/v1/onboarding/business', { businessName: 'Nova Living', businessType: 'd2c_brand', teamSize: '6_20', operatingLocation: 'Mumbai, Maharashtra' }, admin);
    expect(r.status).toBe(200);
    expect(r.body.data.business).toMatchObject({ businessName: 'Nova Living', businessType: 'd2c_brand', teamSize: '6_20', workspaceTier: 'growing' });
    expect(step(r.body.data.state, 'business').status).toBe('completed');
    expect(r.body.data.state.resumeStep).toBe('channels');
    expect(r.body.data.state.drafts.business).toBeUndefined();
    const vendor = await c.get('/api/v1/vendor', admin);
    expect(vendor.body.data).toMatchObject({ displayName: 'Nova Living', businessType: 'd2c_brand', teamSize: '6_20', operatingLocation: 'Mumbai, Maharashtra' });
  });

  it('cannot skip the business step', async () => {
    const r = await c.post('/api/v1/onboarding/steps/business/skip', {}, admin);
    expect(r.status).toBe(409);
    expect(r.body.error.details.rule).toBe('step_not_skippable');
  });
});

describe('03 sales channels', () => {
  it('lists real channels as available and Meesho / Shopify / Social Commerce as coming soon', async () => {
    const r = await c.get('/api/v1/onboarding/channels', admin);
    const by = Object.fromEntries(r.body.data.items.map((i: any) => [i.code, i]));
    for (const code of ['amazon_in', 'flipkart', 'snapdeal', 'myntra']) expect(by[code]).toMatchObject({ availability: 'available', connection: 'not_connected', actions: ['connect'] });
    for (const code of ['meesho', 'shopify', 'social_commerce']) expect(by[code]).toMatchObject({ availability: 'coming_soon', actions: [] });
    expect(r.body.data.summary).toMatchObject({ connected: 0 });
  });

  it('refuses to connect a coming-soon channel but lets the seller register interest', async () => {
    const no = await c.post('/api/v1/onboarding/channels/shopify/connect', {}, admin);
    expect(no.status).toBe(409);
    expect(no.body.error.details).toMatchObject({ rule: 'channel_coming_soon', channel: 'shopify' });
    expect((await c.put('/api/v1/onboarding/channels', { selected: ['nope'] }, admin)).status).toBe(400);
    const r = await c.put('/api/v1/onboarding/channels', { selected: ['shopify', 'flipkart'] }, admin);
    expect(r.status).toBe(200);
    expect(r.body.data.selected).toEqual(['shopify', 'flipkart']);
    const list = await c.get('/api/v1/onboarding/channels', admin);
    expect(list.body.data.summary).toMatchObject({ selectedToConnect: 1, interestedInComingSoon: 1 });
  });

  it('connect creates the account once and points at the authorization flow', async () => {
    const a = await c.post('/api/v1/onboarding/channels/flipkart/connect', { mode: 'sandbox' }, admin);
    expect(a.status).toBe(201);
    expect(a.body.data).toMatchObject({ created: true, status: 'pending_authorization' });
    expect(a.body.data.next.authorizationUrl).toContain(a.body.data.accountId);
    const b = await c.post('/api/v1/onboarding/channels/flipkart/connect', {}, admin);
    expect(b.body.data).toMatchObject({ created: false, accountId: a.body.data.accountId });
    expect((await c.get('/api/v1/onboarding/channels', other)).body.data.items.find((i: any) => i.code === 'flipkart').account).toBeNull();
  });
});

describe('04 products', () => {
  let accountId: string;

  it('shows connected catalogs, counts them on request and starts an import', async () => {
    expect((await c.get('/api/v1/onboarding/products', admin)).body.data.items).toEqual([]);
    const acc = await c.connectAccount(admin, 'mock');
    accountId = acc.id;
    const before = await c.get('/api/v1/onboarding/products', admin);
    expect(before.body.data.items).toHaveLength(1);
    expect(before.body.data.items[0]).toMatchObject({ accountId, productsAvailable: null, importStatus: 'not_imported', canImport: true, connection: 'connected' });

    const counted = await c.post('/api/v1/onboarding/products/refresh-counts', {}, admin);
    expect(counted.status).toBe(200);
    expect(counted.body.data.failed).toEqual([]);
    expect(counted.body.data.counted[0]).toMatchObject({ accountId, capped: false });
    const after = await c.get('/api/v1/onboarding/products', admin);
    expect(after.body.data.items[0].productsAvailable).toBe(counted.body.data.counted[0].count);
    expect(after.body.data.summary).toMatchObject({ connected: 1, allCounted: true });

    const imp = await c.post('/api/v1/onboarding/products/import', { accountId }, admin);
    expect(imp.status).toBe(202);
    expect(imp.body.data.job.type).toBe('catalog_import');
    expect((await c.post('/api/v1/onboarding/products/refresh-counts', { accountId: '00000000-0000-4000-8000-000000000000' }, admin)).status).toBe(404);
    expect((await c.post('/api/v1/onboarding/products/import', { accountId }, other)).status).toBe(404);
    expect((await c.post('/api/v1/onboarding/products/continue', {}, admin)).body.data.steps.find((s: any) => s.key === 'products').status).toBe('completed');
  });
});

describe('05 inventory', () => {
  it('simple mode creates the single default location, and is idempotent', async () => {
    const a = await c.put('/api/v1/onboarding/inventory', { mode: 'simple', startingMethod: 'manual', locationName: 'Home Inventory' }, admin);
    expect(a.status).toBe(200);
    expect(a.body.data).toMatchObject({ created: true });
    expect(a.body.data.setup).toMatchObject({ mode: 'simple', startingMethod: 'manual', warehouseCount: 1, location: { name: 'Home Inventory', code: 'HOME' } });
    const b = await c.put('/api/v1/onboarding/inventory', { mode: 'simple', startingMethod: 'manual', locationName: 'Garage' }, admin);
    expect(b.body.data).toMatchObject({ created: false, warehouseId: a.body.data.warehouseId });
    expect(b.body.data.setup.location.name).toBe('Garage');
    expect((await c.get('/api/v1/warehouses', admin)).body.data.length).toBe(1);
  });

  it('warehouse mode stores city / state and the address on the same default warehouse', async () => {
    const r = await c.put('/api/v1/onboarding/inventory', { mode: 'warehouse', startingMethod: 'file', warehouse: { name: 'Main Warehouse', location: 'Mumbai, Maharashtra', address: 'Plot 4, MIDC' } }, admin);
    expect(r.status).toBe(200);
    expect(r.body.data.setup).toMatchObject({ mode: 'warehouse', startingMethod: 'file', location: { name: 'Main Warehouse', city: 'Mumbai', state: 'Maharashtra', address: 'Plot 4, MIDC' } });
    expect((await c.get('/api/v1/vendor/settings', admin)).body.data.inventory).toEqual({ mode: 'warehouse', startingMethod: 'file' });
    expect((await c.put('/api/v1/onboarding/inventory', { mode: 'warehouse', startingMethod: 'manual', warehouse: {} }, admin)).status).toBe(400);
  });

  it('refuses simple mode while several warehouses are active', async () => {
    await c.makeWarehouse(admin, { code: 'EXTRA' });
    const r = await c.put('/api/v1/onboarding/inventory', { mode: 'simple', startingMethod: 'manual', locationName: 'Home' }, admin);
    expect(r.status).toBe(409);
    expect(r.body.error.details.rule).toBe('multiple_warehouses');
  });

  it('computes the overview from real stock and imports a stock file row by row', async () => {
    const a = await c.makeVariant(admin, { sku: 'TEE-A' });
    const b = await c.makeVariant(admin, { sku: 'TEE-B' });
    await c.makeVariant(admin, { sku: 'TEE-C' });
    const csv = 'sku,quantity\nTEE-A,50\nTEE-B,3\nNOPE,4\nTEE-C,x\n';
    const imp = await c.call('POST', '/api/v1/inventory/imports?mode=set', { as: admin, raw: csv, contentType: 'text/csv' });
    expect(imp.status).toBe(200);
    expect(imp.body.data).toMatchObject({ rows: 4, applied: 2, failed: 2 });
    expect(imp.body.data.errors.map((e: any) => e.row).sort()).toEqual([4, 5]);
    expect(await c.available(admin, a.variantId)).toBe(50);
    expect(await c.available(admin, b.variantId)).toBe(3);
    // re-uploading the same file changes nothing twice
    const again = await c.call('POST', '/api/v1/inventory/imports?mode=set', { as: admin, raw: csv, contentType: 'text/csv', headers: { 'idempotency-key': 'stock-file-2-xxxxxxxx' } });
    expect(again.body.data).toMatchObject({ applied: 0, unchanged: 2 });
    expect((await c.call('POST', '/api/v1/inventory/imports', { as: admin, raw: 'a,b\n1,2\n', contentType: 'text/csv' })).status).toBe(400);

    const o = (await c.get('/api/v1/onboarding/inventory/overview', admin)).body.data;
    expect(o).toMatchObject({ products: 3, units: 53, lowStock: 1, outOfStock: 1 });
  });
});

describe('06 fulfillment and 07 ready', () => {
  it('defaults to marketplace shipping, saves overrides and warns when a method is not available', async () => {
    const d = await c.get('/api/v1/onboarding/fulfillment', admin);
    expect(d.body.data).toMatchObject({ configured: false, defaultMethod: 'marketplace', defaultPreference: 'recommended' });
    expect(d.body.data.methods.find((m: any) => m.value === 'third_party')).toMatchObject({ available: false, unavailableReason: 'connection_required' });

    const r = await c.put('/api/v1/onboarding/fulfillment', { defaultMethod: 'third_party', defaultPreference: 'lowest_cost', overrides: { mock: 'seller' } }, admin);
    expect(r.status).toBe(200);
    expect(r.body.data.fulfillment.warnings.map((w: any) => w.code)).toEqual(['third_party_unavailable']);
    expect(r.body.data.fulfillment.preview.find((p: any) => p.marketplace === 'mock')).toMatchObject({ method: 'seller', isOverride: true });
    expect(r.body.data.fulfillment.preview.at(-1)).toMatchObject({ label: 'Other orders', method: 'third_party' });
    expect((await c.put('/api/v1/onboarding/fulfillment', { defaultMethod: 'seller', overrides: { bogus: 'seller' } }, admin)).status).toBe(400);

    const ok = await c.put('/api/v1/onboarding/fulfillment', { defaultMethod: 'seller' }, admin);
    expect(ok.body.data.fulfillment).toMatchObject({ configured: true, defaultMethod: 'seller', warnings: [] });
  });

  it('reports readiness from what exists and lets the seller go to the dashboard', async () => {
    const r = await c.get('/api/v1/onboarding/readiness', admin);
    const by = Object.fromEntries(r.body.data.items.map((i: any) => [i.key, i.status]));
    expect(by).toEqual({ business: 'complete', channels: 'connected', products: 'ready', inventory: 'configured', fulfillment: 'configured' });
    expect(r.body.data).toMatchObject({ percentComplete: 100, canGoToDashboard: true, completed: false });

    const done = await c.post('/api/v1/onboarding/complete', {}, admin);
    expect(done.status).toBe(200);
    expect(done.body.data.alreadyCompleted).toBe(false);
    expect((await c.post('/api/v1/onboarding/complete', {}, admin)).body.data.alreadyCompleted).toBe(true);
    const state = (await c.get('/api/v1/onboarding', admin)).body.data;
    expect(state).toMatchObject({ status: 'completed', resumeStep: 'ready' });
  });

  it('will not finish before the business profile exists, and skipping shows as skipped', async () => {
    const fresh = await c.registerVendor({ businessName: 'Fresh Co' });
    const no = await c.post('/api/v1/onboarding/complete', {}, fresh);
    expect(no.status).toBe(409);
    expect(no.body.error.details.rule).toBe('onboarding_incomplete');
    await c.put('/api/v1/onboarding/business', { businessName: 'Fresh Co', businessType: 'retail', teamSize: 'just_me', operatingLocation: 'Pune' }, fresh);
    const sk = await c.post('/api/v1/onboarding/steps/channels/skip', {}, fresh);
    expect(step(sk.body.data, 'channels').status).toBe('skipped');
    const rd = (await c.get('/api/v1/onboarding/readiness', fresh)).body.data;
    expect(rd.items.find((i: any) => i.key === 'channels').status).toBe('skipped');
    expect(rd.percentComplete).toBe(20);
    expect((await c.post('/api/v1/onboarding/complete', {}, fresh)).status).toBe(200);
  });
});
