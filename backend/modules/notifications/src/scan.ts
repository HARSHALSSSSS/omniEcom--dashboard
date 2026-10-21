import { and, eq, inArray, isNotNull, lt, schema, sql, withSystem } from '@oms/database';
import type { Container } from '@oms/module-kit';
import { alertEnabled, resolveSettings } from '@oms/mod-vendors';
import { SCAN_SPECS } from './catalog';
import { notifyVendor } from './service';

export const JOB_SCAN_ALERTS = 'notifications.scan-alerts';

/** orders still before dispatch (the SLA clock is running) */
const PRE_DISPATCH = ['new', 'confirmed', 'picking', 'packed', 'ready_to_dispatch'];
/** a token that expires within this window AND failed its last renewal is worth a warning */
const TOKEN_WINDOW_MS = 24 * 3_600_000;
const VENDOR_BATCH = 500;

export interface ScanResult { vendors: number; slaNotified: number; tokenNotified: number }

/**
 * Alerts that no domain event announces, found by looking at the data:
 *  - `dispatchSlaBreach`: orders that must be dispatched within the vendor's threshold (default 45 minutes) or are already late;
 *  - `tokenRenewals`: authorisations that expire within 24 hours and whose last renewal failed.
 * Each family honours its switch in Settings > Alerts. Both are collapsed by de-duplication (one unread notification per vendor / account).
 */
export async function scanAlerts(c: Container, now = new Date()): Promise<ScanResult> {
  const vendors = await withSystem(c.database.db, (tx) =>
    tx.select({ id: schema.vendors.id, settings: schema.vendors.settings }).from(schema.vendors).where(eq(schema.vendors.status, 'active')).limit(VENDOR_BATCH),
  );
  const result: ScanResult = { vendors: vendors.length, slaNotified: 0, tokenNotified: 0 };
  for (const v of vendors) {
    try {
      const settings = resolveSettings(v.settings);
      if (alertEnabled(settings, 'dispatchSlaBreach')) result.slaNotified += await scanSla(c, v.id, settings.alerts.dispatchSlaBreach.thresholdMinutes, now);
      if (alertEnabled(settings, 'tokenRenewals')) result.tokenNotified += await scanTokens(c, v.id, now);
    } catch (err) {
      c.logger.warn({ vendorId: v.id, err: (err as Error).message }, 'alert scan failed for a vendor'); // one vendor never blocks the others
    }
  }
  return result;
}

async function scanSla(c: Container, vendorId: string, thresholdMinutes: number, now: Date): Promise<number> {
  const O = schema.orders;
  const due = new Date(now.getTime() + thresholdMinutes * 60_000);
  const rows = await withSystem(c.database.db, (tx) =>
    tx.select({ number: O.orderNumber }).from(O).where(and(eq(O.vendorId, vendorId), inArray(O.status, PRE_DISPATCH), isNotNull(O.dispatchDueAt), lt(O.dispatchDueAt, due))).orderBy(O.dispatchDueAt).limit(200),
  );
  if (rows.length === 0) return 0;
  const spec = SCAN_SPECS['order.sla_breach']!;
  const p = { count: rows.length >= 200 ? '200+' : rows.length, thresholdMinutes, sample: rows.slice(0, 3).map((r) => r.number).join(', ') };
  return notifyVendor(c, vendorId, { type: spec.type, severity: spec.severity, title: spec.title(p), body: spec.body?.(p), dedupeKey: `sla-breach:${vendorId}`, actionUrl: spec.action?.('', p) ?? null });
}

async function scanTokens(c: Container, vendorId: string, now: Date): Promise<number> {
  const Z = schema.marketplaceAuthorizations;
  const A = schema.marketplaceAccounts;
  const rows = await withSystem(c.database.db, (tx) =>
    tx
      .select({ accountId: Z.marketplaceAccountId, expiresAt: Z.accessTokenExpiresAt, name: A.displayName })
      .from(Z)
      .innerJoin(A, and(eq(A.id, Z.marketplaceAccountId), eq(A.vendorId, Z.vendorId)))
      .where(and(eq(Z.vendorId, vendorId), inArray(Z.status, ['active', 'expiring']), eq(A.status, 'active'), isNotNull(Z.lastErrorAt), isNotNull(Z.accessTokenExpiresAt), lt(Z.accessTokenExpiresAt, new Date(now.getTime() + TOKEN_WINDOW_MS)), sql`${Z.accessTokenExpiresAt} > ${now}`))
      .limit(100),
  );
  const spec = SCAN_SPECS['marketplace_account.token_expiring']!;
  let n = 0;
  for (const r of rows) {
    const p = { account: r.name, hours: Math.max(1, Math.ceil((r.expiresAt!.getTime() - now.getTime()) / 3_600_000)) };
    n += await notifyVendor(c, vendorId, { type: spec.type, severity: spec.severity, title: spec.title(p), body: spec.body?.(p), dedupeKey: `token-expiring:${r.accountId}`, entityType: 'marketplace_account', entityId: r.accountId, actionUrl: spec.action?.('', p) ?? null });
  }
  return n;
}
