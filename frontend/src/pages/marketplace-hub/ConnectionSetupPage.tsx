import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ExternalLink, Layers, Store, Truck } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Stepper } from "@/components/common/Stepper";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError, Spinner } from "@/components/onboarding/wizard";
import { ConnectResultView } from "@/components/marketplace-hub/setup/ConnectResultView";
import { SetupForm } from "@/components/marketplace-hub/setup/SetupForm";
import {
  newIdempotencyKey,
  redirectBrowser,
  savePending,
  type ConnectMethod,
} from "@/components/marketplace-hub/setup/setupUtils";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import {
  useConnect,
  useConnectorReadiness,
  useDirectory,
} from "@/hooks/useDirectory";
import type {
  ConnectInput,
  ConnectResult,
  DirectoryItem,
} from "@/types/directory";

const SETUP_STEPS = [
  { id: "configure", label: "Configure" },
  { id: "connect", label: "Connect & verify" },
  { id: "result", label: "Result" },
];

const CategoryIcon = ({ category }: { category: DirectoryItem["category"] }) =>
  category === "storefront" ? (
    <Layers className="h-6 w-6" aria-hidden />
  ) : category === "shipping" ? (
    <Truck className="h-6 w-6" aria-hidden />
  ) : (
    <Store className="h-6 w-6" aria-hidden />
  );

export default function ConnectionSetupPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canWrite = useCan("marketplace_accounts:write");
  const directory = useDirectory();
  const item = directory.data?.items.find((c) => c.id === id) ?? null;
  const connectable = !!item && item.status !== "unavailable";
  const readiness = useConnectorReadiness(connectable ? item.id : null);
  const connect = useConnect();

  const [step, setStep] = useState(0);
  const [result, setResult] = useState<ConnectResult | null>(null);
  const [lastInput, setLastInput] = useState<ConnectInput | null>(null);
  const [formKey, setFormKey] = useState(0);

  const redirectUrl = result?.redirect?.authorizationUrl;
  const toHub = () => navigate(ROUTES.MARKETPLACE_HUB);

  const submit = (input: ConnectInput, method: ConnectMethod) => {
    if (!item) return;
    setLastInput(input);
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
          // a finished connection no longer needs the credentials: a fresh form drops them from memory
          if (r.status === "connected") setFormKey((k) => k + 1);
          setStep(2);
        },
        // the call itself was refused (validation, e-mail not verified, permission...): back to the form with the reason
        onError: () => setStep(0),
      },
    );
  };

  const header = (
    <PageHeader
      eyebrow="CONNECTOR SETUP"
      title={item ? `Connect ${item.name}` : "Connect a marketplace"}
      description={
        item
          ? `Link your ${item.name} account so listings, stock and orders stay in sync.`
          : undefined
      }
      actions={
        <Button variant="outline" size="sm" onClick={toHub}>
          Cancel
        </Button>
      }
    />
  );

  if (directory.isPending) {
    return (
      <div className="mx-auto max-w-[900px] space-y-6 pb-20">
        {header}
        <div
          role="status"
          aria-label="Loading the connector"
          className="space-y-3"
        >
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-[360px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (directory.isError) {
    return (
      <div className="mx-auto max-w-[900px] space-y-4 pb-20">
        {header}
        <InlineError error={directory.error} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => void directory.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-[900px] space-y-4 pb-20">
        {header}
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <h2 className="text-base font-semibold text-foreground">
            Connector not found
          </h2>
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

  if (!connectable) {
    return (
      <div className="mx-auto max-w-[900px] space-y-4 pb-20">
        {header}
        <div className="rounded-xl border border-border bg-card p-10 text-center">
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
    <div className="mx-auto max-w-[900px] space-y-6 pb-20">
      {header}

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <Stepper steps={SETUP_STEPS} currentStepIndex={step} />
      </div>

      <div
        hidden={step !== 0}
        className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E6F4FF] text-[#1D4ED8]">
            <CategoryIcon category={item.category} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {item.name}
            </h3>
            <p className="text-xs text-muted-foreground">{item.description}</p>
            {item.capabilityTags.length > 0 && (
              <p className="mt-1 text-[11px] capitalize text-muted-foreground">
                Syncs:{" "}
                {item.capabilityTags
                  .map((t) => t.replace(/_/g, " "))
                  .join(", ")}
              </p>
            )}
          </div>
        </div>

        {readiness.isPending && (
          <div
            role="status"
            aria-label="Loading the connection form"
            className="space-y-3"
          >
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
          </div>
        )}
        {readiness.isError && (
          <div className="space-y-3">
            <InlineError error={readiness.error} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void readiness.refetch()}
            >
              Try again
            </Button>
          </div>
        )}
        {readiness.data && (
          <SetupForm
            key={formKey}
            item={item}
            readiness={readiness.data}
            canWrite={canWrite}
            pending={connect.isPending}
            error={connect.error}
            onSubmit={submit}
          />
        )}
      </div>

      {step === 1 && (
        <div
          role="status"
          aria-live="polite"
          className="space-y-4 rounded-xl border border-border bg-card p-10 text-center shadow-sm"
        >
          {result?.status === "awaiting_authorization" && redirectUrl ? (
            <>
              <h3 className="text-base font-bold text-foreground">
                Taking you to {item.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                Approve access there, and you will be brought back to finish the
                connection.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => redirectBrowser(redirectUrl)}
              >
                Open {item.name}{" "}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </>
          ) : (
            <>
              <Spinner className="mx-auto h-6 w-6" />
              <h3 className="text-base font-bold text-foreground">
                Connecting to {item.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                Creating the account, checking it with the marketplace and
                queuing the first sync. This can take a few seconds.
              </p>
            </>
          )}
        </div>
      )}

      {step === 2 && result && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <ConnectResultView
            result={result}
            connectorName={item.name}
            syncOptions={lastInput?.syncOptions ?? null}
            onEdit={() => {
              setResult(null);
              setStep(0);
            }}
            onNavigate={navigate}
          />
        </div>
      )}
    </div>
  );
}
