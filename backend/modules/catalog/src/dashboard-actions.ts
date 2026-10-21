import { and, eq, inArray, isNull, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { getProductAttributeValues, setProductAttributeValues } from '@oms/mod-attributes';
import type { Effects } from './effects';
import { evaluateReadiness } from './readiness';
import * as svc from './service';

const P = schema.products;
const V = schema.productVariants;

const withSuffix = (base: string, suffix: string, max: number) => `${base.slice(0, Math.max(1, max - suffix.length))}${suffix}`;
const copySuffix = (n: number) => (n === 1 ? '-COPY' : `-COPY-${n}`);

/**
 * Copies the master product and its variants as a DRAFT. The product code and every SKU get `-COPY` (then `-COPY-2`, `-COPY-3`...
 * when taken, the same suffix for the whole copy). Barcodes are not copied (unique per vendor). Stock, listings and documents are not copied.
 */
export async function duplicateProduct(tx: Tx, vendorId: string, id: string, fx: Effects) {
  const p = await svc.getProductRow(tx, vendorId, id);
  const variants = await tx.select().from(V).where(and(eq(V.vendorId, vendorId), eq(V.productId, id), isNull(V.deletedAt))).orderBy(V.createdAt, V.id);

  let suffix = copySuffix(1);
  for (let n = 1; n <= 500; n++) {
    suffix = copySuffix(n);
    const code = withSuffix(p.productCode, suffix, 64);
    const skus = variants.map((v) => withSuffix(v.sku, suffix, 64));
    const [codeTaken] = await tx.select({ id: P.id }).from(P).where(and(eq(P.vendorId, vendorId), isNull(P.deletedAt), eq(P.productCode, code))).limit(1);
    const skuTaken = skus.length ? await tx.select({ id: V.id }).from(V).where(and(eq(V.vendorId, vendorId), isNull(V.deletedAt), inArray(V.sku, skus))).limit(1) : [];
    if (!codeTaken && skuTaken.length === 0) break;
    if (n === 500) throw new AppError('CONFLICT', 'Could not find a free product code for the copy', { details: { rule: 'copy_code_exhausted' } });
  }
  const skuMap = new Map(variants.map((v) => [v.id, withSuffix(v.sku, suffix, 64)]));
  const dto = svc.toProductDto(p);
  const created = await svc.createProduct(tx, vendorId, {
    productCode: withSuffix(p.productCode, suffix, 64),
    title: p.title.length > 192 ? p.title : `${p.title} (copy)`,
    description: p.description, descriptionHtml: p.descriptionHtml, brand: p.brand, manufacturer: p.manufacturer, countryOfOrigin: p.countryOfOrigin, categoryId: p.categoryId,
    hsnCode: p.hsnCode, gstRateBps: p.gstRateBps, tags: p.tags, productType: dto.productType,
    material: p.material, standardCategory: p.standardCategory, customAttributes: dto.customAttributes,
    dimensions: dto.dimensionsMm ? { ...dto.dimensionsMm, unit: 'mm' } : null, weight: p.weightGrams != null ? { value: p.weightGrams, unit: 'g' } : null,
    variants: variants.map((v) => ({
      sku: skuMap.get(v.id)!, barcode: null, optionValues: v.optionValues, currency: v.currency.trim(), mrpMinor: v.mrpMinor, sellingPriceMinor: v.sellingPriceMinor, costPriceMinor: v.costPriceMinor,
      taxRateBps: v.taxRateBps, weightGrams: v.weightGrams, dimensionsMm: v.dimensionsMm ? { length: v.dimensionsMm.l, width: v.dimensionsMm.w, height: v.dimensionsMm.h } : null, status: v.status as 'active' | 'inactive',
    })),
  }, fx);

  // lead times and attribute values travel with the copy
  const newBySku = new Map(created.variants.map((v) => [v.sku, v.id]));
  for (const v of variants) if (v.leadTimeDays !== null) await tx.update(V).set({ leadTimeDays: v.leadTimeDays }).where(eq(V.id, newBySku.get(skuMap.get(v.id)!)!));
  const values = (await getProductAttributeValues(tx, vendorId, id)).filter((a) => a.value !== null);
  const copied = values.flatMap((a) => {
    if (!a.variantId) return [{ attributeId: a.attributeId, value: a.value }];
    const newVariant = newBySku.get(skuMap.get(a.variantId) ?? '');
    return newVariant ? [{ attributeId: a.attributeId, variantId: newVariant, value: a.value }] : [];
  });
  if (copied.length) await setProductAttributeValues(tx, vendorId, created.id, copied);
  await fx.audit({ action: 'product.duplicate', resourceType: 'product', resourceId: created.id, metadata: { sourceProductId: id, variants: variants.length } });
  return svc.getProductDetail(tx, vendorId, created.id);
}

// ------------------------------------------------------------------------------------------------
// bulk product actions
// ------------------------------------------------------------------------------------------------
export type ProductBulkAction = 'archive' | 'unarchive' | 'duplicate' | 'check_publish_readiness';

export async function bulkProductAction(tx: Tx, vendorId: string, ids: string[], action: ProductBulkAction, fxFor: (inner: Tx) => Effects) {
  const extras = new Map<number, Record<string, unknown>>();
  const res = await svc.runBulk(tx, ids, async (inner, id, index) => {
    const fx = fxFor(inner);
    if (action === 'archive') {
      const p = await svc.getProductRow(inner, vendorId, id);
      if (p.status === 'archived') throw new AppError('CONFLICT', 'Product is already archived', { details: { rule: 'already_archived' } });
      await svc.updateProduct(inner, vendorId, id, { status: 'archived' }, fx);
    } else if (action === 'unarchive') {
      const p = await svc.getProductRow(inner, vendorId, id);
      if (p.status !== 'archived') throw new AppError('CONFLICT', 'Product is not archived', { details: { rule: 'not_archived' } });
      await svc.updateProduct(inner, vendorId, id, { status: 'draft' }, fx);
      extras.set(index, { status: 'draft' });
    } else if (action === 'duplicate') {
      const copy = await duplicateProduct(inner, vendorId, id, fx);
      extras.set(index, { newProductId: copy.id, newProductCode: copy.productCode });
    } else {
      // publishing itself stays in /listings: this only answers "can it be published, and what is missing"
      const r = await evaluateReadiness(inner, vendorId, id);
      extras.set(index, {
        canPublish: r.ready,
        missing: r.checks.filter((c) => !c.ok && c.severity === 'error').map((c) => ({ code: c.code, message: c.message })),
        warnings: r.checks.filter((c) => !c.ok && c.severity === 'warning').map((c) => ({ code: c.code, message: c.message })),
      });
    }
    return id;
  });
  const results = res.map((r) => ({ ...r, productId: ids[r.index]!, ...(extras.get(r.index) ?? {}) })) as Array<(typeof res)[number] & { productId: string; canPublish?: boolean; [k: string]: unknown }>;
  const failed = results.filter((r) => !r.ok).length;
  const canPublish = action === 'check_publish_readiness' ? results.filter((r) => r.ok && r.canPublish === true).length : undefined;
  return { action, summary: { total: results.length, succeeded: results.length - failed, failed, ...(canPublish !== undefined ? { canPublish } : {}) }, results };
}

// ------------------------------------------------------------------------------------------------
// variants: bulk lifecycle + lead time
// ------------------------------------------------------------------------------------------------
export type VariantBulkAction = 'archive' | 'activate' | 'delete';

export async function bulkVariantAction(tx: Tx, vendorId: string, productId: string, ids: string[], action: VariantBulkAction, fxFor: (inner: Tx) => Effects) {
  await svc.getProductRow(tx, vendorId, productId);
  const res = await svc.runBulk(tx, ids, async (inner, id) => {
    const fx = fxFor(inner);
    const v = await svc.getVariantRow(inner, vendorId, id);
    if (v.productId !== productId) throw Errors.notFound('Variant', id);
    if (action === 'delete') { await svc.deleteVariant(inner, vendorId, id, fx); return id; }
    if (action === 'activate') {
      if (v.status !== 'active') await svc.updateVariant(inner, vendorId, id, { status: 'active' }, fx);
      return id;
    }
    if (v.status === 'inactive') return id;
    const p = await svc.getProductRow(inner, vendorId, productId);
    if (p.status === 'active') {
      const [other] = await inner.select({ id: V.id }).from(V).where(and(eq(V.vendorId, vendorId), eq(V.productId, productId), isNull(V.deletedAt), eq(V.status, 'active'), sql`${V.id} <> ${id}`)).limit(1);
      if (!other) throw new AppError('CONFLICT', 'An active product needs at least one active variant; archive the product instead', { details: { rule: 'needs_variant' } });
    }
    await svc.updateVariant(inner, vendorId, id, { status: 'inactive' }, fx);
    return id;
  });
  const failed = res.filter((r) => !r.ok).length;
  await fxFor(tx).audit({ action: `variant.bulk_${action}`, resourceType: 'product', resourceId: productId, metadata: { total: res.length, failed } });
  return { action, summary: { total: res.length, succeeded: res.length - failed, failed }, results: res };
}

export async function setLeadTime(tx: Tx, vendorId: string, id: string, leadTimeDays: number | null, fx: Effects) {
  const before = await svc.getVariantRow(tx, vendorId, id);
  const [after] = await tx.update(V).set({ leadTimeDays, version: sql`${V.version} + 1` as never }).where(and(eq(V.id, id), eq(V.vendorId, vendorId))).returning();
  await fx.event({ type: 'variant.updated', aggregateType: 'variant', aggregateId: id, payload: { productId: before.productId, sku: before.sku, fields: ['leadTimeDays'] } });
  await fx.audit({ action: 'variant.lead_time_set', resourceType: 'variant', resourceId: id, before: { sku: before.sku, leadTimeDays: before.leadTimeDays }, after: { sku: before.sku, leadTimeDays: after!.leadTimeDays } });
  return { variantId: id, productId: before.productId, sku: before.sku, leadTimeDays: after!.leadTimeDays, version: after!.version };
}
