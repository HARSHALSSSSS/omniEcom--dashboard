import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { schema } from '@oms/database';
import { AppError } from '@oms/shared';
import { IdParamSchema, IsoDate, successEnvelope } from '@oms/contracts';
import { audit, created, ok, vendorTx } from '@oms/module-kit';
import { channelOverview } from './channel';
import { dashboard, PERIOD_DAYS, STAGES } from './dashboard';
import { search } from './search';
import { recommendations, TARGET_COVER_DAYS } from './recommendations';
import { myBusinesses, shellData, type Can } from './shell';
import { createView, deleteView, listViews, updateView, VIEW_FILTER_KEYS, type Actor } from './views';
import { isRealDay, userIdOf } from './util';

const TAGS = ['Workspace'];
const Money = z.number().int();
const ChannelRef = z.object({ code: z.string(), name: z.string(), accountId: z.string().nullable().optional(), availability: z.enum(['live', 'coming_soon']).optional() });
const Action = z.object({ label: z.string(), href: z.string() });
const BadgeSchema = z.object({ key: z.string(), label: z.string(), tone: z.enum(['neutral', 'good', 'warn', 'bad', 'info']) });

const ShellSchema = z.object({
  user: z.object({ id: z.string(), name: z.string(), initials: z.string(), roleLabel: z.string(), email: z.string().nullable(), role: z.string().nullable() }),
  business: z.object({ id: z.string(), name: z.string(), plan: z.string(), tier: z.enum(['starter', 'growing', 'scale']), timezone: z.string(), currency: z.string(), numberFormat: z.enum(['indian', 'international']), preferences: z.object({ defaultRoute: z.string(), pageSize: z.number().int(), reportingPeriod: z.enum(['7d', '30d', 'qtd', 'fytd']), catalogView: z.enum(['all_active', 'low_stock', 'primary_warehouse']), language: z.string(), telemetrySeconds: z.number().int(), showThumbnails: z.boolean() }).describe('Workspace defaults from Settings > General: what screens start with (the URL always wins)') }),
  businesses: z.array(z.object({ id: z.string(), name: z.string(), current: z.boolean() })),
  badges: z.object({ needsAttention: z.number().int(), orders: z.number().int(), returns: z.number().int(), notifications: z.number().int() }),
  unreadBySeverity: z.record(z.string(), z.number().int()).describe('Unread notifications of the caller by severity (the dot colour of the bell)'),
  features: z.record(z.string(), z.boolean()),
  asOf: z.string().describe('Today (YYYY-MM-DD) in the business time zone'),
  inventoryMode: z.enum(['simple', 'warehouse']).nullable(),
}).meta({ id: 'WorkspaceShell' });

const SearchItem = z.object({ id: z.string(), title: z.string(), subtitle: z.string(), meta: z.string(), badge: BadgeSchema.nullable(), href: z.string() });
const SearchSchema = z.object({
  query: z.string(), scope: z.enum(['all', 'products', 'orders', 'skus']),
  groups: z.array(z.object({ type: z.enum(['product', 'order', 'sku']), label: z.string(), total: z.number().int().describe('Exact up to 1,000 matches'), items: z.array(SearchItem) })),
  total: z.number().int(), shown: z.number().int(),
}).meta({ id: 'WorkspaceSearch' });

const Screen = z.enum(schema.VIEW_SCREENS);
const Filters = z.record(z.string().max(40), z.unknown()).describe(`Only the keys of the screen: ${(Object.entries(VIEW_FILTER_KEYS)).map(([s, k]) => `${s}: ${k.join(', ')}`).join('; ')}. Values: string, number, boolean or a list of them. Max 8 KB.`);
const ViewSchema = z.object({
  id: z.string(), screen: Screen, name: z.string(), filters: z.record(z.string(), z.unknown()), sort: z.string().nullable(), shared: z.boolean(), createdBy: z.string(), mine: z.boolean(), canEdit: z.boolean(),
  createdAt: IsoDate, updatedAt: IsoDate, version: z.number().int(),
}).meta({ id: 'SavedView' });
const ViewName = z.string().trim().min(1).max(80);

const Metric = z.object({ key: z.string(), value: z.number(), previous: z.number().nullable(), changePct: z.number().nullable(), note: z.string().optional() });
const DashboardSchema = z.object({
  asOf: z.string(), generatedAt: IsoDate, greeting: z.object({ firstName: z.string().nullable() }),
  needsAttention: z.object({ items: z.array(z.object({ issueKey: z.string(), area: z.string(), title: z.string(), summary: z.string(), count: z.number().int(), action: Action })) }).optional(),
  recommendation: z.object({ id: z.string(), kind: z.string(), severity: z.string(), title: z.string(), rationale: z.string(), status: z.string(), actions: z.array(z.string()), recommendationOnly: z.boolean() }).nullable().optional(),
  snapshot: z.object({ period: z.literal('today'), day: z.string(), currency: z.string(), metrics: z.array(Metric) }),
  sales: z.object({
    period: z.string(), currency: z.string(),
    series: z.array(z.object({ day: z.string(), revenueMinor: Money, previousRevenueMinor: Money, orders: z.number().int() })),
    channelContribution: z.array(z.object({ channel: ChannelRef, revenueMinor: Money, orders: z.number().int(), sharePct: z.number() })),
  }),
  orderFlow: z.array(z.object({ stage: z.enum(STAGES), count: z.number().int() })).optional(),
  inventoryHealth: z.object({
    healthy: z.number().int(), low: z.number().int(), out: z.number().int(),
    mostAffected: z.array(z.object({ productId: z.string(), title: z.string(), sku: z.string(), available: z.number().int(), status: z.enum(['low', 'out']) })),
  }).optional(),
  channelHealth: z.array(z.object({ channel: ChannelRef, health: z.enum(['healthy', 'attention']), connection: z.enum(['connected', 'needs_attention', 'not_connected']), lastSyncAt: IsoDate.nullable(), openIssues: z.number().int(), action: z.object({ key: z.string(), href: z.string() }) })).optional(),
  sync: z.object({ lastSyncedAt: IsoDate.nullable(), systemStatus: z.enum(['operational', 'degraded']) }).optional(),
}).meta({ id: 'WorkspaceDashboard' });

const OverviewSchema = z.object({
  channel: ChannelRef, displayName: z.string(), mode: z.string(), connection: z.enum(['connected', 'needs_attention', 'not_connected']), health: z.enum(['healthy', 'attention']),
  lastSyncAt: IsoDate.nullable(), syncMode: z.enum(['automatic', 'manual']), openIssueCount: z.number().int(),
  openIssues: z.array(z.object({ code: z.string(), title: z.string(), explanation: z.string(), action: Action })),
  actions: z.array(z.object({ key: z.enum(['retry_sync', 'manage']), label: z.string(), method: z.enum(['GET', 'POST']), href: z.string(), enabled: z.boolean(), disabledReason: z.string().nullable() })),
}).meta({ id: 'ChannelOverview' });

const RecommendationsSchema = z.object({
  asOf: IsoDate,
  channel: OverviewSchema.nullable(),
  channelConnections: z.number().int().describe('Connected marketplace accounts in the workspace'),
  product: z.object({
    productId: z.string(), variantId: z.string(), title: z.string(), sku: z.string(), location: z.string().nullable(), status: z.enum(['out', 'low', 'healthy']),
    onHand: z.number().int(), reserved: z.number().int(), available: z.number().int(), lowStockThreshold: z.number().int(), salesVelocityPerDay: z.number(), estimatedCoverDays: z.number().int().nullable(),
    recentMovements: z.array(z.object({ at: IsoDate, type: z.string(), label: z.string(), quantity: z.number().int(), positive: z.boolean() })),
    actions: z.array(z.object({ key: z.string(), label: z.string(), href: z.string() })),
  }).nullable(),
  replenishment: z.object({
    headline: z.string(), approachingThreshold: z.number().int(), summary: z.string(), rationale: z.string(), targetDays: z.number().int(), formula: z.string(), shown: z.number().int(), totalProducts: z.number().int(),
    items: z.array(z.object({ variantId: z.string(), name: z.string(), sku: z.string(), available: z.number().int(), salesVelocityPerDay: z.number(), coverDays: z.number().nullable(), suggestedUnits: z.number().int() })),
    note: z.string(), actions: z.array(z.object({ key: z.string(), label: z.string(), href: z.string() })),
  }).nullable(),
}).meta({ id: 'WorkspaceRecommendations' });

/**
 * Workspace: what the dashboard shell needs around the domain modules. Everything except saved views is a read over other modules' tables.
 * Switching business (POST /auth/switch-business) is not here: it needs a membership model (see docs/figma/12-open-questions.md Q1).
 */
export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const can = (req: FastifyRequest): Can => (p) => req.ctx.principal?.permissions.has(p) ?? false;
  const me = (req: FastifyRequest) => req.ctx.principal!;
  const viewer = (req: FastifyRequest): Actor => ({ userId: userIdOf(req), isAdmin: me(req).roles.includes('vendor_admin') });

  r.get('/workspace/shell', {
    config: { access: 'authenticated' },
    schema: { tags: TAGS, summary: 'App shell data', description: 'One call on load: user, business, sidebar badges (needsAttention = open issue groups), feature flags, today in the business time zone, inventory mode. A badge the caller may not read is 0.', response: { 200: successEnvelope(ShellSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => shellData(tx, { vendorId, actorType: me(req).actorType, actorId: me(req).actorId, roles: me(req).roles }, can(req)))));

  r.get('/workspace/recommendations', {
    config: { access: 'authenticated' },
    schema: {
      tags: TAGS, summary: 'Recommendations page: channel, product and replenishment cards',
      description: 'Context cards built from live data: the marketplace connection that needs attention (retry / manage actions), the most urgent stock line with cover and latest movements, and replenishment suggestions (target days of sales minus available stock, default 14). `accountId` / `variantId` pick a specific channel or product. A card the caller may not read (marketplace_accounts:read, inventory:read) or with nothing to show is null. Recommendation only: nothing is changed.',
      querystring: z.object({ accountId: z.uuid().optional(), variantId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(6), targetDays: z.coerce.number().int().min(1).max(90).default(TARGET_COVER_DAYS) }),
      response: { 200: successEnvelope(RecommendationsSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => recommendations(tx, vendorId, can(req), req.query)) as z.infer<typeof RecommendationsSchema>));

  r.get('/me/businesses', {
    config: { access: 'authenticated' },
    schema: { tags: TAGS, summary: 'Businesses of the signed-in user', description: 'Today one user belongs to one business, so this returns one row; the shape is ready for memberships.', response: { 200: successEnvelope(z.array(z.object({ id: z.string(), name: z.string(), plan: z.string(), tier: z.enum(['starter', 'growing', 'scale']), roleLabel: z.string(), current: z.boolean() }))) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => myBusinesses(tx, vendorId, me(req).roles))));

  r.get('/search', {
    config: { access: 'authenticated' },
    schema: {
      tags: TAGS, summary: 'Global search (Cmd+K)', description: 'Grouped results: products (title, product code, SKU, barcode), orders (order number, marketplace order id, customer name; the most recent 20,000 orders) and SKUs per warehouse (SKU, barcode). A group the caller cannot read (products:read / orders:read / inventory:read) is omitted. `%` and `_` are literal characters.',
      querystring: z.object({ q: z.string().trim().min(2).max(100), scope: z.enum(['all', 'products', 'orders', 'skus']).default('all'), limit: z.coerce.number().int().min(1).max(10).default(5) }),
      response: { 200: successEnvelope(SearchSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => search(tx, vendorId, can(req), req.query))));

  // ------------------------------------------------------------------ saved views
  r.get('/views', {
    config: { access: { permission: 'views:read' } },
    schema: { tags: TAGS, summary: 'Saved views', description: 'Your own views plus the ones shared with the business.', querystring: z.object({ screen: Screen.optional() }), response: { 200: successEnvelope(z.array(ViewSchema)) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => listViews(tx, vendorId, viewer(req), req.query.screen))));

  r.post('/views', {
    config: { access: { permission: 'views:write' } },
    schema: {
      tags: TAGS, summary: 'Save a view', description: 'Max 50 per screen per user; a name is unique per user and screen (409). `shared: true` makes it available to the whole business.',
      body: z.object({ screen: Screen, name: ViewName, filters: Filters.default({}), sort: z.string().trim().max(60).nullish(), shared: z.boolean().default(false) }).strict(), response: { 201: successEnvelope(ViewSchema) },
    },
  }, async (req, reply) => created(req, reply, await vendorTx(req, async (tx, vendorId) => {
    const v = await createView(tx, vendorId, viewer(req), req.body);
    await audit(tx, req, { action: 'saved_view.create', resourceType: 'saved_view', resourceId: v.id, after: { screen: v.screen, name: v.name, shared: v.shared } });
    return v;
  })));

  r.patch('/views/:id', {
    config: { access: { permission: 'views:write' } },
    schema: {
      tags: TAGS, summary: 'Change a view', description: 'Only the creator (or an administrator) can change it.', params: IdParamSchema,
      body: z.object({ name: ViewName.optional(), filters: Filters.optional(), sort: z.string().trim().max(60).nullable().optional(), shared: z.boolean().optional() }).strict(), response: { 200: successEnvelope(ViewSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const { before, after } = await updateView(tx, vendorId, viewer(req), req.params.id, req.body);
    await audit(tx, req, { action: 'saved_view.update', resourceType: 'saved_view', resourceId: after.id, before: { name: before.name, shared: before.shared, filters: before.filters }, after: { name: after.name, shared: after.shared, filters: after.filters } });
    return after;
  })));

  r.delete('/views/:id', {
    config: { access: { permission: 'views:write' } },
    schema: { tags: TAGS, summary: 'Delete a view', description: 'Only the creator (or an administrator) can delete it.', params: IdParamSchema, response: { 200: successEnvelope(z.object({ deleted: z.literal(true) })) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const v = await deleteView(tx, vendorId, viewer(req), req.params.id);
    await audit(tx, req, { action: 'saved_view.delete', resourceType: 'saved_view', resourceId: v.id, before: { screen: v.screen, name: v.name } });
    return { deleted: true as const };
  })));

  // ------------------------------------------------------------------ dashboard home + channel panel
  r.get('/dashboard', {
    config: { access: { permission: 'analytics:read' } },
    schema: {
      tags: TAGS, summary: 'Dashboard home', description: 'One aggregate for the home screen. `asOf` (default: today in the business time zone) sets the "today" of the snapshot and order flow; the sales chart covers `salesPeriod` days ending on it with the previous equal period shifted by its length. Days are UTC dates like the analytics roll-ups. Sections the caller may not read (needsAttention: issues:read, recommendation: ai:use, orderFlow: orders:read, inventoryHealth: inventory:read, channelHealth and sync: marketplace_accounts:read) are omitted.',
      querystring: z.object({ asOf: z.string().optional().describe('YYYY-MM-DD'), salesPeriod: z.enum(Object.keys(PERIOD_DAYS) as ['7d', '30d', '90d']).default('30d') }),
      response: { 200: successEnvelope(DashboardSchema) },
    },
  }, async (req) => {
    if (req.query.asOf !== undefined && !isRealDay(req.query.asOf)) throw new AppError('BAD_REQUEST', '`asOf` must be a date as YYYY-MM-DD');
    return ok(req, await vendorTx(req, (tx, vendorId) => dashboard(tx, { vendorId, actorType: me(req).actorType, actorId: me(req).actorId }, can(req), { asOf: req.query.asOf, salesPeriod: req.query.salesPeriod })) as z.infer<typeof DashboardSchema>);
  });

  r.get('/channels/:id/overview', {
    config: { access: { permission: 'marketplace_accounts:read' } },
    schema: { tags: TAGS, summary: 'Channel connection panel', description: 'Last sync, sync mode and what needs attention for one marketplace account: failing sync jobs, connection problems and open issues scoped to the account. Retry sync = POST /marketplace-accounts/{id}/inventory-sync.', params: IdParamSchema, response: { 200: successEnvelope(OverviewSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => channelOverview(tx, vendorId, req.params.id, can(req)))));
};
