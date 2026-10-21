import { useNavigate } from "react-router-dom";
import { Activity, ArrowLeft, Cpu, Zap } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { errorMessage } from "@/api/errors";
import { useHubHealth } from "@/hooks/useHub";
import type { HubHealth } from "@/types/hub";
import { ConnectionRows, DataFlowLanes, TokenWarnings } from "@/components/marketplace-hub/health/HealthSections";
import { LoadError, StateBox } from "@/components/marketplace-hub/accounts/hubUi";

const NETWORK_TEXT: Record<HubHealth["networkStatus"], { label: string; className: string }> = {
  optimal: { label: "Optimal condition", className: "text-emerald-600" },
  degraded: { label: "Degraded", className: "text-amber-600" },
  critical: { label: "Critical", className: "text-red-600" },
  not_connected: { label: "Nothing connected", className: "text-muted-foreground" },
};

function Tile({ title, icon, value, caption, captionClass = "text-muted-foreground" }: { title: string; icon: React.ReactNode; value: string; caption: string; captionClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        {icon}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold text-foreground">{value}</span>
        <span className={`text-xs font-medium ${captionClass}`}>{caption}</span>
      </div>
    </div>
  );
}

export default function ConnectionHealthPage() {
  const navigate = useNavigate();
  const health = useHubHealth();
  const data = health.data;
  const net = data ? NETWORK_TEXT[data.networkStatus] : null;

  return (
    <div className="w-full space-y-6 pb-20">
      <PageHeader
        eyebrow="NETWORK DIAGNOSTICS"
        title="Connection Health DNA"
        description="Pulse scores, data-flow pipelines and credential status of every connected channel, from the last 24 hours of sync runs."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.MARKETPLACE_HUB)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Hub
          </Button>
        }
      />

      {health.isPending && (
        <div className="space-y-6" aria-busy="true" aria-label="Loading connection health">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[360px] rounded-xl" />
        </div>
      )}
      {health.isError && <LoadError title="Connection health could not be loaded." message={errorMessage(health.error)} onRetry={() => void health.refetch()} />}

      {data && net && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Tile
              title="Overall Pulse Score"
              icon={<Activity className="h-4 w-4 text-emerald-600" aria-hidden />}
              value={data.overallPulseScore === null ? "n/a" : `${data.overallPulseScore}%`}
              caption={net.label}
              captionClass={net.className}
            />
            <Tile
              title="Active Network Nodes"
              icon={<Cpu className="h-4 w-4 text-[#1D4ED8]" aria-hidden />}
              value={String(data.connectionsCount)}
              caption={data.connectionsCount === 1 ? "Gateway connected" : "Gateways connected"}
            />
            <Tile
              title="Sync Reliability Rate"
              icon={<Zap className="h-4 w-4 text-amber-600" aria-hidden />}
              value={data.syncReliability.successRate === null ? "n/a" : `${data.syncReliability.successRate}%`}
              caption={
                data.syncReliability.finished === 0
                  ? `No runs in the last ${data.syncReliability.windowHours} hours`
                  : `${data.syncReliability.finished - data.syncReliability.failed} of ${data.syncReliability.finished} runs, last ${data.syncReliability.windowHours} hours`
              }
            />
          </div>

          {data.connections.length === 0 ? (
            <StateBox title="No marketplace connected yet" description="Health appears here once you connect a channel and its first sync has run.">
              <Button size="sm" className="text-xs" onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}>
                Connect a marketplace
              </Button>
            </StateBox>
          ) : (
            <>
              <TokenWarnings warnings={data.tokenWarnings} />
              <DataFlowLanes lanes={data.dataFlowLanes} windowHours={data.syncReliability.windowHours} />
              <ConnectionRows connections={data.connections} />
            </>
          )}
        </>
      )}
    </div>
  );
}
