import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { ago, WRITE_REASON } from "@/components/marketplace-hub/accounts/hubFormat";
import { useAccountActions } from "@/components/marketplace-hub/accounts/useAccountActions";
import { STATUS_LABEL, listingsText, needsAttention, type ChannelRowData } from "./channelRows";

export type { ChannelRowData } from "./channelRows";

interface MarketplaceHubTableProps {
  channels: ChannelRowData[];
  isCompactMode?: boolean;
  selectedChannelId?: string | null;
  onSelectChannel: (channelId: string) => void;
  onConnectChannel: (channelId: string) => void;
  onViewListings?: (channelId: string) => void;
  onViewOrders?: (channelId: string) => void;
  onOpenDetails?: (channelId: string) => void;
}

const statusTone = (s: ChannelRowData["status"]) =>
  s === "healthy" ? "text-emerald-700" : s === "syncing" ? "text-blue-600" : needsAttention(s) ? "text-amber-600" : "text-[#737373]";

function SyncCell({ ch }: { ch: ChannelRowData }) {
  return (
    <span className={cn("font-medium", statusTone(ch.status))}>
      {ch.status === "syncing" && <span className="mr-1.5 inline-block w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse align-middle" />}
      {STATUS_LABEL[ch.status]}
      {ch.status === "syncing" && ch.syncProgress != null ? ` ${ch.syncProgress}%` : ""}{" "}
      <span className="text-[#737373] font-normal">· {ch.lastSyncAt ? ago(ch.lastSyncAt) : "never synced"}</span>
    </span>
  );
}

interface RowProps {
  ch: ChannelRowData;
  isSelected: boolean;
  onSelectChannel: (id: string) => void;
  onViewListings?: (id: string) => void;
  onViewOrders?: (id: string) => void;
  onOpenDetails?: (id: string) => void;
}

/** A connected account row; it owns the account actions so every row has its own dialogs. */
function ConnectedRow({ ch, isSelected, onSelectChannel, onViewListings, onViewOrders, onOpenDetails }: RowProps) {
  const account = ch.account!;
  const a = useAccountActions(account);
  const attention = needsAttention(ch.status);
  const isActive = account.accountStatus === "active" || account.accountStatus === "paused";
  const item = "px-3 py-2 text-[12px] rounded-lg cursor-pointer hover:bg-[#F5F5F5]";
  const danger = "px-3 py-2 text-[12px] text-red-600 rounded-lg cursor-pointer hover:bg-red-50";

  return (
    <div
      onClick={() => onSelectChannel(ch.id)}
      className={cn(
        "grid grid-cols-12 px-6 py-4 items-center transition-colors cursor-pointer group",
        isSelected ? "bg-[#F9F9F9]" : "hover:bg-[#FAFAFA]",
      )}
    >
      <div className="col-span-3 min-w-0 pr-2">
        <div className="text-[13px] font-semibold text-[#121212] truncate">{ch.name}</div>
        <div className="text-[11px] text-[#737373] truncate">
          {account.connectorName}
          {ch.accountIdentifier ? ` · ${ch.accountIdentifier}` : ""}
          {account.mode === "sandbox" ? " · Sandbox" : ""}
        </div>
      </div>

      <div className="col-span-1 text-[12px] text-[#121212]">
        {ch.status === "disconnected" ? "Disconnected" : ch.status === "paused" ? "Paused" : "Connected"}
      </div>
      <div className="col-span-2 text-[12px] text-[#121212]">{listingsText(ch.listings ?? 0)}</div>
      <div className="col-span-1 text-[12px] text-[#121212]">{formatNumber(ch.openOrders ?? 0)} open</div>
      <div className="col-span-1 text-[12px] text-[#121212]">{formatNumber(ch.stockSynced ?? 0)} synced</div>
      <div className="col-span-2 text-[12px]">
        <SyncCell ch={ch} />
      </div>

      <div className="col-span-2 flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onSelectChannel(ch.id)}
          className="text-[12px] font-semibold text-black hover:underline cursor-pointer flex items-center gap-0.5 py-1 sm:py-0"
        >
          <span>{attention ? "Review" : "Manage"}</span>
          <span>→</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More actions for ${ch.name}`}
              className="h-7 sm:h-6 px-2.5 sm:px-2 rounded border border-[#E5E5E5] text-[11px] font-medium text-black hover:bg-[#F0F0F0] transition-colors cursor-pointer"
            >
              More
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-52 bg-white border border-[#EAEAEA] rounded-xl shadow-xl p-1.5 space-y-0.5 z-50 font-['Inter',sans-serif]"
          >
            <DropdownMenuItem onSelect={() => onOpenDetails?.(ch.id)} className={item}>
              Sync history and capabilities
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onViewListings?.(ch.id)} className={item}>
              View listings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onViewOrders?.(ch.id)} className={item}>
              View orders
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#EAEAEA] my-1" />
            <DropdownMenuItem disabled={Boolean(a.testReason) || a.testing} onSelect={a.runTest} className={item}>
              Test connection
            </DropdownMenuItem>
            <DropdownMenuItem disabled={Boolean(a.syncReason) || a.syncing} onSelect={a.startSync} className={item}>
              Sync now
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!a.canWrite} onSelect={() => a.openDialog("rename")} className={item}>
              Rename
            </DropdownMenuItem>
            {isActive ? (
              <DropdownMenuItem disabled={!a.canWrite || a.pausing} onSelect={a.togglePause} className={item}>
                {account.accountStatus === "paused" ? "Resume syncing" : "Pause syncing"}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled={!a.canWrite} onSelect={() => a.openDialog("reconnect")} className={item}>
                Reconnect
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-[#EAEAEA] my-1" />
            {a.hasCredentials && (
              <DropdownMenuItem disabled={!a.canWrite} onSelect={() => a.openDialog("disconnect")} className={danger}>
                Disconnect
              </DropdownMenuItem>
            )}
            {account.accountStatus !== "active" && (
              <DropdownMenuItem disabled={!a.canWrite} onSelect={() => a.openDialog("delete")} className={danger}>
                Delete account
              </DropdownMenuItem>
            )}
            {!a.canWrite && <p className="px-3 py-1.5 text-[11px] text-[#737373]">{WRITE_REASON}</p>}
          </DropdownMenuContent>
        </DropdownMenu>
        {a.dialogs}
      </div>
    </div>
  );
}

export const MarketplaceHubTable: React.FC<MarketplaceHubTableProps> = ({
  channels,
  isCompactMode = false,
  selectedChannelId,
  onSelectChannel,
  onConnectChannel,
  onViewListings,
  onViewOrders,
  onOpenDetails,
}) => {
  if (isCompactMode) {
    return (
      <div className="w-full border border-[#EAEAEA] rounded-xl overflow-hidden bg-white">
        <div className="grid grid-cols-2 px-4 sm:px-6 py-3 bg-white border-b border-[#EAEAEA] text-[12px] font-normal text-[#666666]">
          <div>Channel</div>
          <div className="text-right">Connection health</div>
        </div>

        <div className="divide-y divide-[#EAEAEA]">
          {channels.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => (ch.connected ? onSelectChannel(ch.id) : onConnectChannel(ch.id))}
              className={cn(
                "w-full grid grid-cols-2 px-4 sm:px-6 py-4 items-center text-left transition-colors cursor-pointer min-h-[44px]",
                selectedChannelId === ch.id ? "bg-[#FAFAFA]" : "hover:bg-[#FAFAFA]",
              )}
            >
              <div className="space-y-0.5 min-w-0 pr-2">
                <div className="text-[14px] font-semibold text-black truncate">{ch.name}</div>
                <div className="text-[12px] text-[#666666] truncate">
                  {ch.connected ? listingsText(ch.listings ?? 0) : "Not connected"}
                </div>
              </div>
              <div className={cn("flex items-center justify-end gap-1.5 text-[13px] shrink-0", statusTone(ch.status))}>
                {ch.status === "syncing" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />}
                {STATUS_LABEL[ch.status]}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full border border-[#EAEAEA] rounded-xl overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-12 px-6 py-3 bg-white border-b border-[#EAEAEA] text-[11px] font-medium text-[#737373]">
            <div className="col-span-3">Channel</div>
            <div className="col-span-1">Connection</div>
            <div className="col-span-2">Catalog</div>
            <div className="col-span-1">Orders</div>
            <div className="col-span-1">Inventory</div>
            <div className="col-span-2">Sync</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          <div className="divide-y divide-[#EAEAEA]">
            {channels.length === 0 && <div className="px-6 py-10 text-center text-[13px] text-[#737373]">No channels match.</div>}
            {channels.map((ch) =>
              ch.connected && ch.account ? (
                <ConnectedRow
                  key={ch.id}
                  ch={ch}
                  isSelected={selectedChannelId === ch.id}
                  onSelectChannel={onSelectChannel}
                  onViewListings={onViewListings}
                  onViewOrders={onViewOrders}
                  onOpenDetails={onOpenDetails}
                />
              ) : (
                <div key={ch.id} className="grid grid-cols-12 px-6 py-4 items-center hover:bg-[#FAFAFA] transition-colors">
                  <div className="col-span-3">
                    <div className="text-[13px] font-semibold text-[#121212]">{ch.name}</div>
                    <div className="text-[11px] text-[#737373] mt-0.5">Not connected</div>
                  </div>
                  <div className="col-span-7 text-[12px] text-[#737373]">
                    {ch.unavailableReason ?? ch.notConnectedText ?? "Connect this channel to bring its catalog, inventory and orders into your workspace."}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button
                      type="button"
                      disabled={Boolean(ch.unavailableReason)}
                      onClick={() => onConnectChannel(ch.id)}
                      className="h-8 px-4 rounded-lg border border-[#BDBDBD] text-[12px] font-medium text-[#121212] hover:bg-neutral-100 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Connect
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
