import { Button } from "@/components/ui/button";
import type { DirectoryItem } from "@/types/directory";

interface SetupReadyStepProps {
  item: DirectoryItem;
  businessName: string;
  totalProducts?: number;
  totalVariants?: number;
  onManageConnection: () => void;
  onViewProducts: () => void;
  onViewListings: () => void;
  onViewSyncActivity: () => void;
}

export function SetupReadyStep({
  item,
  businessName,
  totalProducts = 427,
  totalVariants = 1286,
  onManageConnection,
  onViewProducts,
  onViewListings,
  onViewSyncActivity,
}: SetupReadyStepProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">
        {/* Top Header Row */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">{item.name}</span>
            <span className="text-muted-foreground capitalize">
              {item.category === "storefront"
                ? "Storefront"
                : item.category === "shipping"
                  ? "Shipping carrier"
                  : "Marketplace"}
            </span>
          </div>
          <span className="font-medium text-foreground">{businessName}</span>
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {item.name} is connected.
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Your account is now connected and the initial synchronization has completed.
          </p>
        </div>

        <div>
          <h3 className="text-2xl font-bold tracking-tight text-foreground">Connected</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {businessName} · {item.name}
          </p>
        </div>

        {/* Big Stats */}
        <div className="flex items-baseline gap-12 py-1">
          <div>
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {totalProducts.toLocaleString()}
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">products</p>
          </div>
          <div>
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {totalVariants.toLocaleString()}
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">variants</p>
          </div>
        </div>

        <div className="divide-y divide-neutral-100 text-xs">
          <div className="flex justify-between py-2.5">
            <span className="text-muted-foreground">Inventory</span>
            <span className="font-semibold text-foreground">Inventory synced</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-muted-foreground">Orders</span>
            <span className="font-semibold text-foreground">Orders syncing</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <div>
            <Button
              onClick={onManageConnection}
              className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold"
            >
              Manage connection
            </Button>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="outline"
              onClick={onViewProducts}
              className="text-xs h-8 px-3"
            >
              View products
            </Button>
            <Button
              variant="outline"
              onClick={onViewListings}
              className="text-xs h-8 px-3"
            >
              View listings
            </Button>
            <Button
              variant="outline"
              onClick={onViewSyncActivity}
              className="text-xs h-8 px-3"
            >
              View sync activity
            </Button>
          </div>
        </div>

        {/* Pricing notice */}
        <div className="border-t border-neutral-100 pt-4 text-xs text-muted-foreground space-y-1">
          <p className="text-[11px]">
            Connecting does not publish products automatically. You will review catalog mapping and marketplace workflows before activating them.
          </p>
          <div className="text-[11px] text-neutral-500 pt-1">
            <span className="font-medium text-foreground">Connector add-on · ₹499 / month · ₹4,999 / year</span>
            <span className="block mt-0.5">Monthly billing · Demo pricing only · Separate from workspace plan</span>
          </div>
        </div>
      </div>
    </div>
  );
}
