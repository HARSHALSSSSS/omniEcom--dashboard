import { useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Activity, ExternalLink, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useHubAccounts } from "@/hooks/useHub";
import { formatNumber } from "@/utils/format";
import type { AccountFilters, HubAccounts } from "@/types/hub";
import { HubAccountTile } from "@/components/marketplace-hub/accounts/HubAccountTile";
import { HubToolbar } from "@/components/marketplace-hub/accounts/HubToolbar";
import { applyFilters, filtersFromParams, hasFilters, paramsFromFilters } from "@/components/marketplace-hub/accounts/hubFilters";
import { LoadError, StateBox } from "@/components/marketplace-hub/accounts/hubUi";

function Kpi({ label, value, caption, valueClass = "text-foreground", captionClass = "text-muted-foreground" }: { label: string; value: string; caption: string; valueClass?: string; captionClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className={`font-mono text-2xl font-bold ${valueClass}`}>{value}</span>
        <span className={`text-right text-xs ${captionClass}`}>{caption}</span>
      </div>
    </div>
  );
}

function KpiRibbon({ data }: { data: HubAccounts }) {
  const { items, summary } = data;
  const listings = items.reduce((n, a) => n + a.stats.activeListings, 0);
  const pending = items.reduce((n, a) => n + a.stats.pendingOrders, 0);
  const platforms = new Set(items.map((a) => a.marketplace)).size;
  const attention = summary.warning + summary.error;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi label="Connected Channels" value={formatNumber(summary.total)} caption={`${summary.healthy} healthy`} captionClass="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700" />
      <Kpi label="Multi-Channel Listings" value={formatNumber(listings)} caption={`Across ${platforms} ${platforms === 1 ? "platform" : "platforms"}`} />
      <Kpi label="Open Orders" value={formatNumber(pending)} caption="Not yet dispatched" />
      <Kpi
        label="Attention Items"
        value={formatNumber(attention)}
        caption={attention === 0 ? "All connections fine" : `${summary.error} error, ${summary.warning} warning`}
        valueClass={attention > 0 ? "text-amber-600" : "text-foreground"}
      />
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading connections">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-[330px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function MarketplaceHubPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canWrite = useCan("marketplace_accounts:write");
  const accounts = useHubAccounts();
  const filters = filtersFromParams(params);

  const change = useCallback(
    (patch: Partial<AccountFilters>) => setParams(paramsFromFilters({ ...filtersFromParams(params), ...patch }), { replace: true }),
    [params, setParams],
  );

  const data = accounts.data;
  const visible = data ? applyFilters(data.items, filters) : [];

  return (
    <div className="w-full space-y-6 pb-16">
      <PageHeader
        eyebrow="COMMERCE INTEGRATIONS"
        title="Marketplace Hub"
        description="Unified control room for your connected marketplaces, storefronts, and 3PL carriers."
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(ROUTES.MARKETPLACE_HUB_HEALTH)}>
              <Activity className="h-4 w-4 text-emerald-600" aria-hidden />
              Network Health DNA
            </Button>
            <Button size="sm" className="gap-2" onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}>
              <Plus className="h-4 w-4" aria-hidden /> Add Channel Connection
            </Button>
          </div>
        }
      />

      {accounts.isPending && <Loading />}
      {accounts.isError && <LoadError title="Connections could not be loaded." message={errorMessage(accounts.error)} onRetry={() => void accounts.refetch()} />}

      {data && data.items.length === 0 && (
        <StateBox title="No marketplace connected yet" description="Connect Amazon, Flipkart, Shopify or another channel to import orders and sync stock and listings.">
          <Button size="sm" className="text-xs" onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}>
            Connect a marketplace
          </Button>
        </StateBox>
      )}

      {data && data.items.length > 0 && (
        <>
          <KpiRibbon data={data} />
          {!canWrite && (
            <p role="status" className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              You have read-only access. Syncing, testing and changing connections needs the marketplace_accounts:write permission.
            </p>
          )}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <HubToolbar items={data.items} filters={filters} onChange={change} />
            </div>
            <Link to={ROUTES.MARKETPLACE_HUB_CONNECTORS} className="inline-flex shrink-0 items-center gap-1.5 pt-1.5 text-xs text-muted-foreground hover:text-foreground">
              Explore Directory <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          {visible.length === 0 ? (
            <StateBox title="No connections match these filters." description="Try a different search, marketplace or status.">
              {hasFilters(filters) && (
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setParams({}, { replace: true })}>
                  Clear filters
                </Button>
              )}
            </StateBox>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {visible.map((a) => (
                <HubAccountTile key={a.id} account={a} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
