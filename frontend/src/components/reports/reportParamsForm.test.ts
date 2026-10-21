import { describe, expect, it } from "vitest";
import type { CatalogEntry, ReportParamSpec } from "@/types/reports";
import { buildParams, modeOf, valuesOf } from "./reportParamsForm";
import { paramSummary } from "./reportsFormat";

const spec = (over: Partial<ReportParamSpec> & Pick<ReportParamSpec, "key" | "type">): ReportParamSpec => ({ label: over.key, description: "", options: null, default: null, min: null, max: null, relative: true, ...over });
const entry: CatalogEntry = {
  type: "products",
  title: "Product performance report",
  description: "",
  category: "sales",
  formats: ["csv"],
  defaultFormat: "csv",
  schedulable: true,
  sheets: ["Products"],
  csvSheet: "Products",
  params: [
    spec({ key: "range", type: "range", options: ["last_30_days", "previous_month"], default: "last_30_days" }),
    spec({ key: "month", type: "month", relative: false }),
    spec({ key: "from", type: "date", relative: false }),
    spec({ key: "to", type: "date", relative: false }),
    spec({ key: "sort", type: "enum", options: ["revenue", "units"], default: "revenue" }),
    spec({ key: "limit", type: "integer", min: 1, max: 200, default: 200 }),
    spec({ key: "warehouseId", type: "uuid" }),
  ],
};

describe("report parameter forms", () => {
  it("leaves empty values out so the server applies its defaults", () => {
    expect(buildParams(entry, {}, { forSchedule: false })).toEqual({ params: {}, errors: {} });
  });

  it("takes the preset, month or custom dates by the mode the values are in", () => {
    expect(buildParams(entry, { range: "previous_month", sort: "units", limit: "50" }, { forSchedule: false }).params).toEqual({ range: "previous_month", sort: "units", limit: 50 });
    expect(modeOf({ month: "" })).toBe("month");
    expect(buildParams(entry, { month: "" }, { forSchedule: false }).errors.month).toBeTruthy();
    expect(buildParams(entry, { month: "2026-09" }, { forSchedule: false }).params).toEqual({ month: "2026-09" });
    expect(buildParams(entry, { from: "2026-09-01", to: "2026-09-30" }, { forSchedule: false }).params).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("checks custom dates, integers and ids", () => {
    expect(buildParams(entry, { from: "2026-09-10", to: "2026-09-01" }, { forSchedule: false }).errors.to).toMatch(/not be before/);
    expect(buildParams(entry, { from: "2026-09-10", to: "" }, { forSchedule: false }).errors.to).toBeTruthy();
    expect(buildParams(entry, { limit: "0" }, { forSchedule: false }).errors.limit).toBeTruthy();
    expect(buildParams(entry, { limit: "1.5" }, { forSchedule: false }).errors.limit).toBeTruthy();
    expect(buildParams(entry, { warehouseId: "nope" }, { forSchedule: false }).errors.warehouseId).toBeTruthy();
  });

  it("keeps a schedule to relative parameters", () => {
    const built = buildParams(entry, { range: "previous_month", month: "2026-09", from: "2026-01-01", to: "2026-01-31", sort: "units" }, { forSchedule: true });
    expect(built.params).toEqual({ range: "previous_month", sort: "units" });
    expect(built.errors).toEqual({});
  });

  it("turns params into text values and a readable summary", () => {
    expect(valuesOf({ month: "2026-10", limit: 20, skip: null })).toEqual({ month: "2026-10", limit: "20" });
    const periods = [{ key: "previous_month", label: "Previous month" }];
    expect(paramSummary({ range: "previous_month", sort: "units" }, entry, periods)).toBe("Previous month · sort: units");
    expect(paramSummary({ from: "2026-09-01", to: "2026-09-30" }, entry)).toBe("2026-09-01 to 2026-09-30");
  });
});
