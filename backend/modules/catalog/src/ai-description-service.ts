import { and, desc, eq, isFeatureEnabled, isNull, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import type { Effects } from './effects';
import { DESCRIPTION_MAX_CHARS, sanitizeDescription } from './description';
import {
  cleanInline, explanationFor, finalizeText, groundingNote, rulesProvider, summarizeFacts, trimToLimit,
  type AiMode, type DescriptionFacts, type DescriptionProvider,
} from './ai-description-provider';

const P = schema.products;
const S = schema.productAiSuggestions;
type SuggestionRow = typeof S.$inferSelect;
type ProductRow = typeof P.$inferSelect;

/** suggestions older than this can no longer be applied */
export const SUGGESTION_TTL_MS = 7 * 86_400_000;
const EDITABLE_STATUSES = ['draft', 'active'];

export interface SuggestionDto {
  id: string; productId: string; mode: AiMode; text: string; html: string; basis: string[]; needsFacts: boolean; unchanged: boolean;
  status: 'suggested' | 'applied' | 'dismissed' | 'expired'; applied: boolean; note: string; explanation: string; provider: string;
  createdAt: string; expiresAt: string; decidedAt: string | null;
  /** only in the response of a request with `alsoSuggest`; each alternative is its own stored suggestion (own id, applied / dismissed independently) */
  alternatives?: SuggestionDto[];
}

export function toSuggestionDto(row: SuggestionRow, now = new Date()): SuggestionDto {
  const expiresAt = new Date(row.createdAt.getTime() + SUGGESTION_TTL_MS);
  const status = (row.status === 'suggested' && expiresAt.getTime() <= now.getTime() ? 'expired' : row.status) as SuggestionDto['status'];
  const mode = row.mode as AiMode;
  const unchanged = (mode === 'rewrite' || row.basis.includes('text')) && row.suggestionText === row.sourceText;
  const { html } = finalizeText(row.suggestionText);
  return {
    id: row.id, productId: row.productId, mode, text: row.suggestionText, html, basis: row.basis, needsFacts: row.needsFacts, unchanged, status, applied: status === 'applied',
    note: groundingNote({ mode, basis: row.basis, needsFacts: row.needsFacts, unchanged }), explanation: explanationFor({ mode, basis: row.basis, needsFacts: row.needsFacts, unchanged }), provider: row.provider,
    createdAt: row.createdAt.toISOString(), expiresAt: expiresAt.toISOString(), decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

/** the platform flag AND the business's own AI setting must allow it */
export async function assertAiEnabled(tx: Tx, vendorId: string): Promise<void> {
  if (!(await isFeatureEnabled(tx, 'ai.enabled', vendorId, true))) throw new AppError('FORBIDDEN', 'AI features are not enabled for this business', { details: { rule: 'feature_disabled', flag: 'ai.enabled' } });
  const [s] = await tx.select({ enabled: schema.aiSettings.enabled }).from(schema.aiSettings).where(eq(schema.aiSettings.vendorId, vendorId));
  if (s && !s.enabled) throw new AppError('FORBIDDEN', 'AI is switched off in your AI settings', { details: { rule: 'feature_disabled', setting: 'ai_settings' } });
}

async function loadProduct(tx: Tx, vendorId: string, id: string): Promise<ProductRow> {
  const [p] = await tx.select().from(P).where(and(eq(P.id, id), eq(P.vendorId, vendorId), isNull(P.deletedAt)));
  if (!p) throw Errors.notFound('Product', id);
  return p;
}

function assertEditable(p: ProductRow): void {
  if (!EDITABLE_STATUSES.includes(p.status)) throw new AppError('CONFLICT', 'Only draft or active products can get a new description', { details: { rule: 'product_not_editable', status: p.status } });
}

/** a brand is a fact only when the seller confirmed it */
const brandKey = (name: string) => cleanInline(name).toLowerCase();

/** product facts that exist (and are verified) for the description writer */
export async function collectFacts(tx: Tx, vendorId: string, p: ProductRow): Promise<DescriptionFacts> {
  let category: string | null = null;
  if (p.categoryId) {
    const [c] = await tx.select({ name: schema.categories.name }).from(schema.categories).where(and(eq(schema.categories.id, p.categoryId), eq(schema.categories.vendorId, vendorId), isNull(schema.categories.deletedAt)));
    category = c?.name ?? null;
  }
  let brand: string | null = null;
  const brandText = cleanInline(p.brand);
  if (brandText) {
    const [b] = await tx.select({ name: schema.brands.name, confirmedAt: schema.brands.confirmedAt }).from(schema.brands).where(and(eq(schema.brands.vendorId, vendorId), eq(schema.brands.nameKey, brandKey(brandText))));
    if (b?.confirmedAt) brand = b.name;
  }
  const dims = p.lengthMm && p.widthMm && p.heightMm ? { length: p.lengthMm, width: p.widthMm, height: p.heightMm } : null;
  return {
    name: p.title, category, brand, material: cleanInline(p.material) || null, countryOfOrigin: cleanInline(p.countryOfOrigin) || null,
    dimensionsMm: dims, weightGrams: p.weightGrams ?? null,
    attributes: (p.customAttributes ?? []).filter((a) => a.confirmed).map((a) => ({ name: a.name, value: a.value })),
  };
}

export interface GenerateOptions {
  mode: AiMode; text?: string; actorId: string | null;
  /** at most one more mode (different from `mode`); stored as its own suggestion and returned in `alternatives` */
  alsoSuggest?: AiMode[];
}

export async function generateSuggestion(tx: Tx, vendorId: string, productId: string, o: GenerateOptions, fx: Effects, provider: DescriptionProvider = rulesProvider): Promise<SuggestionDto> {
  const also = o.alsoSuggest ?? [];
  if (also.length > 1 || also.some((m) => m === o.mode)) throw Errors.validation({ rule: 'also_suggest_invalid', message: 'alsoSuggest takes at most one mode and it must differ from mode' });
  await assertAiEnabled(tx, vendorId);
  const product = await loadProduct(tx, vendorId, productId);
  assertEditable(product);

  // the text the seller is working on (may be unsaved); sanitised, so markup / scripts never reach the generator or the table
  const source = sanitizeDescription(o.text ?? product.description ?? '');
  if (source.length > DESCRIPTION_MAX_CHARS) throw Errors.validation({ rule: 'description_too_long', length: source.length, max: DESCRIPTION_MAX_CHARS });
  for (const m of [o.mode, ...also]) {
    if (m === 'rewrite' && source.text.length === 0) throw new AppError('CONFLICT', 'There is no text to rewrite', { details: { rule: 'nothing_to_rewrite' } });
  }

  const facts = await collectFacts(tx, vendorId, product);
  const summary = summarizeFacts(facts);

  const createOne = async (mode: AiMode, alternativeOf: string | null): Promise<SuggestionDto> => {
    const condenses = mode === 'concise' && source.text.length > 0;
    let generated = finalizeText(await provider.generate({ mode, facts, text: source.text }));
    // condensing must make the text strictly shorter; otherwise the seller's text is returned as it is (unchanged)
    if (condenses && [...generated.text].length >= [...source.text].length) generated = { text: source.text, html: finalizeText(source.text).html };
    const needsFacts = mode === 'benefits' && !summary.hasFacts;
    const basis = mode === 'rewrite' || condenses ? ['text'] : mode === 'concise' ? summary.basis.filter((b) => b === 'name' || b === 'category') : summary.basis;
    const text = trimToLimit(generated.text);
    const [row] = await tx.insert(S).values({
      vendorId, productId, mode, sourceText: source.text, suggestionText: text, basis, needsFacts, provider: provider.name, status: 'suggested', createdBy: o.actorId,
    }).returning();
    await fx.audit({
      action: 'product.ai_description_suggested', resourceType: 'product', resourceId: productId,
      metadata: { suggestionId: row!.id, mode, provider: provider.name, needsFacts, ...(alternativeOf ? { alternativeOf } : {}) },
    });
    return toSuggestionDto(row!);
  };

  const primary = await createOne(o.mode, null);
  if (also.length === 0) return primary;
  const alternatives: SuggestionDto[] = [];
  for (const m of also) alternatives.push(await createOne(m, primary.id));
  return { ...primary, alternatives };
}

export async function listSuggestions(tx: Tx, vendorId: string, productId: string, limit: number): Promise<SuggestionDto[]> {
  await loadProduct(tx, vendorId, productId);
  const rows = await tx.select().from(S).where(and(eq(S.vendorId, vendorId), eq(S.productId, productId))).orderBy(desc(S.createdAt), desc(S.id)).limit(limit);
  const now = new Date();
  return rows.map((r) => toSuggestionDto(r, now));
}

async function loadSuggestion(tx: Tx, vendorId: string, productId: string, id: string): Promise<SuggestionRow> {
  const [s] = await tx.select().from(S).where(and(eq(S.id, id), eq(S.vendorId, vendorId), eq(S.productId, productId))).for('update');
  if (!s) throw Errors.notFound('Suggestion', id);
  return s;
}

const alreadyDecided = (status: string) => new AppError('CONFLICT', 'This suggestion was already decided', { details: { rule: 'already_decided', status } });

export interface AppliedResult {
  suggestion: SuggestionDto; text: string; html: string;
  /** only when the product was written (`persist: true`) */
  product?: { id: string; description: string | null; descriptionHtml: string | null; status: string; version: number; updatedAt: string };
}

/**
 * persist = true (default): writes the product (needs `version`). persist = false: only records the acceptance (the editor holds the text until its own Save);
 * the product row, its version and updated_at stay untouched.
 */
export async function applySuggestion(tx: Tx, vendorId: string, productId: string, suggestionId: string, o: { version?: number; persist?: boolean }, fx: Effects): Promise<AppliedResult> {
  const persist = o.persist !== false;
  if (persist && o.version === undefined) throw Errors.validation({ rule: 'version_required', message: 'version is required unless persist is false' });
  await assertAiEnabled(tx, vendorId);
  const product = await loadProduct(tx, vendorId, productId);
  const s = await loadSuggestion(tx, vendorId, productId, suggestionId);
  if (s.status === 'applied' || s.status === 'dismissed') throw alreadyDecided(s.status);
  if (s.status === 'expired' || s.createdAt.getTime() + SUGGESTION_TTL_MS <= Date.now()) throw new AppError('CONFLICT', 'This suggestion expired; ask for a new one', { details: { rule: 'suggestion_expired' } });
  assertEditable(product);

  const { text, html } = finalizeText(s.suggestionText);
  const now = new Date();
  if (!persist) {
    const [accepted] = await tx.update(S).set({ status: 'applied', decidedAt: now, updatedAt: now }).where(and(eq(S.id, s.id), eq(S.status, 'suggested'))).returning();
    if (!accepted) throw alreadyDecided('applied');
    await fx.audit({ action: 'product.ai_description_accepted', resourceType: 'product', resourceId: productId, metadata: { suggestionId: s.id, mode: s.mode, provider: s.provider, persisted: false } });
    return { suggestion: toSuggestionDto(accepted), text, html };
  }
  const version = o.version!;
  if (version !== product.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: product.version } });
  const [updated] = await tx.update(P).set({ description: text, descriptionHtml: html, updatedAt: now, version: sql`${P.version} + 1` as never })
    .where(and(eq(P.id, productId), eq(P.vendorId, vendorId), eq(P.version, version))).returning();
  if (!updated) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: (await loadProduct(tx, vendorId, productId)).version } });
  const [decided] = await tx.update(S).set({ status: 'applied', decidedAt: now, updatedAt: now }).where(and(eq(S.id, s.id), eq(S.status, 'suggested'))).returning();
  if (!decided) throw alreadyDecided('applied');

  await fx.event({ type: 'product.updated', aggregateType: 'product', aggregateId: productId, payload: { fields: ['description', 'descriptionHtml'], source: 'ai_description', suggestionId: s.id } });
  await fx.audit({
    action: 'product.ai_description_applied', resourceType: 'product', resourceId: productId,
    before: { description: product.description, version: product.version }, after: { description: text, version: updated.version }, metadata: { suggestionId: s.id, mode: s.mode, provider: s.provider },
  });
  return {
    suggestion: toSuggestionDto(decided), text, html,
    product: { id: updated.id, description: updated.description, descriptionHtml: updated.descriptionHtml, status: updated.status, version: updated.version, updatedAt: updated.updatedAt.toISOString() },
  };
}

/** idempotent: dismissing a dismissed suggestion returns it unchanged; an applied one cannot be dismissed */
export async function dismissSuggestion(tx: Tx, vendorId: string, productId: string, suggestionId: string, fx: Effects): Promise<SuggestionDto> {
  await loadProduct(tx, vendorId, productId);
  const s = await loadSuggestion(tx, vendorId, productId, suggestionId);
  if (s.status === 'dismissed') return toSuggestionDto(s);
  if (s.status === 'applied') throw alreadyDecided(s.status);
  const now = new Date();
  const [decided] = await tx.update(S).set({ status: 'dismissed', decidedAt: now, updatedAt: now }).where(and(eq(S.id, s.id), eq(S.status, s.status))).returning();
  if (!decided) throw alreadyDecided('dismissed');
  await fx.audit({ action: 'product.ai_description_dismissed', resourceType: 'product', resourceId: productId, metadata: { suggestionId: s.id, mode: s.mode } });
  return toSuggestionDto(decided);
}
