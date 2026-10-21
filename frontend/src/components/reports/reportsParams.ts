import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { REPORT_TABS, REPORT_TYPES, RUN_STATUSES, RUN_TRIGGERS, SCHEDULE_STATUSES, type ReportsTab, type ReportType, type RunQuery, type RunStatus, type RunTrigger, type ScheduleQuery, type ScheduleStatus } from "@/types/reports";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const oneOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => allowed.find((a) => a === value);

export interface ReportsUrlState {
  tab: ReportsTab;
  /** run history filters */
  type: ReportType | undefined;
  status: RunStatus | undefined;
  trigger: RunTrigger | undefined;
  /** schedule list filter */
  scheduleStatus: ScheduleStatus | undefined;
  page: number;
  pageSize: number;
  /** the open run detail */
  runId: string | undefined;
}

export function readUrlState(p: URLSearchParams): ReportsUrlState {
  const page = Number(p.get("page"));
  const size = Number(p.get("size"));
  const run = p.get("run");
  return {
    tab: oneOf(p.get("tab"), REPORT_TABS) ?? "reports",
    type: oneOf(p.get("type"), REPORT_TYPES),
    status: oneOf(p.get("status"), RUN_STATUSES),
    trigger: oneOf(p.get("trigger"), RUN_TRIGGERS),
    scheduleStatus: oneOf(p.get("sstatus"), SCHEDULE_STATUSES),
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    runId: run && UUID.test(run) ? run : undefined,
  };
}

export const runQueryOf = (s: ReportsUrlState): RunQuery => ({ type: s.type, status: s.status, trigger: s.trigger, page: s.page, pageSize: s.pageSize });
export const scheduleQueryOf = (s: ReportsUrlState): ScheduleQuery => ({ status: s.scheduleStatus, page: s.page, pageSize: s.pageSize });
export const isRunFiltered = (s: ReportsUrlState): boolean => Boolean(s.type || s.status || s.trigger);

type Key = "tab" | "type" | "status" | "trigger" | "sstatus" | "page" | "size" | "run";
export type UrlPatch = Partial<Record<Key, string | null>>;

/** The Reports screen keeps tab, filters, page and the open run in the URL, so reload, back and deep links work. */
export function useReportsUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params), [params]);

  const update = useCallback(
    (patch: UrlPatch, opts: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const keys = Object.keys(patch) as Key[];
          // opening or closing the run detail keeps the page; any other change goes back to page 1
          if (!keys.includes("page") && !keys.every((k) => k === "run")) next.delete("page");
          if (keys.includes("tab")) for (const k of ["type", "status", "trigger", "sstatus"] as Key[]) if (!keys.includes(k)) next.delete(k);
          for (const key of keys) {
            const value = patch[key];
            next.delete(key);
            if (value !== null && value !== undefined && value !== "" && !(key === "tab" && value === "reports")) next.set(key, value);
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const clearRunFilters = useCallback(() => update({ type: null, status: null, trigger: null }), [update]);
  return { ...state, update, clearRunFilters };
}
