import { Bookmark, ArrowRight } from "lucide-react";
import type { ChannelConnection, ConnectorDirectoryItem } from "@/types/connection";
import { ago, WRITE_REASON } from "@/components/marketplace-hub/accounts/hubFormat";
import { CAPABILITY_LABEL, FEE_TEXT, accessText } from "./connectorFacts";

interface ConnectorCardItemProps {
  item: ConnectorDirectoryItem;
  /** the business's account of this connector, when it has one */
  connection?: ChannelConnection;
  isSelectedForCompare: boolean;
  isBookmarked: boolean;
  /** the viewer's role may change connections (marketplace_accounts:write) */
  canConnect: boolean;
  onToggleCompare: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  onOpenPreview: (item: ConnectorDirectoryItem) => void;
  onConnect: (id: string) => void;
  onManage: (id: string) => void;
}

export function ConnectorCardItem({
  item,
  connection,
  isSelectedForCompare,
  isBookmarked,
  canConnect,
  onToggleCompare,
  onToggleBookmark,
  onOpenPreview,
  onConnect,
  onManage,
}: ConnectorCardItemProps) {
  const isUnavailable = item.status === "unavailable";
  const isNeedsAttention = item.status === "needs_attention";
  const isConnected = item.status === "connected" || (isNeedsAttention && (item.accountCount ?? 0) > 0 && Boolean(connection));

  const statusLine = connection
    ? connection.status === "healthy"
      ? `✓ Healthy · Last sync ${connection.lastSyncAt && connection.lastSyncAt !== "Never" ? ago(connection.lastSyncAt) : "never"}`
      : `! Needs attention · ${connection.attentionIssue?.issueTitle ?? "Check the connection"}`
    : isNeedsAttention
      ? `! ${item.statusReason ?? "Needs attention"}`
      : null;

  const caps = item.capabilities.map((c) => CAPABILITY_LABEL[c] ?? c.replace(/_/g, " "));

  return (
    <div
      onClick={() => onOpenPreview(item)}
      className="group relative flex flex-col justify-between rounded-xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm transition-all hover:border-[#D4D4D4] hover:shadow-md cursor-pointer"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <label onClick={(e) => e.stopPropagation()} className="flex items-center justify-center pt-0.5 cursor-pointer">
              <input
                type="checkbox"
                aria-label={`Compare ${item.name}`}
                checked={isSelectedForCompare}
                onChange={() => onToggleCompare(item.id)}
                className="h-4 w-4 rounded border-[#D4D4D4] text-[#111111] focus:ring-0 cursor-pointer"
              />
            </label>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#EBEBEB] bg-[#F9F9FA] text-[15px] font-bold text-[#111111]">
              {item.name.charAt(0).toUpperCase()}
            </div>

            <h3 className="text-[16px] font-bold text-[#111111] group-hover:text-black transition-colors">{item.name}</h3>
          </div>

          <div className="flex flex-col items-end gap-1">
            {isConnected && !isNeedsAttention && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-medium text-[#16A34A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                Connected
              </span>
            )}
            {isNeedsAttention && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFFBEB] px-2.5 py-1 text-[11px] font-medium text-[#D97706]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
                Needs Attention
              </span>
            )}
            {!isConnected && !isNeedsAttention && !isUnavailable && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F3FF] px-2.5 py-1 text-[11px] font-medium text-[#7C3AED]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#7C3AED]" />
                Available
              </span>
            )}
            {isUnavailable && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F5F5] px-2.5 py-1 text-[11px] font-medium text-[#737373]">Unavailable</span>
            )}
            {item.implementation === "beta" && (
              <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#B45309]">Beta</span>
            )}
          </div>
        </div>

        <p className="mt-3 text-[12px] text-[#666666] line-clamp-2 leading-relaxed">{item.description}</p>

        <div className="mt-4 space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A8A8A]">CAPABILITIES</span>
          <div className="flex flex-wrap gap-1.5">
            {caps.length === 0 && <span className="text-[11px] text-[#737373]">No capabilities enabled yet</span>}
            {caps.map((cap) => (
              <span
                key={cap}
                className={`rounded-md px-2 py-0.5 text-[11px] font-normal transition-colors ${
                  cap === "Inventory" ? "bg-[#ECFDF5] text-[#15803D] font-medium" : "bg-[#F5F5F5] text-[#525252]"
                }`}
              >
                {cap}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-3 text-[11px]">
          {statusLine && <span className={isNeedsAttention || connection?.status !== "healthy" ? "text-[#D97706] font-medium" : "text-[#525252]"}>{statusLine}</span>}
          {!statusLine && isConnected && <span className="text-[#525252]">✓ Connected to your workspace</span>}
          {!statusLine && !isConnected && !isUnavailable && <span className="text-[#737373]">Available to connect</span>}
          {isUnavailable && <span className="text-[#737373]">{item.statusReason ?? "Not available yet"}</span>}
        </div>

        <div className="mt-0.5 text-[11px] text-[#737373]">
          {FEE_TEXT} · {accessText(item)}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-[#F5F5F5]">
        <button
          type="button"
          aria-pressed={isBookmarked}
          aria-label={isBookmarked ? `Remove ${item.name} bookmark` : `Bookmark ${item.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark(item.id);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#F5F5F5] transition-colors ${isBookmarked ? "text-[#111111]" : "text-[#8A8A8A] hover:text-[#111111]"}`}
          title={isBookmarked ? "Bookmarked on this device" : "Bookmark on this device"}
        >
          <Bookmark className="h-4 w-4" fill={isBookmarked ? "currentColor" : "none"} />
        </button>

        {isConnected || isNeedsAttention ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onManage(item.id);
            }}
            className="flex items-center gap-1 text-[12px] font-semibold text-[#111111] hover:underline px-2 py-1"
          >
            Manage <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : isUnavailable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPreview(item);
            }}
            className="h-8 px-3.5 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors"
          >
            View connector
          </button>
        ) : (
          <span title={canConnect ? undefined : WRITE_REASON}>
            <button
              type="button"
              disabled={!canConnect}
              onClick={(e) => {
                e.stopPropagation();
                onConnect(item.id);
              }}
              className="h-8 px-4 rounded-lg bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Connect
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
