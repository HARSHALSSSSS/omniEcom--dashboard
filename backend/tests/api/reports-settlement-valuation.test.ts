import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';
import { insertOrder, parseCsv, sys, xlsxSheet } from '../helpers/reports';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
beforeAll(async () => {
  mockControl.reset();
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

const exportReport = (as: Actor, body: Record<string, unknown>) => c.post('/api/v1/reports/exports', body, as);
const fileOf = async (as: Actor, run: { downloadUrl: string }) => (await c.get(run.downloadUrl, as)).raw.rawPayload;
const istDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

describe('settlement audit', () => {
  let admin: Actor;
  beforeAll(async () => {
    admin = await c.registerVendor({ businessName: 'Settle Shop' });
    const vendorId = admin.vendorId!;
    const acct = await c.connectAccount(admin, 'mock', { displayName: 'Settle Store' });
    const v = await c.makeVariant(admin, { sku: 'SET-TEE' });
    const mk = (number: string, unit: number, tax: number, extra: Record<string, unknown> = {}) =>
      insertOrder(t, vendorId, acct.id, { number, placedAt: '2026-09-05T06:00:00Z', deliveredAt: '2026-09-10T06:00:00Z', items: [{ variantId: v.variantId, sku: v.sku, qty: 1, unitMinor: unit, taxMinor: tax }], ...extra });
    const s1 = await mk('SET-1', 100000, 12000);
    const s2 = await mk('SET-2', 50000, 6000);
    await mk('SET-3', 20000, 2400);
    await mk('SET-OCT', 20000, 2400, { placedAt: '2026-10-05T06:00:00Z', deliveredAt: '2026-10-08T06:00:00Z' }); // delivered outside the period
    await sys(t, async (q) => {
      await q(`insert into fee_profiles (vendor_id, marketplace_account_id, fee_percent_bps, fixed_fee_minor) values ($1, $2, 1000, 0)`, [vendorId, acct.id]);
      await q(`insert into order_financials (vendor_id, order_id, marketplace_fee_minor) values ($1, $2, 10000), ($1, $3, 7000)`, [vendorId, s1, s2]);
    });
  });

  it('compares the fee of every delivered order with the commission terms and flags what is missing (csv)', async () => {
    const res = await exportReport(admin, { type: 'settlement_audit', format: 'csv', params: { month: '2026-09' } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ rowCount: 3, settlementDataAvailable: false, warnings: 2 }); // one fee variance + one order whose fee is not recorded
    const rows = parseCsv(await fileOf(admin, res.body.data));
    expect(rows[0]).toContain('Expected payout');
    expect(rows.slice(1, 4)).toEqual([
      ['SET-1', 'Settle Store', 'mock', '2026-09-10', 'unknown', '1120.00', '100.00', '100.00', '0.00', '', '', '0.00', '1020.00', '', '', 'Fee matches commission terms', 'No settlement record'],
      ['SET-2', 'Settle Store', 'mock', '2026-09-10', 'unknown', '560.00', '70.00', '50.00', '20.00', '', '', '0.00', '490.00', '', '', 'Fee differs from commission terms', 'No settlement record'],
      ['SET-3', 'Settle Store', 'mock', '2026-09-10', 'unknown', '224.00', '', '20.00', '', '', '', '0.00', '204.00', '', '', 'Fee not recorded: expected fee used', 'No settlement record'],
    ]);
    expect(rows).toHaveLength(4);
  });

  it('summarises per account in the workbook and says that no payout records exist', async () => {
    const res = await exportReport(admin, { type: 'settlement_audit', format: 'xlsx', params: { month: '2026-09' } });
    const sheet = xlsxSheet(await fileOf(admin, res.body.data), 1);
    expect(sheet[1]).toEqual(['Settle Store', 'mock', '3', '1904.00', '170.00', '170.00', '20.00', '0.00', '0.00', '0.00', '1714.00', '', '', '0', '1', '1']);
    expect(sheet[2]![0]).toBe('Total');
    expect(sheet.flat().some((x) => /no marketplace remittance or settlement records/.test(x))).toBe(true);
  });

  it('a wider tolerance turns the variance into a match; an unknown account filter yields nothing', async () => {
    const wide = await exportReport(admin, { type: 'settlement_audit', format: 'csv', params: { month: '2026-09', toleranceMinor: 5000 } });
    expect(parseCsv(await fileOf(admin, wide.body.data))[2]![15]).toBe('Fee matches commission terms');
    const none = await exportReport(admin, { type: 'settlement_audit', format: 'csv', params: { month: '2026-09', accountId: '00000000-0000-4000-8000-000000000000' } });
    expect(none.body.data.rowCount).toBe(0);
  });

  it('the standard reports export in every format with the numbers of the JSON reports', async () => {
    const sales = await exportReport(admin, { type: 'sales', format: 'xlsx', params: { month: '2026-09' } });
    expect(sales.status).toBe(201);
    const summary = xlsxSheet(await fileOf(admin, sales.body.data), 1);
    expect(summary.find((r) => r[0] === 'Orders (cancelled excluded)')![1]).toBe('3');
    expect(summary.find((r) => r[0] === 'Gross sales')![2]).toBe('1904.00');
    const json = (await c.get('/api/v1/reports/sales?from=2026-08-31T18:30:00Z&to=2026-09-30T18:30:00Z', admin)).body.data;
    expect(json.totals.grossMinor).toBe(190400);

    for (const type of ['sales', 'orders', 'inventory', 'products', 'returns']) {
      for (const format of ['csv', 'xlsx', 'pdf']) {
        const r = await exportReport(admin, { type, format, params: { month: '2026-09' } });
        expect(r.status, `${type} ${format}: ${JSON.stringify(r.body)}`).toBe(201);
        const f = await fileOf(admin, r.body.data);
        expect(f.length).toBeGreaterThan(10);
        if (format === 'pdf') expect(f.subarray(0, 5).toString()).toBe('%PDF-');
        if (format === 'xlsx') expect(f.subarray(0, 2).toString()).toBe('PK');
      }
    }
    const products = parseCsv(await fileOf(admin, (await exportReport(admin, { type: 'products', format: 'csv', params: { month: '2026-09' } })).body.data));
    expect(products[0]).toEqual(['SKU', 'Title', 'Units', 'Orders', 'Revenue', 'Returned units', 'Return rate']);
    expect(products[1]!.slice(0, 3)).toEqual(['SET-TEE', 'Item SET-TEE', '3']);
    expect(products[1]![4]).toBe('1700.00'); // 100000 + 50000 + 20000 of line revenue
  });
});

describe('inventory valuation', () => {
  let admin: Actor;
  let ids: { va: string; vb: string; v1: string; v2: string; v3: string };
  beforeAll(async () => {
    admin = await c.registerVendor({ businessName: 'Valuation Shop' });
    const vendorId = admin.vendorId!;
    const va = await c.makeWarehouse(admin, { code: 'VA' });
    const vb = await c.makeWarehouse(admin, { code: 'VB' });
    const v1 = await c.makeVariant(admin, { sku: 'VAL-1' });
    const v2 = await c.makeVariant(admin, { sku: 'VAL-2' });
    const v3 = await c.makeVariant(admin, { sku: 'VAL-3' });
    await c.stock(admin, v1.variantId, va.id, 10);
    await c.stock(admin, v2.variantId, va.id, 5);
    await c.stock(admin, v3.variantId, vb.id, 4);
    await sys(t, async (q) => {
      await q(`update product_variants set cost_price_minor = 10000 where id = $1`, [v1.variantId]);
      await q(`update product_variants set cost_price_minor = 9000 where id = $1`, [v3.variantId]); // overridden by the receipts below
      const [sup] = await q(`insert into suppliers (vendor_id, code, name) values ($1, 'SUP1', 'Supplier') returning id`, [vendorId]);
      for (const [n, cost] of [['PO-V-1', 15000], ['PO-V-2', 18000]] as const) {
        const [po] = await q(`insert into purchase_orders (vendor_id, po_number, supplier_id, warehouse_id, status) values ($1, $2, $3, $4, 'received') returning id`, [vendorId, n, sup.id, vb.id]);
        const [line] = await q(`insert into purchase_order_lines (vendor_id, purchase_order_id, variant_id, sku, title, quantity_ordered, quantity_received, unit_cost_minor, total_minor) values ($1, $2, $3, 'VAL-3', 'Tee', 4, 4, $4, $5) returning id`, [vendorId, po.id, v3.variantId, cost, cost * 4]);
        await q(`insert into purchase_order_receipts (vendor_id, purchase_order_id, warehouse_id, items) values ($1, $2, $3, $4)`, [vendorId, po.id, vb.id, JSON.stringify([{ lineId: line.id, variantId: v3.variantId, received: 4, damaged: 0 }])]);
      }
    });
    ids = { va: va.id, vb: vb.id, v1: v1.variantId, v2: v2.variantId, v3: v3.variantId };
  });

  it('values stock per warehouse and category: weighted average of receipts, else the variant cost; no cost is listed apart', async () => {
    const res = await exportReport(admin, { type: 'inventory_valuation', format: 'xlsx', params: {} });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ reportType: 'inventory_valuation', warnings: 1, period: { fromDay: istDay(0) } });
    const file = await fileOf(admin, res.body.data);
    const summary = xlsxSheet(file, 1);
    expect(summary.slice(1, 4)).toEqual([
      ['VA - Warehouse VA', 'Uncategorised', '1', '10', '1000.00'],
      ['VB - Warehouse VB', 'Uncategorised', '1', '4', '660.00'], // (4 x 150.00 + 4 x 180.00) / 8 = 165.00 each
      ['Total', '', '2', '14', '1660.00'],
    ]);
    const lines = xlsxSheet(file, 2);
    expect(lines[1]).toEqual(['VA - Warehouse VA', 'Uncategorised', 'VAL-1', 'Test Tee VAL-1', '10', '100.00', 'Variant cost price', '1000.00']);
    expect(lines[2]).toEqual(['VB - Warehouse VB', 'Uncategorised', 'VAL-3', 'Test Tee VAL-3', '4', '165.00', 'Weighted average of purchase receipts', '660.00']);
    const missing = xlsxSheet(file, 3);
    expect(missing[1]).toEqual(['VAL-2', 'Test Tee VAL-2', 'VA - Warehouse VA', 'Uncategorised', '5']);
  });

  it('csv carries the stock lines; the warehouse filter narrows it', async () => {
    const res = await exportReport(admin, { type: 'inventory_valuation', format: 'csv', params: { warehouseId: ids.va } });
    const rows = parseCsv(await fileOf(admin, res.body.data));
    expect(rows[0]).toEqual(['Warehouse', 'Category', 'SKU', 'Product', 'Units', 'Unit cost', 'Cost basis', 'Value']);
    expect(rows).toHaveLength(3); // header, VAL-1, total
    expect(rows[2]).toEqual(['Total', '', '', '', '10', '', '', '1000.00']);
  });

  it('rebuilds past dates from the stock ledger; the future and a foreign category are refused', async () => {
    // the ledger is append-only for the application role: age the movement as the database owner
    await t.database!.pg.exec('RESET ROLE');
    await t.database!.pg.exec('alter table inventory_movements disable trigger user');
    await t.database!.pg.query(`update inventory_movements set created_at = now() - interval '3 days' where variant_id = $1`, [ids.v1]);
    await t.database!.pg.exec('alter table inventory_movements enable trigger user');
    await t.database!.pg.exec('SET ROLE oms_app');
    const two = await exportReport(admin, { type: 'inventory_valuation', format: 'csv', params: { asOf: istDay(-2) } });
    expect(parseCsv(await fileOf(admin, two.body.data)).map((r) => r[2])).toEqual(['SKU', 'VAL-1', '']); // only the stock received three days ago existed
    const four = await exportReport(admin, { type: 'inventory_valuation', format: 'csv', params: { asOf: istDay(-4) } });
    expect(four.body.data.rowCount).toBe(0);
    expect((await exportReport(admin, { type: 'inventory_valuation', format: 'csv', params: { asOf: istDay(3) } })).body.error.details.rule).toBe('bad_date');
    expect((await exportReport(admin, { type: 'inventory_valuation', format: 'csv', params: { categoryId: '00000000-0000-4000-8000-000000000000' } })).status).toBe(404);
  });

  it('is tenant isolated', async () => {
    const other = await c.registerVendor({ businessName: 'Empty Shop' });
    const res = await exportReport(other, { type: 'inventory_valuation', format: 'csv', params: {} });
    expect(res.body.data.rowCount).toBe(0);
  });
});
