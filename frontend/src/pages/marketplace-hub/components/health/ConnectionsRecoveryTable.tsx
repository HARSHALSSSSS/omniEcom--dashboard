import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import type { ChannelConnection } from "@/types/connection";
import type { HubAtRisk, HubLane, HubSyncJob } from "@/types/hub";
import { WRITE_REASON, ago } from "@/components/marketplace-hub/accounts/hubFormat";
import { useAccountActions } from "@/components/marketplace-hub/accounts/useAccountActions";
import { JobsTable } from "@/components/marketplace-hub/detail/JobsTable";
import {
  authLevel,
  connState,
  isActive,
  isFailed,
  jobLabel,
  jobTime,
  jobWord,
  laneLevel,
  laneOf,
  needsReconnect,
  offers,
  recoverySteps,
  riskOf,
  type Level,
} from "./healthModel";

export interface RecoveryFilters {
  tab: string;
  q: string;
  area: string;
  sort: string;
}

interface ConnectionsRecoveryTableProps {
  connections: ChannelConnection[];
  /** account id -> its lanes of the last 24 hours */
  lanesByAccount: Record<string, HubLane[]>;
  atRisk?: HubAtRisk;
  tokenWarnings?: Array<{ accountId: string; expired: boolean }>;
  /** the sync runs of the last 24 hours, newest first */
  recentJobs: HubSyncJob[];
  filters: RecoveryFilters;
  onFilters: (patch: Partial<RecoveryFilters>) => void;
  onOpenRecoveryDrawer: (connection: ChannelConnection) => void;
}

const AREAS = ["Products", "Inventory", "Orders", "Listings", "Authentication"] as const;
const TABS = [
  { id: "all", label: "All" },
  { id: "healthy", label: "Healthy" },
  { id: "syncing", label: "Syncing" },
  { id: "attention", label: "Attention" },
  { id: "critical", label: "Critical" },
];
const SORTS = [
  { id: "attention", label: "Needs attention first" },
  { id: "name", label: "Name" },
  { id: "sync", label: "Last sync" },
];

const mark = (level: Level, offered: boolean) =>
  !offered ? <span className="text-[#A3A3A3] font-normal" title="Not offered by this connector">—</span>
  : level === "healthy" ? <span className="text-[#16A34A]" title="Healthy">✓</span>
  : level === "warning" ? <span className="text-[#D97706]" title="Needs attention">⚠</span>
  : level === "error" ? <span className="text-[#DC2626]" title="Failing">✕</span>
  : <span className="text-[#A3A3A3] font-normal" title="No runs in the last 24 hours">·</span>;

/** the callout of the first connection that needs recovery: its steps are facts, its actions are the real ones */
function RecoveryCallout({ connection, jobs, atRisk, onReview }: { connection: ChannelConnection; jobs: HubSyncJob[]; atRisk?: HubAtRisk; onReview: () => void }) {
  const a = useAccountActions(connection.account!);
  const steps = recoverySteps(connection, jobs);
  const reconnect = needsReconnect(connection);
  const risk = riskOf(atRisk, connection.id);
  const first = connection.health.frictionPoints[0];
  return (
    <div className="rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-5 space-y-4">
      <div className="flex items-center justify-between text-[11px] text-[#737373]" aria-label="Recovery steps">
        <span className={steps.detected ? "text-[#16A34A] font-bold" : ""}>Detected {steps.detected ? "✓" : "○"}</span>
        <span className={steps.diagnosed ? "text-[#16A34A] font-bold" : ""}>Diagnosed {steps.diagnosed ? "✓" : "○"}</span>
        <span className={steps.retrying ? "text-[#1D4ED8] font-bold" : ""}>{reconnect ? "Reconnect" : "Retry"} {steps.retrying ? "●" : "○"}</span>
        <span className={steps.verified ? "text-[#16A34A] font-bold" : ""}>Verified {steps.verified ? "✓" : "○"}</span>
        <span className={steps.healthy ? "text-[#16A34A] font-bold" : ""}>Healthy {steps.healthy ? "✓" : "○"}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
        <div>
          <h4 className="text-[13px] font-bold text-[#111111]">{reconnect ? `Reconnect ${connection.name}` : `Retry ${connection.name} synchronization`}</h4>
          <p className="text-[12px] text-[#525252] mt-0.5">
            {first ?? "The connection needs attention."}
            {risk && risk.staleStockListings + risk.problemListings + risk.openOrders > 0
              ? ` At risk: ${risk.staleStockListings} listings waiting for stock, ${risk.problemListings} rejected listings, ${risk.openOrders} open orders.`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {reconnect ? (
            <button type="button" disabled={!a.canWrite} title={a.canWrite ? undefined : WRITE_REASON} onClick={() => a.openDialog("reconnect")} className="h-8 px-3.5 rounded-lg bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors disabled:opacity-50">
              Reconnect
            </button>
          ) : (
            <button type="button" disabled={Boolean(a.syncReason) || a.syncing} title={a.syncReason ?? undefined} onClick={a.startSync} className="h-8 px-3.5 rounded-lg bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors disabled:opacity-50">
              Retry
            </button>
          )}
          <button type="button" onClick={onReview} className="h-8 px-3.5 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors">
            Review first
          </button>
        </div>
      </div>
      {a.dialogs}
    </div>
  );
}

export function ConnectionsRecoveryTable({ connections, lanesByAccount, atRisk, tokenWarnings = [], recentJobs, filters, onFilters, onOpenRecoveryDrawer }: ConnectionsRecoveryTableProps) {
  const navigate = useNavigate();
  const names = useMemo(() => Object.fromEntries(connections.map((c) => [c.id, c.name])), [connections]);

  const healthyCount = connections.filter((c) => connState(c) === "healthy").length;
  const attentionCount = connections.filter((c) => ["attention", "critical"].includes(connState(c))).length;

  const areaMatches = (c: ChannelConnection, area: string): boolean => {
    const lanes = lanesByAccount[c.id];
    const risk = riskOf(atRisk, c.id);
    const bad = (key: string) => ["warning", "error"].includes(laneLevel(laneOf(lanes, key)));
    if (area === "products") return bad("listings");
    if (area === "inventory") return bad("inventory") || (risk?.staleStockListings ?? 0) > 0;
    if (area === "orders") return bad("orders");
    if (area === "listings") return (risk?.problemListings ?? 0) > 0;
    if (area === "authentication") return authLevel(c, tokenWarnings) !== "healthy";
    return true;
  };

  const rank = (c: ChannelConnection) => ({ critical: 0, attention: 1, paused: 2, healthy: 3 })[connState(c)];
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return connections
      .filter((c) => {
        const st = connState(c);
        if (q && !c.name.toLowerCase().includes(q)) return false;
        if (filters.tab === "healthy" && st !== "healthy") return false;
        if (filters.tab === "syncing" && c.syncState !== "syncing") return false;
        if (filters.tab === "attention" && st !== "attention") return false;
        if (filters.tab === "critical" && st !== "critical") return false;
        if (filters.area !== "all" && !areaMatches(c, filters.area)) return false;
        return true;
      })
      .sort((a, b) => {
        if (filters.sort === "name") return a.name.localeCompare(b.name);
        if (filters.sort === "sync") return new Date(b.lastSyncAt === "Never" ? 0 : b.lastSyncAt).getTime() - new Date(a.lastSyncAt === "Never" ? 0 : a.lastSyncAt).getTime();
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections, filters, lanesByAccount, atRisk]);

  const attentionConn = connections.find((c) => ["critical", "attention"].includes(connState(c)));
  const problemJobs = recentJobs.filter((j) => isFailed(j) || j.status === "partially_failed").slice(0, 5);

  // the timeline: the newest runs of the last 24 hours, oldest to newest
  const timeline = [...recentJobs].slice(0, 6).reverse();
  const lastProblem = recentJobs.find(isFailed);
  const timelineSummary =
    recentJobs.length === 0
      ? "No sync runs in the last 24 hours."
      : lastProblem
        ? `Latest sync failure: ${names[lastProblem.marketplaceAccountId ?? ""] ?? "an account"} ${jobLabel(lastProblem).toLowerCase()} at ${jobTime(lastProblem)}${lastProblem.error ? ` (${lastProblem.error.message})` : ""}.`
        : `${recentJobs.length} sync run${recentJobs.length === 1 ? "" : "s"} in the last 24 hours, none failed.`;

  return (
    <div className="space-y-8 text-[#111111]">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-b border-[#F0F0F0] pb-4">
        <div>
          <h2 className="text-[20px] font-bold text-[#111111]">All connections</h2>
          <p className="text-[12px] text-[#737373] mt-0.5">
            {connections.length} connected · {healthyCount} healthy · {attentionCount} attention
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-6 border-b border-[#E5E5E5] text-[13px] overflow-x-auto">
          {TABS.map((tab) => {
            const isOn = filters.tab === tab.id;
            return (
              <button key={tab.id} type="button" aria-pressed={isOn} onClick={() => onFilters({ tab: tab.id })} className={`pb-3 font-medium transition-colors whitespace-nowrap relative ${isOn ? "text-[#111111] font-semibold" : "text-[#737373] hover:text-[#111111]"}`}>
                {tab.label}
                {isOn && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#000000]" />}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8A8A8A]" />
              <input
                type="text"
                aria-label="Search connections"
                placeholder="Search connections..."
                value={filters.q}
                onChange={(e) => onFilters({ q: e.target.value })}
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] placeholder:text-[#8A8A8A] focus:border-[#000000] focus:outline-none transition-colors"
              />
            </div>
            <select aria-label="Sort connections" value={filters.sort} onChange={(e) => onFilters({ sort: e.target.value })} className="h-9 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] px-2 text-[12px]">
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  Sort: {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto text-[12px]">
            <span className="text-[#737373] font-medium whitespace-nowrap">Affected area:</span>
            {AREAS.map((area) => {
              const key = area.toLowerCase();
              const on = filters.area === key;
              return (
                <button
                  key={area}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onFilters({ area: on ? "all" : key })}
                  className={`h-8 px-2.5 rounded-lg border text-[11px] font-medium transition-colors ${on ? "border-[#000000] bg-[#000000] text-white" : "border-[#D4D4D4] bg-[#FFFFFF] text-[#111111] hover:bg-[#F5F5F5]"}`}
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#EDEDED] bg-[#FFFFFF] overflow-hidden shadow-sm">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b border-[#F0F0F0] bg-[#FAFAFA] text-[11px] font-semibold uppercase tracking-wider text-[#737373]">
            <tr>
              <th className="py-3 px-6">Connector</th>
              <th className="py-3 px-4">Auth</th>
              <th className="py-3 px-4">Catalog</th>
              <th className="py-3 px-4">Inventory</th>
              <th className="py-3 px-4">Orders</th>
              <th className="py-3 px-4">Last sync</th>
              <th className="py-3 px-4">Health</th>
              <th className="py-3 px-6 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[#737373]">
                  No connection matches these filters.
                </td>
              </tr>
            )}
            {filtered.map((conn) => {
              const st = connState(conn);
              const lanes = lanesByAccount[conn.id];
              const border = st === "critical" ? "border-l-4 border-l-[#DC2626]" : st === "attention" ? "border-l-4 border-l-[#D97706]" : st === "paused" ? "border-l-4 border-l-[#8A8A8A]" : "border-l-4 border-l-[#16A34A]";
              const label = st === "critical" ? "Critical" : st === "attention" ? "Attention" : st === "paused" ? "Paused" : "Healthy";
              const color = st === "critical" ? "text-[#DC2626]" : st === "attention" ? "text-[#D97706]" : st === "paused" ? "text-[#737373]" : "text-[#16A34A]";
              return (
                <tr key={conn.id} className={`hover:bg-[#FAFAFA] transition-colors ${border}`}>
                  <td className="py-3.5 px-6">
                    <span className="font-bold text-[#111111] block">{conn.name}</span>
                    <span className="text-[11px] text-[#737373] capitalize">{conn.category}</span>
                  </td>
                  <td className="py-3.5 px-4 font-bold">{mark(authLevel(conn, tokenWarnings), true)}</td>
                  <td className="py-3.5 px-4 font-bold">{mark(laneLevel(laneOf(lanes, "listings")), offers(conn, "product_import") || offers(conn, "listings"))}</td>
                  <td className="py-3.5 px-4 font-bold">{mark(laneLevel(laneOf(lanes, "inventory")), offers(conn, "inventory"))}</td>
                  <td className="py-3.5 px-4 font-bold">{mark(laneLevel(laneOf(lanes, "orders")), offers(conn, "orders"))}</td>
                  <td className="py-3.5 px-4 text-[#525252]">{conn.lastSyncAt && conn.lastSyncAt !== "Never" ? ago(conn.lastSyncAt) : "Never"}</td>
                  <td className={`py-3.5 px-4 font-semibold ${color}`}>
                    {label}
                    {st !== "paused" ? ` · ${conn.health.pulseScore}%` : ""}
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    {st === "attention" || st === "critical" ? (
                      <button type="button" onClick={() => onOpenRecoveryDrawer(conn)} className="font-bold text-[#111111] hover:underline">
                        Review →
                      </button>
                    ) : (
                      <button type="button" onClick={() => navigate(`${ROUTES.MARKETPLACE_HUB}?q=${encodeURIComponent(conn.name)}`)} className="text-[#737373] hover:text-[#111111] hover:underline">
                        Manage →
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="border-t border-[#F0F0F0] px-6 py-3 bg-[#FAFAFA] flex flex-wrap items-center gap-6 text-[11px] text-[#737373]">
          <div className="flex items-center gap-1.5">
            <span className="text-[#16A34A] font-bold">✓</span>
            <span>Healthy capability</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#D97706] font-bold">⚠</span>
            <span>Needs attention</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#DC2626] font-bold">✕</span>
            <span>Failing</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#A3A3A3] font-bold">·</span>
            <span>No runs in 24 h</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#A3A3A3] font-bold">—</span>
            <span>Not offered by this connector</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#111111]">Last 24 hours</h3>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A8A8A]">Connection event timeline</span>
        </div>

        <div className="relative pt-4 pb-2">
          <div className="h-[2px] w-full bg-[#111111]" />
          <div className="flex justify-between items-start pt-3 text-[11px]">
            {timeline.length === 0 && <span className="text-[#737373]">No runs yet.</span>}
            {timeline.map((job) => (
              <div key={job.id} className="flex flex-col items-center">
                <span className="font-semibold text-[#111111]">{jobTime(job)}</span>
                <span className={`h-2 w-2 rounded-full mt-1 ${isFailed(job) ? "bg-[#DC2626]" : isActive(job) ? "bg-[#1D4ED8]" : job.status === "partially_failed" ? "bg-[#D97706]" : "bg-[#16A34A]"}`} />
                <span className={`mt-1 text-center max-w-[110px] truncate ${isFailed(job) ? "text-[#DC2626] font-medium" : "text-[#737373]"}`} title={`${names[job.marketplaceAccountId ?? ""] ?? "Account"} · ${jobLabel(job)} ${jobWord(job)}`}>
                  {names[job.marketplaceAccountId ?? ""] ?? "Account"} {jobLabel(job).toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[12px] text-[#737373] border-t border-[#F0F0F0] pt-4">{timelineSummary}</p>

        {attentionConn?.account ? (
          <RecoveryCallout connection={attentionConn} jobs={recentJobs} atRisk={atRisk} onReview={() => onOpenRecoveryDrawer(attentionConn)} />
        ) : (
          <div className="rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-5 text-[12px] text-[#525252]">
            <span className="text-[#16A34A] font-bold">Healthy ✓</span> No connection needs recovery.
          </div>
        )}
      </div>

      {problemJobs.length > 0 && (
        <section aria-label="Sync runs that need a look" className="rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm space-y-3">
          <h3 className="text-[15px] font-bold text-[#111111]">Sync runs that need a look</h3>
          <p className="text-[12px] text-[#737373]">Failed or partly failed runs of the last 24 hours. Retry one or read its log.</p>
          <JobsTable jobs={problemJobs} />
        </section>
      )}
    </div>
  );
}
