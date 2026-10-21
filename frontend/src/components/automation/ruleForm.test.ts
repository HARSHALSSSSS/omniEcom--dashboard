import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { buildParams, factsFor, formFromRule, parseConditionValue, ruleFormSchema, serverFieldErrors, toRuleWrite, type RuleFormValues } from "./ruleForm";
import { conditionLines, impactText, scheduleText } from "./autoFormat";
import { rulesParams, runsParams } from "@/api/automation.api";
import type { AutomationRule } from "@/types/automation";

const rule = (over: Partial<AutomationRule> = {}): AutomationRule => ({
  id: "r1",
  name: "Cadence",
  description: null,
  triggerEvent: "schedule.cadence",
  conditions: { combinator: "all", conditions: [{ field: "hour", op: "eq", value: 8 }, { field: "weekday", op: "eq", value: 2 }, { field: "marketplace", op: "eq", value: "amazon_in" }] },
  action: { type: "notify", params: { title: "Daily {{date}}", severity: "warning" } },
  mode: "auto",
  status: "draft",
  version: 3,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  triggerType: "scheduled_cadence",
  actionType: "notify_channel_slack",
  requiresExplicitApproval: false,
  runsCount: 0,
  lastRunAt: null,
  channelFilter: "amazon_in",
  schedule: { cadence: "weekly", hour: 8, weekday: 2 },
  ...over,
});

describe("buildParams", () => {
  it("types integers, converts money to minor units and drops blanks", () => {
    const r = buildParams("draft_purchase_order", { quantity: "", targetLevel: "40", supplierId: "", warehouseId: "", unitCostMinor: "12.5", notes: "" });
    expect(r.errors).toEqual({});
    expect(r.params).toEqual({ targetLevel: 40, unitCostMinor: 1250 });
  });

  it("reports the missing quantity, bad ranges and bad money", () => {
    expect(buildParams("draft_purchase_order", {}).errors.quantity).toMatch(/quantity/i);
    expect(buildParams("snooze_listing", { days: "200", reason: "" }).errors.days).toBe("At most 90");
    expect(buildParams("start_fulfillment", { maxOrderValueMinor: "1.234" }).errors.maxOrderValueMinor).toMatch(/two decimals/);
    expect(buildParams("notify", { title: "x", severity: "info" }).errors.title).toBe("At least 2 characters");
  });

  it("takes an unknown action as a JSON object", () => {
    expect(buildParams("future_action", { json: '{"a":1}' }).params).toEqual({ a: 1 });
    expect(buildParams("future_action", { json: "[1]" }).errors.json).toBe("Must be a JSON object");
    expect(buildParams("future_action", { json: "{" }).errors.json).toBe("Not valid JSON");
  });
});

describe("parseConditionValue", () => {
  it("parses by operator and by what the fact is", () => {
    expect(parseConditionValue({ field: "available", op: "lte", value: "5" })).toEqual({ value: 5 });
    expect(parseConditionValue({ field: "marketplace", op: "eq", value: "amazon_in" })).toEqual({ value: "amazon_in" });
    expect(parseConditionValue({ field: "marketplace", op: "in", value: "a, b" })).toEqual({ value: ["a", "b"] });
    expect(parseConditionValue({ field: "totalMinor", op: "between", value: "10, 50" })).toEqual({ value: [10, 50] });
    expect(parseConditionValue({ field: "sku", op: "exists", value: "false" })).toEqual({ value: false });
    expect(parseConditionValue({ field: "available", op: "gt", value: "abc" }).error).toBe("Enter a number");
    expect(parseConditionValue({ field: "x", op: "between", value: "9, 1" }).error).toMatch(/first number/);
    expect(parseConditionValue({ field: "x", op: "eq", value: "" }).error).toBe("Enter a value");
  });
});

describe("rule form conversion", () => {
  it("round-trips a scheduled rule, moving the cadence slots out of the conditions", () => {
    const form = formFromRule(rule());
    expect(form).toMatchObject({ hour: "8", weekday: "2", conditions: [{ field: "marketplace", op: "eq", value: "amazon_in" }], mode: "auto" });
    expect(ruleFormSchema.safeParse(form).success).toBe(true);
    const body = toRuleWrite(form);
    expect(body.conditions.conditions).toEqual([
      { field: "marketplace", op: "eq", value: "amazon_in" },
      { field: "hour", op: "eq", value: 8 },
      { field: "weekday", op: "eq", value: 2 },
    ]);
    expect(body.action).toEqual({ type: "notify", params: { title: "Daily {{date}}", severity: "warning" } });
    expect(body.description).toBeNull();
  });

  it("validates the name, the trigger, the action and its parameters", () => {
    const values: RuleFormValues = { name: "a", description: "", triggerEvent: "", combinator: "all", conditions: [{ field: "1bad", op: "eq", value: "x" }], actionType: "set_reorder_level", params: { level: "" }, mode: "approval", status: "draft", weekday: "", hour: "9" };
    const res = ruleFormSchema.safeParse(values);
    expect(res.success).toBe(false);
    const paths = res.success ? [] : res.error.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["name", "triggerEvent", "conditions.0.field", "params.level"]));
  });

  it("maps server field errors onto the form", () => {
    const e = new ApiError({ code: "VALIDATION_FAILED", message: "bad", status: 400, details: { issues: [{ path: "level", message: "Too big" }, { path: "conditions.conditions.1.value", message: "Bad value" }, { path: "name", message: "Short" }, { path: "elsewhere", message: "?" }] } });
    expect(serverFieldErrors(e, ["level"])).toEqual([
      { field: "params.level", message: "Too big" },
      { field: "conditions.1.value", message: "Bad value" },
      { field: "name", message: "Short" },
    ]);
  });

  it("offers the facts of the trigger", () => {
    expect(factsFor({ triggers: [{ event: "inventory.low_stock", description: "", facts: ["available"] }], actions: [], operators: [] }, "inventory.low_stock")).toEqual(["available", "eventType"]);
  });
});

describe("display helpers and query params", () => {
  it("describes schedules, conditions and money", () => {
    expect(scheduleText(rule())).toBe("Every Tuesday at 08:00");
    expect(conditionLines(rule())).toEqual(['marketplace is "amazon_in"']);
    expect(impactText({ financialImpact: null, currency: "INR", actionType: "notify" })).toBe("Not known");
    expect(impactText({ financialImpact: -5000, currency: "INR", actionType: "adjust_channel_price" })).toBe("-₹50 per unit");
  });

  it("serialises filters with literal bracket keys", () => {
    expect(rulesParams({ status: "active", trigger: "order.created" })).toEqual({ "filter[status]": "active", "filter[trigger]": "order.created" });
    expect(runsParams({ status: "failed", ruleId: "x", page: 3, pageSize: 50 })).toEqual({ pageSize: 50, page: 3, "filter[status]": "failed", "filter[ruleId]": "x" });
    expect(runsParams({ page: 1, pageSize: 25 })).toEqual({ pageSize: 25 });
  });
});
