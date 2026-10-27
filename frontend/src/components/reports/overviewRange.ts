import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { OVERVIEW_COMPARES, type OverviewCompare } from "@/types/reports";

export const RANGE_PRESETS = [
  { id: "this_week", label: "This week" },
  { id: "last_7", label: "Last 7 days" },
  { id: "last_30", label: "Last 30 days" },
  { id: "last_90", label: "Last 90 days" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "custom", label: "Custom range" },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]["id"];

export const COMPARE_LABELS: Record<OverviewCompare, string> = {
  previous: "Compare: previous period",
  previous_year: "Compare: same dates last year",
  none: "No comparison",
};

export const PERIODS = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
] as const;
export type TrendPeriod = (typeof PERIODS)[number]["id"];

const DAY = 86_400_000;
const KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

/** the calendar date (YYYY-MM-DD) it is right now in the business time zone */
export function dateKeyInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const toMs = (key: string) => Date.parse(`${key}T00:00:00Z`);
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (key: string, n: number) => toKey(toMs(key) + n * DAY);
export const daysBetween = (from: string, to: string) => Math.round((toMs(to) - toMs(from)) / DAY) + 1;

/** the dates a preset stands for, counted from today in the business time zone (weeks start on Monday) */
export function presetRange(id: Exclude<RangePreset, "custom">, today: string): { from: string; to: string } {
  const d = new Date(`${today}T00:00:00Z`);
  switch (id) {
    case "this_week": {
      const back = (d.getUTCDay() + 6) % 7;
      return { from: addDays(today, -back), to: today };
    }
    case "last_7":
      return { from: addDays(today, -6), to: today };
    case "last_30":
      return { from: addDays(today, -29), to: today };
    case "last_90":
      return { from: addDays(today, -89), to: today };
    case "this_month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last_month": {
      const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
      return { from: toKey(first.getTime()), to: toKey(last.getTime()) };
    }
  }
}

export interface OverviewUrlState {
  preset: RangePreset;
  from: string;
  to: string;
  compare: OverviewCompare;
  /** the person's choice of trend buckets; undefined lets the server pick from the length of the range */
  period: TrendPeriod | undefined;
  /** a custom range that is not usable (end before start, longer than a year, not a date) */
  problem: string | null;
}

/** the Overview's date range, comparison and trend buckets live in the URL, so a link shows the same numbers */
export function useOverviewUrlState(today: string) {
  const [params, setParams] = useSearchParams();

  const state = useMemo<OverviewUrlState>(() => {
    const presetParam = params.get("range");
    const preset = RANGE_PRESETS.find((p) => p.id === presetParam)?.id ?? "last_30";
    const compare = OVERVIEW_COMPARES.find((c) => c === params.get("compare")) ?? "previous";
    const period = PERIODS.find((p) => p.id === params.get("trend"))?.id;
    if (preset !== "custom") return { preset, ...presetRange(preset, today), compare, period, problem: null };
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    let problem: string | null = null;
    if (!KEY.test(from) || !KEY.test(to) || Number.isNaN(toMs(from)) || Number.isNaN(toMs(to))) problem = "Pick a start and an end date.";
    else if (from > to) problem = "The start date must not be after the end date.";
    else if (daysBetween(from, to) > MAX_DAYS) problem = "A range is at most 366 days.";
    return { preset, from, to, compare, period, problem };
  }, [params, today]);

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === "") next.delete(k);
            else next.set(k, v);
          }
          next.set("tab", "overview");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setPreset = useCallback(
    (id: RangePreset) => {
      if (id === "custom") {
        const r = presetRange("last_30", today);
        set({ range: "custom", from: r.from, to: r.to });
      } else set({ range: id === "last_30" ? null : id, from: null, to: null });
    },
    [set, today],
  );

  return { state, setPreset, setCustom: (from: string, to: string) => set({ range: "custom", from, to }), setCompare: (c: OverviewCompare) => set({ compare: c === "previous" ? null : c }), setPeriod: (p: TrendPeriod | undefined) => set({ trend: p ?? null }) };
}
