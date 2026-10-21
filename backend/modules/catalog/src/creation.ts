import { randomInt } from 'node:crypto';
import { and, asc, desc, eq, escapeLike, ilike, isNull, or, schema, sql, type SQL, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { getCategory } from '@oms/mod-categories';
import type { Effects } from './effects';
import { brandStates } from './brands';
import {
  CODE_REASON_MESSAGE, checkCode, collapseSpaces, isPlaceholderCode, nameKey, normalizeFields, TITLE_MIN_STEP, type CustomAttribute, type FieldIssue, type NormalizedFields, type ProductType, type RawFields,
} from './fields';
import { sanitizeDescription } from './description';
import {
  categoryAttributeStates, evaluateCreationReadiness, inputFromSaved, loadChannels, loadSavedStates, type CreationReadiness, type CreationRow, type ImageState, type ReadinessInput, type SavedStates,
} from './creation-readiness';
import * as svc from './service';

/**
 * Product creation flow (docs/figma/41-creation-build-brief.md): drafts with a generated placeholder code, autosave with an optimistic version,
 * SKU checks, the readiness panel, step validation / continue and discarding drafts. Every function takes the request transaction and the
 * business id and filters by it explicitly (RLS is the second line of defence).
 */
const P = schema.products;
const V = schema.productVariants;
const PC = schema.productCreation;
const B = schema.brands;

export type NamesFn = (code: string) => string;
export const CREATION_STEPS = ['basic', 'variants', 'inventory', 'listings', 'channels'] as const;
export type CreationStep = (typeof CREATION_STEPS)[number];
export interface StepIssue { field: string; code: string; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: string | null | undefined) => (v && UUID.test(v) ? v : null);
const thumbHref = (docId: string) => `/api/v1/documents/${docId}/content`;
const iso = (d: Date) => d.toISOString();
const notADraft = (status: string) => new AppError('CONFLICT', 'Only draft products can be edited through the creation flow', { details: { rule: 'not_a_draft', status } });

/** thrown by `continue` when the step needs corrections: HTTP 422, code VALIDATION_FAILED (the draft values were saved before this is thrown) */
export class StepValidationError extends AppError {
  constructor(details: Record<string, unknown>) {
    super('VALIDATION_FAILED', 'This step needs corrections before you can continue', { details });
    (this as { status: number }).status = 422;
  }
}

// ------------------------------------------------------------------------------------------------
// codes
// ------------------------------------------------------------------------------------------------
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const generateDraftCode = (): string => `DRAFT-${Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;

const isDuplicateCode = (e: unknown) => e instanceof AppError && e.code === 'CONFLICT' && e.details?.rule === 'duplicate_product_code';

/** next free `CODE-2`, `CODE-3`... (compares ignoring case, stays within 64 characters) */
export async function nextFreeCode(tx: Tx, vendorId: string, base: string): Promise<string> {
  const like = `${escapeLike(base.toLowerCase())}-%`;
  const rows = await tx.select({ code: P.productCode }).from(P).where(and(eq(P.vendorId, vendorId), isNull(P.deletedAt), sql`lower(${P.productCode}) like ${like}`)).limit(2000);
  const taken = new Set(rows.map((r) => r.code.toLowerCase()));
  for (let n = 2; n < 100_000; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base.slice(0, 50)}-${Date.now()}`;
}

export interface SkuCheck {
  code: string; normalized: string; valid: boolean; reason: string | null; message: string | null; available: boolean;
  conflict: { type: 'product'; id: string; title: string; code: string } | null;
  similar: Array<{ type: 'variant'; sku: string; productId: string }>;
  suggestion: string | null;
}

export async function skuCheck(tx: Tx, vendorId: string, rawCode: string, excludeProductId?: string | null): Promise<SkuCheck> {
  const { code, reason } = checkCode(rawCode);
  if (reason) return { code: rawCode, normalized: code, valid: false, reason, message: CODE_REASON_MESSAGE[reason], available: false, conflict: null, similar: [], suggestion: null };
  const conflict = await svc.findCodeConflict(tx, vendorId, code, excludeProductId);
  const similarRows = await tx
    .select({ sku: V.sku, productId: V.productId })
    .from(V)
    .innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId)))
    .where(and(eq(V.vendorId, vendorId), isNull(V.deletedAt), isNull(P.deletedAt), sql`lower(${V.sku}) = lower(${code})`, excludeProductId ? sql`${V.productId} <> ${excludeProductId}` : undefined))
    .limit(5);
  return {
    code, normalized: code, valid: true, reason: null, message: null, available: conflict === null,
    conflict: conflict ? { type: 'product', id: conflict.id, title: conflict.title, code: conflict.code } : null,
    similar: similarRows.map((r) => ({ type: 'variant' as const, sku: r.sku, productId: r.productId })),
    suggestion: conflict ? await nextFreeCode(tx, vendorId, code) : null,
  };
}

// ------------------------------------------------------------------------------------------------
// the wizard row
// ------------------------------------------------------------------------------------------------
export async function ensureCreationRow(tx: Tx, vendorId: string, p: svc.ProductRow, actorId?: string | null): Promise<CreationRow> {
  const [ins] = await tx
    .insert(PC)
    .values({ vendorId, productId: p.id, codeIsPlaceholder: p.status === 'draft' && isPlaceholderCode(p.productCode), createdBy: uuidOrNull(actorId) })
    .onConflictDoNothing({ target: [PC.vendorId, PC.productId] })
    .returning();
  if (ins) return ins;
  const [row] = await tx.select().from(PC).where(and(eq(PC.vendorId, vendorId), eq(PC.productId, p.id)));
  return row!;
}

async function updateCreation(tx: Tx, vendorId: string, productId: string, set: Partial<typeof PC.$inferInsert>): Promise<void> {
  await tx.update(PC).set({ ...set, version: sql`${PC.version} + 1` as never }).where(and(eq(PC.vendorId, vendorId), eq(PC.productId, productId)));
}

// ------------------------------------------------------------------------------------------------
// the creation DTO
// ------------------------------------------------------------------------------------------------
export async function getCreationDto(tx: Tx, vendorId: string, productId: string, names: NamesFn = (c) => c) {
  return buildCreationDto(tx, vendorId, await svc.getProductRow(tx, vendorId, productId), names);
}

/**
 * The editor view of a product (category name, brand record, primary image state): the `product` of the creation DTO, also used by the edit
 * flow (docs/figma/51-edit-build-brief.md). `st` may be passed when the caller already loaded the saved states.
 */
export async function buildEditorProduct(tx: Tx, vendorId: string, p: svc.ProductRow, st?: SavedStates) {
  st ??= await loadSavedStates(tx, vendorId, [p]);
  const [cat] = p.categoryId ? await tx.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).where(and(eq(schema.categories.id, p.categoryId), eq(schema.categories.vendorId, vendorId))) : [];
  const [brand] = p.brand ? await tx.select().from(B).where(and(eq(B.vendorId, vendorId), eq(B.nameKey, nameKey(p.brand)))) : [];
  const [vc] = await tx.select({ n: sql<number>`count(*)::int` }).from(V).where(and(eq(V.vendorId, vendorId), eq(V.productId, p.id), isNull(V.deletedAt)));
  const image = st.images.get(p.id) ?? { state: 'none' as ImageState, primary: null };
  return {
    ...svc.toProductDto(p, vc?.n ?? 0),
    category: cat ? { id: cat.id, name: cat.name } : null,
    brandRecord: brand ? { id: brand.id, name: brand.name, confirmed: brand.confirmedAt !== null } : null,
    primaryImage: { state: image.state, documentId: image.primary?.id ?? null, url: image.primary ? thumbHref(image.primary.id) : null },
  };
}
export type EditorProduct = Awaited<ReturnType<typeof buildEditorProduct>>;

export async function buildCreationDto(tx: Tx, vendorId: string, p: svc.ProductRow, names: NamesFn) {
  const st = await loadSavedStates(tx, vendorId, [p]);
  const channels = await loadChannels(tx, vendorId, names);
  const readiness = evaluateCreationReadiness(inputFromSaved(p, st, channels));
  const creation = st.creation.get(p.id);
  return {
    product: await buildEditorProduct(tx, vendorId, p, st),
    creation: {
      currentStep: (creation?.currentStep ?? 'basic') as CreationStep,
      completedSteps: (creation?.completedSteps ?? []) as string[],
      savedAt: iso(creation?.savedAt ?? p.updatedAt),
      version: p.version,
      codeIsPlaceholder: creation?.codeIsPlaceholder ?? (p.status === 'draft' && isPlaceholderCode(p.productCode)),
    },
    readiness,
  };
}
export type CreationDto = Awaited<ReturnType<typeof getCreationDto>>;

// ------------------------------------------------------------------------------------------------
// drafts
// ------------------------------------------------------------------------------------------------
export type DraftInput = Omit<svc.ProductInput, 'variants' | 'attributeValues' | 'status' | 'productCode' | 'title'> & { title: string; productCode?: string | null };

export async function createDraft(tx: Tx, vendorId: string, input: DraftInput, fx: Effects, names: NamesFn) {
  const typed = (input.productCode ?? '').trim();
  const generated = typed === '';
  let detail: Awaited<ReturnType<typeof svc.createProduct>> | undefined;
  for (let attempt = 0; attempt < 6 && !detail; attempt++) {
    const code = generated ? generateDraftCode() : typed;
    try {
      detail = await svc.createProduct(tx, vendorId, { ...input, productCode: code, status: 'draft' }, fx, { strict: true, generatedCode: generated });
    } catch (e) {
      if (!(generated && isDuplicateCode(e))) throw e; // a generated code collided (1 in 2.8 trillion): draw another
    }
  }
  if (!detail) throw new AppError('CONFLICT', 'Could not generate a draft code, please retry', { details: { rule: 'draft_code_exhausted' } });
  const row = await svc.getProductRow(tx, vendorId, detail.id);
  await ensureCreationRow(tx, vendorId, row, fx.actorId);
  await fx.audit({ action: 'product.draft_saved', resourceType: 'product', resourceId: row.id, after: { title: row.title, productCode: row.productCode, codeIsPlaceholder: generated }, metadata: { created: true } });
  return buildCreationDto(tx, vendorId, row, names);
}

export type DraftPatchInput = Omit<svc.ProductPatch, 'status' | 'productCode' | 'version'> & { version: number; productCode?: string | null };

export async function patchDraft(tx: Tx, vendorId: string, id: string, input: DraftPatchInput, fx: Effects, names: NamesFn) {
  const p = await svc.getProductRow(tx, vendorId, id);
  if (p.status !== 'draft') throw notADraft(p.status);
  if (input.version !== p.version) throw svc.versionConflict(p.version);
  await ensureCreationRow(tx, vendorId, p, fx.actorId);

  // clearing the master SKU field puts a generated placeholder code back (a draft always has a unique code)
  const { productCode: sentCode, ...rest } = input;
  const patch: svc.ProductPatch = { ...rest, ...(typeof sentCode === 'string' && sentCode.trim() !== '' ? { productCode: sentCode } : {}) };
  const cleared = sentCode !== undefined && (sentCode === null || sentCode.trim() === '');
  let after: svc.ProductRow | undefined;
  for (let attempt = 0; attempt < 6 && !after; attempt++) {
    if (cleared && !isPlaceholderCode(p.productCode)) patch.productCode = generateDraftCode();
    try {
      after = (await svc.applyProductPatch(tx, vendorId, id, patch, fx, { strict: true, auditAction: 'product.draft_saved', generatedCode: cleared && !isPlaceholderCode(p.productCode) })).after;
    } catch (e) {
      if (!(cleared && isDuplicateCode(e))) throw e;
    }
  }
  if (!after) throw new AppError('CONFLICT', 'Could not generate a draft code, please retry', { details: { rule: 'draft_code_exhausted' } });
  await updateCreation(tx, vendorId, id, { savedAt: new Date() });
  return buildCreationDto(tx, vendorId, after, names);
}

export interface DraftListInput { q?: string; sort?: { field: string; direction: 'asc' | 'desc' }; limit: number; offset: number }

export async function listDrafts(tx: Tx, vendorId: string, input: DraftListInput) {
  const like = input.q ? `%${escapeLike(input.q)}%` : null;
  const where = and(eq(P.vendorId, vendorId), isNull(P.deletedAt), eq(P.status, 'draft'), like ? or(ilike(P.title, like), ilike(P.productCode, like)) : undefined);
  const savedAt = sql`coalesce(${PC.savedAt}, ${P.updatedAt})`;
  const dir = (input.sort?.direction ?? 'desc') === 'asc' ? asc : desc;
  const primary: SQL = input.sort?.field === 'title' ? dir(sql`lower(${P.title})`) : input.sort?.field === 'productCode' ? dir(sql`lower(${P.productCode})`) : dir(savedAt);
  const joined = and(eq(PC.vendorId, P.vendorId), eq(PC.productId, P.id));
  const [rows, [total]] = await Promise.all([
    tx.select({ p: P }).from(P).leftJoin(PC, joined).where(where).orderBy(primary, desc(P.id)).limit(input.limit).offset(input.offset),
    tx.select({ n: sql<number>`count(*)::int` }).from(P).where(where),
  ]);
  const products = rows.map((r) => r.p);
  const st = await loadSavedStates(tx, vendorId, products); // batch: one query per kind for the whole page
  const items = products.map((p) => {
    const creation = st.creation.get(p.id);
    const image = st.images.get(p.id);
    return {
      id: p.id, title: p.title, code: p.productCode, codeIsPlaceholder: creation?.codeIsPlaceholder ?? isPlaceholderCode(p.productCode),
      thumbnailUrl: image?.primary ? thumbHref(image.primary.id) : null,
      savedAt: iso(creation?.savedAt ?? p.updatedAt),
      readinessPercent: evaluateCreationReadiness(inputFromSaved(p, st, [])).percent,
      currentStep: (creation?.currentStep ?? 'basic') as CreationStep,
      version: p.version,
    };
  });
  return { items, total: Number(total?.n ?? 0) };
}

/** discard = soft delete of a draft with no stock, listings or order lines */
export async function discardDraft(tx: Tx, vendorId: string, id: string, fx: Effects) {
  const p = await svc.getProductRow(tx, vendorId, id);
  if (p.status !== 'draft') throw notADraft(p.status);
  const res = await tx.execute(sql`
    select
      exists(select 1 from inventory i join product_variants v on v.id = i.variant_id and v.vendor_id = i.vendor_id
             where i.vendor_id = ${vendorId} and v.product_id = ${id}
               and (i.quantity_on_hand > 0 or i.quantity_reserved > 0 or i.quantity_incoming > 0 or i.quantity_damaged > 0 or i.quantity_returned > 0 or i.quantity_quarantined > 0)) as has_stock,
      exists(select 1 from marketplace_listings ml join product_variants v on v.id = ml.variant_id and v.vendor_id = ml.vendor_id
             where ml.vendor_id = ${vendorId} and v.product_id = ${id}) as has_listings,
      exists(select 1 from order_items oi join product_variants v on v.id = oi.variant_id and v.vendor_id = oi.vendor_id
             where oi.vendor_id = ${vendorId} and v.product_id = ${id}) as has_orders`);
  const f = (res.rows as Array<{ has_stock: boolean; has_listings: boolean; has_orders: boolean }>)[0]!;
  if (f.has_stock) throw new AppError('CONFLICT', 'This draft has stock and cannot be discarded', { details: { rule: 'has_stock' } });
  if (f.has_listings) throw new AppError('CONFLICT', 'This draft has marketplace listings and cannot be discarded', { details: { rule: 'has_listings' } });
  if (f.has_orders) throw new AppError('CONFLICT', 'This draft is referenced by orders and cannot be discarded', { details: { rule: 'has_orders' } });
  await svc.deleteProduct(tx, vendorId, id, fx);
  await fx.audit({ action: 'product.draft_discarded', resourceType: 'product', resourceId: id, before: { title: p.title, productCode: p.productCode } });
  await fx.event({ type: 'product.draft_discarded', aggregateType: 'product', aggregateId: id, payload: { productCode: p.productCode, title: p.title } });
}

// ------------------------------------------------------------------------------------------------
// SKU verification
// ------------------------------------------------------------------------------------------------
export async function verifySku(tx: Tx, vendorId: string, productId: string, rawCode: string, fx: Effects) {
  const p = await svc.getProductRow(tx, vendorId, productId);
  const check = await skuCheck(tx, vendorId, rawCode, productId);
  if (!check.valid) throw Errors.validation({ issues: [{ path: 'code', code: check.reason ?? 'invalid_code', message: check.message ?? 'Invalid code' }] });
  if (check.conflict) throw svc.duplicateCodeError(check.code, check.conflict);
  await ensureCreationRow(tx, vendorId, p, fx.actorId);
  await updateCreation(tx, vendorId, productId, { skuVerifiedCode: check.code });
  return { ...check, verified: true as const };
}

// ------------------------------------------------------------------------------------------------
// readiness inputs (saved + unsaved)
// ------------------------------------------------------------------------------------------------
export interface PreviewValues {
  productCode?: string | null; title?: string | null; categoryId?: string | null; productType?: ProductType; brand?: string | null;
  description?: string | null; descriptionHtml?: string | null; customAttributes?: Array<{ name?: string; value?: string }> | null;
}

/** the readiness input of a product (or a brand-new form when `p` is null) with the unsaved `values` laid over it */
export async function buildReadinessInput(tx: Tx, vendorId: string, p: svc.ProductRow | null, v: PreviewValues, names: NamesFn): Promise<ReadinessInput> {
  const st = p ? await loadSavedStates(tx, vendorId, [p]) : null;
  const channels = await loadChannels(tx, vendorId, names);
  const base: ReadinessInput = p && st ? inputFromSaved(p, st, channels) : {
    title: null, categoryId: null, productType: 'physical', code: null, codeIsPlaceholder: false, verifiedCode: null, codeConflict: false, brand: null, brandConfirmed: false,
    descriptionText: null, customAttributeCount: 0, categoryAttributes: { required: 0, filled: 0 }, image: 'none', channels,
  };
  const out: ReadinessInput = { ...base };
  if (v.title !== undefined) out.title = v.title === null ? null : collapseSpaces(v.title);
  if (v.productType !== undefined) out.productType = v.productType;
  if (v.productCode !== undefined) {
    const code = v.productCode === null ? '' : v.productCode.trim();
    out.code = code === '' ? null : code;
    if (out.code !== (p?.productCode ?? null)) {
      out.codeIsPlaceholder = isPlaceholderCode(out.code);
      out.codeConflict = out.code !== null && checkCode(out.code).reason === null && (await svc.findCodeConflict(tx, vendorId, out.code, p?.id)) !== null;
    }
  }
  if (v.brand !== undefined) {
    const brand = v.brand === null ? '' : collapseSpaces(v.brand);
    out.brand = brand === '' ? null : brand;
    out.brandConfirmed = out.brand ? (await brandStates(tx, vendorId, [out.brand])).get(nameKey(out.brand)) === true : false;
  }
  const html = v.descriptionHtml !== undefined ? v.descriptionHtml : undefined;
  const plain = v.description !== undefined ? v.description : undefined;
  if (html !== undefined) out.descriptionText = html === null ? null : sanitizeDescription(html).text || null;
  else if (plain !== undefined) out.descriptionText = plain === null ? null : sanitizeDescription(plain).text || null;
  if (v.customAttributes !== undefined) out.customAttributeCount = (v.customAttributes ?? []).filter((a) => collapseSpaces(a.name ?? '') !== '' && collapseSpaces(a.value ?? '') !== '').length;
  if (v.categoryId !== undefined) {
    out.categoryId = v.categoryId;
    if (v.categoryId !== (p?.categoryId ?? null)) {
      out.categoryAttributes = v.categoryId ? (await categoryAttributeStates(tx, vendorId, [{ key: 'k', productId: p?.id ?? null, categoryId: v.categoryId }])).get('k') ?? { required: 0, filled: 0 } : { required: 0, filled: 0 };
    }
  }
  return out;
}

export async function savedReadiness(tx: Tx, vendorId: string, productId: string, names: NamesFn): Promise<CreationReadiness> {
  const p = await svc.getProductRow(tx, vendorId, productId);
  return evaluateCreationReadiness(await buildReadinessInput(tx, vendorId, p, {}, names));
}

/** the stateless preview: unsaved form values (optionally over a saved product) -> the same readiness the saved product would get */
export async function previewReadiness(tx: Tx, vendorId: string, productId: string | undefined, values: PreviewValues, names: NamesFn): Promise<CreationReadiness> {
  const p = productId ? await svc.getProductRow(tx, vendorId, productId) : null;
  return evaluateCreationReadiness(await buildReadinessInput(tx, vendorId, p, values, names));
}

// ------------------------------------------------------------------------------------------------
// step validation ("Continue checks this step only")
// ------------------------------------------------------------------------------------------------
export type StepValues = Omit<RawFields, 'productCode' | 'title'> & { productCode?: string | null; title?: string };

const toStepIssue = (i: FieldIssue): StepIssue => ({ field: i.field, code: i.code, message: i.message });
const rootField = (field: string) => field.replace(/[.[].*$/, '');

async function categoryExists(tx: Tx, vendorId: string, id: string): Promise<boolean> {
  try { await getCategory(tx, vendorId, id); return true; } catch (e) { if (e instanceof AppError && e.code === 'NOT_FOUND') return false; throw e; }
}

/** the rules of the "basic" step against concrete values; `skip` = fields that already carry an error */
async function basicStepRules(tx: Tx, vendorId: string, productId: string, c: { title: string | null; categoryId: string | null; code: string | null }, skip: Set<string>) {
  const errors: StepIssue[] = [];
  const warnings: StepIssue[] = [];
  let codeAvailable = false;
  if (!skip.has('title')) {
    const t = (c.title ?? '').trim();
    if (t === '') errors.push({ field: 'title', code: 'title_required', message: 'Enter a product name' });
    else if ([...t].length < TITLE_MIN_STEP) errors.push({ field: 'title', code: 'title_too_short', message: `The product name needs at least ${TITLE_MIN_STEP} characters` });
  }
  if (!skip.has('categoryId')) {
    if (!c.categoryId) errors.push({ field: 'categoryId', code: 'category_required', message: 'Select a category' });
    else if (!(await categoryExists(tx, vendorId, c.categoryId))) errors.push({ field: 'categoryId', code: 'category_not_found', message: 'This category no longer exists' });
  }
  if (!skip.has('productCode')) {
    const check = checkCode(c.code);
    if (check.reason === 'empty' || check.reason === 'placeholder') errors.push({ field: 'productCode', code: 'code_required', message: 'Choose a Master SKU: Continue needs a real, unique code' });
    else if (check.reason) errors.push({ field: 'productCode', code: 'invalid_code', message: CODE_REASON_MESSAGE[check.reason] });
    else {
      const sku = await skuCheck(tx, vendorId, check.code, productId);
      if (sku.conflict) errors.push({ field: 'productCode', code: 'duplicate_product_code', message: 'Master SKU already exists. Use a unique SKU to continue.' });
      else {
        codeAvailable = true;
        if (sku.similar.length) warnings.push({ field: 'productCode', code: 'similar_variant_sku', message: `A variant already uses the SKU ${sku.similar[0]!.sku}. A master code can match a variant SKU, but make sure that is intended.` });
      }
    }
  }
  return { errors, warnings, codeAvailable };
}

/** unsaved form values -> field problems (as step errors) + the values that WOULD be saved */
function normalizeOverlay(p: svc.ProductRow, values: StepValues) {
  const { productCode: rawCode, ...rest } = values;
  const codeCleared = rawCode === null || (typeof rawCode === 'string' && rawCode.trim() === '');
  const placeholder = p.status === 'draft' && isPlaceholderCode(p.productCode) ? p.productCode : null;
  const { fields, issues } = normalizeFields(
    { ...(rest as RawFields), ...(rawCode !== undefined && !codeCleared ? { productCode: rawCode as string } : {}) },
    { strict: true, previousAttributes: (p.customAttributes ?? []) as CustomAttribute[], currentPlaceholderCode: placeholder },
  );
  return { fields, issues, codeCleared, codeSent: rawCode !== undefined };
}

export async function validateBasicStep(tx: Tx, vendorId: string, productId: string, values: StepValues | undefined, fx: Effects, names: NamesFn) {
  const p = await svc.getProductRow(tx, vendorId, productId);
  const o = values ? normalizeOverlay(p, values) : { fields: {} as NormalizedFields, issues: [] as FieldIssue[], codeCleared: false, codeSent: false };
  const skip = new Set(o.issues.map((i) => rootField(i.field)));
  const errors = o.issues.map(toStepIssue);
  const title = o.fields.title ?? (values?.title !== undefined ? null : p.title);
  const categoryId = o.fields.categoryId !== undefined ? o.fields.categoryId : p.categoryId;
  const code = o.codeSent ? (o.codeCleared ? null : o.fields.productCode ?? null) : p.productCode;
  const rules = await basicStepRules(tx, vendorId, productId, { title, categoryId, code }, skip);
  errors.push(...rules.errors);
  // the one write of a validation: remember that this code was checked (and is free), so readiness shows it as verified
  let verifiedCode: string | null | undefined;
  if (rules.codeAvailable && code) {
    const row = await ensureCreationRow(tx, vendorId, p, fx.actorId);
    if (row.skuVerifiedCode !== code) await updateCreation(tx, vendorId, productId, { skuVerifiedCode: code });
    verifiedCode = code;
  }
  const overlay: PreviewValues = {
    ...(values?.title !== undefined ? { title: values.title } : {}),
    ...(o.codeSent ? { productCode: o.codeCleared ? null : (values!.productCode as string) } : {}),
    ...(values?.categoryId !== undefined ? { categoryId: values.categoryId } : {}),
    ...(values?.productType !== undefined ? { productType: values.productType } : {}),
    ...(values?.brand !== undefined ? { brand: values.brand } : {}),
    ...(values?.description !== undefined ? { description: values.description } : {}),
    ...(values?.descriptionHtml !== undefined ? { descriptionHtml: values.descriptionHtml } : {}),
    ...(values?.customAttributes !== undefined ? { customAttributes: values.customAttributes } : {}),
  };
  const input = await buildReadinessInput(tx, vendorId, p, overlay, names);
  if (verifiedCode) input.verifiedCode = verifiedCode;
  return { valid: errors.length === 0, errors, warnings: rules.warnings, readiness: evaluateCreationReadiness(input) };
}

export type ContinueResult =
  | { ok: true; dto: CreationDto }
  | { ok: false; errors: StepIssue[]; warnings: StepIssue[]; dto: CreationDto };

/**
 * Applies the form values as a draft save (optimistic version), then validates ONLY the basic step. The values are saved either way: a
 * duplicate code or an invalid field is left out of the save and reported, everything else sticks. Returns instead of throwing on a failed
 * validation so the saved values commit; the route throws StepValidationError (422) after the transaction.
 */
export async function continueBasicStep(tx: Tx, vendorId: string, productId: string, input: { version: number; values?: StepValues }, fx: Effects, names: NamesFn): Promise<ContinueResult> {
  const p = await svc.getProductRow(tx, vendorId, productId);
  if (p.status !== 'draft') throw notADraft(p.status);
  if (input.version !== p.version) throw svc.versionConflict(p.version);
  await ensureCreationRow(tx, vendorId, p, fx.actorId);

  const o = input.values ? normalizeOverlay(p, input.values) : { fields: {} as NormalizedFields, issues: [] as FieldIssue[], codeCleared: false, codeSent: false };
  const errors: StepIssue[] = o.issues.map(toStepIssue);
  const skip = new Set(o.issues.map((i) => rootField(i.field)));
  const fields: NormalizedFields = { ...o.fields };

  if (fields.categoryId && !(await categoryExists(tx, vendorId, fields.categoryId))) {
    errors.push({ field: 'categoryId', code: 'category_not_found', message: 'This category no longer exists' });
    skip.add('categoryId');
    delete fields.categoryId;
  }
  const dropDuplicate = (code: string) => {
    errors.push({ field: 'productCode', code: 'duplicate_product_code', message: 'Master SKU already exists. Use a unique SKU to continue.' });
    skip.add('productCode');
    delete fields.productCode;
    void code;
  };
  if (fields.productCode !== undefined && fields.productCode.toLowerCase() !== p.productCode.toLowerCase() && (await svc.findCodeConflict(tx, vendorId, fields.productCode, p.id))) dropDuplicate(fields.productCode);

  let current = p;
  const write = async () => {
    if (Object.keys(fields).length === 0) return;
    current = (await svc.writeProductFields(tx, vendorId, current, fields, { version: input.version }, fx, { strict: true, auditAction: 'product.draft_saved' })).after;
  };
  try {
    await write();
  } catch (e) {
    if (!(isDuplicateCode(e) && fields.productCode !== undefined)) throw e;
    dropDuplicate(fields.productCode); // lost a race for the code between the check and the write: save the rest
    await write();
  }

  const after = await svc.getProductRow(tx, vendorId, productId);
  const rules = await basicStepRules(tx, vendorId, productId, { title: after.title, categoryId: after.categoryId, code: after.productCode }, skip);
  errors.push(...rules.errors);

  const row = await ensureCreationRow(tx, vendorId, after, fx.actorId);
  const done = (row.completedSteps ?? []) as string[];
  if (errors.length === 0) {
    await updateCreation(tx, vendorId, productId, { completedSteps: [...new Set([...done, 'basic'])], currentStep: 'variants', skuVerifiedCode: after.productCode, savedAt: new Date(), codeIsPlaceholder: false });
    await fx.audit({ action: 'product.creation_step_completed', resourceType: 'product', resourceId: productId, after: { step: 'basic', nextStep: 'variants' } });
    return { ok: true, dto: await buildCreationDto(tx, vendorId, after, names) };
  }
  await updateCreation(tx, vendorId, productId, { completedSteps: done.filter((s) => s !== 'basic'), currentStep: 'basic', savedAt: new Date() });
  return { ok: false, errors, warnings: rules.warnings, dto: await buildCreationDto(tx, vendorId, after, names) };
}
