import { sql, type Tx } from '@oms/database';
import { Errors } from '@oms/shared';
import { inList, iso, marketplaceName, rows } from './util';
import type { Can } from './shell';

export interface ChannelProblem { code: string; title: string; explanation: string; action: { label: string; href: string } }
export interface AccountState {
  id: string; marketplace: string; name: string; displayName: string; mode: string; status: string; connectionStatus: string; connection: 'connected' | 'needs_attention' | 'not_connected';
  lastSyncAt: string | null; syncMode: 'automatic' | 'manual'; problems: ChannelProblem[];
}

const FAILED = new Set(['failed', 'dead_lettered', 'partially_failed']);
const TYPE_LABEL: Record<string, string> = { orders: 'Order', inventory: 'Inventory', prices: 'Price', listings: 'Listing', listing_publish: 'Listing publish', listing_status: 'Listing status', catalog_import: 'Catalog import', order_status: 'Order status', returns: 'Returns', tracking: 'Tracking', full: 'Full' };

/**
 * What is wrong with each connected account, derived from three sources with three queries (no per-account loop):
 *  1. the account itself (authorization / connection state, last failure message),
 *  2. the newest sync job of every type in the last 7 days (a failed newest job = an open problem; a later success clears it),
 *  3. open rows of the `issues` table scoped to the account (scope_hash or details.accountId = account id).
 */
export async function accountStates(tx: Tx, vendorId: string, only?: string): Promise<AccountState[]> {
  const accounts = await rows(tx, sql`select id, marketplace, display_name, mode, status, connection_status, config, last_synced_at, last_success_at, last_failure_at, last_failure_message
    from marketplace_accounts where vendor_id = ${vendorId} and status <> 'revoked' ${only ? sql`and id = ${only}::uuid` : sql``} order by marketplace, created_at, id`);
  if (accounts.length === 0) return [];
  const ids = accounts.map((a) => String(a.id));
  const jobs = await rows(tx, sql`select distinct on (marketplace_account_id, type) marketplace_account_id acc, id, type, status, error, finished_at, created_at
    from sync_jobs where vendor_id = ${vendorId} and marketplace_account_id in (${inList(ids)}) and created_at >= now() - interval '7 days'
    order by marketplace_account_id, type, created_at desc`);
  const issueRows = await rows(tx, sql`select id, key, scope_hash, details, title, explanation, recommended_action from issues
    where vendor_id = ${vendorId} and status in ('open','in_progress') and (scope_hash in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) or details->>'accountId' in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}))
    order by first_seen_at, id limit 500`);

  return accounts.map((a): AccountState => {
    const id = String(a.id);
    const problems: ChannelProblem[] = [];
    const status = String(a.status);
    const cs = String(a.connection_status);
    const connection = status === 'pending_authorization' ? 'not_connected' : status === 'active' && cs !== 'error' && cs !== 'disconnected' ? 'connected' : 'needs_attention';
    if (status === 'pending_authorization') problems.push({ code: 'not_authorized', title: 'Connection not authorized', explanation: 'The marketplace account has not been authorized yet.', action: { label: 'Manage connection', href: `/channels/${id}` } });
    else if (connection === 'needs_attention' || cs === 'degraded') {
      problems.push({
        code: `connection_${status !== 'active' ? status : cs}`, title: cs === 'degraded' && status === 'active' ? 'Connection is degraded' : 'Connection needs attention',
        explanation: a.last_failure_message ? String(a.last_failure_message) : 'The marketplace is not accepting requests from this connection.', action: { label: 'Manage connection', href: `/channels/${id}` },
      });
    }
    const failed = jobs.filter((j) => j.acc === a.id && FAILED.has(String(j.status)));
    for (const j of failed) {
      const type = String(j.type);
      const err = (j.error ?? null) as { code?: string; message?: string } | null;
      problems.push({
        code: `sync_${type}_failed`, title: `${TYPE_LABEL[type] ?? type} sync failed`,
        explanation: err?.message ?? (a.last_failure_message ? String(a.last_failure_message) : 'The last attempt did not finish. Check the sync log and retry.'), action: { label: 'View sync log', href: `/sync/jobs/${String(j.id)}` },
      });
    }
    // a recorded failure newer than the last success that no job above explains (e.g. a webhook or a purged job)
    const failAt = a.last_failure_at ? new Date(String(a.last_failure_at)).getTime() : 0;
    const okAt = a.last_success_at ? new Date(String(a.last_success_at)).getTime() : 0;
    if (failed.length === 0 && !problems.some((p) => p.code.startsWith('connection_')) && failAt > okAt && a.last_failure_message) {
      problems.push({ code: 'last_sync_failed', title: 'Latest sync failed', explanation: String(a.last_failure_message), action: { label: 'Retry sync', href: `/channels/${id}` } });
    }
    for (const i of issueRows.filter((x) => x.scope_hash === id || (x.details as Record<string, unknown> | null)?.accountId === id)) {
      const act = (i.recommended_action ?? {}) as { label?: string; href?: string };
      // a sync-failure issue of the detector describes what the live job rows above already show
      if (i.key === 'channel_sync_failing' && failed.length > 0) continue;
      problems.push({ code: String(i.key), title: String(i.title), explanation: String(i.explanation ?? ''), action: { label: act.label ?? 'Review', href: act.href ?? '/needs-attention' } });
    }
    const config = (a.config ?? {}) as { syncMode?: string };
    return {
      id, marketplace: String(a.marketplace), name: marketplaceName(String(a.marketplace)), displayName: String(a.display_name), mode: String(a.mode), status, connectionStatus: cs, connection,
      lastSyncAt: iso(a.last_synced_at), syncMode: config.syncMode === 'manual' ? 'manual' : 'automatic', problems,
    };
  });
}

export async function channelOverview(tx: Tx, vendorId: string, accountId: string, can: Can) {
  const [a] = await accountStates(tx, vendorId, accountId);
  if (!a) throw Errors.notFound('Marketplace account', accountId);
  const canSync = can('listings:write');
  const retryOk = canSync && a.status === 'active';
  return {
    channel: { code: a.marketplace, name: a.name, accountId: a.id, availability: 'live' as const },
    displayName: a.displayName, mode: a.mode, connection: a.connection, health: a.problems.length > 0 || a.connection !== 'connected' ? ('attention' as const) : ('healthy' as const),
    lastSyncAt: a.lastSyncAt, syncMode: a.syncMode, openIssueCount: a.problems.length, openIssues: a.problems,
    actions: [
      { key: 'retry_sync' as const, label: 'Retry sync', method: 'POST' as const, href: `/api/v1/marketplace-accounts/${a.id}/inventory-sync`, enabled: retryOk, disabledReason: retryOk ? null : !canSync ? 'Your role cannot start a sync' : 'The connection is not active' },
      { key: 'manage' as const, label: 'Manage connection', method: 'GET' as const, href: `/api/v1/marketplace-accounts/${a.id}`, enabled: true, disabledReason: null },
    ],
  };
}
