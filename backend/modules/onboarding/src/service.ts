import { and, desc, eq, inArray, isNull, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import type { Container } from '@oms/module-kit';
import { enabledCapabilities } from '@oms/marketplace-core';
import { getVendor, updateSettings, updateVendor } from '@oms/mod-vendors';
import { createWarehouse, updateWarehouse } from '@oms/mod-warehouses';
import { createAccount } from '@oms/mod-marketplace-accounts';
import {
  CHANNELS, FULFILLMENT_METHOD_OPTIONS, FULFILLMENT_PREFERENCE_OPTIONS, SANDBOX_CHANNEL, STEP_META, splitLocation, workspaceTier,
  type BusinessType, type ChannelDef, type FulfillmentMethod, type StepKey, type StepStatus, type TeamSize,
} from './domain';

const P = schema.onboardingProgress;
const A = schema.marketplaceAccounts;
type ProgressRow = typeof P.$inferSelect;
const STEP_ORDER = schema.ONBOARDING_STEPS;
const now = () => new Date().toISOString();
const rows = async (tx: Tx, q: ReturnType<typeof sql>): Promise<Array<Record<string, unknown>>> => (await tx.execute<Record<string, unknown>>(q)).rows;

// ------------------------------------------------------------------------------------------------
// progress row + step state
// ------------------------------------------------------------------------------------------------
export async function ensureProgress(tx: Tx, vendorId: string): Promise<ProgressRow> {
  await tx.insert(P).values({ vendorId }).onConflictDoNothing();
  const [row] = await tx.select().from(P).where(eq(P.vendorId, vendorId));
  return row!;
}

const stepStatus = (row: ProgressRow, key: StepKey): StepStatus => (row.steps[key]?.status ?? 'not_started') as StepStatus;

/** the first step that is not completed / skipped; "ready" when everything before it is done */
function nextStep(steps: ProgressRow['steps']): StepKey {
  for (const key of STEP_ORDER) {
    if (key === 'ready') return 'ready';
    const s = steps[key]?.status;
    if (s !== 'completed' && s !== 'skipped') return key;
  }
  return 'ready';
}

export async function setStep(tx: Tx, vendorId: string, key: StepKey, status: StepStatus, opts: { focus?: StepKey } = {}): Promise<ProgressRow> {
  const row = await ensureProgress(tx, vendorId);
  const at = now();
  const prev = row.steps[key];
  const steps = {
    ...row.steps,
    [key]: { status, updatedAt: at, ...(status === 'completed' ? { completedAt: at } : prev?.completedAt ? { completedAt: prev.completedAt } : {}), ...(status === 'skipped' ? { skippedAt: at } : {}) },
  };
  const [after] = await tx.update(P).set({ steps, currentStep: opts.focus ?? nextStep(steps), version: sql`${P.version} + 1` }).where(eq(P.vendorId, vendorId)).returning();
  return after!;
}

export async function getState(tx: Tx, vendorId: string) {
  const row = await ensureProgress(tx, vendorId);
  const vendor = await getVendor(tx, vendorId);
  const steps = STEP_ORDER.map((key) => {
    const st = row.steps[key];
    const status = stepStatus(row, key);
    return {
      key, title: STEP_META[key].title, order: STEP_META[key].order, skippable: STEP_META[key].skippable,
      status: status === 'not_started' && row.currentStep === key ? ('in_progress' as const) : status,
      completedAt: st?.completedAt ?? null, skippedAt: st?.skippedAt ?? null,
    };
  });
  const done = steps.filter((s) => s.key !== 'ready' && (s.status === 'completed')).length;
  return {
    status: row.status as 'in_progress' | 'completed',
    currentStep: row.currentStep as StepKey,
    resumeStep: (row.status === 'completed' ? 'ready' : nextStep(row.steps)) as StepKey,
    percentComplete: Math.round((done / (STEP_ORDER.length - 1)) * 100),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    steps,
    drafts: row.drafts,
    selectedChannels: row.selectedChannels,
    business: businessDto(vendor),
    version: row.version,
  };
}

// ------------------------------------------------------------------------------------------------
// drafts ("Save & exit")
// ------------------------------------------------------------------------------------------------
const FORBIDDEN_DRAFT_KEY = /pass(word)?|secret|token|api[-_]?key|credential|otp|card|cvv|pan\b|aadhaar/i;

export async function saveDraft(tx: Tx, vendorId: string, key: StepKey, data: Record<string, unknown>) {
  const flat = JSON.stringify(data);
  if (flat.length > 8_000) throw new AppError('PAYLOAD_TOO_LARGE', 'Draft is too large');
  const bad = Object.keys(data).find((k) => FORBIDDEN_DRAFT_KEY.test(k));
  if (bad) throw Errors.validation({ issues: [{ path: `data.${bad}`, message: 'secrets and credentials are never stored in a draft' }] });
  const row = await ensureProgress(tx, vendorId);
  const status = stepStatus(row, key);
  const steps = status === 'not_started' ? { ...row.steps, [key]: { status: 'in_progress' as const, updatedAt: now() } } : row.steps;
  const [after] = await tx.update(P).set({ drafts: { ...row.drafts, [key]: data }, steps, currentStep: key, version: sql`${P.version} + 1` }).where(eq(P.vendorId, vendorId)).returning();
  return after!;
}

async function clearDraft(tx: Tx, vendorId: string, key: StepKey): Promise<void> {
  const row = await ensureProgress(tx, vendorId);
  if (!(key in row.drafts)) return;
  const { [key]: _gone, ...rest } = row.drafts;
  await tx.update(P).set({ drafts: rest }).where(eq(P.vendorId, vendorId));
}

// ------------------------------------------------------------------------------------------------
// 02 business
// ------------------------------------------------------------------------------------------------
export const businessDto = (v: Awaited<ReturnType<typeof getVendor>>) => ({
  businessName: v.displayName,
  businessType: v.businessType as BusinessType | null,
  teamSize: v.teamSize as TeamSize | null,
  operatingLocation: v.operatingLocation,
  workspaceTier: workspaceTier(v.teamSize as TeamSize | null),
});

export async function saveBusiness(tx: Tx, vendorId: string, input: { businessName: string; businessType: BusinessType; teamSize: TeamSize; operatingLocation: string }) {
  const out = await updateVendor(tx, vendorId, { displayName: input.businessName, businessType: input.businessType, teamSize: input.teamSize, operatingLocation: input.operatingLocation });
  await clearDraft(tx, vendorId, 'business');
  await setStep(tx, vendorId, 'business', 'completed');
  return { before: out.before, after: out.after };
}

// ------------------------------------------------------------------------------------------------
// 03 sales channels
// ------------------------------------------------------------------------------------------------
export function channelCatalogue(c: Container): ChannelDef[] {
  return c.config.NODE_ENV === 'production' ? CHANNELS : [...CHANNELS, SANDBOX_CHANNEL];
}

type AccountRow = typeof A.$inferSelect;
const connectionState = (a: AccountRow | undefined): 'connected' | 'needs_attention' | 'not_connected' =>
  !a ? 'not_connected' : a.status === 'active' ? (a.connectionStatus === 'error' || a.connectionStatus === 'disconnected' ? 'needs_attention' : 'connected')
    : a.status === 'pending_authorization' ? 'not_connected' : 'needs_attention';

const rank = (a: AccountRow): number => (a.status === 'active' ? 0 : a.status === 'pending_authorization' ? 2 : 1);

export async function listChannels(tx: Tx, c: Container, vendorId: string) {
  const progress = await ensureProgress(tx, vendorId);
  const accounts = await tx.select().from(A).where(eq(A.vendorId, vendorId)).orderBy(desc(A.createdAt));
  const items = channelCatalogue(c).map((def) => {
    const mine = accounts.filter((a) => a.marketplace === def.code).sort((x, y) => rank(x) - rank(y));
    const best = mine[0];
    const live = def.connector !== null && c.connectors.has(def.connector);
    const state = connectionState(best);
    return {
      code: def.code, name: def.name, kind: def.kind, description: def.description,
      availability: live ? ('available' as const) : ('coming_soon' as const),
      selected: progress.selectedChannels.includes(def.code),
      connection: state,
      account: best ? { id: best.id, displayName: best.displayName, status: best.status, connectionStatus: best.connectionStatus, lastSyncedAt: best.lastSyncedAt ? best.lastSyncedAt.toISOString() : null, mode: best.mode } : null,
      accountCount: mine.length,
      actions: (live ? (state === 'connected' ? ['manage'] : ['connect']) : []) as Array<'connect' | 'manage'>,
    };
  });
  const connected = items.filter((i) => i.connection === 'connected').length;
  const pendingSelection = items.filter((i) => i.selected && i.availability === 'available' && i.connection !== 'connected').length;
  return { items, summary: { connected, selectedToConnect: pendingSelection, interestedInComingSoon: items.filter((i) => i.selected && i.availability === 'coming_soon').length } };
}

export async function saveChannelSelection(tx: Tx, c: Container, vendorId: string, selected: string[]) {
  const known = new Set(channelCatalogue(c).map((d) => d.code));
  const unknown = selected.filter((s) => !known.has(s));
  if (unknown.length) throw Errors.validation({ issues: unknown.map((u) => ({ path: 'selected', message: `unknown channel "${u}"` })) });
  await ensureProgress(tx, vendorId);
  const unique = [...new Set(selected)];
  await tx.update(P).set({ selectedChannels: unique, version: sql`${P.version} + 1` }).where(eq(P.vendorId, vendorId));
  await clearDraft(tx, vendorId, 'channels');
  await setStep(tx, vendorId, 'channels', 'completed');
  return unique;
}

/** "Connect": create the marketplace account (once) and tell the client how to authorize it */
export async function connectChannel(tx: Tx, c: Container, vendorId: string, code: string, input: { displayName?: string; mode?: 'live' | 'sandbox' }) {
  const def = channelCatalogue(c).find((d) => d.code === code);
  if (!def) throw Errors.notFound('Channel', code);
  if (!def.connector || !c.connectors.has(def.connector)) {
    throw new AppError('CONFLICT', `${def.name} is coming soon. Tick it to be told when it is available.`, { details: { rule: 'channel_coming_soon', channel: code } });
  }
  const existing = (await tx.select().from(A).where(and(eq(A.vendorId, vendorId), eq(A.marketplace, def.connector)))).sort((x, y) => rank(x) - rank(y))[0];
  if (existing) return { account: existing, created: false };
  const dto = await createAccount(tx, c, vendorId, { marketplace: def.connector, displayName: input.displayName ?? def.name, mode: input.mode });
  const [row] = await tx.select().from(A).where(and(eq(A.vendorId, vendorId), eq(A.id, dto.id)));
  const progress = await ensureProgress(tx, vendorId);
  if (!progress.selectedChannels.includes(code)) await tx.update(P).set({ selectedChannels: [...progress.selectedChannels, code] }).where(eq(P.vendorId, vendorId));
  return { account: row!, created: true };
}

// ------------------------------------------------------------------------------------------------
// 04 products
// ------------------------------------------------------------------------------------------------
export async function catalogOverview(tx: Tx, c: Container, vendorId: string) {
  const progress = await ensureProgress(tx, vendorId);
  const accounts = (await tx.select().from(A).where(and(eq(A.vendorId, vendorId), eq(A.status, 'active')))).sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
  const ids = accounts.map((a) => a.id);
  const imported = ids.length
    ? await rows(tx, sql`select marketplace_account_id as id, count(*)::int as n, count(*) filter (where status = 'new')::int as pending from imported_products where vendor_id = ${vendorId} and marketplace_account_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) group by 1`)
    : [];
  const jobs = ids.length
    ? await tx.select().from(schema.syncJobs).where(and(eq(schema.syncJobs.vendorId, vendorId), eq(schema.syncJobs.type, 'catalog_import'), inArray(schema.syncJobs.marketplaceAccountId, ids))).orderBy(desc(schema.syncJobs.createdAt))
    : [];
  const [{ n: masterProducts } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.products).where(and(eq(schema.products.vendorId, vendorId), isNull(schema.products.deletedAt)));
  const [{ n: masterVariants } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.productVariants).where(and(eq(schema.productVariants.vendorId, vendorId), isNull(schema.productVariants.deletedAt)));

  const items = accounts.map((a) => {
    const count = progress.catalogCounts[a.id];
    const imp = imported.find((r) => r.id === a.id);
    const job = jobs.find((j) => j.marketplaceAccountId === a.id);
    const running = job && (job.status === 'queued' || job.status === 'running' || job.status === 'retrying');
    const importedCount = Number(imp?.n ?? 0);
    const connector = c.connectors.has(a.marketplace) ? c.connectors.get(a.marketplace) : null;
    return {
      accountId: a.id, marketplace: a.marketplace, name: CHANNELS.find((d) => d.code === a.marketplace)?.name ?? a.displayName,
      connection: connectionState(a),
      productsAvailable: count ? count.count : null,
      productsAvailableIsCapped: count ? count.capped : false,
      countedAt: count ? count.countedAt : null,
      importedProducts: importedCount, awaitingReview: Number(imp?.pending ?? 0),
      lastSyncedAt: a.lastSyncedAt ? a.lastSyncedAt.toISOString() : null,
      importStatus: running ? ('importing' as const) : job?.status === 'failed' || job?.status === 'dead' ? ('failed' as const) : importedCount > 0 || job?.status === 'succeeded' ? ('imported' as const) : ('not_imported' as const),
      lastImportAt: job?.finishedAt ? job.finishedAt.toISOString() : null,
      canImport: Boolean(connector && enabledCapabilities(connector).includes('catalog.import')),
    };
  });
  const counted = items.filter((i) => i.productsAvailable !== null);
  return {
    items,
    summary: { connected: items.length, productsAvailable: counted.reduce((s, i) => s + (i.productsAvailable ?? 0), 0), allCounted: counted.length === items.length, masterProducts, masterVariants },
    ways: { importFromMarketplace: items.some((i) => i.canImport), uploadCsv: true, createProduct: true, createMultiple: true },
  };
}

export async function saveCatalogCounts(tx: Tx, vendorId: string, counts: Record<string, { count: number; capped: boolean }>): Promise<void> {
  const row = await ensureProgress(tx, vendorId);
  const stamped = Object.fromEntries(Object.entries(counts).map(([id, v]) => [id, { ...v, countedAt: now() }]));
  await tx.update(P).set({ catalogCounts: { ...row.catalogCounts, ...stamped } }).where(eq(P.vendorId, vendorId));
}

export async function activeAccountsForCounting(tx: Tx, vendorId: string, accountId?: string) {
  const list = await tx.select().from(A).where(and(eq(A.vendorId, vendorId), eq(A.status, 'active'), accountId ? eq(A.id, accountId) : undefined));
  if (accountId && !list.length) throw Errors.notFound('Connected marketplace account', accountId);
  return list;
}

// ------------------------------------------------------------------------------------------------
// 05 inventory
// ------------------------------------------------------------------------------------------------
export interface InventoryInput {
  mode: 'simple' | 'warehouse';
  startingMethod: 'manual' | 'marketplace' | 'file';
  locationName?: string;
  warehouse?: { name: string; location?: string; address?: string };
}

async function defaultWarehouse(tx: Tx, vendorId: string) {
  const W = schema.warehouses;
  const [w] = await tx.select().from(W).where(and(eq(W.vendorId, vendorId), isNull(W.deletedAt), eq(W.isDefault, true)));
  return w ?? null;
}

export async function getInventorySetup(tx: Tx, vendorId: string) {
  const vendor = await getVendor(tx, vendorId);
  const inv = ((vendor.settings as Record<string, unknown>).inventory ?? {}) as { mode?: 'simple' | 'warehouse'; startingMethod?: 'manual' | 'marketplace' | 'file' };
  const w = await defaultWarehouse(tx, vendorId);
  const [{ n: warehouseCount } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.warehouses).where(and(eq(schema.warehouses.vendorId, vendorId), isNull(schema.warehouses.deletedAt)));
  const address = (w?.address ?? {}) as Record<string, string>;
  return {
    mode: inv.mode ?? null, startingMethod: inv.startingMethod ?? null,
    location: w ? { id: w.id, code: w.code, name: w.name, city: address.city ?? null, state: address.state ?? null, address: address.line1 ?? null } : null,
    warehouseCount,
    options: {
      modes: [
        { value: 'simple', label: 'Simple inventory', description: 'Track stock at the product or SKU level without setting up a warehouse.', traits: ['Home inventory', 'Small business', 'Single location'] },
        { value: 'warehouse', label: 'Warehouse inventory', description: 'Track stock across warehouses and locations.', traits: ['Multiple warehouses', 'Warehouse staff', 'Bins and storage locations'] },
      ],
      startingMethods: [
        { value: 'manual', label: 'Enter stock manually', next: { method: 'POST', url: '/api/v1/inventory/receive' } },
        { value: 'marketplace', label: 'Import stock from marketplace', next: { method: 'POST', url: '/api/v1/marketplace-accounts/{id}/import-products' } },
        { value: 'file', label: 'Import inventory file', next: { method: 'POST', url: '/api/v1/inventory/imports' } },
      ],
    },
  };
}

export async function saveInventorySetup(tx: Tx, vendorId: string, input: InventoryInput) {
  const W = schema.warehouses;
  const name = input.mode === 'simple' ? input.locationName! : input.warehouse!.name;
  const { city, state } = input.mode === 'warehouse' ? splitLocation(input.warehouse!.location) : {};
  const address: Record<string, unknown> = { ...(input.warehouse?.address ? { line1: input.warehouse.address } : {}), ...(city ? { city } : {}), ...(state ? { state } : {}), country: 'IN' };
  const existing = await defaultWarehouse(tx, vendorId);

  if (input.mode === 'simple') {
    const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(W).where(and(eq(W.vendorId, vendorId), isNull(W.deletedAt), eq(W.status, 'active')));
    if (n > 1) throw new AppError('CONFLICT', 'Simple inventory uses a single location. Deactivate your extra warehouses first, or choose warehouse inventory.', { details: { rule: 'multiple_warehouses', activeWarehouses: n } });
  }
  let warehouseId: string;
  if (existing) {
    await updateWarehouse(tx, vendorId, existing.id, { name, address: { ...(existing.address as Record<string, unknown>), ...address } });
    warehouseId = existing.id;
  } else {
    const created = await createWarehouse(tx, vendorId, { code: input.mode === 'simple' ? 'HOME' : 'MAIN', name, address, isDefault: true });
    warehouseId = created.id;
  }
  const settings = await updateSettings(tx, vendorId, { inventory: { mode: input.mode, startingMethod: input.startingMethod } });
  await clearDraft(tx, vendorId, 'inventory');
  await setStep(tx, vendorId, 'inventory', 'completed');
  return { warehouseId, created: !existing, before: settings.before.settings, after: settings.after.settings };
}

/** the numbers on the inventory screen, from the real stock tables */
export async function inventoryOverview(tx: Tx, vendorId: string) {
  const vendor = await getVendor(tx, vendorId);
  const fallback = Number(((vendor.settings as Record<string, unknown>).lowStockThreshold as number | undefined) ?? 5);
  const [r] = await rows(tx, sql`
    with v as (
      select pv.id, coalesce(sum(i.quantity_on_hand - i.quantity_reserved), 0)::int as available, coalesce(sum(i.quantity_on_hand), 0)::int as on_hand, max(i.reorder_level) as reorder_level
      from product_variants pv
      left join inventory i on i.vendor_id = pv.vendor_id and i.variant_id = pv.id
      where pv.vendor_id = ${vendorId} and pv.deleted_at is null and pv.status = 'active'
      group by pv.id)
    select (select count(*)::int from products where vendor_id = ${vendorId} and deleted_at is null) as products,
           coalesce(sum(on_hand), 0)::int as units,
           count(*) filter (where available > 0 and available <= coalesce(reorder_level, ${fallback}))::int as low_stock,
           count(*) filter (where available <= 0)::int as out_of_stock
    from v`);
  const accounts = await tx.select({ marketplace: A.marketplace, name: A.displayName }).from(A).where(and(eq(A.vendorId, vendorId), eq(A.status, 'active')));
  return {
    products: Number(r?.products ?? 0), units: Number(r?.units ?? 0), lowStock: Number(r?.low_stock ?? 0), outOfStock: Number(r?.out_of_stock ?? 0),
    lowStockThreshold: fallback,
    syncedChannels: accounts.map((a) => ({ marketplace: a.marketplace, name: CHANNELS.find((d) => d.code === a.marketplace)?.name ?? a.name })),
  };
}

// ------------------------------------------------------------------------------------------------
// 06 fulfillment
// ------------------------------------------------------------------------------------------------
export interface FulfillmentInput { defaultMethod: FulfillmentMethod; defaultPreference: (typeof schema.FULFILLMENT_PREFERENCES)[number]; overrides?: Record<string, FulfillmentMethod> }

export async function getFulfillment(tx: Tx, c: Container, vendorId: string) {
  const F = schema.fulfillmentPreferences;
  const [pref] = await tx.select().from(F).where(eq(F.vendorId, vendorId));
  const accounts = await tx.select().from(A).where(and(eq(A.vendorId, vendorId), eq(A.status, 'active')));
  const providers = await tx.select().from(schema.vendorShippingProviders).where(and(eq(schema.vendorShippingProviders.vendorId, vendorId), eq(schema.vendorShippingProviders.status, 'active'), eq(schema.vendorShippingProviders.kind, 'third_party')));
  const marketplaceAvailable = accounts.length > 0;
  const thirdPartyAvailable = providers.length > 0;
  const available: Record<FulfillmentMethod, boolean> = { marketplace: marketplaceAvailable, seller: true, third_party: thirdPartyAvailable };
  const defaultMethod = (pref?.defaultMethod ?? 'marketplace') as FulfillmentMethod;
  const overrides = (pref?.overrides ?? {}) as Record<string, FulfillmentMethod>;
  const warnings: Array<{ code: string; message: string; marketplace?: string }> = [];
  if (!available[defaultMethod]) warnings.push({ code: `${defaultMethod}_unavailable`, message: defaultMethod === 'third_party' ? 'Connect a shipping provider to use third-party shipping.' : 'Connect a marketplace to use marketplace shipping.' });
  for (const [mp, m] of Object.entries(overrides)) if (!available[m]) warnings.push({ code: `${m}_unavailable`, marketplace: mp, message: `${m === 'third_party' ? 'Third-party' : 'Marketplace'} shipping is not available yet.` });
  const name = (code: string) => CHANNELS.find((d) => d.code === code)?.name ?? code;
  return {
    configured: Boolean(pref),
    defaultMethod, defaultPreference: (pref?.defaultPreference ?? 'recommended') as (typeof schema.FULFILLMENT_PREFERENCES)[number], overrides,
    methods: FULFILLMENT_METHOD_OPTIONS.map((m) => ({ ...m, available: available[m.value], requiresConnection: m.value !== 'seller', unavailableReason: available[m.value] ? null : m.value === 'third_party' ? 'connection_required' : 'no_marketplace_connected' })),
    preferenceOptions: FULFILLMENT_PREFERENCE_OPTIONS,
    connections: {
      marketplaceShipping: { available: marketplaceAvailable, marketplaces: [...new Set(accounts.map((a) => a.marketplace))] },
      thirdParty: { available: thirdPartyAvailable, providers: providers.map((p) => ({ id: p.id, code: p.providerCode, label: p.label, isDefault: p.isDefault })), connectWith: { method: 'POST', url: '/api/v1/shipping/providers' } },
    },
    preview: [
      ...[...new Set(accounts.map((a) => a.marketplace))].map((mp) => ({ kind: 'marketplace' as const, marketplace: mp, label: `Marketplace / ${name(mp)}`, method: overrides[mp] ?? defaultMethod, isOverride: mp in overrides })),
      { kind: 'default' as const, marketplace: null, label: 'Other orders', method: defaultMethod, isOverride: false },
    ],
    warnings,
    flow: ['Order received', 'Pick', 'Pack', 'Shipping', 'Dispatch'],
  };
}

export async function saveFulfillment(tx: Tx, c: Container, vendorId: string, input: FulfillmentInput) {
  const F = schema.fulfillmentPreferences;
  const known = new Set(channelCatalogue(c).map((d) => d.code));
  const bad = Object.keys(input.overrides ?? {}).filter((k) => !known.has(k));
  if (bad.length) throw Errors.validation({ issues: bad.map((b) => ({ path: `overrides.${b}`, message: 'unknown marketplace' })) });
  const [before] = await tx.select().from(F).where(eq(F.vendorId, vendorId));
  const values = { defaultMethod: input.defaultMethod, defaultPreference: input.defaultPreference, overrides: input.overrides ?? {} };
  if (before) await tx.update(F).set({ ...values, version: sql`${F.version} + 1` }).where(eq(F.vendorId, vendorId));
  else await tx.insert(F).values({ vendorId, ...values });
  await clearDraft(tx, vendorId, 'fulfillment');
  await setStep(tx, vendorId, 'fulfillment', 'completed');
  return { before: before ? { defaultMethod: before.defaultMethod, defaultPreference: before.defaultPreference, overrides: before.overrides } : null, after: values };
}

// ------------------------------------------------------------------------------------------------
// 07 readiness + completion
// ------------------------------------------------------------------------------------------------
export async function readiness(tx: Tx, c: Container, vendorId: string) {
  const row = await ensureProgress(tx, vendorId);
  const vendor = await getVendor(tx, vendorId);
  const channels = await listChannels(tx, c, vendorId);
  const catalog = await catalogOverview(tx, c, vendorId);
  const inv = await getInventorySetup(tx, vendorId);
  const ful = await getFulfillment(tx, c, vendorId);
  const st = (k: StepKey) => stepStatus(row, k);
  const businessDone = st('business') === 'completed' && Boolean(vendor.businessType && vendor.teamSize);

  const items = [
    { key: 'business', group: 'Business', title: 'Business profile', status: businessDone ? 'complete' : 'pending', done: businessDone },
    { key: 'channels', group: 'Sales Channels', title: 'Sales channels', status: channels.summary.connected > 0 ? 'connected' : st('channels') === 'skipped' ? 'skipped' : 'pending', done: channels.summary.connected > 0 },
    { key: 'products', group: 'Products', title: 'Product catalog', status: catalog.summary.masterProducts > 0 ? 'ready' : st('products') === 'skipped' ? 'skipped' : 'pending', done: catalog.summary.masterProducts > 0 },
    { key: 'inventory', group: 'Inventory', title: 'Inventory', status: st('inventory') === 'completed' && inv.location ? 'configured' : st('inventory') === 'skipped' ? 'skipped' : 'pending', done: st('inventory') === 'completed' && Boolean(inv.location) },
    { key: 'fulfillment', group: 'Fulfillment', title: 'Fulfillment & shipping', status: ful.configured && ful.warnings.length === 0 ? 'configured' : ful.configured ? 'needs_attention' : st('fulfillment') === 'skipped' ? 'skipped' : 'pending', done: ful.configured && ful.warnings.length === 0 },
  ] as const;
  const done = items.filter((i) => i.done).length;
  return {
    items: items.map(({ done: _d, ...i }) => i),
    percentComplete: Math.round((done / items.length) * 100),
    canGoToDashboard: businessDone,
    completed: row.status === 'completed',
    whatHappensNext: [
      { title: 'Your channels sync', body: 'Connected marketplace activity begins flowing into the workspace.' },
      { title: 'Your operations stay centralized', body: 'Products, inventory and orders are managed from one place.' },
      { title: 'Your dashboard surfaces priorities', body: 'Needs-attention items appear first so you know what to act on.' },
    ],
  };
}

export async function completeOnboarding(tx: Tx, c: Container, vendorId: string) {
  const r = await readiness(tx, c, vendorId);
  if (!r.canGoToDashboard) throw new AppError('CONFLICT', 'Finish your business profile before opening the dashboard.', { details: { rule: 'onboarding_incomplete', missing: r.items.filter((i) => i.status === 'pending').map((i) => i.key) } });
  const row = await ensureProgress(tx, vendorId);
  if (row.status === 'completed') return { alreadyCompleted: true, completedAt: row.completedAt!.toISOString() };
  await setStep(tx, vendorId, 'ready', 'completed', { focus: 'ready' });
  const at = new Date();
  await tx.update(P).set({ status: 'completed', completedAt: at, version: sql`${P.version} + 1` }).where(eq(P.vendorId, vendorId));
  return { alreadyCompleted: false, completedAt: at.toISOString() };
}

export async function skipStep(tx: Tx, vendorId: string, key: StepKey) {
  if (!STEP_META[key].skippable) throw new AppError('CONFLICT', `The ${STEP_META[key].title} step cannot be skipped`, { details: { rule: 'step_not_skippable', step: key } });
  // a step that is already done stays done: "Skip for now" on a revisited screen must not discard the setup
  const row = await ensureProgress(tx, vendorId);
  if (stepStatus(row, key) === 'completed') return row;
  return setStep(tx, vendorId, key, 'skipped');
}

/** products has no form of its own: "Continue" confirms the seller has seen the options */
export async function completeProductsStep(tx: Tx, vendorId: string) {
  await clearDraft(tx, vendorId, 'products');
  return setStep(tx, vendorId, 'products', 'completed');
}
