import { Check, AlertCircle } from "lucide-react";
import { cn } from "@/utils/cn";

export type SetupStage =
  | "review"
  | "authorize"
  | "waiting"
  | "auth_failure"
  | "verified"
  | "ready_to_sync"
  | "syncing"
  | "sync_error"
  | "partial_sync"
  | "connected"
  | "existing";

interface SetupStatusSidebarProps {
  connectorName: string;
  stage: SetupStage;
  /** master catalogue size, shown only when known */
  totalProducts?: number;
  totalVariants?: number;
  /** real progress of the running sync jobs (0-100); null while nothing reports a total */
  syncProgress?: number | null;
  productProgress?: number | null;
  inventoryProgress?: number | null;
  orderProgress?: number | null;
  /** the connect call already queued the first sync */
  firstSyncQueued?: boolean;
  /** items the finished sync could not process */
  failedItems?: number;
  /** the connected account's live health, when the account exists */
  health?: { label: string; score: number } | null;
  /** facts of the connector itself: readiness, limits, order events */
  facts?: { environment: string; requestLimit: string; orderEvents: string } | null;
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);

export function SetupStatusSidebar({
  connectorName,
  stage,
  totalProducts,
  totalVariants,
  syncProgress,
  productProgress,
  inventoryProgress,
  orderProgress,
  firstSyncQueued = false,
  failedItems = 0,
  health,
  facts,
}: SetupStatusSidebarProps) {
  // Derive badge top right of "Connection status"
  const getStatusBadge = () => {
    switch (stage) {
      case "review":
      case "authorize":
        return "Not connected";
      case "waiting":
        return "In progress";
      case "auth_failure":
        return "Not connected";
      case "verified":
        return "Verified";
      case "ready_to_sync":
        return "Sync ready";
      case "syncing":
        return "Active";
      case "sync_error":
      case "partial_sync":
        return "Active";
      case "connected":
        return health?.label ?? "Connected";
      case "existing":
        return "Existing";
    }
  };

  // Derive checklist items states
  const getAccountStatus = () => {
    if (stage === "existing") return { label: "Existing connection", state: "done" };
    if (stage === "review") return { label: "Not authorized", state: "pending" };
    if (stage === "authorize") return { label: "Not authorized", state: "pending" };
    if (stage === "waiting") return { label: "In progress", state: "active" };
    if (stage === "auth_failure") return { label: "Not authorized", state: "error" };
    return { label: "Authorized", state: "done" };
  };

  const getPermissionStatus = () => {
    if (stage === "existing") return { label: "Review in management", state: "pending" };
    if (stage === "review") return { label: "Not reviewed", state: "pending" };
    if (["authorize", "waiting", "auth_failure"].includes(stage)) {
      return { label: "Reviewed", state: "done" };
    }
    return { label: "Approved", state: "done" };
  };

  const getVerificationStatus = () => {
    if (stage === "existing") return { label: "Review in management", state: "pending" };
    if (["review", "authorize", "waiting", "auth_failure"].includes(stage)) {
      return { label: "Not started", state: "pending" };
    }
    return { label: "Complete", state: "done" };
  };

  const getSyncStatus = () => {
    if (stage === "existing") return { title: "Initial sync", label: "Review in management", state: "pending" };
    if (stage === "verified" && firstSyncQueued) return { title: "Initial sync", label: "Queued", state: "active" };
    if (["review", "authorize", "waiting", "auth_failure", "verified"].includes(stage)) {
      return { title: "Initial sync", label: "Not started", state: "pending" };
    }
    if (stage === "ready_to_sync") {
      return { title: "Initial sync", label: "Ready", state: "active" };
    }
    if (stage === "syncing") {
      return { title: "Initial sync", label: "In progress", state: "active" };
    }
    if (stage === "sync_error") {
      return { title: "Latest sync", label: "Needs attention", state: "error" };
    }
    if (stage === "partial_sync") {
      return { title: "Initial sync", label: "Exceptions", state: "error" };
    }
    return { title: "Initial sync", label: "Complete", state: "done" };
  };

  // Derive What Happens Next list
  const getNextSteps = () => {
    switch (stage) {
      case "review":
      case "authorize":
        return [
          { num: "01", text: "Authorize account" },
          { num: "02", text: "Verify access" },
          { num: "03", text: "Start initial sync" },
          { num: "04", text: "Review sync result" },
        ];
      case "waiting":
        return [
          { num: "01", text: `Complete approval in ${connectorName}` },
          { num: "02", text: "Verify account access" },
          { num: "03", text: "Start initial sync" },
          { num: "04", text: "Review sync result" },
        ];
      case "auth_failure":
        return [
          { num: "01", text: "Try authorization again" },
          { num: "02", text: "Approve account access" },
          { num: "03", text: "Verify the connection" },
          { num: "04", text: "Review initial sync scope" },
        ];
      case "verified":
        return [
          { num: "01", text: "Review the initial sync scope" },
          { num: "02", text: "Start initial sync" },
          { num: "03", text: "Review sync result" },
          { num: "04", text: "Review catalog mapping" },
        ];
      case "ready_to_sync":
        return [
          { num: "01", text: "Start initial sync" },
          { num: "02", text: "Monitor processing" },
          { num: "03", text: "Review sync result" },
          { num: "04", text: "Review marketplace workflows" },
        ];
      case "syncing":
        return [
          { num: "01", text: "Complete initial processing" },
          { num: "02", text: "Review sync result" },
          { num: "03", text: "Review catalog mapping" },
        ];
      case "sync_error":
        return [
          { num: "01", text: "Review the synchronization issue" },
          { num: "02", text: "Retry the failed synchronization" },
          { num: "03", text: "Check the latest sync result" },
          { num: "04", text: "Continue marketplace operations" },
        ];
      case "partial_sync":
        return [
          { num: "01", text: `Review the ${failedItems} item${failedItems === 1 ? "" : "s"} requiring attention` },
          { num: "02", text: "Resolve affected data" },
          { num: "03", text: "Retry the affected synchronization" },
          { num: "04", text: "Review the final sync result" },
        ];
      case "connected":
        return [
          { num: "01", text: "Review catalog mapping" },
          { num: "02", text: "Review marketplace workflows" },
          { num: "03", text: "Monitor ongoing order sync" },
          { num: "04", text: "Manage the connection" },
        ];
      case "existing":
        return [
          { num: "01", text: "Open the existing connection" },
          { num: "02", text: "Review account and access" },
          { num: "03", text: "Check synchronization status" },
          { num: "04", text: "Manage marketplace workflows" },
        ];
    }
  };

  const accountStatus = getAccountStatus();
  const permissionStatus = getPermissionStatus();
  const verificationStatus = getVerificationStatus();
  const syncStatus = getSyncStatus();
  const nextSteps = getNextSteps();

  const showInitialPreview = [
    "review",
    "authorize",
    "waiting",
    "auth_failure",
    "ready_to_sync",
  ].includes(stage);

  return (
    <div className="space-y-6">
      {/* 1. Connection status card */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
          <h3 className="text-sm font-bold text-foreground">Connection status</h3>
          <span className="text-xs text-muted-foreground">{getStatusBadge()}</span>
        </div>

        {/* Sync in progress card body */}
        {stage === "syncing" && (
          <div className="py-4 border-b border-neutral-100 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">Initial sync in progress</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Running · live status from the sync jobs
                </p>
              </div>
              <span className="text-2xl font-bold tracking-tight text-foreground">{pct(syncProgress)}</span>
            </div>

            {/* Main Progress Bar */}
            <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full bg-black transition-all duration-500 rounded-full"
                style={{ width: `${syncProgress ?? 0}%` }}
              />
            </div>

            {/* Sub progress bars */}
            <div className="space-y-2 pt-1 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Products</span>
                  <span className="font-medium text-foreground">{pct(productProgress)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                  <div className="h-full bg-black transition-all rounded-full" style={{ width: `${productProgress ?? 0}%` }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Inventory</span>
                  <span className="font-medium text-foreground">{pct(inventoryProgress)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                  <div className="h-full bg-black transition-all rounded-full" style={{ width: `${inventoryProgress ?? 0}%` }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Orders</span>
                  <span className="font-medium text-foreground">{pct(orderProgress)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                  <div className="h-full bg-black transition-all rounded-full" style={{ width: `${orderProgress ?? 0}%` }} />
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground pt-1">You can continue working elsewhere.</p>
          </div>
        )}

        {/* Sync error note */}
        {stage === "sync_error" && (
          <div className="py-3 border-b border-neutral-100">
            <p className="text-xs font-semibold text-foreground">Account connection remains active</p>
            <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
              Authorization and access verification remain complete. This issue affects the latest synchronization, not the account connection.
            </p>
          </div>
        )}

        {/* Partial sync note */}
        {stage === "partial_sync" && (
          <div className="py-3 border-b border-neutral-100">
            <p className="text-xs font-semibold text-foreground">Connection active</p>
            <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
              Account access remains approved and verified. Attention is limited to initial sync exceptions.
            </p>
          </div>
        )}

        {/* Existing connection note */}
        {stage === "existing" && (
          <div className="py-3 border-b border-neutral-100">
            <p className="text-xs font-semibold text-foreground">Continue with the existing connection</p>
            <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
              Current permissions, verification and synchronization status are available in connection management.
            </p>
          </div>
        )}

        {/* Connected state header in sidebar */}
        {stage === "connected" && (
          <div className="py-3 border-b border-neutral-100">
            <p className="text-xs font-semibold text-foreground">Initial synchronization complete</p>
            <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
              Your account connection is {health ? health.label.toLowerCase() : "connected"}{health ? ` (${health.score}%)` : ""}. Orders keep synchronizing on schedule.
            </p>
          </div>
        )}

        {/* Vertical Step Checklist */}
        <div className="relative pt-4 space-y-4">
          {/* Vertical line connecting the dots */}
          <div className="absolute left-[7px] top-6 bottom-4 w-[1px] bg-neutral-200" aria-hidden="true" />

          {/* 1. Account */}
          <div className="relative flex items-center justify-between pl-6 text-xs">
            <span
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full bg-white",
                accountStatus.state === "done" && "bg-black text-white",
                accountStatus.state === "active" && "border-2 border-black",
                accountStatus.state === "error" && "border border-destructive text-destructive",
                accountStatus.state === "pending" && "border border-neutral-300 text-transparent"
              )}
            >
              {accountStatus.state === "done" ? (
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              ) : accountStatus.state === "error" ? (
                <AlertCircle className="h-3 w-3" />
              ) : null}
            </span>
            <span className="font-medium text-foreground">Account</span>
            <span
              className={cn(
                "text-muted-foreground text-[11px]",
                accountStatus.state === "done" && "text-foreground font-medium",
                accountStatus.state === "error" && "text-destructive font-medium"
              )}
            >
              {accountStatus.label}
            </span>
          </div>

          {/* 2. Permission */}
          <div className="relative flex items-center justify-between pl-6 text-xs">
            <span
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full bg-white",
                permissionStatus.state === "done" && "bg-black text-white",
                permissionStatus.state === "active" && "border-2 border-black",
                permissionStatus.state === "pending" && "border border-neutral-300 text-transparent"
              )}
            >
              {permissionStatus.state === "done" ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : null}
            </span>
            <span className="font-medium text-foreground">Permission</span>
            <span
              className={cn(
                "text-muted-foreground text-[11px]",
                permissionStatus.state === "done" && "text-foreground font-medium"
              )}
            >
              {permissionStatus.label}
            </span>
          </div>

          {/* 3. Verification */}
          <div className="relative flex items-center justify-between pl-6 text-xs">
            <span
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full bg-white",
                verificationStatus.state === "done" && "bg-black text-white",
                verificationStatus.state === "active" && "border-2 border-black",
                verificationStatus.state === "pending" && "border border-neutral-300 text-transparent"
              )}
            >
              {verificationStatus.state === "done" ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : null}
            </span>
            <span className="font-medium text-foreground">Verification</span>
            <span
              className={cn(
                "text-muted-foreground text-[11px]",
                verificationStatus.state === "done" && "text-foreground font-medium"
              )}
            >
              {verificationStatus.label}
            </span>
          </div>

          {/* 4. Initial sync / Latest sync */}
          <div className="relative flex items-center justify-between pl-6 text-xs">
            <span
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full bg-white",
                syncStatus.state === "done" && "bg-black text-white",
                syncStatus.state === "active" && "border-2 border-black",
                syncStatus.state === "error" && "border border-destructive text-destructive",
                syncStatus.state === "pending" && "border border-neutral-300 text-transparent"
              )}
            >
              {syncStatus.state === "done" ? (
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              ) : syncStatus.state === "error" ? (
                <AlertCircle className="h-3 w-3" />
              ) : null}
            </span>
            <span className="font-medium text-foreground">{syncStatus.title}</span>
            <span
              className={cn(
                "text-muted-foreground text-[11px]",
                syncStatus.state === "done" && "text-foreground font-medium",
                syncStatus.state === "error" && "text-destructive font-medium",
                syncStatus.state === "active" && "text-foreground font-medium"
              )}
            >
              {syncStatus.label}
            </span>
          </div>
        </div>
      </div>

      {/* 2. What happens next card */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h4 className="text-xs font-bold text-foreground mb-3">What happens next</h4>
        <ol className="space-y-2.5 text-xs">
          {nextSteps.map((step) => (
            <li key={step.num} className="flex items-start gap-2.5 text-muted-foreground">
              <span className="font-mono text-[11px] text-neutral-400 shrink-0">{step.num}</span>
              <span className="leading-snug text-foreground/90">{step.text}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* 3. Initial sync preview card */}
      {showInitialPreview && (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-3">
          <h4 className="text-xs font-bold text-foreground">Initial sync preview</h4>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>{totalProducts !== undefined ? `${totalProducts.toLocaleString()} potential products` : "Your master catalogue"}</span>
              <span className="h-1 w-1 rounded-full bg-neutral-300" />
            </div>
            {totalVariants !== undefined && (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{totalVariants.toLocaleString()} potential variants</span>
                <span className="h-1 w-1 rounded-full bg-neutral-300" />
              </div>
            )}
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Current inventory</span>
              <span className="text-[11px] text-foreground font-medium">
                {stage === "ready_to_sync" ? "Included" : "Synced after authorization"}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Marketplace orders</span>
              <span className="text-[11px] text-foreground font-medium">
                {stage === "ready_to_sync" ? "Included" : "Retrieved after sync"}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground pt-1 border-t border-neutral-100">
            Nothing will be published automatically.
          </p>
        </div>
      )}

      {/* 4. Facts of the connector */}
      {facts && (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-3">
          <h4 className="text-xs font-bold text-foreground">About this connector</h4>
          <div className="divide-y divide-neutral-100 text-xs">
            <div className="flex justify-between gap-3 py-2">
              <span className="text-muted-foreground">Environment</span>
              <span className="font-medium text-foreground text-right">{facts.environment}</span>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <span className="text-muted-foreground">Request limit</span>
              <span className="font-medium text-foreground text-right">{facts.requestLimit}</span>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <span className="text-muted-foreground">Order events</span>
              <span className="font-medium text-foreground text-right">{facts.orderEvents}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
