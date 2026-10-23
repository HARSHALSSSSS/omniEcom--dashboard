import React from "react";
import { X, Check } from "lucide-react";
import { ChannelConnection } from "@/types/connection";

function formatSyncAgo(isoString?: string): string {
  if (!isoString || isoString === "Never") return "Never synced";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 0 || isNaN(diffMs)) return "Just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

interface ChannelDetailsDrawerProps {
  connection: ChannelConnection | null;
  isOpen: boolean;
  onClose: () => void;
  isSyncing: boolean;
  onTriggerSync: (channelId: string) => void;
  onViewListings: (channelId: string) => void;
  onDisconnect: (channelId: string) => void;
}

export const ChannelDetailsDrawer: React.FC<ChannelDetailsDrawerProps> = ({
  connection,
  isOpen,
  onClose,
  isSyncing,
  onTriggerSync,
  onViewListings,
  onDisconnect,
}) => {
  if (!isOpen || !connection) return null;

  return (
    <aside className="w-full lg:w-[400px] shrink-0 border-t lg:border-t-0 lg:border-l border-[#EAEAEA] pt-6 lg:pt-0 lg:pl-8 space-y-6 flex flex-col justify-between font-['Inter',sans-serif]">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between">
            <h2 className="text-[22px] font-bold text-black tracking-tight leading-tight">
              {connection.name}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 -mr-1 rounded-md text-[#666666] hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[13px] text-[#666666] mt-0.5">
            {isSyncing
              ? `Connected · ${connection.accountIdentifier}`
              : "Connected"}
          </p>
        </div>

        {/* Syncing Progress View (Screen 18 — Background synchronization) */}
        {isSyncing ? (
          <div className="space-y-5">
            <div>
              <h3 className="text-[15px] font-semibold text-black">
                Syncing
              </h3>
              <p className="text-[13px] text-[#666666] mt-1 leading-relaxed">
                Products, inventory and orders are synchronizing in the background.
                {connection.lastSyncAt && connection.lastSyncAt !== "Never"
                  ? ` Started ${formatSyncAgo(connection.lastSyncAt)}`
                  : " Started just now"}
              </p>
            </div>

            {/* Progress Bars */}
            <div className="space-y-4 pt-1">
              {([
                { key: "products", label: "Products" },
                { key: "inventory", label: "Inventory" },
                { key: "orders", label: "Orders" },
              ] as const).map(({ key, label }) => {
                const entry = connection.entitySyncStatus?.[key];
                const pct = entry?.pct != null ? Math.round(entry.pct) : null;
                const isDone = pct === 100 || entry?.status === "healthy";
                const isSyncingEntry = entry?.status === "syncing" || (pct != null && pct < 100);
                const displayPct = pct ?? (isDone ? 100 : 0);
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-black font-medium">{label}</span>
                      <span className="font-mono text-black">{displayPct}%</span>
                    </div>
                    <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDone ? "bg-black" : "bg-[#F0F0F0]"}`}>
                      <div
                        className="h-full bg-black rounded-full transition-all duration-500"
                        style={{ width: `${displayPct}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-[#666666]">
                      {isDone ? "Completed" : isSyncingEntry ? "In progress" : "Queued"}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reassurance Callout Card */}
            <div className="p-4 rounded-xl bg-[#F5F5F5] border border-[#EAEAEA] space-y-1">
              <div className="text-[13px] font-semibold text-black">
                You can keep working
              </div>
              <p className="text-[12px] text-[#666666] leading-relaxed">
                Synchronization continues when you leave this panel. Products,
                orders and inventory remain accessible.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <button
                type="button"
                className="text-[13px] font-semibold text-black hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>View sync history</span>
                <span>→</span>
              </button>

              <button
                type="button"
                onClick={() => onViewListings(connection.id)}
                className="w-full h-10 rounded-lg border border-[#BDBDBD] text-[13px] font-semibold text-black hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                View listings
              </button>
            </div>
          </div>
        ) : (
          /* Normal Details View (Screen 18 — Amazon connection details) */
          <div className="space-y-6">
            {/* Meta Grid */}
            <div className="space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-[#666666]">Account</span>
                <span className="font-medium text-black">
                  {connection.accountIdentifier}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#666666]">Connected</span>
                <span className="text-black">
                  {connection.connectedAt
                    ? new Date(connection.connectedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Jan 18, 2026"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#666666]">Health</span>
                <span className={`flex items-center gap-1 font-normal ${
                  connection.status === "healthy" ? "text-black" :
                  connection.status === "warning" ? "text-amber-600" : "text-red-600"
                }`}>
                  {connection.status === "healthy" ? (
                    <Check className="w-3.5 h-3.5 stroke-[2.2]" />
                  ) : (
                    <span className="w-3.5 h-3.5 inline-flex items-center justify-center text-[10px] font-bold">!</span>
                  )}
                  {connection.status.charAt(0).toUpperCase() + connection.status.slice(1)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#666666]">Last successful sync</span>
                <span className="text-black">
                  {connection.lastSyncAt && connection.lastSyncAt !== "Never"
                    ? formatSyncAgo(connection.lastSyncAt)
                    : "Never"}
                </span>
              </div>
            </div>

            {/* Enabled capabilities */}
            <div className="space-y-2 pt-1 border-t border-[#EAEAEA]">
              <div className="text-[13px] font-semibold text-black">
                Enabled capabilities
              </div>
              <div className="text-[13px] text-black flex flex-wrap gap-x-3 gap-y-1">
                {(connection.capabilities && connection.capabilities.length > 0
                  ? connection.capabilities
                  : ["product_import", "listings", "inventory", "orders", "shipping"]
                ).map((cap) => (
                  <span key={cap}>✓ {cap.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                ))}
              </div>
              <div className="text-[11px] text-[#666666] pt-0.5">
                Returns · Reviews · Promotions are connector-dependent.
              </div>
              <button
                type="button"
                className="text-[12px] font-semibold text-black hover:underline flex items-center gap-1 cursor-pointer pt-0.5"
              >
                <span>View capabilities</span>
                <span>→</span>
              </button>
              <div className="text-[11px] text-[#737373]">
                Supported / Limited / Depends / Not available
              </div>
            </div>

            {/* Synchronization */}
            <div className="space-y-2.5 pt-1 border-t border-[#EAEAEA]">
              <div className="text-[13px] font-semibold text-black">
                Synchronization
              </div>
              <div className="space-y-1.5 text-[13px]">
                {(["products", "listings", "inventory", "orders", "shipping"] as const).map(
                  (entity) => {
                    const syncEntry = connection.entitySyncStatus?.[entity];
                    const status = syncEntry?.status ?? "healthy";
                    const timestamp = syncEntry?.timestamp ?? formatSyncAgo(connection.lastSyncAt);
                    return (
                      <div key={entity} className="flex items-center justify-between">
                        <span className="text-black capitalize">{entity}</span>
                        <span className={`text-[12px] flex items-center gap-1 ${
                          status === "healthy" ? "text-[#444444]" :
                          status === "warning" ? "text-amber-600" :
                          status === "error" ? "text-red-600" : "text-blue-600"
                        }`}>
                          {status === "healthy" ? (
                            <Check className="w-3.5 h-3.5 stroke-[2.2]" />
                          ) : (
                            <span className="font-bold text-[10px]">!</span>
                          )}
                          {status.charAt(0).toUpperCase() + status.slice(1)} · {timestamp}
                        </span>
                      </div>
                    );
                  }
                )}
              </div>
            </div>

            {/* Recent activity timeline */}
            <div className="space-y-2.5 pt-1 border-t border-[#EAEAEA]">
              <div className="text-[13px] font-semibold text-black">
                Recent activity
              </div>
              <div className="space-y-2 text-[13px]">
                {(
                  connection.activityHistory && connection.activityHistory.length > 0
                    ? connection.activityHistory
                    : []
                ).map((act) => (
                  <div key={act.id} className="space-y-0.5">
                    <div className="text-[11px] text-[#666666]">{act.timeText}</div>
                    <div className="text-[13px] text-black">{act.title}</div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="text-[12px] font-semibold text-black hover:underline flex items-center gap-1 cursor-pointer pt-1"
              >
                <span>View sync history</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions (Screen 18 — Amazon connection details) */}
      {!isSyncing && (
        <div className="space-y-3 pt-6 border-t border-[#EAEAEA]">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onTriggerSync(connection.id)}
              className="h-10 px-4 rounded-lg bg-black text-white text-[13px] font-semibold hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Sync now
            </button>
            <button
              type="button"
              onClick={() => onViewListings(connection.id)}
              className="h-10 px-4 rounded-lg border border-[#BDBDBD] text-[13px] font-semibold text-black hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              View listings
            </button>
          </div>

          <div className="flex items-center gap-4 text-[13px] text-black pt-1">
            <button
              type="button"
              className="hover:underline cursor-pointer"
            >
              View orders
            </button>
            <button
              type="button"
              className="hover:underline cursor-pointer"
            >
              View inventory
            </button>
            <button
              type="button"
              onClick={() => onDisconnect(connection.id)}
              className="text-[#737373] hover:text-red-600 hover:underline cursor-pointer ml-auto"
            >
              Disconnect
            </button>
          </div>

          <div className="pt-0.5">
            <button
              type="button"
              className="text-[13px] text-[#666666] hover:text-black hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>Connection settings</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
