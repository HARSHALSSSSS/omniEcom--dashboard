import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  buildPdf, buildXlsx, computeNextRun, creditNoteLines, deriveRateBps, formatMinor, formatMinorIndian, groupLines, invoiceRows, readZip, relativeWindow, renderCsv, settleOrder, splitProportional,
  stateCodeOf, unitCost, writeZip, crc32, cadenceLabel, type ReportDocument,
} from '../../modules/reports/src/index';

const doc = (rows: Array<Array<string | number | null>>, extra: Partial<ReportDocument> = {}): ReportDocument => ({
  type: 'test', title: 'Test report', businessName: 'Acme & Sons <Ltd>', subtitle: 'October 2026', generatedAt: new Date('2026-10-16T10:30:00Z'), timezone: 'Asia/Kolkata', primarySheet: 0,
  sheets: [{
    name: 'Data', title: 'Data sheet',
    columns: [{ header: 'Name', type: 'text' }, { header: 'Date', type: 'date' }, { header: 'Qty', type: 'int' }, { header: 'Amount', type: 'money' }, { header: 'Rate', type: 'percent' }],
    rows, totals: ['Total', null, 3, 123456, null],
  }],
  ...extra,
});
const text = (z: Buffer, name: string) => readZip(z).find((e) => e.name === name)!.data.toString('utf8');

describe('money', () => {
  it('formats minor units without floats', () => {
    expect(formatMinor(123456)).toBe('1234.56');
    expect(formatMinor(5)).toBe('0.05');
    expect(formatMinor(-5)).toBe('-0.05');
    expect(formatMinor(100)).toBe('1.00');
    expect(formatMinorIndian(123456789)).toBe('12,34,567.89');
    expect(formatMinorIndian(99999)).toBe('999.99');
    expect(formatMinorIndian(-1234500)).toBe('-12,345.00');
  });
  it('splits an amount proportionally and always adds up', () => {
    expect(splitProportional(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitProportional(56000, [56000])).toEqual([56000]);
    expect(splitProportional(10, [0, 0])).toEqual([10, 0]);
    const parts = splitProportional(999_999_999_999, [333_333_333_333, 333_333_333_333, 333_333_333_334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(999_999_999_999);
  });
});

describe('csv', () => {
  it('writes a BOM, quotes, rupee amounts and neutralises formulas', () => {
    const csv = renderCsv(doc([['=SUM(A1)', '2026-10-01', 2, 150000, 1800], ['Tea, "green"', '2026-10-02', 1, -5, null]]).sheets[0]!);
    expect([...csv.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = csv.subarray(3).toString('utf8').split('\r\n');
    expect(lines[0]).toBe('Name,Date,Qty,Amount,Rate');
    expect(lines[1]).toBe("'=SUM(A1),2026-10-01,2,1500.00,18.00");
    expect(lines[2]).toBe('"Tea, ""green""",2026-10-02,1,-0.05,');
    expect(lines[3]).toBe('Total,,3,1234.56,');
  });
});

describe('zip and xlsx', () => {
  it('round-trips entries and detects corruption', () => {
    const big = Buffer.from('abc'.repeat(500));
    const z = writeZip([{ name: 'a.txt', data: Buffer.from('hi') }, { name: 'dir/b.txt', data: big }]);
    const out = readZip(z);
    expect(out.map((e) => e.name)).toEqual(['a.txt', 'dir/b.txt']);
    expect(out[1]!.data.equals(big)).toBe(true);
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    const bad = Buffer.from(z);
    bad[35] = bad[35]! ^ 0xff; // the first data byte of a.txt
    expect(() => readZip(bad)).toThrow();
  });

  it('builds a workbook with typed cells, styles, frozen header and escaped text', () => {
    const x = buildXlsx(doc([['A & B <x>', '2026-10-01', 2, 150000, 1800], [null, null, null, null, null]]));
    const names = readZip(x).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'docProps/core.xml']));
    const sheet = text(x, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('A &amp; B &lt;x&gt;');
    expect(sheet).toContain('<c r="B2" s="5"><v>46296</v></c>'); // 2026-10-01
    expect(sheet).toContain('<c r="C2" s="3"><v>2</v></c>');
    expect(sheet).toContain('<c r="D2" s="4"><v>1500.00</v></c>');
    expect(sheet).toContain('<c r="E2" s="6"><v>0.1800</v></c>');
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<autoFilter ref="A1:E3"/>');
    expect(sheet).toContain('<v>1234.56</v>'); // the total row
    expect(text(x, 'xl/workbook.xml')).toContain('<sheet name="Data" sheetId="1" r:id="rId1"/>');
    expect(text(x, 'xl/styles.xml')).toContain('numFmtId="4"');
    expect(text(x, 'docProps/core.xml')).toContain('Acme &amp; Sons &lt;Ltd&gt;');
  });

  it('keeps sheet names valid and unique and strips characters XML cannot hold', () => {
    const d = doc([['bad\u0001char', null, null, null, null]]);
    d.sheets = [d.sheets[0]!, { ...d.sheets[0]!, name: 'Data' }, { ...d.sheets[0]!, name: 'A/B:C*D?[E]' }];
    const x = buildXlsx(d);
    const wb = text(x, 'xl/workbook.xml');
    expect(wb).toContain('name="Data"');
    expect(wb).toContain('name="Data 2"');
    expect(wb).toContain('name="A B C D  E"');
    expect(text(x, 'xl/worksheets/sheet1.xml')).toContain('badchar');
  });
});

/** the content streams of a pdf, inflated */
function streams(pdf: Buffer): string[] {
  const out: string[] = [];
  const s = pdf.toString('latin1');
  let at = 0;
  for (;;) {
    const i = s.indexOf('stream\n', at);
    if (i < 0) return out;
    const j = s.indexOf('\nendstream', i);
    out.push(inflateSync(pdf.subarray(i + 7, j)).toString('latin1'));
    at = j + 10;
  }
}
const hex = (t: string) => Buffer.from(t, 'latin1').toString('hex');

describe('pdf', () => {
  const many = Array.from({ length: 130 }, (_, i) => [`Item ${i + 1}`, '2026-10-01', i + 1, (i + 1) * 100, null] as Array<string | number | null>);
  const pdf = buildPdf(doc(many));

  it('is a structurally valid pdf: header, xref offsets, trailer', () => {
    const s = pdf.toString('latin1');
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    const start = Number(/startxref\n(\d+)\n%%EOF/.exec(s)![1]);
    expect(s.slice(start, start + 4)).toBe('xref');
    const size = Number(/trailer\n<< \/Size (\d+)/.exec(s)![1]);
    const entries = s.slice(start).split('\n').slice(2, 2 + size);
    expect(entries).toHaveLength(size);
    entries.slice(1).forEach((e, i) => {
      const off = Number(e.slice(0, 10));
      expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it('paginates, repeats the header on every page and numbers the pages', () => {
    const s = pdf.toString('latin1');
    const pages = Number(/\/Count (\d+)/.exec(s)![1]);
    expect(pages).toBeGreaterThan(2);
    const st = streams(pdf);
    expect(st).toHaveLength(pages);
    for (const [i, c] of st.entries()) {
      expect(c).toContain(`<${hex('Name')}>`); // column header on each page
      expect(c).toContain(`<${hex(`Page ${i + 1} of ${pages}`)}>`);
      expect(c).toContain(`<${hex('Test report')}>`);
    }
    expect(st[0]).toContain(`<${hex('Item 1')}>`);
    expect(st[pages - 1]).toContain(`<${hex('Item 130')}>`);
    expect(st[pages - 1]).toContain(`<${hex('1,234.56')}>`); // total with Indian grouping not needed below 1 lakh
  });

  it('shows rupees with Indian grouping and limits text to latin-1', () => {
    const p = buildPdf(doc([[`${String.fromCodePoint(0x20b9)} ${String.fromCodePoint(0x4e2d)} (x)`, '2026-10-01', 1, 123456789, null]]));
    const c = streams(p).join('\n');
    expect(c).toContain(`<${hex('12,34,567.89')}>`);
    expect(c).toContain(`<${hex('Rs ? (x)')}>`);
  });
});

describe('time zones and schedules', () => {
  const ist = (frequency: 'daily' | 'weekly' | 'monthly', extra: { dayOfWeek?: number; dayOfMonth?: number; timeOfDay?: string } = {}) =>
    ({ frequency, dayOfWeek: extra.dayOfWeek ?? null, dayOfMonth: extra.dayOfMonth ?? null, timeOfDay: extra.timeOfDay ?? '06:00', timezone: 'Asia/Kolkata' });

  it('daily: today when the time is still ahead, tomorrow otherwise, strictly after the moment', () => {
    expect(computeNextRun(ist('daily'), new Date('2026-10-16T00:00:00Z')).toISOString()).toBe('2026-10-16T00:30:00.000Z'); // 06:00 IST
    expect(computeNextRun(ist('daily'), new Date('2026-10-16T00:30:00Z')).toISOString()).toBe('2026-10-17T00:30:00.000Z');
    expect(computeNextRun(ist('daily', { timeOfDay: '23:45' }), new Date('2026-10-16T18:30:00Z')).toISOString()).toBe('2026-10-17T18:15:00.000Z'); // after midnight IST the day has rolled
  });
  it('weekly: the next given weekday', () => {
    // 2026-10-16 is a Friday; Monday 06:00 IST is 2026-10-19T00:30Z
    expect(computeNextRun(ist('weekly', { dayOfWeek: 1 }), new Date('2026-10-16T10:00:00Z')).toISOString()).toBe('2026-10-19T00:30:00.000Z');
    expect(computeNextRun(ist('weekly', { dayOfWeek: 5 }), new Date('2026-10-16T10:00:00Z')).toISOString()).toBe('2026-10-23T00:30:00.000Z');
  });
  it('monthly: month ends, leap years and the year change', () => {
    expect(computeNextRun(ist('monthly', { dayOfMonth: 31 }), new Date('2026-02-01T00:00:00Z')).toISOString()).toBe('2026-02-28T00:30:00.000Z');
    expect(computeNextRun(ist('monthly', { dayOfMonth: 31 }), new Date('2028-02-01T00:00:00Z')).toISOString()).toBe('2028-02-29T00:30:00.000Z');
    expect(computeNextRun(ist('monthly', { dayOfMonth: 31 }), new Date('2026-04-30T10:00:00Z')).toISOString()).toBe('2026-05-31T00:30:00.000Z');
    expect(computeNextRun(ist('monthly', { dayOfMonth: 1 }), new Date('2026-12-15T10:00:00Z')).toISOString()).toBe('2027-01-01T00:30:00.000Z');
  });
  it('follows daylight saving in other zones (spring forward gap moves forward)', () => {
    const ny = { frequency: 'daily' as const, dayOfWeek: null, dayOfMonth: null, timeOfDay: '09:00', timezone: 'America/New_York' };
    expect(computeNextRun(ny, new Date('2027-03-13T00:00:00Z')).toISOString()).toBe('2027-03-13T14:00:00.000Z'); // EST
    expect(computeNextRun(ny, new Date('2027-03-14T14:00:00Z')).toISOString()).toBe('2027-03-15T13:00:00.000Z'); // EDT after the change
    const gap = { ...ny, timeOfDay: '02:30' };
    expect(computeNextRun(gap, new Date('2027-03-14T00:00:00Z')).toISOString()).toBe('2027-03-14T07:30:00.000Z'); // 02:30 does not exist: 03:30 EDT
  });
  it('labels the cadence', () => {
    expect(cadenceLabel(ist('weekly', { dayOfWeek: 1 }))).toBe('Weekly on Monday at 06:00');
    expect(cadenceLabel(ist('monthly', { dayOfMonth: 1 }))).toBe('Monthly on day 1 at 06:00');
  });
  it('resolves periods in the business time zone', () => {
    const now = new Date('2026-10-16T10:00:00Z');
    const prev = relativeWindow('previous_month', 'Asia/Kolkata', now);
    expect([prev.fromDay, prev.toDay, prev.label]).toEqual(['2026-09-01', '2026-09-30', 'September 2026']);
    expect(prev.from.toISOString()).toBe('2026-08-31T18:30:00.000Z');
    expect(prev.to.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    const jan = relativeWindow('previous_month', 'Asia/Kolkata', new Date('2027-01-05T10:00:00Z'));
    expect([jan.fromDay, jan.toDay]).toEqual(['2026-12-01', '2026-12-31']);
    expect(relativeWindow('this_financial_year', 'Asia/Kolkata', now).fromDay).toBe('2026-04-01');
    expect(relativeWindow('this_financial_year', 'Asia/Kolkata', new Date('2027-02-01T10:00:00Z')).fromDay).toBe('2026-04-01');
    const pf = relativeWindow('previous_financial_year', 'Asia/Kolkata', now);
    expect([pf.fromDay, pf.toDay, pf.label]).toEqual(['2025-04-01', '2026-03-31', 'FY 2025-26']);
    const wk = relativeWindow('previous_week', 'Asia/Kolkata', now); // Friday 16 Oct: previous Monday 5 to Sunday 11
    expect([wk.fromDay, wk.toDay]).toEqual(['2026-10-05', '2026-10-11']);
    // 23:00 UTC on the 16th is already the 17th in India
    expect(relativeWindow('today', 'Asia/Kolkata', new Date('2026-10-16T23:00:00Z')).fromDay).toBe('2026-10-17');
  });
});

describe('GST rules', () => {
  it('derives the rate a line was taxed at and snaps rounding noise to the slab', () => {
    expect(deriveRateBps(100000, 12000, null)).toBe(1200);
    expect(deriveRateBps(199, 10, null)).toBe(500); // 5.03%
    expect(deriveRateBps(60000, 3001, null)).toBe(500);
    expect(deriveRateBps(10000, 1350, null)).toBe(1350); // not a slab: kept
    expect(deriveRateBps(0, 0, 1800)).toBe(1800);
  });
  it('splits intra-state tax in halves (odd paisa to the state) and inter-state into IGST', () => {
    const line = { hsn: '6109', sku: 'A', qty: 3, taxableMinor: 60000, taxMinor: 3001, catalogRateBps: null };
    expect(groupLines([line], false)[0]).toMatchObject({ cgstMinor: 1500, sgstMinor: 1501, igstMinor: 0 });
    expect(groupLines([line], true)[0]).toMatchObject({ cgstMinor: 0, sgstMinor: 0, igstMinor: 3001 });
  });
  it('groups by HSN and rate, and adds shipping as its own charges row', () => {
    const calc = invoiceRows({
      lines: [{ hsn: '6109', sku: 'A', qty: 1, taxableMinor: 10000, taxMinor: 1200, catalogRateBps: 1200 }, { hsn: '6109', sku: 'B', qty: 2, taxableMinor: 20000, taxMinor: 2400, catalogRateBps: 1200 }, { hsn: '6403', sku: 'C', qty: 1, taxableMinor: 5000, taxMinor: 250, catalogRateBps: 500 }],
      shippingMinor: 4000, orderTaxMinor: 3850 + 720, interState: false,
    });
    expect(calc.rows.map((r) => [r.hsn, r.rateBps, r.qty, r.taxableMinor, r.taxMinor])).toEqual([['6109', 1200, 3, 30000, 3600], ['6403', 500, 1, 5000, 250], ['', 1800, 0, 4000, 720]]);
    expect(calc.rows[2]!.note).toBe('Shipping and other charges');
    expect(calc.rows[2]).toMatchObject({ cgstMinor: 360, sgstMinor: 360 });
    expect(invoiceRows({ lines: [{ hsn: 'x', sku: 'A', qty: 1, taxableMinor: 100, taxMinor: 50, catalogRateBps: null }], shippingMinor: 0, orderTaxMinor: 10, interState: false }).warnings[0]!.code).toBe('tax_below_lines');
  });
  it('allocates a tax inclusive refund over the returned goods so the parts add up', () => {
    const goods = [{ hsn: '6109', sku: 'A', qty: 1, taxableMinor: 50000, taxMinor: 6000, catalogRateBps: null, gross: 56000 }, { hsn: '6403', sku: 'B', qty: 1, taxableMinor: 10000, taxMinor: 500, catalogRateBps: null, gross: 10500 }];
    const lines = creditNoteLines(66500, goods);
    expect(lines.map((l) => [l.taxableMinor, l.taxMinor])).toEqual([[50000, 6000], [10000, 500]]);
    const partial = creditNoteLines(33333, goods);
    expect(partial.reduce((s, l) => s + l.taxableMinor + l.taxMinor, 0)).toBe(33333);
  });
  it('recognises states by name, abbreviation, ISO code and GST code', () => {
    expect(stateCodeOf({ state: 'Maharashtra' })).toBe('27');
    expect(stateCodeOf({ state: 'KA' })).toBe('29');
    expect(stateCodeOf({ state: 'IN-DL' })).toBe('07');
    expect(stateCodeOf({ state: 'new delhi' })).toBe('07');
    expect(stateCodeOf({ state: 'Orissa' })).toBe('21');
    expect(stateCodeOf({ stateCode: '9' })).toBe('09');
    expect(stateCodeOf({ state: 'Jammu & Kashmir' })).toBe('01');
    expect(stateCodeOf({ state: 'Atlantis' })).toBeNull();
    expect(stateCodeOf({})).toBeNull();
  });
});

describe('settlement and valuation rules', () => {
  it('computes expected payout and audit status per order', () => {
    expect(settleOrder({ grossMinor: 112000, actualFeeMinor: 10000, expectedFeeMinor: 10000, penaltyMinor: null, otherMinor: null, refundMinor: 0 }, 100)).toEqual({ feeUsed: 10000, expectedPayout: 102000, variance: 0, status: 'matched' });
    expect(settleOrder({ grossMinor: 56000, actualFeeMinor: 7000, expectedFeeMinor: 5000, penaltyMinor: 500, otherMinor: 100, refundMinor: 1000 }, 100)).toEqual({ feeUsed: 7000, expectedPayout: 47400, variance: 2000, status: 'variance' });
    expect(settleOrder({ grossMinor: 22400, actualFeeMinor: null, expectedFeeMinor: 2000, penaltyMinor: null, otherMinor: null, refundMinor: 0 }, 100)).toEqual({ feeUsed: 2000, expectedPayout: 20400, variance: null, status: 'unverified' });
    expect(settleOrder({ grossMinor: 1000, actualFeeMinor: null, expectedFeeMinor: null, penaltyMinor: null, otherMinor: null, refundMinor: 0 }, 100)).toEqual({ feeUsed: null, expectedPayout: null, variance: null, status: 'fee_unknown' });
    expect(settleOrder({ grossMinor: 1000, actualFeeMinor: 150, expectedFeeMinor: 100, penaltyMinor: null, otherMinor: null, refundMinor: 0 }, 50).status).toBe('matched');
  });
  it('prefers the weighted average of receipts over the variant cost', () => {
    expect(unitCost({ qty: 8, costMinor: 132000 }, 9000)).toEqual({ unitMinor: 16500, source: 'weighted_average' });
    expect(unitCost(undefined, 9000)).toEqual({ unitMinor: 9000, source: 'variant_cost' });
    expect(unitCost(undefined, null)).toBeNull();
  });
});
