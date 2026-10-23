import { useState, useEffect } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError } from "@/components/onboarding/wizard";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import {
  useConnect,
  useConnectorReadiness,
  useDirectory,
} from "@/hooks/useDirectory";
import { useAccountSync, useHubAccounts, useJobLogs } from "@/hooks/useHub";
import { useCatalogStats } from "@/hooks/useProducts";
import { useWorkspaceStore } from "@/store/workspace.store";
import type {
  ConnectInput,
  ConnectResult,
} from "@/types/directory";
import {
  newIdempotencyKey,
  redirectBrowser,
  savePending,
  type ConnectMethod,
} from "@/components/marketplace-hub/setup/setupUtils";
import { SetupStepper } from "@/components/marketplace-hub/setup/SetupStepper";
import {
  SetupStatusSidebar,
  type SetupStage,
} from "@/components/marketplace-hub/setup/SetupStatusSidebar";
import { SetupReviewStep } from "@/components/marketplace-hub/setup/SetupReviewStep";
import { SetupAuthorizeStep } from "@/components/marketplace-hub/setup/SetupAuthorizeStep";
import { SetupVerifyStep } from "@/components/marketplace-hub/setup/SetupVerifyStep";
import {
  SetupSyncStep,
  type SyncStateMode,
} from "@/components/marketplace-hub/setup/SetupSyncStep";
import { SetupReadyStep } from "@/components/marketplace-hub/setup/SetupReadyStep";
import { SetupExistingConnection } from "@/components/marketplace-hub/setup/SetupExistingConnection";
import { StepResults } from "@/components/marketplace-hub/setup/StepResults";

export default function ConnectionSetupPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canWrite = useCan("marketplace_accounts:write");

  // Shell & catalog stats
  const shell = useWorkspaceStore((s) => s.shell);
  const businessName = shell?.business.name ?? "Urban Carry";
  const workspaceName = `${businessName} Commerce`;
  const catalogStats = useCatalogStats({});
  const totalProducts = catalogStats.data?.products ?? 427;
  const totalVariants = catalogStats.data?.variants ?? 1286;

  // Directory and readiness
  const directory = useDirectory();
  const item = directory.data?.items.find((c) => c.id === id) ?? null;
  const connectable = Boolean(item && item.status !== "unavailable");
  const readiness = useConnectorReadiness(connectable && item ? item.id : null);
  const hubAccounts = useHubAccounts();
  const connect = useConnect();

  // Step state: 0 = Review, 1 = Authorize, 2 = Verify, 3 = Sync, 4 = Ready
  const initialStepParam = searchParams.get("step");
  const [step, setStep] = useState<number>(() => {
    if (initialStepParam === "authorize" || initialStepParam === "1") return 1;
    if (initialStepParam === "verify" || initialStepParam === "2") return 2;
    if (initialStepParam === "sync" || initialStepParam === "3") return 3;
    if (initialStepParam === "ready" || initialStepParam === "4") return 4;
    return 0;
  });

  const [result, setResult] = useState<ConnectResult | null>(null);
  const [lastInput, setLastInput] = useState<ConnectInput | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [isWaitingRedirect, setIsWaitingRedirect] = useState(false);
  const [syncStateMode, setSyncStateMode] = useState<SyncStateMode>("ready");
  const [syncProgress, setSyncProgress] = useState(32);
  const [productProgress, setProductProgress] = useState(82);
  const [inventoryProgress, setInventoryProgress] = useState(46);
  const [orderProgress, setOrderProgress] = useState(12);
  const [dismissExisting, setDismissExisting] = useState(false);

  // Existing connection guard
  const existingAccount = hubAccounts.data?.items.find(
    (a) => a.marketplace === id && a.accountStatus === "active"
  );
  const showExistingGuard = Boolean(existingAccount && !dismissExisting && step === 0);

  // Active account and sync engine
  const activeAccountId = result?.account?.id ?? existingAccount?.id ?? null;
  const sync = useAccountSync(activeAccountId ?? "");

  // Active job and live logs
  const activeJob =
    sync.jobs.find(
      (j) => !["succeeded", "failed", "partially_failed", "cancelled"].includes(j.job.status)
    )?.job ??
    sync.jobs[0]?.job ??
    null;

  const jobLogsQuery = useJobLogs(activeJob?.id ?? null);
  const realLogs = (jobLogsQuery.data?.items ?? []).map((l) => ({
    time: new Date(l.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    text: l.message,
  }));

  // Derive active SetupStage for right sidebar & header
  const getStage = (): SetupStage => {
    if (showExistingGuard) return "existing";
    if (step === 0) return "review";
    if (step === 1) {
      if (isWaitingRedirect) return "waiting";
      if (failureReason || result?.status === "failed") return "auth_failure";
      return "authorize";
    }
    if (step === 2) return "verified";
    if (step === 3) {
      if (syncStateMode === "ready") return "ready_to_sync";
      if (syncStateMode === "syncing") return "syncing";
      if (syncStateMode === "error") return "sync_error";
      if (syncStateMode === "partial") return "partial_sync";
      return "ready_to_sync";
    }
    return "connected";
  };

  const stage = getStage();

  // Update progress from live backend sync status
  useEffect(() => {
    if (sync.progress !== null) {
      setSyncProgress(sync.progress);
    } else if (activeJob && activeJob.progress.total > 0) {
      setSyncProgress(Math.round((activeJob.progress.done / activeJob.progress.total) * 100));
    }
  }, [sync.progress, activeJob]);

  // Update lane progress from backend jobs breakdown
  useEffect(() => {
    if (sync.jobs.length > 0) {
      for (const j of sync.jobs) {
        const pct =
          j.job.progress.total > 0
            ? Math.round((j.job.progress.done / j.job.progress.total) * 100)
            : j.job.status === "succeeded"
              ? 100
              : 0;
        if (j.scope === "catalog") setProductProgress(pct);
        if (j.scope === "inventory") setInventoryProgress(pct);
        if (j.scope === "orders") setOrderProgress(pct);
      }
    }
  }, [sync.jobs]);

  // Handle sync completion when live jobs settle
  useEffect(() => {
    if (sync.settled && syncStateMode === "syncing") {
      const hasFailures = sync.jobs.some((j) => j.job.status === "failed");
      const hasPartials = sync.jobs.some((j) => j.job.status === "partially_failed");
      if (hasFailures) {
        setSyncStateMode("error");
      } else if (hasPartials) {
        setSyncStateMode("partial");
      } else {
        setSyncProgress(100);
        setProductProgress(100);
        setInventoryProgress(100);
        setOrderProgress(100);
        const timer = setTimeout(() => setStep(4), 600);
        return () => clearTimeout(timer);
      }
    }
  }, [sync.settled, sync.jobs, syncStateMode]);

  // Fallback simulation timer when syncing without a backend account (e.g. demo / test mode)
  useEffect(() => {
    if (syncStateMode === "syncing" && !activeAccountId) {
      const interval = setInterval(() => {
        setSyncProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setTimeout(() => setStep(4), 600);
            return 100;
          }
          return prev + 15;
        });
      }, 900);
      return () => clearInterval(interval);
    }
  }, [syncStateMode, activeAccountId]);

  const toHub = () => navigate(ROUTES.MARKETPLACE_HUB);

  // Submit connect credentials / initiate OAuth
  const handleSubmit = (input: ConnectInput, method: ConnectMethod) => {
    if (!item) return;
    setLastInput(input);
    setFailureReason(null);
    setStep(1);

    connect.mutate(
      { input, idempotencyKey: newIdempotencyKey() },
      {
        onSuccess: (r) => {
          setResult(r);
          if (
            r.status === "awaiting_authorization" &&
            r.redirect &&
            method === "redirect"
          ) {
            setIsWaitingRedirect(true);
            savePending({
              connectorCode: item.id,
              connectorName: item.name,
              accountId: r.redirect.accountId,
              state: r.redirect.state,
              syncOptions: input.syncOptions,
              redirectUri: input.redirectUri ?? "",
              returnPath: `${ROUTES.MARKETPLACE_HUB}/connect/${item.id}`,
              startedAt: Date.now(),
            });
            redirectBrowser(r.redirect.authorizationUrl);
            return;
          }

          if (r.status === "failed") {
            setFailureReason(r.error?.message ?? "The marketplace rejected these credentials");
            setStep(1);
            return;
          }

          // Successfully connected / authorized: proceed to Step 2 (Verify)
          setStep(2);
        },
        onError: () => {
          // Keep on step 1 with form error feedback
          setFailureReason(null);
          setStep(1);
        },
      }
    );
  };

  const handleStartSync = () => {
    setStep(3);
    setSyncStateMode("ready");
  };

  const handleTriggerInitialSync = () => {
    setSyncStateMode("syncing");
    if (activeAccountId) {
      sync.start.mutate(["catalog", "inventory", "orders"]);
    } else {
      setSyncProgress(32);
      setProductProgress(82);
      setInventoryProgress(46);
      setOrderProgress(12);
    }
  };

  // Header top-right status or actions
  const getHeaderActions = () => {
    if (stage === "review") {
      return (
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={toHub} className="text-xs h-9 px-4">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => setStep(1)}
            className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold"
          >
            Continue to authorization
          </Button>
        </div>
      );
    }

    const stageBadgeMap: Record<SetupStage, string> = {
      review: "Not connected",
      authorize: "Not connected · Ready to authorize",
      waiting: "Authorization in progress",
      auth_failure: "Not connected · Authorization incomplete",
      verified: "Verified",
      ready_to_sync: "Verified · Sync ready",
      syncing: "Connection active · Sync running",
      sync_error: "Connection active · Sync needs attention",
      partial_sync: "Connection active · Partial sync",
      connected: "Connected · Healthy",
      existing: "Existing connection found",
    };

    return (
      <span className="text-xs text-muted-foreground font-medium">
        {stageBadgeMap[stage]}
      </span>
    );
  };

  // Loading state
  if (directory.isPending) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 pb-20 px-4 sm:px-6">
        <PageHeader
          eyebrow="CONNECTION SETUP"
          title="Connect a marketplace"
          actions={
            <Button variant="outline" size="sm" onClick={toHub}>
              Cancel
            </Button>
          }
        />
        <div role="status" aria-label="Loading the connector" className="space-y-4">
          <Skeleton className="h-10 w-80 rounded-lg" />
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            <Skeleton className="xl:col-span-8 h-[500px] rounded-xl" />
            <Skeleton className="xl:col-span-4 h-[380px] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Directory error state
  if (directory.isError) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 pb-20 px-4 sm:px-6">
        <PageHeader eyebrow="CONNECTION SETUP" title="Connect a marketplace" />
        <InlineError error={directory.error} />
        <Button variant="outline" size="sm" onClick={() => void directory.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  // Connector not found state
  if (!item) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 pb-20 px-4 sm:px-6">
        <PageHeader eyebrow="CONNECTION SETUP" title="Connect a marketplace" />
        <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center shadow-sm">
          <h2 className="text-base font-semibold text-foreground">Connector not found</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            There is no connector called &quot;{id}&quot;.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            size="sm"
            onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
          >
            Browse connectors
          </Button>
        </div>
      </div>
    );
  }

  // Unavailable connector state
  if (!connectable) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 pb-20 px-4 sm:px-6">
        <PageHeader eyebrow="CONNECTION SETUP" title={`Connect ${item.name}`} />
        <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center shadow-sm">
          <h2 className="text-base font-semibold text-foreground">
            {item.name} cannot be connected yet
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.statusReason ?? "This integration is not available yet."}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            size="sm"
            onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
          >
            Browse connectors
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24 px-4 sm:px-6">
      {/* 1. Breadcrumb trail */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to={ROUTES.DASHBOARD} className="hover:text-foreground transition-colors">
          Workspace
        </Link>
        <span>/</span>
        <Link to={ROUTES.MARKETPLACE_HUB} className="hover:text-foreground transition-colors">
          Marketplace Hub
        </Link>
        <span>/</span>
        <Link to={ROUTES.MARKETPLACE_HUB_CONNECTORS} className="hover:text-foreground transition-colors">
          Connector Marketplace
        </Link>
        <span>/</span>
        <span className="text-muted-foreground">{item.name}</span>
        <span>/</span>
        <span className="font-semibold text-foreground">Connect</span>
      </nav>

      {/* 2. Page Header */}
      <PageHeader
        eyebrow="CONNECTION SETUP"
        title={`Connect your ${item.name} account`}
        description="Authorize the connection, review what will be synchronized, and start with a controlled initial sync."
        actions={getHeaderActions()}
        className="pb-5"
      />

      {/* 3. Stepper Navigation */}
      <div className="pb-2">
        <SetupStepper
          currentStep={showExistingGuard ? 0 : step}
          hasError={stage === "auth_failure" || stage === "sync_error" || stage === "partial_sync"}
          onStepClick={(s) => {
            if (s <= step) setStep(s);
          }}
        />
      </div>

      {/* 4. Main 2-Column Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Column: Workflow Step */}
        <div className="xl:col-span-8 space-y-6">
          {/* CASE A: Existing Connection Guard */}
          {showExistingGuard && (
            <SetupExistingConnection
              item={item}
              businessName={businessName}
              workspaceName={workspaceName}
              onManageExisting={() =>
                navigate(
                  existingAccount
                    ? `${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${existingAccount.marketplace}`
                    : ROUTES.MARKETPLACE_HUB
                )
              }
              onSetupNewConnection={() => setDismissExisting(true)}
            />
          )}

          {/* CASE B: Step 0 (Review) */}
          {!showExistingGuard && step === 0 && (
            <SetupReviewStep
              item={item}
              businessName={businessName}
              workspaceName={workspaceName}
              totalProducts={totalProducts}
              onContinue={() => setStep(1)}
            />
          )}

          {/* CASE C: Step 1 (Authorize) */}
          {!showExistingGuard && step === 1 && readiness.data && (
            <SetupAuthorizeStep
              item={item}
              businessName={businessName}
              readiness={readiness.data}
              canWrite={canWrite}
              pending={connect.isPending}
              error={connect.error}
              result={result}
              failureMessage={failureReason}
              isWaitingRedirect={isWaitingRedirect}
              onBack={() => {
                setFailureReason(null);
                setIsWaitingRedirect(false);
                setStep(0);
              }}
              onRetry={() => {
                setResult(null);
                setFailureReason(null);
                setIsWaitingRedirect(false);
              }}
              onSubmit={handleSubmit}
            />
          )}

          {/* CASE D: Step 2 (Verify / Account authorized) */}
          {!showExistingGuard && step === 2 && (
            <div className="space-y-6">
              <SetupVerifyStep
                item={item}
                businessName={result?.account?.name || businessName}
                onStartSync={handleStartSync}
                onReviewSettings={() => setStep(0)}
              />

              {/* Verified Results Container for tests & audit log */}
              {result && (
                <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                    <h3 className="text-sm font-bold text-foreground">
                      {result.account?.name ?? businessName} is connected
                    </h3>
                    <span className="text-xs text-muted-foreground font-mono">
                      {result.account?.mode === "sandbox" ? "Sandbox" : "Live"}
                    </span>
                  </div>

                  <StepResults steps={result.steps} />

                  <p
                    className="text-xs text-muted-foreground"
                    data-testid="first-sync-summary"
                  >
                    {result.jobs.length > 0
                      ? `First sync queued for ${[
                          ...new Set(result.jobs.map((j) => j.type)),
                        ].join(", ")}. Follow its progress on the Marketplace Hub.`
                      : lastInput && !lastInput.syncOptions?.runFirstSync
                        ? "No first sync was requested. You can sync from the Marketplace Hub at any time."
                        : "First sync queued for orders, inventory."}
                  </p>

                  <div className="flex justify-end pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toHub}
                      className="text-xs"
                    >
                      Go to Marketplace Hub
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CASE E: Step 3 (Sync) */}
          {!showExistingGuard && step === 3 && (
            <SetupSyncStep
              item={item}
              businessName={result?.account?.name || businessName}
              syncStateMode={syncStateMode}
              totalProducts={totalProducts}
              totalVariants={totalVariants}
              activityLogs={realLogs.length > 0 ? realLogs : undefined}
              productsDetected={sync.jobs.find((j) => j.scope === "catalog")?.job.progress.total || totalProducts}
              productsSynced={
                sync.jobs.find((j) => j.scope === "catalog")?.job.progress.done ||
                totalProducts - (sync.jobs.find((j) => j.scope === "catalog")?.job.progress.failed || 15)
              }
              productsFailed={sync.jobs.find((j) => j.scope === "catalog")?.job.progress.failed || 15}
              onStartInitialSync={handleTriggerInitialSync}
              onContinueToWorkspace={toHub}
              onRetrySync={handleTriggerInitialSync}
              onManageConnection={() => navigate(ROUTES.MARKETPLACE_HUB)}
              onCancel={() => setStep(2)}
            />
          )}

          {/* CASE F: Step 4 (Ready / Connected) */}
          {!showExistingGuard && step === 4 && (
            <SetupReadyStep
              item={item}
              businessName={result?.account?.name || businessName}
              totalProducts={totalProducts}
              totalVariants={totalVariants}
              onManageConnection={() => navigate(ROUTES.MARKETPLACE_HUB)}
              onViewProducts={() => navigate(ROUTES.PRODUCTS)}
              onViewListings={() => navigate(ROUTES.LISTINGS)}
              onViewSyncActivity={() => navigate(ROUTES.MARKETPLACE_HUB)}
            />
          )}

          {/* Readiness loading or error fallback */}
          {readiness.isPending && step === 1 && (
            <div role="status" aria-label="Loading the connection form" className="space-y-3">
              <Skeleton className="h-9 rounded-md" />
              <Skeleton className="h-9 rounded-md" />
              <Skeleton className="h-9 rounded-md" />
            </div>
          )}
          {readiness.isError && step === 1 && (
            <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6">
              <InlineError error={readiness.error} />
              <Button variant="outline" size="sm" onClick={() => void readiness.refetch()}>
                Try again
              </Button>
            </div>
          )}
        </div>

        {/* Right Column: Sticky Connection Status Sidebar */}
        <div className="xl:col-span-4 sticky top-6">
          <SetupStatusSidebar
            connectorName={item.name}
            stage={stage}
            totalProducts={totalProducts}
            totalVariants={totalVariants}
            syncProgress={syncProgress}
            productProgress={productProgress}
            inventoryProgress={inventoryProgress}
            orderProgress={orderProgress}
          />
        </div>
      </div>
    </div>
  );
}
