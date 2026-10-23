import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, AlertTriangle, ArrowRight } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useConnectorHealth, useRecentSyncJobs } from "@/hooks/useConnectors";
import { useCan } from "@/hooks/useCan";
import { errorMessage } from "@/api/errors";
import { ago, WRITE_REASON } from "@/components/marketplace-hub/accounts/hubFormat";
import type { ChannelConnection } from "@/types/connection";
import type { HubLane } from "@/types/hub";
import { NetworkPulseBar } from "./components/health/NetworkPulseBar";
import { NetworkFrictionCard, type FrictionIssue } from "./components/health/NetworkFrictionCard";
import { WhatIsAtRiskBar } from "./components/health/WhatIsAtRiskBar";
import { DataFlowRiver } from "./components/health/DataFlowRiver";
import { NetworkHealthDna, type DnaDimension } from "./components/health/NetworkHealthDna";
import { ConnectionFieldCanvas } from "./components/health/ConnectionFieldCanvas";
import { ConnectionRecoveryDrawer } from "./components/health/ConnectionRecoveryDrawer";
import { ConnectionsRecoveryTable, type RecoveryFilters } from "./components/health/ConnectionsRecoveryTable";
import { ConnectionHealthEmptyState } from "./components/health/ConnectionHealthEmptyState";
import { ConnectionHealthSkeleton } from "./components/health/ConnectionHealthSkeleton";
import { connState, laneLevel, laneOf, lastDay, authLevel, type Level } from "./components/health/healthModel";

const NETWORK_LABEL = { optimal: "STABLE", degraded: "DEGRADED", critical: "CRITICAL" } as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function ConnectionHealthPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canWrite = useCan("marketplace_accounts:write");

  // Queries
  const healthQuery = useConnectorHealth();
  const jobsQuery = useRecentSyncJobs();
  const { data: health, isPending, isError, error, refetch } = healthQuery;
  const recentJobs = useMemo(() => lastDay(jobsQuery.data ?? []), [jobsQuery.data]);

  // The view and the recovery filters live in the URL
  const view = params.get("view") === "recovery" ? "recovery" : "overview";
  const filters: RecoveryFilters = {
    tab: ["healthy", "syncing", "attention", "critical"].includes(params.get("tab") ?? "") ? (params.get("tab") as string) : "all",
    q: params.get("q") ?? "",
    area: ["products", "inventory", "orders", "listings", "authentication"].includes(params.get("area") ?? "") ? (params.get("area") as string) : "all",
    sort: ["name", "sync"].includes(params.get("sort") ?? "") ? (params.get("sort") as string) : "attention",
  };
  const setQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) {
        if (v && v !== "all" && !(k === "sort" && v === "attention")) next.set(k, v);
        else next.delete(k);
      }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  const setView = (v: "overview" | "recovery") => setQuery({ view: v === "recovery" ? "recovery" : null });
  const onFilters = (patch: Partial<RecoveryFilters>) => setQuery(patch);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Derivations: every number comes from the hub health, the accounts and the sync runs
  const connections = useMemo(() => health?.connections ?? [], [health?.connections]);
  const selectedConnection: ChannelConnection | null = connections.find((c) => c.id === selectedId) ?? null;
  const lanesByAccount = useMemo(() => Object.fromEntries((health?.accountLanes ?? []).map((a) => [a.accountId, a.lanes])) as Record<string, HubLane[]>, [health?.accountLanes]);
  const names = useMemo(() => Object.fromEntries(connections.map((c) => [c.id, c.name])), [connections]);

  const totalCount = connections.length;
  const states = connections.map(connState);
  const healthyCount = states.filter((s) => s === "healthy").length;
  const attentionCount = states.filter((s) => s === "attention").length;
  const criticalCount = states.filter((s) => s === "critical").length;
  const pausedCount = states.filter((s) => s === "paused").length;
  const isAllHealthy = totalCount > 0 && attentionCount === 0 && criticalCount === 0;
  const criticalConn = connections.find((c) => connState(c) === "critical");
  const attentionConn = connections.find((c) => connState(c) === "attention");
  const atRisk = health?.atRisk;

  const lanes = health?.rawLanes;
  const productLane = laneOf(lanes, "listings");
  const inventoryLane = laneOf(lanes, "inventory");
  const orderLane = laneOf(lanes, "orders");

  // connections whose own lane of a stream is degraded or failing
  const delayedFor = (key: string) => connections.filter((c) => ["warning", "error"].includes(laneLevel(laneOf(lanesByAccount[c.id], key)))).map((c) => c.name);
  const delayed = { products: delayedFor("listings"), inventory: delayedFor("inventory"), orders: delayedFor("orders") };

  const frictionIssues: FrictionIssue[] = connections
    .filter((c) => ["attention", "critical"].includes(connState(c)))
    .map((c) => {
      const r = atRisk?.accounts.find((x) => x.accountId === c.id);
      const listings = (r?.staleStockListings ?? 0) + (r?.problemListings ?? 0);
      return {
        connectionId: c.id,
        connectionName: c.name,
        issueTitle: c.health.frictionPoints[0] ?? c.attentionIssue?.issueTitle ?? "Needs attention",
        affectedLabel: listings > 0 ? `${plural(listings, "listing")} affected` : r && r.openOrders > 0 ? `${plural(r.openOrders, "open order")} waiting` : null,
        severity: connState(c) === "critical" ? "error" : "warning",
      };
    });

  // the diagnostic dimensions
  const laneDimension = (label: string, lane: HubLane | undefined): DnaDimension => ({
    label,
    status: laneLevel(lane),
    value: lane?.successRate,
    detail: !lane || lane.jobs === 0 ? "No runs in 24 h" : `${lane.successRate === null ? "no finished run" : `${lane.successRate}%`} of ${plural(lane.finished, "run")}`,
  });
  const sr = health?.syncReliability ?? { windowHours: 24, finished: 0, failed: 0, successRate: null };
  const tokenWarnings = health?.tokenWarnings ?? [];
  const rate = sr.successRate;
  const authLevels: Level[] = connections.map((c) => authLevel(c, tokenWarnings));
  const dimensions: DnaDimension[] = [
    {
      label: "Authentication",
      status: authLevels.includes("error") || tokenWarnings.some((t) => t.expired) ? "error" : authLevels.includes("warning") || tokenWarnings.length > 0 ? "warning" : "healthy",
      detail: tokenWarnings.length > 0 ? `${plural(tokenWarnings.length, "token")} expiring or expired` : "All tokens valid",
    },
    { label: "Synchronization", status: rate === null ? "idle" : rate < 80 ? "error" : rate < 95 ? "warning" : "healthy", value: rate, detail: rate === null ? "No runs in 24 h" : `${rate}% of ${plural(sr.finished, "run")}` },
    laneDimension("Catalog", productLane),
    laneDimension("Inventory", inventoryLane),
    laneDimension("Orders", orderLane),
  ];

  const lastChecked = health?.generatedAt ? ago(health.generatedAt) : "just now";

  if (isPending) return <ConnectionHealthSkeleton />;

  if (isError) {
    return (
      <div className="w-full space-y-6 pb-20 text-[#111111]">
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <h2 className="text-base font-bold text-destructive">Failed to load connection health</h2>
          <p className="text-xs text-muted-foreground">{errorMessage(error)}</p>
          <button type="button" onClick={() => void refetch()} className="h-9 px-4 rounded-lg bg-[#000000] text-[12px] font-semibold text-white hover:bg-neutral-800 transition-colors">
            Retry Diagnostics
          </button>
        </div>
      </div>
    );
  }

  if (totalCount === 0) {
    return <ConnectionHealthEmptyState onAddChannel={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)} />;
  }

  const risk = { products: atRisk?.staleStockListings ?? 0, orders: atRisk?.openOrders ?? 0, listings: atRisk?.problemListings ?? 0 };
  const reviewAffected = () => setSelectedId((attentionConn ?? criticalConn)?.id ?? null);

  return (
    <div className="w-full space-y-8 pb-24 text-[#111111] animate-in fade-in duration-200">
      {!canWrite && (
        <p role="status" className="rounded-lg border border-[#EAEAEA] bg-[#F5F5F5] px-3 py-2 text-[12px] text-[#666666]">
          You have read-only access. You can inspect the health of every connection, but retrying, reconnecting and changing accounts needs the marketplace_accounts:write permission. {WRITE_REASON}
        </p>
      )}

      {jobsQuery.isError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          The sync runs could not be loaded ({errorMessage(jobsQuery.error)}). The rest of this page is up to date.{" "}
          <button type="button" className="underline" onClick={() => void jobsQuery.refetch()}>
            Retry
          </button>
        </p>
      )}

      {view === "overview" && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">NETWORK HEALTH</span>
              <h1 className="mt-1 text-[28px] font-bold tracking-tight text-[#111111]">Connection health</h1>
              <p className="mt-1 text-[13px] text-[#666666]">See how reliably your marketplaces and commerce services are communicating with your workspace.</p>
              {!isAllHealthy && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[#D97706]">
                  <span>⚠</span>
                  <span>{criticalCount > 0 ? `${plural(criticalCount, "connection")} ${criticalCount === 1 ? "requires" : "require"} immediate attention` : attentionCount > 0 ? `${plural(attentionCount, "connection")} ${attentionCount === 1 ? "needs" : "need"} attention` : `${plural(pausedCount, "connection")} paused`}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:items-end gap-2">
              <span className="text-[12px] text-[#8A8A8A]">Last checked · {lastChecked}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void refetch()} aria-label="Refresh" className="h-9 px-3 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors flex items-center gap-1.5">
                  <RefreshCw className={`h-3.5 w-3.5 ${healthQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
                </button>
                <button type="button" onClick={() => setView("recovery")} className="h-9 px-4 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors flex items-center gap-1.5">
                  Sync activity
                </button>
              </div>
            </div>
          </div>

          {criticalConn && (
            <div className="rounded-xl border border-[#DC2626]/30 bg-[#FEF2F2] p-5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#DC2626]" />
                <h3 className="text-[14px] font-bold text-[#DC2626]">{criticalCount === 1 ? "One connection needs immediate attention" : `${criticalCount} connections need immediate attention`}</h3>
              </div>
              <p className="text-[12px] text-[#991B1B]">
                {criticalConn.name}: {criticalConn.health.frictionPoints[0] ?? "the connection is unavailable."}
              </p>
            </div>
          )}

          {isAllHealthy && (
            <div className="flex items-center justify-between rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-6 shadow-sm">
              <div className="space-y-1">
                <h2 className="text-[18px] font-bold text-[#111111]">Everything is flowing.</h2>
                <p className="text-[12px] text-[#525252]">All connected channels are healthy{rate !== null ? ` and synchronizing normally (${rate}% of runs succeeded in the last 24 hours)` : ""}.</p>
              </div>
              <button type="button" onClick={() => setView("recovery")} className="h-9 px-4 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors">
                View connections
              </button>
            </div>
          )}

          <NetworkPulseBar
            healthyCount={healthyCount}
            totalCount={totalCount}
            attentionCount={attentionCount}
            criticalCount={criticalCount}
            pausedCount={pausedCount}
            pulseScore={health?.overallPulseScore ?? null}
            syncSuccessRate={rate}
            finishedRuns={sr.finished}
            connections={connections}
            onSelectNode={(conn) => setSelectedId(conn.id)}
          />

          {isAllHealthy ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ConnectionFieldCanvas connections={connections} networkLabel={health ? NETWORK_LABEL[health.networkStatus] : "STABLE"} onSelectConnection={(conn) => setSelectedId(conn.id)} />
              </div>
              <div>
                <NetworkFrictionCard issues={[]} onInspectIssue={() => undefined} />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <NetworkFrictionCard issues={frictionIssues} onInspectIssue={(id) => setSelectedId(id)} />
              <WhatIsAtRiskBar productsAtRisk={risk.products} ordersAtRisk={risk.orders} listingsBlocked={risk.listings} onReviewAffected={reviewAffected} />
            </div>
          )}

          <DataFlowRiver productLane={productLane} inventoryLane={inventoryLane} orderLane={orderLane} delayed={delayed} recentJobs={recentJobs} names={names} />

          <NetworkHealthDna dimensions={dimensions} />

          <div className="flex items-center justify-between border-t border-[#F0F0F0] pt-6 text-[12px] text-[#737373]">
            <span>
              {risk.products} listings waiting for stock · {risk.orders} open orders on connections needing attention · {risk.listings} listings rejected
            </span>
            <button type="button" onClick={() => setView("recovery")} className="font-semibold text-[#111111] hover:underline flex items-center gap-1">
              View connections &amp; recovery <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}

      {view === "recovery" && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">NETWORK HEALTH</span>
              <h1 className="mt-1 text-[28px] font-bold tracking-tight text-[#111111]">Connections &amp; recovery</h1>
              <p className="mt-1 text-[13px] text-[#666666]">Inspect every connection, understand its impact and follow the recovery path.</p>
              <p className="mt-1 text-[12px] text-[#8A8A8A]">Last checked · {lastChecked}</p>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setView("overview")} className="h-9 px-3.5 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors flex items-center gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to overview
              </button>
              <button type="button" onClick={() => { void refetch(); void jobsQuery.refetch(); }} className="h-9 px-3.5 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors flex items-center gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${healthQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
          </div>

          <ConnectionsRecoveryTable connections={connections} lanesByAccount={lanesByAccount} atRisk={atRisk} tokenWarnings={tokenWarnings} recentJobs={recentJobs} filters={filters} onFilters={onFilters} onOpenRecoveryDrawer={(conn) => setSelectedId(conn.id)} />
        </>
      )}

      <ConnectionRecoveryDrawer isOpen={!!selectedConnection} onClose={() => setSelectedId(null)} connection={selectedConnection} jobs={recentJobs} lanes={selectedConnection ? lanesByAccount[selectedConnection.id] : undefined} atRisk={atRisk} />
    </div>
  );
}
