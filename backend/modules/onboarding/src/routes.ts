import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { schema, withVendor } from '@oms/database';
import { IsoDate, successEnvelope } from '@oms/contracts';
import { audit, created, emit, ok, requireVendor, vendorTx } from '@oms/module-kit';
import { AppError } from '@oms/shared';
import { ConnectorHost } from '@oms/mod-marketplace-connectors';
import { requestImport, ctxFromRequest } from '@oms/mod-listings';
import { SyncJobSchema, toSyncJobDto } from '@oms/mod-sync';
import { BUSINESS_TYPE_OPTIONS, TEAM_SIZE_OPTIONS, STEP_META, type StepKey } from './domain';
import * as svc from './service';

const TAGS = ['Onboarding'];
const StepKeySchema = z.enum(schema.ONBOARDING_STEPS);
const StepParams = z.object({ step: StepKeySchema });
const BusinessType = z.enum(schema.BUSINESS_TYPES);
const TeamSize = z.enum(schema.TEAM_SIZES);
const Method = z.enum(schema.FULFILLMENT_METHODS);
const Preference = z.enum(schema.FULFILLMENT_PREFERENCES);
const ConnectionState = z.enum(['connected', 'needs_attention', 'not_connected']);

const BusinessSchema = z.object({ businessName: z.string(), businessType: BusinessType.nullable(), teamSize: TeamSize.nullable(), operatingLocation: z.string().nullable(), workspaceTier: z.enum(['starter', 'growing', 'scale']) }).meta({ id: 'OnboardingBusiness' });
const StateSchema = z.object({
  status: z.enum(schema.ONBOARDING_STATUSES), currentStep: StepKeySchema, resumeStep: StepKeySchema, percentComplete: z.number().int().describe('0-100, over the five setup steps before "Ready"'),
  completedAt: IsoDate.nullable(),
  steps: z.array(z.object({ key: StepKeySchema, title: z.string(), order: z.number().int(), skippable: z.boolean(), status: z.enum(schema.ONBOARDING_STEP_STATUSES), completedAt: z.string().nullable(), skippedAt: z.string().nullable() })),
  drafts: z.record(z.string(), z.record(z.string(), z.unknown())).describe('Unsaved form state per step, saved by "Save & exit"'),
  selectedChannels: z.array(z.string()), business: BusinessSchema, version: z.number().int(),
}).meta({ id: 'OnboardingState' });

const BusinessBody = z.object({
  businessName: z.string().trim().min(2).max(120).meta({ example: 'Nova Living' }),
  businessType: BusinessType, teamSize: TeamSize,
  operatingLocation: z.string().trim().min(2).max(160).meta({ example: 'Mumbai, Maharashtra' }),
}).strict();

const ChannelSchema = z.object({
  code: z.string(), name: z.string(), kind: z.enum(['marketplace', 'online_store', 'social']), description: z.string(),
  availability: z.enum(['available', 'coming_soon']).describe('coming_soon channels can be ticked (interest) but not connected'),
  selected: z.boolean(), connection: ConnectionState,
  account: z.object({ id: z.string(), displayName: z.string(), status: z.string(), connectionStatus: z.string(), lastSyncedAt: IsoDate.nullable(), mode: z.string() }).nullable(),
  accountCount: z.number().int(), actions: z.array(z.enum(['connect', 'manage'])),
}).meta({ id: 'OnboardingChannel' });

const CatalogItem = z.object({
  accountId: z.string(), marketplace: z.string(), name: z.string(), connection: ConnectionState,
  productsAvailable: z.number().int().nullable().describe('null until counted (POST /onboarding/products/refresh-counts)'), productsAvailableIsCapped: z.boolean(), countedAt: IsoDate.nullable(),
  importedProducts: z.number().int(), awaitingReview: z.number().int(), lastSyncedAt: IsoDate.nullable(),
  importStatus: z.enum(['not_imported', 'importing', 'imported', 'failed']), lastImportAt: IsoDate.nullable(), canImport: z.boolean(),
});

const InventoryBody = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('simple'), startingMethod: z.enum(['manual', 'marketplace', 'file']), locationName: z.string().trim().min(2).max(80).meta({ example: 'Home Inventory' }) }).strict(),
  z.object({
    mode: z.literal('warehouse'), startingMethod: z.enum(['manual', 'marketplace', 'file']),
    warehouse: z.object({ name: z.string().trim().min(2).max(80).meta({ example: 'Main Warehouse' }), location: z.string().trim().max(120).optional().meta({ example: 'Mumbai, Maharashtra' }), address: z.string().trim().max(300).optional() }).strict(),
  }).strict(),
]);
const InventoryOverview = z.object({
  products: z.number().int(), units: z.number().int(), lowStock: z.number().int(), outOfStock: z.number().int(), lowStockThreshold: z.number().int(),
  syncedChannels: z.array(z.object({ marketplace: z.string(), name: z.string() })),
}).meta({ id: 'OnboardingInventoryOverview' });
const InventorySetup = z.object({
  mode: z.enum(['simple', 'warehouse']).nullable(), startingMethod: z.enum(['manual', 'marketplace', 'file']).nullable(),
  location: z.object({ id: z.string(), code: z.string(), name: z.string(), city: z.string().nullable(), state: z.string().nullable(), address: z.string().nullable() }).nullable(),
  warehouseCount: z.number().int(), options: z.record(z.string(), z.unknown()),
}).meta({ id: 'OnboardingInventorySetup' });

const FulfillmentBody = z.object({ defaultMethod: Method, defaultPreference: Preference.default('recommended'), overrides: z.record(z.string().max(40), Method).default({}) }).strict();
const FulfillmentSchema = z.object({
  configured: z.boolean(), defaultMethod: Method, defaultPreference: Preference, overrides: z.record(z.string(), Method),
  methods: z.array(z.object({ value: Method, label: z.string(), description: z.string(), hint: z.string(), available: z.boolean(), requiresConnection: z.boolean(), unavailableReason: z.string().nullable() })),
  preferenceOptions: z.array(z.object({ value: Preference, label: z.string() })),
  connections: z.object({
    marketplaceShipping: z.object({ available: z.boolean(), marketplaces: z.array(z.string()) }),
    thirdParty: z.object({ available: z.boolean(), providers: z.array(z.object({ id: z.string(), code: z.string(), label: z.string(), isDefault: z.boolean() })), connectWith: z.object({ method: z.string(), url: z.string() }) }),
  }),
  preview: z.array(z.object({ kind: z.enum(['marketplace', 'default']), marketplace: z.string().nullable(), label: z.string(), method: Method, isOverride: z.boolean() })),
  warnings: z.array(z.object({ code: z.string(), message: z.string(), marketplace: z.string().optional() })),
  flow: z.array(z.string()),
}).meta({ id: 'OnboardingFulfillment' });

const ReadinessSchema = z.object({
  items: z.array(z.object({ key: z.enum(['business', 'channels', 'products', 'inventory', 'fulfillment']), group: z.string(), title: z.string(), status: z.enum(['complete', 'connected', 'ready', 'configured', 'needs_attention', 'skipped', 'pending']) })),
  percentComplete: z.number().int(), canGoToDashboard: z.boolean(), completed: z.boolean(),
  whatHappensNext: z.array(z.object({ title: z.string(), body: z.string() })),
}).meta({ id: 'OnboardingReadiness' });

/**
 * Guided seller setup. Every screen has a read (what to show, including options and previews) and a save. State is stored per step,
 * so "Save & exit" and coming back later resume exactly where the seller stopped. Saves delegate to the same services the rest of the
 * API uses (vendor profile, marketplace accounts, warehouses, shipping), so nothing configured here is a parallel copy.
 */
export const onboardingRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const host = new ConnectorHost(c);
  const read = { config: { access: { permission: 'onboarding:read' } } } as const;
  const write = { config: { access: { permission: 'onboarding:write' } } } as const;

  // ------------------------------------------------------------------ overall state
  r.get('/onboarding', {
    ...read,
    schema: { tags: TAGS, summary: 'Where am I in the setup?', description: 'Steps with status, the step to resume on, progress and any saved drafts. Created on first call.', response: { 200: successEnvelope(StateSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => svc.getState(tx, vendorId))));

  r.get('/onboarding/options', {
    ...read,
    schema: { tags: TAGS, summary: 'Choices for the business screen', response: { 200: successEnvelope(z.object({ businessTypes: z.array(z.object({ value: BusinessType, label: z.string(), description: z.string() })), teamSizes: z.array(z.object({ value: TeamSize, label: z.string() })), steps: z.array(z.object({ key: StepKeySchema, title: z.string(), order: z.number().int(), skippable: z.boolean() })) })) } },
  }, async (req) => ok(req, { businessTypes: BUSINESS_TYPE_OPTIONS, teamSizes: TEAM_SIZE_OPTIONS, steps: (Object.keys(STEP_META) as StepKey[]).map((key) => ({ key, ...STEP_META[key] })) }));

  r.put('/onboarding/steps/:step/draft', {
    ...write,
    schema: { tags: TAGS, summary: 'Save & exit: keep the half-filled form of a step', description: 'Stores the form as typed (max 8 KB, never secrets) and makes this the step to resume on.', params: StepParams, body: z.object({ data: z.record(z.string(), z.unknown()) }).strict(), response: { 200: successEnvelope(StateSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => { await svc.saveDraft(tx, vendorId, req.params.step, req.body.data); return svc.getState(tx, vendorId); })));

  r.post('/onboarding/steps/:step/skip', {
    ...write,
    schema: { tags: TAGS, summary: 'Skip for now', description: 'Every step except Business can be skipped and done later from the workspace.', params: StepParams, response: { 200: successEnvelope(StateSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    await svc.skipStep(tx, vendorId, req.params.step);
    await audit(tx, req, { action: 'onboarding.step_skipped', resourceType: 'onboarding', resourceId: vendorId, metadata: { step: req.params.step } });
    return svc.getState(tx, vendorId);
  })));

  // ------------------------------------------------------------------ 02 business
  r.put('/onboarding/business', {
    ...write,
    schema: { tags: TAGS, summary: 'Save the business profile (step 2)', description: 'Updates the vendor profile (brand name, business type, team size, location) and completes the step. Re-callable any time ("update these details anytime in Settings").', body: BusinessBody, response: { 200: successEnvelope(z.object({ business: BusinessSchema, state: StateSchema })) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const out = await svc.saveBusiness(tx, vendorId, req.body);
    await audit(tx, req, { action: 'onboarding.business_saved', resourceType: 'vendor', resourceId: vendorId, before: { displayName: out.before.displayName, businessType: out.before.businessType, teamSize: out.before.teamSize }, after: req.body });
    return { business: svc.businessDto(out.after), state: await svc.getState(tx, vendorId) };
  })));

  // ------------------------------------------------------------------ 03 sales channels
  r.get('/onboarding/channels', {
    ...read,
    schema: { tags: TAGS, summary: 'Sales channels: what can be connected and what is', description: 'Marketplace and store catalogue with connection state. `availability: coming_soon` channels cannot be connected yet.', response: { 200: successEnvelope(z.object({ items: z.array(ChannelSchema), summary: z.object({ connected: z.number().int(), selectedToConnect: z.number().int(), interestedInComingSoon: z.number().int() }) })) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => svc.listChannels(tx, c, vendorId))));

  r.put('/onboarding/channels', {
    ...write,
    schema: { tags: TAGS, summary: 'Save the ticked channels and continue (step 3)', description: 'Replaces the selection. Ticking a coming-soon channel only records interest.', body: z.object({ selected: z.array(z.string().max(40)).max(20) }).strict(), response: { 200: successEnvelope(z.object({ selected: z.array(z.string()), state: StateSchema })) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const selected = await svc.saveChannelSelection(tx, c, vendorId, req.body.selected);
    await audit(tx, req, { action: 'onboarding.channels_selected', resourceType: 'onboarding', resourceId: vendorId, after: { selected } });
    return { selected, state: await svc.getState(tx, vendorId) };
  })));

  r.post('/onboarding/channels/:code/connect', {
    ...write,
    schema: {
      tags: TAGS, summary: 'Connect a channel', description: 'Creates the marketplace account (or returns the existing one). Then authorize it with GET /marketplace-accounts/{id}/authorization-url or POST .../authorize. 409 `channel_coming_soon` for channels that are not available yet.',
      params: z.object({ code: z.string().min(2).max(40) }), body: z.object({ displayName: z.string().trim().min(2).max(80).optional(), mode: z.enum(['live', 'sandbox']).optional() }).strict().default({}),
      response: { 201: successEnvelope(z.object({ accountId: z.string(), created: z.boolean(), status: z.string(), next: z.object({ authorizationUrl: z.string(), authorize: z.string() }) })) },
    },
  }, async (req, reply) => {
    const out = await vendorTx(req, async (tx, vendorId) => {
      const res = await svc.connectChannel(tx, c, vendorId, req.params.code, req.body);
      if (res.created) await audit(tx, req, { action: 'onboarding.channel_connect_started', resourceType: 'marketplace_account', resourceId: res.account.id, metadata: { channel: req.params.code } });
      return res;
    });
    return created(req, reply, { accountId: out.account.id, created: out.created, status: out.account.status, next: { authorizationUrl: `/api/v1/marketplace-accounts/${out.account.id}/authorization-url`, authorize: `/api/v1/marketplace-accounts/${out.account.id}/authorize` } });
  });

  // ------------------------------------------------------------------ 04 products
  r.get('/onboarding/products', {
    ...read,
    schema: { tags: TAGS, summary: 'Products: connected catalogs and ways to bring products in (step 4)', description: 'One row per connected marketplace: products available, import state, last sync. `productsAvailable` is null until counted.', response: { 200: successEnvelope(z.object({ items: z.array(CatalogItem), summary: z.object({ connected: z.number().int(), productsAvailable: z.number().int(), allCounted: z.boolean(), masterProducts: z.number().int(), masterVariants: z.number().int() }), ways: z.record(z.string(), z.boolean()) })) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => svc.catalogOverview(tx, c, vendorId))));

  r.post('/onboarding/products/refresh-counts', {
    ...write,
    schema: {
      tags: TAGS, summary: 'Count the products available on each connected marketplace', description: 'Reads the marketplace catalogue read-only (up to 5,000 products per marketplace; `productsAvailableIsCapped` says when more exist). One marketplace failing does not fail the others.',
      body: z.object({ accountId: z.string().uuid().optional() }).strict().default({}),
      response: { 200: successEnvelope(z.object({ counted: z.array(z.object({ accountId: z.string(), count: z.number().int(), capped: z.boolean() })), failed: z.array(z.object({ accountId: z.string(), message: z.string() })) })) },
    },
  }, async (req) => {
    const vendorId = requireVendor(req);
    const accounts = await vendorTx(req, (tx) => svc.activeAccountsForCounting(tx, vendorId, req.body.accountId));
    const counts: Record<string, { count: number; capped: boolean }> = {};
    const failed: Array<{ accountId: string; message: string }> = [];
    for (const a of accounts) {
      try {
        counts[a.id] = await host.run(vendorId, a.id, async (connector, ctx) => {
          if (!connector.importProducts) throw new AppError('CONFLICT', 'This marketplace cannot list products');
          let total = 0, cursor: string | undefined;
          for (let page = 0; page < 50; page++) {
            const res = await connector.importProducts(ctx, { cursor, limit: 100 });
            total += res.items.length;
            if (!res.nextCursor) return { count: total, capped: false };
            cursor = res.nextCursor;
          }
          return { count: total, capped: true };
        }, { requestId: req.id });
      } catch (e) {
        failed.push({ accountId: a.id, message: e instanceof Error ? e.message : 'failed' });
      }
    }
    if (Object.keys(counts).length) await withVendor(c.database.db, vendorId, (tx) => svc.saveCatalogCounts(tx, vendorId, counts));
    return ok(req, { counted: Object.entries(counts).map(([accountId, v]) => ({ accountId, ...v })), failed });
  });

  r.post('/onboarding/products/import', {
    ...write,
    schema: {
      tags: TAGS, summary: 'Import the catalog of one connected marketplace', description: 'Asynchronous (202): starts a catalog import; follow it with GET /sync/jobs/{id}. Imported products wait for review under /imported-products (link to an existing product or create a master product).',
      body: z.object({ accountId: z.string().uuid() }).strict(), response: { 202: successEnvelope(z.object({ job: SyncJobSchema, alreadyQueued: z.boolean() })) },
    },
  }, async (req, reply) => {
    const vendorId = requireVendor(req);
    const res = await requestImport(ctxFromRequest(req, vendorId), req.body.accountId);
    reply.code(202);
    return ok(req, { job: toSyncJobDto(res.job), alreadyQueued: !res.created });
  });

  r.post('/onboarding/products/continue', {
    ...write,
    schema: { tags: TAGS, summary: 'Continue from the products step', description: 'Products are managed in their own workspace; this only marks the step as seen.', response: { 200: successEnvelope(StateSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => { await svc.completeProductsStep(tx, vendorId); return svc.getState(tx, vendorId); })));

  // ------------------------------------------------------------------ 05 inventory
  r.get('/onboarding/inventory', {
    ...read,
    schema: { tags: TAGS, summary: 'Inventory setup: mode, location and starting-stock options (step 5)', response: { 200: successEnvelope(InventorySetup) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => svc.getInventorySetup(tx, vendorId))));

  r.put('/onboarding/inventory', {
    ...write,
    schema: {
      tags: TAGS, summary: 'Save inventory setup (step 5)', description: 'Simple inventory = one location (default `Home Inventory`); warehouse inventory = a named warehouse with city/state and an optional address. Creates the default warehouse or updates it, so it is safe to call again. Zones, racks and bins are added later under /warehouses.',
      body: InventoryBody, response: { 200: successEnvelope(z.object({ warehouseId: z.string(), created: z.boolean(), setup: InventorySetup, state: StateSchema })) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const res = await svc.saveInventorySetup(tx, vendorId, req.body);
    await audit(tx, req, { action: 'onboarding.inventory_saved', resourceType: 'warehouse', resourceId: res.warehouseId, before: res.before, after: res.after });
    await emit(tx, req, { type: 'onboarding.inventory_configured', aggregateType: 'vendor', aggregateId: vendorId, payload: { mode: req.body.mode } });
    return { warehouseId: res.warehouseId, created: res.created, setup: await svc.getInventorySetup(tx, vendorId), state: await svc.getState(tx, vendorId) };
  })));

  r.get('/onboarding/inventory/overview', {
    ...read,
    schema: { tags: TAGS, summary: 'Inventory overview numbers: products, units, low stock, out of stock', description: 'From the real stock tables. Low stock = available units at or under the reorder level (or the business default).', response: { 200: successEnvelope(InventoryOverview) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => svc.inventoryOverview(tx, vendorId))));

  // ------------------------------------------------------------------ 06 fulfillment
  r.get('/onboarding/fulfillment', {
    ...read,
    schema: { tags: TAGS, summary: 'Fulfillment preferences, shipping connections and preview (step 6)', response: { 200: successEnvelope(FulfillmentSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => svc.getFulfillment(tx, c, vendorId))));

  r.put('/onboarding/fulfillment', {
    ...write,
    schema: {
      tags: TAGS, summary: 'Save fulfillment preferences (step 6)', description: 'Default method, preference and per-marketplace overrides. A method that is not available yet (no marketplace / no shipping provider connected) is saved but returned in `warnings`.',
      body: FulfillmentBody, response: { 200: successEnvelope(z.object({ fulfillment: FulfillmentSchema, state: StateSchema })) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const res = await svc.saveFulfillment(tx, c, vendorId, req.body);
    await audit(tx, req, { action: 'onboarding.fulfillment_saved', resourceType: 'fulfillment_preferences', resourceId: vendorId, before: res.before, after: res.after });
    return { fulfillment: await svc.getFulfillment(tx, c, vendorId), state: await svc.getState(tx, vendorId) };
  })));

  // ------------------------------------------------------------------ 07 ready
  r.get('/onboarding/readiness', {
    ...read,
    schema: { tags: TAGS, summary: 'Setup readiness checklist (Review setup / Ready screen)', description: 'Computed from what actually exists (connected channels, products, warehouse, shipping preferences), not from clicks.', response: { 200: successEnvelope(ReadinessSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => svc.readiness(tx, c, vendorId))));

  r.post('/onboarding/complete', {
    ...write,
    schema: { tags: TAGS, summary: 'Go to dashboard: finish onboarding', description: 'Needs the business step. Safe to call twice.', response: { 200: successEnvelope(z.object({ alreadyCompleted: z.boolean(), completedAt: IsoDate })) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const res = await svc.completeOnboarding(tx, c, vendorId);
    if (!res.alreadyCompleted) {
      await audit(tx, req, { action: 'onboarding.completed', resourceType: 'onboarding', resourceId: vendorId });
      await emit(tx, req, { type: 'onboarding.completed', aggregateType: 'vendor', aggregateId: vendorId, payload: {} });
    }
    return res;
  })));
};
