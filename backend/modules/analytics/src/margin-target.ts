import { and, eq, schema, type Tx } from '@oms/database';
import { resolveSettings } from '@oms/mod-vendors';

/** the margin a policy asks for: its floor, or for a custom policy the margin it prices for; null = it sets no margin target */
export function policyTargetBps(p: { targetMarginMinBps: number; params: Record<string, unknown> }): number | null {
  if (p.targetMarginMinBps > 0) return p.targetMarginMinBps;
  const t = p.params.targetMarginBps;
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : null;
}

/** the workspace gross margin floor saved in Settings > Pricing & Margins (bps); null = none set */
export async function workspaceMarginFloorBps(tx: Tx, vendorId: string): Promise<number | null> {
  const [v] = await tx.select({ settings: schema.vendors.settings }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const floor = resolveSettings(v?.settings).pricing.marginFloorBps;
  return floor !== null && floor > 0 ? floor : null;
}

/**
 * The margin target of the workspace. Precedence: the strictest active pricing policy target, else the workspace margin floor from
 * Settings, else null (no target). The same rule the margin view of Pricing uses.
 */
export async function marginTargetBps(tx: Tx, vendorId: string): Promise<number | null> {
  const POL = schema.pricingPolicies;
  const policies = await tx.select({ targetMarginMinBps: POL.targetMarginMinBps, params: POL.params }).from(POL).where(and(eq(POL.vendorId, vendorId), eq(POL.status, 'active')));
  const targets = policies.map((p) => policyTargetBps(p)).filter((t): t is number => t !== null);
  return targets.length ? Math.max(...targets) : workspaceMarginFloorBps(tx, vendorId);
}
