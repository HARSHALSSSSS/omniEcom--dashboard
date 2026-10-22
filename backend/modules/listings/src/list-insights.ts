import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type SQL, type Tx } from '@oms/database';
import { successEnvelope } from '@oms/contracts';
import { ok, requireVendor, vendorTx } from '@oms/module-kit';
import { ctxFromRequest, type Ctx } from './ctx';
import { issuePredicate, type ListingIssueKey } from './list-filters';
import { listChannelRoutes } from './list-channels';
import { listCreateRoutes } from './list-create';
import { marketplaceNameOf, overviewCounts } from './workspace-data';
import { ATTENTION_STATUSES, SCREEN_STATUS_SQL, SCREEN_STATUSES, type ScreenStatus } from './workspace-domain';

/**
 * Read models of the top of the Listings screen: the master-catalogue x marketplace matrix, the catalogue reach figures and the
 * "why are listings not ready" summary. Read-only, one tenant, a fixed number of queries.
 */

const STATUS_EXPR = sql.raw(`(${SCREEN_STATUS_SQL})`);
const ATTENTION_LIST = sql.raw(ATTENTION_STATUSES.map((s) => `'${s}'`).join(', '));

const LISTING_FROM = sql`from marketplace_listings l
  join product_variants v on v.id = l.variant_id and v.vendor_id = l.vendor_id
  join products p on p.id = v.product_id and p.vendor_id = v.vendor_id
  join marketplace_accounts a on a.id = l.marketplace_account_id and a.vendor_id = l.vendor_id`;
const LISTING_WHERE = (vendorId: string): SQL => sql`l.vendor_id = ${vendorId} and v.deleted_at is null and p.deleted_at is null`;

/** worst first: the one status a product shows on a marketplace when it has several listings there */
const SEVERITY: readonly ScreenStatus[] = ['blocked', 'failed', 'needs_review', 'syncing', 'ready', 'live'];

const list = (items: string[]): SQL => sql.join(items.map((i) => sql`${i}`), sql`, `);

export type MatrixStatus = ScreenStatus | 'not_listed';

export interface MatrixCell { status: MatrixStatus; listings: number; listedVariants: number; byStatus: Partial<Record<ScreenStatus, number>> }

export async function matrix(ctx: Ctx, tx: Tx, limit: number) {
  const vendorId = ctx.vendorId;
  const channelRows = (await tx.execute<{ marketplace: string; accounts: number; active: number }>(
    sql`select a.marketplace, count(*)::int accounts, count(*) filter (where a.status = 'active')::int active from marketplace_accounts a where a.vendor_id = ${vendorId} group by a.marketplace order by a.marketplace`,
  )).rows;

  const total = Number((await tx.execute<{ n: number }>(sql`select count(*)::int n from products p where p.vendor_id = ${vendorId} and p.deleted_at is null and p.status = 'active'`)).rows[0]!.n);
  // the products that need a look first (listings that need attention), then the most listed
  const products = (await tx.execute<{ id: string; title: string; code: string; variants: number }>(sql`
    select p.id, p.title, p.product_code code, (select count(*)::int from product_variants v where v.vendor_id = p.vendor_id and v.product_id = p.id and v.deleted_at is null) variants
    from products p
    left join (select v.product_id pid, count(*) filter (where ${STATUS_EXPR} in (${ATTENTION_LIST})) attention, count(*) listed
      from marketplace_listings l join product_variants v on v.id = l.variant_id and v.vendor_id = l.vendor_id
      where l.vendor_id = ${vendorId} group by v.product_id) x on x.pid = p.id
    where p.vendor_id = ${vendorId} and p.deleted_at is null and p.status = 'active'
    order by coalesce(x.attention, 0) desc, coalesce(x.listed, 0) desc, lower(p.title), p.id
    limit ${limit}`)).rows;

  const cells = products.length === 0 ? [] : (await tx.execute<{ product_id: string; marketplace: string; s: ScreenStatus; n: number }>(sql`
    select v.product_id, a.marketplace, ${STATUS_EXPR} s, count(*)::int n ${LISTING_FROM}
    where ${LISTING_WHERE(vendorId)} and v.product_id in (${list(products.map((p) => p.id))})
    group by v.product_id, a.marketplace, 3`)).rows;
  const listedVariants = products.length === 0 ? [] : (await tx.execute<{ product_id: string; marketplace: string; variants: number }>(sql`
    select v.product_id, a.marketplace, count(distinct l.variant_id)::int variants ${LISTING_FROM}
    where ${LISTING_WHERE(vendorId)} and v.product_id in (${list(products.map((p) => p.id))})
    group by v.product_id, a.marketplace`)).rows;

  const marketplaces = [...new Set([...channelRows.map((c) => c.marketplace), ...cells.map((c) => c.marketplace)])].sort();
  const channels = marketplaces.map((code) => {
    const c = channelRows.find((x) => x.marketplace === code);
    return { code, name: marketplaceNameOf(ctx.c.connectors, code), accounts: c?.accounts ?? 0, connected: (c?.active ?? 0) > 0 };
  });

  const items = products.map((p) => {
    const byMarket: Record<string, MatrixCell> = {};
    for (const code of marketplaces) {
      const mine = cells.filter((c) => c.product_id === p.id && c.marketplace === code);
      const byStatus: Partial<Record<ScreenStatus, number>> = {};
      for (const c of mine) byStatus[c.s] = Number(c.n);
      const status: MatrixStatus = SEVERITY.find((s) => (byStatus[s] ?? 0) > 0) ?? 'not_listed';
      byMarket[code] = {
        status, byStatus, listings: mine.reduce((a, c) => a + Number(c.n), 0),
        listedVariants: Number(listedVariants.find((c) => c.product_id === p.id && c.marketplace === code)?.variants ?? 0),
      };
    }
    const signal: MatrixStatus = SEVERITY.find((s) => Object.values(byMarket).some((c) => c.status === s)) ?? 'not_listed';
    return { productId: p.id, title: p.title, sku: p.code, variantsCount: Number(p.variants), signal, channels: byMarket };
  });
  return { total, channels, items };
}

export async function insights(ctx: Ctx, tx: Tx) {
  const vendorId = ctx.vendorId;
  const rows = await overviewCounts(tx, vendorId, {});
  const count = (s: ScreenStatus) => rows.filter((r) => r.s === s).reduce((a, r) => a + r.n, 0);
  const one = async (q: SQL): Promise<number> => Number((await tx.execute<{ n: number }>(q)).rows[0]?.n ?? 0);

  const masterProducts = await one(sql`select count(*)::int n from products p where p.vendor_id = ${vendorId} and p.deleted_at is null and p.status = 'active'`);
  const connectedChannels = await one(sql`select count(distinct a.marketplace)::int n from marketplace_accounts a where a.vendor_id = ${vendorId} and a.status = 'active'`);

  const notReady = await one(sql`select count(*)::int n ${LISTING_FROM} where ${LISTING_WHERE(vendorId)} and ${STATUS_EXPR} in (${ATTENTION_LIST})`);
  // each chip counts with the very predicate the table filter uses, so a chip's number is the size of the list it opens
  const issueCount = (issue: ListingIssueKey) => one(sql`select count(*)::int n ${LISTING_FROM} where ${LISTING_WHERE(vendorId)} and ${issuePredicate(ctx, issue)}`);
  const missingImages = await issueCount('missing_images');
  const missingAttributes = await issueCount('missing_attributes');
  const categoryMismatch = await issueCount('category_mismatch');
  const variantIssues = await issueCount('variant_issues');

  return {
    masterProducts, connectedChannels, activeListings: count('live'), readyToPublish: count('ready'), needReview: count('needs_review'),
    issues: { notReady, missingAttributes, missingImages, categoryMismatch, variantIssues },
  };
}

const MatrixCellSchema = z.object({
  status: z.enum([...SCREEN_STATUSES, 'not_listed']).describe('The worst status among the product\'s listings on this marketplace, not_listed when it has none'),
  listings: z.number().int(), listedVariants: z.number().int().describe('Variants of the product that have a listing on this marketplace'),
  byStatus: z.record(z.string(), z.number().int()),
});

export const listInsightsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(listChannelRoutes);
  await app.register(listCreateRoutes);
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Listings Workspace'];
  const ctxOf = (req: FastifyRequest) => ctxFromRequest(req, requireVendor(req));

  r.get('/listings/matrix', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Master products x marketplaces: where each product stands on every channel',
      description: 'The listing matrix on top of the Listings screen. One row per active master product (those with listings that need attention first, then the most listed), one cell per marketplace of the connected accounts. A cell shows the worst screen status of the product\'s listings there, or not_listed. `signal` is the worst status over the row. `total` is the number of active master products.',
      querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(5) }),
      response: { 200: successEnvelope(z.object({
        total: z.number().int(),
        channels: z.array(z.object({ code: z.string(), name: z.string(), accounts: z.number().int(), connected: z.boolean().describe('At least one active account') })),
        items: z.array(z.object({ productId: z.string(), title: z.string(), sku: z.string().describe('Product code'), variantsCount: z.number().int(), signal: z.enum([...SCREEN_STATUSES, 'not_listed']), channels: z.record(z.string(), MatrixCellSchema) })),
      }).meta({ id: 'ListingsMatrix' })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx) => matrix(ctxOf(req), tx, req.query.limit))));

  r.get('/listings/insights', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Catalogue reach and why listings are not ready',
      description: 'The figures under the matrix of the Listings screen. `issues.notReady` is the number of listings that need attention (needs review, failed or blocked); missingAttributes, missingImages and categoryMismatch count those listings by cause (one listing can count in several); variantIssues counts the listings whose product has a sibling variant that is not listed on the same account. Each count is the size of the list GET /listings/table returns for `filter[issue]` with the same name.',
      response: { 200: successEnvelope(z.object({
        masterProducts: z.number().int(), connectedChannels: z.number().int().describe('Marketplaces with an active account'), activeListings: z.number().int(), readyToPublish: z.number().int(), needReview: z.number().int(),
        issues: z.object({ notReady: z.number().int(), missingAttributes: z.number().int(), missingImages: z.number().int(), categoryMismatch: z.number().int(), variantIssues: z.number().int() }),
      }).meta({ id: 'ListingsInsights' })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx) => insights(ctxOf(req), tx))));
};
