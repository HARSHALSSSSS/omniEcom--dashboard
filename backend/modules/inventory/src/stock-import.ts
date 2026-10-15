import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, eq, inArray, isNull, schema } from '@oms/database';
import { successEnvelope } from '@oms/contracts';
import { audit, ok, requireVendor, vendorTx } from '@oms/module-kit';
import { AppError } from '@oms/shared';
import * as svc from './service';

const MAX_BYTES = 1024 * 1024;
const MAX_ROWS = 2_000;

/** minimal RFC 4180 reader (quoted fields, escaped quotes, CRLF); the starter file is small, so no streaming */
function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const out: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) { if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(field); field = ''; if (row.length > 1 || row[0] !== '') out.push(row); row = []; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') out.push(row); }
  return out;
}

const ResultSchema = z.object({
  mode: z.enum(['set', 'add']), rows: z.number().int(), applied: z.number().int(), unchanged: z.number().int(), failed: z.number().int(),
  errors: z.array(z.object({ row: z.number().int(), sku: z.string().nullable(), message: z.string() })).describe('First 100 row errors'),
}).meta({ id: 'StockImportResult' });

/** "Import inventory file": opening stock (or a recount) from a CSV, with a per-row report. */
export const stockImportRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  app.addContentTypeParser('text/csv', { parseAs: 'buffer', bodyLimit: MAX_BYTES }, (_req, body, done) => done(null, body));

  r.post('/inventory/imports', {
    config: { access: { permission: 'inventory:write' } },
    schema: {
      tags: ['Inventory'],
      summary: 'Import stock from a CSV file',
      description: `Body: raw text/csv (max 1 MB, ${MAX_ROWS} rows). Columns: sku, quantity, optional warehouse_code (default warehouse when empty). mode=set (default) records a count: the ledger stores the difference; mode=add receives the quantity on top. Each row is applied on its own, so one bad row does not stop the rest; re-uploading the same file changes nothing twice.`,
      querystring: z.object({ mode: z.enum(['set', 'add']).default('set') }),
      response: { 200: successEnvelope(ResultSchema) },
    },
  }, async (req) => {
    const vendorId = requireVendor(req);
    const body = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new AppError('BAD_REQUEST', 'Send the CSV as the request body with Content-Type: text/csv');
    const table = parseCsv(body.toString('utf8'));
    const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
    for (const need of ['sku', 'quantity']) if (!header.includes(need)) throw new AppError('BAD_REQUEST', `Missing required column "${need}"`, { details: { rule: 'missing_column', column: need } });
    if (table.length - 1 > MAX_ROWS) throw new AppError('PAYLOAD_TOO_LARGE', `At most ${MAX_ROWS} rows per file`);
    const col = (cells: string[], name: string) => (cells[header.indexOf(name)] ?? '').trim();

    const fileHash = createHash('sha256').update(body).digest('hex').slice(0, 24);
    const errors: Array<{ row: number; sku: string | null; message: string }> = [];
    const stats = { applied: 0, unchanged: 0, failed: 0 };
    const rows = table.slice(1).map((cells, i) => ({ line: i + 2, sku: col(cells, 'sku'), qty: col(cells, 'quantity'), wh: col(cells, 'warehouse_code') }));
    const fail = (line: number, sku: string, message: string) => { stats.failed++; if (errors.length < 100) errors.push({ row: line, sku: sku || null, message }); };

    // resolve SKUs and warehouses once
    const { variants, warehouses, onHand } = await vendorTx(req, async (tx) => {
      const skus = [...new Set(rows.map((x) => x.sku).filter(Boolean))];
      const vs = skus.length ? await tx.select({ id: schema.productVariants.id, sku: schema.productVariants.sku }).from(schema.productVariants).where(and(eq(schema.productVariants.vendorId, vendorId), isNull(schema.productVariants.deletedAt), inArray(schema.productVariants.sku, skus))) : [];
      const ws = await tx.select({ id: schema.warehouses.id, code: schema.warehouses.code, isDefault: schema.warehouses.isDefault, status: schema.warehouses.status }).from(schema.warehouses).where(and(eq(schema.warehouses.vendorId, vendorId), isNull(schema.warehouses.deletedAt)));
      const stock = vs.length ? await tx.select({ variantId: schema.inventory.variantId, warehouseId: schema.inventory.warehouseId, qty: schema.inventory.quantityOnHand }).from(schema.inventory).where(and(eq(schema.inventory.vendorId, vendorId), inArray(schema.inventory.variantId, vs.map((v) => v.id)))) : [];
      return { variants: new Map(vs.map((v) => [v.sku, v.id])), warehouses: ws, onHand: new Map(stock.map((x) => [`${x.variantId}:${x.warehouseId}`, x.qty])) };
    });
    const defaultWh = warehouses.find((w) => w.isDefault && w.status === 'active');
    const actor = { type: (req.ctx.principal?.actorType ?? 'system') as 'user' | 'api_key' | 'system' | 'webhook', id: req.ctx.principal?.actorId ?? null };

    for (const row of rows) {
      if (!row.sku) { fail(row.line, row.sku, 'sku is empty'); continue; }
      const qty = Number(row.qty);
      if (row.qty === '' || !Number.isInteger(qty) || qty < 0 || qty > 10_000_000) { fail(row.line, row.sku, 'quantity must be a whole number from 0 to 10,000,000'); continue; }
      const variantId = variants.get(row.sku);
      if (!variantId) { fail(row.line, row.sku, 'unknown SKU: create the product first'); continue; }
      const wh = row.wh ? warehouses.find((w) => w.code.toLowerCase() === row.wh.toLowerCase() && w.status === 'active') : defaultWh;
      if (!wh) { fail(row.line, row.sku, row.wh ? `unknown or inactive warehouse "${row.wh}"` : 'no default warehouse: set up inventory first'); continue; }
      // nothing to do: adding zero, or counting what is already there
      if (req.query.mode === 'add' ? qty === 0 : (onHand.get(`${variantId}:${wh.id}`) ?? 0) === qty) { stats.unchanged++; continue; }
      try {
        const res = await vendorTx(req, (tx) => {
          const t = { vendorId, variantId, warehouseId: wh.id, reason: 'Stock file import', referenceType: 'import' as const, referenceId: fileHash, idempotencyKey: `stock-import:${fileHash}:${req.query.mode}:${row.line}`, actor };
          return req.query.mode === 'add' ? svc.receiveStock(tx, { ...t, quantity: qty }) : svc.adjustStock(tx, { ...t, setOnHand: qty });
        });
        if (res.duplicate) stats.unchanged++; else stats.applied++;
      } catch (e) {
        fail(row.line, row.sku, e instanceof AppError ? e.message : 'could not apply this row');
      }
    }
    await vendorTx(req, (tx) => audit(tx, req, { action: 'inventory.stock_import', resourceType: 'inventory', resourceId: vendorId, metadata: { fileHash, mode: req.query.mode, ...stats, rows: rows.length } }));
    return ok(req, { mode: req.query.mode, rows: rows.length, ...stats, errors });
  });
};
