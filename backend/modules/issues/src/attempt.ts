import { and, eq, schema, type Tx } from '@oms/database';
import { enqueueSyncJob } from '@oms/mod-sync';
import type { Container } from '@oms/module-kit';
import { CHANNEL_NAMES } from './detectors';
import type { IssueRow } from './service';

/**
 * "Resolve by action": the safe automatic fix for an issue. Only conditions that a retry can really fix are attemptable
 * (a failing channel sync -> run the syncs again). Everything else (stock, listings, returns ...) needs a person: not attemptable.
 */
export const ATTEMPTABLE = new Set(['channel_sync_failing']);

export interface Precheck { ok: boolean; channel: string; accountId: string | null; reason?: string }

export async function precheck(tx: Tx, vendorId: string, i: IssueRow): Promise<Precheck> {
  const accountId = i.scopeHash || null;
  const [a] = accountId ? await tx.select().from(schema.marketplaceAccounts).where(and(eq(schema.marketplaceAccounts.id, accountId), eq(schema.marketplaceAccounts.vendorId, vendorId))) : [];
  if (!a) return { ok: false, channel: 'The channel', accountId, reason: 'The marketplace account no longer exists' };
  const channel = a.marketplace === 'mock' ? a.displayName : (CHANNEL_NAMES[a.marketplace] ?? a.displayName);
  if (a.status !== 'active') return { ok: false, channel, accountId, reason: `The connection is ${a.status}` };
  if (['error', 'disconnected'].includes(a.connectionStatus)) return { ok: false, channel, accountId, reason: `The connection is ${a.connectionStatus}${a.lastFailureMessage ? `: ${a.lastFailureMessage}` : ''}` };
  const [bad] = await tx.select({ s: schema.marketplaceAuthorizations.status }).from(schema.marketplaceAuthorizations)
    .where(and(eq(schema.marketplaceAuthorizations.vendorId, vendorId), eq(schema.marketplaceAuthorizations.marketplaceAccountId, a.id)));
  if (bad && ['expired', 'error', 'revoked'].includes(bad.s)) return { ok: false, channel, accountId, reason: `The authorization is ${bad.s}; reconnect the account` };
  return { ok: true, channel, accountId };
}

/** enqueue the order and inventory syncs of the account (own short transactions; call OUTSIDE a request transaction) */
export async function runAttempt(c: Container, vendorId: string, issueId: string, accountId: string, requestedBy: string | null): Promise<string[]> {
  const stamp = Date.now();
  const ids: string[] = [];
  for (const type of ['orders', 'inventory'] as const) {
    const { job } = await enqueueSyncJob(c, { vendorId, accountId, type, trigger: 'manual', coalesce: true, idempotencyKey: `issue-${issueId}-${type}-${stamp}`, requestedBy });
    ids.push(job.id);
  }
  return ids;
}

export const failureBanner = (channel: string) => ({
  title: `${channel} issue couldn't be resolved`,
  body: "Synchronization hasn't succeeded. The issue is still Open. Check the connection, retry sync, then mark it resolved.",
});
