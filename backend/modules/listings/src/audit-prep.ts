import { and, asc, eq, schema, type Tx } from '@oms/database';

/**
 * Facts the Publishing preparation review shows per channel besides the readiness counts: the pricing rule that applies to the channel,
 * how the channel is kept in sync, and what is locked while a listing is being published. All three are read from real configuration.
 */

const POL = schema.pricingPolicies;

// ------------------------------------------------------------------------------------------------
// pricing rule: the active pricing policy that applies to the channel
// ------------------------------------------------------------------------------------------------
export type PricingStrategy = (typeof schema.PRICING_STRATEGIES)[number];
export const STRATEGY_LABEL: Record<PricingStrategy, string> = { automated_match: 'Competitor match', margin_floor: 'Margin floor', velocity_boost: 'Velocity boost', custom: 'Custom' };

export interface PolicyFacts { id: string; name: string; accountId: string | null; strategy: PricingStrategy; targetMarginMinBps: number; maxDiscountBps: number; autoApproveUnderBps: number }
export interface PricingRule {
  policyId: string; name: string; strategy: PricingStrategy; strategyLabel: string;
  /** account = written for one of the channel's accounts, all_channels = applies to every connected account */
  scope: 'account' | 'all_channels';
  /** one line: "Competitor match · margin never under 15%" */
  summary: string;
}

const pct = (bps: number): string => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

/** same precedence as proposal generation: a policy of one of the channel's accounts before a policy for all accounts, oldest first */
export function pricingRuleOf(policies: PolicyFacts[], accountIds: string[]): PricingRule | null {
  const own = policies.find((p) => p.accountId !== null && accountIds.includes(p.accountId));
  const p = own ?? policies.find((p) => p.accountId === null);
  if (!p) return null;
  const parts = [STRATEGY_LABEL[p.strategy]];
  if (p.targetMarginMinBps > 0) parts.push(`margin never under ${pct(p.targetMarginMinBps)}`);
  if (p.maxDiscountBps > 0) parts.push(`discount up to ${pct(p.maxDiscountBps)}`);
  if (p.autoApproveUnderBps > 0) parts.push(`moves under ${pct(p.autoApproveUnderBps)} apply automatically`);
  return { policyId: p.id, name: p.name, strategy: p.strategy, strategyLabel: STRATEGY_LABEL[p.strategy], scope: own ? 'account' : 'all_channels', summary: parts.join(' · ') };
}

/** active policies, oldest first (the order proposal generation evaluates them in) */
export async function activePolicyFacts(tx: Tx, vendorId: string): Promise<PolicyFacts[]> {
  const rows = await tx.select().from(POL).where(and(eq(POL.vendorId, vendorId), eq(POL.status, 'active'))).orderBy(asc(POL.createdAt), asc(POL.id));
  return rows.map((p) => ({ id: p.id, name: p.name, accountId: p.accountId, strategy: p.strategy as PricingStrategy, targetMarginMinBps: p.targetMarginMinBps, maxDiscountBps: p.maxDiscountBps, autoApproveUnderBps: p.autoApproveUnderBps }));
}

// ------------------------------------------------------------------------------------------------
// sync mode: how the connector keeps the channel up to date
// ------------------------------------------------------------------------------------------------
export interface ConnectorSyncFacts {
  ordersWebhook: boolean; returnsWebhook: boolean; inventoryPush: boolean; pricingPush: boolean; listingUpdate: boolean;
  ordersPollSeconds: number | null; listingStatusPollSeconds: number | null;
}
export interface SyncMode {
  mode: 'real_time' | 'polling' | 'manual';
  /** "Real-time", "Polling every 5 min" or "On demand" */
  label: string;
  /** what travels how, e.g. "Orders arrive by webhook; stock is pushed when it changes; listing status checked every 2 min" */
  detail: string;
}

const every = (seconds: number): string => (seconds < 120 ? `${seconds} s` : seconds % 3600 === 0 ? `${seconds / 3600} h` : `${Math.round(seconds / 60)} min`);

export function syncModeOf(f: ConnectorSyncFacts | null): SyncMode {
  if (!f) return { mode: 'manual', label: 'On demand', detail: 'This connector is not installed: nothing is synchronised automatically' };
  const parts: string[] = [];
  const webhook = f.ordersWebhook || f.returnsWebhook;
  if (webhook) parts.push(`${f.ordersWebhook ? 'Orders' : 'Returns'} arrive by webhook`);
  else if (f.ordersPollSeconds) parts.push(`Orders polled every ${every(f.ordersPollSeconds)}`);
  if (f.inventoryPush) parts.push('stock is pushed when it changes');
  if (f.pricingPush) parts.push('price changes are pushed');
  if (f.listingStatusPollSeconds) parts.push(`listing status checked every ${every(f.listingStatusPollSeconds)}`);
  const detail = parts.length ? parts.join('; ').replace(/^./, (c) => c.toUpperCase()) : 'Nothing is synchronised automatically: start a sync by hand';
  if (webhook) return { mode: 'real_time', label: 'Real-time', detail };
  const interval = [f.ordersPollSeconds, f.listingStatusPollSeconds].filter((x): x is number => Boolean(x));
  if (interval.length) return { mode: 'polling', label: `Polling every ${every(Math.min(...interval))}`, detail };
  return f.inventoryPush ? { mode: 'real_time', label: 'Real-time', detail } : { mode: 'manual', label: 'On demand', detail };
}

// ------------------------------------------------------------------------------------------------
// what is locked during publishing
// ------------------------------------------------------------------------------------------------
/**
 * The approval is bound to a hash of the exact content: price, MRP, currency, title, description, brand, barcode, category, attributes and images
 * (see `contentHash`). The publish job refuses a listing whose hash changed after the approval, so these are locked between approval and submission.
 * The quantity is deliberately NOT part of it: stock keeps syncing on its own so it never goes stale.
 */
export const PUBLISH_LOCK = {
  locked: ['price', 'MRP', 'title', 'description', 'images', 'category', 'attributes'],
  notLocked: ['stock'],
  statement: 'The price, MRP and content you approve are locked to this approval: if any of them changes before a listing is submitted, that listing is not sent and must be approved again. Stock is not locked and keeps syncing.',
} as const;
