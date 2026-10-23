import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";

export interface ChannelRowData {
  id: string;
  name: string;
  slug: string;
  connected: boolean;
  status: "healthy" | "warning" | "error" | "not_connected" | "syncing";
  accountIdentifier?: string;
  catalogCount?: number;
  ordersToday?: number;
  inventoryStatus?: string;
  lastSyncText?: string;
  notConnectedText?: string;
  isAvailableOnly?: boolean;
}

interface MarketplaceHubTableProps {
  channels: ChannelRowData[];
  isCompactMode?: boolean;
  selectedChannelId?: string | null;
  onSelectChannel: (channelId: string) => void;
  onConnectChannel: (channelId: string) => void;
  onDisconnectChannel?: (channelId: string) => void;
  onViewListings?: (channelId: string) => void;
}

export const MarketplaceHubTable: React.FC<MarketplaceHubTableProps> = ({
  channels,
  isCompactMode = false,
  selectedChannelId,
  onSelectChannel,
  onConnectChannel,
  onDisconnectChannel,
  onViewListings,
}) => {
  if (isCompactMode) {
    // 2-Column Compact Table (Screen 18 — Amazon connection details)
    return (
      <div className="w-full border border-[#EAEAEA] rounded-xl overflow-hidden bg-white">
        <div className="grid grid-cols-2 px-6 py-3 bg-white border-b border-[#EAEAEA] text-[12px] font-normal text-[#666666]">
          <div>Channel</div>
          <div className="text-right">Connection health</div>
        </div>

        <div className="divide-y divide-[#EAEAEA]">
          {channels.map((ch) => {
            const isSelected = selectedChannelId === ch.id;
            const isWarning = ch.status === "warning";
            const isSyncing = ch.status === "syncing";

            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelectChannel(ch.id)}
                className={cn(
                  "w-full grid grid-cols-2 px-6 py-4 items-center text-left transition-colors cursor-pointer",
                  isSelected
                    ? "bg-[#FAFAFA]"
                    : "hover:bg-[#FAFAFA]",
                )}
              >
                <div className="space-y-0.5">
                  <div className="text-[14px] font-semibold text-black">
                    {ch.name}
                  </div>
                  <div className="text-[12px] text-[#666666]">
                    {ch.connected
                      ? `${ch.catalogCount ?? 0} products · Connected`
                      : ch.isAvailableOnly
                        ? "Available"
                        : "Not connected"}
                  </div>
                </div>

                <div className="flex items-center justify-end text-[13px]">
                  {isSyncing ? (
                    <span className="flex items-center gap-1.5 text-blue-600 font-medium">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                      Syncing
                    </span>
                  ) : ch.connected && isWarning ? (
                    <span className="font-semibold text-black flex items-center gap-1">
                      <span>!</span>
                      <span>Needs attention</span>
                    </span>
                  ) : ch.connected ? (
                    <span className="flex items-center gap-1.5 text-black font-normal">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#666666]" />
                      Healthy
                    </span>
                  ) : ch.isAvailableOnly ? (
                    <span className="flex items-center gap-1.5 text-[#666666]">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#8C8C8C]" />
                      Available
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[#666666]">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#8C8C8C]" />
                      Not connected
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // 7-Column Full Table (Screen 18 — Marketplace hub & Screen 18 — Channel row actions)
  return (
    <div className="w-full border border-[#EAEAEA] rounded-xl overflow-hidden bg-white">
      {/* Table Header */}
      <div className="grid grid-cols-12 px-6 py-3 bg-white border-b border-[#EAEAEA] text-[11px] font-medium text-[#737373]">
        <div className="col-span-3">Channel</div>
        <div className="col-span-1">Connection</div>
        <div className="col-span-2">Catalog</div>
        <div className="col-span-1">Orders</div>
        <div className="col-span-1">Inventory</div>
        <div className="col-span-2">Sync</div>
        <div className="col-span-2 text-right">Actions</div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-[#EAEAEA]">
        {channels.map((ch) => {
          const isSelected = selectedChannelId === ch.id;
          const isWarning = ch.status === "warning";
          const isSyncing = ch.status === "syncing";

          // For Not connected / Available rows
          if (!ch.connected) {
            return (
              <div
                key={ch.id}
                className="grid grid-cols-12 px-6 py-4 items-center hover:bg-[#FAFAFA] transition-colors"
              >
                <div className="col-span-3">
                  <div className="text-[13px] font-semibold text-[#121212]">
                    {ch.name}
                  </div>
                  <div className="text-[11px] text-[#737373] mt-0.5">
                    {ch.isAvailableOnly ? "Available" : "Not connected"}
                  </div>
                </div>

                <div className="col-span-7 text-[12px] text-[#737373]">
                  {ch.notConnectedText ||
                    (ch.isAvailableOnly
                      ? "Connect supported social commerce channels where available. Availability depends on APIs and commercial permissions."
                      : "Connect this channel to bring its catalog, inventory and orders into your workspace.")}
                </div>

                <div className="col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onConnectChannel(ch.id)}
                    className="h-8 px-4 rounded-lg border border-[#BDBDBD] text-[12px] font-medium text-[#121212] hover:bg-neutral-100 transition-colors cursor-pointer"
                  >
                    {ch.isAvailableOnly ? "Explore" : "Connect"}
                  </button>
                </div>
              </div>
            );
          }

          // Connected rows
          return (
            <div
              key={ch.id}
              onClick={() => onSelectChannel(ch.id)}
              className={cn(
                "grid grid-cols-12 px-6 py-4 items-center transition-colors cursor-pointer group",
                isSelected ? "bg-[#F9F9F9]" : "hover:bg-[#FAFAFA]",
              )}
            >
              {/* Channel Name */}
              <div className="col-span-3">
                <div className="text-[13px] font-semibold text-[#121212]">
                  {ch.name}
                </div>
              </div>

              {/* Connection Status */}
              <div className="col-span-1 text-[12px] text-[#121212]">
                Connected
              </div>

              {/* Catalog */}
              <div className="col-span-2 text-[12px] text-[#121212]">
                {ch.catalogCount} products
              </div>

              {/* Orders */}
              <div className="col-span-1 text-[12px] text-[#121212]">
                {ch.ordersToday} today
              </div>

              {/* Inventory */}
              <div className="col-span-1 text-[12px] text-[#121212]">
                {ch.inventoryStatus ?? "Synced"}
              </div>

              {/* Sync Status */}
              <div className="col-span-2 text-[12px]">
                {isSyncing ? (
                  <span className="flex items-center gap-1.5 text-blue-600 font-medium">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                    Syncing
                  </span>
                ) : isWarning ? (
                  <span className="text-amber-600 font-medium">
                    ! Needs attention{" "}
                    <span className="text-[#737373] font-normal">
                      · {ch.lastSyncText ?? "18 min ago"}
                    </span>
                  </span>
                ) : (
                  <span className="text-emerald-700 font-medium">
                    ✓ Healthy{" "}
                    <span className="text-[#737373] font-normal">
                      · {ch.lastSyncText ?? "4 min ago"}
                    </span>
                  </span>
                )}
              </div>

              {/* Actions Column (Manage link + More dropdown matching Screen 18 — Channel row actions) */}
              <div
                className="col-span-2 flex items-center justify-end gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onSelectChannel(ch.id)}
                  className="text-[12px] font-semibold text-black hover:underline cursor-pointer flex items-center gap-0.5"
                >
                  <span>{isWarning ? "Review" : "Manage"}</span>
                  <span>→</span>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="h-6 px-2 rounded border border-[#E5E5E5] text-[11px] font-medium text-black hover:bg-[#F0F0F0] transition-colors cursor-pointer"
                    >
                      More
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-48 bg-white border border-[#EAEAEA] rounded-xl shadow-xl p-1.5 space-y-0.5 z-50 font-['Inter',sans-serif]"
                  >
                    <DropdownMenuItem
                      onClick={() => onSelectChannel(ch.id)}
                      className="px-3 py-2 text-[12px] text-black rounded-lg cursor-pointer hover:bg-[#F5F5F5]"
                    >
                      Connection details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onSelectChannel(ch.id)}
                      className="px-3 py-2 text-[12px] text-black rounded-lg cursor-pointer hover:bg-[#F5F5F5]"
                    >
                      Sync history
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onSelectChannel(ch.id)}
                      className="px-3 py-2 text-[12px] text-black rounded-lg cursor-pointer hover:bg-[#F5F5F5]"
                    >
                      Capabilities
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onViewListings?.(ch.id)}
                      className="px-3 py-2 text-[12px] text-black rounded-lg cursor-pointer hover:bg-[#F5F5F5]"
                    >
                      View affected listings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-[#EAEAEA] my-1" />
                    <DropdownMenuItem
                      onClick={() => onDisconnectChannel?.(ch.id)}
                      className="px-3 py-2 text-[12px] text-red-600 rounded-lg cursor-pointer hover:bg-red-50"
                    >
                      Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
