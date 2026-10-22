import { and, eq, isNull, ne, schema, withVendor } from '@oms/database';
import type { ListingRequirement } from '@oms/marketplace-core';
import type { Ctx } from './ctx';
import { evaluate } from './service';

const L = schema.marketplaceListings;
const V = schema.productVariants;
const P = schema.products;
const A = schema.marketplaceAccounts;
const PMD = schema.productMarketplaceData;

type Scalar = string | number | boolean;

export type SuggestionSource = 'product_attribute' | 'variant_option' | 'master_field' | 'other_listing' | 'other_channel' | 'keyword_match' | 'brand_default' | 'category_default';
export interface Candidate { value: Scalar; confidence: number; source: SuggestionSource; reason: string }
export interface FixSuggestion {
  key: string; kind: 'attribute' | 'brand'; field: string; label: string; severity: 'fail' | 'warn';
  value: Scalar; confidence: number; confidenceLevel: 'high' | 'medium' | 'low'; source: SuggestionSource; reason: string;
  alternatives: Candidate[];
  /** the body of PATCH /listings/{id} that applies it (nothing is saved by the suggestion itself) */
  apply: { attributeOverrides?: Record<string, Scalar>; brand?: string };
}
export interface Unresolved { key: string; label: string; reason: string }

// ------------------------------------------------------------------------------------------------
// pure helpers (unit-testable): normalising, matching against the allowed values, keyword vocabularies
// ------------------------------------------------------------------------------------------------
export const norm = (s: string): string => s.toLowerCase().replace(/colour/g, 'color').replace(/[^a-z0-9]/g, '');
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containsWord = (text: string, word: string): boolean => new RegExp(`(^|[^a-z0-9])${escapeRe(word.toLowerCase())}([^a-z0-9]|$)`).test(text.toLowerCase());

export const levelOf = (confidence: number): 'high' | 'medium' | 'low' => (confidence >= 0.8 ? 'high' : confidence >= 0.55 ? 'medium' : 'low');

const COLORS = ['black', 'white', 'blue', 'navy', 'red', 'green', 'yellow', 'orange', 'pink', 'purple', 'brown', 'grey', 'gray', 'beige', 'cream', 'maroon', 'olive', 'khaki', 'teal', 'turquoise', 'silver', 'gold', 'multicolor', 'tan', 'mustard', 'peach', 'lavender', 'charcoal'];
const MATERIALS = ['cotton', 'polyester', 'linen', 'silk', 'wool', 'denim', 'leather', 'nylon', 'viscose', 'rayon', 'canvas', 'satin', 'velvet', 'fleece', 'jersey', 'chiffon', 'georgette', 'acrylic', 'spandex', 'elastane', 'bamboo', 'rubber', 'steel', 'stainless steel', 'aluminium', 'aluminum', 'plastic', 'wood', 'glass', 'ceramic', 'cork', 'jute', 'corduroy', 'tweed', 'microfiber', 'suede'];
const FITS = ['regular', 'slim', 'relaxed', 'oversized', 'loose', 'skinny', 'straight', 'tapered', 'boxy'];
const PATTERNS = ['solid', 'striped', 'checked', 'printed', 'floral', 'graphic', 'plain', 'polka dot', 'self design', 'embroidered', 'camouflage', 'colorblock'];
const GENDERS: Array<[string, string[]]> = [['Women', ['women', 'womens', "women's", 'ladies', 'female']], ['Men', ['men', 'mens', "men's", 'male', 'gents']], ['Girls', ['girls', 'girl']], ['Boys', ['boys', 'boy']], ['Unisex', ['unisex']]];

/** which keyword vocabulary fits a marketplace attribute name (null: none, only the allowed values can be matched) */
export function vocabularyFor(name: string): string[] | null {
  const n = norm(name);
  if (n.includes('color')) return COLORS;
  if (n.includes('material') || n.includes('fabric')) return MATERIALS;
  if (n.endsWith('fit')) return FITS;
  if (n.includes('pattern') || n === 'print') return PATTERNS;
  return null;
}

const titleCase = (s: string): string => s.replace(/\b[a-z]/g, (m) => m.toUpperCase());

/**
 * Maps free text to the marketplace's value: the exact allowed value (any case) or the longest allowed value that appears in the text as a word.
 * Without a list of allowed values the text is kept as it is (dropped when it is longer than the marketplace takes).
 */
export function fitToRequirement(req: Pick<ListingRequirement, 'type' | 'allowedValues' | 'maxLength'>, raw: unknown): Scalar | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') return null;
  const allowed = req.allowedValues?.length ? req.allowedValues : null;
  const text = String(raw).trim();
  if (!text) return null;
  if (allowed) {
    const exact = allowed.find((a) => a.toLowerCase() === text.toLowerCase());
    if (exact) return exact;
    return [...allowed].sort((a, b) => b.length - a.length).find((a) => containsWord(text, a)) ?? null;
  }
  if (req.type === 'number') { const n = Number(text); return Number.isFinite(n) ? n : null; }
  if (req.type === 'boolean') { const t = text.toLowerCase(); return ['true', 'yes', 'y', '1'].includes(t) ? true : ['false', 'no', 'n', '0'].includes(t) ? false : null; }
  if (req.maxLength && text.length > req.maxLength) return null;
  return text;
}

/** the words of `vocabulary` that appear in the text, longest first */
export function keywordsIn(text: string, vocabulary: string[]): string[] {
  return [...vocabulary].sort((a, b) => b.length - a.length).filter((w) => containsWord(text, w));
}

// ------------------------------------------------------------------------------------------------
// the engine
// ------------------------------------------------------------------------------------------------
export interface Signals {
  product: typeof P.$inferSelect;
  variant: typeof V.$inferSelect;
  /** attribute values of the other listings of the same product (other variants and other channels) */
  others: Array<{ values: Record<string, Scalar>; marketplace: string; sku: string; sameMarketplace: boolean; options: Record<string, string> }>;
  /** brand of this product as other marketplaces show it */
  otherBrands: Array<{ marketplace: string; brand: string }>;
  /** attribute values of listings in the same marketplace category (any product) */
  categoryValues: Array<Record<string, Scalar>>;
  /** attribute values of listings of products with the same brand on this marketplace */
  brandValues: Array<Record<string, Scalar>>;
}

const tally = (rows: Array<Record<string, Scalar>>, key: string): Array<{ value: Scalar; n: number; of: number }> => {
  const counts = new Map<string, { value: Scalar; n: number }>();
  let of = 0;
  for (const r of rows) {
    const v = Object.entries(r).find(([k]) => norm(k) === norm(key))?.[1];
    if (v === undefined || v === null || v === '') continue;
    of += 1;
    const id = typeof v === 'string' ? v.toLowerCase() : String(v);
    const e = counts.get(id);
    if (e) e.n += 1; else counts.set(id, { value: v, n: 1 });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).map((e) => ({ ...e, of }));
};

const pickFrom = (obj: Record<string, unknown> | null | undefined, key: string): unknown => {
  if (!obj) return undefined;
  return Object.entries(obj).find(([k, v]) => norm(k) === norm(key) && v !== null && v !== undefined && v !== '')?.[1];
};

/** every candidate value for one attribute, each with its confidence and the reason it is proposed */
export function candidatesFor(req: ListingRequirement, s: Signals): Candidate[] {
  const out: Candidate[] = [];
  const add = (raw: unknown, confidence: number, source: SuggestionSource, reason: string) => {
    const value = fitToRequirement(req, raw);
    if (value !== null) out.push({ value, confidence, source, reason });
  };
  const { product: p, variant: v } = s;
  const n = norm(req.name);
  const label = req.label ?? req.name;

  // 1. the product's own data
  const own = pickFrom(p.attributes, req.name);
  if (own !== undefined && typeof own !== 'object') add(own, 0.92, 'product_attribute', `The product already has ${label} = ${String(own)} in its attributes`);
  const custom = (p.customAttributes ?? []).find((a) => norm(a.name) === n && a.value.trim());
  if (custom) add(custom.value, custom.confirmed ? 0.9 : 0.7, 'product_attribute', `The product has a ${custom.confirmed ? 'confirmed' : 'not yet confirmed'} custom attribute ${custom.name} = ${custom.value}`);
  const option = Object.entries(v.optionValues ?? {}).find(([k]) => norm(k) === n);
  if (option) add(option[1], 0.9, 'variant_option', `This variant is defined as ${option[0]}: ${option[1]}`);
  if (n === 'material' && p.material) add(p.material, 0.9, 'master_field', `The product's material is ${p.material}`);
  if (n === 'brand' && p.brand) add(p.brand, 0.9, 'master_field', `The product's brand is ${p.brand}`);
  if (n === 'manufacturer' && p.manufacturer) add(p.manufacturer, 0.9, 'master_field', `The product's manufacturer is ${p.manufacturer}`);
  if ((n === 'countryoforigin' || n === 'origincountry') && p.countryOfOrigin) add(p.countryOfOrigin, 0.9, 'master_field', `The product's country of origin is ${p.countryOfOrigin}`);
  if (n === 'hsncode' && p.hsnCode) add(p.hsnCode, 0.9, 'master_field', `The product's HSN code is ${p.hsnCode}`);
  const grams = v.weightGrams ?? p.weightGrams;
  if ((n === 'weight' || n === 'weightgrams') && grams) add(grams, 0.85, 'master_field', 'The weight of the variant (grams)');
  if (n === 'barcode' && v.barcode) add(v.barcode, 0.9, 'master_field', "The variant's barcode");

  // 2. the same product on other variants and channels
  for (const o of s.others) {
    const val = pickFrom(o.values, req.name);
    if (val !== undefined) add(val, o.sameMarketplace ? 0.82 : 0.75, 'other_listing', `Set to ${String(val)} on the ${o.sameMarketplace ? 'other' : o.marketplace} listing of this product (${o.sku})`);
    const opt = Object.entries(o.options).find(([k]) => norm(k) === n);
    if (opt && !option) add(opt[1], 0.45, 'other_listing', `A sibling variant (${o.sku}) is ${opt[0]}: ${opt[1]}`);
  }

  // 3. words of the title, tags and description against the marketplace's allowed values (or a vocabulary of the attribute)
  const vocabulary = req.allowedValues?.length ? req.allowedValues : vocabularyFor(req.name);
  if (vocabulary) {
    const corpus: Array<[string, string, number]> = [['title', p.title, 0.78], ['tags', (p.tags ?? []).join(' '), 0.72], ['description', p.description ?? '', 0.62]];
    for (const [where, text, base] of corpus) {
      if (!text.trim()) continue;
      // one- and two-letter values (sizes such as S, M, XL) are far too common as words to be read out of a title
      const words = keywordsIn(text, vocabulary.filter((w) => w.length >= 3));
      for (const w of words.slice(0, 2)) add(req.allowedValues?.length ? w : titleCase(w), words.length === 1 ? base : base - 0.12, 'keyword_match', `"${w}" appears in the product ${where}`);
    }
  }
  if (n.includes('gender') || n.includes('targetaudience')) {
    const text = `${p.title} ${(p.tags ?? []).join(' ')}`;
    const g = GENDERS.find(([, words]) => words.some((w) => containsWord(text, w)));
    if (g) add(g[0], 0.7, 'keyword_match', `The product title or tags talk about ${g[0].toLowerCase()}`);
  }

  // 4. what this seller usually enters: the same brand on this marketplace, then the same marketplace category
  const brandTop = tally(s.brandValues, req.name)[0];
  if (brandTop && brandTop.n >= 2) add(brandTop.value, Math.min(0.6, 0.35 + 0.25 * (brandTop.n / brandTop.of)), 'brand_default', `${brandTop.n} of ${brandTop.of} listings of this brand use ${String(brandTop.value)}`);
  const catTop = tally(s.categoryValues, req.name)[0];
  if (catTop && catTop.n >= 2) add(catTop.value, Math.min(0.5, 0.25 + 0.25 * (catTop.n / catTop.of)), 'category_default', `${catTop.n} of ${catTop.of} listings in this category use ${String(catTop.value)}`);
  return out;
}

/** best candidate first; the same value from several kinds of signal gains a little confidence (it is corroborated) */
export function rank(cands: Candidate[]): Candidate[] {
  const byValue = new Map<string, Candidate[]>();
  for (const c of cands) {
    const id = typeof c.value === 'string' ? c.value.toLowerCase() : String(c.value);
    byValue.set(id, [...(byValue.get(id) ?? []), c]);
  }
  return [...byValue.values()]
    .map((group) => {
      const best = [...group].sort((a, b) => b.confidence - a.confidence)[0]!;
      const kinds = new Set(group.map((g) => g.source)).size;
      return { ...best, confidence: Math.min(0.97, Math.round((best.confidence + Math.min(0.1, 0.04 * (kinds - 1))) * 100) / 100) };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * GET /listings/{id}/fix-suggestions: for every failing (or missing) category attribute and a missing brand, the value the engine would
 * enter, with a reason and a confidence. Deterministic and local (no external model): it reads the product, the other listings of the same
 * product, the marketplace category's allowed values and what the seller enters elsewhere. Nothing is written.
 */
export async function fixSuggestions(ctx: Ctx, listingId: string) {
  const { vendorId } = ctx;
  const ev = await evaluate(ctx, listingId, { signImages: false });
  const { listing, product, variant, account, input } = ev.context;

  const signals: Signals = await withVendor(ctx.c.database.db, vendorId, async (tx) => {
    const siblings = await tx.select({ values: L.attributeValues, marketplace: A.marketplace, sku: V.sku, options: V.optionValues }).from(L)
      .innerJoin(V, and(eq(V.id, L.variantId), eq(V.vendorId, L.vendorId))).innerJoin(A, and(eq(A.id, L.marketplaceAccountId), eq(A.vendorId, L.vendorId)))
      .where(and(eq(L.vendorId, vendorId), eq(V.productId, product.id), ne(L.id, listingId), isNull(V.deletedAt))).limit(100);
    const pmd = await tx.select({ marketplace: PMD.marketplace, data: PMD.data }).from(PMD).where(and(eq(PMD.vendorId, vendorId), eq(PMD.productId, product.id)));
    const sameCategory = listing.marketplaceCategoryId
      ? await tx.select({ values: L.attributeValues }).from(L).innerJoin(A, and(eq(A.id, L.marketplaceAccountId), eq(A.vendorId, L.vendorId)))
        .where(and(eq(L.vendorId, vendorId), eq(A.marketplace, account.marketplace), eq(L.marketplaceCategoryId, listing.marketplaceCategoryId), ne(L.id, listingId))).limit(300)
      : [];
    const brand = product.brand?.trim();
    const sameBrand = brand
      ? await tx.select({ values: L.attributeValues }).from(L).innerJoin(A, and(eq(A.id, L.marketplaceAccountId), eq(A.vendorId, L.vendorId)))
        .innerJoin(V, and(eq(V.id, L.variantId), eq(V.vendorId, L.vendorId))).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId)))
        .where(and(eq(L.vendorId, vendorId), eq(A.marketplace, account.marketplace), eq(P.brand, brand), ne(P.id, product.id))).limit(300)
      : [];
    return {
      product, variant,
      others: siblings.map((r) => ({ values: r.values ?? {}, marketplace: r.marketplace, sku: r.sku, sameMarketplace: r.marketplace === account.marketplace, options: r.options ?? {} })),
      otherBrands: pmd.flatMap((r) => {
        const b = pickFrom(r.data, 'brand');
        return r.marketplace !== account.marketplace && typeof b === 'string' && b.trim() ? [{ marketplace: r.marketplace, brand: b.trim() }] : [];
      }),
      categoryValues: sameCategory.map((r) => r.values ?? {}),
      brandValues: sameBrand.map((r) => r.values ?? {}),
    };
  });

  const failing = new Set(ev.result.errors.flatMap((e) => (e.attribute ? [e.attribute] : [])));
  const suggestions: FixSuggestion[] = [];
  const unresolved: Unresolved[] = [];
  for (const req of ev.requirements) {
    const current = input.attributes?.[req.name];
    const missing = current === undefined || current === null || current === '';
    if (!missing && !failing.has(req.name)) continue;
    const severity: 'fail' | 'warn' = req.required || failing.has(req.name) ? 'fail' : 'warn';
    const label = req.label ?? req.name;
    // a value the marketplace refused is never proposed again
    const ranked = rank(candidatesFor(req, signals)).filter((c) => missing || String(c.value).toLowerCase() !== String(current).toLowerCase());
    const best = ranked[0];
    // an optional attribute is only worth a suggestion when the engine is fairly sure
    if (!best || (severity === 'warn' && best.confidence < 0.55)) {
      if (severity === 'fail') unresolved.push({ key: req.name, label, reason: 'Nothing in the product, its other listings or the category points to a value: enter it by hand' });
      continue;
    }
    suggestions.push({
      key: req.name, kind: 'attribute', field: req.name, label, severity, value: best.value, confidence: best.confidence, confidenceLevel: levelOf(best.confidence), source: best.source, reason: best.reason,
      alternatives: ranked.slice(1, 4), apply: { attributeOverrides: { [req.name]: best.value } },
    });
  }

  // brand: a content check of the readiness list (a warning: most marketplaces ask for one)
  if (!input.brand?.trim()) {
    const cands: Candidate[] = signals.otherBrands.map((o) => ({ value: o.brand, confidence: 0.8, source: 'other_channel' as const, reason: `The brand is "${o.brand}" on the ${o.marketplace} channel of this product` }));
    if (product.manufacturer?.trim()) cands.push({ value: product.manufacturer.trim(), confidence: 0.55, source: 'master_field', reason: `The product has no brand but its manufacturer is ${product.manufacturer.trim()}` });
    const ranked = rank(cands);
    const best = ranked[0];
    if (best) {
      suggestions.push({
        key: 'brand', kind: 'brand', field: 'brand', label: 'Brand', severity: 'warn', value: best.value, confidence: best.confidence, confidenceLevel: levelOf(best.confidence), source: best.source, reason: best.reason,
        alternatives: ranked.slice(1, 4), apply: { brand: String(best.value) },
      });
    }
  }

  suggestions.sort((a, b) => (a.severity === b.severity ? b.confidence - a.confidence : a.severity === 'fail' ? -1 : 1));
  return {
    listingId, version: listing.version, generatedAt: new Date().toISOString(), engine: 'rules' as const,
    note: 'Unconfirmed suggestions built from your own data and rules: nothing is saved until you confirm it.',
    suggestions, unresolved,
  };
}
