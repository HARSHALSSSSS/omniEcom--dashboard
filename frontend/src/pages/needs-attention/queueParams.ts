import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ISSUE_AREAS, ISSUE_PRIORITIES, type HistoryStatus, type IssueArea, type IssueDue, type IssuePriority, type IssueTab } from "@/types/attention";

export const PAGE_SIZE = 10;

const TABS: IssueTab[] = ["all", "critical", "today", "upcoming"];
const STATUSES = ["open", "in_progress", "snoozed"] as const;
const DUES: IssueDue[] = ["today", "tomorrow", "this_week"];
const HISTORY: HistoryStatus[] = ["all", "resolved", "snoozed"];

export type StatusFilter = (typeof STATUSES)[number];

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | undefined => (value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined);
const positive = (value: string | null) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
};

/**
 * The screen's state lives in the URL, so a view can be bookmarked and shared:
 * ?tab=critical&area=orders&priority=high&status=snoozed&due=today&page=2 | ?view=history&hstatus=resolved&hpage=2 | ?issue=<id> (drawer)
 */
export function useQueueParams() {
  const [params, setParams] = useSearchParams();

  const state = useMemo(
    () => ({
      view: params.get("view") === "history" ? ("history" as const) : ("queue" as const),
      tab: pick(params.get("tab"), TABS) ?? "all",
      area: pick<IssueArea>(params.get("area"), ISSUE_AREAS),
      priority: pick<IssuePriority>(params.get("priority"), ISSUE_PRIORITIES),
      status: pick(params.get("status"), STATUSES),
      due: pick(params.get("due"), DUES),
      page: positive(params.get("page")),
      historyStatus: pick(params.get("hstatus"), HISTORY) ?? "all",
      historyPage: positive(params.get("hpage")),
      issueId: params.get("issue"),
    }),
    [params],
  );

  /** change some keys; `undefined`, "" and the defaults are dropped from the URL; changing a filter goes back to page 1 */
  const update = useCallback(
    (patch: Record<string, string | undefined>, opts: { keepPage?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === "" || (k === "tab" && v === "all") || (k === "hstatus" && v === "all") || (k === "page" && v === "1") || (k === "hpage" && v === "1")) next.delete(k);
            else next.set(k, v);
          }
          if (!opts.keepPage && !("page" in patch)) next.delete("page");
          if (!opts.keepPage && !("hpage" in patch)) next.delete("hpage");
          return next;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  return { ...state, update };
}

export type QueueParams = ReturnType<typeof useQueueParams>;
