import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Tx } from '@oms/database';
import { successEnvelope } from '@oms/contracts';
import { ok, requireVendor, vendorTx } from '@oms/module-kit';
import { ctxFromRequest, type Ctx } from './ctx';
import { CHANNEL_GROUPS } from './list-filters';
import { marketplaceNameOf, notListedCounts } from './workspace-data';
import { ATTENTION_STATUSES, SCREEN_STATUS_SQL } from './workspace-domain';

/**
 * Read models behind the filters and tabs of the Listings screen: the channel tabs (every marketplace of the connector registry with its
 * accounts, listings and not-listed products, plus the channel groups such as "Social Commerce") and the options of the category filter.
 */

const STATUS_EXPR = sql.raw(`(${SCREEN_STATUS_SQL})`);
const ATTENTION_LIST = sql.raw(ATTENTION_STATUSES.map((s) => `'${s}'`).join(', '));

export async function channelSummary(ctx: Ctx, tx: Tx) {
  const vendorId = ctx.vendorId;
  const reg = ctx.c.connectors;
  const accounts = (await tx.execute<{ marketplace: string; accounts: number; active: number }>(
    sql`select a.marketplace, count(*)::int accounts, count(*) filter (where a.status = 'active')::int active from marketplace_accounts a where a.vendor_id = ${vendorId} group by a.marketplace`,
  )).rows;
  const listings = (await tx.execute<{ marketplace: string; listings: number; live: number; attention: number; drafts: number }>(sql`
    select a.marketplace, count(*)::int listings, count(*) filter (where ${STATUS_EXPR} = 'live')::int live, count(*) filter (where ${STATUS_EXPR} in (${ATTENTION_LIST}))::int attention,
      count(*) filter (where l.status = 'draft')::int drafts
    from marketplace_listings l
      join product_variants v on v.id = l.variant_id and v.vendor_id = l.vendor_id
      join products p on p.id = v.product_id and p.vendor_id = v.vendor_id
      join marketplace_accounts a on a.id = l.marketplace_account_id and a.vendor_id = l.vendor_id
    where l.vendor_id = ${vendorId} and v.deleted_at is null and p.deleted_at is null group by a.marketplace`)).rows;
  const listable = reg.supporting((x) => x.implementation !== 'planned' && x.capabilities.listings.create).map((x): string => x.code);
  const notListed = await notListedCounts(tx, vendorId, listable, {});

  const codes = [...new Set([...reg.list().map((c) => c.code as string), ...accounts.map((a) => a.marketplace), ...listings.map((l) => l.marketplace)])].sort();
  const channels = codes.map((code) => {
    const a = accounts.find((x) => x.marketplace === code);
    const l = listings.find((x) => x.marketplace === code);
    const group = Object.entries(CHANNEL_GROUPS).find(([, g]) => g.marketplaces.includes(code))?.[0] ?? null;
    return {
      code, name: marketplaceNameOf(reg, code), implementation: reg.has(code) ? reg.get(code).implementation : null, listable: listable.includes(code), group,
      accounts: a?.accounts ?? 0, activeAccounts: a?.active ?? 0, connected: (a?.active ?? 0) > 0,
      listings: l?.listings ?? 0, live: l?.live ?? 0, needsAttention: l?.attention ?? 0, drafts: l?.drafts ?? 0,
      notListed: notListed.filter((n) => n.marketplace === code).reduce((s, n) => s + Number(n.n), 0),
    };
  });
  const groups = Object.entries(CHANNEL_GROUPS).map(([code, g]) => {
    const mine = channels.filter((c) => g.marketplaces.includes(c.code));
    const sum = (k: 'accounts' | 'activeAccounts' | 'listings' | 'live' | 'needsAttention' | 'drafts' | 'notListed') => mine.reduce((s, c) => s + c[k], 0);
    return {
      code, name: g.name, marketplaces: [...g.marketplaces], accounts: sum('accounts'), activeAccounts: sum('activeAccounts'), connected: sum('activeAccounts') > 0,
      listings: sum('listings'), live: sum('live'), needsAttention: sum('needsAttention'), drafts: sum('drafts'), notListed: sum('notListed'),
    };
  });
  return { channels, groups };
}

/** the master categories that have listings (with the number of listings), for the category filter */
export async function filterOptions(ctx: Ctx, tx: Tx) {
  const rows = (await tx.execute<{ id: string; name: string; path: string; listings: number }>(sql`
    select c.id, c.name, c.path, count(l.id)::int listings
    from categories c
      join products p on p.vendor_id = c.vendor_id and p.category_id = c.id and p.deleted_at is null
      join product_variants v on v.vendor_id = p.vendor_id and v.product_id = p.id and v.deleted_at is null
      join marketplace_listings l on l.vendor_id = v.vendor_id and l.variant_id = v.id
    where c.vendor_id = ${ctx.vendorId} and c.deleted_at is null group by c.id, c.name, c.path order by lower(c.name), c.id`)).rows;
  return { categories: rows.map((r) => ({ id: r.id, name: r.name, path: r.path, listings: Number(r.listings) })) };
}

const ChannelSchema = z.object({
  code: z.string(), name: z.string(), implementation: z.string().nullable().describe('planned | beta | ga; null = a code that has accounts or listings but no connector'),
  listable: z.boolean().describe('The connector accepts listings through the API'), group: z.string().nullable().describe('The channel group this marketplace belongs to (social), if any'),
  accounts: z.number().int(), activeAccounts: z.number().int(), connected: z.boolean().describe('At least one active account'),
  listings: z.number().int(), live: z.number().int(), needsAttention: z.number().int(), drafts: z.number().int(), notListed: z.number().int().describe('Variants that could still be listed on an active account of this marketplace'),
});

export const listChannelRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Listings Workspace'];
  const ctxOf = (req: FastifyRequest) => ctxFromRequest(req, requireVendor(req));

  r.get('/listings/channel-summary', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'The channel tabs of the Listings screen: every marketplace with its accounts, listings and not-listed products',
      description: 'One row per marketplace of the connector registry (plus any code that has accounts or listings), sorted by code: accounts, whether one is connected, listings by state (total, live, needs attention, drafts) and the variants that could still be listed. `groups` are tabs that stand for several marketplaces (`social` = Social Commerce: meesho + shopify), with the sums of their members; `filter[marketplace]=social` on the listings endpoints filters by the group. A marketplace without an account shows zeros: the screen offers to connect it.',
      response: { 200: successEnvelope(z.object({
        channels: z.array(ChannelSchema),
        groups: z.array(z.object({
          code: z.string(), name: z.string(), marketplaces: z.array(z.string()), accounts: z.number().int(), activeAccounts: z.number().int(), connected: z.boolean(),
          listings: z.number().int(), live: z.number().int(), needsAttention: z.number().int(), drafts: z.number().int(), notListed: z.number().int(),
        })),
      }).meta({ id: 'ListingsChannelSummary' })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx) => channelSummary(ctxOf(req), tx))));

  r.get('/listings/filter-options', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Options of the Listings screen filters',
      description: 'The master categories that have listings, with the number of listings (a category filter also covers its sub-categories).',
      response: { 200: successEnvelope(z.object({
        categories: z.array(z.object({ id: z.string(), name: z.string(), path: z.string().describe('Slug path, e.g. apparel/men'), listings: z.number().int() })),
      }).meta({ id: 'ListingsFilterOptions' })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx) => filterOptions(ctxOf(req), tx))));
};
