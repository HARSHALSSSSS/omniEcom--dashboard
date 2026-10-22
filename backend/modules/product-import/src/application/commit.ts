import { and, asc, eq, gt, inArray, isNull, schema, sql, withVendor, type Db, type SQL, type Tx } from '@oms/database';
import { AppError } from '@oms/shared';
import type { Container, JobHandler } from '@oms/module-kit';
import type { JobEnvelope } from '@oms/messaging';
import { createProduct, createVariant, jobEffects, updateProduct, updateVariant, type ProductInput, type VariantInput } from '@oms/mod-catalog';
import { adjustStock, receiveStock } from '@oms/mod-inventory';
import { createDocument, isRejection, uploadContent } from '@oms/mod-documents';
import { readSettings, type ImportSettings } from '../domain/settings';
import type { RowData } from '../domain/rows';
import { draftListings } from './listing-drafts';
import { recount } from './issues';
import { appendActivity, type NewActivity } from './activity';
import { I, JOBS, R, S, getSession, pack, unpack, type RowRecord, type RowMeta, type SessionRow } from './store';

const V = schema.productVariants;
const P = schema.products;
const COMMIT_BATCH = 50;

export type CommitMode = 'clean_only' | 'include_resolved';

/** rows the commit may take: validated without errors, and (clean_only) not touched by a fix of the seller */
const eligible = (vendorId: string, sessionId: string, includeResolved: boolean): SQL | undefined => and(
  eq(R.vendorId, vendorId), eq(R.sessionId, sessionId), inArray(R.status, ['valid', 'warning']),
  includeResolved ? undefined : sql`coalesce(${R.data}->'__meta'->>'fixed', 'false') <> 'true'`,
);

async function importWarehouse(tx: Tx, vendorId: string, settings: ImportSettings): Promise<string | null> {
  if (settings.warehouseId) return settings.warehouseId;
  const [w] = await tx.select({ id: schema.warehouses.id }).from(schema.warehouses).where(and(eq(schema.warehouses.vendorId, vendorId), eq(schema.warehouses.isDefault, true), eq(schema.warehouses.status, 'active'), isNull(schema.warehouses.deletedAt)));
  return w?.id ?? null;
}

/** How many rows each commit choice would import, so the screen can show exact numbers before the seller confirms. */
export async function commitPreview(tx: Tx, vendorId: string, sessionId: string): Promise<{ cleanOnly: number; includeResolved: number; pendingFixes: number }> {
  const s = await getSession(tx, vendorId, sessionId);
  const count = async (includeResolved: boolean) => {
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(R).where(eligible(vendorId, sessionId, includeResolved));
    return r?.n ?? 0;
  };
  return { cleanOnly: await count(false), includeResolved: await count(true), pendingFixes: s.stats.pendingFixes ?? 0 };
}

/** Checks a commit request and flips the session to "committing". The job does the work. */
export async function beginCommit(tx: Tx, vendorId: string, sessionId: string, mode: CommitMode): Promise<{ session: SessionRow; eligibleRows: number }> {
  const s = await getSession(tx, vendorId, sessionId, { forUpdate: true });
  if (s.status !== 'validated' && s.status !== 'partially_committed') {
    throw new AppError('CONFLICT', s.status === 'committing' ? 'This import is already being committed' : `The import cannot be committed while it is ${s.status}`, { details: { rule: s.status === 'analyzed' || s.status === 'uploaded' ? 'not_validated' : 'wrong_status', status: s.status } });
  }
  if ((s.stats.pendingFixes ?? 0) > 0) throw new AppError('CONFLICT', 'You changed rows after the last validation. Revalidate before committing.', { details: { rule: 'revalidate_first', pendingFixes: s.stats.pendingFixes } });
  const includeResolved = mode === 'include_resolved';
  const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(R).where(eligible(vendorId, sessionId, includeResolved));
  const n = count?.n ?? 0;
  if (n === 0) throw new AppError('CONFLICT', 'There are no rows to import with this choice', { details: { rule: 'nothing_to_commit' } });
  const settings = readSettings(s.settings);
  const [withStock] = await tx.select({ n: sql<number>`count(*)::int` }).from(R).where(and(eligible(vendorId, sessionId, includeResolved), sql`coalesce((${R.data}->>'stock')::int, 0) > 0`));
  if (settings.includeQuantities && (withStock?.n ?? 0) > 0 && !(await importWarehouse(tx, vendorId, settings))) {
    throw new AppError('CONFLICT', 'Choose a warehouse for the stock column (or create a default warehouse) before importing', { details: { rule: 'no_warehouse' } });
  }
  const [row] = await tx.update(S).set({
    status: 'committing', startedAt: new Date(), finishedAt: null, failureMessage: null, version: s.version + 1,
    stats: { ...s.stats, commitTotal: n, commitIncludeResolved: includeResolved ? 1 : 0, failedRows: 0 },
  }).where(eq(S.id, sessionId)).returning();
  return { session: row!, eligibleRows: n };
}

export const commitEnvelope = (vendorId: string, correlationId: string, s: SessionRow): JobEnvelope<{ sessionId: string }> => ({ vendorId, correlationId, idempotencyKey: `product-import-commit-${s.id}-${s.version}`, data: { sessionId: s.id } });

const zero = (): Tally => ({ productsCreated: 0, productsUpdated: 0, variantsCreated: 0, variantsUpdated: 0, committed: 0, failed: 0 });
interface Tally { productsCreated: number; productsUpdated: number; variantsCreated: number; variantsUpdated: number; committed: number; failed: number }

const productPatch = (d: RowData): Partial<ProductInput> => {
  const patch: Partial<ProductInput> = {};
  if (d.title) patch.title = d.title;
  if (d.description) patch.description = d.description;
  if (d.brand) patch.brand = d.brand;
  if (d.manufacturer) patch.manufacturer = d.manufacturer;
  if (d.countryOfOrigin) patch.countryOfOrigin = d.countryOfOrigin;
  if (d.categoryId) patch.categoryId = d.categoryId;
  if (d.hsnCode) patch.hsnCode = d.hsnCode;
  if (d.gstRateBps !== null && d.gstRateBps !== undefined) patch.gstRateBps = d.gstRateBps;
  if (d.tags?.length) patch.tags = d.tags;
  return patch;
};

const variantFields = (d: RowData): Omit<VariantInput, 'sku'> => {
  const v: Omit<VariantInput, 'sku'> = {};
  if (d.barcode) v.barcode = d.barcode;
  if (d.optionValues && Object.keys(d.optionValues).length) v.optionValues = d.optionValues;
  if (d.mrpMinor !== null && d.mrpMinor !== undefined) v.mrpMinor = d.mrpMinor;
  if (d.sellingPriceMinor !== undefined) v.sellingPriceMinor = d.sellingPriceMinor;
  if (d.costPriceMinor !== null && d.costPriceMinor !== undefined) v.costPriceMinor = d.costPriceMinor;
  if (d.gstRateBps !== null && d.gstRateBps !== undefined) v.taxRateBps = d.gstRateBps;
  if (d.weightGrams) v.weightGrams = d.weightGrams;
  return v;
};

const errorMessage = (e: unknown): string | null => {
  if (e instanceof AppError) {
    const issues = (e.details as { issues?: Array<{ path?: string; message?: string }> } | undefined)?.issues;
    return issues?.length ? `${e.message}: ${issues.map((i) => `${i.path ?? 'row'} ${i.message ?? ''}`.trim()).join('; ')}` : e.message;
  }
  const pg = (e as { cause?: { code?: string; constraint?: string } })?.cause;
  if (pg?.code === '23505') return `Duplicate value (${pg.constraint ?? 'unique constraint'})`;
  if (pg?.code) return 'A database rule rejected this row';
  return null;
};

/** One row, one transaction: the product, variant, stock, draft listings and the row's own status commit together or not at all. */
/** the first free `base-N` (N >= 2) for a SKU or product code; the base itself when it is free */
async function freeValue(tx: Tx, vendorId: string, kind: 'sku' | 'code', base: string): Promise<string> {
  const taken = async (value: string): Promise<boolean> => {
    const rows = kind === 'sku'
      ? await tx.select({ id: V.id }).from(V).where(and(eq(V.vendorId, vendorId), isNull(V.deletedAt), sql`lower(${V.sku}) = ${value.toLowerCase()}`)).limit(1)
      : await tx.select({ id: P.id }).from(P).where(and(eq(P.vendorId, vendorId), isNull(P.deletedAt), sql`lower(${P.productCode}) = ${value.toLowerCase()}`)).limit(1);
    return rows.length > 0;
  };
  if (!(await taken(base))) return base;
  for (let n = 2; n < 1000; n++) { const candidate = `${base.slice(0, 58)}-${n}`; if (!(await taken(candidate))) return candidate; }
  return `${base.slice(0, 50)}-${Date.now() % 100000}`;
}

async function commitRow(tx: Tx, c: Container, vendorId: string, env: { correlationId: string }, session: SessionRow, settings: ImportSettings, row: RowRecord, tally: Tally, events: NewActivity[]): Promise<void> {
  const stored = unpack(row);
  const d = stored.data;
  const fx = jobEffects(tx, { vendorId, correlationId: env.correlationId, actorId: session.requestedBy, jobId: session.id });
  const forceNew = stored.meta.createNew === true; // decision "create new" (or the create_new strategy): never match the existing product
  const sku = forceNew ? await freeValue(tx, vendorId, 'sku', d.sku!) : d.sku!;
  const code = forceNew ? await freeValue(tx, vendorId, 'code', d.productCode ?? d.sku!) : d.productCode ?? sku;
  const plan = stored.meta.plan ?? 'create';

  const [existingVariant] = forceNew ? [] : await tx.select({ id: V.id, productId: V.productId }).from(V).where(and(eq(V.vendorId, vendorId), isNull(V.deletedAt), sql`lower(${V.sku}) = ${sku.toLowerCase()}`));
  const [existingProduct] = forceNew || !settings.matchVariants ? [] : await tx.select({ id: P.id }).from(P).where(and(eq(P.vendorId, vendorId), isNull(P.deletedAt), sql`lower(${P.productCode}) = ${code.toLowerCase()}`));
  const result: NonNullable<RowMeta['result']> = { action: 'created', notes: [] };
  if (sku !== d.sku) { result.sku = sku; result.notes!.push(`SKU ${d.sku} was already taken; created as ${sku}`); }
  let productId: string;
  let variantId: string;
  let isNewVariant = true;

  if (existingVariant) {
    if (plan !== 'update') throw new AppError('CONFLICT', `SKU ${sku} was added to the catalogue after this file was validated`);
    productId = existingVariant.productId;
    variantId = existingVariant.id;
    isNewVariant = false;
    const patch = productPatch(d);
    if (Object.keys(patch).length) await updateProduct(tx, vendorId, productId, patch, fx);
    await updateVariant(tx, vendorId, variantId, variantFields(d), fx);
    result.action = 'updated';
    tally.productsUpdated++; tally.variantsUpdated++;
  } else if (existingProduct) {
    const createdByThisImport = plan === 'create' && (await tx.select({ id: R.id }).from(R).where(and(eq(R.vendorId, vendorId), eq(R.sessionId, session.id), eq(R.status, 'committed'), sql`lower(${R.productCode}) = ${code.toLowerCase()}`)).limit(1)).length > 0;
    if (plan === 'create' && !createdByThisImport) throw new AppError('CONFLICT', `Product code ${code} was added to the catalogue after this file was validated`);
    productId = existingProduct.id;
    if (plan === 'add_variant' && settings.duplicateStrategy === 'update') {
      const patch = productPatch(d);
      if (Object.keys(patch).length) { await updateProduct(tx, vendorId, productId, patch, fx); tally.productsUpdated++; }
    }
    variantId = (await createVariant(tx, vendorId, productId, { sku, ...variantFields(d) }, fx)).id;
    result.action = 'variant_added';
    tally.variantsCreated++;
  } else {
    const created = await createProduct(tx, vendorId, {
      ...productPatch(d), productCode: code, title: d.title!, status: 'draft', variants: [{ sku, ...variantFields(d) }],
    } as ProductInput, fx);
    productId = created.id;
    variantId = created.variants[0]!.id;
    tally.productsCreated++; tally.variantsCreated++;
  }

  // an image the seller uploaded for this row becomes a product image (a failure is a note, never a lost row)
  const image = settings.includeImages ? stored.meta.image : undefined;
  if (image) {
    try {
      const bytes = await c.storage.get(image.key);
      if (!bytes) result.notes!.push('The uploaded image is no longer in storage; add it from the product page');
      else {
        const doc = await createDocument(tx, c, vendorId, productId, { fileName: image.fileName, mimeType: image.mime, sizeBytes: bytes.length, purpose: 'product_image' });
        const up = await uploadContent(tx, c, vendorId, doc.row.id, bytes, image.mime, false);
        result.notes!.push(isRejection(up) ? `The uploaded image was rejected: ${up.rejected.message}` : 'Uploaded image attached to the product');
      }
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      result.notes!.push(`The uploaded image could not be attached: ${e.message}`);
    }
  }

  // stock: opening stock for a new variant, a stock count for an existing one (both idempotent per row)
  result.stock = 'none';
  if (settings.includeQuantities && d.stock !== null && d.stock !== undefined) {
    const warehouseId = await importWarehouse(tx, vendorId, settings);
    if (!warehouseId) throw new AppError('CONFLICT', 'No warehouse to receive the stock');
    const base = { vendorId, variantId, warehouseId, reason: 'Product import', referenceType: 'import' as const, referenceId: session.id, idempotencyKey: `product-import:${session.id}:${row.rowNumber}`, actor: { type: 'user' as const, id: session.requestedBy } };
    if (isNewVariant) { if (d.stock > 0) { await receiveStock(tx, { ...base, quantity: d.stock }); result.stock = 'received'; } }
    else {
      try { await adjustStock(tx, { ...base, setOnHand: d.stock }); result.stock = 'counted'; } catch (e) {
        if (!(e instanceof AppError) || e.code !== 'BAD_REQUEST') throw e;
        result.stock = 'unchanged';
      }
    }
  }

  if (settings.autoPublish) {
    const drafts = await draftListings(tx, c, vendorId, variantId, settings, session.requestedBy);
    result.listingDrafts = drafts.created;
    result.notes!.push(...drafts.notes);
  }

  await tx.update(R).set({ status: 'committed', productId, variantId, issueCount: 0, data: pack({ data: d, fixes: stored.fixes, meta: { ...stored.meta, result } }) }).where(eq(R.id, row.id));
  tally.committed++;
  const verb = result.action === 'updated' ? 'Updated existing product' : result.action === 'variant_added' ? 'Added variant to existing product' : 'Created product';
  events.push({ kind: result.action === 'updated' ? 'row_updated' : 'row_created', rowNumber: row.rowNumber, sku, title: d.title ?? null, message: `${verb}${sku !== d.sku ? ` (SKU ${sku})` : ''}` });
}

async function failRow(tx: Tx, vendorId: string, sessionId: string, row: RowRecord, message: string): Promise<void> {
  const stored = unpack(row);
  await tx.delete(I).where(and(eq(I.vendorId, vendorId), eq(I.sessionId, sessionId), eq(I.rowNumber, row.rowNumber), eq(I.code, 'commit_failed')));
  await tx.insert(I).values({ vendorId, sessionId, rowNumber: row.rowNumber, code: 'commit_failed', severity: 'error', field: null, message, value: row.sku });
  await tx.update(R).set({ status: 'error', issueCount: row.issueCount + 1, data: pack({ ...stored, meta: { ...stored.meta, result: undefined } }) }).where(eq(R.id, row.id));
}

export async function runCommit(db: Db, c: Container, vendorId: string, env: { correlationId: string }, sessionId: string): Promise<void> {
  const session = await withVendor(db, vendorId, async (tx) => {
    const [s] = await tx.select().from(S).where(and(eq(S.id, sessionId), eq(S.vendorId, vendorId)));
    return s && s.status === 'committing' ? s : null;
  });
  if (!session) return; // replay of a finished or cancelled commit
  const settings = readSettings(session.settings);
  const includeResolved = (session.stats.commitIncludeResolved ?? 0) === 1;
  const total = zero();

  for (let last = 0; ;) {
    const batch = await withVendor(db, vendorId, async (tx) => {
      const [live] = await tx.select({ status: S.status }).from(S).where(eq(S.id, sessionId));
      if (live?.status !== 'committing') return null;
      return tx.select().from(R).where(and(eligible(vendorId, sessionId, includeResolved), gt(R.rowNumber, last))).orderBy(asc(R.rowNumber)).limit(COMMIT_BATCH);
    });
    if (!batch || batch.length === 0) { if (batch === null) return; break; }
    const tally = zero();
    const events: NewActivity[] = [];
    for (const row of batch) {
      const rowTally = zero();
      try {
        await withVendor(db, vendorId, (tx) => commitRow(tx, c, vendorId, env, session, settings, row, rowTally, events));
        for (const k of Object.keys(tally) as Array<keyof Tally>) tally[k] += rowTally[k];
      } catch (e) {
        const message = errorMessage(e);
        if (message === null) throw e; // infrastructure failure: let the queue retry the job
        await withVendor(db, vendorId, (tx) => failRow(tx, vendorId, sessionId, row, message));
        tally.failed++;
        events.push({ kind: 'row_failed', rowNumber: row.rowNumber, sku: row.sku, title: (unpack(row).data.title ?? null), message });
      }
    }
    last = batch[batch.length - 1]!.rowNumber;
    for (const k of Object.keys(total) as Array<keyof Tally>) total[k] += tally[k];
    await withVendor(db, vendorId, async (tx) => {
      await appendActivity(tx, sessionId, events);
      const [s] = await tx.select({ stats: S.stats }).from(S).where(eq(S.id, sessionId));
      const st = s?.stats ?? {};
      await tx.update(S).set({ processedRows: (st.processedInCommit ?? 0) + batch.length }).where(eq(S.id, sessionId));
      await recount(tx, vendorId, sessionId, {
        processedInCommit: (st.processedInCommit ?? 0) + batch.length, failedRows: (st.failedRows ?? 0) + tally.failed,
        productsCreated: (st.productsCreated ?? 0) + tally.productsCreated, productsUpdated: (st.productsUpdated ?? 0) + tally.productsUpdated,
        variantsCreated: (st.variantsCreated ?? 0) + tally.variantsCreated, variantsUpdated: (st.variantsUpdated ?? 0) + tally.variantsUpdated,
      });
    });
  }

  await withVendor(db, vendorId, async (tx) => {
    await recount(tx, vendorId, sessionId);
    const [open] = await tx.select({ n: sql<number>`count(*)::int` }).from(R).where(and(eq(R.vendorId, vendorId), eq(R.sessionId, sessionId), inArray(R.status, ['valid', 'warning', 'error'])));
    const [fresh] = await tx.select().from(S).where(eq(S.id, sessionId));
    const committedRows = fresh?.committedRows ?? 0;
    const status = (open?.n ?? 0) === 0 ? 'committed' : committedRows > 0 ? 'partially_committed' : 'failed';
    await tx.update(S).set({
      status, finishedAt: new Date(), failureMessage: status === 'failed' ? 'No row could be imported. Open the issues list for the reason of each row.' : null,
    }).where(and(eq(S.id, sessionId), eq(S.status, 'committing')));
    const fx = jobEffects(tx, { vendorId, correlationId: env.correlationId, actorId: session.requestedBy, jobId: sessionId });
    const st = fresh?.stats ?? {};
    const payload = {
      status, committed: total.committed, failed: st.failedRows ?? total.failed, created: st.productsCreated ?? total.productsCreated, updated: st.productsUpdated ?? total.productsUpdated,
      productsCreated: st.productsCreated ?? total.productsCreated, productsUpdated: st.productsUpdated ?? total.productsUpdated, variantsCreated: total.variantsCreated,
    };
    await appendActivity(tx, sessionId, [{ kind: 'stage', message: `Import finished: ${payload.created} created, ${payload.updated} updated, ${payload.failed} failed` }]);
    if (status === 'failed') await fx.event({ type: 'import.failed', aggregateType: 'import_session', aggregateId: sessionId, payload: { ...payload, stage: 'commit', message: 'No row could be imported.' } });
    else await fx.event({ type: 'import.committed', aggregateType: 'import_session', aggregateId: sessionId, payload });
    await fx.audit({ action: 'import.commit', resourceType: 'import_session', resourceId: sessionId, metadata: { status, ...total } });
  });
}

export const commitHandler: JobHandler = {
  queue: 'heavy',
  name: JOBS.commit,
  async handle(env, c) {
    const vendorId = env.vendorId;
    const { sessionId } = env.data as { sessionId: string };
    if (!vendorId) throw new Error('import commit without tenant');
    await runCommit(c.database.db, c, vendorId, env, sessionId);
  },
};
