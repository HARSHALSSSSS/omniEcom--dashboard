import { Link } from "react-router-dom";
import { Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { useHubAccounts } from "@/hooks/useHub";
import { useCan } from "@/hooks/useCan";
import { useCarriers } from "@/hooks/useShipping";
import { ago, displayStatus, type Tone } from "@/components/marketplace-hub/accounts/hubFormat";
import type { HubAccountCard } from "@/types/hub";

/** an account counts as connected only while it is authorised and the connection answers (a revoked or unauthorised account does not) */
export const isConnected = (a: Pick<HubAccountCard, "accountStatus" | "connectionStatus">): boolean => a.accountStatus === "active" && (a.connectionStatus === "connected" || a.connectionStatus === "degraded");

const TONE: Record<Tone, string> = {
  good: "bg-emerald-500/10 text-emerald-600",
  warn: "bg-amber-500/10 text-amber-700",
  bad: "bg-red-500/10 text-red-700",
  info: "bg-blue-500/10 text-blue-700",
  neutral: "bg-muted text-muted-foreground",
};

/** the real connections of this business: marketplace accounts from the hub and the shipping providers (carriers), each linking to where they are managed */
export function IntegrationsTab() {
  const accounts = useHubAccounts();
  const canShip = useCan("shipping:read");
  const carriers = useCarriers(canShip);
  const items = accounts.data?.items ?? [];
  const connected = items.filter(isConnected).length;

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-border/80 pb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Connected Marketplace Channels &amp; Courier APIs</h3>
          <p className="mt-1 text-xs text-muted-foreground">{accounts.isLoading ? "Loading your connections..." : `${connected} of ${items.length} marketplace account${items.length === 1 ? "" : "s"} connected.`}</p>
        </div>
        <Link to={ROUTES.MARKETPLACE_HUB} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
          Open Marketplace Hub &rarr;
        </Link>
      </div>

      {accounts.isError && !accounts.data ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-border p-4 text-xs">
          <span className="text-rose-700">{errorMessage(accounts.error, "Your connections could not be loaded.")}</span>
          <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => void accounts.refetch()}>
            Retry
          </Button>
        </div>
      ) : accounts.isLoading ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading...
        </p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
          <Plug className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">No marketplace is connected yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">Connect a marketplace or storefront to sync orders, listings and stock.</p>
          <Link to={ROUTES.MARKETPLACE_HUB} className="mt-1 text-xs font-semibold text-foreground underline">
            Connect a marketplace
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((a) => {
            const st = displayStatus(a);
            return (
              <Link key={a.id} to={`${ROUTES.MARKETPLACE_HUB}?account=${a.id}`} className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 p-4 hover:bg-muted/40">
                <div className="min-w-0">
                  <span className="text-sm font-bold text-foreground">{a.name}</span>
                  <p className="text-xs text-muted-foreground">
                    {a.connectorName} · {a.mode === "sandbox" ? "Sandbox" : "Live"} · last sync {ago(a.lastSyncAt)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Health {a.health.pulseScore}/100</p>
                </div>
                <Badge className={`font-mono text-[10px] font-bold ${TONE[st.tone]}`}>{st.label.toUpperCase()}</Badge>
              </Link>
            );
          })}
        </div>
      )}

      <div className="space-y-3 border-t border-border/80 pt-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">Shipping providers</h4>
          {canShip && (
            <Link to={ROUTES.SHIPPING} className="text-xs font-semibold text-foreground underline">
              Manage in Shipping
            </Link>
          )}
        </div>
        {!canShip ? (
          <p className="text-xs text-muted-foreground">Viewing shipping providers needs the shipping:read permission.</p>
        ) : carriers.isError ? (
          <p role="alert" className="text-xs text-rose-700">
            {errorMessage(carriers.error, "The shipping providers could not be loaded.")}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void carriers.refetch()}>
              Retry
            </button>
          </p>
        ) : carriers.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : (carriers.data?.items.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">No shipping provider is set up yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {carriers.data!.items.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 p-4">
                <div>
                  <span className="text-sm font-bold text-foreground">{c.name}</span>
                  <p className="text-xs text-muted-foreground">
                    {c.providerCode} · {c.verification.state === "verified" ? "verified" : "not verified"} · {c.shipmentsLast30d} shipments in 30 days
                  </p>
                </div>
                <Badge className={`font-mono text-[10px] font-bold ${c.status === "active" ? TONE.good : TONE.neutral}`}>{c.status.toUpperCase()}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
