import { Button } from "@/components/ui/button";
import { ago, JOB_TYPE_LABEL, describeJob } from "@/components/marketplace-hub/accounts/hubFormat";
import { formatNumber } from "@/utils/format";
import type { DirectoryItem } from "@/types/directory";
import type { HubAccountCard, HubSyncJob } from "@/types/hub";
import { SetupFooterNote } from "./SetupNotices";

interface SetupReadyStepProps {
  item: DirectoryItem;
  businessName: string;
  /** the account as the hub reports it now (live counts, health), when loaded */
  account: HubAccountCard | null;
  /** the jobs of the first sync, finished */
  jobs: HubSyncJob[];
  totalProducts?: number;
  totalVariants?: number;
  onManageConnection: () => void;
  onViewProducts: () => void;
  onViewListings: () => void;
  onViewSyncActivity: () => void;
}

export function SetupReadyStep({ item, businessName, account, jobs, totalProducts, totalVariants, onManageConnection, onViewProducts, onViewListings, onViewSyncActivity }: SetupReadyStepProps) {
  const ranSync = jobs.length > 0;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">{item.name}</span>
            <span className="text-muted-foreground capitalize">
              {item.category === "storefront" ? "Storefront" : item.category === "shipping" ? "Shipping carrier" : "Marketplace"}
            </span>
          </div>
          <span className="font-medium text-foreground">{businessName}</span>
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">{item.name} is connected.</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {ranSync ? "Your account is connected and the initial synchronization has finished." : "Your account is connected."}
          </p>
        </div>

        <div>
          <h3 className="text-2xl font-bold tracking-tight text-foreground">{account ? (account.status === "healthy" ? "Connected" : account.status === "paused" ? "Paused" : "Connected · needs a look") : "Connected"}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {businessName} · {item.name}
            {account?.accountIdentifier ? ` · ${account.accountIdentifier}` : ""}
            {account?.mode === "sandbox" ? " · Sandbox" : ""}
          </p>
        </div>

        {account && (
          <div className="flex flex-wrap items-baseline gap-12 py-1">
            <div>
              <span className="text-3xl font-bold tracking-tight text-foreground">{formatNumber(account.stats.activeListings)}</span>
              <p className="text-xs text-muted-foreground mt-0.5">active listings</p>
            </div>
            <div>
              <span className="text-3xl font-bold tracking-tight text-foreground">{formatNumber(account.stats.syncedInventoryItems)}</span>
              <p className="text-xs text-muted-foreground mt-0.5">stock levels synced</p>
            </div>
            <div>
              <span className="text-3xl font-bold tracking-tight text-foreground">{formatNumber(account.stats.pendingOrders)}</span>
              <p className="text-xs text-muted-foreground mt-0.5">open orders</p>
            </div>
          </div>
        )}

        <div className="divide-y divide-neutral-100 text-xs">
          {account && (
            <>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Connection health</span>
                <span className="font-semibold text-foreground">{account.health.pulseScore}%</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Last sync</span>
                <span className="font-semibold text-foreground">{account.lastSyncAt ? ago(account.lastSyncAt) : "never"}</span>
              </div>
            </>
          )}
          {jobs.map((j) => (
            <div key={j.id} className="flex justify-between py-2.5">
              <span className="text-muted-foreground">{JOB_TYPE_LABEL[j.type] ?? j.type}</span>
              <span className="font-semibold text-foreground">
                {describeJob(j).label}
                {j.progress.total > 0 ? ` · ${formatNumber(j.progress.done)} of ${formatNumber(j.progress.total)}` : ""}
              </span>
            </div>
          ))}
          {totalProducts !== undefined && (
            <div className="flex justify-between py-2.5">
              <span className="text-muted-foreground">Master catalogue</span>
              <span className="font-semibold text-foreground">
                {formatNumber(totalProducts)} products{totalVariants !== undefined ? ` · ${formatNumber(totalVariants)} variants` : ""}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3 pt-2">
          <div>
            <Button onClick={onManageConnection} className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold">
              Manage connection
            </Button>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button variant="outline" onClick={onViewProducts} className="text-xs h-8 px-3">
              View products
            </Button>
            <Button variant="outline" onClick={onViewListings} className="text-xs h-8 px-3">
              View listings
            </Button>
            <Button variant="outline" onClick={onViewSyncActivity} className="text-xs h-8 px-3">
              View sync activity
            </Button>
          </div>
        </div>

        <SetupFooterNote connectorName={item.name} />
      </div>
    </div>
  );
}
