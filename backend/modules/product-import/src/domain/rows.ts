import { eanProblem, normalizeFields, skuProblem, type CatalogRules, type RawFields } from '@oms/mod-catalog';
import { ISSUE_INFO, type DuplicateStrategy, type ExistingInfo, type IssueCode, type Suggestion } from './catalogue';
import type { CategoryIndex } from './category-index';
import {
  BARCODE_PATTERN, SKU_PATTERN, cleanBarcode, formatMoney, imageUrlProblem, parseCount, parseGrams, parseMoney, parsePercentBps, sanitizeSku, splitList,
} from './normalise';
import type { ImportSettings } from './settings';

/** target field -> trimmed text of the row (mapped columns first, then the seller's fixes on top) */
export type RowValues = Record<string, string>;

export function rowValues(raw: Record<string, string>, mapping: Record<string, string | null>, fixes: Record<string, string>): RowValues {
  const v: RowValues = {};
  for (const [target, source] of Object.entries(mapping)) if (source) v[target] = (raw[source] ?? '').trim();
  for (const [target, value] of Object.entries(fixes)) v[target] = value.trim();
  return v;
}

/** fields that belong to the product, not to one variant: a later row of the same product code inherits them when blank */
const PRODUCT_FIELDS = ['title', 'description', 'brand', 'manufacturer', 'countryOfOrigin', 'tags', 'category', 'hsn', 'gstRate'] as const;

/** every proposal says how sure it is: exact/fuzzy category matches by score, mechanical clean-ups high, defaults low */
function withConfidence(code: IssueCode, s: Suggestion): Suggestion {
  if (s.confidence) return s;
  const set = (confidence: 'high' | 'medium' | 'low', confidenceReason: string): Suggestion => ({ ...s, confidence, confidenceReason });
  switch (code) {
    case 'invalid_sku': return set('high', 'Only the unsupported characters were replaced; the rest of the SKU is kept');
    case 'missing_sku': return set('medium', 'Generated from the product code or title plus the row number');
    case 'duplicate_sku': return set('medium', 'The next SKU suffix that is free in the file and in your catalogue');
    case 'invalid_image': return set('high', 'Importing without the image never blocks the product; you can add one later');
    case 'duplicate_barcode': case 'invalid_barcode': return set('medium', 'Leaving the barcode empty avoids the clash; add the right one later');
    case 'stock_invalid': return set('low', 'A default of 0; the real quantity is unknown');
    case 'pricing_invalid': return set('medium', 'The lowest MRP that keeps the selling price valid');
    default: return set('medium', 'Suggested by the importer');
  }
}

const isImageOnly =(v: RowValues): boolean => Boolean(v.productCode && !v.sku && !v.title && !v.sellingPrice && v.imageUrl);

export interface GroupInfo { firstRow: number; values: RowValues; extraImages: string[] }
export interface FileIndex {
  skuFirst: Map<string, number>;
  barcodeFirst: Map<string, number>;
  groups: Map<string, GroupInfo>;
}

/** First pass over the whole file: which row first uses each SKU / barcode, and the product-level values of each product code. */
export function buildFileIndex(rows: Iterable<{ rowNumber: number; values: RowValues; ignored: boolean }>): FileIndex {
  const idx: FileIndex = { skuFirst: new Map(), barcodeFirst: new Map(), groups: new Map() };
  for (const { rowNumber, values: v, ignored } of rows) {
    if (ignored) continue;
    const code = v.productCode?.toLowerCase();
    if (isImageOnly(v)) {
      const g = idx.groups.get(code!) ?? { firstRow: Number.MAX_SAFE_INTEGER, values: {}, extraImages: [] };
      if (!imageUrlProblem(v.imageUrl!)) g.extraImages.push(v.imageUrl!);
      idx.groups.set(code!, g);
      continue;
    }
    if (v.sku && !idx.skuFirst.has(v.sku.toLowerCase())) idx.skuFirst.set(v.sku.toLowerCase(), rowNumber);
    const barcode = v.barcode ? cleanBarcode(v.barcode) : '';
    if (barcode && !idx.barcodeFirst.has(barcode)) idx.barcodeFirst.set(barcode, rowNumber);
    if (!code) continue;
    const g = idx.groups.get(code);
    if (!g || g.firstRow === Number.MAX_SAFE_INTEGER) {
      const base = g ?? { firstRow: rowNumber, values: {}, extraImages: [] };
      base.firstRow = rowNumber;
      for (const f of PRODUCT_FIELDS) base.values[f] = v[f] ?? '';
      idx.groups.set(code, base);
    } else for (const f of PRODUCT_FIELDS) if (!g.values[f] && v[f]) g.values[f] = v[f]!;
  }
  return idx;
}

export interface CatalogLookup {
  variantBySku: Map<string, { id: string; productId: string; productCode: string; barcode: string | null; sku?: string; title?: string | null; sellingPriceMinor?: number | null }>;
  productByCode: Map<string, { id: string }>;
  barcodeOwner: Map<string, { variantId: string; sku: string }>;
}

export type Plan = 'create' | 'add_variant' | 'update';

export interface RowData {
  sku?: string; productCode?: string; title?: string; description?: string | null; brand?: string | null; manufacturer?: string | null; countryOfOrigin?: string | null;
  hsnCode?: string | null; gstRateBps?: number | null; tags?: string[]; categoryId?: string | null; categoryLabel?: string | null;
  sellingPriceMinor?: number; mrpMinor?: number | null; costPriceMinor?: number | null; stock?: number | null; barcode?: string | null; weightGrams?: number | null;
  optionValues?: Record<string, string>; imageUrl?: string | null; additionalImageUrls?: string[];
}

export interface DraftIssue { code: IssueCode; severity: 'error' | 'warning'; field: string | null; message: string; value: string | null; suggestion: Suggestion | null }

export interface Derived {
  data: RowData;
  status: 'valid' | 'warning' | 'error' | 'skipped';
  issues: DraftIssue[];
  plan: Plan | null;
  /** why the row is not imported although it is fine (existing product, extra image row) */
  skipReason: string | null;
  /** the row becomes a new product although its SKU exists (generated SKU suffix at commit time) */
  createNew: boolean;
}

/** what the seller decided for a duplicate SKU of this row */
export type DuplicateDecision = 'use_existing' | 'create_new';

export interface DeriveContext {
  settings: ImportSettings;
  mapping: Record<string, string | null>;
  categories: CategoryIndex;
  index: FileIndex;
  lookup: CatalogLookup;
  /** the SKU / EAN rules saved in Settings: a row that breaks one is a WARNING (the file is never rejected for it) */
  catalogRules?: CatalogRules | null;
}

const SKIP_BY_STRATEGY = (strategy: DuplicateStrategy, existsVariant: boolean, existsProduct: boolean): { plan: Plan | null; skip: string | null } => {
  if (strategy === 'ask') return { plan: existsVariant ? 'update' : existsProduct ? 'add_variant' : 'create', skip: null }; // existing SKUs are raised as issues by the caller
  if (strategy === 'create_new') return { plan: existsProduct ? 'add_variant' : 'create', skip: null }; // existing SKUs are handled by the caller
  if (strategy === 'skip') return existsVariant || existsProduct ? { plan: null, skip: existsVariant ? 'SKU already in the catalogue' : 'Product code already in the catalogue' } : { plan: 'create', skip: null };
  if (strategy === 'create_variant_for_new_sku') return existsVariant ? { plan: null, skip: 'SKU already in the catalogue' } : { plan: existsProduct ? 'add_variant' : 'create', skip: null };
  return { plan: existsVariant ? 'update' : existsProduct ? 'add_variant' : 'create', skip: null };
};

/** Normalise one row and collect its issues. Pure: everything it needs about the file and the catalogue comes through `ctx`. */
export function deriveRow(rowNumber: number, input: RowValues, ctx: DeriveContext, opts: { decision?: DuplicateDecision } = {}): Derived {
  const { settings, index, lookup } = ctx;
  const v: RowValues = { ...input };
  const issues: DraftIssue[] = [];
  const add = (code: IssueCode, field: string | null, message: string, value: string | null, suggestion: Suggestion | null = null, severity?: 'error' | 'warning') => {
    const base = ISSUE_INFO[code].severity;
    issues.push({ code, severity: severity ?? (base === 'warning' ? 'warning' : 'error'), field, message, value: value === '' ? null : value, suggestion: suggestion ? withConfidence(code, suggestion) : null });
  };
  const data: RowData = {};

  if (isImageOnly(v)) return { data: { productCode: v.productCode, imageUrl: settings.includeImages ? v.imageUrl : undefined }, status: 'skipped', issues, plan: null, skipReason: 'Extra image row: the image is attached to the product above it', createNew: false };

  // import toggles: ignored columns behave as if they were not in the file
  if (!settings.includeImages) { delete v.imageUrl; delete v.additionalImageUrls; }
  if (!settings.includeQuantities) delete v.stock;
  if (!settings.matchVariants) delete v.productCode; // every row is its own product (code = SKU)

  const group = v.productCode ? index.groups.get(v.productCode.toLowerCase()) : undefined;
  if (group && group.firstRow !== rowNumber) for (const f of PRODUCT_FIELDS) if (!v[f]) v[f] = group.values[f] ?? '';

  // ---- identity
  const sku = v.sku ?? '';
  const uniqueSku = (base: string): string => {
    for (let n = 2; n < 1000; n++) {
      const candidate = `${base.slice(0, 58)}-${n}`;
      if (!index.skuFirst.has(candidate.toLowerCase()) && !lookup.variantBySku.has(candidate.toLowerCase())) return candidate;
    }
    return `${base.slice(0, 50)}-${rowNumber}`;
  };
  if (sku === '') {
    const words = (v.title ?? '').split(/[^A-Za-z0-9]+/).filter(Boolean).slice(0, 3).map((w) => w.slice(0, 3).toUpperCase()).join('-');
    const base = sanitizeSku(v.productCode || words || 'ITEM').toUpperCase();
    const proposal = sanitizeSku(`${base}-${rowNumber}`);
    add('missing_sku', 'sku', `Row ${rowNumber} has no SKU. A unique SKU is required.`, null, { kind: 'set_value', field: 'sku', value: proposal, label: proposal });
  } else if (!SKU_PATTERN.test(sku) || sku.length > 64) {
    const fixed = sanitizeSku(sku);
    add('invalid_sku', 'sku', 'A SKU may contain letters, digits and . _ - / only (at most 64 characters).', sku, fixed ? { kind: 'set_value', field: 'sku', value: fixed, label: fixed } : null);
  } else {
    data.sku = sku;
    const ruleProblem = ctx.catalogRules ? skuProblem(sku, ctx.catalogRules) : null;
    if (ruleProblem) add('invalid_sku', 'sku', ruleProblem, sku, null, 'warning');
    const first = index.skuFirst.get(sku.toLowerCase());
    if (first !== undefined && first !== rowNumber) {
      const next = uniqueSku(sku);
      add('duplicate_sku', 'sku', `SKU ${sku} is already used by row ${first} of this file.`, sku, { kind: 'set_value', field: 'sku', value: next, label: next });
    }
  }

  const explicitCode = v.productCode ?? '';
  const productCode = explicitCode || data.sku || '';
  if (productCode) data.productCode = productCode;

  // ---- what happens to an SKU / product that is already in the catalogue
  let plan: Plan | null = 'create';
  let createNew = false;
  if (data.sku || productCode) {
    const existing = data.sku ? lookup.variantBySku.get(data.sku.toLowerCase()) : undefined;
    const existingProduct = settings.matchVariants && productCode ? lookup.productByCode.get(productCode.toLowerCase()) : undefined;
    const existingInfo: ExistingInfo | undefined = existing ? {
      id: existing.productId, productId: existing.productId, variantId: existing.id, productCode: existing.productCode, sku: existing.sku ?? data.sku!, title: existing.title ?? null,
      price: existing.sellingPriceMinor === null || existing.sellingPriceMinor === undefined ? null : Number(formatMoney(existing.sellingPriceMinor, 'rupees')), barcode: existing.barcode,
    } : undefined;
    const duplicateFix = (): Suggestion => {
      const next = uniqueSku(data.sku!);
      return { kind: 'set_value', field: 'sku', value: next, label: `Create a new product as ${next}`, existing: existingInfo };
    };
    if (existing && opts.decision === 'use_existing') plan = 'update'; // the seller chose for this row; it beats the global strategy
    else if (existing && (opts.decision === 'create_new' || settings.duplicateStrategy === 'create_new')) { plan = 'create'; createNew = true; }
    else if (existing && settings.duplicateStrategy === 'ask') {
      plan = 'update';
      add('duplicate_sku', 'sku', `SKU ${sku} already exists in your catalogue${existing.title ? ` (${existing.title})` : ''}. Update the existing product or create a new one?`, sku, duplicateFix());
    } else {
      const decided = SKIP_BY_STRATEGY(settings.duplicateStrategy, existing !== undefined, existingProduct !== undefined);
      if (decided.skip) return { data, status: 'skipped', issues: [], plan: null, skipReason: decided.skip, createNew: false };
      plan = decided.plan;
      if (existing && explicitCode && existing.productCode.toLowerCase() !== explicitCode.toLowerCase()) {
        add('duplicate_sku', 'sku', `SKU ${sku} already belongs to product ${existing.productCode}, not ${explicitCode}.`, sku, duplicateFix());
      }
    }
  }

  // ---- product fields through the catalogue's own rules
  const gst = v.gstRate ? parsePercentBps(v.gstRate) : null;
  if (gst && !gst.ok) add('invalid_field', 'gstRate', gst.reason, v.gstRate ?? null);
  const raw: RawFields = {};
  if (v.title) raw.title = v.title; else add('missing_title', 'title', `Row ${rowNumber} has no product title.`, null);
  if (productCode) raw.productCode = productCode;
  if (v.description) raw.description = v.description;
  if (v.brand) raw.brand = v.brand;
  if (v.manufacturer) raw.manufacturer = v.manufacturer;
  if (v.countryOfOrigin) raw.countryOfOrigin = v.countryOfOrigin;
  if (v.hsn) raw.hsnCode = v.hsn;
  if (gst?.ok) raw.gstRateBps = gst.value;
  const tags = v.tags ? splitList(v.tags, /[|,;]/).slice(0, 30).map((t) => t.slice(0, 60)) : [];
  const { fields, issues: fieldIssues } = normalizeFields(raw, { strict: false });
  const targetOf: Record<string, string> = { hsnCode: 'hsn', gstRateBps: 'gstRate' };
  for (const fi of fieldIssues) {
    if (fi.field === 'title') add('invalid_field', 'title', fi.message, v.title ?? null);
    else add('invalid_field', targetOf[fi.field] ?? fi.field, fi.message, (v[targetOf[fi.field] ?? fi.field] ?? null) as string | null);
  }
  Object.assign(data, {
    title: fields.title, description: fields.description ?? null, brand: fields.brand ?? null, manufacturer: fields.manufacturer ?? null,
    countryOfOrigin: fields.countryOfOrigin ?? null, hsnCode: fields.hsnCode ?? null, gstRateBps: fields.gstRateBps ?? null, tags,
  });

  // ---- category
  const categoryText = v.category ?? '';
  if (categoryText) {
    const found = ctx.categories.resolve(categoryText);
    if (found) { data.categoryId = found.id; data.categoryLabel = found.label; }
    else {
      const near = ctx.categories.closest(categoryText);
      const fallback = settings.defaultCategoryId;
      add('category_unmapped', 'category', `"${categoryText}" does not match any of your categories${fallback ? '; the default category will be used' : ''}.`, categoryText,
        near ? (() => {
          const score = near.score ?? 0.5;
          const pct = Math.round(score * 100);
          return { kind: 'map_category' as const, field: 'category', value: near.id, label: near.label, confidence: score >= 0.85 ? 'high' as const : score >= 0.65 ? 'medium' as const : 'low' as const, confidenceReason: `${pct}% name match with "${near.label}" (fuzzy, not exact)` };
        })() : null);
      if (fallback) { data.categoryId = fallback; data.categoryLabel = ctx.categories.label(fallback); }
    }
  } else if (settings.defaultCategoryId) { data.categoryId = settings.defaultCategoryId; data.categoryLabel = ctx.categories.label(settings.defaultCategoryId); }

  // ---- prices
  const unit = settings.currencyUnit;
  const selling = v.sellingPrice ? parseMoney(v.sellingPrice, unit) : null;
  if (!selling) add('pricing_invalid', 'sellingPrice', 'The selling price is missing.', null, null, 'error');
  else if (!selling.ok) add('pricing_invalid', 'sellingPrice', selling.reason, v.sellingPrice ?? null, null, 'error');
  else if (selling.value <= 0) add('pricing_invalid', 'sellingPrice', 'The selling price must be greater than zero.', v.sellingPrice ?? null, null, 'error');
  else data.sellingPriceMinor = selling.value;
  const mrp = v.mrp ? parseMoney(v.mrp, unit) : null;
  if (mrp && !mrp.ok) add('pricing_invalid', 'mrp', mrp.reason, v.mrp ?? null, null, 'error');
  else if (mrp?.ok) {
    data.mrpMinor = mrp.value;
    if (data.sellingPriceMinor !== undefined && data.sellingPriceMinor > mrp.value) {
      add('pricing_invalid', 'mrp', `The selling price (${formatMoney(data.sellingPriceMinor, unit)}) is higher than the MRP (${formatMoney(mrp.value, unit)}).`, v.mrp ?? null,
        { kind: 'set_value', field: 'mrp', value: formatMoney(data.sellingPriceMinor, unit), label: `Set the MRP to ${formatMoney(data.sellingPriceMinor, unit)}` }, 'error');
    }
  }
  const cost = v.costPrice ? parseMoney(v.costPrice, unit) : null;
  if (cost && !cost.ok) add('pricing_invalid', 'costPrice', cost.reason, v.costPrice ?? null, null, 'error');
  else if (cost?.ok) {
    data.costPriceMinor = cost.value;
    if (data.sellingPriceMinor !== undefined && cost.value > data.sellingPriceMinor) add('pricing_invalid', 'costPrice', 'The cost price is higher than the selling price: every sale makes a loss.', v.costPrice ?? null, null, 'warning');
  }

  // ---- stock
  if (v.stock) {
    const stock = parseCount(v.stock);
    if (!stock.ok) add('stock_invalid', 'stock', `${stock.reason}. Stock must be zero or a positive whole number.`, v.stock, { kind: 'set_value', field: 'stock', value: '0', label: 'Set the stock to 0' }, 'error');
    else if (stock.value > 10_000_000) add('stock_invalid', 'stock', 'The stock quantity is above 10,000,000 units.', v.stock, null, 'error');
    else {
      data.stock = stock.value;
      if (stock.value > 100_000) add('stock_invalid', 'stock', `${stock.value.toLocaleString('en-US')} units is unusually high; check the column.`, v.stock, null, 'warning');
    }
  }

  // ---- barcode
  const barcode = v.barcode ? cleanBarcode(v.barcode) : '';
  if (barcode) {
    const clear: Suggestion = { kind: 'set_value', field: 'barcode', value: '', label: 'Leave the barcode empty' };
    const first = index.barcodeFirst.get(barcode);
    const owner = lookup.barcodeOwner.get(barcode);
    const ownVariant = data.sku && !createNew ? lookup.variantBySku.get(data.sku.toLowerCase()) : undefined;
    if (!BARCODE_PATTERN.test(barcode)) add('invalid_barcode', 'barcode', 'A barcode has 6 to 32 letters, digits or dashes.', barcode, clear, 'error');
    else if (first !== undefined && first !== rowNumber) add('duplicate_barcode', 'barcode', `Barcode ${barcode} is already used by row ${first} of this file.`, barcode, clear);
    else if (owner && owner.variantId !== ownVariant?.id) add('duplicate_barcode', 'barcode', `Barcode ${barcode} already belongs to SKU ${owner.sku} in your catalogue.`, barcode, clear);
    else {
      data.barcode = barcode;
      const eanIssue = ctx.catalogRules ? eanProblem(barcode, ctx.catalogRules) : null;
      if (eanIssue) add('invalid_barcode', 'barcode', eanIssue, barcode, null, 'warning');
    }
  }

  // ---- weight and options
  if (v.weight) {
    const w = parseGrams(v.weight);
    if (w.ok) data.weightGrams = w.value; else add('invalid_field', 'weight', w.reason, v.weight);
  }
  const options: Record<string, string> = {};
  for (const n of [1, 2, 3]) {
    const value = v[`option${n}Value`];
    if (!value) continue;
    const name = v[`option${n}Name`] || ctx.mapping[`option${n}Value`] || `Option ${n}`;
    if (name.toLowerCase() === 'title' && value.toLowerCase() === 'default title') continue; // Shopify's marker for "no variants"
    options[name.slice(0, 40)] = value.slice(0, 80);
  }
  data.optionValues = options;

  // ---- images (syntax only, never fetched)
  if (v.imageUrl) {
    const problem = imageUrlProblem(v.imageUrl);
    if (problem) add('invalid_image', 'imageUrl', `${problem}.`, v.imageUrl, { kind: 'set_value', field: 'imageUrl', value: '', label: 'Import without this image' });
    else data.imageUrl = v.imageUrl;
  }
  const extras = [...splitList(v.additionalImageUrls ?? '', /[|\s]+/), ...(group && group.firstRow === rowNumber ? group.extraImages : [])];
  const goodExtras = [...new Set(extras.filter((u) => !imageUrlProblem(u)))];
  const badExtra = extras.find((u) => imageUrlProblem(u));
  if (badExtra) add('invalid_image', 'additionalImageUrls', `${imageUrlProblem(badExtra)}.`, badExtra, { kind: 'set_value', field: 'additionalImageUrls', value: goodExtras.join('|'), label: 'Drop the invalid image URLs' });
  data.additionalImageUrls = goodExtras;

  const status = issues.some((i) => i.severity === 'error') ? 'error' : issues.length ? 'warning' : 'valid';
  return { data, status, issues, plan, skipReason: null, createNew };
}
