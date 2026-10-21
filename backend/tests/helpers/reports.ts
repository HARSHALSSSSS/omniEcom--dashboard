import { readZip } from '../../modules/reports/src/zip';
import { newId } from '@oms/shared';
import type { TestApp } from '@oms/testing';

/** the GSTIN check character (mod-36), so fixtures carry real, valid numbers */
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function gstin(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARSET.indexOf(first14[i]!) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return first14 + CHARSET[(36 - (sum % 36)) % 36];
}

/** direct SQL as the system scope (the runtime role sees no tenant rows without a scope) */
export async function sys<R>(t: TestApp, fn: (q: (sql: string, params?: unknown[]) => Promise<any[]>) => Promise<R>): Promise<R> {
  const pg = t.database!.pg;
  await pg.query(`select set_config('app.scope', 'system', false)`);
  try { return await fn(async (sql, params) => (await pg.query(sql, params as never)).rows as any[]); } finally { await pg.query(`select set_config('app.scope', '', false), set_config('app.vendor_id', '', false)`); }
}

export async function addGstin(t: TestApp, vendorId: string, g: string, o: { primary?: boolean; status?: string } = {}) {
  const names: Record<string, string> = { '27': 'Maharashtra', '29': 'Karnataka', '07': 'Delhi' };
  await sys(t, (q) => q(`insert into vendor_gstins (vendor_id, gstin, state_code, state_name, is_primary, status) values ($1, $2, $3, $4, $5, $6)`, [vendorId, g, g.slice(0, 2), names[g.slice(0, 2)] ?? 'State', o.primary ?? false, o.status ?? 'active']));
}

export interface OrderFixture {
  number: string;
  placedAt: string;
  status?: string;
  deliveredAt?: string | null;
  warehouseId?: string | null;
  shippingMinor?: number;
  /** order level tax; default = the sum of the items' tax */
  taxMinor?: number;
  discountMinor?: number;
  buyer?: Record<string, unknown>;
  address?: Record<string, unknown>;
  items: Array<{ variantId: string; sku: string; qty: number; unitMinor: number; taxMinor: number; discountMinor?: number }>;
}

export async function insertOrder(t: TestApp, vendorId: string, accountId: string, o: OrderFixture): Promise<string> {
  const subtotal = o.items.reduce((s, i) => s + i.unitMinor * i.qty, 0);
  const itemTax = o.items.reduce((s, i) => s + i.taxMinor, 0);
  const tax = o.taxMinor ?? itemTax;
  const discount = o.discountMinor ?? o.items.reduce((s, i) => s + (i.discountMinor ?? 0), 0);
  const shipping = o.shippingMinor ?? 0;
  const id = newId();
  await sys(t, async (q) => {
    await q(
      `insert into orders (id, vendor_id, marketplace_account_id, marketplace, external_order_id, order_number, status, placed_at, delivered_at, warehouse_id, currency, subtotal_minor, tax_minor, shipping_minor, discount_minor, total_minor, buyer, shipping_address)
       values ($1, $2, $3, 'mock', $4, $5, $6, $7, $8, $9, 'INR', $10, $11, $12, $13, $14, $15, $16)`,
      [id, vendorId, accountId, `EXT-${o.number}`, o.number, o.status ?? 'delivered', o.placedAt, o.deliveredAt ?? null, o.warehouseId ?? null, subtotal, tax, shipping, discount, subtotal + tax + shipping - discount, JSON.stringify(o.buyer ?? {}), JSON.stringify(o.address ?? {})],
    );
    for (const [n, i] of o.items.entries()) {
      await q(
        `insert into order_items (vendor_id, order_id, external_item_id, variant_id, sku, title, quantity, unit_price_minor, tax_minor, discount_minor, status) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new')`,
        [vendorId, id, `${o.number}-${n}`, i.variantId, i.sku, `Item ${i.sku}`, i.qty, i.unitMinor, i.taxMinor, i.discountMinor ?? 0],
      );
    }
  });
  return id;
}

/** a tiny csv reader for the exports under test (handles quotes, CRLF and the BOM) */
export function parseCsv(buf: Buffer | string): string[][] {
  const s = (typeof buf === 'string' ? buf : buf.toString('utf8')).replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** the cell values of one worksheet of an xlsx (n = 1 for the first sheet) as strings, row by row (empty cells are skipped in place) */
export function xlsxSheet(buf: Buffer, n: number): string[][] {
  const xml = readZip(buf).find((e) => e.name === `xl/worksheets/sheet${n}.xml`)!.data.toString('utf8');
  const out: string[][] = [];
  for (const row of xml.matchAll(/<row r="\d+"[^>]*>(.*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1]!.matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>(.*?)<\/c>)/g)) {
      let col = 0;
      for (const ch of c[1]!) col = col * 26 + (ch.charCodeAt(0) - 64);
      const inner = c[2] ?? '';
      const text = /<t[^>]*>(.*?)<\/t>/.exec(inner)?.[1];
      const v = /<v>(.*?)<\/v>/.exec(inner)?.[1];
      cells[col - 1] = text !== undefined ? unxml(text) : v ?? '';
    }
    out.push(Array.from(cells, (x) => x ?? ''));
  }
  return out;
}
