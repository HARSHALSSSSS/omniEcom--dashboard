import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';
import { addGstin, gstin, insertOrder, type OrderFixture, parseCsv, sys, xlsxSheet } from '../helpers/reports';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
beforeAll(async () => {
  mockControl.reset();
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

const MH = gstin('27AABCU9603R1Z');
const KA = gstin('29AABCU9603R1Z');
const BUYER_DL = gstin('07AAACB2894G1Z');

const exportReport = (as: Actor, body: Record<string, unknown>) => c.post('/api/v1/reports/exports', body, as);
const fileOf = async (as: Actor, run: { downloadUrl: string }) => {
  const r = await c.get(run.downloadUrl, as);
  expect(r.status).toBe(200);
  return r.raw.rawPayload;
};

/** the October 2026 world: two registrations (MH primary, KA), two warehouses, orders that exercise every rule */
async function world() {
  const admin = await c.registerVendor({ businessName: `GST Shop ${Math.random().toString(36).slice(2, 7)}` });
  const vendorId = admin.vendorId!;
  await addGstin(t, vendorId, MH, { primary: true });
  await addGstin(t, vendorId, KA);
  const wh = async (code: string, state: string) => (await c.post('/api/v1/warehouses', { code, name: `WH ${code}`, address: { state, city: 'X' } }, admin)).body.data.id as string;
  const whMh = await wh('WH-MH', 'Maharashtra');
  const whKa = await wh('WH-KA', 'Karnataka');
  const acct = await c.connectAccount(admin, 'mock', { displayName: 'Mock Store' });
  const v = await c.makeVariant(admin, { sku: 'TEE-1' });
  const item = (qty: number, unitMinor: number, taxMinor: number) => ({ variantId: v.variantId, sku: v.sku, qty, unitMinor, taxMinor });
  const o = (number: string, rest: Omit<OrderFixture, 'number'>) => insertOrder(t, vendorId, acct.id, { ...rest, number });
  const ids = {
    o1: await o('GST-1', { placedAt: '2026-10-05T06:00:00Z', warehouseId: whMh, address: { state: 'Maharashtra' }, items: [item(2, 50000, 12000)] }),
    o2: await o('GST-2', { placedAt: '2026-10-06T06:00:00Z', warehouseId: whMh, address: { state: 'Delhi' }, buyer: { name: 'Buyer Co', gstin: BUYER_DL }, items: [item(1, 100000, 18000)] }),
    o3: await o('GST-3', { placedAt: '2026-10-07T06:00:00Z', warehouseId: whKa, address: { state: 'KA' }, shippingMinor: 4000, items: [item(3, 20000, 3001)] }),
    cancelled: await o('GST-X', { placedAt: '2026-10-08T06:00:00Z', status: 'cancelled', warehouseId: whMh, address: { state: 'Maharashtra' }, items: [item(1, 99900, 11988)] }),
    before: await o('GST-SEP', { placedAt: '2026-09-30T17:29:00Z', warehouseId: whMh, address: { state: 'Maharashtra' }, items: [item(1, 70000, 8400)] }), // 22:59 IST on 30 Sept
    after: await o('GST-NOV', { placedAt: '2026-10-31T18:30:00Z', warehouseId: whMh, address: { state: 'Maharashtra' }, items: [item(1, 80000, 9600)] }), // 00:00 IST on 1 Nov
    last: await o('GST-6', { placedAt: '2026-10-31T18:29:00Z', items: [item(1, 10000, 1200)] }), // 23:59 IST on 31 Oct, no warehouse, no state
  };
  // a processed refund for one unit of GST-1 (value 500.00 + 60.00 tax) in October
  await sys(t, async (q) => {
    const [ret] = await q(`insert into return_orders (vendor_id, number, order_id, source, status, reason_code, refund_status, refund_amount_minor, refunded_at) values ($1, 'RET-GST-1', $2, 'customer', 'completed', 'damaged', 'processed', 56000, '2026-10-20T06:00:00Z') returning id`, [vendorId, ids.o1]);
    const [oi] = await q(`select id from order_items where order_id = $1`, [ids.o1]);
    await q(`insert into return_items (vendor_id, return_order_id, order_item_id, variant_id, quantity) values ($1, $2, $3, $4, 1)`, [vendorId, ret.id, oi.id, v.variantId]);
    // a refund that is still pending and one processed in November must not appear
    await q(`insert into return_orders (vendor_id, number, order_id, source, status, reason_code, refund_status, refund_amount_minor, refunded_at) values ($1, 'RET-GST-2', $2, 'customer', 'completed', 'damaged', 'pending', 11200, null), ($1, 'RET-GST-3', $2, 'customer', 'completed', 'damaged', 'processed', 11200, '2026-11-02T06:00:00Z')`, [vendorId, ids.o2]);
  });
  return { admin, vendorId, ids };
}

describe('GST register', () => {
  let w: Awaited<ReturnType<typeof world>>;
  beforeAll(async () => { w = await world(); });

  it('lists the invoices of the month with place of supply, B2B/B2C, HSN and the tax split (csv)', async () => {
    const res = await exportReport(w.admin, { type: 'gst_register', format: 'csv', params: { month: '2026-10' } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const run = res.body.data;
    expect(run).toMatchObject({ status: 'succeeded', format: 'csv', reportType: 'gst_register', trigger: 'manual', rowCount: 5, period: { fromDay: '2026-10-01', toDay: '2026-10-31', label: 'October 2026' }, warnings: 1 });
    expect(run.fileName).toBe('gst_register_2026-10-01_to_2026-10-31.csv');

    const rows = parseCsv(await fileOf(w.admin, run));
    expect(rows[0]).toEqual(['Invoice no', 'Invoice date', 'Marketplace', 'Account', 'Type', 'Buyer GSTIN', 'Supplier GSTIN', 'Place of supply', 'Supply type', 'HSN', 'Rate %', 'Qty', 'Taxable value', 'IGST', 'CGST', 'SGST/UTGST', 'Total tax', 'Line total', 'Notes']);
    expect(rows.slice(1, 6)).toEqual([
      ['GST-1', '2026-10-05', 'mock', 'Mock Store', 'B2C', '', MH, '27-Maharashtra', 'Intra-State', '6109', '12.00', '2', '1000.00', '0.00', '60.00', '60.00', '120.00', '1120.00', ''],
      ['GST-2', '2026-10-06', 'mock', 'Mock Store', 'B2B', BUYER_DL, MH, '07-Delhi', 'Inter-State', '6109', '18.00', '1', '1000.00', '180.00', '0.00', '0.00', '180.00', '1180.00', ''], // the recorded 18% wins over the catalog 12%
      ['GST-3', '2026-10-07', 'mock', 'Mock Store', 'B2C', '', KA, '29-Karnataka', 'Intra-State', '6109', '5.00', '3', '600.00', '0.00', '15.00', '15.01', '30.01', '630.01', ''], // dispatched from the Karnataka registration; odd paisa to SGST
      ['GST-3', '2026-10-07', 'mock', 'Mock Store', 'B2C', '', KA, '29-Karnataka', 'Intra-State', '', '0.00', '', '40.00', '0.00', '0.00', '0.00', '0.00', '40.00', 'Shipping and other charges'],
      ['GST-6', '2026-10-31', 'mock', 'Mock Store', 'B2C', '', MH, '27-Maharashtra', 'Intra-State', '6109', '12.00', '1', '100.00', '0.00', '6.00', '6.00', '12.00', '112.00', ''], // 23:59 IST on the last day is inside; unknown state falls back to the primary GSTIN
    ]);
    expect(rows[6]).toEqual(['Total', '', '', '', '', '', '', '', '', '', '', '7', '2740.00', '180.00', '81.00', '81.01', '342.01', '3082.01', '']);
    expect(rows).toHaveLength(7); // header + 5 + total: the cancelled order and the two orders outside the month are not there
  });

  it('builds the workbook: summary, invoices, credit notes, HSN summary and warnings', async () => {
    const res = await exportReport(w.admin, { type: 'gst_register', format: 'xlsx', params: { month: '2026-10' } });
    expect(res.status).toBe(201);
    expect(res.body.data.fileName).toMatch(/\.xlsx$/);
    const file = await fileOf(w.admin, res.body.data);
    expect(file.subarray(0, 2).toString()).toBe('PK');

    const summary = xlsxSheet(file, 1);
    const line = (label: string) => summary.find((r) => r[0] === label)!;
    expect(line('Business')[1]).toMatch(/^GST Shop/);
    expect(line('Period')[1]).toBe('October 2026');
    expect(line('Supplier GSTIN(s)')[1]).toBe(`${MH}, ${KA}`);
    // label, details, documents, taxable, igst, cgst, sgst, total tax
    expect(line('B2B supplies (buyer GSTIN known)').slice(2)).toEqual(['1', '1000.00', '180.00', '0.00', '0.00', '180.00']);
    expect(line('B2C supplies').slice(2)).toEqual(['3', '1740.00', '0.00', '81.00', '81.01', '162.01']);
    expect(line('Total outward supplies').slice(2)).toEqual(['4', '2740.00', '180.00', '81.00', '81.01', '342.01']);
    expect(line('Credit notes').slice(2)).toEqual(['1', '-500.00', '0.00', '-30.00', '-30.00', '-60.00']);
    expect(line('Net supplies less credit notes').slice(3)).toEqual(['2240.00', '180.00', '51.00', '51.01', '282.01']);

    const credit = xlsxSheet(file, 3);
    expect(credit[1]).toEqual(['RET-GST-1', '46315', 'GST-1', '46300', 'B2C', '', '27-Maharashtra', 'Intra-State', '6109', '0.1200', '500.00', '0.00', '30.00', '30.00', '60.00', '560.00']);
    expect(credit.filter((r) => r[0]?.startsWith('RET-'))).toHaveLength(1); // the pending and the November refund are not there

    const hsn = xlsxSheet(file, 4);
    expect(hsn.slice(1, 4)).toEqual([
      ['6109', 'PCS', '3', '0.0500', '600.00', '0.00', '15.00', '15.01', '630.01'],
      ['6109', 'PCS', '3', '0.1200', '1100.00', '0.00', '66.00', '66.00', '1232.00'],
      ['6109', 'PCS', '1', '0.1800', '1000.00', '180.00', '0.00', '0.00', '1180.00'],
    ]);

    const warnings = xlsxSheet(file, 5);
    expect(warnings[1]!.slice(0, 2)).toEqual(['GST-6', 'place_of_supply_unknown']);
  });

  it('renders a pdf with every sheet', async () => {
    const res = await exportReport(w.admin, { type: 'gst_register', format: 'pdf', params: { month: '2026-10' } });
    expect(res.status).toBe(201);
    const pdf = await fileOf(w.admin, res.body.data);
    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(pdf.toString('latin1')).toMatch(/\/Count [1-9]/);
  });

  it('an invalid buyer GSTIN is treated as B2C and reported; a registration in another state is used for that state\'s warehouse only', async () => {
    const x = await world();
    await insertOrder(t, x.vendorId, (await sys(t, (q) => q(`select id from marketplace_accounts where vendor_id = $1`, [x.vendorId])))[0].id, {
      number: 'GST-BAD', placedAt: '2026-10-09T06:00:00Z', address: { state: 'Delhi' }, buyer: { gstin: '07AAACB2894G1Z9' },
      items: [{ variantId: (await sys(t, (q) => q(`select id from product_variants where vendor_id = $1`, [x.vendorId])))[0].id, sku: 'TEE-1', qty: 1, unitMinor: 10000, taxMinor: 1800 }],
    });
    const res = await exportReport(x.admin, { type: 'gst_register', format: 'xlsx', params: { month: '2026-10' } });
    const warnings = xlsxSheet(await fileOf(x.admin, res.body.data), 5);
    expect(warnings.some((r) => r[0] === 'GST-BAD' && r[1] === 'invalid_buyer_gstin')).toBe(true);
  });

  it('periods: a custom date range and a relative range; a period over 366 days or a conflicting one is refused', async () => {
    const one = await exportReport(w.admin, { type: 'gst_register', format: 'csv', params: { from: '2026-10-05', to: '2026-10-06' } });
    expect(one.status).toBe(201);
    expect(one.body.data.rowCount).toBe(2);
    expect(one.body.data.fileName).toBe('gst_register_2026-10-05_to_2026-10-06.csv');
    const rel = await exportReport(w.admin, { type: 'gst_register', format: 'csv', params: { range: 'previous_month' } });
    expect(rel.status).toBe(201);
    expect((await exportReport(w.admin, { type: 'gst_register', format: 'csv', params: { from: '2025-01-01', to: '2026-10-06' } })).body.error.details.rule).toBe('period_too_long');
    expect((await exportReport(w.admin, { type: 'gst_register', format: 'csv', params: { month: '2026-10', from: '2026-10-01', to: '2026-10-02' } })).body.error.details.rule).toBe('conflicting_period');
    expect((await exportReport(w.admin, { type: 'gst_register', format: 'csv', params: { from: '2026-10-05' } })).body.error.details.rule).toBe('incomplete_period');
    expect((await exportReport(w.admin, { type: 'gst_register', format: 'csv', params: { month: '2026-13' } })).status).toBe(400);
    expect((await exportReport(w.admin, { type: 'gst_register', format: 'csv', params: { colour: 'red' } })).status).toBe(400);
  });

  it('needs an active GSTIN, says so, and keeps the failed run in the history', async () => {
    const admin = await c.registerVendor({ businessName: 'No GST Ltd' });
    const res = await exportReport(admin, { type: 'gst_register', format: 'csv', params: { month: '2026-10' } });
    expect(res.status).toBe(409);
    expect(res.body.error.details.rule).toBe('gst_registration_required');
    const runs = (await c.get('/api/v1/reports/runs', admin)).body.data.items;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'failed', downloadable: false });
    expect(runs[0].error).toMatch(/GSTIN/);
    // only a cancelled registration: still no
    await addGstin(t, admin.vendorId!, MH, { primary: true, status: 'cancelled' });
    expect((await exportReport(admin, { type: 'gst_register', format: 'csv', params: { month: '2026-10' } })).body.error.details.rule).toBe('gst_registration_required');
  });

  it('is tenant isolated: another business gets none of these invoices and cannot read the run', async () => {
    const other = await c.registerVendor({ businessName: 'Other Shop' });
    await addGstin(t, other.vendorId!, KA, { primary: true });
    const res = await exportReport(other, { type: 'gst_register', format: 'csv', params: { month: '2026-10' } });
    expect(res.status).toBe(201);
    expect(res.body.data.rowCount).toBe(0);
    const mine = (await exportReport(w.admin, { type: 'gst_register', format: 'csv', params: { month: '2026-10' } })).body.data;
    expect((await c.get(`/api/v1/reports/runs/${mine.id}`, other)).status).toBe(404);
    expect((await c.get(mine.downloadUrl, other)).status).toBe(404);
  });
});
