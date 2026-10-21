import { AlertCircle, Check, Clock3 } from "lucide-react";
import { toAppPath } from "@/lib/links";
import { useCan } from "@/hooks/useCan";
import type { RetrySyncState } from "@/hooks/useRecommendations";
import type { ChannelCard } from "@/types/recommendations";
import { formatInZone } from "@/utils/format";

interface Props {
  card: ChannelCard;
  businessName: string;
  connections: number;
  sync: RetrySyncState;
  onRetry: (href: string) => void;
  onNavigate: (path: string) => void;
}

const CONNECTION_LABEL = { connected: "Connected", needs_attention: "Needs attention", not_connected: "Not connected" } as const;

const lastSync = (iso: string | null) => (iso ? formatInZone(iso, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Never");

function syncMessage(sync: RetrySyncState): { text: string; tone: "info" | "good" | "bad" } | null {
  if (sync.phase === "running") return { text: sync.job ? `Sync ${sync.job.status.replace(/_/g, " ")}${sync.job.progress.total ? ` (${sync.job.progress.done}/${sync.job.progress.total})` : ""}...` : "Starting the sync...", tone: "info" };
  if (sync.phase === "error") return { text: sync.message, tone: "bad" };
  if (sync.phase === "done") {
    const s = sync.job.status;
    if (s === "succeeded") return { text: "Sync finished successfully.", tone: "good" };
    if (s === "partially_failed") return { text: "Sync finished, but some items failed. Check the sync log.", tone: "bad" };
    if (s === "cancelled") return { text: "The sync was cancelled.", tone: "bad" };
    return { text: "The sync failed. Check the connection and try again.", tone: "bad" };
  }
  return null;
}

/** the channel connection that needs attention: real status, open problems, and its own retry-sync / manage actions */
export function ChannelPanel({ card, businessName, connections, sync, onRetry, onNavigate }: Props) {
  const canSync = useCan("listings:write");
  const retry = card.actions.find((a) => a.key === "retry_sync");
  const running = sync.phase === "running";
  const retryBlocked = !retry || !retry.enabled || !canSync;
  const blockedReason = !retry ? "Not available" : !retry.enabled ? (retry.disabledReason ?? "Not available") : !canSync ? "Your role cannot start a sync" : undefined;
  const message = syncMessage(sync);
  const accountId = card.channel.accountId;

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs" data-testid="channel-panel">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-normal leading-[145%] text-[#666666] uppercase tracking-wide">Channel connection</span>
          <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">{card.displayName}</h2>
          <p className="text-[12px] font-normal text-[#666666] leading-[145%]">{businessName ? `${businessName} · ` : ""}Marketplace connection</p>
        </div>

        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 px-2 h-[26px] bg-[#F5F5F5] border border-[#EAEAEA] rounded-[4px] text-[11px] font-normal text-[#333333]">
            <Check className="h-3 w-3 text-[#333333] stroke-[2.5]" />
            {CONNECTION_LABEL[card.connection]}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 h-[26px] bg-white border border-[#EAEAEA] rounded-[4px] text-[11px] font-normal text-[#333333]">
            <Clock3 className="h-3 w-3 text-[#333333]" />
            {card.health === "attention" ? "Attention" : "Healthy"}
          </span>
        </div>

        <div className="flex flex-col divide-y divide-[#EAEAEA] border-t border-[#EAEAEA]">
          <div className="flex items-center justify-between h-[34px] text-[11px]">
            <span className="text-[#666666]">Last sync</span>
            <span className="text-[12px] font-medium text-[#000000]">{lastSync(card.lastSyncAt)}</span>
          </div>
          <div className="flex items-center justify-between h-[34px] text-[11px]">
            <span className="text-[#666666]">Open issues</span>
            <span className="text-[12px] font-medium text-[#000000]">
              {card.openIssueCount} {card.openIssueCount === 1 ? "issue" : "issues"}
            </span>
          </div>
          <div className="flex items-center justify-between h-[34px] text-[11px]">
            <span className="text-[#666666]">Sync mode</span>
            <span className="text-[12px] font-medium text-[#000000]">{card.syncMode === "manual" ? "Manual" : "Automatic"}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-[13px] font-semibold text-[#000000] leading-[145%]">What needs attention</h3>
          {card.openIssues.length === 0 ? (
            <p className="text-[12px] text-[#666666] leading-[145%]">No open problems on this connection.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[#EAEAEA]">
              {card.openIssues.map((issue) => (
                <div key={issue.code} className="py-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-[#666666] shrink-0" />
                    <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">{issue.title}</span>
                  </div>
                  <p className="text-[12px] font-normal text-[#666666] leading-[145%] pl-5.5">{issue.explanation}</p>
                  {issue.action.href && (
                    <button type="button" onClick={() => onNavigate(toAppPath(issue.action.href))} className="text-[12px] font-medium text-[#000000] hover:underline text-left pl-5.5">
                      {issue.action.label ?? "Review"} →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] font-normal text-[#666666] leading-[145%] pt-1">
            These are {card.displayName}&apos;s {card.openIssueCount} {card.openIssueCount === 1 ? "issue" : "issues"}. The workspace has {connections} channel{" "}
            {connections === 1 ? "connection" : "connections"}.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-6">
        {retry && (
          <button
            type="button"
            onClick={() => onRetry(retry.href)}
            disabled={retryBlocked || running}
            title={blockedReason}
            className="w-full sm:w-[200px] h-10 rounded-[8px] border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? "Retrying..." : retry.label}
          </button>
        )}
        {blockedReason && retryBlocked && <p className="text-[11px] text-[#666666] leading-[145%]">{blockedReason}</p>}
        {message && (
          <p role="status" className={`text-[12px] leading-[145%] ${message.tone === "good" ? "text-[#16816A]" : message.tone === "bad" ? "text-[#A33549]" : "text-[#666666]"}`}>
            {message.text}
          </p>
        )}
        <button
          type="button"
          onClick={() => onNavigate(accountId ? toAppPath(`/channels/${accountId}`) : toAppPath("/channels/"))}
          className="text-[12px] font-medium text-[#000000] hover:underline text-left"
        >
          Manage connection →
        </button>
      </div>
    </div>
  );
}
