import { z } from "zod";
import type { ApiError } from "@/api/errors";
import type { AutomationCatalog, AutomationRule, RuleCondition, RuleMode, RuleStatus, RuleWrite } from "@/types/automation";

// ------------------------------------------------------------------------------------------------
// money helpers (no float math on money)
// ------------------------------------------------------------------------------------------------
export function parseMinor(text: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ""));
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0") : null;
}

export function minorToInput(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const frac = String(Math.abs(minor % 100)).padStart(2, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

// ------------------------------------------------------------------------------------------------
// action parameters: what each whitelisted action takes (mirrors the backend schemas)
// ------------------------------------------------------------------------------------------------
export type ParamKind = "text" | "textarea" | "int" | "money" | "select" | "supplier" | "warehouse";

export interface ParamSpec {
  key: string;
  label: string;
  kind: ParamKind;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  minLength?: number;
  options?: ReadonlyArray<{ value: string; label: string }>;
  /** used when the rule is new, so the form starts with the backend default */
  initial?: string;
}

const SEVERITY = [
  { value: "info", label: "Information" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
] as const;

const TEMPLATE_HINT = "You can use {{fact}} placeholders from the trigger, for example {{sku}}.";

export const PARAM_SPECS: Record<string, ParamSpec[]> = {
  notify: [
    { key: "title", label: "Title", kind: "text", required: true, minLength: 2, maxLength: 200, hint: TEMPLATE_HINT },
    { key: "body", label: "Message (optional)", kind: "textarea", maxLength: 500 },
    { key: "severity", label: "Severity", kind: "select", options: SEVERITY, initial: "info", hint: "Critical and warning notices are also sent by e-mail or push." },
  ],
  create_recommendation: [
    { key: "kind", label: "Kind", kind: "text", minLength: 2, maxLength: 40, initial: "automation", hint: "Groups recommendations of the same sort." },
    { key: "title", label: "Title", kind: "text", required: true, minLength: 2, maxLength: 200, hint: TEMPLATE_HINT },
    { key: "summary", label: "Summary (optional)", kind: "textarea", maxLength: 500 },
    { key: "severity", label: "Severity", kind: "select", options: SEVERITY, initial: "info" },
  ],
  retry_sync_job: [{ key: "maxAutomaticRetries", label: "Maximum automatic retries per job", kind: "int", min: 1, max: 5, initial: "3", hint: "After this many retries a person has to look at the job." }],
  start_fulfillment: [{ key: "maxOrderValueMinor", label: "Largest order to start automatically (optional)", kind: "money", hint: "Orders above this value are left for a person." }],
  set_reorder_level: [{ key: "level", label: "New reorder level (units)", kind: "int", required: true, min: 0, max: 1_000_000 }],
  draft_purchase_order: [
    { key: "quantity", label: "Quantity to order", kind: "int", min: 1, max: 1_000_000, hint: "A fixed quantity. Leave blank to order up to a target level instead." },
    { key: "targetLevel", label: "Order up to (units)", kind: "int", min: 1, max: 1_000_000, hint: "Orders what is missing to reach this stock level." },
    { key: "supplierId", label: "Supplier (optional)", kind: "supplier", hint: "Blank uses the preferred supplier of the product." },
    { key: "warehouseId", label: "Deliver to (optional)", kind: "warehouse", hint: "Blank uses the warehouse of the low-stock event." },
    { key: "unitCostMinor", label: "Unit cost (optional)", kind: "money", hint: "Blank uses the supplier price or the product cost." },
    { key: "notes", label: "Notes (optional)", kind: "text", maxLength: 300, hint: TEMPLATE_HINT },
  ],
  adjust_channel_price: [
    { key: "undercutBps", label: "Undercut the competitor by (basis points)", kind: "int", min: 0, max: 5000, initial: "0", hint: "100 basis points = 1%. 0 matches the competitor price." },
    { key: "minPriceMinor", label: "Never propose below (optional)", kind: "money", hint: "The price floor. When the floor keeps the price at or above the current one, nothing is proposed." },
    { key: "expiresInHours", label: "Proposal expires after (hours, optional)", kind: "int", min: 1, max: 720 },
  ],
  snooze_listing: [
    { key: "days", label: "Snooze for (days)", kind: "int", min: 1, max: 90, initial: "7" },
    { key: "reason", label: "Reason (optional)", kind: "text", maxLength: 300, hint: TEMPLATE_HINT },
  ],
};

/** the starting values of an action's parameter form */
export const initialParams = (actionType: string): Record<string, string> => Object.fromEntries((PARAM_SPECS[actionType] ?? []).map((s) => [s.key, s.initial ?? ""]));

const isMinor = (s: ParamSpec) => s.kind === "money";

function parseParam(spec: ParamSpec, raw: string): { value?: unknown; error?: string } {
  const text = raw.trim();
  if (text === "") return spec.required ? { error: "Required" } : {};
  switch (spec.kind) {
    case "int": {
      if (!/^\d{1,9}$/.test(text)) return { error: "Whole numbers only" };
      const n = Number(text);
      if (spec.min !== undefined && n < spec.min) return { error: `At least ${spec.min}` };
      if (spec.max !== undefined && n > spec.max) return { error: `At most ${spec.max}` };
      return { value: n };
    }
    case "money": {
      const minor = parseMinor(text);
      if (minor === null) return { error: "Use an amount with at most two decimals" };
      return { value: minor };
    }
    case "select":
      return spec.options?.some((o) => o.value === text) ? { value: text } : { error: "Choose one" };
    default:
      if (spec.minLength !== undefined && text.length < spec.minLength) return { error: `At least ${spec.minLength} characters` };
      if (spec.maxLength !== undefined && text.length > spec.maxLength) return { error: `At most ${spec.maxLength} characters` };
      return { value: text };
  }
}

/** the typed `params` of an action and the per-field problems (an unknown action takes its parameters as JSON) */
export function buildParams(actionType: string, raw: Record<string, string>): { params: Record<string, unknown>; errors: Record<string, string> } {
  const specs = PARAM_SPECS[actionType];
  const params: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  if (!specs) {
    const text = (raw.json ?? "").trim();
    if (text === "") return { params, errors };
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { params: parsed as Record<string, unknown>, errors };
      errors.json = "Must be a JSON object";
    } catch {
      errors.json = "Not valid JSON";
    }
    return { params, errors };
  }
  for (const spec of specs) {
    const r = parseParam(spec, raw[spec.key] ?? "");
    if (r.error) errors[spec.key] = r.error;
    else if (r.value !== undefined) params[spec.key] = r.value;
  }
  if (actionType === "draft_purchase_order" && params.quantity === undefined && params.targetLevel === undefined && !errors.quantity && !errors.targetLevel) errors.quantity = "Give a quantity or a level to order up to";
  return { params, errors };
}

/** a saved rule's parameters as form text */
export function paramsToForm(actionType: string, params: Record<string, unknown>): Record<string, string> {
  const specs = PARAM_SPECS[actionType];
  if (!specs) return { json: Object.keys(params).length ? JSON.stringify(params, null, 2) : "" };
  const out: Record<string, string> = {};
  for (const s of specs) {
    const v = params[s.key];
    out[s.key] = v === undefined || v === null ? "" : isMinor(s) && typeof v === "number" ? minorToInput(v) : String(v);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// conditions
// ------------------------------------------------------------------------------------------------
/** facts whose type is known; the rest are read by what the operator needs */
const NUMBER_FACTS = new Set(["totalMinor", "quantity", "minutesToDue", "available", "reorderLevel", "ourPriceMinor", "competitorPriceMinor", "gapMinor", "gapBps", "attempts", "attemptNo", "units", "hour", "weekday"]);

export interface ConditionRow {
  field: string;
  op: string;
  value: string;
}

export const EMPTY_CONDITION: ConditionRow = { field: "", op: "eq", value: "" };

export const needsValue = (op: string): boolean => op !== "exists";
const NUMERIC_OPS = new Set(["gt", "gte", "lt", "lte", "between"]);
const LIST_OPS = new Set(["in", "nin"]);

const NUMBER = /^-?\d+(\.\d+)?$/;
const scalar = (text: string, numeric: boolean, field: string): string | number | boolean => {
  if (numeric || NUMBER_FACTS.has(field)) return Number(text);
  if (text === "true") return true;
  if (text === "false") return false;
  return text;
};

/** the typed value of a condition, or the problem with the text */
export function parseConditionValue(row: ConditionRow): { value?: unknown; error?: string } {
  const text = row.value.trim();
  if (row.op === "exists") return { value: text !== "false" };
  if (text === "") return { error: "Enter a value" };
  const numeric = NUMERIC_OPS.has(row.op) || NUMBER_FACTS.has(row.field);
  const parts = text.split(",").map((p) => p.trim()).filter((p) => p !== "");
  if (row.op === "between") {
    if (parts.length !== 2 || !parts.every((p) => NUMBER.test(p))) return { error: "Two numbers separated by a comma, e.g. 10, 50" };
    const [lo, hi] = parts.map(Number) as [number, number];
    return lo <= hi ? { value: [lo, hi] } : { error: "The first number must not be larger than the second" };
  }
  if (LIST_OPS.has(row.op)) {
    if (parts.length === 0) return { error: "Enter one or more values separated by commas" };
    if (numeric && !parts.every((p) => NUMBER.test(p))) return { error: "Numbers only" };
    return { value: parts.map((p) => scalar(p, false, row.field)) };
  }
  if (numeric && !NUMBER.test(text)) return { error: "Enter a number" };
  return { value: scalar(text, numeric, row.field) };
}

function valueToText(c: RuleCondition): string {
  if (c.op === "exists") return c.value === false ? "false" : "true";
  return Array.isArray(c.value) ? c.value.map(String).join(", ") : c.value === undefined || c.value === null ? "" : String(c.value);
}

// ------------------------------------------------------------------------------------------------
// the form
// ------------------------------------------------------------------------------------------------
export interface RuleFormValues {
  name: string;
  description: string;
  triggerEvent: string;
  combinator: "all" | "any";
  conditions: ConditionRow[];
  actionType: string;
  params: Record<string, string>;
  mode: RuleMode;
  status: RuleStatus;
  /** schedule.cadence only: "" = every day, "1".."7" = that weekday (Monday = 1) */
  weekday: string;
  hour: string;
}

export const EMPTY_FORM: RuleFormValues = {
  name: "",
  description: "",
  triggerEvent: "",
  combinator: "all",
  conditions: [],
  actionType: "",
  params: {},
  mode: "approval",
  status: "draft",
  weekday: "",
  hour: "9",
};

const FIELD = /^[A-Za-z][A-Za-z0-9_.]{0,60}$/;

export const ruleFormSchema = z
  .object({
    name: z.string().trim().min(2, "Give the rule a name (at least 2 characters)").max(120, "At most 120 characters"),
    description: z.string().trim().max(500, "At most 500 characters"),
    triggerEvent: z.string().min(1, "Choose what starts the rule"),
    combinator: z.enum(["all", "any"]),
    conditions: z.array(z.object({ field: z.string(), op: z.string(), value: z.string() })).max(20, "At most 20 conditions"),
    actionType: z.string().min(1, "Choose what the rule does"),
    params: z.record(z.string(), z.string()),
    mode: z.enum(["approval", "auto"]),
    status: z.enum(["draft", "active", "disabled"]),
    weekday: z.string(),
    hour: z.string(),
  })
  .superRefine((v, ctx) => {
    v.conditions.forEach((c, i) => {
      if (!FIELD.test(c.field.trim())) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["conditions", i, "field"], message: "Pick a fact or type a field name" });
      if (needsValue(c.op)) {
        const r = parseConditionValue({ ...c, field: c.field.trim() });
        if (r.error) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["conditions", i, "value"], message: r.error });
      }
    });
    if (v.triggerEvent === "schedule.cadence" && !(/^\d{1,2}$/.test(v.hour.trim()) && Number(v.hour) <= 23)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["hour"], message: "Choose an hour from 0 to 23" });
    if (v.actionType) {
      const { errors } = buildParams(v.actionType, v.params);
      for (const [key, message] of Object.entries(errors)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["params", key], message });
    }
  });

/** the body the API takes, from validated form values */
export function toRuleWrite(v: RuleFormValues): RuleWrite {
  const conditions: RuleCondition[] = v.conditions.map((c) => {
    const field = c.field.trim();
    const parsed = parseConditionValue({ ...c, field });
    return { field, op: c.op, ...(parsed.value !== undefined ? { value: parsed.value } : {}) };
  });
  if (v.triggerEvent === "schedule.cadence") {
    conditions.push({ field: "hour", op: "eq", value: Number(v.hour) });
    if (v.weekday) conditions.push({ field: "weekday", op: "eq", value: Number(v.weekday) });
  }
  return {
    name: v.name.trim(),
    description: v.description.trim() || null,
    triggerEvent: v.triggerEvent,
    conditions: { combinator: v.combinator, conditions },
    action: { type: v.actionType, params: buildParams(v.actionType, v.params).params },
    mode: v.mode,
    status: v.status,
  };
}

export function formFromRule(rule: AutomationRule): RuleFormValues {
  const cadence = rule.triggerEvent === "schedule.cadence";
  const slot = (field: string) => rule.conditions.conditions.find((c) => c.field === field && c.op === "eq");
  const rest = rule.conditions.conditions.filter((c) => !(cadence && (c.field === "hour" || c.field === "weekday") && c.op === "eq"));
  return {
    name: rule.name,
    description: rule.description ?? "",
    triggerEvent: rule.triggerEvent,
    combinator: rule.conditions.combinator,
    conditions: rest.map((c) => ({ field: c.field, op: c.op, value: valueToText(c) })),
    actionType: rule.action.type,
    params: paramsToForm(rule.action.type, rule.action.params),
    mode: rule.mode,
    status: rule.status,
    weekday: cadence && slot("weekday") ? String(slot("weekday")?.value) : "",
    hour: cadence && slot("hour") ? String(slot("hour")?.value) : "9",
  };
}

/** actions that fit a trigger (`*` fits every one) */
export const actionsFor = (catalog: AutomationCatalog | undefined, trigger: string) => (catalog?.actions ?? []).filter((a) => a.triggers === "*" || a.triggers.includes(trigger));

/** the facts a trigger offers, plus the ones every event has */
export const factsFor = (catalog: AutomationCatalog | undefined, trigger: string): string[] => [...new Set([...(catalog?.triggers.find((t) => t.event === trigger)?.facts ?? []), "eventType"])];

/** a payload to start a dry run from: one empty-ish value per fact the trigger offers */
export function samplePayload(catalog: AutomationCatalog | undefined, trigger: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of catalog?.triggers.find((t) => t.event === trigger)?.facts ?? []) out[f] = NUMBER_FACTS.has(f) ? 0 : "";
  return out;
}

export type FormFieldPath = `conditions.${number}.${"field" | "op" | "value"}` | `params.${string}` | "name" | "description" | "triggerEvent" | "actionType" | "mode" | "status" | "hour" | "weekday";

/** server paths (`name`, `conditions.conditions.0.field`, `action.params.x` or a bare parameter name) mapped to the form */
export function serverFieldErrors(e: ApiError, paramKeys: string[]): Array<{ field: FormFieldPath; message: string }> {
  const out: Array<{ field: FormFieldPath; message: string }> = [];
  for (const [path, message] of Object.entries(e.fields ?? {})) {
    const cond = /^conditions\.conditions\.(\d+)\.(field|op|value)$/.exec(path);
    if (cond) out.push({ field: `conditions.${Number(cond[1])}.${cond[2] as "field" | "op" | "value"}`, message });
    else if (path === "name" || path === "description") out.push({ field: path, message });
    else if (path === "triggerEvent") out.push({ field: "triggerEvent", message });
    else if (path === "action.type") out.push({ field: "actionType", message });
    else if (path === "mode" || path === "status") out.push({ field: path, message });
    else {
      const key = path.replace(/^action\.params\./, "");
      if (paramKeys.includes(key)) out.push({ field: `params.${key}`, message });
    }
  }
  return out;
}
