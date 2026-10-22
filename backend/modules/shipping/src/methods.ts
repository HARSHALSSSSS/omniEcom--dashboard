import { and, eq, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { effects, type Container, type OpCtx } from '@oms/module-kit';
import { assertProviderAllowed } from './service';
import { getProvider, listProviders, mergeConfig, publicConfig } from './providers';
import { CUSTOM_PREFIX, isCustomCode } from './providers/custom';

/**
 * Shipping METHODS: the three kinds of "who moves this parcel" (marketplace-managed, seller-managed, third-party courier) as one
 * list, on top of vendor_shipping_providers (kind / channel_code / verification). Capabilities are derived from the connector
 * (marketplace) or the provider catalogue (third-party): never hard-coded; a method counts as "requires configuration" until a
 * safe capability check (POST .../verify) has been recorded.
 */
const SP = schema.vendorShippingProviders;
const A = schema.marketplaceAccounts;
export type MethodRow = typeof SP.$inferSelect;
/** the three ways a parcel can move: what an order's shipping DECISION is about */
export type MethodKind = 'marketplace' | 'seller' | 'third_party';
/** what a configured method IS: a seller-configured logistics provider (`custom`) is chosen as a third-party method for an order */
export type ProviderKind = MethodKind | 'custom';
export const decisionKind = (kind: string): MethodKind => (kind === 'custom' ? 'third_party' : (kind as MethodKind));
export type CapValue = 'supported' | 'requires_configuration' | 'not_supported';
export const CAPABILITY_KEYS = ['label', 'tracking', 'dispatchUpdate', 'statusSync'] as const;
export type CapKey = (typeof CAPABILITY_KEYS)[number];
export type CapFlags = Record<CapKey, boolean>;
export type CapSet = Record<CapKey, CapValue>;
export const METHOD_KINDS: readonly MethodKind[] = ['marketplace', 'seller', 'third_party'];
export const SELLER_CODE = 'seller';
export const marketplaceCodeOf = (channel: string): string => `marketplace:${channel}`;
const DEFAULT_ORDER_TYPES = ['prepaid', 'cod'];

/** the seller's own shipping is carried out with the manual provider (staff type the AWB / the label is generated here) */
export const SELLER_PROVIDER = 'manual';

interface Flags { flags: CapFlags; source: string; raw: Record<string, unknown> }

export function connectorName(c: Container, code: string | null): string {
  if (!code) return 'Marketplace';
  try { return c.connectors.has(code) ? c.connectors.get(code).displayName : code; } catch { return code; }
}

/** what a method CAN do according to its source of truth */
export function flagsFor(c: Container, m: Pick<MethodRow, 'kind' | 'providerCode' | 'channelCode'> & { config?: Record<string, unknown> }): Flags {
  if (m.kind === 'marketplace') {
    try {
      const cap = c.connectors.get(m.channelCode ?? '').capabilities;
      return {
        flags: { label: cap.shipping.generateLabel, tracking: cap.shipping.marketplaceManagedLogistics || cap.shipping.createShipment, dispatchUpdate: cap.orders.updateStatus, statusSync: cap.orders.fetch || cap.orders.webhook },
        source: `connector:${m.channelCode}`, raw: { shipping: cap.shipping, orders: { fetch: cap.orders.fetch, webhook: cap.orders.webhook, updateStatus: cap.orders.updateStatus } },
      };
    } catch { return { flags: { label: false, tracking: false, dispatchUpdate: false, statusSync: false }, source: `connector:${m.channelCode}`, raw: { error: 'connector_unavailable' } }; }
  }
  const code = m.kind === 'seller' ? SELLER_PROVIDER : m.providerCode;
  try {
    const p = getProvider(code);
    // tracking: every provider can receive tracking updates (polled or pushed); dispatchUpdate: the provider can be told about the hand-over (manifest); statusSync: it can be polled
    // a configured logistics provider can only be synchronised when it has a tracking API; otherwise tracking is entered by hand (tracking itself still works)
    const polls = m.kind === 'custom' ? typeof m.config?.trackingApiUrl === 'string' && m.config.trackingApiUrl.trim() !== '' : p.capabilities.polling;
    return { flags: { label: p.capabilities.labels, tracking: true, dispatchUpdate: p.capabilities.manifest, statusSync: m.kind === 'seller' ? true : polls }, source: `provider:${p.code}`, raw: { ...p.capabilities, polling: polls } };
  } catch { return { flags: { label: false, tracking: false, dispatchUpdate: false, statusSync: false }, source: `provider:${code}`, raw: { error: 'provider_not_registered' } }; }
}

export const isVerified = (m: Pick<MethodRow, 'verification'>): boolean => (m.verification as { state?: string }).state === 'verified';

export function capabilitiesOf(c: Container, m: MethodRow): CapSet {
  const { flags } = flagsFor(c, m);
  const verified = isVerified(m);
  return Object.fromEntries(CAPABILITY_KEYS.map((k) => [k, !flags[k] ? 'not_supported' : verified ? 'supported' : 'requires_configuration'])) as CapSet;
}

/** capability for a kind that has no configured method yet (what the matrix shows before setup) */
const unconfigured = (): CapSet => ({ label: 'requires_configuration', tracking: 'requires_configuration', dispatchUpdate: 'requires_configuration', statusSync: 'requires_configuration' });

// ------------------------------------------------------------------------------------------------
// config
// ------------------------------------------------------------------------------------------------
const configKeysFor = (kind: ProviderKind, code: string): string[] => {
  if (kind === 'marketplace') return [];
  try { return getProvider(kind === 'seller' ? SELLER_PROVIDER : code).configFields.map((f) => f.key); } catch { return []; }
};
/** the declared settings; a credential only shows as a placeholder */
const visibleConfig = (m: MethodRow): Record<string, unknown> => (m.kind === 'marketplace' ? {} : publicConfig(m.kind === 'seller' ? SELLER_PROVIDER : m.providerCode, m.config));
function validateMethodConfig(kind: ProviderKind, code: string, config: Record<string, unknown>, o: { creating?: boolean } = {}): void {
  const allowed = configKeysFor(kind, code);
  const bad = Object.keys(config).filter((k) => !allowed.includes(k));
  if (bad.length) throw Errors.validation({ issues: bad.map((b) => ({ path: `config.${b}`, message: `not a setting of this method (allowed: ${allowed.join(', ') || 'none'})` })) });
  const tpl = config.trackingUrlTemplate;
  if (tpl !== undefined && (typeof tpl !== 'string' || !/^https:\/\//i.test(tpl) || !tpl.includes('{awb}'))) throw new AppError('BAD_REQUEST', 'trackingUrlTemplate must be an https URL containing {awb}', { details: { rule: 'tracking_url_template' } });
  if (kind !== 'custom') return;
  const issues: Array<{ path: string; message: string }> = [];
  const text = (k: string): string => (typeof config[k] === 'string' ? (config[k] as string).trim() : '');
  if (o.creating) for (const k of ['carrierName', 'trackingUrlTemplate']) if (!text(k)) issues.push({ path: `config.${k}`, message: 'required for a configured logistics provider' });
  if (config.carrierName !== undefined && (text('carrierName').length < 2 || text('carrierName').length > 80)) issues.push({ path: 'config.carrierName', message: 'a name of 2 to 80 characters' });
  if (text('awbPrefix').length > 20) issues.push({ path: 'config.awbPrefix', message: 'at most 20 characters' });
  if (text('awbLength') && !(/^\d{1,2}$/.test(text('awbLength')) && Number(text('awbLength')) >= 3)) issues.push({ path: 'config.awbLength', message: 'a whole number from 3 to 99' });
  if (text('defaultService').length > 60) issues.push({ path: 'config.defaultService', message: 'at most 60 characters' });
  if (text('apiKey').length > 300) issues.push({ path: 'config.apiKey', message: 'at most 300 characters' });
  if (text('trackingApiUrl')) {
    try { const u = new URL(text('trackingApiUrl').replace('{awb}', 'X')); if (u.protocol !== 'https:' || u.username || u.password) throw new Error('scheme'); } catch { issues.push({ path: 'config.trackingApiUrl', message: 'an https URL (the AWB is {awb})' }); }
  }
  if (issues.length) throw Errors.validation({ issues });
}

// ------------------------------------------------------------------------------------------------
// DTO + list
// ------------------------------------------------------------------------------------------------
export interface MethodContext { accounts: Array<typeof A.$inferSelect>; preference: { defaultMethod: string; overrides: Record<string, string> } | null }

export async function loadMethodContext(tx: Tx, vendorId: string): Promise<MethodContext> {
  const accounts = await tx.select().from(A).where(and(eq(A.vendorId, vendorId), eq(A.status, 'active')));
  const [pref] = await tx.select().from(schema.fulfillmentPreferences).where(eq(schema.fulfillmentPreferences.vendorId, vendorId));
  return { accounts, preference: pref ? { defaultMethod: pref.defaultMethod, overrides: pref.overrides } : null };
}

export const methodName = (c: Container, m: Pick<MethodRow, 'kind' | 'label' | 'channelCode'>): string =>
  m.kind === 'marketplace' ? `${connectorName(c, m.channelCode)} Shipping` : m.kind === 'seller' ? 'Seller Shipping' : m.label;

export function toMethodDto(c: Container, m: MethodRow, mc: MethodContext) {
  const caps = capabilitiesOf(c, m);
  const account = m.kind === 'marketplace' ? mc.accounts.find((a) => a.marketplace === m.channelCode) : undefined;
  const state = m.status === 'disabled' ? 'disabled' as const : isVerified(m) ? 'configured' as const : 'requires_configuration' as const;
  const v = m.verification as { verifiedAt?: string };
  let connectorLive = false;
  try { connectorLive = m.channelCode ? c.connectors.get(m.channelCode).implementation !== 'planned' : false; } catch { /* unknown channel */ }
  let provider: { code: string; label: string } | null = null;
  if (m.kind === 'third_party' || m.kind === 'custom') provider = { code: m.providerCode, label: m.label };
  const preferred = mc.preference ? [...Object.entries(mc.preference.overrides).filter(([, k]) => k === m.kind).map(([ch]) => ch), ...(mc.preference.defaultMethod === m.kind ? ['*'] : [])] : [];
  return {
    id: m.id, kind: m.kind as ProviderKind, name: methodName(c, m), label: m.label, providerCode: m.providerCode,
    channel: m.kind === 'marketplace' ? { code: m.channelCode, name: connectorName(c, m.channelCode), accountId: account?.id ?? null, availability: connectorLive ? 'live' as const : 'coming_soon' as const } : null,
    provider, state, active: m.status === 'active', isDefault: m.isDefault, preferredFor: preferred,
    lastSyncAt: (account?.lastSyncedAt ?? (v.verifiedAt ? new Date(v.verifiedAt) : null))?.toISOString() ?? null,
    supportedOrderTypes: m.supportedOrderTypes.length ? m.supportedOrderTypes : DEFAULT_ORDER_TYPES, capabilities: caps,
    verification: { state: isVerified(m) ? 'verified' as const : 'unverified' as const, verifiedAt: v.verifiedAt ?? null },
    config: visibleConfig(m), version: m.version, createdAt: m.createdAt.toISOString(),
  };
}

export async function listMethods(tx: Tx, c: Container, vendorId: string) {
  const rows = await tx.select().from(SP).where(eq(SP.vendorId, vendorId)).orderBy(SP.createdAt);
  const mc = await loadMethodContext(tx, vendorId);
  const items = rows.map((m) => toMethodDto(c, m, mc));
  const matrix: Array<{ methodId: string | null; method: MethodKind | 'unverified_connector'; name: string } & CapSet> = METHOD_KINDS.flatMap((kind) => {
    const mine = items.filter((i) => decisionKind(i.kind) === kind);
    if (mine.length === 0) return [{ methodId: null as string | null, method: kind, name: kind === 'marketplace' ? 'Marketplace Shipping' : kind === 'seller' ? 'Seller Shipping' : 'Third-party provider', ...unconfigured() }];
    return mine.map((i) => ({ methodId: i.id as string | null, method: kind, name: i.name, ...i.capabilities }));
  });
  // a connected marketplace whose connector is not live yet (or unknown) cannot be verified: it reads "Not supported by connector" instead of a guess
  const unverified = mc.accounts.filter((a) => { try { return c.connectors.get(a.marketplace).implementation === 'planned'; } catch { return true; } });
  for (const a of unverified) matrix.push({ methodId: null, method: 'unverified_connector', name: `Unverified connector · ${connectorName(c, a.marketplace)}`, label: 'not_supported', tracking: 'not_supported', dispatchUpdate: 'not_supported', statusSync: 'not_supported' });
  const active = items.filter((i) => i.active).length;
  return { items, capabilityMatrix: matrix, summary: `${active} active method${active === 1 ? '' : 's'}`, activeMethods: active };
}

export async function getMethodRow(tx: Tx, vendorId: string, id: string): Promise<MethodRow> {
  const [m] = await tx.select().from(SP).where(and(eq(SP.id, id), eq(SP.vendorId, vendorId)));
  if (!m) throw Errors.notFound('Shipping method', id);
  return m;
}

export async function getMethod(tx: Tx, c: Container, vendorId: string, id: string) {
  return toMethodDto(c, await getMethodRow(tx, vendorId, id), await loadMethodContext(tx, vendorId));
}

// ------------------------------------------------------------------------------------------------
// writes
// ------------------------------------------------------------------------------------------------
export interface AddMethodInput { kind: ProviderKind; providerCode?: string; channelCode?: string; label?: string; config?: Record<string, unknown>; supportedOrderTypes?: string[]; isDefault?: boolean }

export async function addMethod(tx: Tx, ctx: OpCtx, input: AddMethodInput) {
  let code: string; let label: string; let channel: string | null = null;
  let config: Record<string, unknown> = input.config ?? {};
  if (input.kind === 'marketplace') {
    if (!input.channelCode) throw Errors.validation({ issues: [{ path: 'channelCode', message: 'required for marketplace shipping' }] });
    const [acc] = await tx.select({ id: A.id }).from(A).where(and(eq(A.vendorId, ctx.vendorId), eq(A.marketplace, input.channelCode), eq(A.status, 'active'))).limit(1);
    if (!acc) throw new AppError('CONFLICT', 'Connect this marketplace first: marketplace shipping is bound to a connected account', { details: { rule: 'marketplace_not_connected', channelCode: input.channelCode } });
    code = marketplaceCodeOf(input.channelCode); channel = input.channelCode; label = input.label ?? `${connectorName(ctx.c, channel)} Shipping`;
  } else if (input.kind === 'seller') { code = SELLER_CODE; label = input.label ?? 'Seller Shipping'; } else if (input.kind === 'custom') {
    // the seller's own logistics provider: named by the seller, one provider code per provider (custom:<slug>)
    const name = (input.label ?? (typeof input.config?.carrierName === 'string' ? input.config.carrierName : '')).trim();
    if (name.length < 2) throw Errors.validation({ issues: [{ path: 'label', message: 'give the logistics provider a name of at least 2 characters' }] });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'provider';
    const taken = new Set((await tx.select({ code: SP.providerCode }).from(SP).where(and(eq(SP.vendorId, ctx.vendorId)))).map((r) => r.code));
    code = `${CUSTOM_PREFIX}${slug}`;
    for (let n = 2; taken.has(code); n++) code = `${CUSTOM_PREFIX}${slug}-${n}`;
    label = name;
    config = { carrierName: name, ...config };
  } else {
    if (!input.providerCode) throw Errors.validation({ issues: [{ path: 'providerCode', message: 'required for a third-party provider' }] });
    if (isCustomCode(input.providerCode)) throw new AppError('BAD_REQUEST', 'Your own logistics provider is added with kind "custom"', { details: { rule: 'use_custom_kind' } });
    const p = getProvider(input.providerCode);
    assertProviderAllowed(ctx.c, p.code);
    code = p.code; label = input.label ?? p.name;
  }
  validateMethodConfig(input.kind, code, config, { creating: true });
  const [dup] = await tx.select({ id: SP.id }).from(SP).where(and(eq(SP.vendorId, ctx.vendorId), eq(SP.providerCode, code)));
  if (dup) throw new AppError('CONFLICT', 'This shipping method is already added', { details: { methodId: dup.id } });
  const [anyDefault] = await tx.select({ id: SP.id }).from(SP).where(and(eq(SP.vendorId, ctx.vendorId), eq(SP.isDefault, true))).limit(1);
  const makeDefault = input.isDefault ?? !anyDefault;
  if (makeDefault) await tx.update(SP).set({ isDefault: false }).where(and(eq(SP.vendorId, ctx.vendorId), eq(SP.isDefault, true)));
  const [row] = await tx.insert(SP).values({
    vendorId: ctx.vendorId, providerCode: code, label, kind: input.kind, channelCode: channel, config, isDefault: makeDefault,
    supportedOrderTypes: input.supportedOrderTypes ?? DEFAULT_ORDER_TYPES, verification: { state: 'unverified' },
  }).returning();
  await effects(tx, ctx).audit({ action: 'shipping.method_added', resourceType: 'shipping_method', resourceId: row!.id, after: { kind: input.kind, providerCode: code, channelCode: channel, isDefault: makeDefault } });
  return row!;
}

export async function patchMethod(tx: Tx, ctx: OpCtx, id: string, patch: { isDefault?: boolean; active?: boolean; config?: Record<string, unknown>; label?: string; supportedOrderTypes?: string[] }) {
  const before = await getMethodRow(tx, ctx.vendorId, id);
  if (patch.config) validateMethodConfig(before.kind as ProviderKind, before.providerCode, patch.config);
  const config = patch.config ? mergeConfig(before.kind === 'seller' ? SELLER_PROVIDER : before.providerCode, before.config, patch.config) : before.config; // a credential that is not sent again is kept
  const status = patch.active === undefined ? before.status : patch.active ? 'active' : 'disabled';
  if (patch.isDefault && status === 'disabled') throw new AppError('CONFLICT', 'A disabled method cannot be the default', { details: { rule: 'disabled_default' } });
  if (patch.isDefault) await tx.update(SP).set({ isDefault: false }).where(and(eq(SP.vendorId, ctx.vendorId), eq(SP.isDefault, true)));
  const isDefault = status === 'disabled' ? false : (patch.isDefault ?? before.isDefault);
  const reset = patch.config !== undefined; // a changed configuration has to be verified again
  const [after] = await tx.update(SP).set({
    status, isDefault, label: patch.label ?? before.label, config, supportedOrderTypes: patch.supportedOrderTypes ?? before.supportedOrderTypes,
    verification: reset ? { state: 'unverified' } : before.verification, version: sql`${SP.version} + 1`,
  }).where(eq(SP.id, id)).returning();
  await effects(tx, ctx).audit({ action: 'shipping.method_updated', resourceType: 'shipping_method', resourceId: id, before: { status: before.status, isDefault: before.isDefault }, after: { status, isDefault, configKeysChanged: patch.config ? Object.keys(patch.config) : [] } }); // never the values
  return after!;
}

export async function capabilityDetail(tx: Tx, c: Container, vendorId: string, id: string) {
  const m = await getMethodRow(tx, vendorId, id);
  const { flags, source, raw } = flagsFor(c, m);
  const caps = capabilitiesOf(c, m);
  const note: Record<CapKey, string> = {
    label: flags.label ? 'A shipping label can be generated' : 'Not supported by connector',
    tracking: flags.tracking ? 'Tracking updates can be received' : 'Not supported by connector',
    dispatchUpdate: flags.dispatchUpdate ? 'The hand-over can be reported' : 'Not supported by connector',
    statusSync: flags.statusSync ? 'Delivery status can be synchronised' : 'Not supported by connector',
  };
  return {
    methodId: m.id, kind: m.kind as ProviderKind, name: methodName(c, m), verified: isVerified(m), verifiedAt: (m.verification as { verifiedAt?: string }).verifiedAt ?? null, source,
    capabilities: CAPABILITY_KEYS.map((k) => ({ key: k, value: caps[k], declared: flags[k], note: caps[k] === 'requires_configuration' ? 'Supported only after verification' : note[k] })), declared: raw,
  };
}

/** A safe capability check: nothing is booked and no courier is called; it checks what is declared and what is connected. */
export async function verifyMethod(tx: Tx, ctx: OpCtx, id: string) {
  const m = await getMethodRow(tx, ctx.vendorId, id);
  const { flags } = flagsFor(ctx.c, m);
  const checks: Array<{ key: string; ok: boolean; message: string }> = [];
  if (m.status !== 'active') checks.push({ key: 'active', ok: false, message: 'The method is disabled' });
  if (m.kind === 'marketplace') {
    const [acc] = await tx.select().from(A).where(and(eq(A.vendorId, ctx.vendorId), eq(A.marketplace, m.channelCode ?? ''), eq(A.status, 'active'))).limit(1);
    checks.push({ key: 'account_connected', ok: Boolean(acc) && acc!.connectionStatus !== 'error' && acc!.connectionStatus !== 'disconnected', message: acc ? `Account ${acc.displayName} is ${acc.connectionStatus}` : 'No connected account for this marketplace' });
  } else if (m.kind === 'third_party' || m.kind === 'custom') {
    let registered = true; try { getProvider(m.providerCode); assertProviderAllowed(ctx.c, m.providerCode); } catch { registered = false; }
    checks.push({ key: 'provider_registered', ok: registered, message: registered ? 'The provider is available' : 'The provider is not available in this environment' });
    const missing = (() => { try { return getProvider(m.providerCode).configFields.filter((f) => f.required && !(f.key in m.config)).map((f) => f.key); } catch { return []; } })();
    checks.push({ key: 'required_settings', ok: missing.length === 0, message: missing.length ? `Missing settings: ${missing.join(', ')}` : 'All required settings are present' });
  }
  const usable = Object.values(flags).some(Boolean);
  checks.push({ key: 'capability_declared', ok: usable, message: usable ? 'The connector declares at least one shipping capability' : 'The connector declares no shipping capability' });
  const ok = checks.every((x) => x.ok);
  const verifiedAt = new Date().toISOString();
  const capabilities = Object.fromEntries(CAPABILITY_KEYS.map((k) => [k, flags[k] ? 'supported' : 'not_supported']));
  const verification = ok ? { state: 'verified', verifiedAt, capabilities } : { state: 'unverified', checkedAt: verifiedAt, capabilities, failed: checks.filter((x) => !x.ok).map((x) => x.key) };
  const [after] = await tx.update(SP).set({ verification, version: sql`${SP.version} + 1` }).where(eq(SP.id, id)).returning();
  await effects(tx, ctx).audit({ action: 'shipping.method_verified', resourceType: 'shipping_method', resourceId: id, after: { state: verification.state, failed: ok ? [] : (verification as { failed: string[] }).failed } });
  return { method: after!, ok, checks, verification: { state: verification.state as 'verified' | 'unverified', verifiedAt: ok ? verifiedAt : null, capabilities: capabilities as Record<string, string> } };
}

/** all catalogue providers with their capability flags (used by the Add Provider drawer through the existing catalogue endpoint) */
export const catalogCodes = (): string[] => listProviders().map((p) => p.code);
