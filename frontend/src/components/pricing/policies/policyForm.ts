import { z } from "zod";
import { PRICING_STRATEGIES, type PolicyParams, type PolicyWrite, type PricingPolicy } from "@/types/pricing";
import { parsePercentToBps, percentText } from "../pricingFormat";

const percent = (max: number, label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (parsePercentToBps(v) !== null && (parsePercentToBps(v) as number) <= max * 100), `${label} must be a percentage up to ${max}% with at most 2 decimals`);
const whole = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{1,7}$/.test(v) && Number(v) >= min && Number(v) <= max), `${label} must be a whole number from ${min} to ${max}`);

export const policySchema = z
  .object({
    name: z.string().trim().min(1, "Give the policy a name").max(120, "At most 120 characters"),
    accountId: z.string(),
    strategy: z.enum(PRICING_STRATEGIES),
    status: z.enum(["active", "paused"]),
    targetMarginMin: percent(100, "The margin floor"),
    maxDiscount: percent(100, "The maximum discount"),
    autoApproveUnder: percent(100, "The auto-apply limit"),
    undercut: percent(50, "The undercut"),
    allowIncrease: z.boolean(),
    slowUnits: whole(1, 10_000, "Slow-seller units"),
    minStock: whole(0, 1_000_000, "Minimum stock"),
    step: percent(50, "The price cut"),
    targetMargin: percent(100, "The target margin"),
    expiresInDays: whole(1, 60, "Days open"),
  })
  .superRefine((v, ctx) => {
    if (v.strategy === "margin_floor" && !((parsePercentToBps(v.targetMarginMin) ?? 0) > 0)) {
      ctx.addIssue({ code: "custom", path: ["targetMarginMin"], message: "A margin floor policy needs a minimum margin above 0%" });
    }
    if (v.strategy === "custom" && v.targetMargin === "") {
      ctx.addIssue({ code: "custom", path: ["targetMargin"], message: "Enter the margin the price should earn" });
    }
    if (v.step !== "" && bps(v.step) === 0) ctx.addIssue({ code: "custom", path: ["step"], message: "The price cut must be above 0%" });
  });

export type PolicyFormValues = z.infer<typeof policySchema>;

export const EMPTY_POLICY: PolicyFormValues = {
  name: "",
  accountId: "",
  strategy: "automated_match",
  status: "active",
  targetMarginMin: "0",
  maxDiscount: "0",
  autoApproveUnder: "0",
  undercut: "",
  allowIncrease: true,
  slowUnits: "",
  minStock: "",
  step: "",
  targetMargin: "",
  expiresInDays: "",
};

export function toFormValues(p: PricingPolicy): PolicyFormValues {
  const params = p.params as PolicyParams;
  return {
    name: p.name,
    accountId: p.accountId ?? "",
    strategy: p.strategy,
    status: p.status,
    targetMarginMin: percentText(p.targetMarginMinBps) || "0",
    maxDiscount: percentText(p.maxDiscountBps) || "0",
    autoApproveUnder: percentText(p.autoApproveUnderBps) || "0",
    undercut: params.undercutBps === undefined ? "" : percentText(params.undercutBps) || "0",
    allowIncrease: params.allowIncrease ?? true,
    slowUnits: params.slowUnits === undefined ? "" : String(params.slowUnits),
    minStock: params.minStock === undefined ? "" : String(params.minStock),
    step: params.stepBps === undefined ? "" : percentText(params.stepBps),
    targetMargin: params.targetMarginBps === undefined ? "" : percentText(params.targetMarginBps) || "0",
    expiresInDays: params.expiresInDays === undefined ? "" : String(params.expiresInDays),
  };
}

const bps = (text: string): number => parsePercentToBps(text) ?? 0;

/** only the knobs the chosen strategy understands go out (the API refuses unknown ones) */
export function toWrite(v: PolicyFormValues): PolicyWrite {
  const params: PolicyParams = {};
  if (v.strategy === "automated_match") {
    if (v.undercut !== "") params.undercutBps = bps(v.undercut);
    params.allowIncrease = v.allowIncrease;
  }
  if (v.strategy === "velocity_boost") {
    if (v.slowUnits !== "") params.slowUnits = Number(v.slowUnits);
    if (v.minStock !== "") params.minStock = Number(v.minStock);
    if (v.step !== "") params.stepBps = bps(v.step);
  }
  if (v.strategy === "custom") params.targetMarginBps = bps(v.targetMargin);
  if (v.expiresInDays !== "") params.expiresInDays = Number(v.expiresInDays);
  return {
    name: v.name.trim(),
    accountId: v.accountId || null,
    strategy: v.strategy,
    targetMarginMinBps: bps(v.targetMarginMin),
    maxDiscountBps: bps(v.maxDiscount),
    autoApproveUnderBps: bps(v.autoApproveUnder),
    params,
    status: v.status,
  };
}

/** server field paths (`targetMarginMinBps`, `params.stepBps`...) to the form's fields */
export const SERVER_FIELD: Record<string, keyof PolicyFormValues> = {
  name: "name",
  accountId: "accountId",
  strategy: "strategy",
  status: "status",
  targetMarginMinBps: "targetMarginMin",
  maxDiscountBps: "maxDiscount",
  autoApproveUnderBps: "autoApproveUnder",
  "params.undercutBps": "undercut",
  "params.allowIncrease": "allowIncrease",
  "params.slowUnits": "slowUnits",
  "params.minStock": "minStock",
  "params.stepBps": "step",
  "params.targetMarginBps": "targetMargin",
  "params.expiresInDays": "expiresInDays",
};

/** business rules that name no field (`margin_floor_needs_target`...) land on the field they are about */
export const RULE_FIELD: Record<string, keyof PolicyFormValues> = {
  margin_floor_needs_target: "targetMarginMin",
  custom_needs_target_margin: "targetMargin",
};
