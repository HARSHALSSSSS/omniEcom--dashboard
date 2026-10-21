import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { HubAccountCard } from "@/types/hub";
import { HubAccountActions } from "./HubAccountActions";
import { TAG_LABEL, ago, pulseTone, tokenText } from "./hubFormat";
import { Bar, ChannelIcon, HubStatusPill } from "./hubUi";

const toneText = { good: "text-emerald-600", warn: "text-amber-600", bad: "text-red-600", info: "text-blue-600", neutral: "text-foreground" } as const;

/** One connected account: identity, live numbers, friction, sync state and the actions. */
export function HubAccountTile({ account }: { account: HubAccountCard }) {
  const token = tokenText(account);
  const attention = account.status === "warning" || account.status === "error";
  const syncing = account.syncState === "syncing";
  const connected = account.accountStatus === "active" || account.accountStatus === "paused";

  return (
    <article
      aria-label={`${account.name} connection`}
      className={cn(
        "flex flex-col justify-between rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md",
        attention ? "border-amber-200 ring-1 ring-amber-100" : "border-border",
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ChannelIcon category={account.category} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-foreground">
                  <Link to={`/marketplace-hub/connectors/${account.id}`} className="hover:underline">
                    {account.name}
                  </Link>
                </h3>
                <HubStatusPill account={account} />
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {account.connectorName}
                {account.accountIdentifier ? ` · ${account.accountIdentifier}` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{account.authType}</span>
            {account.mode === "sandbox" && <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700">Sandbox</span>}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-4 gap-3 rounded-lg border border-border bg-muted/20 p-3.5 text-center">
          <Metric label="Listings" value={formatNumber(account.stats.activeListings)} />
          <Metric label="Pending Orders" value={formatNumber(account.stats.pendingOrders)} bordered />
          <Metric label="Stock Synced" value={formatNumber(account.stats.syncedInventoryItems)} />
          <Metric label="Health" value={connected ? `${account.health.pulseScore}%` : "n/a"} valueClass={connected ? toneText[pulseTone(account.health.pulseScore)] : "text-muted-foreground"} bordered />
        </dl>

        {account.capabilityTags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Capabilities">
            {account.capabilityTags.map((t) => (
              <li key={t} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                {TAG_LABEL[t] ?? t}
              </li>
            ))}
          </ul>
        )}

        {syncing && (
          <div className="mt-3 space-y-1" aria-live="polite">
            <p className="text-[11px] font-medium text-blue-700">Syncing{account.syncProgress !== null ? `: ${account.syncProgress}%` : "..."}</p>
            {account.syncProgress !== null && <Bar value={account.syncProgress} tone="info" label={`${account.name} sync progress`} />}
          </div>
        )}

        {account.health.frictionPoints.length > 0 && (
          <div className="mt-3.5 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-xs text-amber-900">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
              Attention required:
            </div>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-amber-800">
              {account.health.frictionPoints.map((pt) => (
                <li key={pt}>{pt}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-3 border-t border-border pt-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            Synced {ago(account.lastSyncAt)}
            {account.nextSyncAt ? ` · next ${new Date(account.nextSyncAt).getTime() > Date.now() ? "in " + untilText(account.nextSyncAt) : "due now"}` : ""}
          </span>
          {token && <span className={token.tone === "bad" ? "font-medium text-red-600" : token.tone === "warn" ? "font-medium text-amber-600" : ""}>{token.text}</span>}
        </div>
        <div className="flex justify-end">
          <HubAccountActions account={account} />
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value, bordered, valueClass }: { label: string; value: string; bordered?: boolean; valueClass?: string }) {
  return (
    <div className={bordered ? "border-l border-border" : undefined}>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 font-mono text-sm font-bold text-foreground", valueClass)}>{value}</dd>
    </div>
  );
}

/** "12 min" / "3h" until an ISO time */
function untilText(iso: string): string {
  const min = Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  return min < 60 ? `${min} min` : `${Math.round(min / 60)}h`;
}
