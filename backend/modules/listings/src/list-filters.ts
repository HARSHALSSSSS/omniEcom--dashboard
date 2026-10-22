import { z } from 'zod';
import { sql, type SQL } from '@oms/database';
import type { Ctx } from './ctx';
import { ATTENTION_STATUSES, SCREEN_STATUS_SQL } from './workspace-domain';

/**
 * The extra filters of the Listings screen (GET /listings/table): the "why not ready" issues, master category, readiness band, channel
 * stock, listing potential and product status, plus the channel groups of the channel tabs ("Social Commerce").
 * Everything here is a SQL predicate over the aliases of the table query (l = listing, v = variant, p = product, a = account), except the
 * two computed ones (readiness band, channel stock), which need the evaluated table block and are applied by list-readiness.ts.
 */

const STATUS_EXPR = sql.raw(`(${SCREEN_STATUS_SQL})`);
const ATTENTION_LIST = sql.raw(ATTENTION_STATUSES.map((s) => `'${s}'`).join(', '));
const ATTRIBUTE_ERROR_CODES = ['attribute_missing', 'attribute_invalid', 'attribute_not_allowed', 'attribute_too_long'];

export const LISTING_ISSUES = ['missing_attributes', 'missing_images', 'category_mismatch', 'variant_issues'] as const;
export type ListingIssueKey = (typeof LISTING_ISSUES)[number];
export const READINESS_BANDS = ['100', 'high', 'medium', 'low'] as const;
export type ReadinessBand = (typeof READINESS_BANDS)[number];
export const INVENTORY_FILTERS = ['in_stock', 'out_of_stock'] as const;
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];
export const POTENTIALS = ['high_velocity', 'missing_channel'] as const;
export type Potential = (typeof POTENTIALS)[number];

/** units sold in the last 30 days from which a variant counts as "high velocity" */
export const HIGH_VELOCITY_UNITS = 5;
export const HIGH_VELOCITY_DAYS = 30;

/** Channel tab groups: one tab that stands for several marketplaces. Social Commerce = the social / catalogue-led channels. */
export const CHANNEL_GROUPS: Record<string, { name: string; marketplaces: readonly string[] }> = {
  social: { name: 'Social Commerce', marketplaces: ['meesho', 'shopify'] },
};

/** `a.marketplace = code`, or `in (...)` for a channel group code */
export function marketplaceSql(code: string): SQL {
  const group = CHANNEL_GROUPS[code];
  if (!group) return sql`a.marketplace = ${code}`;
  return sql`a.marketplace in (${sql.join(group.marketplaces.map((m) => sql`${m}`), sql`, `)})`;
}

/** what a filter query string may carry (merge into the querystring of GET /listings/table) */
export const ListExtraQuery = {
  'filter[issue]': z.enum(LISTING_ISSUES).optional().describe('Only the listings affected by this issue: missing_attributes | missing_images | category_mismatch (these three among listings that need attention) | variant_issues (a sibling variant of the product is not listed on the same account)'),
  'filter[categoryId]': z.uuid().optional().describe('Master category of the product (its sub-categories included)'),
  'filter[productStatus]': z.enum(['draft', 'active', 'archived']).optional().describe('Status of the master product'),
  'filter[readiness]': z.enum(READINESS_BANDS).optional().describe('Readiness band of the listing: 100 = 100% | high = 80-99% | medium = 50-79% | low = below 50%'),
  'filter[inventory]': z.enum(INVENTORY_FILTERS).optional().describe('in_stock = the channel can sell at least one unit | out_of_stock = it can sell none'),
  'filter[potential]': z.enum(POTENTIALS).optional().describe(`high_velocity = the variant sold at least ${HIGH_VELOCITY_UNITS} units in the last ${HIGH_VELOCITY_DAYS} days | missing_channel = the variant could still be listed on a connected account where it has no listing`),
};
export type ListExtraInput = {
  issue?: ListingIssueKey; categoryId?: string; productStatus?: string; readiness?: ReadinessBand; inventory?: InventoryFilter; potential?: Potential;
};

export const extraInputOf = (q: Record<string, unknown>): ListExtraInput => ({
  issue: q['filter[issue]'] as ListingIssueKey | undefined, categoryId: q['filter[categoryId]'] as string | undefined, productStatus: q['filter[productStatus]'] as string | undefined,
  readiness: q['filter[readiness]'] as ReadinessBand | undefined, inventory: q['filter[inventory]'] as InventoryFilter | undefined, potential: q['filter[potential]'] as Potential | undefined,
});

const list = (items: string[]): SQL => sql.join(items.map((i) => sql`${i}`), sql`, `);
const listableOf = (ctx: Ctx): string[] => ctx.c.connectors.supporting((x) => x.implementation !== 'planned' && x.capabilities.listings.create).map((x) => x.code);
const requiringCategory = (ctx: Ctx): string[] => ctx.c.connectors.supporting((x) => x.implementation !== 'planned' && x.capabilities.listings.requiresCategoryMapping).map((x) => x.code);

const VALIDATION_ERRORS = sql.raw(`jsonb_array_elements(case when jsonb_typeof(l.validation -> 'errors') = 'array' then l.validation -> 'errors' else '[]'::jsonb end)`);
const ATTENTION = sql`${STATUS_EXPR} in (${ATTENTION_LIST})`;

/** the listings an issue affects, as a predicate over l / v / p / a; the issue chips count with the very same predicate */
export function issuePredicate(ctx: Ctx, issue: ListingIssueKey): SQL {
  switch (issue) {
    case 'missing_images':
      return sql`(${ATTENTION} and not exists (select 1 from product_documents d where d.vendor_id = l.vendor_id and d.product_id = p.id and d.kind = 'image' and d.deleted_at is null and d.status in ('uploaded', 'processed')))`;
    case 'missing_attributes':
      return sql`(${ATTENTION} and exists (select 1 from ${VALIDATION_ERRORS} e where e ->> 'code' in (${list(ATTRIBUTE_ERROR_CODES)})))`;
    case 'category_mismatch': {
      const need = requiringCategory(ctx);
      const noCategory = need.length
        ? sql`(l.marketplace_category_id is null and a.marketplace in (${list(need)}) and not exists (select 1 from category_mappings cm where cm.vendor_id = l.vendor_id and cm.marketplace = a.marketplace and cm.category_id = p.category_id))`
        : sql`false`;
      return sql`(${ATTENTION} and (${noCategory} or exists (select 1 from ${VALIDATION_ERRORS} e where e ->> 'code' = 'requirements_unavailable')))`;
    }
    case 'variant_issues': {
      const listable = listableOf(ctx);
      if (listable.length === 0) return sql`false`;
      return sql`(a.status = 'active' and a.marketplace in (${list(listable)}) and p.status = 'active' and exists (
        select 1 from product_variants v2 where v2.vendor_id = l.vendor_id and v2.product_id = p.id and v2.deleted_at is null and v2.status = 'active'
          and not exists (select 1 from marketplace_listings l2 where l2.vendor_id = l.vendor_id and l2.variant_id = v2.id and l2.marketplace_account_id = l.marketplace_account_id)))`;
    }
  }
}

/** the product (alias p) is in this master category or one of its sub-categories */
export function categoryPredicate(categoryId: string): SQL {
  return sql`p.category_id in (select c.id from categories c where c.vendor_id = p.vendor_id and c.deleted_at is null
    and (c.id = ${categoryId} or c.path like (select c2.path from categories c2 where c2.vendor_id = p.vendor_id and c2.id = ${categoryId}) || '/%'))`;
}

/** the SQL-expressible extra filters of the listings table (readiness band and channel stock are computed: see list-readiness.ts) */
export function extraPredicates(ctx: Ctx, f: ListExtraInput): SQL[] {
  const parts: SQL[] = [];
  if (f.issue) parts.push(issuePredicate(ctx, f.issue));
  if (f.categoryId) parts.push(categoryPredicate(f.categoryId));
  if (f.productStatus) parts.push(sql`p.status = ${f.productStatus}`);
  if (f.potential === 'high_velocity') {
    parts.push(sql`(select coalesce(sum(oi.quantity), 0) from order_items oi join orders o on o.vendor_id = oi.vendor_id and o.id = oi.order_id
      where oi.vendor_id = l.vendor_id and oi.variant_id = l.variant_id and o.status not in ('cancelled', 'returned') and o.placed_at >= now() - interval '${sql.raw(String(HIGH_VELOCITY_DAYS))} days') >= ${sql.raw(String(HIGH_VELOCITY_UNITS))}`);
  }
  if (f.potential === 'missing_channel') {
    const listable = listableOf(ctx);
    parts.push(listable.length === 0
      ? sql`false`
      : sql`exists (select 1 from marketplace_accounts a2 where a2.vendor_id = l.vendor_id and a2.status = 'active' and a2.marketplace in (${list(listable)})
        and not exists (select 1 from marketplace_listings l2 where l2.vendor_id = l.vendor_id and l2.variant_id = l.variant_id and l2.marketplace_account_id = a2.id))`);
  }
  return parts;
}

/** the readiness band of a percent */
export const bandOf = (percent: number): ReadinessBand => (percent >= 100 ? '100' : percent >= 80 ? 'high' : percent >= 50 ? 'medium' : 'low');
