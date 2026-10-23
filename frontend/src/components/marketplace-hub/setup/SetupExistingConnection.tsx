import { Button } from "@/components/ui/button";
import type { DirectoryItem } from "@/types/directory";

interface SetupExistingConnectionProps {
  item: DirectoryItem;
  businessName: string;
  workspaceName: string;
  onManageExisting: () => void;
  onSetupNewConnection?: () => void;
}

export function SetupExistingConnection({
  item,
  businessName,
  workspaceName,
  onManageExisting,
  onSetupNewConnection,
}: SetupExistingConnectionProps) {
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
            Existing connection found.
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            This workspace already has a {item.name} connection.
          </p>
        </div>

        <div className="divide-y divide-neutral-100 text-xs">
          <div className="flex justify-between py-2.5">
            <span className="text-muted-foreground">Business</span>
            <span className="font-medium text-foreground">{businessName}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-muted-foreground">Connector</span>
            <span className="font-semibold text-foreground">{item.name}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-muted-foreground">Workspace</span>
            <span className="font-medium text-foreground">{workspaceName}</span>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-5 space-y-3 text-xs">
          <p className="font-bold text-foreground">
            Manage the connection already in this workspace
          </p>
          <p className="font-semibold text-foreground">Connection setup is paused.</p>
          <p className="text-muted-foreground leading-relaxed">
            Open the existing connection to review its account access, synchronization activity and marketplace settings. No new connection has been created.
          </p>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <Button
            onClick={onManageExisting}
            className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold"
          >
            Manage existing connection
          </Button>
          {onSetupNewConnection && (
            <Button
              variant="outline"
              onClick={onSetupNewConnection}
              className="text-xs h-9 px-4"
            >
              Set up another account
            </Button>
          )}
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
