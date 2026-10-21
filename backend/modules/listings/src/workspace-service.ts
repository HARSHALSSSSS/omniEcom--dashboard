import { and, asc, desc, eq, inArray, isNull, schema, sql, withVendor, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { availabilityFor } from '@oms/mod-inventory';
import { getPolicy } from './channel';
import { channelOverrides, overriddenFields } from './content-domain';
import { lookupMarketplaceCategory } from './content';
import type { Ctx } from './ctx';
import { computeSellable } from './domain';
import { evaluate, getListingDto, joined, toListingDto, type Evaluation } from './service';
import { asPolicy, enrichListings, listNotListed, listTable, marketplaceNameOf, notListedCounts, overviewCounts, type OverviewFilter, type TableBlock, type TableFilter } from './workspace-data';
import { ATTENTION_STATUSES, buildReadiness, describeActivity, externalListingUrl, listingActions, SCREEN_STATUSES, type ReadinessFacts, type Readiness, type ScreenStatus } from './workspace-domain';

const L = schema.marketplaceListings;
const V = schema.productVariants;
const A = schema.marketplaceAccounts;
const DOC = schema.productDocuments;

type Dto = Awaited<ReturnType<typeof getListingDto>>;
export type WorkspaceRow = Dto & { table: TableBlock };

const stripFull = ({ readinessFull: _r, ...block }: TableBlock & { readinessFull: Readiness }): TableBlock => block;

/** listing DTOs of the given ids, in that order, each with its table block */
export async function rowsWithTable(ctx: Ctx, tx: Tx, ids: string[]): Promise<WorkspaceRow[]> {
  if (ids.length === 0) return [];
  const joinedRows = await joined(tx, ctx.vendorId, inArray(L.id, ids));
  const blocks = await enrichListings(tx, ctx.c, ctx.vendorId, joinedRows);
  const byId = new Map(joinedRows.map((r) => [r.l.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    const b = blocks.get(id);
    return r && b ? [{ ...toListingDto(r), table: stripFull(b) }] : [];
  });
}

// ------------------------------------------------------------------------------------------------
// overview + table + not listed
// ------------------------------------------------------------------------------------------------
const listableMarketplaces = (ctx: Ctx): string[] => ctx.c.connectors.supporting((x) => x.implementation !== 'planned' && x.capabilities.listings.create).map((x) => x.code);

export async function overview(ctx: Ctx, tx: Tx, f: OverviewFilter) {
  const rows = await overviewCounts(tx, ctx.vendorId, f);
  const notListed = await notListedCounts(tx, ctx.vendorId, listableMarketplaces(ctx), f);
  const sum = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).reduce((a, r) => a + r.n, 0);
  const byScreenStatus = Object.fromEntries(SCREEN_STATUSES.map((s) => [s, sum((r) => r.s === s)])) as Record<ScreenStatus, number>;
  const byStatus: Record<string, number> = {};
  const byContentState: Record<string, number> = {};
  for (const r of rows) { byStatus[r.status] = (byStatus[r.status] ?? 0) + r.n; byContentState[r.cs] = (byContentState[r.cs] ?? 0) + r.n; }
  const notListedTotal = notListed.reduce((a, r) => a + r.n, 0);
  const marketplaces = [...new Set([...rows.map((r) => r.m), ...notListed.map((r) => r.marketplace)])].sort();
  return {
    totals: { listings: sum(() => true), live: byScreenStatus.live, needsAttention: sum((r) => ATTENTION_STATUSES.includes(r.s)), notListed: notListedTotal },
    byScreenStatus: { ...byScreenStatus, not_listed: notListedTotal },
    byStatus, byContentState,
    byMarketplace: marketplaces.map((m) => ({
      marketplace: m, name: marketplaceNameOf(ctx.c.connectors, m), total: sum((r) => r.m === m), live: sum((r) => r.m === m && r.s === 'live'),
      needsAttention: sum((r) => r.m === m && ATTENTION_STATUSES.includes(r.s)), notListed: notListed.filter((n) => n.marketplace === m).reduce((a, r) => a + r.n, 0),
    })),
  };
}

export async function table(ctx: Ctx, tx: Tx, f: TableFilter, page: { page: number; pageSize: number }, sort?: { field: string; direction: 'asc' | 'desc' }) {
  const r = await listTable(tx, ctx.vendorId, f, { limit: page.pageSize, offset: (page.page - 1) * page.pageSize }, sort);
  return { items: await rowsWithTable(ctx, tx, r.ids), total: r.total, counts: r.counts };
}

export async function notListed(ctx: Ctx, tx: Tx, f: OverviewFilter & { q?: string }, page: { page: number; pageSize: number }) {
  const r = await listNotListed(tx, ctx.vendorId, listableMarketplaces(ctx), f, { limit: page.pageSize, offset: (page.page - 1) * page.pageSize });
  return {
    total: r.total,
    items: r.rows.map((x) => ({
      variantId: x.variant_id, productId: x.product_id, sku: x.sku, barcode: x.barcode, productTitle: x.title, priceMinor: x.price, mrpMinor: x.mrp,
      accountId: x.account_id, accountName: x.account_name, marketplace: x.marketplace, marketplaceName: marketplaceNameOf(ctx.c.connectors, x.marketplace),
    })),
  };
}

// ------------------------------------------------------------------------------------------------
// readiness (live: the marketplace is asked for the category requirements)
// ------------------------------------------------------------------------------------------------
async function facts(tx: Tx, ctx: Ctx, ev: Evaluation): Promise<ReadinessFacts> {
  const { listing, input, product, variant, account } = ev.context;
  const policyRow = await getPolicy(tx, ctx.vendorId, account.id);
  const av = (await availabilityFor(tx, ctx.vendorId, [variant.id], policyRow?.warehouseIds?.length ? policyRow.warehouseIds : undefined)).get(variant.id)?.available ?? 0;
  const [primary] = await tx.select({ width: DOC.width, height: DOC.height }).from(DOC)
    .where(and(eq(DOC.vendorId, ctx.vendorId), eq(DOC.productId, product.id), eq(DOC.kind, 'image'), isNull(DOC.deletedAt), inArray(DOC.status, ['uploaded', 'processed']))).orderBy(desc(DOC.isPrimary), asc(DOC.sortOrder), asc(DOC.createdAt)).limit(1);
  const connector = ctx.c.connectors.get(account.marketplace);
  return {
    title: input.title, description: input.description ?? null, brand: input.brand ?? null, barcode: input.barcode ?? null, imageCount: ev.context.imageKeys.length, primaryImage: primary ?? null,
    priceMinor: input.priceMinor, mrpMinor: input.mrpMinor ?? null, marketplaceCategoryId: input.marketplaceCategoryId ?? null, categoryRequired: connector.capabilities.listings.requiresCategoryMapping,
    available: av, sellable: computeSellable(av, asPolicy(policyRow ?? undefined), { buffer: listing.bufferOverride, max: listing.maxQuantityOverride }),
    validation: { validated: true, errors: ev.result.errors, warnings: ev.result.warnings, requiredAttributes: ev.requirements.filter((r) => r.required).length },
    marketplaceIssues: listing.issues,
  };
}

export async function readiness(ctx: Ctx, listingId: string) {
  const ev = await evaluate(ctx, listingId, { signImages: false });
  const result = await withVendor(ctx.c.database.db, ctx.vendorId, async (tx) => buildReadiness(await facts(tx, ctx, ev)));
  return { listingId, evaluatedAt: new Date().toISOString(), marketplace: ev.context.account.marketplace, ...result };
}

// ------------------------------------------------------------------------------------------------
// activity
// ------------------------------------------------------------------------------------------------
export async function activity(tx: Tx, vendorId: string, listingId: string, page: { page: number; pageSize: number }) {
  const AL = schema.auditLogs;
  const where = and(eq(AL.vendorId, vendorId), eq(AL.resourceType, 'listing'), eq(AL.resourceId, listingId));
  const total = Number((await tx.select({ n: sql<number>`count(*)::int` }).from(AL).where(where))[0]!.n);
  const rows = await tx.select().from(AL).where(where).orderBy(desc(AL.createdAt), desc(AL.id)).limit(page.pageSize).offset((page.page - 1) * page.pageSize);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const userIds = [...new Set(rows.filter((r) => r.actorType === 'user' && r.actorId && uuid.test(r.actorId)).map((r) => r.actorId!))];
  const names = new Map(userIds.length ? (await tx.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.users).where(inArray(schema.users.id, userIds))).map((u) => [u.id, u.name]) : []);
  return {
    total,
    items: rows.map((r) => {
      const d = describeActivity({ action: r.action, before: r.before, after: r.after, metadata: r.metadata });
      const actor = r.actorType === 'user' ? names.get(r.actorId ?? '') ?? 'A team member' : r.actorType === 'api_key' ? 'API key' : r.actorType === 'webhook' ? 'Marketplace' : 'System';
      return { id: String(r.id), at: r.createdAt.toISOString(), action: r.action, title: d.title, details: d.details, actor: { type: r.actorType, id: r.actorId, name: actor } };
    }),
  };
}

// ------------------------------------------------------------------------------------------------
// studio: everything of the Listing Studio screen in one call
// ------------------------------------------------------------------------------------------------
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : typeof v === 'string' && v.trim() ? v.split('\n').map((x) => x.trim()).filter(Boolean) : []);
const pick = (data: Record<string, unknown>, ...keys: string[]): unknown => keys.map((k) => data[k]).find((v) => v !== undefined && v !== null);

export async function studio(ctx: Ctx, listingId: string) {
  const { c, vendorId } = ctx;
  const ev = await evaluate(ctx, listingId, { signImages: false });
  const { listing, product, variant, account, input } = ev.context;
  const connector = c.connectors.get(account.marketplace);
  const preview = connector.previewListing ? connector.previewListing(input) : { endpoint: `${connector.code}: createListing`, payload: input, warnings: ['This connector has no payload preview; showing the normalised listing'] };
  // the marketplace's own name for the category: a saved mapping first, else the marketplace's tree (never a failure of the page)
  let categoryName: string | null = null;
  if (input.marketplaceCategoryId) {
    categoryName = (await withVendor(c.database.db, vendorId, (tx) => tx.select({ n: schema.categoryMappings.marketplaceCategoryName }).from(schema.categoryMappings)
      .where(and(eq(schema.categoryMappings.vendorId, vendorId), eq(schema.categoryMappings.marketplace, account.marketplace), eq(schema.categoryMappings.marketplaceCategoryId, input.marketplaceCategoryId!))).limit(1)))[0]?.n ?? null;
    if (!categoryName && account.status === 'active') {
      try { categoryName = (await lookupMarketplaceCategory(c, vendorId, account.id, input.marketplaceCategoryId))?.name ?? null; } catch (e) { if (!(e instanceof AppError)) throw e; }
    }
  }
  return withVendor(c.database.db, vendorId, async (tx) => {
    const [row] = await joined(tx, vendorId, eq(L.id, listingId));
    if (!row) throw Errors.notFound('Listing', listingId);
    const blocks = await enrichListings(tx, c, vendorId, [row]);
    const block = blocks.get(listingId)!;
      const readinessFull = buildReadiness(await facts(tx, ctx, ev));

    const [md] = await tx.select({ data: schema.productMarketplaceData.data }).from(schema.productMarketplaceData)
      .where(and(eq(schema.productMarketplaceData.vendorId, vendorId), eq(schema.productMarketplaceData.productId, product.id), eq(schema.productMarketplaceData.marketplace, account.marketplace)));
    const data = md?.data ?? {};
    const over = overriddenFields(data);
    const eff = channelOverrides(data);
    const bullets = arr(pick(data, 'bullets', 'bullet_points', 'bulletPoints'));
    const terms = arr(pick(data, 'search_terms', 'searchTerms', 'keywords', 'tags'));
    const [cat] = product.categoryId ? await tx.select({ name: schema.categories.name }).from(schema.categories).where(and(eq(schema.categories.vendorId, vendorId), eq(schema.categories.id, product.categoryId))) : [];
    const content = {
      title: { master: product.title, effective: eff.title ?? product.title, overridden: over.includes('title') && eff.title !== undefined },
      description: { master: product.description, effective: eff.description ?? product.description, overridden: eff.description !== undefined },
      bulletPoints: { master: [] as string[], effective: bullets, overridden: bullets.length > 0 },
      searchTerms: { master: product.tags ?? [], effective: terms.length ? terms : product.tags ?? [], overridden: terms.length > 0 },
      brand: { master: product.brand, effective: eff.brand ?? product.brand, overridden: eff.brand !== undefined },
      manufacturer: { master: product.manufacturer, effective: product.manufacturer, overridden: false },
    };

    const docs = await tx.select().from(DOC).where(and(eq(DOC.vendorId, vendorId), eq(DOC.productId, product.id), eq(DOC.kind, 'image'), isNull(DOC.deletedAt), inArray(DOC.status, ['uploaded', 'processed']))).orderBy(desc(DOC.isPrimary), asc(DOC.sortOrder), asc(DOC.createdAt));
    const media = await Promise.all(docs.map(async (d) => {
      let url: string | null = null;
      try { url = await c.storage.presignDownload(d.storageKey, 3600); } catch { /* storage without signed downloads */ }
      return { id: d.id, url, fileName: d.fileName, isPrimary: d.isPrimary, width: d.width, height: d.height, sizeBytes: d.sizeBytes, isPlaceholder: d.isPlaceholder };
    }));

    const siblings = await tx.select({ v: V, listingId: L.id, status: L.status }).from(V)
      .leftJoin(L, and(eq(L.variantId, V.id), eq(L.vendorId, V.vendorId), eq(L.marketplaceAccountId, account.id)))
      .where(and(eq(V.vendorId, vendorId), eq(V.productId, product.id), isNull(V.deletedAt))).orderBy(asc(V.sku)).limit(200);
    const stockBy = await availabilityFor(tx, vendorId, siblings.map((s) => s.v.id));
    const variations = siblings.map((s) => ({
      variantId: s.v.id, sku: s.v.sku, optionValues: s.v.optionValues, priceMinor: s.v.sellingPriceMinor, available: stockBy.get(s.v.id)?.available ?? 0,
      listingId: s.listingId, listingStatus: s.status, current: s.v.id === variant.id,
    }));

    const price = block.priceMinor;
    const discountPercent = price !== null && block.mrpMinor !== null && block.mrpMinor > 0 && price < block.mrpMinor ? Math.round((1 - price / block.mrpMinor) * 100) : 0;
    const [acct] = await tx.select({ mode: A.mode }).from(A).where(eq(A.id, account.id));
    const stored = listing.validation as { validatedAt?: string; ready?: boolean };
    const actions = listingActions({
      status: listing.status, contentState: listing.contentState, externalListingId: listing.externalListingId, accountStatus: account.status,
      canCreate: connector.capabilities.listings.create && connector.implementation !== 'planned', canUpdate: connector.capabilities.listings.update, canDeactivate: connector.capabilities.listings.deactivate,
      canPushInventory: connector.capabilities.inventory.push, validationReady: stored.validatedAt ? Boolean(stored.ready) : null,
      approvalCurrent: listing.approvedHash === null ? null : listing.approvedHash === ev.context.hash, inventoryPaused: (await getPolicy(tx, vendorId, account.id))?.mode === 'paused',
    });
    return {
      listing: { ...toListingDto(row), table: stripFull(block) },
      product: { id: product.id, variantId: variant.id, sku: variant.sku, title: product.title, brand: product.brand, barcode: variant.barcode, categoryName: cat?.name ?? null, optionValues: variant.optionValues, thumbnailUrl: block.thumbnailUrl },
      account: { id: account.id, displayName: account.displayName, marketplace: account.marketplace, marketplaceName: marketplaceNameOf(c.connectors, account.marketplace), status: account.status, mode: acct?.mode ?? account.mode },
      content,
      preview: {
        marketplace: account.marketplace, title: input.title, description: input.description ?? null, bulletPoints: bullets, priceMinor: price, mrpMinor: block.mrpMinor, discountPercent,
        images: media.flatMap((m) => (m.url ? [m.url] : [])).slice(0, 10), endpoint: preview.endpoint, payload: preview.payload, warnings: [...preview.warnings, ...ev.result.warnings.map((w) => w.message)],
        approval: { approved: listing.approvedHash !== null, current: listing.approvedHash === ev.context.hash, approvedAt: listing.approvedAt ? listing.approvedAt.toISOString() : null }, contentHash: ev.context.hash,
      },
      readiness: readinessFull,
      pricing: {
        priceMinor: price, mrpMinor: block.mrpMinor, salePriceMinor: block.salePriceMinor, saleEndsAt: block.saleEndsAt, discountPercent,
        variantPriceMinor: variant.sellingPriceMinor, variantMrpMinor: variant.mrpMinor, listingPriceOverride: listing.priceMinor !== null, listingMrpOverride: listing.mrpMinor !== null,
        costMinor: variant.costPriceMinor, grossMarginMinor: price !== null && variant.costPriceMinor !== null ? price - variant.costPriceMinor : null, currency: listing.currency.trim(),
      },
      stock: { ...block.stock, bufferOverride: listing.bufferOverride, maxQuantityOverride: listing.maxQuantityOverride, pushedAt: listing.quantityPushedAt ? listing.quantityPushedAt.toISOString() : null },
      category: {
        marketplaceCategoryId: input.marketplaceCategoryId ?? null, marketplaceCategoryName: categoryName ?? block.marketplaceCategoryName, masterCategoryName: cat?.name ?? null,
        attributes: ev.requirements.map((r) => {
          const value = input.attributes?.[r.name];
          const source = ev.context.attributeSources[r.name] ?? null;
          const missing = value === undefined || value === '' || value === null;
          return {
            key: r.name, label: r.label ?? r.name, required: r.required, type: r.type, allowedValues: r.allowedValues ?? null, maxLength: r.maxLength ?? null, value: missing ? null : value, source,
            channelSpecific: source === 'listing' || source === 'channel', status: missing ? (r.required ? 'fail' : 'warn') : ev.result.errors.some((e) => e.attribute === r.name) ? 'fail' : 'pass',
          };
        }),
      },
      media, variations,
      contentSync: {
        state: listing.contentState, changedFields: listing.contentChangedFields, review: listing.contentReview, error: listing.contentError,
        changedAt: listing.contentChangedAt ? listing.contentChangedAt.toISOString() : null, syncedAt: listing.contentSyncedAt ? listing.contentSyncedAt.toISOString() : null,
      },
      marketplaceIssues: listing.issues,
      externalUrl: externalListingUrl(account.marketplace, listing.externalListingId, acct?.mode ?? account.mode),
      activity: await activity(tx, vendorId, listingId, { page: 1, pageSize: 20 }),
      actions,
    };
  });
}
