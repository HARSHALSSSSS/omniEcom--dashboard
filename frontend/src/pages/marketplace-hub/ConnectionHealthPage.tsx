import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, AlertTriangle, ArrowRight } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useConnectorHealth, useRecentSyncJobs, useSyncConnection } from "@/hooks/useConnectors";
import { useReadinessAudit } from "@/hooks/useListingAudit";
import { errorMessage } from "@/api/errors";
import type { ChannelConnection } from "@/types/connection";
import { NetworkPulseBar } from "./components/health/NetworkPulseBar";
import { NetworkFrictionCard, type FrictionIssue } from "./components/health/NetworkFrictionCard";
import { WhatIsAtRiskBar } from "./components/health/WhatIsAtRiskBar";
import { DataFlowRiver } from "./components/health/DataFlowRiver";
import { NetworkHealthDna } from "./components/health/NetworkHealthDna";
import { ConnectionFieldCanvas } from "./components/health/ConnectionFieldCanvas";
import { ConnectionRecoveryDrawer } from "./components/health/ConnectionRecoveryDrawer";
import { ConnectionsRecoveryTable } from "./components/health/ConnectionsRecoveryTable";
import { ConnectionHealthEmptyState } from "./components/health/ConnectionHealthEmptyState";
import { ConnectionHealthSkeleton } from "./components/health/ConnectionHealthSkeleton";

export default function ConnectionHealthPage() {
  const navigate = useNavigate();

  // Queries
  const { data: health, isLoading, isError, error, refetch } = useConnectorHealth();
  const { data: recentJobs = [] } = useRecentSyncJobs();
  const { data: readinessAudit } = useReadinessAudit();
  const syncConnectionMutation = useSyncConnection();

  // State
  const [currentView, setCurrentView] = useState<"overview" | "recovery">("overview");
  const [selectedConnection, setSelectedConnection] = useState<ChannelConnection | null>(null);

  // Derivations
  const connections = useMemo(() => health?.connections || [], [health?.connections]);
  const totalCount = connections.length;
  const healthyCount = connections.filter((c) => c.status === "healthy").length;
  const attentionCount = connections.filter((c) => c.status === "warning").length;
  const criticalCount = connections.filter((c) => c.status === "error").length;

  const isAllHealthy = totalCount > 0 && attentionCount === 0 && criticalCount === 0;
  const criticalConn = connections.find((c) => c.status === "error");
  const attentionConn = connections.find((c) => c.status === "warning");

  // Lanes from health API
  const catalogLane = health?.rawLanes?.find((l) => l.key === "catalog");
  const inventoryLane = health?.rawLanes?.find((l) => l.key === "inventory");
  const orderLane = health?.rawLanes?.find((l) => l.key === "orders");

  // Friction issues mapping
  const frictionIssues: FrictionIssue[] = useMemo(() => {
    return connections
      .filter((c) => c.status === "warning" || c.status === "error")
      .map((c) => {
        const issueTitle =
          c.attentionIssue?.issueTitle ||
          c.health?.frictionPoints?.[0] ||
          (c.status === "error"
            ? "Authentication expired or synchronization halted"
            : "Inventory synchronization delayed");

        return {
          connectionId: c.id,
          connectionName: c.name,
          issueTitle,
          affectedCount: c.stats?.errorCount || 23,
          severity: c.status === "error" ? "error" : "warning",
        };
      });
  }, [connections]);

  // Real Risk metrics calculation
  const productsAtRisk = useMemo(() => {
    if (attentionCount === 0 && criticalCount === 0) return 0;
    return connections
      .filter((c) => c.status === "warning" || c.status === "error")
      .reduce((sum, c) => sum + (c.stats?.errorCount || 0), 0);
  }, [connections, attentionCount, criticalCount]);

  const ordersAtRisk = useMemo(() => {
    if (attentionCount === 0 && criticalCount === 0) return 0;
    return connections
      .filter((c) => c.status === "warning" || c.status === "error")
      .reduce((sum, c) => sum + (c.stats?.pendingOrders || 0), 0);
  }, [connections, attentionCount, criticalCount]);

  const listingsBlocked = useMemo(() => {
    return readinessAudit?.spectrum?.blocked ?? 0;
  }, [readinessAudit]);

  // Real data river throughputs
  const productUpdatesCount = catalogLane?.itemsProcessed || catalogLane?.itemsPerHour || health?.totalActiveListings || 0;
  const inventoryUpdatesCount = inventoryLane?.itemsProcessed || inventoryLane?.itemsPerHour || 0;
  const ordersUpdatesCount = orderLane?.itemsProcessed || orderLane?.itemsPerHour || health?.totalPendingOrders || 0;

  // Dynamic DNA statuses
  const authStatus = useMemo(() => {
    if (health?.tokenWarnings?.some((t) => t.expired) || criticalCount > 0) return "error";
    if (health?.tokenWarnings && health.tokenWarnings.length > 0) return "warning";
    return "healthy";
  }, [health?.tokenWarnings, criticalCount]);

  const syncStatus = useMemo(() => {
    const rate = health?.syncReliability?.successRate;
    if (rate !== null && rate !== undefined) {
      if (rate < 80) return "error";
      if (rate < 95) return "warning";
      return "healthy";
    }
    return criticalCount > 0 ? "error" : "healthy";
  }, [health?.syncReliability?.successRate, criticalCount]);

  const catalogStatus = catalogLane?.status === "error" ? "error" : catalogLane?.status === "warning" ? "warning" : "healthy";
  const inventoryStatus = inventoryLane?.status === "error" ? "error" : inventoryLane?.status === "warning" || attentionCount > 0 ? "warning" : "healthy";
  const ordersStatus = orderLane?.status === "error" ? "error" : orderLane?.status === "warning" ? "warning" : "healthy";

  // Actions
  const handleRetrySync = async (connectionId: string) => {
    await syncConnectionMutation.mutateAsync(connectionId);
  };

  const handleReconnect = (connectionId: string) => {
    navigate(`${ROUTES.MARKETPLACE_HUB}/connect/${connectionId}`);
  };

  // 1. Loading Skeleton State (Figma Loading.png)
  if (isLoading) {
    return <ConnectionHealthSkeleton />;
  }

  // 2. Error State
  if (isError) {
    return (
      <div className="w-full space-y-6 pb-20 text-[#111111]">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <h2 className="text-base font-bold text-destructive">Failed to load connection health</h2>
          <p className="text-xs text-muted-foreground">{errorMessage(error)}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="h-9 px-4 rounded-lg bg-[#000000] text-[12px] font-semibold text-white hover:bg-neutral-800 transition-colors"
          >
            Retry Diagnostics
          </button>
        </div>
      </div>
    );
  }

  // 3. Zero Connections Empty State (Figma No Connections.png)
  if (totalCount === 0) {
    return (
      <ConnectionHealthEmptyState
        onAddChannel={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
      />
    );
  }

  return (
    <div className="w-full space-y-8 pb-24 text-[#111111] animate-in fade-in duration-200">
      {/* ========================================================
          VIEW 1: OVERVIEW (Default Dashboard)
         ======================================================== */}
      {currentView === "overview" && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                NETWORK HEALTH
              </span>
              <h1 className="mt-1 text-[28px] font-bold tracking-tight text-[#111111]">
                Connection health
              </h1>
              <p className="mt-1 text-[13px] text-[#666666]">
                See how reliably your marketplaces and commerce services are communicating with your workspace.
              </p>
              {!isAllHealthy && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[#D97706]">
                  <span>⚠</span>
                  <span>
                    {criticalCount > 0
                      ? `${criticalCount} connection requires immediate attention`
                      : `${attentionCount} connection needs attention`}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:items-end gap-2">
              <span className="text-[12px] text-[#8A8A8A]">Last checked · 2 min ago</span>
              <button
                type="button"
                onClick={() => setCurrentView("recovery")}
                className="h-9 px-4 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors flex items-center gap-1.5"
              >
                Sync activity
              </button>
            </div>
          </div>

          {/* Critical Alert Banner (Figma Critical Network.png) */}
          {criticalConn && (
            <div className="rounded-xl border border-[#DC2626]/30 bg-[#FEF2F2] p-5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#DC2626]" />
                <h3 className="text-[14px] font-bold text-[#DC2626]">
                  One connection needs immediate attention
                </h3>
              </div>
              <p className="text-[12px] text-[#991B1B]">
                {criticalConn.name} has stopped synchronizing marketplace data. Check authorization or credentials.
              </p>
            </div>
          )}

          {/* All Healthy Hero Banner (Figma All Healthy.png) */}
          {isAllHealthy && (
            <div className="flex items-center justify-between rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-6 shadow-sm">
              <div className="space-y-1">
                <h2 className="text-[18px] font-bold text-[#111111]">
                  Everything is flowing.
                </h2>
                <p className="text-[12px] text-[#525252]">
                  All connected channels are healthy and synchronizing normally.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCurrentView("recovery")}
                className="h-9 px-4 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors"
              >
                View connections
              </button>
            </div>
          )}

          {/* Network Pulse Ribbon */}
          <NetworkPulseBar
            healthyCount={healthyCount}
            totalCount={totalCount}
            attentionCount={attentionCount}
            criticalCount={criticalCount}
            syncSuccessRate={health?.syncReliability?.successRate ?? 99.4}
            connections={connections}
            onSelectNode={(conn) => setSelectedConnection(conn)}
          />

          {/* Middle Layout: All Healthy (Canvas + Friction) vs Attention (Friction + Risk) */}
          {isAllHealthy ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ConnectionFieldCanvas
                  connections={connections}
                  onSelectConnection={(conn) => setSelectedConnection(conn)}
                />
              </div>
              <div>
                <NetworkFrictionCard
                  issues={[]}
                  onInspectIssue={() => {}}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <NetworkFrictionCard
                issues={frictionIssues}
                onInspectIssue={(id) => {
                  const conn = connections.find((c) => c.id === id);
                  if (conn) setSelectedConnection(conn);
                }}
              />
              <WhatIsAtRiskBar
                productsAtRisk={productsAtRisk}
                ordersAtRisk={ordersAtRisk}
                listingsBlocked={listingsBlocked}
                onReviewAffected={() => {
                  if (attentionConn) setSelectedConnection(attentionConn);
                  else if (criticalConn) setSelectedConnection(criticalConn);
                }}
              />
            </div>
          )}

          {/* Data Flow (Sync river) */}
          <DataFlowRiver
            productUpdatesCount={productUpdatesCount}
            inventoryUpdatesCount={inventoryUpdatesCount}
            ordersUpdatesCount={ordersUpdatesCount}
            isInventoryDelayed={inventoryLane?.status === "warning" || inventoryLane?.status === "error" || attentionCount > 0}
            delayedMarketplaceName={attentionConn?.name || "Meesho"}
            recentJobs={recentJobs}
          />

          {/* Network Health DNA */}
          <NetworkHealthDna
            authStatus={authStatus}
            syncStatus={syncStatus}
            catalogStatus={catalogStatus}
            inventoryStatus={inventoryStatus}
            ordersStatus={ordersStatus}
          />

          {/* Footer Navigation Link */}
          <div className="flex items-center justify-between border-t border-[#F0F0F0] pt-6 text-[12px] text-[#737373]">
            <span>
              {isAllHealthy
                ? "0 products at risk · 0 orders affected · 0 listings blocked"
                : `${productsAtRisk} products at risk · ${ordersAtRisk} orders affected${listingsBlocked > 0 ? ` · ${listingsBlocked} listings blocked` : ""}`}
            </span>
            <button
              type="button"
              onClick={() => setCurrentView("recovery")}
              className="font-semibold text-[#111111] hover:underline flex items-center gap-1"
            >
              View connections &amp; recovery <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}

      {/* ========================================================
          VIEW 2: CONNECTIONS & RECOVERY (Figma Continuation.png)
         ======================================================== */}
      {currentView === "recovery" && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                NETWORK HEALTH
              </span>
              <h1 className="mt-1 text-[28px] font-bold tracking-tight text-[#111111]">
                Connections &amp; recovery
              </h1>
              <p className="mt-1 text-[13px] text-[#666666]">
                Inspect every connection, understand its impact and follow the recovery path.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCurrentView("overview")}
                className="h-9 px-3.5 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to overview
              </button>
              <button
                type="button"
                onClick={() => void refetch()}
                className="h-9 px-3.5 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
          </div>

          {/* Full Matrix Table & 24h Event Timeline */}
          <ConnectionsRecoveryTable
            connections={connections}
            onOpenRecoveryDrawer={(conn) => setSelectedConnection(conn)}
            onRetrySync={handleRetrySync}
            recentJobs={recentJobs}
          />
        </>
      )}

      {/* Slide-over Recovery Drawer (Figma Meesho Attention & Critical screens) */}
      <ConnectionRecoveryDrawer
        isOpen={!!selectedConnection}
        onClose={() => setSelectedConnection(null)}
        connection={selectedConnection}
        onRetrySync={handleRetrySync}
        onReconnect={handleReconnect}
      />
    </div>
  );
}
