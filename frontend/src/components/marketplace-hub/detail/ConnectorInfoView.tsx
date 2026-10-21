import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCan } from "@/hooks/useCan";
import type { ConnectorInfo, HubAccountCard } from "@/types/hub";
import { WRITE_REASON, ago } from "../accounts/hubFormat";
import { ChannelIcon, HubStatusPill, Pill } from "../accounts/hubUi";
import { CapabilityMatrix } from "./CapabilityMatrix";

const AUTH_MODE = { redirect: "Approve on the marketplace", credentials: "Paste API credentials", both: "Approve on the marketplace or paste API credentials" } as const;

interface ConnectorInfoViewProps {
  connector: ConnectorInfo;
  /** the seller's accounts on this connector (null while they load or when they could not be read) */
  accounts: HubAccountCard[] | null;
}

/** /marketplace-hub/connectors/:code: what the marketplace supports, how to connect it, and the seller's accounts on it. */
export function ConnectorInfoView({ connector, accounts }: ConnectorInfoViewProps) {
  const canWrite = useCan("marketplace_accounts:write");
  const planned = connector.implementation === "planned";
  const blocked = !canWrite ? WRITE_REASON : planned ? `${connector.displayName} is not available yet.` : null;
  const required = connector.authFlow.fields.filter((f) => f.required);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex min-w-0 items-center gap-4">
          <ChannelIcon category={connector.category} />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">{connector.displayName}</h2>
              {connector.implementation === "beta" && <Pill tone="warn">Beta</Pill>}
              {planned && <Pill tone="neutral">Coming soon</Pill>}
              {connector.authFlow.partnerGated && <Pill tone="info">Partner approval needed</Pill>}
            </div>
            <p className="max-w-2xl text-xs text-muted-foreground">{connector.description}</p>
          </div>
        </div>
        <span title={blocked ?? undefined}>
          {blocked ? (
            <Button size="sm" disabled>
              Connect
            </Button>
          ) : (
            <Link to={`/marketplace-hub/connect/${connector.code}`} className={buttonVariants({ size: "sm" })}>
              Connect
            </Link>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="how-title" className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 id="how-title" className="text-base font-semibold text-foreground">
            How it connects
          </h3>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Method</dt>
              <dd className="mt-0.5">{AUTH_MODE[connector.authFlow.mode]}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Authentication</dt>
              <dd className="mt-0.5 font-mono text-xs">{connector.authType}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Access token</dt>
              <dd className="mt-0.5">{connector.refreshableTokens ? "Renewed automatically" : "Does not renew by itself"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Regions</dt>
              <dd className="mt-0.5">{connector.supportedRegions.join(", ") || "Not specified"}</dd>
            </div>
          </dl>
          {required.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">You will need</p>
              <ul className="mt-1 list-inside list-disc text-xs text-foreground">
                {required.map((f) => (
                  <li key={f.key}>{f.label}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="mine-title" className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 id="mine-title" className="text-base font-semibold text-foreground">
            Your accounts
          </h3>
          {accounts === null ? (
            <p className="text-xs text-muted-foreground">Your accounts could not be loaded.</p>
          ) : accounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">You have no {connector.displayName} account connected yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 p-3 text-xs">
                  <div className="min-w-0">
                    <Link to={`/marketplace-hub/connectors/${a.id}`} className="font-semibold text-foreground hover:underline">
                      {a.name}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">
                      {a.accountIdentifier ? `${a.accountIdentifier} · ` : ""}Synced {ago(a.lastSyncAt)}
                    </p>
                  </div>
                  <HubStatusPill account={a} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="matrix-title" className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 id="matrix-title" className="text-base font-semibold text-foreground">
          What {connector.displayName} supports
        </h3>
        <CapabilityMatrix matrix={connector.capabilities} />
      </section>
    </div>
  );
}
