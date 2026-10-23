import React from "react";
import { Link } from "react-router-dom";
import { X, Check } from "lucide-react";
import type { ChannelConnection } from "@/types/connection";
import { formatDate, formatDateTime } from "@/utils/format";
import { ROUTES } from "@/constants/routes";
import { ago, tokenText, TAG_LABEL, WRITE_REASON } from "@/components/marketplace-hub/accounts/hubFormat";
import { useAccountActions } from "@/components/marketplace-hub/accounts/useAccountActions";
import { STATUS_LABEL, channelStatus } from "./channelRows";

interface ChannelDetailsDrawerProps {
  connection: ChannelConnection | null;
  isOpen: boolean;
  onClose: () => void;
  onViewListings: (channelId: string) => void;
  onViewOrders: (channelId: string) => void;
  onDeleted?: () => void;
}

const ENTITIES = [
  { key: "products", label: "Products" },
  { key: "listings", label: "Listings" },
  { key: "inventory", label: "Inventory" },
  { key: "orders", label: "Orders" },
  { key: "shipping", label: "Order status and tracking" },
] as const;

const ENTITY_STATUS_TEXT = { healthy: "Healthy", warning: "Done with errors", error: "Failed", syncing: "Syncing", idle: "No recent run" } as const;

const detailsPath = (id: string) => `${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${id}`;

export const ChannelDetailsDrawer: React.FC<ChannelDetailsDrawerProps> = ({
  connection,
  isOpen,
  onClose,
  onViewListings,
  onViewOrders,
  onDeleted,
}) => {
  if (!isOpen || !connection || !connection.account) return null;
  return <Drawer connection={connection} onClose={onClose} onViewListings={onViewListings} onViewOrders={onViewOrders} onDeleted={onDeleted} />;
};

function Drawer({ connection, onClose, onViewListings, onViewOrders, onDeleted }: Omit<ChannelDetailsDrawerProps, "isOpen" | "connection"> & { connection: ChannelConnection }) {
  const account = connection.account!;
  const a = useAccountActions(account, onDeleted);
  const status = channelStatus(connection);
  const isSyncing = status === "syncing";
  const token = tokenText(account);
  const frictions = connection.health.frictionPoints;
  const isActive = account.accountStatus === "active" || account.accountStatus === "paused";
  const syncStart = ENTITIES.map((e) => connection.entitySyncStatus?.[e.key]).filter((e) => e?.status === "syncing" && e.at).map((e) => e!.at!).sort()[0];

  return (
    <aside
      aria-label={`${connection.name} details`}
      className="w-full lg:w-[400px] shrink-0 border-t lg:border-t-0 lg:border-l border-[#EAEAEA] pt-6 lg:pt-0 lg:pl-8 space-y-6 flex flex-col justify-between font-['Inter',sans-serif]"
    >
      <div className="space-y-6">
        <div>
          <div className="flex items-start justify-between">
            <h2 className="text-[22px] font-bold text-black tracking-tight leading-tight">{connection.name}</h2>
            <button
              type="button"
              aria-label="Close details"
              onClick={onClose}
              className="p-1 -mr-1 rounded-md text-[#666666] hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[13px] text-[#666666] mt-0.5">
            {account.connectorName}
            {connection.accountIdentifier ? ` · ${connection.accountIdentifier}` : ""}
            {account.mode === "sandbox" ? " · Sandbox" : ""}
          </p>
        </div>

        {!a.canWrite && (
          <p role="status" className="rounded-lg border border-[#EAEAEA] bg-[#F5F5F5] px-3 py-2 text-[12px] text-[#666666]">
            You have read-only access. {WRITE_REASON}
          </p>
        )}

        {isSyncing ? (
          <div className="space-y-5">
            <div>
              <h3 className="text-[15px] font-semibold text-black">Syncing{connection.syncProgress != null ? ` · ${connection.syncProgress}%` : ""}</h3>
              <p className="text-[13px] text-[#666666] mt-1 leading-relaxed">
                Products, inventory and orders are synchronizing in the background.
                {syncStart ? ` Started ${ago(syncStart)}.` : ""}
              </p>
            </div>

            <div className="space-y-4 pt-1">
              {ENTITIES.filter((e) => e.key !== "shipping" && e.key !== "listings").map(({ key, label }) => {
                const entry = connection.entitySyncStatus?.[key];
                const running = entry?.status === "syncing";
                const done = entry?.status === "healthy" && !running;
                const pct = running ? (entry?.pct ?? 0) : done ? 100 : 0;
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-black font-medium">{label}</span>
                      <span className="font-mono text-black">{pct}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${label} progress`}
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="w-full h-1.5 rounded-full overflow-hidden bg-[#F0F0F0]"
                    >
                      <div className="h-full bg-black rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[11px] text-[#666666]">{running ? "In progress" : done ? "Completed" : entry?.status === "idle" ? "No recent run" : ENTITY_STATUS_TEXT[entry?.status ?? "idle"]}</div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 rounded-xl bg-[#F5F5F5] border border-[#EAEAEA] space-y-1">
              <div className="text-[13px] font-semibold text-black">You can keep working</div>
              <p className="text-[12px] text-[#666666] leading-relaxed">
                Synchronization continues when you leave this panel. Products, orders and inventory remain accessible.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <Link to={detailsPath(connection.id)} className="text-[13px] font-semibold text-black hover:underline flex items-center gap-1">
                <span>View sync history</span>
                <span>→</span>
              </Link>
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
          <div className="space-y-6">
            <div className="space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-[#666666]">Account</span>
                <span className="font-medium text-black">{connection.accountIdentifier}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#666666]">Connected</span>
                <span className="text-black">{connection.connectedAt ? formatDate(connection.connectedAt) : "Not connected"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#666666]">Health</span>
                <span
                  className={`flex items-center gap-1 font-normal ${
                    status === "healthy" ? "text-black" : status === "warning" || status === "paused" ? "text-amber-600" : "text-red-600"
                  }`}
                >
                  {status === "healthy" ? <Check className="w-3.5 h-3.5 stroke-[2.2]" /> : <span className="w-3.5 h-3.5 inline-flex items-center justify-center text-[10px] font-bold">!</span>}
                  {STATUS_LABEL[status]}
                  {isActive ? ` · ${connection.health.pulseScore}%` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#666666]">Last successful sync</span>
                <span className="text-black">{connection.lastSyncAt && connection.lastSyncAt !== "Never" ? ago(connection.lastSyncAt) : "Never"}</span>
              </div>
              {connection.nextSyncAt && isActive && (
                <div className="flex items-center justify-between">
                  <span className="text-[#666666]">Next scheduled sync</span>
                  <span className="text-black">{new Date(connection.nextSyncAt).getTime() > Date.now() ? formatDateTime(connection.nextSyncAt) : "Due now"}</span>
                </div>
              )}
              {connection.health.rateLimitRemainingPct !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-[#666666]">Request allowance free</span>
                  <span className="text-black">{connection.health.rateLimitRemainingPct}%</span>
                </div>
              )}
              {token && (
                <div className="flex items-center justify-between">
                  <span className="text-[#666666]">Access token</span>
                  <span className={token.tone === "bad" ? "font-medium text-red-600" : token.tone === "warn" ? "font-medium text-amber-600" : "text-black"}>{token.text}</span>
                </div>
              )}
            </div>

            {frictions.length > 0 && (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[12px] text-amber-900 space-y-1">
                <div className="font-semibold">Needs attention</div>
                <ul className="list-disc list-inside space-y-0.5 text-[12px] text-amber-800">
                  {frictions.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2 pt-1 border-t border-[#EAEAEA]">
              <div className="text-[13px] font-semibold text-black">Enabled capabilities</div>
              {account.capabilityTags.length > 0 ? (
                <div className="text-[13px] text-black flex flex-wrap gap-x-3 gap-y-1">
                  {account.capabilityTags.map((cap) => (
                    <span key={cap}>✓ {TAG_LABEL[cap] ?? cap}</span>
                  ))}
                </div>
              ) : (
                <div className="text-[12px] text-[#666666]">This connector has no enabled capabilities yet.</div>
              )}
              <Link to={detailsPath(connection.id)} className="text-[12px] font-semibold text-black hover:underline flex items-center gap-1 pt-0.5">
                <span>View capabilities</span>
                <span>→</span>
              </Link>
            </div>

            <div className="space-y-2.5 pt-1 border-t border-[#EAEAEA]">
              <div className="text-[13px] font-semibold text-black">Synchronization</div>
              <div className="space-y-1.5 text-[13px]">
                {ENTITIES.map(({ key, label }) => {
                  const entry = connection.entitySyncStatus?.[key];
                  const st = entry?.status ?? "idle";
                  return (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <span className="text-black">{label}</span>
                      <span
                        className={`text-[12px] flex items-center gap-1 ${
                          st === "healthy" ? "text-[#444444]" : st === "warning" ? "text-amber-600" : st === "error" ? "text-red-600" : st === "syncing" ? "text-blue-600" : "text-[#737373]"
                        }`}
                      >
                        {st === "healthy" && <Check className="w-3.5 h-3.5 stroke-[2.2]" />}
                        {ENTITY_STATUS_TEXT[st]}
                        {entry?.at ? ` · ${ago(entry.at)}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5 pt-1 border-t border-[#EAEAEA]">
              <div className="text-[13px] font-semibold text-black">Recent activity</div>
              <div className="space-y-2 text-[13px]">
                {(connection.activityHistory ?? []).length === 0 && <div className="text-[12px] text-[#666666]">No sync runs yet.</div>}
                {(connection.activityHistory ?? []).map((act) => (
                  <div key={act.id} className="space-y-0.5">
                    <div className="text-[11px] text-[#666666]">{act.timeText}</div>
                    <div className="text-[13px] text-black">{act.title}</div>
                  </div>
                ))}
              </div>
              <Link to={detailsPath(connection.id)} className="text-[12px] font-semibold text-black hover:underline flex items-center gap-1 pt-1">
                <span>View sync history</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        )}
      </div>

      {!isSyncing && (
        <div className="space-y-3 pt-6 border-t border-[#EAEAEA]">
          <div className="grid grid-cols-2 gap-3">
            <span title={a.syncReason ?? undefined} className="contents">
              <button
                type="button"
                disabled={Boolean(a.syncReason) || a.syncing}
                onClick={a.startSync}
                className="h-10 px-4 rounded-lg bg-black text-white text-[13px] font-semibold hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sync now
              </button>
            </span>
            <span title={a.testReason ?? undefined} className="contents">
              <button
                type="button"
                disabled={Boolean(a.testReason) || a.testing}
                onClick={a.runTest}
                className="h-10 px-4 rounded-lg border border-[#BDBDBD] text-[13px] font-semibold text-black hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Test connection
              </button>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-black pt-1">
            <button type="button" onClick={() => onViewListings(connection.id)} className="hover:underline cursor-pointer">
              View listings
            </button>
            <button type="button" onClick={() => onViewOrders(connection.id)} className="hover:underline cursor-pointer">
              View orders
            </button>
            <Link to={ROUTES.INVENTORY} className="hover:underline">
              View inventory
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] pt-1">
            {account.accountStatus === "active" || account.accountStatus === "paused" ? (
              <button type="button" disabled={!a.canWrite || a.pausing} onClick={a.togglePause} className="text-black hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {account.accountStatus === "paused" ? "Resume syncing" : "Pause syncing"}
              </button>
            ) : (
              <button type="button" disabled={!a.canWrite} onClick={() => a.openDialog("reconnect")} className="text-black hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                Reconnect
              </button>
            )}
            <button type="button" disabled={!a.canWrite} onClick={() => a.openDialog("rename")} className="text-black hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              Rename
            </button>
            {a.hasCredentials && (
              <button type="button" disabled={!a.canWrite} onClick={() => a.openDialog("disconnect")} className="text-[#737373] hover:text-red-600 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ml-auto">
                Disconnect
              </button>
            )}
            {account.accountStatus !== "active" && (
              <button type="button" disabled={!a.canWrite} onClick={() => a.openDialog("delete")} className="text-[#737373] hover:text-red-600 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ml-auto">
                Delete account
              </button>
            )}
          </div>

          <Link to={detailsPath(connection.id)} className="text-[13px] text-[#666666] hover:text-black hover:underline flex items-center gap-1">
            <span>Connection settings</span>
            <span>→</span>
          </Link>
        </div>
      )}
      {a.dialogs}
    </aside>
  );
}
