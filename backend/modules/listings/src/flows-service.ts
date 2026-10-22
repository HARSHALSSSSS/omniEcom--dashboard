import { and, asc, eq, isNull, schema, type Tx } from '@oms/database';
import { Errors } from '@oms/shared';
import { availabilityFor } from '@oms/mod-inventory';
import { getPolicy } from './channel';
import type { Ctx } from './ctx';
import { joined } from './service';
import { enrichListings, marketplaceNameOf } from './workspace-data';
import { rowsWithTable } from './workspace-service';

const L = schema.marketplaceListings;
const V = schema.productVariants;
const P = schema.products;
const A = schema.marketplaceAccounts;

export interface ChannelStatus {
  accountId: string; accountName: string; marketplace: string; marketplaceName: string;
  /** the listing of the variant on this account; null = not listed there */
  listingId: string | null;
  screenStatus: 'live' | 'ready' | 'needs_review' | 'syncing' | 'failed' | 'blocked' | 'not_listed';
  readinessPercent: number | null; lastSyncAt: string | null; externalUrl: string | null; current: boolean;
}

const listable = (ctx: Ctx): Set<string> => new Set(ctx.c.connectors.supporting((x) => x.implementation !== 'planned' && x.capabilities.listings.create).map((x) => x.code));

/** the variant on every connected account: its listing status and readiness there, or "not listed" where it could still be listed */
export async function channelsOfVariant(ctx: Ctx, tx: Tx, variantId: string, currentAccountId: string | null): Promise<ChannelStatus[]> {
  const { vendorId, c } = ctx;
  const accounts = await tx.select({ id: A.id, name: A.displayName, marketplace: A.marketplace, status: A.status }).from(A).where(eq(A.vendorId, vendorId)).orderBy(asc(A.marketplace), asc(A.displayName));
  const rows = await joined(tx, vendorId, eq(L.variantId, variantId));
  const blocks = await enrichListings(tx, c, vendorId, rows);
  const byAccount = new Map(rows.map((r) => [r.l.marketplaceAccountId, r]));
  const canList = listable(ctx);
  const out: ChannelStatus[] = [];
  for (const a of accounts) {
    const r = byAccount.get(a.id);
    const b = r ? blocks.get(r.l.id) : undefined;
    const base = { accountId: a.id, accountName: a.name, marketplace: a.marketplace, marketplaceName: marketplaceNameOf(c.connectors, a.marketplace), current: a.id === currentAccountId };
    if (r && b) out.push({ ...base, listingId: r.l.id, screenStatus: b.screenStatus, readinessPercent: b.readiness.percent, lastSyncAt: b.lastSyncAt, externalUrl: b.externalUrl });
    else if (a.status === 'active' && canList.has(a.marketplace)) out.push({ ...base, listingId: null, screenStatus: 'not_listed', readinessPercent: null, lastSyncAt: null, externalUrl: null });
  }
  return out;
}

/** the other channels of the product behind a listing (for the blocker screen and the quick view) */
export async function listingChannels(ctx: Ctx, tx: Tx, listingId: string) {
  const [row] = await joined(tx, ctx.vendorId, eq(L.id, listingId));
  if (!row) throw Errors.notFound('Listing', listingId);
  const variants = await tx.select({ id: V.id }).from(V).where(and(eq(V.vendorId, ctx.vendorId), eq(V.productId, row.productId), isNull(V.deletedAt)));
  return {
    listingId, productId: row.productId, productTitle: row.productTitle, variantId: row.l.variantId, sku: row.sku, variantsCount: variants.length,
    channels: await channelsOfVariant(ctx, tx, row.l.variantId, row.l.marketplaceAccountId),
  };
}

/** what the "not listed yet" screen shows: the variant, the target account, stock, and where else the variant is listed */
export async function unlistedContext(ctx: Ctx, tx: Tx, variantId: string, accountId: string) {
  const { vendorId, c } = ctx;
  const [v] = await tx.select({ id: V.id, sku: V.sku, barcode: V.barcode, productId: P.id, title: P.title, categoryId: P.categoryId, status: V.status })
    .from(V).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).where(and(eq(V.vendorId, vendorId), eq(V.id, variantId), isNull(V.deletedAt), isNull(P.deletedAt)));
  if (!v) throw Errors.notFound('Variant', variantId);
  const [a] = await tx.select({ id: A.id, name: A.displayName, marketplace: A.marketplace, status: A.status }).from(A).where(and(eq(A.vendorId, vendorId), eq(A.id, accountId)));
  if (!a) throw Errors.notFound('Marketplace account', accountId);
  const [cat] = v.categoryId ? await tx.select({ name: schema.categories.name }).from(schema.categories).where(and(eq(schema.categories.vendorId, vendorId), eq(schema.categories.id, v.categoryId))) : [];
  const variants = await tx.select({ id: V.id }).from(V).where(and(eq(V.vendorId, vendorId), eq(V.productId, v.productId), isNull(V.deletedAt)));
  const policy = await getPolicy(tx, vendorId, a.id);
  const available = (await availabilityFor(tx, vendorId, [v.id], policy?.warehouseIds?.length ? policy.warehouseIds : undefined)).get(v.id)?.available ?? 0;
  const [existing] = await tx.select({ id: L.id }).from(L).where(and(eq(L.vendorId, vendorId), eq(L.marketplaceAccountId, a.id), eq(L.variantId, v.id)));
  return {
    variantId: v.id, productId: v.productId, productTitle: v.title, sku: v.sku, barcode: v.barcode, categoryName: cat?.name ?? null, variantsCount: variants.length, inventoryAvailable: available,
    account: { id: a.id, displayName: a.name, marketplace: a.marketplace, marketplaceName: marketplaceNameOf(c.connectors, a.marketplace), status: a.status, canCreateListings: a.status === 'active' && listable(ctx).has(a.marketplace) },
    existingListingId: existing?.id ?? null,
    channels: await channelsOfVariant(ctx, tx, v.id, a.id),
  };
}

/** the selected listings in the order asked, each with its table block (readiness, status, marketplace); ids that do not exist are reported */
export async function selection(ctx: Ctx, tx: Tx, ids: string[]) {
  const unique = [...new Set(ids)];
  const items = await rowsWithTable(ctx, tx, unique);
  const found = new Set(items.map((i) => i.id));
  return { items, missingIds: unique.filter((id) => !found.has(id)) };
}
