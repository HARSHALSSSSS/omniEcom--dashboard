import React from "react";
import { cn } from "@/utils/cn";
import { ago } from "@/components/marketplace-hub/accounts/hubFormat";
import { STATUS_LABEL, listingsText, needsAttention, type ChannelStatus } from "./channelRows";

export interface NetworkChannelNode {
  id: string;
  name: string;
  slug: string;
  status: ChannelStatus;
  connected: boolean;
  listings?: number;
  lastSyncAt?: string | null;
}

interface CommerceNetworkDiagramProps {
  channels: NetworkChannelNode[];
  selectedChannelId?: string | null;
  onSelectChannel: (channelId: string) => void;
}

export const CommerceNetworkDiagram: React.FC<CommerceNetworkDiagramProps> = ({
  channels,
  selectedChannelId,
  onSelectChannel,
}) => {
  return (
    <div className="w-full space-y-3">
      <div className="text-[12px] font-semibold text-[#121212]">
        Your commerce network
      </div>

      <div className="w-full relative flex flex-col md:flex-row items-stretch md:items-center gap-4 bg-transparent">
        {/* Left card: Central Master Catalog */}
        <div className="shrink-0 w-full md:w-[220px] rounded-xl bg-[#F5F5F5] border border-[#E5E5E5] p-3.5 space-y-1">
          <div className="text-[13px] font-semibold text-[#121212]">
            Your business
          </div>
          <div className="text-[11px] text-[#737373]">
            Central master catalog
          </div>
          <div className="text-[11px] font-medium text-[#121212] pt-1">
            Products · Inventory · Orders
          </div>
        </div>

        {/* Connecting horizontal line track (visible on lg screens where nodes are in 1 row) */}
        <div className="hidden lg:block absolute left-[215px] right-6 top-1/2 -translate-y-1/2 h-[1px] bg-[#E5E5E5] -z-0" />

        {/* Channel Nodes Grid / Flex */}
        <div className="flex-1 min-w-0 grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 z-10">
          {channels.map((ch) => {
            const isSelected = selectedChannelId === ch.id;
            const isWarning = needsAttention(ch.status);
            const isConnected = ch.connected;

            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelectChannel(ch.id)}
                className={cn(
                  "flex flex-col items-start justify-center p-3 rounded-lg border text-left transition-all cursor-pointer bg-white",
                  isSelected
                    ? "border-[#121212] shadow-sm ring-1 ring-[#121212]"
                    : "border-[#E5E5E5] hover:border-[#CCCCCC] hover:bg-[#FAFAFA]",
                )}
              >
                <div className="w-full flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[#121212] truncate">
                    {ch.name}
                  </span>
                  {isConnected && (
                    <span
                      className={cn(
                        "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                        ch.status === "healthy" && "bg-emerald-600",
                        isWarning && "bg-amber-500",
                        ch.status === "syncing" && "bg-blue-600 animate-pulse",
                        ch.status === "paused" && "bg-[#8C8C8C]",
                      )}
                    />
                  )}
                </div>

                <div
                  className={cn(
                    "text-[11px] mt-0.5",
                    !isConnected
                      ? "text-[#737373]"
                      : isWarning
                        ? "text-amber-600 font-medium"
                        : "text-[#737373]",
                  )}
                >
                  {STATUS_LABEL[ch.status]}
                </div>

                <div className="text-[11px] text-[#737373] mt-1 truncate w-full">
                  {isConnected
                    ? `${listingsText(ch.listings ?? 0)} · ${ago(ch.lastSyncAt ?? null)}`
                    : "Available to connect"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
