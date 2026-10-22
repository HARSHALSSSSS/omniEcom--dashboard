import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, asc, eq, inArray, isNull, schema, withVendor } from '@oms/database';
import { successEnvelope } from '@oms/contracts';
import { ok, requireVendor } from '@oms/module-kit';
import { AppError, Errors } from '@oms/shared';
import { ctxFromRequest, type Ctx } from './ctx';
import { createListing } from './service';
import { marketplaceNameOf } from './workspace-data';

const L = schema.marketplaceListings;
const V = schema.productVariants;
const P = schema.products;
const A = schema.marketplaceAccounts;

/** products x accounts is expanded to variants x accounts; this many pairs per call keeps one request short */
export const BULK_CREATE_MAX_PAIRS = 500;

const BodySchema = z.object({
  productIds: z.array(z.uuid()).max(50).default([]).describe('Master products: every active variant of each is listed'),
  variantIds: z.array(z.uuid()).max(200).default([]).describe('Single variants (added to the variants of productIds)'),
  accountIds: z.array(z.uuid()).min(1).max(20).describe('The marketplace accounts to prepare listings on'),
}).refine((b) => b.productIds.length + b.variantIds.length > 0, { message: 'Choose at least one product or variant', path: ['productIds'] });

export type BulkCreateStatus = 'created' | 'exists' | 'failed';
export interface BulkCreateItem {
  index: number; variantId: string; accountId: string; sku: string | null; productTitle: string | null; accountName: string | null; marketplace: string | null;
  ok: boolean; status: BulkCreateStatus; listingId: string | null; message: string; error: { code: string; message: string } | null;
}

/**
 * Master products (or variants) x marketplace accounts -> a draft listing for every pair that has none yet. Idempotent: a pair that already
 * has a listing answers `exists` with that listing's id and creates nothing. One pair failing (an account that is not connected, a
 * marketplace that does not take listings through the API) never stops the others: the answer is 200 with one result per pair.
 */
export async function bulkCreate(ctx: Ctx, input: z.infer<typeof BodySchema>) {
  const { vendorId, c } = ctx;
  const accountIds = [...new Set(input.accountIds)];
  const lookup = await withVendor(c.database.db, vendorId, async (tx) => {
    const fromProducts = input.productIds.length
      ? await tx.select({ id: V.id, sku: V.sku, productId: V.productId, title: P.title }).from(V).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId)))
        .where(and(eq(V.vendorId, vendorId), inArray(V.productId, [...new Set(input.productIds)]), isNull(V.deletedAt), isNull(P.deletedAt), eq(V.status, 'active')))
      : [];
    const direct = input.variantIds.length
      ? await tx.select({ id: V.id, sku: V.sku, productId: V.productId, title: P.title }).from(V).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId)))
        .where(and(eq(V.vendorId, vendorId), inArray(V.id, [...new Set(input.variantIds)]), isNull(V.deletedAt), isNull(P.deletedAt)))
      : [];
    const accounts = await tx.select({ id: A.id, name: A.displayName, marketplace: A.marketplace }).from(A).where(and(eq(A.vendorId, vendorId), inArray(A.id, accountIds))).orderBy(asc(A.displayName), asc(A.id));
    return { variants: [...new Map([...fromProducts, ...direct].map((v) => [v.id, v])).values()], accounts };
  });
  const variants = lookup.variants.sort((a, b) => a.title.localeCompare(b.title) || a.sku.localeCompare(b.sku));
  const accountById = new Map(lookup.accounts.map((a) => [a.id, a]));
  const pairs = variants.length * accountIds.length;
  if (pairs > BULK_CREATE_MAX_PAIRS) throw Errors.validation({ field: 'accountIds', message: `At most ${BULK_CREATE_MAX_PAIRS} listings per call (${variants.length} variants x ${accountIds.length} accounts): choose fewer products or accounts` });

  const items: BulkCreateItem[] = [];
  const record = (variant: (typeof variants)[number] | undefined, variantId: string, accountId: string, status: BulkCreateStatus, message: string, extra: { listingId?: string | null; code?: string } = {}) => {
    const acct = accountById.get(accountId);
    items.push({
      index: items.length, variantId, accountId, sku: variant?.sku ?? null, productTitle: variant?.title ?? null, accountName: acct?.name ?? null, marketplace: acct?.marketplace ?? null,
      ok: status !== 'failed', status, listingId: extra.listingId ?? null, message, error: status === 'failed' ? { code: extra.code ?? 'ERROR', message } : null,
    });
  };

  // variants the caller named that do not exist (or belong to someone else) are reported, not silently dropped
  const found = new Set(variants.map((v) => v.id));
  for (const variantId of new Set(input.variantIds)) {
    if (!found.has(variantId)) for (const accountId of accountIds) record(undefined, variantId, accountId, 'failed', 'Variant not found', { code: 'NOT_FOUND' });
  }

  for (const variant of variants) {
    for (const accountId of accountIds) {
      try {
        const existing = await withVendor(c.database.db, vendorId, async (tx) => (await tx.select({ id: L.id }).from(L).where(and(eq(L.vendorId, vendorId), eq(L.marketplaceAccountId, accountId), eq(L.variantId, variant.id))))[0]);
        if (existing) { record(variant, variant.id, accountId, 'exists', 'Already has a listing here', { listingId: existing.id }); continue; }
        const dto = await withVendor(c.database.db, vendorId, (tx) => createListing(tx, ctx, { marketplaceAccountId: accountId, variantId: variant.id }));
        record(variant, variant.id, accountId, 'created', 'Draft listing created', { listingId: dto.id });
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
        const dup = e.code === 'CONFLICT' ? (e.details as { listingId?: string } | undefined)?.listingId : undefined;
        if (dup) record(variant, variant.id, accountId, 'exists', 'Already has a listing here', { listingId: dup });
        else record(variant, variant.id, accountId, 'failed', e.message, { code: e.code });
      }
    }
  }

  const count = (s: BulkCreateStatus) => items.filter((i) => i.status === s).length;
  const marketplaces = [...new Set(items.flatMap((i) => (i.marketplace ? [i.marketplace] : [])))].map((code) => ({ code, name: marketplaceNameOf(c.connectors, code) }));
  return { summary: { total: items.length, created: count('created'), existing: count('exists'), failed: count('failed') }, marketplaces, results: items };
}

export const listCreateRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const ctxOf = (req: FastifyRequest): Ctx => ctxFromRequest(req, requireVendor(req));

  r.post('/listings/bulk-create', {
    config: { access: { permission: 'listings:write' } },
    schema: {
      tags: ['Listings Workspace'], summary: 'Prepare draft listings: master products (or variants) x marketplace accounts',
      description: `The "Create master listing" dialog of the Listings screen. Every active variant of each product (plus the variants named) is paired with each account, and a draft listing is created for every pair that has none yet (POST /listings per pair, same rules). Idempotent: a pair that already has a listing answers \`exists\` with the listing id. At most ${BULK_CREATE_MAX_PAIRS} pairs per call. Partial success inside HTTP 200: one result per pair (created | exists | failed).`,
      body: BodySchema,
      response: { 200: successEnvelope(z.object({
        summary: z.object({ total: z.number().int(), created: z.number().int(), existing: z.number().int(), failed: z.number().int() }),
        marketplaces: z.array(z.object({ code: z.string(), name: z.string() })),
        results: z.array(z.object({
          index: z.number().int(), variantId: z.string(), accountId: z.string(), sku: z.string().nullable(), productTitle: z.string().nullable(), accountName: z.string().nullable(), marketplace: z.string().nullable(),
          ok: z.boolean(), status: z.enum(['created', 'exists', 'failed']), listingId: z.string().nullable(), message: z.string(), error: z.object({ code: z.string(), message: z.string() }).nullable(),
        })),
      }).meta({ id: 'ListingsBulkCreate' })) },
    },
  }, async (req) => ok(req, await bulkCreate(ctxOf(req), req.body)));
};
