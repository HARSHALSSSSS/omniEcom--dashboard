import { effectiveFlags, sql, type Tx } from '@oms/database';
import { ACTIVE_ISSUE, dayIn, n, rows, vendorFacts } from './util';

export type Can = (permission: string) => boolean;

const ROLE_LABELS: Record<string, string> = { vendor_admin: 'Business owner', vendor_staff: 'Team member', vendor_viewer: 'Viewer' };
export const tierOf = (teamSize: string | null): 'starter' | 'growing' | 'scale' =>
  teamSize === null || teamSize === 'just_me' || teamSize === '2_5' ? 'starter' : teamSize === '6_20' ? 'growing' : 'scale';
const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

/** orders still before dispatch that have a problem: flagged by the system, or inside the "at risk" window of the dispatch deadline */
const PRE_DISPATCH = sql`('new','confirmed','picking','packed','ready_to_dispatch')`;
/** returns that wait for somebody to act: approve (requested), inspect (received / inspecting) */
const RETURN_OPEN = sql`('requested','received','inspecting')`;

/** Sidebar badges: four cheap aggregates (each a single indexed COUNT), a badge the caller may not see is 0. */
export async function badges(tx: Tx, vendorId: string, userId: string | null, atRiskMinutes: number, can: Can) {
  const [issues, orders, returns, notes] = await Promise.all([
    can('issues:read') ? rows(tx, sql`select count(*)::int c from issues where vendor_id = ${vendorId} and status in ${ACTIVE_ISSUE}`) : Promise.resolve([]),
    can('orders:read') ? rows(tx, sql`select count(*)::int c from orders where vendor_id = ${vendorId} and status in ${PRE_DISPATCH}
        and (attention_reason is not null or (dispatch_due_at is not null and dispatch_due_at <= now() + make_interval(mins => ${atRiskMinutes})))`) : Promise.resolve([]),
    can('returns:read') ? rows(tx, sql`select count(*)::int c from return_orders where vendor_id = ${vendorId} and status in ${RETURN_OPEN}`) : Promise.resolve([]),
    userId && can('notifications:read') ? rows(tx, sql`select count(*)::int c from notifications where vendor_id = ${vendorId} and user_id = ${userId}::uuid and read_at is null`) : Promise.resolve([]),
  ]);
  return { needsAttention: n(issues[0]?.c), orders: n(orders[0]?.c), returns: n(returns[0]?.c), notifications: n(notes[0]?.c) };
}

export async function shellData(tx: Tx, p: { vendorId: string; actorType: string; actorId: string; roles: string[] }, can: Can) {
  const facts = await vendorFacts(tx, p.vendorId);
  let name = 'API key';
  let email: string | null = null;
  if (p.actorType === 'user') {
    const [u] = await rows(tx, sql`select full_name, email from users where id = ${p.actorId}::uuid and vendor_id = ${p.vendorId}`);
    name = String(u?.full_name ?? 'User');
    email = u?.email ? String(u.email) : null;
  }
  const role = p.roles.find((r) => ROLE_LABELS[r]);
  const severityRows = p.actorType === 'user' && can('notifications:read')
    ? await rows(tx, sql`select severity, count(*)::int c from notifications where vendor_id = ${p.vendorId} and user_id = ${p.actorId}::uuid and read_at is null group by severity`) : [];
  const unreadBySeverity = Object.fromEntries(severityRows.map((x) => [String(x.severity), n(x.c)]));
  return {
    user: { id: p.actorId, name, initials: initialsOf(name), roleLabel: role ? ROLE_LABELS[role]! : p.actorType === 'user' ? 'Team member' : 'Integration', email, role: role ?? null },
    business: { id: facts.id, name: facts.name, plan: facts.plan, tier: tierOf(facts.teamSize), timezone: facts.timezone, currency: facts.currency, numberFormat: facts.numberFormat },
    businesses: [{ id: facts.id, name: facts.name, current: true }],
    unreadBySeverity,
    badges: await badges(tx, p.vendorId, p.actorType === 'user' ? p.actorId : null, facts.atRiskMinutes, can),
    features: await effectiveFlags(tx, p.vendorId),
    asOf: dayIn(facts.timezone),
    inventoryMode: facts.inventoryMode,
  };
}

/** today one user belongs to exactly one business; the shape is ready for memberships */
export async function myBusinesses(tx: Tx, vendorId: string, roles: string[]) {
  const f = await vendorFacts(tx, vendorId);
  const role = roles.find((r) => ROLE_LABELS[r]);
  return [{ id: f.id, name: f.name, plan: f.plan, tier: tierOf(f.teamSize), roleLabel: role ? ROLE_LABELS[role]! : 'Team member', current: true }];
}
