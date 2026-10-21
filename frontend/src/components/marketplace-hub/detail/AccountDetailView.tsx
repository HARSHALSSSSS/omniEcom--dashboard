import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { formatDateTime, formatNumber } from "@/utils/format";
import type { HubAccountDetail } from "@/types/hub";
import { HubAccountActions } from "../accounts/HubAccountActions";
import { TAG_LABEL, ago, laneLabel, laneTone, pulseTone, tokenText } from "../accounts/hubFormat";
import { Bar, ChannelIcon, HubStatusPill, Pill } from "../accounts/hubUi";
import { CapabilityMatrix } from "./CapabilityMatrix";
import { JobsTable } from "./JobsTable";

function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 id={id} className="text-base font-semibold text-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}

const toneText = { good: "text-emerald-600", warn: "text-amber-600", bad: "text-red-600", info: "text-blue-600", neutral: "text-foreground" } as const;

/** /marketplace-hub/connectors/:accountId: one connection in depth (GET /marketplace-hub/accounts/{id}). */
export function AccountDetailView({ account }: { account: HubAccountDetail }) {
  const navigate = useNavigate();
  const token = tokenText(account);
  const connected = account.accountStatus === "active" || account.accountStatus === "paused";
  const policy = account.inventoryPolicy;
  const listingStatuses = Object.entries(account.listingsByStatus);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex min-w-0 items-center gap-4">
          <ChannelIcon category={account.category} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold text-foreground">{account.name}</h2>
              <HubStatusPill account={account} />
              {account.mode === "sandbox" && <Pill tone="info">Sandbox</Pill>}
              {account.implementation === "beta" && <Pill tone="warn">Beta</Pill>}
            </div>
            <p className="text-xs text-muted-foreground">
              <Link to={`${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${account.marketplace}`} className="hover:underline">
                {account.connectorName}
              </Link>
              {account.accountIdentifier ? ` · ${account.accountIdentifier}` : ""} · Region {account.region}
            </p>
          </div>
        </div>
        <HubAccountActions account={account} onDeleted={() => navigate(ROUTES.MARKETPLACE_HUB)} />
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:grid-cols-5">
        <Fact label="Active listings" value={<span className="font-mono font-bold">{formatNumber(account.stats.activeListings)}</span>} />
        <Fact label="Pending orders" value={<span className="font-mono font-bold">{formatNumber(account.stats.pendingOrders)}</span>} />
        <Fact label="Stock synced" value={<span className="font-mono font-bold">{formatNumber(account.stats.syncedInventoryItems)}</span>} />
        <Fact label="Errors" value={<span className={`font-mono font-bold ${account.stats.errorCount > 0 ? "text-red-600" : ""}`}>{formatNumber(account.stats.errorCount)}</span>} />
        <Fact
          label="Health score"
          value={connected ? <span className={`font-mono font-bold ${toneText[pulseTone(account.health.pulseScore)]}`}>{account.health.pulseScore}%</span> : <span className="text-muted-foreground">n/a</span>}
        />
      </dl>

      {account.health.frictionPoints.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden /> Attention required:
          </div>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-amber-800">
            {account.health.frictionPoints.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Sync and credentials" id="sync-title">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Last sync" value={account.lastSyncAt ? `${ago(account.lastSyncAt)} (${formatDateTime(account.lastSyncAt)})` : "Never"} />
            <Fact label="Next sync" value={account.nextSyncAt ? formatDateTime(account.nextSyncAt) : "Not scheduled"} />
            <Fact label="Sync state" value={account.syncState === "syncing" ? `Syncing${account.syncProgress !== null ? `: ${account.syncProgress}%` : ""}` : account.syncState === "error" ? "Last run failed" : account.syncState === "paused" ? "Paused" : "Idle"} />
            <Fact label="Success rate (24h)" value={account.health.syncSuccessRate24h === null ? "No finished runs" : `${account.health.syncSuccessRate24h}% (${account.health.syncRuns24h.finished} runs)`} />
            <Fact label="Connected since" value={account.connectedAt ? formatDateTime(account.connectedAt) : "Not connected"} />
            <Fact label="Credential" value={token ? token.text : "No credential stored"} />
            {account.authorization && (
              <>
                <Fact label="Authorization" value={`${account.authorization.status}, rotated ${account.authorization.rotationCount} ${account.authorization.rotationCount === 1 ? "time" : "times"}`} />
                <Fact label="Last refreshed" value={account.authorization.lastRefreshedAt ? ago(account.authorization.lastRefreshedAt) : "Never"} />
              </>
            )}
          </dl>
          {account.syncState === "syncing" && account.syncProgress !== null && <Bar value={account.syncProgress} tone="info" label="Sync progress" />}
          {account.authorization && account.authorization.scopes.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Scopes: {account.authorization.scopes.join(", ")}</p>
          )}
        </Section>

        <Section title="Data flow, last 24 hours" id="lanes-title">
          <ul className="space-y-3">
            {account.lanes.map((l) => (
              <li key={l.key} className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{l.label}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-mono">{l.successRate === null ? "No runs" : `${l.successRate}%`}</span>
                    <Pill tone={laneTone(l.status)}>{laneLabel(l.status)}</Pill>
                  </span>
                </div>
                <Bar value={l.successRate ?? 0} tone={laneTone(l.status)} label={`${l.label} success rate`} />
                {l.jobs > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {l.jobs} {l.jobs === 1 ? "run" : "runs"}, {l.failed} failed · {formatNumber(l.itemsPerHour)} items/hour
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Inventory policy" id="policy-title">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Stock pushes" value={policy.mode === "sync" ? "Active" : "Paused"} />
            <Fact label="Share of stock" value={`${policy.allocationPercent}%`} />
            <Fact label="Safety buffer" value={`${policy.safetyBuffer} units`} />
            <Fact label="Cap per listing" value={policy.maxQuantity === null ? "None" : `${policy.maxQuantity} units`} />
            <Fact label="Warehouses" value={policy.warehouseIds.length === 0 ? "All active" : `${policy.warehouseIds.length} selected`} />
          </dl>
          {policy.isDefault && <p className="text-[11px] text-muted-foreground">Default policy: nothing has been customised for this account.</p>}
        </Section>

        <Section title="Webhooks and listings" id="webhook-title">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Webhooks" value={!account.webhook.supported ? "Not supported by this marketplace" : account.webhook.configured ? "Signing secret set" : "No signing secret"} />
            <Fact label="Last event" value={account.webhook.lastEventAt ? ago(account.webhook.lastEventAt) : "None received"} />
          </dl>
          {Object.keys(account.webhook.events24h).length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Last 24 hours: {Object.entries(account.webhook.events24h).map(([k, n]) => `${n} ${k}`).join(", ")}
            </p>
          )}
          {listingStatuses.length > 0 ? (
            <ul className="flex flex-wrap gap-2 pt-1" aria-label="Listings by status">
              {listingStatuses.map(([k, n]) => (
                <li key={k} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
                  {k.replace(/_/g, " ")}: <span className="font-mono text-foreground">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground">No listings on this account yet.</p>
          )}
        </Section>
      </div>

      <Section title="Capabilities" id="caps-title">
        <ul className="flex flex-wrap gap-1.5" aria-label="Capability tags">
          {account.capabilityTags.map((t) => (
            <li key={t} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              {TAG_LABEL[t] ?? t}
            </li>
          ))}
        </ul>
        <CapabilityMatrix matrix={account.capabilityMatrix} />
        {account.readiness.notes && (
          <p className="text-[11px] text-muted-foreground">
            {account.readiness.live ? "Verified for live use." : "Not yet verified for live use."} {account.readiness.notes}
          </p>
        )}
      </Section>

      <Section title="Recent sync runs" id="jobs-title">
        <JobsTable jobs={account.recentJobs} />
      </Section>
    </div>
  );
}
