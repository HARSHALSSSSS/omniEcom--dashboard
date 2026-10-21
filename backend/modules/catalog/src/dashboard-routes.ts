import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { created, ok, paged, pageWindow, vendorTx } from '@oms/module-kit';
import { IdParamSchema, IsoDate, PageQuerySchema, SearchQuerySchema, pagedEnvelope, successEnvelope, sortQuery } from '@oms/contracts';
import { Errors } from '@oms/shared';
import { requestEffects } from './effects';
import * as dash from './dashboard';
import * as act from './dashboard-actions';
import { ProductDetailSchema, ProductSchema, BulkResultSchema } from './schemas';
import { toCsv } from './csv';

const toArray = <T>(v: T | T[] | undefined): T[] | undefined => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);
const multi = <T extends z.ZodType>(s: T) => z.union([s, z.array(s)]).optional().transform((v) => toArray(v as z.infer<T> | Array<z.infer<T>> | undefined));

// ------------------------------------------------------------------ schemas
const InventoryStatusSchema = z.enum(['healthy', 'low', 'out']);
const ChannelStatusSchema = z.enum(['active', 'attention', 'pending', 'draft', 'unpublished']);
const ChannelRefSchema = z.object({ code: z.string(), name: z.string(), accountId: z.string().nullable().optional() });
const ActionSchema = z.object({ key: z.string(), label: z.string(), method: z.string(), href: z.string(), enabled: z.boolean(), disabledReason: z.string().nullable() });
const ActivityParams = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

const FiltersShape = {
  'filter[categoryId]': multi(z.uuid()),
  'filter[channel]': multi(z.string().trim().min(2).max(40)),
  'filter[inventory]': multi(InventoryStatusSchema),
  'filter[productType]': multi(z.enum(['physical', 'digital', 'service'])),
  'filter[needsAttention]': z.enum(['true', 'false']).optional(),
};
const CatalogSortSchema = sortQuery(['updatedAt', 'title', 'sku', 'inventory'] as const);
const CatalogQuerySchema = PageQuerySchema.extend(SearchQuerySchema.shape).extend({ 'filter[status]': multi(z.enum(['draft', 'active', 'archived'])), ...FiltersShape, sort: CatalogSortSchema });
const ExportQuerySchema = SearchQuerySchema.extend({ 'filter[status]': multi(z.enum(['draft', 'active', 'archived'])), ...FiltersShape, sort: CatalogSortSchema });
const StatsQuerySchema = SearchQuerySchema.extend(FiltersShape);

const StatsSchema = z.object({
  products: z.number().int(), variants: z.number().int(), activeProducts: z.number().int(), activeVariants: z.number().int(),
  draft: z.number().int(), archived: z.number().int(), needsAttention: z.number().int(),
  tabs: z.object({ all: z.number().int(), active: z.number().int(), draft: z.number().int(), archived: z.number().int(), needsAttention: z.number().int() }),
}).meta({ id: 'ProductStats' });

const SummarySchema = z.object({
  thumbnailUrl: z.string().nullable(), skuFamily: z.string(), variantCount: z.number().int(), availableUnits: z.number().int(), inventoryStatus: InventoryStatusSchema,
  channels: z.array(z.object({ code: z.string(), name: z.string(), listingStatus: ChannelStatusSchema })), publishReadinessPct: z.number().int(),
  hint: z.object({ key: z.string(), text: z.string() }),
  primaryAction: z.object({ key: z.enum(['open', 'review_inventory', 'update_inventory', 'continue_editing']), href: z.string() }),
});
const CatalogItemSchema = ProductSchema.extend({ summary: SummarySchema }).meta({ id: 'ProductCatalogItem' });

const FieldSchema = z.object({ key: z.string(), state: z.string() });
const OverviewSchema = z.object({
  product: ProductSchema.extend({ category: z.object({ id: z.string(), name: z.string() }).nullable(), skuFamily: z.string() }),
  primaryImage: z.object({ id: z.string(), url: z.string() }).nullable(),
  health: z.object({ state: z.enum(['ready', 'incomplete']), missing: z.array(z.string()), text: z.string() }),
  inventory: z.object({
    available: z.number().int(), reserved: z.number().int(), incoming: z.number().int(), lowStockVariants: z.number().int(), status: InventoryStatusSchema,
    byWarehouse: z.array(z.object({ warehouseId: z.string(), warehouse: z.string(), available: z.number().int() })),
  }),
  variants: z.object({
    count: z.number().int(), sellable: z.number().int(), options: z.record(z.string(), z.array(z.string())),
    items: z.array(z.object({ variantId: z.string(), name: z.string(), sku: z.string(), optionValues: z.record(z.string(), z.string()), available: z.number().int(), stockStatus: InventoryStatusSchema, status: z.enum(['active', 'inactive']) })),
  }),
  channels: z.object({
    connected: z.number().int(), active: z.number().int(), attention: z.number().int(),
    items: z.array(z.object({ channel: ChannelRefSchema, listingStatus: ChannelStatusSchema, lastSyncAt: IsoDate.nullable(), action: z.object({ key: z.string(), href: z.string() }) })),
  }),
  content: z.object({ pct: z.number().int(), marketplaceContent: z.enum(['ok', 'needs_review', 'not_published']), fields: z.array(FieldSchema) }),
  attentionBanner: z.object({ key: z.string(), text: z.string(), action: z.object({ key: z.string(), href: z.string() }) }).nullable(),
  statusPanel: z.object({
    catalog: z.enum(['ready', 'incomplete']), inventory: InventoryStatusSchema,
    listings: z.object({ state: z.enum(['not_published', 'published']), active: z.number().int(), attention: z.number().int() }),
    content: z.object({ pct: z.number().int(), state: z.enum(['ok', 'needs_review', 'not_published']) }),
    syncLastAt: IsoDate.nullable(),
  }),
  media: z.object({ total: z.number().int(), items: z.array(z.object({ id: z.string(), fileName: z.string(), isPrimary: z.boolean(), url: z.string() })) }),
  recentActivity: z.array(z.object({ at: IsoDate, type: z.enum(['inventory', 'content', 'listings', 'variants']), event: z.string(), params: ActivityParams, text: z.string(), actor: z.object({ type: z.string(), id: z.string().nullable(), name: z.string().nullable() }).nullable() })),
  actions: z.array(ActionSchema),
}).meta({ id: 'ProductOverview' });

const InventoryTabSchema = z.object({
  productId: z.string(),
  totals: z.object({ available: z.number().int(), reserved: z.number().int(), incoming: z.number().int(), lowStockVariants: z.number().int() }),
  health: z.object({ status: InventoryStatusSchema, variants: z.number().int(), lowStockThreshold: z.number().int() }),
  byVariant: z.array(z.object({ variantId: z.string(), name: z.string(), sku: z.string(), available: z.number().int(), reserved: z.number().int(), incoming: z.number().int(), threshold: z.number().int(), status: InventoryStatusSchema })),
  byWarehouse: z.array(z.object({ warehouseId: z.string(), code: z.string(), name: z.string(), available: z.number().int(), onHand: z.number().int(), reserved: z.number().int(), incoming: z.number().int() })),
  lowStock: z.object({ count: z.number().int(), variants: z.array(z.object({ variantId: z.string(), name: z.string(), sku: z.string(), available: z.number().int(), status: z.enum(['low', 'out']) })) }).nullable(),
}).meta({ id: 'ProductInventoryTab' });

const ListingsTabSchema = z.object({
  productId: z.string(),
  summary: z.object({ connected: z.number().int(), active: z.number().int(), attention: z.number().int(), lastSyncAt: IsoDate.nullable() }),
  channels: z.array(z.object({ channel: ChannelRefSchema, listingStatus: ChannelStatusSchema, listings: z.number().int(), lastSyncAt: IsoDate.nullable(), error: z.string().nullable() })),
  items: z.array(z.object({ channel: ChannelRefSchema, listingId: z.string(), variantId: z.string(), sku: z.string(), status: ChannelStatusSchema, rawStatus: z.string(), lastSyncAt: IsoDate.nullable(), error: z.string().nullable() })),
  publicationModel: z.literal('master>listing>marketplace'),
}).meta({ id: 'ProductListingsTab' });

const ContentTabSchema = z.object({
  productId: z.string(),
  readiness: z.object({ pct: z.number().int(), ready: z.boolean(), errors: z.number().int(), warnings: z.number().int(), fields: z.array(FieldSchema) }),
  masterAttributes: z.array(z.object({ attribute: z.string(), value: z.union([z.string(), z.number(), z.boolean(), z.null()]), state: z.enum(['complete', 'missing', 'needs_review']) })),
  marketplaceContent: z.array(z.object({
    channel: z.object({ code: z.string(), name: z.string() }), hasMasterData: z.boolean(), state: z.enum(['ok', 'needs_review', 'not_published']),
    issues: z.array(z.object({ code: z.string(), message: z.string(), severity: z.string() })),
  })),
}).meta({ id: 'ProductContentTab' });

const ActivityItemSchema = z.object({
  at: IsoDate, type: z.enum(['inventory', 'content', 'listings', 'variants']), event: z.string(), params: ActivityParams, text: z.string(),
  actor: z.object({ type: z.string(), id: z.string().nullable(), name: z.string().nullable() }).nullable(),
}).meta({ id: 'ProductActivityItem' });

const optionFilter = /^filter\[option\.([A-Za-z0-9_ -]{1,40})\]$/;
const VariantGridQuerySchema = PageQuerySchema.extend(SearchQuerySchema.shape).extend({
  'filter[color]': multi(z.string().trim().min(1).max(80)),
  'filter[size]': multi(z.string().trim().min(1).max(80)),
  'filter[channel]': multi(z.string().trim().min(2).max(40)),
  'filter[inventory]': multi(InventoryStatusSchema),
  'filter[lifecycle]': multi(z.enum(['active', 'draft', 'archived'])),
  sort: sortQuery(['sku', 'inventory', 'updatedAt', 'createdAt'] as const),
}).catchall(z.union([z.string(), z.array(z.string())])).describe('Any `filter[option.<name>]=value` filters on a variant option (e.g. filter[option.material]=Cotton); repeat for several values.');

const VariantGridItemSchema = z.object({
  id: z.string(), productId: z.string(), sku: z.string(), barcode: z.string().nullable(), name: z.string(), optionValues: z.record(z.string(), z.string()),
  currency: z.string(), mrpMinor: z.number().nullable(), sellingPriceMinor: z.number().nullable(),
  status: z.enum(['active', 'inactive']), lifecycle: z.enum(['active', 'draft', 'archived']),
  stock: z.object({ available: z.number().int(), threshold: z.number().int(), status: InventoryStatusSchema }),
  channels: z.array(z.object({ code: z.string(), name: z.string(), listingStatus: ChannelStatusSchema })),
  leadTimeDays: z.number().int().nullable(), thumbnailUrl: z.string().nullable(), version: z.number().int(), createdAt: IsoDate, updatedAt: IsoDate,
}).meta({ id: 'VariantGridItem' });

const VariantCountsSchema = z.object({ all: z.number().int(), active: z.number().int(), lowStock: z.number().int(), outOfStock: z.number().int(), draft: z.number().int(), archived: z.number().int() }).meta({ id: 'VariantGridCounts' });

const BulkItemsSchema = z.object({ index: z.number().int(), id: z.string().nullable(), ok: z.boolean(), error: z.object({ code: z.string(), message: z.string() }).nullable() });
const ProductBulkBody = z.object({ ids: z.array(z.uuid()).min(1).max(200), action: z.enum(['archive', 'unarchive', 'duplicate', 'check_publish_readiness']) });
const ProductBulkResult = z.object({
  action: z.string(),
  summary: z.object({ total: z.number().int(), succeeded: z.number().int(), failed: z.number().int(), canPublish: z.number().int().optional() }),
  results: z.array(BulkItemsSchema.extend({
    productId: z.string(), status: z.string().optional(), newProductId: z.string().optional(), newProductCode: z.string().optional(),
    canPublish: z.boolean().optional(), missing: z.array(z.object({ code: z.string(), message: z.string() })).optional(), warnings: z.array(z.object({ code: z.string(), message: z.string() })).optional(),
  })),
}).meta({ id: 'ProductBulkActionResult' });

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const PRODUCTS = ['Products'];
  const VARIANTS = ['Variants'];
  const names: dash.ChannelNameFn = (code) => (c.connectors.has(code) ? c.connectors.get(code).displayName : code);
  const filtersOf = (q: z.infer<typeof CatalogQuerySchema> | z.infer<typeof ExportQuerySchema> | z.infer<typeof StatsQuerySchema>): dash.CatalogFilters => ({
    q: q.q,
    status: 'filter[status]' in q ? q['filter[status]'] : undefined,
    categoryId: q['filter[categoryId]'], channel: q['filter[channel]'], inventory: q['filter[inventory]'], productType: q['filter[productType]'],
    needsAttention: q['filter[needsAttention]'] === 'true' ? true : undefined,
  });

  // ================================================================== catalog list
  r.get('/products/stats', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: PRODUCTS,
      summary: 'Catalog counters and tab counts',
      description: [
        'One cheap call for the counters strip and the tab labels. `products`/`variants` count live (not deleted) rows; `activeProducts` = products with status active; `activeVariants` = active variants of active products (Q6: the design\'s "Active 1,042" is variants).',
        '`needsAttention` = products that are not archived AND (active with a blocking readiness check failing [brand, category, HSN, GST, active variant, price, MRP, image] OR having a channel listing that is rejected / needs correction / carries an error code).',
        '`tabs` = { all, active, draft, archived, needsAttention } and always equals the top-level numbers. Optional `q` / `filter[categoryId|channel|inventory|productType]` narrow every number (status and needsAttention are what the tabs split on, so they are not accepted here).',
      ].join(' '),
      querystring: StatsQuerySchema,
      response: { 200: successEnvelope(StatsSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => dash.productStats(tx, vendorId, filtersOf(req.query)))));

  r.get('/products/catalog', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: PRODUCTS,
      summary: 'Products workspace list (numbered pages, filters, card summaries)',
      description: [
        'Numbered pages (`page`, `pageSize` up to 100, deep paging capped at 10,000 rows). `q` searches title, SKU family (product code), variant SKU and barcode (wildcards are escaped).',
        'Filters: `filter[status]`, `filter[categoryId]`, `filter[channel]` (marketplace code that has a listing of the product), `filter[inventory]=healthy|low|out`, `filter[productType]`, `filter[needsAttention]=true`; repeat a filter for several values. Sort: `updatedAt` (default, newest first), `title`, `sku`, `inventory`; prefix `-` for descending.',
        'Each item is the product core plus `summary`: thumbnail (primary image content route), SKU family, variant count, available units, inventory status, channels with listing status, publish readiness % (11 core checks), a hint and the primary action following the card rules (Active: "N listing needs attention" / open; Low stock: "Stock coverage: N days" from the last 30 days of sales, else "Stock is running low" / review inventory; Out of stock: "Potential lost sales" / update inventory; Draft: "Images and description missing" / continue editing).',
        'The old cursor list `GET /products` is unchanged.',
      ].join(' '),
      querystring: CatalogQuerySchema,
      response: { 200: pagedEnvelope(CatalogItemSchema) },
    },
  }, async (req) => {
    const q = req.query;
    const win = pageWindow(q);
    const res = await vendorTx(req, (tx, vendorId) => dash.catalogPage(tx, vendorId, filtersOf(q), q.sort, win, names));
    return paged(req, res.items, q, res.total);
  });

  r.get('/products/export', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: PRODUCTS,
      summary: 'Export the filtered catalog as CSV (synchronous, max 50,000 rows)',
      description: 'Same filters and sort as `GET /products/catalog`. `text/csv` attachment; 413 `PAYLOAD_TOO_LARGE` beyond 50,000 rows (narrow the filters or use the asynchronous `POST /products/exports`). Cells starting with = + - @ are neutralised. Audited.',
      querystring: ExportQuerySchema,
      response: { 200: z.string().describe('text/csv') },
    },
  }, async (req, reply) => {
    const q = req.query;
    const out = await vendorTx(req, async (tx, vendorId) => {
      const res = await dash.catalogExportCsv(tx, vendorId, filtersOf(q), q.sort, names);
      await requestEffects(tx, req).audit({ action: 'product.export', resourceType: 'product', resourceId: 'export', metadata: { rows: res.count, filters: filtersOf(q) } });
      return res;
    });
    reply.header('Content-Disposition', 'attachment; filename="products.csv"').type('text/csv; charset=utf-8');
    return toCsv(out.rows);
  });

  r.post('/products/bulk-actions', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: PRODUCTS,
      summary: 'Bulk actions on selected products (archive, unarchive, duplicate, check publish readiness)',
      description: 'Up to 200 ids. Every id succeeds or fails on its own (HTTP 200, inspect `results`). `duplicate` returns `newProductId` per item. `check_publish_readiness` changes nothing: per product `canPublish` and the blocking `missing` checks (publishing itself stays in /listings).',
      body: ProductBulkBody,
      response: { 200: successEnvelope(ProductBulkResult) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const res = await act.bulkProductAction(tx, vendorId, req.body.ids, req.body.action, (inner) => requestEffects(inner, req));
    await requestEffects(tx, req).audit({ action: `product.bulk_${req.body.action}`, resourceType: 'product', resourceId: 'bulk', metadata: res.summary });
    return res;
  })));

  r.post('/products/:id/duplicate', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: PRODUCTS,
      summary: 'Duplicate a product as a draft',
      description: 'Copies the master product and its variants (options, prices, lead time, attribute values) as a DRAFT. Product code and SKUs get `-COPY` (`-COPY-2`... when taken); barcodes are not copied. No stock, listings or documents are copied.',
      params: IdParamSchema,
      response: { 201: successEnvelope(ProductDetailSchema) },
    },
  }, async (req, reply) => {
    const dto = await vendorTx(req, (tx, vendorId) => act.duplicateProduct(tx, vendorId, req.params.id, requestEffects(tx, req)));
    return created(req, reply, dto, `/api/v1/products/${dto.id}`);
  });

  // ================================================================== product details
  r.get('/products/:id/overview', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: PRODUCTS,
      summary: 'Product details header, health strip and Overview tab in one response',
      description: [
        '`health.state` is `ready` when every blocking readiness check passes (the same rules as GET /products/{id}/readiness), else `incomplete` with the failing check codes in `missing`.',
        '`inventory` sums the product\'s active variants (available = on hand - reserved); `status` is out / low (a variant at or below its reorder level or the business threshold) / healthy.',
        '`channels.connected` counts channels with a listing that is not draft/unpublished (0 for a draft product); `statusPanel.listings.state` is `not_published` then. `actions` carry enabled flags: `publish_product` is enabled only when readiness passes and the product is not archived.',
        '`content.pct` is the publish readiness % (same number as the catalog card).',
      ].join(' '),
      params: IdParamSchema,
      response: { 200: successEnvelope(OverviewSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => dash.productOverview(tx, vendorId, req.params.id, names))));

  r.get('/products/:id/inventory', {
    config: { access: { permission: 'products:read' } },
    schema: { tags: PRODUCTS, summary: 'Product inventory tab', description: 'Totals over active variants, health, stock by variant, stock by warehouse and the low-stock callout (null when everything is healthy).', params: IdParamSchema, response: { 200: successEnvelope(InventoryTabSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => dash.productInventory(tx, vendorId, req.params.id))));

  r.get('/products/:id/listings', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: PRODUCTS,
      summary: 'Product listings tab',
      description: '`channels` rolls the listings up per channel account (attention wins, then active, pending, draft); `items` are the individual variant listings. Status keys: active, attention (rejected / correction required / error code), pending, draft, unpublished. Manage listings through /listings.',
      params: IdParamSchema,
      response: { 200: successEnvelope(ListingsTabSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => dash.productListings(tx, vendorId, req.params.id, names))));

  r.get('/products/:id/content', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: PRODUCTS,
      summary: 'Product content tab',
      description: 'Readiness % with per-field state (title, description, images, attributes, marketplace_content), the master attributes table (core fields + attribute values + missing required attributes) and the marketplace content state per channel (ok / needs_review / not_published).',
      params: IdParamSchema,
      response: { 200: successEnvelope(ContentTabSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => dash.productContent(tx, vendorId, req.params.id, names))));

  r.get('/products/:id/activity', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: PRODUCTS,
      summary: 'Product activity feed',
      description: 'Merged, newest first: audit entries of the product, its variants and its listings, inventory movements of its variants and listing sync events. `type` is inventory | content | listings | variants; `scope`: all, master (content + inventory), variants, channels (listings). `event` is a stable key and `params` its structured data so the UI can localise; `text` is a ready English sentence.',
      params: IdParamSchema,
      querystring: PageQuerySchema.extend({ scope: z.enum(['all', 'master', 'variants', 'channels']).default('all') }),
      response: { 200: pagedEnvelope(ActivityItemSchema) },
    },
  }, async (req) => {
    const q = req.query;
    const res = await vendorTx(req, (tx, vendorId) => dash.productActivity(tx, vendorId, req.params.id, q.scope, pageWindow(q), names));
    return paged(req, res.items, q, res.total);
  });

  // ================================================================== variants workspace
  r.get('/products/:id/variant-grid', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: VARIANTS,
      summary: 'Variants & SKU workspace grid (numbered pages)',
      description: 'Filters: `q` (variant options, SKU, barcode), `filter[color]`, `filter[size]`, `filter[option.<name>]`, `filter[channel]`, `filter[inventory]=healthy|low|out`, `filter[lifecycle]=active|draft|archived`. Lifecycle: archived = inactive variant or archived product, draft = variant of a draft product, active otherwise. Item adds `stock {available, threshold, status}`, `channels`, `lifecycle`, `thumbnailUrl` (variant image, else the product\'s primary image).',
      params: IdParamSchema,
      querystring: VariantGridQuerySchema,
      response: { 200: pagedEnvelope(VariantGridItemSchema) },
    },
  }, async (req) => {
    const q = req.query as Record<string, unknown> & z.infer<typeof VariantGridQuerySchema>;
    const options: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(q)) {
      const m = optionFilter.exec(key);
      if (m && val !== undefined) options[m[1]!] = toArray(val as string | string[])!;
    }
    if (q['filter[color]']) options.color = q['filter[color]'];
    if (q['filter[size]']) options.size = q['filter[size]'];
    const res = await vendorTx(req, (tx, vendorId) => dash.variantGrid(tx, vendorId, req.params.id, { q: q.q, options, channel: q['filter[channel]'], inventory: q['filter[inventory]'], lifecycle: q['filter[lifecycle]'] }, q.sort, pageWindow(q), names));
    return paged(req, res.items, q, res.total);
  });

  r.get('/products/:id/variant-grid/counts', {
    config: { access: { permission: 'products:read' } },
    schema: { tags: VARIANTS, summary: 'Variant tab counts', description: '{ all, active, lowStock, outOfStock, draft, archived }. lowStock / outOfStock count active-lifecycle variants only.', params: IdParamSchema, response: { 200: successEnvelope(VariantCountsSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => dash.variantGridCounts(tx, vendorId, req.params.id))));

  r.post('/products/:id/variants/bulk', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: VARIANTS,
      summary: 'Bulk archive / activate / delete variants of a product',
      description: 'Up to 200 variant ids of this product. Each id succeeds or fails alone. `archive` makes the variant inactive (409 `needs_variant` for the last active variant of an active product); `delete` is the soft delete with the usual guards (reservations, live listings).',
      params: IdParamSchema,
      body: z.object({ ids: z.array(z.uuid()).min(1).max(200), action: z.enum(['archive', 'activate', 'delete']) }),
      response: { 200: successEnvelope(BulkResultSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => act.bulkVariantAction(tx, vendorId, req.params.id, req.body.ids, req.body.action, (inner) => requestEffects(inner, req)))));

  r.put('/variants/:id/lead-time', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: VARIANTS,
      summary: 'Set the replenishment lead time of a variant',
      description: 'Days from ordering to receiving more stock, 0..365; `null` falls back to the business default (settings.inventory.defaultLeadTimeDays).',
      params: IdParamSchema,
      body: z.object({ leadTimeDays: z.number().int().min(0).max(365).nullable() }),
      response: { 200: successEnvelope(z.object({ variantId: z.string(), productId: z.string(), sku: z.string(), leadTimeDays: z.number().int().nullable(), version: z.number().int() })) },
    },
  }, async (req) => {
    if (req.body.leadTimeDays === undefined) throw Errors.validation({ issues: [{ path: 'leadTimeDays', message: 'required (use null to clear)' }] });
    return ok(req, await vendorTx(req, (tx, vendorId) => act.setLeadTime(tx, vendorId, req.params.id, req.body.leadTimeDays, requestEffects(tx, req))));
  });
};
