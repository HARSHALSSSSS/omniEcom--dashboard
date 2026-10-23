import { Clock, Lock, Shield, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupForm } from "./SetupForm";
import { StepResults } from "./StepResults";
import type {
  ConnectInput,
  ConnectResult,
  ConnectorReadiness,
  DirectoryItem,
} from "@/types/directory";
import type { ConnectMethod } from "./setupUtils";

interface SetupAuthorizeStepProps {
  item: DirectoryItem;
  businessName: string;
  readiness: ConnectorReadiness;
  canWrite: boolean;
  pending: boolean;
  error: unknown;
  result?: ConnectResult | null;
  failureMessage?: string | null;
  isWaitingRedirect?: boolean;
  onBack: () => void;
  onRetry: () => void;
  onSubmit: (input: ConnectInput, method: ConnectMethod) => void;
}

export function SetupAuthorizeStep({
  item,
  businessName,
  readiness,
  canWrite,
  pending,
  error,
  result,
  failureMessage,
  isWaitingRedirect,
  onBack,
  onRetry,
  onSubmit,
}: SetupAuthorizeStepProps) {
  const isFailure = Boolean(failureMessage || result?.status === "failed");

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

        {/* STATE 1: Authorization Failure */}
        {isFailure && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                We couldn&apos;t verify this connection.
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {item.name} could not be connected. The marketplace authorization did not complete successfully.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The unfinished account was removed, so nothing is left half set up. You can try again.
              </p>
            </div>

            <div className="divide-y divide-neutral-100 text-xs">
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Account</span>
                <span className="font-medium text-foreground">{businessName}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Connection</span>
                <span className="font-semibold text-foreground">Not connected</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Initial sync</span>
                <span className="font-medium text-foreground">Not started</span>
              </div>
            </div>

            {/* Step results if connect attempted steps */}
            {result?.steps && result.steps.length > 0 && (
              <div className="pt-2">
                <StepResults steps={result.steps} />
              </div>
            )}

            <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
              <div>
                <p className="text-xs font-bold text-foreground">Possible reason</p>
                <p role="alert" className="text-xs text-muted-foreground mt-1">
                  {failureMessage || result?.error?.message || "The marketplace rejected these credentials"}
                </p>
              </div>

              <div className="pt-2 border-t border-neutral-200">
                <p className="text-xs font-bold text-foreground">Try authorization again</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Return to {item.name} to review and approve the requested access. No synchronization will start until account verification is complete.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={onRetry} className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4">
                Edit details and retry
              </Button>
              <Button variant="outline" onClick={onBack} className="text-xs h-9 px-4">
                Back
              </Button>
            </div>
          </div>
        )}

        {/* STATE 2: Waiting for authorization (OAuth redirect) */}
        {isWaitingRedirect && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Waiting for authorization
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Taking you to {item.name}. Complete the connection in the {item.name} authorization window.
              </p>
              <p className="mt-2 text-xs font-semibold text-foreground flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-black animate-pulse" />
                Authorization in progress
              </p>
            </div>

            <div className="divide-y divide-neutral-100 text-xs">
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Account</span>
                <span className="font-medium text-foreground">{businessName}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Access</span>
                <span className="font-semibold text-foreground">
                  Catalog · Inventory · Orders · Listings
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 space-y-3 text-xs">
              <p className="font-bold text-foreground">Continue in the authorization window</p>
              <ol className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="font-mono text-neutral-400">01</span>
                  <span>Review the requested access</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono text-neutral-400">02</span>
                  <span>Approve the connection for {businessName}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono text-neutral-400">03</span>
                  <span>Return here to verify the connection</span>
                </li>
              </ol>
              <p className="text-[11px] text-muted-foreground pt-1 border-t border-neutral-200">
                No synchronization has started. You can cancel this connection while authorization is in progress.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button variant="outline" onClick={onBack} className="text-xs h-9 px-4">
                Cancel connection
              </Button>
            </div>
          </div>
        )}

        {/* STATE 3: Normal Authorize Form */}
        <div hidden={isFailure || isWaitingRedirect} className="space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Authorize {item.name}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {item.authFlow.mode === "redirect"
                  ? `You'll be securely redirected to ${item.name} to approve the connection.`
                  : `Enter your credentials to link the connector.`}
              </p>
            </div>

            <div className="divide-y divide-neutral-100 text-xs">
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Account</span>
                <span className="font-medium text-foreground">{businessName}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Access</span>
                <span className="font-semibold text-foreground">
                  Catalog · Inventory · Orders · Listings
                </span>
              </div>
            </div>

            {/* Embedded SetupForm for dynamic fields & validation */}
            <SetupForm
              item={item}
              readiness={readiness}
              canWrite={canWrite}
              pending={pending}
              error={error}
              onSubmit={onSubmit}
            />

            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={onBack} className="text-xs">
                Back
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

      {/* Trust strip */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Shield className="h-4 w-4 text-neutral-600 shrink-0" />
            <span>Secure authorization</span>
          </div>
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Lock className="h-4 w-4 text-neutral-600 shrink-0" />
            <span>Encrypted credentials</span>
          </div>
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Sliders className="h-4 w-4 text-neutral-600 shrink-0" />
            <span>Controlled access</span>
          </div>
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Clock className="h-4 w-4 text-neutral-600 shrink-0" />
            <span>Audit trail</span>
          </div>
        </div>
      </div>
    </div>
  );
}
