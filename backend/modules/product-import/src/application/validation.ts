import { and, asc, eq, gt, inArray, isNull, schema, sql, withVendor, type Db, type Tx } from '@oms/database';
import type { JobHandler } from '@oms/module-kit';
import { jobEffects, loadCatalogRules } from '@oms/mod-catalog';
import { cleanBarcode } from '../domain/normalise';
import { CategoryIndex } from '../domain/category-index';
import { buildFileIndex, deriveRow, rowValues, type CatalogLookup, type DraftIssue, type RowValues } from '../domain/rows';
import { readSettings } from '../domain/settings';
import { I, JOBS, R, S, pack, unpack, type RowRecord, type StoredRow } from './store';
import { appendActivity, setRevalidation, type NewActivity, type RevalidationChange } from './activity';
import { LIMITS } from '../domain/catalogue';

const V = schema.productVariants;
const P = schema.products;
const READ_PAGE = 1_000;
const BATCH = 200;

export interface ValidationOutcome { rows: number; openIssues: number; resolvedIssues: number; stopped: boolean }

export async function loadCategoryIndex(tx: Tx, vendorId: string): Promise<CategoryIndex> {
  const rows = await tx.select({ id: schema.categories.id, parentId: schema.categories.parentId, name: schema.categories.name, slug: schema.categories.slug, path: schema.categories.path })
    .from(schema.categories).where(and(eq(schema.categories.vendorId, vendorId), isNull(schema.categories.deletedAt)));
  return new CategoryIndex(rows);
}

/** SKUs, product codes and barcodes of a batch looked up in the catalogue with three indexed queries (no per-row round trips) */
export async function catalogLookup(tx: Tx, vendorId: string, batch: RowValues[]): Promise<CatalogLookup> {
  const skus = [...new Set(batch.flatMap((v) => (v.sku ? [v.sku.toLowerCase()] : [])))];
  const codes = [...new Set(batch.flatMap((v) => { const c = v.productCode || v.sku; return c ? [c.toLowerCase()] : []; }))];
  const barcodes = [...new Set(batch.flatMap((v) => (v.barcode ? [cleanBarcode(v.barcode)] : [])))];
  const lookup: CatalogLookup = { variantBySku: new Map(), productByCode: new Map(), barcodeOwner: new Map() };
  if (skus.length) {
    const rows = await tx.select({ id: V.id, productId: V.productId, sku: V.sku, barcode: V.barcode, productCode: P.productCode, title: P.title, sellingPriceMinor: V.sellingPriceMinor }).from(V)
      .innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId)))
      .where(and(eq(V.vendorId, vendorId), isNull(V.deletedAt), inArray(sql`lower(${V.sku})`, skus)));
    for (const r of rows) lookup.variantBySku.set(r.sku.toLowerCase(), { id: r.id, productId: r.productId, productCode: r.productCode, barcode: r.barcode, sku: r.sku, title: r.title, sellingPriceMinor: r.sellingPriceMinor });
  }
  if (codes.length) {
    const rows = await tx.select({ id: P.id, productCode: P.productCode }).from(P).where(and(eq(P.vendorId, vendorId), isNull(P.deletedAt), inArray(sql`lower(${P.productCode})`, codes)));
    for (const r of rows) lookup.productByCode.set(r.productCode.toLowerCase(), { id: r.id });
  }
  if (barcodes.length) {
    const rows = await tx.select({ id: V.id, sku: V.sku, barcode: V.barcode }).from(V).where(and(eq(V.vendorId, vendorId), isNull(V.deletedAt), inArray(V.barcode, barcodes)));
    for (const r of rows) lookup.barcodeOwner.set(r.barcode!, { variantId: r.id, sku: r.sku });
  }
  return lookup;
}

interface Loaded { row: RowRecord; stored: StoredRow; values: RowValues }

/**
 * (Re)validate every row of a session that is not committed yet. Deterministic and restartable: the mapping, the seller's fixes and the
 * settings are the only inputs, so running it again after a crash or after a fix gives the same answer. Issues the seller dismissed stay
 * dismissed, resolved ones stay as history unless the problem is still there.
 */
export async function runValidation(db: Db, vendorId: string, sessionId: string): Promise<ValidationOutcome> {
  const start = await withVendor(db, vendorId, async (tx) => {
    const [s] = await tx.select().from(S).where(and(eq(S.id, sessionId), eq(S.vendorId, vendorId)));
    if (!s || s.status !== 'validating') return null;
    return { session: s, categories: await loadCategoryIndex(tx, vendorId) };
  });
  if (!start) return { rows: 0, openIssues: 0, resolvedIssues: 0, stopped: true };
  const { session, categories } = start;
  const settings = readSettings(session.settings);
  await withVendor(db, vendorId, async (tx) => {
    await setRevalidation(tx, sessionId, { status: 'running', total: session.rowCount, checked: 0, current: 'Reading rows', changes: [] });
    await appendActivity(tx, sessionId, [{ kind: 'stage', message: `Validation started for ${session.rowCount} rows` }]);
  });
  const changes: RevalidationChange[] = [];
  const budget = { issues: 100, ok: LIMITS.activityRowEventsPerRun - 100 };

  // pass 1: every row of the file, to know which row first uses a SKU / barcode and the product-level values of each product code
  const loaded: Loaded[] = [];
  for (let last = 0; ;) {
    const page = await withVendor(db, vendorId, (tx) => tx.select().from(R)
      .where(and(eq(R.vendorId, vendorId), eq(R.sessionId, sessionId), gt(R.rowNumber, last), sql`${R.status} <> 'committed'`)).orderBy(asc(R.rowNumber)).limit(READ_PAGE));
    if (page.length === 0) break;
    for (const row of page) {
      const stored = unpack(row);
      loaded.push({ row, stored, values: rowValues(row.raw, session.mapping, stored.fixes) });
    }
    last = page[page.length - 1]!.rowNumber;
  }
  const index = buildFileIndex(loaded.map((l) => ({ rowNumber: l.row.rowNumber, values: l.values, ignored: l.stored.meta.ignored === true })));

  // pass 2: derive + persist in batches
  let stopped = false;
  for (let i = 0; i < loaded.length && !stopped; i += BATCH) {
    const batch = loaded.slice(i, i + BATCH);
    stopped = await withVendor(db, vendorId, async (tx) => {
      const [live] = await tx.select({ status: S.status }).from(S).where(eq(S.id, sessionId));
      if (live?.status !== 'validating') return true; // cancelled or superseded
      const lookup = await catalogLookup(tx, vendorId, batch.map((b) => b.values));
      const catalogRules = await loadCatalogRules(tx, vendorId);
      const numbers = batch.map((b) => b.row.rowNumber);
      const history = await tx.select().from(I).where(and(eq(I.vendorId, vendorId), eq(I.sessionId, sessionId), inArray(I.rowNumber, numbers), sql`${I.status} <> 'open'`));
      await tx.delete(I).where(and(eq(I.vendorId, vendorId), eq(I.sessionId, sessionId), inArray(I.rowNumber, numbers), eq(I.status, 'open')));

      const fresh: Array<typeof I.$inferInsert> = [];
      const staleResolved: string[] = [];
      const events: NewActivity[] = [];
      for (const { row, stored, values } of batch) {
        const d = deriveRow(row.rowNumber, values, { settings, mapping: session.mapping, categories, index, lookup, catalogRules }, { decision: stored.meta.decision });
        const dismissed = history.filter((h) => h.rowNumber === row.rowNumber && h.status === 'ignored');
        const active: DraftIssue[] = [];
        let excluded = stored.meta.ignored === true;
        for (const issue of d.issues) {
          const was = dismissed.find((h) => h.code === issue.code && h.field === issue.field);
          if (was) { if (issue.severity === 'error') excluded = true; continue; }
          const recurring = history.find((h) => h.rowNumber === row.rowNumber && h.status === 'resolved' && h.code === issue.code && h.field === issue.field);
          if (recurring) staleResolved.push(recurring.id);
          active.push(issue);
          fresh.push({ vendorId, sessionId, rowNumber: row.rowNumber, code: issue.code, severity: issue.severity, field: issue.field, message: issue.message, value: issue.value, suggestion: issue.suggestion as Record<string, unknown> | null });
        }
        const status = excluded ? 'ignored' : d.status === 'skipped' ? 'skipped' : active.some((x) => x.severity === 'error') ? 'error' : active.length ? 'warning' : 'valid';
        const meta = { ...stored.meta, plan: d.plan, skipReason: d.skipReason, createNew: d.createNew, ...(excluded ? { ignored: true } : {}) };
        // what the seller fixed before, and whether it holds now (revalidation report)
        for (const h of history.filter((x) => x.rowNumber === row.rowNumber && x.status === 'resolved' && x.field)) {
          if (changes.length >= LIMITS.revalidationChanges) break;
          const res = h.resolution as { value?: string; label?: string } | null;
          changes.push({ rowNumber: row.rowNumber, field: h.field!, from: h.value, to: res?.value ?? res?.label ?? null, outcome: active.some((a) => a.code === h.code && a.field === h.field) ? 'still_failing' : 'passed' });
        }
        const title = d.data.title ?? null;
        if (status === 'error' || status === 'warning') { if (budget.issues > 0) { budget.issues--; events.push({ kind: status === 'error' ? 'row_error' : 'row_warning', rowNumber: row.rowNumber, sku: d.data.sku, title, message: active[0]?.message ?? 'Needs attention' }); } }
        else if (status === 'skipped') { if (budget.ok > 0) { budget.ok--; events.push({ kind: 'row_skipped', rowNumber: row.rowNumber, sku: d.data.sku, title, message: d.skipReason ?? 'Skipped' }); } }
        else if (status === 'valid' && budget.ok > 0) { budget.ok--; events.push({ kind: 'row_validated', rowNumber: row.rowNumber, sku: d.data.sku, title, message: 'Validated' }); }
        await tx.update(R).set({
          status, issueCount: active.length, data: pack({ data: d.data, fixes: stored.fixes, meta }), sku: d.data.sku ?? null, productCode: d.data.productCode ?? null,
        }).where(eq(R.id, row.id));
      }
      if (staleResolved.length) await tx.delete(I).where(inArray(I.id, staleResolved));
      for (let k = 0; k < fresh.length; k += 500) await tx.insert(I).values(fresh.slice(k, k + 500));
      await tx.update(S).set({ processedRows: Math.min(loaded.length, i + batch.length) }).where(eq(S.id, sessionId));
      await appendActivity(tx, sessionId, events);
      const checks = ['SKUs', 'prices', ...(settings.includeImages ? ['image URLs'] : []), ...(settings.includeQuantities ? ['stock'] : [])];
      await setRevalidation(tx, sessionId, { checked: Math.min(loaded.length, i + batch.length), total: loaded.length, current: `Validating ${checks.join(', ')} (rows ${i + 1}-${Math.min(loaded.length, i + batch.length)} of ${loaded.length})`, changes });
      return false;
    });
  }
  if (stopped) return { rows: loaded.length, openIssues: 0, resolvedIssues: 0, stopped: true };

  return withVendor(db, vendorId, async (tx) => {
    const counts = await tx.select({ status: R.status, n: sql<number>`count(*)::int` }).from(R).where(and(eq(R.vendorId, vendorId), eq(R.sessionId, sessionId))).groupBy(R.status);
    const n = (st: string) => counts.find((c) => c.status === st)?.n ?? 0;
    const issues = await tx.select({ status: I.status, n: sql<number>`count(*)::int` }).from(I).where(and(eq(I.vendorId, vendorId), eq(I.sessionId, sessionId))).groupBy(I.status);
    const [live] = await tx.select({ stats: S.stats }).from(S).where(eq(S.id, sessionId));
    const [done] = await tx.update(S).set({
      status: 'validated', validRows: n('valid'), warningRows: n('warning'), errorRows: n('error'), ignoredRows: n('ignored'), committedRows: n('committed'), processedRows: loaded.length,
      stats: { ...(live?.stats ?? session.stats), pendingFixes: 0, skippedRows: n('skipped') }, failureMessage: null, finishedAt: new Date(),
    }).where(and(eq(S.id, sessionId), eq(S.status, 'validating'))).returning();
    if (done) {
      await setRevalidation(tx, sessionId, { status: 'complete', checked: loaded.length, total: loaded.length, current: null, changes });
      await appendActivity(tx, sessionId, [{ kind: 'stage', message: `Validation finished: ${n('valid')} valid, ${n('warning')} with warnings, ${n('error')} with errors` }]);
    }
    return { rows: loaded.length, openIssues: issues.find((x) => x.status === 'open')?.n ?? 0, resolvedIssues: issues.find((x) => x.status === 'resolved')?.n ?? 0, stopped: !done };
  });
}

/** Marks the session as validating and clears its progress. Returns false when it is already busy (the caller answers 409). */
export async function beginValidation(tx: Tx, vendorId: string, sessionId: string): Promise<void> {
  await tx.update(S).set({ status: 'validating', processedRows: 0, failureMessage: null, startedAt: new Date(), finishedAt: null, version: sql`${S.version} + 1` as never }).where(and(eq(S.id, sessionId), eq(S.vendorId, vendorId)));
}

export const validateHandler: JobHandler = {
  queue: 'heavy',
  name: JOBS.validate,
  async handle(env, c) {
    const vendorId = env.vendorId;
    const { sessionId } = env.data as { sessionId: string };
    if (!vendorId) throw new Error('import validation without tenant');
    try {
      await runValidation(c.database.db, vendorId, sessionId);
    } catch (e) {
      c.logger.error({ err: e, sessionId }, 'product import validation failed');
      const message = 'Validation stopped unexpectedly. Try again; if it keeps failing, upload the file again.';
      await withVendor(c.database.db, vendorId, async (tx) => {
        const [failed] = await tx.update(S).set({ status: 'failed', failureMessage: message, finishedAt: new Date() }).where(and(eq(S.id, sessionId), eq(S.status, 'validating'))).returning();
        if (!failed) return;
        await setRevalidation(tx, sessionId, { status: 'failed', current: null });
        await appendActivity(tx, sessionId, [{ kind: 'stage', message }]);
        await jobEffects(tx, { vendorId, correlationId: env.correlationId, actorId: failed.requestedBy, jobId: sessionId }).event({ type: 'import.failed', aggregateType: 'import_session', aggregateId: sessionId, payload: { stage: 'validation', message, created: 0, updated: 0, failed: 0 } });
      });
    }
  },
};
