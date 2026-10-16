import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Cpu,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/common/StatusPill";
import { ROUTES } from "@/constants/routes";
import { useConnectorHealth } from "@/hooks/useConnectors";

export default function ConnectionHealthPage() {
  const navigate = useNavigate();
  const { data: health } = useConnectorHealth();

  return (
    <div className="w-full space-y-6 pb-20">
      <PageHeader
        eyebrow="NETWORK DIAGNOSTICS"
        title="Connection Health DNA"
        description="Real-time telemetry, API rate limits, data-flow pipelines, and gateway latency."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(ROUTES.MARKETPLACE_HUB)}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Hub
          </Button>
        }
      />

      {/* Network Pulse DNA Ribbon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Overall Pulse Score
            </span>
            <Activity className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-foreground">
              {health?.overallPulseScore ?? 92}%
            </span>
            <span className="text-xs font-medium text-emerald-600">
              Optimal Condition
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Network Nodes
            </span>
            <Cpu className="h-4 w-4 text-[#1D4ED8]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-foreground">
              {health?.connectionsCount ?? 4}
            </span>
            <span className="text-xs text-muted-foreground">
              Gateways Connected
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sync Reliability Rate
            </span>
            <Zap className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-foreground">
              99.4%
            </span>
            <span className="text-xs text-muted-foreground">
              Last 24 Hours
            </span>
          </div>
        </div>
      </div>

      {/* Data Flow Lanes */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <h3 className="text-base font-semibold text-foreground">
          Data Flow Pipelines
        </h3>
        <p className="text-xs text-muted-foreground">
          Bi-directional pipelines handling real-time catalog changes, stock deductions, and dispatch notifications.
        </p>

        <div className="space-y-3 pt-2">
          {health?.dataFlowLanes.map((lane, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4 text-xs"
            >
              <div className="space-y-1">
                <p className="font-semibold text-foreground">{lane.lane}</p>
                <p className="text-muted-foreground">Throughput: {lane.throughput}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono font-medium text-muted-foreground">
                  Success: {lane.successRate}
                </span>
                <StatusPill status={lane.status} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Connection Nodes Detail Grid */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <h3 className="text-base font-semibold text-foreground">
          Connector Gateway Telemetry
        </h3>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
              <tr>
                <th className="py-3 pl-4 pr-3">Channel / Gateway</th>
                <th className="px-3 py-3">Pulse Score</th>
                <th className="px-3 py-3">API Quota Remaining</th>
                <th className="px-3 py-3">Token Expiry</th>
                <th className="py-3 pl-3 pr-4">Health Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {health?.connections.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20">
                  <td className="py-3 pl-4 pr-3">
                    <p className="font-semibold text-foreground">{c.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {c.accountIdentifier}
                    </p>
                  </td>
                  <td className="px-3 py-3 font-mono font-medium">
                    {c.health.pulseScore}%
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${
                            c.health.rateLimitRemainingPct > 30
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                          }`}
                          style={{
                            width: `${c.health.rateLimitRemainingPct}%`,
                          }}
                        />
                      </div>
                      <span className="font-mono text-[11px]">
                        {c.health.rateLimitRemainingPct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {c.health.tokenExpiresInDays
                      ? `${c.health.tokenExpiresInDays} days`
                      : "Permanent"}
                  </td>
                  <td className="py-3 pl-3 pr-4">
                    <StatusPill status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
