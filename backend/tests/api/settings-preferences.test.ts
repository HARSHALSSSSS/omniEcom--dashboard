import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type TestApp } from '@oms/testing';
import { buildWorld, type World } from '../helpers/stage4';
import { applyEnding } from '../../modules/pricing/src/proposal-domain';
import { afterWorkspaceBuffer } from '../../modules/listings/src/stock-defaults';
import { resolveSettings } from '../../modules/vendors/src';

/**
 * SETTINGS > General / Products and Listings / Pricing and Margins: the stored groups with their server defaults, the optimistic
 * version, and the modules that obey them (margin target fallback, price ending, stock cushions, the simulator).
 */
let t: TestApp;
let c: ReturnType<typeof clientFor>;
let w: World;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  w = await buildWorld(t, c, { warehouses: 1, stock: [100], sku: 'SET-1' });
  expect((await c.patch(`/api/v1/variants/${w.variant.variantId}`, { costPriceMinor: 30_000, mrpMinor: 80_000, sellingPriceMinor: 70_000 }, w.admin)).status).toBe(200);
});
afterAll(() => t.close());

const read = async () => (await c.get('/api/v1/settings', w.admin)).body.data;

describe('pure rules', () => {
  it('price endings stay inside the guardrails', () => {
    expect(applyEnding(123_456, 'nine', 1, 10_000_000)).toBe(123_900); // 1,234.56: the nearer ...9 is 1,239
    expect(applyEnding(149_950, 'nine', 1, 10_000_000)).toBe(149_900);
    expect(applyEnding(150_300, 'zero', 1, 10_000_000)).toBe(150_000);
    expect(applyEnding(150_300, 'exact', 1, 10_000_000)).toBe(150_300);
    // the neighbour would break the lower bound: the computed price stays
    expect(applyEnding(100_100, 'nine', 100_050, 100_200)).toBe(100_100);
  });

  it('stock cushions: a percent of the stock, then a floor of units, never below zero', () => {
    expect(afterWorkspaceBuffer(100, { bufferPercent: 10, minSafetyUnits: 5 })).toBe(85);
    expect(afterWorkspaceBuffer(100, { bufferPercent: 0, minSafetyUnits: 0 })).toBe(100);
    expect(afterWorkspaceBuffer(3, { bufferPercent: 0, minSafetyUnits: 5 })).toBe(0);
  });

  it('every group resolves to defaults, and round-to-9 maps to the price ending', () => {
    const d = resolveSettings({});
    expect(d.preferences).toMatchObject({ pageSize: 25, reportingPeriod: '30d', defaultRoute: '/' });
    expect(d.pricing.marginFloorBps).toBeNull();
    expect(d.pricing.priceEnding).toBe('exact');
    expect(resolveSettings({ operations: { roundPriceToNine: true } }).pricing.priceEnding).toBe('nine');
    expect(resolveSettings({ pricing: { priceEnding: 'zero' } }).pricing.priceEnding).toBe('zero');
  });
});

describe('GET / PATCH /settings groups', () => {
  it('returns server defaults and the real channels, no demo rows', async () => {
    const s = await read();
    expect(s.preferences.pageSize).toBe(25);
    expect(s.pricing.marginFloorBps).toBeNull();
    expect(s.pricing.channelTiers).toEqual({});
    expect(s.channels.map((x: any) => x.id)).toContain(w.account.id);
  });

  it('saves a group, keeps the other groups, bumps the version and rejects a stale one', async () => {
    const before = await read();
    const res = await c.patch('/api/v1/settings', { preferences: { pageSize: 50, reportingPeriod: '7d', guardrails: { bulkConfirm: false } }, version: before.version }, w.admin);
    expect(res.status).toBe(200);
    expect(res.body.data.preferences).toMatchObject({ pageSize: 50, reportingPeriod: '7d', defaultRoute: '/', guardrails: { bulkConfirm: false, stockAllocationConfirm: true } });
    expect(res.body.data.version).toBe(before.version + 1);
    const stale = await c.patch('/api/v1/settings', { preferences: { pageSize: 10 }, version: before.version }, w.admin);
    expect(stale.status).toBe(409);
    expect((await read()).preferences.pageSize).toBe(50);
  });

  it('validates the values and the channel keys', async () => {
    expect((await c.patch('/api/v1/settings', { preferences: { pageSize: 33 } }, w.admin)).status).toBe(400);
    expect((await c.patch('/api/v1/settings', { preferences: { defaultRoute: '/nowhere' } }, w.admin)).status).toBe(400);
    expect((await c.patch('/api/v1/settings', { pricing: { marginFloorBps: 20_000 } }, w.admin)).status).toBe(400);
    const unknown = await c.patch('/api/v1/settings', { pricing: { channelTiers: { '11111111-1111-4111-8111-111111111111': { baseMarkupBps: 100 } } } }, w.admin);
    expect(unknown.status).toBe(400);
    expect(JSON.stringify(unknown.body)).toContain('pricing.channelTiers');
  });

  it('a viewer reads but cannot save', async () => {
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.get('/api/v1/settings', viewer)).status).toBe(200);
    expect((await c.patch('/api/v1/settings', { preferences: { pageSize: 10 } }, viewer)).status).toBe(403);
  });

  it('stores channel tiers keyed by the real account, and the price ending also sets the round-to-9 switch', async () => {
    const res = await c.patch('/api/v1/settings', { pricing: { priceEnding: 'nine', channelTiers: { [w.account.id]: { baseMarkupBps: 850, minNetMarginBps: 2200, hardFloorMinor: 99_900 } } } }, w.admin);
    expect(res.status).toBe(200);
    expect(res.body.data.pricing.channelTiers[w.account.id]).toMatchObject({ baseMarkupBps: 850, minNetMarginBps: 2200, hardFloorMinor: 99_900, maxDiscountBps: 2000, status: 'active' });
    expect(res.body.data.operations.roundPriceToNine).toBe(true);
    expect((await c.patch('/api/v1/settings', { pricing: { priceEnding: 'exact' } }, w.admin)).body.data.operations.roundPriceToNine).toBe(false);
  });
});

describe('modules that obey the settings', () => {
  it('the workspace margin floor is the margin target when no policy sets one, and a policy wins', async () => {
    const range = `from=${new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`;
    const target = async () => (await c.get(`/api/v1/analytics/profitability?groupBy=product&${range}`, w.admin)).body.data.marginTargetBps;
    expect(await target()).toBeNull();
    expect((await c.patch('/api/v1/settings', { pricing: { marginFloorBps: 2500 } }, w.admin)).status).toBe(200);
    expect(await target()).toBe(2500);
    const pol = await c.post('/api/v1/pricing/policies', { name: 'Strict', strategy: 'margin_floor', targetMarginMinBps: 3500 }, w.admin);
    expect(pol.status).toBe(201);
    expect(await target()).toBe(3500);
    expect((await c.call('DELETE', `/api/v1/pricing/policies/${pol.body.data.id}`, { as: w.admin })).status).toBe(200);
    expect(await target()).toBe(2500);
  });

  it('the simulator uses the real variant, the channel fee profile and the saved rules', async () => {
    expect((await c.put(`/api/v1/analytics/fee-profiles/${w.account.id}`, { feePercentBps: 1000, fixedFeeMinor: 1_000 }, w.admin)).status).toBe(200);
    expect((await c.patch('/api/v1/settings', { pricing: { withholdBufferBps: 110 } }, w.admin)).status).toBe(200);
    const res = await c.post('/api/v1/pricing/simulate', { variantId: w.variant.variantId, accountId: w.account.id }, w.admin);
    expect(res.status).toBe(200);
    const d = res.body.data;
    // price 700.00, cost 300.00, fee 10% + 10.00 = 80.00, contribution 320.00 = 45.7% -> 4571 bps
    expect(d.priceMinor).toBe(70_000);
    expect(d.breakdown).toMatchObject({ feeMinor: 8_000, costMinor: 30_000, contributionMinor: 32_000, withholdMinor: 770 });
    expect(d.marginBps).toBe(4571);
    expect(d.rules).toMatchObject({ workspaceFloorBps: 2500, withholdBufferBps: 110 });
    expect(d.belowTarget).toBe(false);
    const low = await c.post('/api/v1/pricing/simulate', { variantId: w.variant.variantId, accountId: w.account.id, priceMinor: 42_000 }, w.admin);
    expect(low.body.data.belowTarget).toBe(true);
    expect(low.body.data.floorPriceMinor).toBeGreaterThan(42_000);
    expect((await c.post('/api/v1/pricing/simulate', { variantId: '11111111-1111-4111-8111-111111111111' }, w.admin)).status).toBe(404);
  });
});

describe('one setting, two views', () => {
  it('the older round-to-9 switch moves the price ending, and the shell carries the workspace defaults', async () => {
    expect((await c.patch('/api/v1/settings', { operations: { roundPriceToNine: true } }, w.admin)).body.data.pricing.priceEnding).toBe('nine');
    expect((await c.patch('/api/v1/settings', { operations: { roundPriceToNine: false } }, w.admin)).body.data.pricing.priceEnding).toBe('exact');
    expect((await c.patch('/api/v1/settings', { preferences: { pageSize: 100, defaultRoute: '/orders' } }, w.admin)).status).toBe(200);
    const shell = (await c.get('/api/v1/workspace/shell', w.admin)).body.data;
    expect(shell.business.preferences).toMatchObject({ pageSize: 100, defaultRoute: '/orders', reportingPeriod: '7d' });
  });
});
