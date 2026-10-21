import type { CatalogEntry, ReportParamSpec } from "@/types/reports";

/** form values of a report's parameters: everything is text until it is sent */
export type ParamValues = Record<string, string>;
export type PeriodMode = "range" | "month" | "custom";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const hasSpec = (entry: CatalogEntry, key: string): boolean => entry.params.some((p) => p.key === key);
export const hasPeriod = (entry: CatalogEntry): boolean => hasSpec(entry, "range");

/** the period mode the values are in (a key that is present but still empty counts: the person just switched mode) */
export function modeOf(values: ParamValues): PeriodMode {
  if (values.month !== undefined) return "month";
  if (values.from !== undefined || values.to !== undefined) return "custom";
  return "range";
}

/** text values of the parameters a run or schedule already carries (`suggestedParams`, a schedule being edited) */
export function valuesOf(params: Record<string, unknown> | undefined | null): ParamValues {
  const out: ParamValues = {};
  for (const [k, v] of Object.entries(params ?? {})) if (v !== null && v !== undefined && v !== "") out[k] = String(v);
  return out;
}

/** the specs a form shows: a schedule only takes parameters that are relative to the run time */
export const specsFor = (entry: CatalogEntry, forSchedule: boolean): ReportParamSpec[] => entry.params.filter((s) => !forSchedule || s.relative);

/** `period` keys are handled by the period block, never as plain fields */
export const PERIOD_SPEC_KEYS = ["range", "month", "from", "to"];

export interface BuiltParams {
  params: Record<string, unknown>;
  errors: Record<string, string>;
}

/** validates the values against the catalog's specs and returns the request parameters (empty values are left out) */
export function buildParams(entry: CatalogEntry, values: ParamValues, o: { forSchedule: boolean }): BuiltParams {
  const params: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const mode = o.forSchedule ? "range" : modeOf(values);
  const get = (k: string) => (values[k] ?? "").trim();

  for (const spec of specsFor(entry, o.forSchedule)) {
    const raw = get(spec.key);
    switch (spec.type) {
      case "range":
        if (mode === "range" && raw) params.range = raw;
        break;
      case "month":
        if (mode === "month") {
          if (!MONTH.test(raw)) errors.month = "Choose a month";
          else params.month = raw;
        }
        break;
      case "date":
        if (spec.key === "from" || spec.key === "to") {
          if (mode !== "custom") break;
          if (!DAY.test(raw)) errors[spec.key] = spec.key === "from" ? "Choose the first day" : "Choose the last day";
          else params[spec.key] = raw;
        } else if (raw) {
          if (!DAY.test(raw)) errors[spec.key] = "Choose a date";
          else params[spec.key] = raw;
        }
        break;
      case "integer": {
        if (!raw) break;
        const n = Number(raw);
        const min = spec.min ?? 0;
        const max = spec.max ?? 1_000_000;
        if (!/^\d+$/.test(raw) || n < min || n > max) errors[spec.key] = `A whole number from ${min} to ${max}`;
        else params[spec.key] = n;
        break;
      }
      case "uuid":
        if (raw) {
          if (!UUID.test(raw)) errors[spec.key] = "Choose one from the list";
          else params[spec.key] = raw;
        }
        break;
      case "enum":
        if (raw) params[spec.key] = raw;
        break;
      default:
        if (raw) params[spec.key] = raw.slice(0, 80);
    }
  }
  if (mode === "custom" && params.from && params.to && String(params.from) > String(params.to)) errors.to = "The last day must not be before the first day";
  return { params, errors };
}

/** the default shown in a select that can stay empty */
export const defaultLabel = (spec: ReportParamSpec, labelOf?: (v: string) => string): string => {
  if (spec.default === null || spec.default === undefined) return "All";
  const v = String(spec.default);
  return `Default (${labelOf ? labelOf(v) : v})`;
};
