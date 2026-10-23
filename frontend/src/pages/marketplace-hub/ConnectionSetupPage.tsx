import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError } from "@/components/onboarding/wizard";
import { ApiError, errorMessage } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useConnect, useConnectorReadiness, useDirectory } from "@/hooks/useDirectory";
import { useDeleteAccount, useHubAccounts, useJobLogs, useSetupSync } from "@/hooks/useHub";
import { useCatalogStats } from "@/hooks/useProducts";
import { toast } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { SyncScope } from "@/types/hub";
import type { ConnectInput, ConnectResult } from "@/types/directory";
import {
  createAttemptKeys,
  redirectBrowser,
  savePending,
  scopesOf,
  type ConnectMethod,
} from "@/components/marketplace-hub/setup/setupUtils";
import { SetupStepper } from "@/components/marketplace-hub/setup/SetupStepper";
import { SetupStatusSidebar, type SetupStage } from "@/components/marketplace-hub/setup/SetupStatusSidebar";
import { SetupReviewStep } from "@/components/marketplace-hub/setup/SetupReviewStep";
import { SetupAuthorizeStep } from "@/components/marketplace-hub/setup/SetupAuthorizeStep";
import { SetupVerifyStep } from "@/components/marketplace-hub/setup/SetupVerifyStep";
import { SetupSyncStep, type SyncStateMode } from "@/components/marketplace-hub/setup/SetupSyncStep";
import { SetupReadyStep } from "@/components/marketplace-hub/setup/SetupReadyStep";
import { SetupExistingConnection } from "@/components/marketplace-hub/setup/SetupExistingConnection";

const FAILED = ["failed", "dead_lettered", "cancelled"];
/** the sync scope that reruns a job type */
const SCOPE_OF_TYPE: Record<string, SyncScope> = { orders: "orders", inventory: "inventory", catalog_import: "catalog", listing_status: "listings" };
const SCOPE_LABEL: Record<string, string> = { catalog: "Product catalogue", inventory: "Inventory", orders: "Orders" };

const healthWord = (status: string) => (status === "healthy" ? "Healthy" : status === "paused" ? "Paused" : "Needs attention");

export default function ConnectionSetupPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canWrite = useCan("marketplace_accounts:write");

  // Workspace facts, shown only when they are real
  const shell = useWorkspaceStore((s) => s.shell);
  const businessName = shell?.business.name ?? "Your business";
  const workspaceName = `${businessName} Commerce`;
  const catalogStats = useCatalogStats({});
  const totalProducts = catalogStats.data?.products;
  const totalVariants = catalogStats.data?.variants;

  // Directory and readiness
  const directory = useDirectory();
  const item = directory.data?.items.find((c) => c.id === id) ?? null;
  const connectable = Boolean(item && item.status !== "unavailable");
  const readiness = useConnectorReadiness(connectable && item ? item.id : null);
  const hubAccounts = useHubAccounts();
  const connect = useConnect();
  const removePending = useDeleteAccount();
  const attempts = useRef(createAttemptKeys()).current;

  // Step state: 0 = Review, 1 = Authorize, 2 = Verify, 3 = Sync, 4 = Ready. Later steps need a real connect result.
  const [step, setStep] = useState<number>(() => (searchParams.get("step") === "authorize" || searchParams.get("step") === "1" ? 1 : 0));
  const [result, setResult] = useState<ConnectResult | null>(null);
  const [lastInput, setLastInput] = useState<ConnectInput | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [isWaitingRedirect, setIsWaitingRedirect] = useState(false);
  const [dismissExisting, setDismissExisting] = useState(false);

  // Accounts of this connector that already exist
  const existingAccounts = (hubAccounts.data?.items ?? []).filter((a) => a.marketplace === id && (a.accountStatus === "active" || a.accountStatus === "paused"));
  const showExistingGuard = existingAccounts.length > 0 && !dismissExisting && step === 0 && !result;

  // The first sync: jobs queued by the connect call, or started on the sync step. Completion is read from sync-status only.
  const accountId = result?.status === "connected" ? (result.account?.id ?? null) : null;
  const seedIds = useMemo(() => result?.jobs.map((j) => j.id) ?? [], [result]);
  const sync = useSetupSync(accountId, seedIds);
  const jobsKnown = sync.ids.length > 0;
  const anyFailed = sync.jobs.some((j) => FAILED.includes(j.status));
  const anyPartial = sync.jobs.some((j) => j.status === "partially_failed" || (j.status === "succeeded" && j.progress.failed > 0));
  const syncStateMode: SyncStateMode = !jobsKnown ? "ready" : !sync.settled ? "syncing" : anyFailed ? "error" : anyPartial ? "partial" : "syncing";
  const syncComplete = jobsKnown && sync.settled && !anyFailed && !anyPartial;

  // live log of the running job
  const activeJob = sync.jobs.find((j) => !["succeeded", "failed", "partially_failed", "cancelled", "dead_lettered"].includes(j.status)) ?? null;
  const jobLogsQuery = useJobLogs(activeJob?.id ?? null);
  const realLogs = (jobLogsQuery.data?.items ?? []).map((l) => ({
    time: new Date(l.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    text: l.message,
  }));

  // finished without exceptions: the flow moves on by itself (no timer: this is the real end of the jobs)
  useEffect(() => {
    if (syncComplete && step === 3) {
      setStep(4);
      void hubAccounts.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncComplete, step]);

  // a connect request in flight must not be lost silently
  useEffect(() => {
    if (!connect.isPending) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [connect.isPending]);

  const stage: SetupStage = (() => {
    if (showExistingGuard) return "existing";
    if (step === 0) return "review";
    if (step === 1) {
      if (isWaitingRedirect) return "waiting";
      if (failureReason || result?.status === "failed") return "auth_failure";
      return "authorize";
    }
    if (step === 2) return "verified";
    if (step === 3) return syncStateMode === "ready" ? "ready_to_sync" : syncStateMode === "syncing" ? "syncing" : syncStateMode === "error" ? "sync_error" : "partial_sync";
    return "connected";
  })();

  // lane and overall progress, from the real job counters (null while a job reports no total)
  const laneProgress = (types: string[]) => {
    const js = sync.jobs.filter((j) => types.includes(j.type));
    if (js.length === 0) return null;
    const total = js.reduce((n, j) => n + j.progress.total, 0);
    if (js.every((j) => j.status === "succeeded")) return 100;
    return total > 0 ? Math.round((js.reduce((n, j) => n + Math.min(j.progress.done, j.progress.total), 0) / total) * 100) : null;
  };
  const failedItems = sync.jobs.reduce((n, j) => n + j.progress.failed, 0);

  const toHub = () => navigate(ROUTES.MARKETPLACE_HUB);
  const accountCard = hubAccounts.data?.items.find((a) => a.id === accountId) ?? null;
  const includedScopes = scopesOf(lastInput?.syncOptions).map((s) => SCOPE_LABEL[s]);
  const firstSyncStep = result?.steps.find((s) => s.name === "first_sync");
  const notQueuedReason = result && !jobsKnown && lastInput?.syncOptions.runFirstSync ? (firstSyncStep?.message ?? "nothing was queued") : null;
  const accountPath = (accountIdValue: string | undefined) => (accountIdValue ? `${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${accountIdValue}` : ROUTES.MARKETPLACE_HUB);

  // Submit connect credentials / initiate OAuth
  const handleSubmit = (input: ConnectInput, method: ConnectMethod) => {
    if (!item) return;
    setLastInput(input);
    setFailureReason(null);
    setResult(null);
    setStep(1);

    connect.mutate(
      { input, idempotencyKey: attempts.keyFor(input) },
      {
        onSuccess: (r) => {
          attempts.settle();
          setResult(r);
          if (r.status === "awaiting_authorization" && r.redirect && method === "redirect") {
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
            setFailureReason(r.error?.message ?? "The connection could not be completed.");
            return;
          }
          setStep(2);
        },
        onError: (e) => {
          // the server answered with a definite error: a retry is a new attempt; a lost request keeps its key
          if (e instanceof ApiError && e.status >= 400 && e.status < 500) attempts.settle();
        },
      },
    );
  };

  // leaving the redirect wait: the account that was prepared for it is removed, and the user is told
  const cancelPendingAuthorization = () => {
    const pendingId = result?.redirect?.accountId ?? result?.account?.id;
    setIsWaitingRedirect(false);
    setResult(null);
    setStep(0);
    if (!pendingId) return;
    removePending.mutate(pendingId, {
      onSuccess: () => toast({ title: "Connection cancelled", description: "The account prepared for this authorization was removed.", variant: "success" }),
      onError: (e) =>
        toast({
          title: "The prepared account is still there",
          description: `${errorMessage(e)} You can delete it in the Marketplace Hub (shown as not authorized).`,
          variant: "destructive",
        }),
    });
  };

  const startSyncScopes = (scopes: SyncScope[]) => {
    sync.reset();
    sync.start.mutate(scopes);
  };
  const handleTriggerInitialSync = () => startSyncScopes(scopesOf(lastInput?.syncOptions));
  const handleRetrySync = () => {
    const scopes = [...new Set(sync.jobs.filter((j) => FAILED.includes(j.status)).map((j) => SCOPE_OF_TYPE[j.type]).filter((s): s is SyncScope => Boolean(s)))];
    startSyncScopes(scopes.length > 0 ? scopes : scopesOf(lastInput?.syncOptions));
  };

  // facts of the connector itself, for the sidebar
  const facts = item
    ? {
        environment: readiness.data ? (readiness.data.live && readiness.data.sandbox ? "Sandbox and live" : readiness.data.live ? "Live" : "Sandbox only") : "Loading...",
        requestLimit: `${item.limits.requestsPerSecond} requests/s, burst ${item.limits.burst}`,
        orderEvents: item.webhooks ? "Pushed by webhook" : "Polled",
      }
    : null;

  // Header top-right status or actions
  const getHeaderActions = () => {
    if (stage === "review") {
      return (
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={toHub} className="text-xs h-9 px-4">
            Cancel
          </Button>
          <Button size="sm" onClick={() => setStep(1)} className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold">
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
      connected: accountCard ? `Connected · ${healthWord(accountCard.status)}` : "Connected",
      existing: "Existing connection found",
    };
    return <span className="text-xs text-muted-foreground font-medium">{stageBadgeMap[stage]}</span>;
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
            // earlier steps only; once the account exists the form is not shown again
            if (s <= step && (s === 0 || s >= 2 || !result || result.status !== "connected")) setStep(s);
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
              accounts={existingAccounts}
              onManageExisting={() => navigate(accountPath(existingAccounts[0]?.id))}
              onSetupNewConnection={() => setDismissExisting(true)}
            />
          )}

          {/* CASE B: Step 0 (Review) */}
          {!showExistingGuard && step === 0 && (
            <SetupReviewStep item={item} businessName={businessName} workspaceName={workspaceName} totalProducts={totalProducts} onContinue={() => setStep(1)} />
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
                if (isWaitingRedirect) {
                  cancelPendingAuthorization();
                  return;
                }
                setFailureReason(null);
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

          {/* CASE D: Step 2 (Verify): what the connect call really did */}
          {!showExistingGuard && step === 2 && result && (
            <SetupVerifyStep
              item={item}
              businessName={businessName}
              result={result}
              onStartSync={() => setStep(3)}
              onReviewSettings={() => navigate(accountPath(result.account?.id))}
              onGoToHub={toHub}
            />
          )}

          {/* CASE E: Step 3 (Sync): finished only when the real jobs finished */}
          {!showExistingGuard && step === 3 && result && (
            <SetupSyncStep
              item={item}
              businessName={result.account?.name ?? businessName}
              syncStateMode={syncStateMode}
              totalProducts={totalProducts}
              totalVariants={totalVariants}
              includedScopes={includedScopes}
              jobs={sync.jobs}
              skipped={sync.started?.skipped ?? []}
              activityLogs={realLogs.length > 0 ? realLogs : undefined}
              notQueuedReason={notQueuedReason}
              starting={sync.start.isPending}
              canWrite={canWrite}
              startError={sync.start.isError ? errorMessage(sync.start.error, "The sync could not be started.") : null}
              statusUnreadable={sync.statusError}
              lastSuccessfulSync={sync.lastSyncedAt}
              onStartInitialSync={handleTriggerInitialSync}
              onContinueToWorkspace={toHub}
              onRetrySync={handleRetrySync}
              onManageConnection={() => navigate(accountPath(result.account?.id))}
              onCancel={() => setStep(2)}
            />
          )}

          {/* CASE F: Step 4 (Ready / Connected) */}
          {!showExistingGuard && step === 4 && result && (
            <SetupReadyStep
              item={item}
              businessName={result.account?.name ?? businessName}
              account={accountCard}
              jobs={sync.jobs}
              totalProducts={totalProducts}
              totalVariants={totalVariants}
              onManageConnection={() => navigate(`${ROUTES.MARKETPLACE_HUB}?q=${encodeURIComponent(result.account?.name ?? "")}`)}
              onViewProducts={() => navigate(ROUTES.PRODUCTS)}
              onViewListings={() => navigate(`${ROUTES.LISTINGS}${result.account ? `?account=${result.account.id}` : ""}`)}
              onViewSyncActivity={() => navigate(accountPath(result.account?.id))}
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
            syncProgress={sync.progress ?? (syncComplete ? 100 : null)}
            productProgress={laneProgress(["catalog_import"])}
            inventoryProgress={laneProgress(["inventory"])}
            orderProgress={laneProgress(["orders"])}
            failedItems={failedItems}
            firstSyncQueued={jobsKnown}
            health={accountCard ? { label: healthWord(accountCard.status), score: accountCard.health.pulseScore } : null}
            facts={facts}
          />
        </div>
      </div>
    </div>
  );
}
