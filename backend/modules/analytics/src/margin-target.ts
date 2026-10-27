import { and, eq, schema, type Tx } from '@oms/database';

/** the margin a policy asks for: its floor, or for a custom policy the margin it prices for; null = it sets no margin target */
export function policyTargetBps(p: { targetMarginMinBps: number; params: Record<string, unknown> }): number | null {
  if (p.targetMarginMinBps > 0) return p.targetMarginMinBps;
  const t = p.params.targetMarginBps;
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : null;
}

/** the strictest margin target of the active pricing policies (the same rule the margin view of Pricing uses); null when no active policy sets one */
export async function marginTargetBps(tx: Tx, vendorId: string): Promise<number | null> {
  const POL = schema.pricingPolicies;
  const policies = await tx.select({ targetMarginMinBps: POL.targetMarginMinBps, params: POL.params }).from(POL).where(and(eq(POL.vendorId, vendorId), eq(POL.status, 'active')));
  const targets = policies.map((p) => policyTargetBps(p)).filter((t): t is number => t !== null);
  return targets.length ? Math.max(...targets) : null;
}
