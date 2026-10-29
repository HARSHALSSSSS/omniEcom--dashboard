import { useEffect } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { isApiError } from "@/api/errors";
import { useIssueDetail, type useIssueActions } from "@/hooks/useNeedsAttention";
import type { Assignee, IssueDetail } from "@/types/attention";
import { ATTEMPTABLE_KEYS, AREA_LABEL, PRIORITY_LABEL, READ_ONLY_REASON, affectedHeading, ago, eventLabel, eventTime, statusText } from "./attention.ui";
import { AssignMenu, SnoozeMenu } from "./SnoozeMenu";

type Actions = ReturnType<typeof useIssueActions>;

interface Props {
  id: string;
  canWrite: boolean;
  members: Assignee[] | undefined;
  actions: Actions;
  /** an API deep link (already `toAppPath`-able); the page navigates and closes the drawer */
  onGo: (href: string | null | undefined) => void;
  onClose: () => void;
}

const SECONDARY = "w-full h-10 min-h-[44px] sm:min-h-0 rounded-[8px] bg-[#FFFFFF] border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed";

function DrawerShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] transition-opacity" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Issue details"
        style={{ width: "420px", maxWidth: "100vw", boxShadow: "-8px 0px 30px rgba(36, 45, 72, 0.12)" }}
        className="relative z-10 h-full w-full sm:w-[420px] max-w-full bg-white border-l border-[#E4E7EF] flex flex-col justify-between p-4 sm:p-6 overflow-y-auto animate-in slide-in-from-right duration-200"
      >
        {children}
      </div>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 sm:w-7 sm:h-7 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-md hover:bg-neutral-100 transition-colors">
      <X className="w-4 h-4 text-[#666666]" />
    </button>
  );
}

/** the issue drawer (?issue=<id>): why it matters, affected records, deadline, recommended action, activity, and the actions the role may take */
export function IssueDrawer(props: Props) {
  return (
    <DrawerShell onClose={props.onClose}>
      <DrawerContent {...props} />
    </DrawerShell>
  );
}

function DrawerContent({ id, canWrite, members, actions, onGo, onClose }: Props) {
  const q = useIssueDetail(id);

  if (q.isPending) {
    return (
      <>
        <div className="flex flex-col gap-4 animate-pulse" role="status" aria-label="Loading issue">
          <div className="flex justify-end">
            <CloseButton onClose={onClose} />
          </div>
          <div className="h-4 w-1/3 rounded bg-[#F5F5F5]" />
          <div className="h-6 w-4/5 rounded bg-[#F5F5F5]" />
          <div className="h-3 w-full rounded bg-[#F5F5F5]" />
          <div className="h-3 w-2/3 rounded bg-[#F5F5F5]" />
        </div>
        <span />
      </>
    );
  }

  if (q.isError || !q.data) {
    const gone = isApiError(q.error) && q.error.status === 404;
    return (
      <>
        <div className="flex flex-col gap-3" role="alert">
          <div className="flex justify-end">
            <CloseButton onClose={onClose} />
          </div>
          <h2 className="text-[18px] font-semibold text-[#000000]">{gone ? "This issue no longer exists" : "Couldn’t load this issue"}</h2>
          <p className="text-[13px] text-[#666666]">{gone ? "It may have been removed or belongs to another business." : "Check your connection and try again."}</p>
          {!gone && (
            <button type="button" onClick={() => q.refetch()} className={SECONDARY}>
              Try again
            </button>
          )}
        </div>
        <span />
      </>
    );
  }

  return <DrawerBody issue={q.data} canWrite={canWrite} members={members} actions={actions} onGo={onGo} onClose={onClose} />;
}

function DrawerBody({ issue, canWrite, members, actions, onGo, onClose }: Omit<Props, "id"> & { issue: IssueDetail }) {
  const { affected, deadline } = issue;
  const more = affected.total - affected.items.length;
  const closed = issue.status === "resolved";
  const busy = actions.start.isPending || actions.resolve.isPending || actions.snooze.isPending || actions.unsnooze.isPending || actions.assign.isPending;
  const attemptable = ATTEMPTABLE_KEYS.includes(issue.key);
  const failure = actions.resolve.error;
  const banner = isApiError(failure) && failure.rule === "resolution_failed" && typeof failure.details?.banner === "string" ? failure.details.banner : null;
  const reason = canWrite ? undefined : READ_ONLY_REASON;
  const act = issue.recommendedAction;

  return (
    <>
      <div className="flex flex-col items-start gap-6 w-full">
        <div className="flex flex-col items-start gap-3.5 w-full">
          <div className="flex flex-row justify-between items-center w-full h-7">
            <span className="text-[11px] font-medium leading-[145%] text-[#666666]">
              {AREA_LABEL[issue.area] ?? issue.area} · {PRIORITY_LABEL[issue.priority]}
            </span>
            <CloseButton onClose={onClose} />
          </div>
          <h2 className="text-[18px] font-semibold leading-[145%] text-[#000000]">{issue.title}</h2>
          <span className="text-[12px] font-normal leading-[145%] text-[#666666]">{statusText(issue)}</span>
        </div>

        <div className="w-full h-[1px] bg-[#EAEAEA]" />

        {banner && (
          <div role="alert" className="w-full bg-[#FFF1F3] border border-[#F2CAD2] rounded-[12px] px-3 py-2.5 text-[12px] leading-[145%] text-[#A33549]">
            {banner}
          </div>
        )}

        <div className="flex flex-col items-start gap-2 w-full">
          <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">Why this matters</span>
          <p className="text-[13px] font-normal leading-[145%] text-[#666666]">{issue.whyItMatters || issue.explanation}</p>
        </div>

        {affected.items.length > 0 && (
          <div className="flex flex-col items-start gap-2 w-full">
            <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">{affectedHeading(affected.items)}</span>
            <div className="flex flex-col items-start w-full">
              {affected.items.map((a) =>
                a.href ? (
                  <button
                    key={`${a.type}-${a.id}`}
                    type="button"
                    onClick={() => onGo(a.href)}
                    className="flex flex-row justify-between items-center w-full h-9 border-b border-[#EAEAEA] cursor-pointer hover:bg-neutral-50 px-1 rounded transition-colors text-left"
                  >
                    <span className="text-[12px] font-medium leading-[145%] text-[#000000]">{a.label}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#666666]" />
                  </button>
                ) : (
                  <div key={`${a.type}-${a.id}`} className="flex flex-row items-center w-full h-9 border-b border-[#EAEAEA] px-1">
                    <span className="text-[12px] font-medium leading-[145%] text-[#000000]">{a.label}</span>
                  </div>
                ),
              )}
              {more > 0 && (
                <div className="h-[30px] flex items-end">
                  <span className="text-[12px] font-normal leading-[145%] text-[#666666]">+{more} more</span>
                </div>
              )}
            </div>
          </div>
        )}

        {deadline.label && !closed && (
          <div className="flex flex-col justify-center items-start px-3 py-2.5 gap-2 w-full bg-[#FFF1F3] border border-[#F2CAD2] rounded-[12px] shadow-[0px_3px_10px_rgba(36,50,75,0.055)]">
            <span className="text-[12px] font-semibold leading-[145%] text-[#A33549]">Deadline</span>
            <span className="text-[13px] font-semibold leading-[145%] text-[#A33549]">{deadline.label}</span>
          </div>
        )}

        {act.text && (
          <div className="flex flex-col items-start p-4 gap-2 w-full bg-[#242D48] border border-[#384463] rounded-[14px] shadow-[0px_3px_10px_rgba(36,50,75,0.055)]">
            <span className="text-[12px] font-semibold leading-[145%] text-[#C8BDFF]">Recommended action</span>
            <p className="text-[13px] font-normal leading-[145%] text-[#D8DEEB]">{act.text}</p>
          </div>
        )}

        {issue.timeline.length > 0 && (
          <div className="flex flex-col items-start gap-2 w-full">
            <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">Activity</span>
            <ol className="flex flex-col w-full" aria-label="Activity">
              {issue.timeline.map((e, n) => (
                <li key={`${e.at}-${n}`} className="flex flex-row justify-between gap-3 py-1.5 border-b border-[#EAEAEA] text-[12px] leading-[145%]">
                  <span className="text-[#000000]">
                    {eventLabel(e.type)}
                    {e.note ? <span className="text-[#666666]"> · {e.note}</span> : null}
                  </span>
                  <span className="text-[#666666] shrink-0" title={eventTime(e.at)}>
                    {ago(e.at)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="flex flex-col items-start pt-5 gap-3 w-full border-t border-[#EAEAEA] mt-6">
        {act.href && act.label && (
          <button
            type="button"
            onClick={() => onGo(act.href)}
            className="w-full h-10 min-h-[44px] sm:min-h-0 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors flex items-center justify-center"
          >
            {act.label}
          </button>
        )}

        {!closed && (
          <>
            {!canWrite && <p className="text-[11px] text-[#666666] leading-[145%]">{READ_ONLY_REASON}</p>}

            {issue.status === "open" && (
              <button type="button" disabled={!canWrite || busy} title={reason} onClick={() => actions.start.mutate(issue.id)} className={SECONDARY}>
                {actions.start.isPending ? "Starting..." : "Mark in progress"}
              </button>
            )}

            {issue.status === "snoozed" ? (
              <button type="button" disabled={!canWrite || busy} title={reason} onClick={() => actions.unsnooze.mutate(issue.id)} className={SECONDARY}>
                {actions.unsnooze.isPending ? "Unsnoozing..." : "Unsnooze"}
              </button>
            ) : (
              <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2 w-full">
                <button type="button" disabled={!canWrite || busy} title={reason} onClick={() => actions.resolve.mutate({ id: issue.id, mode: "manual" })} className={SECONDARY}>
                  {actions.resolve.isPending && actions.resolve.variables?.mode === "manual" ? "Resolving..." : "Mark resolved"}
                </button>
                <SnoozeMenu
                  direction="up"
                  fullWidth
                  disabled={!canWrite || busy}
                  disabledReason={reason}
                  buttonClassName={SECONDARY}
                  onPick={(until) => actions.snooze.mutate({ id: issue.id, until })}
                />
              </div>
            )}

            {attemptable && issue.status !== "snoozed" && (
              <button type="button" disabled={!canWrite || busy} title={reason} onClick={() => actions.resolve.mutate({ id: issue.id, mode: "attempt" })} className={SECONDARY}>
                {actions.resolve.isPending && actions.resolve.variables?.mode === "attempt" ? "Retrying sync..." : "Retry sync and resolve"}
              </button>
            )}

            {members && members.length > 0 && (
              <AssignMenu
                direction="up"
                  fullWidth
                members={members}
                currentId={issue.assignedTo}
                disabled={!canWrite || busy}
                disabledReason={reason}
                buttonClassName={SECONDARY}
                onPick={(userId) => actions.assign.mutate({ id: issue.id, userId })}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
