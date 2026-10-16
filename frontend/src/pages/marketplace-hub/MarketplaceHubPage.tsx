import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  RefreshCw,
  Store,
  Layers,
  Truck,
  Activity,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/common/StatusPill";
import { ROUTES } from "@/constants/routes";
import {
  useConnections,
  useSyncConnection,
  useTestConnection,
  useDisconnectConnection,
} from "@/hooks/useConnectors";
import { formatRelativeTime } from "@/utils/format";

export default function MarketplaceHubPage() {
  const navigate = useNavigate();
  const { data: connectionsData } = useConnections();
  const syncMutation = useSyncConnection();
  const testMutation = useTestConnection();
  const disconnectMutation = useDisconnectConnection();

  const [activeTab, setActiveTab] = useState<"all" | "marketplace" | "storefront" | "shipping">("all");

  const connections = connectionsData?.data ?? [];
  const meta = connectionsData?.meta;

  const filteredConnections = connections.filter((c) => {
    if (activeTab === "all") return true;
    return c.category === activeTab;
  });

  return (
    <div className="w-full space-y-6 pb-16">
      {/* Page Header with Action buttons */}
      <PageHeader
        eyebrow="COMMERCE INTEGRATIONS"
        title="Marketplace Hub"
        description="Unified control room for your connected marketplaces, storefronts, and 3PL carriers."
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate(ROUTES.MARKETPLACE_HUB_HEALTH)}
            >
              <Activity className="h-4 w-4 text-emerald-600" />
              Network Health DNA
            </Button>
            <Button
              size="sm"
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
            >
              <Plus className="h-4 w-4" /> Add Channel Connection
            </Button>
          </div>
        }
      />

      {/* KPI Network Ribbon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Connected Channels
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-foreground">
              {meta?.total ?? 4}
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              {meta?.healthy ?? 3} Active Healthy
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Multi-Channel Listings
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-foreground">
              {connections.reduce((acc, c) => acc + c.stats.activeListings, 0)}
            </span>
            <span className="text-xs text-muted-foreground">Across 4 platforms</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Orders Awaiting Ingestion
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-foreground">
              {connections.reduce((acc, c) => acc + c.stats.pendingOrders, 0)}
            </span>
            <span className="text-xs text-emerald-600">SLA within limits</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Attention Items
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-amber-600">
              {meta?.warning ?? 1}
            </span>
            <span className="text-xs text-muted-foreground">Meesho rate limit</span>
          </div>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          {(
            [
              { id: "all", label: "All Connections" },
              { id: "marketplace", label: "Marketplaces (3)" },
              { id: "storefront", label: "Storefronts (1)" },
              { id: "shipping", label: "Logistics / 3PL (0)" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground"
          onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
        >
          Explore Directory <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Connections Grid / Network Map */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2">
        {filteredConnections.map((conn) => {
          const isWarning = conn.status === "warning";

          return (
            <div
              key={conn.id}
              className={`flex flex-col justify-between rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md ${
                isWarning ? "border-amber-200 ring-1 ring-amber-100" : "border-border"
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/30">
                      {conn.category === "storefront" ? (
                        <Layers className="h-6 w-6 text-[#1D4ED8]" />
                      ) : conn.category === "shipping" ? (
                        <Truck className="h-6 w-6 text-purple-600" />
                      ) : (
                        <Store className="h-6 w-6 text-amber-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground">
                          {conn.name}
                        </h3>
                        <StatusPill status={conn.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {conn.accountIdentifier}
                      </p>
                    </div>
                  </div>

                  <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
                    {conn.authType}
                  </span>
                </div>

                {/* Metrics Grid */}
                <div className="mt-6 grid grid-cols-3 gap-3 rounded-lg border border-border bg-muted/20 p-3.5 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Listings
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-bold text-foreground">
                      {conn.stats.activeListings}
                    </p>
                  </div>
                  <div className="border-x border-border">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Pending Orders
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-bold text-foreground">
                      {conn.stats.pendingOrders}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Pulse Score
                    </p>
                    <p
                      className={`mt-0.5 font-mono text-sm font-bold ${
                        conn.health.pulseScore > 90
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                    >
                      {conn.health.pulseScore}%
                    </p>
                  </div>
                </div>

                {/* Health / Friction note */}
                {conn.health.frictionPoints.length > 0 && (
                  <div className="mt-3.5 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-xs text-amber-900">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      Attention required:
                    </div>
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-amber-800">
                      {conn.health.frictionPoints.map((pt, idx) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Card Footer actions */}
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs">
                <span className="text-[11px] text-muted-foreground">
                  Synced {formatRelativeTime(conn.lastSyncAt)}
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={testMutation.isPending}
                    onClick={() => testMutation.mutate(conn.id)}
                  >
                    Test
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    disabled={syncMutation.isPending}
                    onClick={() => syncMutation.mutate(conn.id)}
                  >
                    <RefreshCw className="h-3 w-3" /> Sync Now
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(`Disconnect ${conn.name}?`)) {
                        disconnectMutation.mutate(conn.id);
                      }
                    }}
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
