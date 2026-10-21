import { and, eq, schema, sql, type Tx } from '@oms/database';
import { Errors } from '@oms/shared';
import type { ProductRow, Effects } from '@oms/mod-catalog';
import { loadImages, type ImageDoc } from './images';

/**
 * Suggested improvements of the edit panel ("Suggested improvement": description shorter than the category average, few images).
 * Dismissals live in `product_insight_dismissals` (per product and key, optional `until`); an insight whose condition no longer holds just
 * disappears. Decision E6: benchmark = median plain-text description length of the business's other ACTIVE products in the same category that
 * have a description, needing at least 5 of them, else a 150-character floor.
 */
const DISMISSALS = schema.productInsightDismissals;
const P = schema.products;

export const INSIGHT_KEYS = ['description_short', 'few_images'] as const;
export type InsightKey = (typeof INSIGHT_KEYS)[number];
export const isInsightKey = (k: string): k is InsightKey => (INSIGHT_KEYS as readonly string[]).includes(k);

export const BENCHMARK_MIN_SAMPLES = 5;
export const DESCRIPTION_FLOOR_CHARS = 150;
export const MIN_IMAGES = 3;

export interface InsightAction { key: string; label: string; method: 'GET' | 'POST'; href: string; body?: Record<string, unknown> }
export interface Insight {
  key: InsightKey;
  severity: 'suggestion';
  message: string;
  detail: string;
  actions: InsightAction[];
  data: Record<string, unknown>;
}
export interface DismissedInsight { key: InsightKey; dismissedAt: string; until: string | null }

const textLength = (s: string | null | undefined) => [...(s ?? '').trim()].length;

/** one aggregate query: how many comparable products and their median description length */
export async function descriptionBenchmark(tx: Tx, vendorId: string, p: Pick<ProductRow, 'id' | 'categoryId'>): Promise<{ benchmark: number; samples: number; source: 'category_median' | 'floor' }> {
  if (!p.categoryId) return { benchmark: DESCRIPTION_FLOOR_CHARS, samples: 0, source: 'floor' };
  const res = await tx.execute(sql`
    select count(*)::int as n, percentile_cont(0.5) within group (order by char_length(btrim(${P.description}))) as median
    from ${P}
    where ${P.vendorId} = ${vendorId} and ${P.deletedAt} is null and ${P.status} = 'active' and ${P.categoryId} = ${p.categoryId}
      and ${P.id} <> ${p.id} and ${P.description} is not null and btrim(${P.description}) <> ''`);
  const row = (res.rows as Array<{ n: number; median: number | string | null }>)[0];
  const n = Number(row?.n ?? 0);
  if (n >= BENCHMARK_MIN_SAMPLES && row?.median != null) return { benchmark: Number(row.median), samples: n, source: 'category_median' };
  return { benchmark: DESCRIPTION_FLOOR_CHARS, samples: n, source: 'floor' };
}

async function evaluate(tx: Tx, vendorId: string, p: ProductRow, images: ImageDoc[]): Promise<Insight[]> {
  const out: Insight[] = [];
  const api = `/api/v1/products/${p.id}`;
  const dismiss = (key: InsightKey): InsightAction => ({ key: 'dismiss', label: 'Dismiss', method: 'POST', href: `${api}/insights/${key}/dismiss` });

  const length = textLength(p.description);
  const bench = await descriptionBenchmark(tx, vendorId, p);
  if (length < bench.benchmark) {
    out.push({
      key: 'description_short', severity: 'suggestion',
      message: 'Your product description is shorter than the average for this category.',
      detail: 'Adding key product benefits may improve listing completeness.',
      actions: [{ key: 'review_suggestion', label: 'Review suggestion', method: 'POST', href: `${api}/ai/description`, body: { mode: 'benefits' } }, dismiss('description_short')],
      data: { length, benchmark: bench.benchmark, samples: bench.samples, source: bench.source },
    });
  }

  const real = images.filter((i) => !i.isPlaceholder).length; // a placeholder never counts
  if (real < MIN_IMAGES) {
    out.push({
      key: 'few_images', severity: 'suggestion',
      message: 'Add more product images',
      detail: 'Listings with several images convert better.',
      actions: [{ key: 'manage_media', label: 'Manage media', method: 'GET', href: `/products/${p.id}?tab=media` }, dismiss('few_images')],
      data: { images: real, minimum: MIN_IMAGES },
    });
  }
  return out;
}

/** every insight that currently applies, split into the active ones and those the seller dismissed */
export async function currentInsights(tx: Tx, vendorId: string, p: ProductRow, opts: { images?: ImageDoc[]; now?: Date } = {}): Promise<{ items: Insight[]; dismissed: Array<Insight & DismissedInsight> }> {
  const now = opts.now ?? new Date();
  const [all, rows] = await Promise.all([
    evaluate(tx, vendorId, p, opts.images ?? (await loadImages(tx, vendorId, p.id))),
    tx.select().from(DISMISSALS).where(and(eq(DISMISSALS.vendorId, vendorId), eq(DISMISSALS.productId, p.id))),
  ]);
  const hidden = new Map(rows.filter((r) => r.until === null || r.until.getTime() > now.getTime()).map((r) => [r.key, r]));
  return {
    items: all.filter((i) => !hidden.has(i.key)),
    dismissed: all.filter((i) => hidden.has(i.key)).map((i) => ({ ...i, dismissedAt: hidden.get(i.key)!.dismissedAt.toISOString(), until: hidden.get(i.key)!.until?.toISOString() ?? null })),
  };
}

function assertKey(key: string): InsightKey {
  if (!isInsightKey(key)) throw Errors.notFound('Insight', key);
  return key;
}

export async function dismissInsight(tx: Tx, vendorId: string, p: ProductRow, rawKey: string, until: Date | null, fx: Effects) {
  const key = assertKey(rawKey);
  if (until && until.getTime() <= Date.now()) throw Errors.validation({ issues: [{ path: 'until', code: 'until_in_the_past', message: '`until` must be in the future' }] });
  const now = new Date();
  await tx.insert(DISMISSALS)
    .values({ vendorId, productId: p.id, key, dismissedBy: uuidOrNull(fx.actorId), dismissedAt: now, until })
    .onConflictDoUpdate({ target: [DISMISSALS.vendorId, DISMISSALS.productId, DISMISSALS.key], set: { dismissedBy: uuidOrNull(fx.actorId), dismissedAt: now, until, updatedAt: now } });
  await fx.audit({ action: 'product.insight_dismissed', resourceType: 'product', resourceId: p.id, after: { key, until: until?.toISOString() ?? null } });
  return { key, dismissed: true as const, until: until?.toISOString() ?? null };
}

export async function restoreInsight(tx: Tx, vendorId: string, p: ProductRow, rawKey: string, fx: Effects) {
  const key = assertKey(rawKey);
  const removed = await tx.delete(DISMISSALS).where(and(eq(DISMISSALS.vendorId, vendorId), eq(DISMISSALS.productId, p.id), eq(DISMISSALS.key, key))).returning({ id: DISMISSALS.id });
  if (removed.length) await fx.audit({ action: 'product.insight_restored', resourceType: 'product', resourceId: p.id, after: { key } });
  return { key, dismissed: false as const, until: null };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: string | null | undefined) => (v && UUID.test(v) ? v : null);
