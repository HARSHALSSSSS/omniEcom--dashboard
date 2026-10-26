import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { RULE_STATUSES, RUN_STATUSES, type AutomationRule, type AutomationTab, type RuleStatus, type RunStatus, type RunsQuery } from "@/types/automation";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABS: readonly AutomationTab[] = ["overview", "rules", "approvals", "runs"];

const oneOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => allowed.find((a) => a === value);
const uuid = (value: string | null): string | undefined => (value && UUID.test(value) ? value : undefined);

export interface AutomationUrlState {
  tab: AutomationTab;
  q?: string;
  /** rule status on the rules tab, run status on the runs tab */
  status?: RuleStatus | RunStatus;
  /** rules tab: only rules with this trigger event */
  trigger?: string;
  /** runs tab: only runs of this rule */
  ruleId?: string;
  /** the rule whose drawer is open */
  rule?: string;
  /** the run / approval (execution) whose drawer is open */
  run?: string;
  page: number;
  pageSize: number;
}

export function readUrlState(params: URLSearchParams): AutomationUrlState {
  const hasRulesParams = Boolean(
    params.get("status") ||
    params.get("trigger") ||
    params.get("q") ||
    params.get("rule")
  );
  const tab = oneOf(params.get("tab"), TABS) ?? (hasRulesParams ? "rules" : "overview");
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  return {
    tab,
    q: tab === "rules" ? params.get("q")?.trim() || undefined : undefined,
    status: tab === "rules" ? oneOf(params.get("status"), RULE_STATUSES) : tab === "runs" ? oneOf(params.get("status"), RUN_STATUSES) : undefined,
    trigger: tab === "rules" ? params.get("trigger")?.trim() || undefined : undefined,
    ruleId: tab === "runs" ? uuid(params.get("ruleId")) : undefined,
    rule: uuid(params.get("rule")),
    run: uuid(params.get("run")),
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
  };
}

export const runsQueryOf = (s: AutomationUrlState): RunsQuery => ({ status: s.status as RunStatus | undefined, ruleId: s.ruleId, page: s.page, pageSize: s.pageSize });

export const isFiltered = (s: AutomationUrlState): boolean => Boolean(s.q || s.status || s.trigger || s.ruleId);

/** the rules list comes whole from the API (it has no paging), so search, status and trigger are applied here */
export function filterRules(rules: AutomationRule[], s: Pick<AutomationUrlState, "q" | "status" | "trigger">, label: (r: AutomationRule) => string): AutomationRule[] {
  const q = s.q?.toLowerCase();
  return rules.filter((r) => (!s.status || r.status === s.status) && (!s.trigger || r.triggerEvent === s.trigger) && (!q || `${r.name} ${r.description ?? ""} ${label(r)}`.toLowerCase().includes(q)));
}

type Key = "tab" | "q" | "status" | "trigger" | "ruleId" | "rule" | "run" | "page" | "size";
type Patch = Partial<Record<Key, string | null>>;

/** The Automation screen keeps its tab, search, filters, page and the open rule or run in the URL, so reload, back and deep links work. */
export function useAutomationUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params), [params]);

  /** a tab or filter change goes back to page 1; opening a drawer keeps the page; `replace` keeps typing out of the history */
  const update = useCallback(
    (patch: Patch, opts: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const onlyDrawer = Object.keys(patch).every((k) => k === "rule" || k === "run");
          if (!("page" in patch) && !onlyDrawer) next.delete("page");
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key);
            if (value !== null && value !== undefined && value !== "") {
              next.set(key, value);
            }
          }
          if (next.has("status") || next.has("trigger") || next.has("q") || next.has("rule")) {
            next.delete("tab");
          }
          if (next.get("tab") === "overview") {
            next.delete("tab");
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(() => update({ q: null, status: null, trigger: null, ruleId: null }), [update]);

  return { ...state, update, clearFilters };
}
