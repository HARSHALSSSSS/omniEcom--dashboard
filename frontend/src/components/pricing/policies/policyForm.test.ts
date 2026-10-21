import { describe, expect, it } from "vitest";
import type { PricingPolicy } from "@/types/pricing";
import { EMPTY_POLICY, policySchema, toFormValues, toWrite } from "./policyForm";

const policy = (over: Partial<PricingPolicy> = {}): PricingPolicy => ({
  id: "pol1",
  name: "Defend Amazon",
  accountId: "a1",
  channel: "Amazon India",
  strategy: "automated_match",
  targetMarginMinBps: 2200,
  maxDiscountBps: 1200,
  autoApproveUnderBps: 300,
  params: { undercutBps: 100, allowIncrease: false },
  status: "active",
  affectedVariants: 12,
  version: 3,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

describe("policy form", () => {
  it("round-trips a policy through the form without float drift", () => {
    const values = toFormValues(policy());
    expect(values).toMatchObject({ targetMarginMin: "22", maxDiscount: "12", autoApproveUnder: "3", undercut: "1", allowIncrease: false, accountId: "a1" });
    expect(toWrite(values)).toEqual({
      name: "Defend Amazon",
      accountId: "a1",
      strategy: "automated_match",
      targetMarginMinBps: 2200,
      maxDiscountBps: 1200,
      autoApproveUnderBps: 300,
      params: { undercutBps: 100, allowIncrease: false },
      status: "active",
    });
  });

  it("sends only the knobs of the chosen strategy and null for all channels", () => {
    const body = toWrite({ ...EMPTY_POLICY, name: "Slow movers", strategy: "velocity_boost", slowUnits: "8", minStock: "20", step: "7.5", undercut: "4", targetMargin: "30", expiresInDays: "14" });
    expect(body.accountId).toBeNull();
    expect(body.params).toEqual({ slowUnits: 8, minStock: 20, stepBps: 750, expiresInDays: 14 });
  });

  it("asks for what a strategy needs", () => {
    const floor = policySchema.safeParse({ ...EMPTY_POLICY, name: "Floor", strategy: "margin_floor" });
    expect(floor.success).toBe(false);
    expect(floor.error?.issues[0]?.path).toEqual(["targetMarginMin"]);
    const custom = policySchema.safeParse({ ...EMPTY_POLICY, name: "Custom", strategy: "custom" });
    expect(custom.error?.issues[0]?.path).toEqual(["targetMargin"]);
    expect(policySchema.safeParse({ ...EMPTY_POLICY, name: "Floor", strategy: "margin_floor", targetMarginMin: "20" }).success).toBe(true);
  });

  it("rejects amounts the API would refuse", () => {
    const bad = (patch: object) => policySchema.safeParse({ ...EMPTY_POLICY, name: "x", ...patch }).success;
    expect(bad({ name: "  " })).toBe(false);
    expect(bad({ maxDiscount: "101" })).toBe(false);
    expect(bad({ maxDiscount: "1.234" })).toBe(false);
    expect(bad({ undercut: "60" })).toBe(false);
    expect(bad({ expiresInDays: "61" })).toBe(false);
    expect(bad({ slowUnits: "0" })).toBe(false);
    expect(bad({ strategy: "velocity_boost", step: "0" })).toBe(false);
    expect(bad({ strategy: "velocity_boost", step: "5", slowUnits: "5", minStock: "0" })).toBe(true);
  });
});
