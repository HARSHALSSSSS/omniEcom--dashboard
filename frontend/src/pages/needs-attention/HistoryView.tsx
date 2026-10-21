import { Check, Clock } from "lucide-react";
import type { HistoryItem, HistoryStatus, IssueHistory } from "@/types/attention";
import { AREA_LABEL, READ_ONLY_REASON, ago } from "./attention.ui";
import { Pager } from "./Pager";
import { QueueError, QueueSkeleton } from "./QueueStates";

interface Props {
  status: HistoryStatus;
  page: number;
  data: IssueHistory | undefined;
  loading: boolean;
  fetching: boolean;
  error: unknown;
  canWrite: boolean;
  unsnoozingId: string | null;
  onStatus: (s: HistoryStatus) => void;
  onPage: (p: number) => void;
  onOpen: (id: string) => void;
  onUnsnooze: (id: string) => void;
  onRetry: () => void;
}

/** what the history row says about the outcome, from the server's resolvedBy / resolution */
function outcome(i: HistoryItem): string {
  if (i.status === "snoozed") return "Temporarily removed from the active queue";
  const by = i.resolvedBy ? `Marked resolved by ${i.resolvedBy}` : i.resolution === "attempt" ? "Resolved by retrying the action" : "Resolved automatically";
  const note = i.resolution && i.resolution !== "manual" && i.resolution !== "attempt" ? ` · ${i.resolution}` : "";
  return `${by}${note}`;
}

/** Resolved & snoozed: the closed part of the queue, with the server's All / Resolved / Snoozed counts */
export function HistoryView({ status, page, data, loading, fetching, error, canWrite, unsnoozingId, onStatus, onPage, onOpen, onUnsnooze, onRetry }: Props) {
  const chips: Array<{ value: HistoryStatus; label: string }> = [
    { value: "all", label: "All" },
    { value: "resolved", label: "Resolved" },
    { value: "snoozed", label: "Snoozed" },
  ];

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-4 w-full">
        <div className="flex flex-row justify-between items-center w-full h-[26px]">
          <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">Resolved & snoozed</h2>
          <div className="flex flex-row items-center gap-[18px] text-[12px] leading-[145%]">
            {chips.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={status === c.value}
                onClick={() => onStatus(c.value)}
                className={`cursor-pointer ${status === c.value ? "font-semibold text-[#000000]" : "font-normal text-[#666666] hover:text-[#000000]"}`}
              >
                {c.label}
                {data ? ` · ${data.counts[c.value]}` : ""}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[13px] font-normal text-[#666666] leading-[145%]">Resolved issues stay here. Snoozed issues return to the active queue when their snooze ends.</p>
      </div>

      {error && !data ? (
        <QueueError error={error} onRetry={onRetry} what="history" />
      ) : loading ? (
        <QueueSkeleton label="Loading history..." />
      ) : data && data.items.length === 0 ? (
        <div className="w-full bg-white border border-[#E4E7EF] rounded-[12px] px-6 py-12 text-center text-[13px] text-[#666666]">
          {status === "snoozed" ? "No snoozed issues." : status === "resolved" ? "No resolved issues yet." : "Nothing has been resolved or snoozed yet."}
        </div>
      ) : (
        data && (
          <div className="flex flex-col gap-2 w-full">
            <div className="flex flex-row items-center px-4 h-10 gap-6 text-[11px] font-medium leading-[145%] text-[#666666]">
              <span className="flex-1 min-w-[280px]">Issue</span>
              <span className="w-[100px] shrink-0">Area</span>
              <span className="w-[112px] shrink-0">Status</span>
              <span className="w-[140px] shrink-0">Updated / Returns</span>
              <span className="w-[184px] shrink-0 text-right">Action</span>
            </div>

            <div className="flex flex-col gap-2 w-full">
              {data.items.map((i) => {
                const resolved = i.status === "resolved";
                const color = resolved ? "#16816A" : "#7661C8";
                return (
                  <div
                    key={i.id}
                    data-testid="history-row"
                    style={{ boxShadow: "0px 3px 10px rgba(36, 50, 75, 0.055)", borderColor: color }}
                    className="flex flex-row items-center p-4 gap-6 w-full bg-white border rounded-[12px] min-h-[102px]"
                  >
                    <div className="flex flex-col gap-1 flex-1 min-w-[280px]">
                      <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">{i.title}</span>
                      <span className="text-[12px] font-normal text-[#666666] leading-[145%]">{outcome(i)}</span>
                    </div>
                    <span className="w-[100px] shrink-0 text-[12px] font-normal text-[#666666] leading-[145%]">{AREA_LABEL[i.area] ?? i.area}</span>
                    <div className="flex flex-row items-center gap-1.5 w-[112px] shrink-0">
                      {resolved ? <Check className="w-3.5 h-3.5 stroke-[2]" style={{ color }} /> : <Clock className="w-3.5 h-3.5 stroke-[2]" style={{ color }} />}
                      <span className="text-[12px] font-medium leading-[145%]" style={{ color }}>
                        {resolved ? "Resolved" : "Snoozed"}
                      </span>
                    </div>
                    <span className="w-[140px] shrink-0 text-[12px] font-normal text-[#666666] leading-[145%]">
                      {resolved ? ago(i.updatedAt) : i.returnsLabel ? `Returns ${i.returnsLabel}` : "Returns later"}
                    </span>
                    <div className="w-[184px] shrink-0 flex flex-col items-end gap-2">
                      <button type="button" onClick={() => onOpen(i.id)} className="text-[12px] font-medium text-[#000000] hover:underline cursor-pointer">
                        {i.recommendedAction.label ?? "View details"} →
                      </button>
                      {!resolved && (
                        <button
                          type="button"
                          disabled={!canWrite || unsnoozingId === i.id}
                          title={canWrite ? undefined : READ_ONLY_REASON}
                          onClick={() => onUnsnooze(i.id)}
                          className="h-[30px] w-[90px] rounded-[8px] bg-white border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Unsnooze
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <Pager page={page} pages={data.pages} shown={data.items.length} total={data.total} fetching={fetching} onPage={onPage} />
          </div>
        )
      )}
    </div>
  );
}
