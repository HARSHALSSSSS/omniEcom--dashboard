import { useNavigate } from "react-router-dom";
import { X, ArrowRight } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import type { ChannelConnection } from "@/types/connection";
import type { HubAtRisk, HubLane, HubSyncJob } from "@/types/hub";
import { WRITE_REASON, ago } from "@/components/marketplace-hub/accounts/hubFormat";
import { useAccountActions } from "@/components/marketplace-hub/accounts/useAccountActions";
import { JobsTable } from "@/components/marketplace-hub/detail/JobsTable";
import { connState, isFailed, laneLevel, needsReconnect, recoverySteps, riskOf } from "./healthModel";

interface ConnectionRecoveryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  connection: ChannelConnection | null;
  jobs: HubSyncJob[];
  lanes?: HubLane[];
  atRisk?: HubAtRisk;
}

const LANE_AREA: Record<string, string> = { orders: "Orders", inventory: "Inventory", listings: "Products and listings", prices: "Prices", returns: "Returns", tracking: "Order status and tracking" };

export function ConnectionRecoveryDrawer({ isOpen, onClose, connection, jobs, lanes, atRisk }: ConnectionRecoveryDrawerProps) {
  if (!isOpen || !connection?.account) return null;
  return <Drawer connection={connection} onClose={onClose} jobs={jobs} lanes={lanes} atRisk={atRisk} />;
}

function Drawer({ connection, onClose, jobs, lanes, atRisk }: Omit<ConnectionRecoveryDrawerProps, "isOpen" | "connection"> & { connection: ChannelConnection }) {
  const navigate = useNavigate();
  const account = connection.account!;
  const a = useAccountActions(account, onClose);
  const st = connState(connection);
  const isCritical = st === "critical";
  const reconnect = needsReconnect(connection);
  const steps = recoverySteps(connection, jobs);
  const risk = riskOf(atRisk, connection.id);
  const frictions = connection.health.frictionPoints;
  const affectedAreas = (lanes ?? []).filter((l) => ["warning", "error"].includes(laneLevel(l))).map((l) => LANE_AREA[l.key] ?? l.label);
  const mine = jobs.filter((j) => j.marketplaceAccountId === connection.id);
  const problemJobs = mine.filter((j) => isFailed(j) || j.status === "partially_failed").slice(0, 5);
  const lastSync = connection.lastSyncAt && connection.lastSyncAt !== "Never" ? ago(connection.lastSyncAt) : "never";
  const impact = risk
    ? [risk.staleStockListings > 0 && `${risk.staleStockListings} listing${risk.staleStockListings === 1 ? "" : "s"} with stock waiting to reach the marketplace`, risk.problemListings > 0 && `${risk.problemListings} listing${risk.problemListings === 1 ? "" : "s"} rejected or needing correction`, risk.openOrders > 0 && `${risk.openOrders} open order${risk.openOrders === 1 ? "" : "s"}`].filter(Boolean)
    : [];

  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  const primary = () => (reconnect ? a.openDialog("reconnect") : a.startSync());
  const primaryDisabled = reconnect ? !a.canWrite : Boolean(a.syncReason) || a.syncing;
  const primaryTitle = (reconnect ? (a.canWrite ? null : WRITE_REASON) : a.syncReason) ?? undefined;
  const primaryLabel = reconnect ? "Reconnect" : "Retry sync";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity animate-in fade-in duration-200" onClick={onClose} />

      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[490px] flex-col border-l border-[#E5E5E5] bg-[#FFFFFF] shadow-2xl transition-transform animate-in slide-in-from-right duration-200" aria-label={`${connection.name} recovery details`}>
        <div className="flex items-start justify-between border-b border-[#F0F0F0] px-6 py-5">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${isCritical ? "text-[#DC2626]" : st === "attention" ? "text-[#D97706]" : "text-[#16A34A]"}`}>
              <span className={`h-2 w-2 rounded-full ${isCritical ? "bg-[#DC2626]" : st === "attention" ? "bg-[#D97706]" : "bg-[#16A34A]"}`} />
              {connection.name} · {isCritical ? "Critical" : st === "attention" ? "Attention" : st === "paused" ? "Paused" : "Healthy"}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close drawer" className="flex h-8 w-8 items-center justify-center rounded-lg text-[#737373] hover:bg-[#F5F5F5] hover:text-[#111111] transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 text-[#111111]">
          <div className="space-y-1.5">
            <h2 className="text-[20px] font-bold tracking-tight text-[#111111]">{frictions[0] ?? (isCritical ? "Connection unavailable" : "Needs attention")}</h2>
            <p className="text-[12px] text-[#737373]">Last successful sync: {lastSync}</p>
            <div className="pt-1">
              <span className="text-[12px] font-semibold text-[#111111]">{affectedAreas.length > 0 ? `Affected: ${affectedAreas.join(" · ")}` : reconnect ? "Affected: every stream of this account" : "No stream reports a failure in the last 24 hours"}</span>
            </div>
          </div>

          <div className="space-y-1.5 border-t border-[#F0F0F0] pt-4 text-[12px]">
            <h3 className="font-semibold text-[#111111]">What happened</h3>
            {frictions.length > 0 ? (
              <ul className="list-disc list-inside text-[#525252] leading-relaxed">
                {frictions.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[#525252]">The health score of this connection is below healthy, but no single cause was reported.</p>
            )}
          </div>

          <div className="space-y-1.5 border-t border-[#F0F0F0] pt-4 text-[12px]">
            <h3 className="font-semibold text-[#111111]">Business impact</h3>
            <p className="text-[#525252] leading-relaxed">{impact.length > 0 ? `At risk: ${impact.join(" · ")}.` : "No listing or order is currently counted as at risk."}</p>
          </div>

          <div className="space-y-1.5 border-t border-[#F0F0F0] pt-4 text-[12px]">
            <h3 className="font-semibold text-[#111111]">Recommended action</h3>
            <p className="text-[#525252] leading-relaxed">{reconnect ? `Reconnect ${connection.name}: its authorization is no longer active.` : "Retry the synchronization; if it fails again, read the run log below."}</p>
          </div>

          <div className="pt-2 space-y-2">
            <span title={primaryTitle} className="block">
              <button type="button" disabled={primaryDisabled} onClick={primary} className="w-full h-10 rounded-lg bg-[#000000] text-[13px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors shadow-none disabled:opacity-50">
                {primaryLabel}
              </button>
            </span>
            <button type="button" onClick={() => go(`${ROUTES.LISTINGS}?account=${connection.id}`)} className="w-full h-10 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[13px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors">
              View affected listings
            </button>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-[12px]">
              <button type="button" disabled={Boolean(a.testReason) || a.testing} title={a.testReason ?? undefined} onClick={a.runTest} className="font-medium text-[#111111] hover:underline disabled:opacity-50">
                Test connection
              </button>
              {(account.accountStatus === "active" || account.accountStatus === "paused") && (
                <button type="button" disabled={!a.canWrite || a.pausing} title={a.canWrite ? undefined : WRITE_REASON} onClick={a.togglePause} className="font-medium text-[#111111] hover:underline disabled:opacity-50">
                  {account.accountStatus === "paused" ? "Resume syncing" : "Pause syncing"}
                </button>
              )}
              <button type="button" disabled={!a.canWrite} title={a.canWrite ? undefined : WRITE_REASON} onClick={() => a.openDialog("rename")} className="font-medium text-[#111111] hover:underline disabled:opacity-50">
                Rename
              </button>
              {a.hasCredentials && (
                <button type="button" disabled={!a.canWrite} title={a.canWrite ? undefined : WRITE_REASON} onClick={() => a.openDialog("disconnect")} className="font-medium text-[#737373] hover:text-red-600 hover:underline disabled:opacity-50">
                  Disconnect
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-[#F0F0F0] pt-6 space-y-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#737373]">Recovery pathway</h3>
            <div className="flex items-center justify-between text-[11px] pt-1" aria-label="Recovery pathway">
              {[
                { label: "Detected", done: steps.detected },
                { label: "Diagnosed", done: steps.diagnosed },
                { label: reconnect ? "Reconnect" : "Retry", done: false, active: steps.retrying },
                { label: "Verified", done: steps.verified },
                { label: "Healthy", done: steps.healthy },
              ].map((step, i, all) => (
                <div key={step.label} className="contents">
                  <div className="flex flex-col items-center gap-1.5">
                    {step.done ? <span className="text-[#16A34A] font-bold">✓</span> : step.active ? <span className="h-3 w-3 rounded-full border-2 border-[#1D4ED8] bg-white inline-block" /> : <span className="h-2 w-2 rounded-full bg-[#E5E5E5] inline-block" />}
                    <span className={step.done || step.active ? "text-[#111111] font-semibold" : "text-[#8A8A8A]"}>{step.label}</span>
                  </div>
                  {i < all.length - 1 && <div className={`h-[1px] flex-1 mx-2 ${step.done ? "bg-[#16A34A]" : "bg-[#E5E5E5]"}`} />}
                </div>
              ))}
            </div>
          </div>

          {problemJobs.length > 0 && (
            <div className="border-t border-[#F0F0F0] pt-5 space-y-2">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#737373]">Failed runs of the last 24 hours</h3>
              <JobsTable jobs={problemJobs} />
            </div>
          )}

          <div className="border-t border-[#F0F0F0] pt-5 text-[12px]">
            <button type="button" onClick={() => go(`${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${connection.id}`)} className="font-semibold text-[#111111] hover:underline flex items-center gap-1">
              Open the connection in depth <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>
      {a.dialogs}
    </>
  );
}
