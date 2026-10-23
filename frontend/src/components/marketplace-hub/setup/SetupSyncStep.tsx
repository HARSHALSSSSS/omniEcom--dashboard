import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { DirectoryItem } from "@/types/directory";

export type SyncStateMode = "ready" | "syncing" | "error" | "partial";

export interface LiveActivityItem {
  time: string;
  text: string;
}

interface SetupSyncStepProps {
  item: DirectoryItem;
  businessName: string;
  syncStateMode?: SyncStateMode;
  totalProducts?: number;
  totalVariants?: number;
  activityLogs?: LiveActivityItem[];
  productsDetected?: number;
  productsSynced?: number;
  productsFailed?: number;
  onStartInitialSync: () => void;
  onContinueToWorkspace: () => void;
  onRetrySync: () => void;
  onManageConnection: () => void;
  onCancel: () => void;
}

export function SetupSyncStep({
  item,
  businessName,
  syncStateMode = "ready",
  totalProducts = 427,
  totalVariants = 1286,
  activityLogs: propActivityLogs,
  productsDetected = 427,
  productsSynced = 412,
  productsFailed = 15,
  onStartInitialSync,
  onContinueToWorkspace,
  onRetrySync,
  onManageConnection,
  onCancel,
}: SetupSyncStepProps) {
  // Fallback activity timeline items for live sync state if no real logs yet
  const [simulatedLogs, setSimulatedLogs] = useState<LiveActivityItem[]>([
    { time: "5:42 PM", text: "Connected account verified" },
    { time: "5:43 PM", text: "Catalog matching started" },
    { time: "5:43 PM", text: `${totalProducts} products detected` },
  ]);

  useEffect(() => {
    if (syncStateMode === "syncing" && (!propActivityLogs || propActivityLogs.length === 0)) {
      const timer1 = setTimeout(() => {
        setSimulatedLogs((prev) => [
          ...prev,
          { time: "5:44 PM", text: "318 products matched" },
        ]);
      }, 1200);

      const timer2 = setTimeout(() => {
        setSimulatedLogs((prev) => [
          ...prev,
          { time: "5:44 PM", text: "Inventory sync started" },
        ]);
      }, 2500);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [syncStateMode, propActivityLogs]);

  const activeLogs = propActivityLogs && propActivityLogs.length > 0 ? propActivityLogs : simulatedLogs;

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

        {/* SUBSTATE 1: Ready to sync */}
        {syncStateMode === "ready" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Ready to sync
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Confirm the data to include in your initial synchronization.
              </p>
            </div>

            {/* Big Stats */}
            <div className="flex items-baseline gap-12 py-2">
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
                <span className="text-muted-foreground">Inventory data</span>
                <span className="font-semibold text-foreground">Included</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Order data</span>
                <span className="font-semibold text-foreground">Included</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Account</span>
                <span className="font-medium text-foreground">{businessName}</span>
              </div>
            </div>

            <div className="pt-2 space-y-1">
              <p className="text-sm font-bold text-foreground">Start when you&apos;re ready</p>
              <p className="text-xs font-semibold text-foreground">This may take some time.</p>
              <p className="text-xs text-muted-foreground">
                You can continue working while synchronization runs.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={onStartInitialSync}
                className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold"
              >
                Start initial sync
              </Button>
              <Button
                variant="outline"
                onClick={onCancel}
                className="text-xs h-9 px-4"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* SUBSTATE 2: Sync in progress */}
        {syncStateMode === "syncing" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Sync in progress
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Your {item.name} data is being synchronized with the workspace.
              </p>
              <p className="mt-2 text-xs font-semibold text-foreground flex items-center gap-2">
                <span className="h-2 w-2 rounded-sm bg-black" />
                Catalog matching and inventory synchronization running
              </p>
            </div>

            {/* Live activity timeline */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-foreground">Live activity</h3>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="relative pl-6 space-y-4 text-xs">
                  <div className="absolute left-2 top-2 bottom-2 w-[1px] bg-neutral-200" />
                  {activeLogs.map((log, i) => (
                    <div key={i} className="relative flex items-center justify-between">
                      <span className="absolute -left-6 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border-2 border-black bg-white" />
                      <span className="font-medium text-foreground">{log.text}</span>
                      <span className="text-[11px] text-muted-foreground">{log.time}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Activity records completed checks and work started. Stream percentages reflect ongoing synchronization.
              </p>
            </div>

            <div className="pt-2 space-y-2">
              <Button
                onClick={onContinueToWorkspace}
                className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold"
              >
                Continue to workspace
              </Button>
              <p className="text-xs font-bold text-foreground">
                You can continue working elsewhere.
              </p>
            </div>
          </div>
        )}

        {/* SUBSTATE 3: Sync error */}
        {syncStateMode === "error" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Connection active · Sync needs attention
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {item.name} is connected, but the latest synchronization could not complete.
              </p>
            </div>

            <div className="divide-y divide-neutral-100 text-xs">
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Last successful sync</span>
                <span className="font-medium text-foreground">Today · 4:18 PM</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Affected</span>
                <span className="font-semibold text-foreground">Products · Inventory</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Connection</span>
                <span className="font-semibold text-foreground">Active</span>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 space-y-2 text-xs">
              <p className="font-bold text-foreground">Possible reason</p>
              <p className="text-muted-foreground">Marketplace data may be temporarily unavailable.</p>
              <p className="text-[11px] text-muted-foreground">This is a possible reason, not a confirmed diagnosis.</p>
            </div>

            <div className="space-y-1 text-xs">
              <p className="font-bold text-foreground">Recommended action</p>
              <p className="text-muted-foreground">
                Review the issue and retry synchronization for the affected areas.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={onManageConnection}
                className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold"
              >
                Review issue
              </Button>
              <Button
                variant="outline"
                onClick={onRetrySync}
                className="text-xs h-9 px-4"
              >
                Retry sync
              </Button>
            </div>
          </div>
        )}

        {/* SUBSTATE 4: Partial sync */}
        {syncStateMode === "partial" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {item.name} connected.
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                The connection is active, but some data requires attention.
              </p>
            </div>

            {/* Big 3 Stats */}
            <div className="flex items-baseline gap-10 py-2">
              <div>
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  {productsDetected.toLocaleString()}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">products detected</p>
              </div>
              <div>
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  {productsSynced.toLocaleString()}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">synchronized</p>
              </div>
              <div>
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  {productsFailed.toLocaleString()}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">require attention</p>
              </div>
            </div>

            <div className="divide-y divide-neutral-100 text-xs">
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Connection</span>
                <span className="font-semibold text-foreground">Active</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Initial synchronization</span>
                <span className="font-semibold text-foreground">Completed with exceptions</span>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 space-y-2 text-xs">
              <p className="font-bold text-foreground">Review the remaining products</p>
              <p className="font-semibold text-foreground">
                {productsSynced.toLocaleString()} products have synchronized successfully.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Review the {productsFailed.toLocaleString()} products requiring attention before completing their synchronization. The connection remains active while you review these items.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={onManageConnection}
                className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold"
              >
                Review issues
              </Button>
              <Button
                variant="outline"
                onClick={onManageConnection}
                className="text-xs h-9 px-4"
              >
                Manage connection
              </Button>
            </div>
          </div>
        )}

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
