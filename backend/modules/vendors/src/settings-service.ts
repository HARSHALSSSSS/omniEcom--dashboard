import { and, asc, eq, isNull, schema, type Tx } from '@oms/database';
import { AppError } from '@oms/shared';
import { getVendor, updateSettings, type VendorRow } from './service';
import { listGstins, toGstinDto, invalid } from './gst-service';
import { resolveSettings, type ResolvedAlerts } from './settings-defaults';

/** The alert switches as the Settings screen lists them, with the events behind each one (see `alertGate` in the notifications module). */
export function alertMatrix(a: ResolvedAlerts) {
  return [
    { key: 'dispatchSlaBreach', label: 'Marketplace dispatch SLA breaches', description: `Orders that must be dispatched within ${a.dispatchSlaBreach.thresholdMinutes} minutes`, enabled: a.dispatchSlaBreach.enabled, thresholdMinutes: a.dispatchSlaBreach.thresholdMinutes, events: ['order.sla_breach'] },
    { key: 'criticalStockouts', label: 'Critical SKU stockouts and inventory runway warnings', description: 'A SKU reached its reorder level or ran out of stock', enabled: a.criticalStockouts, thresholdMinutes: null, events: ['inventory.low_stock'] },
    { key: 'tokenRenewals', label: 'Channel API token renewals', description: 'A marketplace authorisation expired or cannot be renewed', enabled: a.tokenRenewals, thresholdMinutes: null, events: ['marketplace_account.authorization_expired', 'marketplace_account.token_expiring'] },
    { key: 'syncFailures', label: 'Marketplace sync failures', description: 'A sync with a marketplace failed or gave up', enabled: a.syncFailures, thresholdMinutes: null, events: ['sync.failed', 'sync.dead_lettered'] },
    { key: 'returns', label: 'New return requests and inspection items', description: 'A return was requested or arrived at the warehouse', enabled: a.returns, thresholdMinutes: null, events: ['return.created', 'return.received'] },
  ];
}

/** "Asia/Kolkata (UTC+05:30)" for the read-only time zone field. */
export function timezoneLabel(tz: string): { label: string; utcOffset: string } {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const offset = part === 'GMT' ? '+00:00' : part.replace('GMT', '');
    return { label: `${tz} (UTC${offset})`, utcOffset: offset };
  } catch {
    return { label: tz, utcOffset: '+00:00' };
  }
}

const CURRENCY_LABEL: Record<string, string> = { INR: 'INR (₹)', USD: 'USD ($)', EUR: 'EUR (€)', GBP: 'GBP (£)' };

export async function warehouseChoices(tx: Tx, vendorId: string) {
  const w = schema.warehouses;
  const rows = await tx.select({ id: w.id, code: w.code, name: w.name, address: w.address, isDefault: w.isDefault, status: w.status }).from(w).where(and(eq(w.vendorId, vendorId), isNull(w.deletedAt))).orderBy(asc(w.priority), asc(w.name));
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, city: typeof (r.address as Record<string, unknown>).city === 'string' ? ((r.address as Record<string, unknown>).city as string) : null, isDefault: r.isDefault, status: r.status }));
}

/** A default warehouse must exist, belong to the business and be usable. */
export async function assertWarehouse(tx: Tx, vendorId: string, id: string): Promise<void> {
  const w = schema.warehouses;
  const [row] = await tx.select({ status: w.status }).from(w).where(and(eq(w.vendorId, vendorId), eq(w.id, id), isNull(w.deletedAt)));
  if (!row) throw invalid('That warehouse does not exist', 'warehouse_not_found', 'operations.defaultWarehouseId');
  if (row.status !== 'active') throw invalid('Choose an active warehouse', 'warehouse_inactive', 'operations.defaultWarehouseId');
}

/** Everything the Settings screen shows, in one read. */
export async function settingsOverview(tx: Tx, vendorId: string) {
  const v: VendorRow = await getVendor(tx, vendorId);
  const s = resolveSettings(v.settings);
  const [gstins, warehouses, ai] = await Promise.all([
    listGstins(tx, vendorId),
    warehouseChoices(tx, vendorId),
    tx.select({ enabled: schema.aiSettings.enabled, mode: schema.aiSettings.mode }).from(schema.aiSettings).where(eq(schema.aiSettings.vendorId, vendorId)),
  ]);
  const address = v.address as Record<string, string | undefined>;
  const tz = timezoneLabel(v.timezone);
  const currency = v.currency.trim();
  const defaultWh = warehouses.find((w) => w.id === s.operations.defaultWarehouseId && w.status === 'active') ?? warehouses.find((w) => w.isDefault) ?? null;
  return {
    business: {
      legalName: v.legalName, displayName: v.displayName, cin: v.cin, pan: v.pan, gstin: v.gstin,
      supportEmail: v.businessEmail, supportPhone: v.phone, address,
      registeredCity: [address.city, address.state].filter(Boolean).join(', ') || v.operatingLocation, operatingLocation: v.operatingLocation, businessType: v.businessType as (typeof schema.BUSINESS_TYPES)[number] | null,
    },
    regional: { currency, currencyLabel: CURRENCY_LABEL[currency] ?? currency, timezone: v.timezone, timezoneLabel: tz.label, utcOffset: tz.utcOffset, numberFormat: s.numberFormat, locked: ['currency', 'timezone'] },
    gstins: gstins.map(toGstinDto),
    operations: { ...s.operations, lowStockThreshold: s.lowStockThreshold, effectiveWarehouseId: defaultWh?.id ?? null },
    alerts: s.alerts,
    alertMatrix: alertMatrix(s.alerts),
    ai: { enabled: ai[0]?.enabled ?? true, mode: ai[0]?.mode ?? 'recommend', manageUrl: '/api/v1/ai/settings' },
    warehouses,
    version: v.version,
    updatedAt: v.updatedAt.toISOString(),
  };
}

/** Applies a partial settings document (recursive merge, one version bump) after validating the references inside it. */
export async function applySettingsPatch(tx: Tx, vendorId: string, patch: Record<string, unknown>, version?: number) {
  const before = await getVendor(tx, vendorId);
  if (version !== undefined && version !== before.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: before.version } });
  const wh = (patch.operations as { defaultWarehouseId?: string | null } | undefined)?.defaultWarehouseId;
  if (wh) await assertWarehouse(tx, vendorId, wh);
  return updateSettings(tx, vendorId, patch);
}
