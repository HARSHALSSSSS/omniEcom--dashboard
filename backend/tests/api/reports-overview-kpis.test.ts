import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type TestApp } from '@oms/testing';
import { buildWorld, orderArrives } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

const OV = '/api/v1/reports/overview-kpis';
const DAY = 86_400_000;
const day = (d: Date) => d.toISOString().slice(0, 10);
const today = () => day(new Date());

describe('GET /reports/overview-kpis', () => {
  it('one read gives totals, the comparison range, refunds, margin, the trend and the channels, all agreeing with the report endpoints', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [20] });
    await orderArrives(t, c, w, 2);
    await orderArrives(t, c, w, 1);

    const res = await c.get(`${OV}?from=${day(new Date(Date.now() - 6 * DAY))}&to=${today()}`, w.admin);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ compare: 'previous', period: 'day', previous: { orders: 0, grossMinor: 0 }, previousRefunds: { amountMinor: 0 } });
    expect(d.range).toEqual({ from: day(new Date(Date.now() - 6 * DAY)), to: today() });
    expect(d.previousRange).toEqual({ from: day(new Date(Date.now() - 13 * DAY)), to: day(new Date(Date.now() - 7 * DAY)) });
    expect(d.totals.orders).toBe(2);

    // the same numbers as the sales report for the same window (no second source of truth)
    const sales = (await c.get(`/api/v1/reports/sales?from=${d.range.from}T00:00:00Z&to=${day(new Date(Date.now() + DAY))}T00:00:00Z&period=day`, w.admin)).body.data;
    expect(d.totals).toMatchObject({ orders: sales.totals.orders, units: sales.totals.units, grossMinor: sales.totals.grossMinor, averageOrderValueMinor: sales.totals.averageOrderValueMinor });
    expect(d.totals.netSalesMinor).toBe(sales.totals.subtotalMinor - sales.totals.discountMinor);
    expect(d.series.reduce((s: number, p: any) => s + p.orders, 0)).toBe(2);
    expect(d.previousSeries).toEqual([]);

    // one channel row holding everything, with its share and average order value
    expect(d.channels).toHaveLength(1);
    expect(d.channels[0]).toMatchObject({ orders: 2, grossMinor: d.totals.grossMinor, shareBps: 10_000, previousGrossMinor: 0, changeBps: null });
    expect(d.channels[0].averageOrderValueMinor).toBe(Math.round(d.totals.grossMinor / 2));
    expect(d.channels[0]).toHaveProperty('marginBps'); // null while the product cost is unknown, never zero
    expect(d).toMatchObject({ connectedAccounts: 1, totalAccounts: 1 });

    // refunds and margin are present, margin is null (not zero) while it cannot be known
    expect(d.refunds).toMatchObject({ amountMinor: 0, returns: 0 });
    expect(d.margin).toMatchObject({ coverage: expect.any(Number), completeness: expect.any(String), missing: expect.any(Array) });
    expect(d.margin.marginBps === null || Number.isInteger(d.margin.marginBps)).toBe(true);
  });

  it('compare none skips the comparison; previous_year shifts the same dates; the period follows the length of the range', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [10] });
    const none = (await c.get(`${OV}?compare=none`, w.admin)).body.data;
    expect(none).toMatchObject({ compare: 'none', previousRange: null, previous: null, previousRefunds: null, previousMargin: null, previousSeries: null, period: 'day' });
    expect(none.range.to).toBe(today());
    expect(none.totals).toMatchObject({ orders: 0, grossMinor: 0, netSalesMinor: 0 });
    expect(none.channels).toEqual([]);

    const yoy = (await c.get(`${OV}?from=2026-03-01&to=2026-03-31&compare=previous_year`, w.admin)).body.data;
    expect(yoy.previousRange).toEqual({ from: '2025-03-01', to: '2025-03-31' });
    expect(yoy.period).toBe('day');
    expect((await c.get(`${OV}?from=2026-01-01&to=2026-03-31`, w.admin)).body.data.period).toBe('week');
    expect((await c.get(`${OV}?from=2025-10-01&to=2026-03-31`, w.admin)).body.data.period).toBe('month');
    expect((await c.get(`${OV}?from=2025-10-01&to=2026-03-31&period=week`, w.admin)).body.data.period).toBe('week');
  });

  it('refuses bad ranges, is tenant isolated, readable by viewers and needs a token', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [10] });
    await orderArrives(t, c, w, 1);
    expect((await c.get(`${OV}?from=2026-02-01&to=2026-01-01`, w.admin)).status).toBe(400);
    expect((await c.get(`${OV}?from=2024-01-01&to=2026-01-01`, w.admin)).status).toBe(400);
    expect((await c.get(`${OV}?from=nope`, w.admin)).status).toBe(400);
    expect((await c.get(`${OV}?compare=sometimes`, w.admin)).status).toBe(400);

    const rival = await c.registerVendor({ businessName: 'Overview rival' });
    const theirs = (await c.get(OV, rival)).body.data;
    expect(theirs.totals).toMatchObject({ orders: 0, grossMinor: 0 });
    expect(theirs.channels).toEqual([]);
    expect(theirs).toMatchObject({ connectedAccounts: 0, totalAccounts: 0 });

    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.get(OV, viewer)).status).toBe(200);
    expect((await c.get(OV)).status).toBe(401);
  });
});
