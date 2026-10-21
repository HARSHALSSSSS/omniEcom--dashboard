import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/useCan";
import { formatNumber } from "@/utils/format";
import type { HubAccountCard, HubHealth, HubLane } from "@/types/hub";
import { HubReconnectDialog } from "../accounts/HubReconnectDialog";
import { WRITE_REASON, ago, laneLabel, laneTone, pulseTone, tokenText } from "../accounts/hubFormat";
import { Bar, HubStatusPill, Pill } from "../accounts/hubUi";

export function DataFlowLanes({ lanes, windowHours }: { lanes: HubLane[]; windowHours: number }) {
  return (
    <section aria-labelledby="lanes-title" className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 id="lanes-title" className="text-base font-semibold text-foreground">
        Data Flow Pipelines
      </h3>
      <p className="text-xs text-muted-foreground">Sync runs of the last {windowHours} hours, by what they move between your catalogue and your marketplaces.</p>
      <ul className="space-y-3 pt-2">
        {lanes.map((lane) => (
          <li key={lane.key} className="space-y-2.5 rounded-lg border border-border bg-muted/20 p-4 text-xs">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{lane.label}</p>
                <p className="text-muted-foreground">
                  {lane.jobs === 0 ? "No runs in this period" : `${lane.jobs} ${lane.jobs === 1 ? "run" : "runs"}, ${lane.failed} failed · ${formatNumber(lane.itemsPerHour)} items/hour`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono font-medium text-muted-foreground">{lane.successRate === null ? "No finished runs" : `Success: ${lane.successRate}%`}</span>
                <Pill tone={laneTone(lane.status)}>{laneLabel(lane.status)}</Pill>
              </div>
            </div>
            <Bar value={lane.successRate ?? 0} tone={laneTone(lane.status)} label={`${lane.label} success rate`} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TokenWarnings({ warnings }: { warnings: HubHealth["tokenWarnings"] }) {
  const canWrite = useCan("marketplace_accounts:write");
  const [target, setTarget] = useState<HubHealth["tokenWarnings"][number] | null>(null);
  if (warnings.length === 0) return null;
  return (
    <section aria-labelledby="token-title" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-5">
      <h3 id="token-title" className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <KeyRound className="h-4 w-4" aria-hidden /> Credentials that need attention
      </h3>
      <ul className="divide-y divide-amber-200/70">
        {warnings.map((w) => (
          <li key={w.accountId} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs">
            <div>
              <Link to={`/marketplace-hub/connectors/${w.accountId}`} className="font-semibold text-foreground hover:underline">
                {w.name}
              </Link>
              <p className="text-amber-800">
                {w.expired ? "The authorization has expired." : w.daysLeft !== null ? `The access token expires in ${w.daysLeft} ${w.daysLeft === 1 ? "day" : "days"}.` : "The credential needs attention."}
              </p>
            </div>
            <span title={canWrite ? undefined : WRITE_REASON}>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!canWrite} onClick={() => setTarget(w)}>
                Reconnect
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {target && <HubReconnectDialog account={{ id: target.accountId, name: target.name, marketplace: target.marketplace }} open onOpenChange={(o) => !o && setTarget(null)} />}
    </section>
  );
}

export function ConnectionRows({ connections }: { connections: HubAccountCard[] }) {
  return (
    <section aria-labelledby="gateway-title" className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 id="gateway-title" className="text-base font-semibold text-foreground">
        Connector Gateway Telemetry
      </h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
            <tr>
              <th scope="col" className="py-3 pl-4 pr-3">Channel / Account</th>
              <th scope="col" className="px-3 py-3">Pulse Score</th>
              <th scope="col" className="px-3 py-3">Sync Success (24h)</th>
              <th scope="col" className="px-3 py-3">Last Sync</th>
              <th scope="col" className="px-3 py-3">Token Expiry</th>
              <th scope="col" className="py-3 pl-3 pr-4">Health Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {connections.map((c) => {
              const token = tokenText(c);
              const rate = c.health.syncSuccessRate24h;
              return (
                <tr key={c.id} className="hover:bg-muted/20">
                  <td className="py-3 pl-4 pr-3">
                    <Link to={`/marketplace-hub/connectors/${c.id}`} className="font-semibold text-foreground hover:underline">
                      {c.name}
                    </Link>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {c.connectorName}
                      {c.accountIdentifier ? ` · ${c.accountIdentifier}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16">
                        <Bar value={c.health.pulseScore} tone={pulseTone(c.health.pulseScore)} label={`${c.name} pulse score`} />
                      </div>
                      <span className="font-mono text-[11px] font-medium">{c.health.pulseScore}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {rate === null ? <span className="font-sans text-muted-foreground">No runs</span> : `${rate}%`}
                    {c.health.syncRuns24h.failed > 0 && <span className="ml-1 font-sans text-[11px] text-red-600">({c.health.syncRuns24h.failed} failed)</span>}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{ago(c.lastSyncAt)}</td>
                  <td className={token?.tone === "bad" ? "px-3 py-3 font-medium text-red-600" : token?.tone === "warn" ? "px-3 py-3 font-medium text-amber-600" : "px-3 py-3 text-muted-foreground"}>
                    {c.health.tokenExpiresInDays === null ? (token ? "Permanent" : "n/a") : c.health.tokenExpiresInDays < 0 ? "Expired" : `${c.health.tokenExpiresInDays} days`}
                  </td>
                  <td className="py-3 pl-3 pr-4">
                    <HubStatusPill account={c} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
