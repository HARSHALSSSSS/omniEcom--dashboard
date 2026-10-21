import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { XCircle } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/onboarding/wizard";
import { ConnectResultView } from "@/components/marketplace-hub/setup/ConnectResultView";
import {
  clearPending,
  loadPending,
} from "@/components/marketplace-hub/setup/setupUtils";
import { ROUTES } from "@/constants/routes";
import { useCompleteOauth } from "@/hooks/useDirectory";
import type { ConnectResult, PendingOauth } from "@/types/directory";

type Outcome =
  | { kind: "working" }
  | { kind: "problem"; title: string; message: string }
  | { kind: "done"; result: ConnectResult };

/**
 * Where the marketplace sends the seller back after consent (?code=...&state=...). It checks the state against the one kept
 * before leaving, asks the API to finish the connection and shows the real result.
 */
export default function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const complete = useCompleteOauth();
  const started = useRef(false);
  const [pending] = useState<PendingOauth | null>(() => loadPending());

  const code = params.get("code") ?? params.get("spapi_oauth_code");
  const state = params.get("state");
  const denied = params.get("error");
  const sellerId = params.get("selling_partner_id");

  const early = ((): Outcome | null => {
    if (denied)
      return {
        kind: "problem",
        title: "Access was not approved",
        message:
          params.get("error_description") ||
          "The marketplace did not grant access, so nothing was connected.",
      };
    if (!code || !state)
      return {
        kind: "problem",
        title: "This link is incomplete",
        message:
          "The marketplace did not send back an authorization code. Start the connection again.",
      };
    if (!pending)
      return {
        kind: "problem",
        title: "No connection is waiting to be finished",
        message:
          "This browser session did not start a connection, or it was already finished. Start again from the connector.",
      };
    if (pending.state !== state)
      return {
        kind: "problem",
        title: "This authorization does not match",
        message:
          "The response does not belong to the connection you started, so it was ignored for your safety. Start the connection again.",
      };
    return null;
  })();

  const [outcome, setOutcome] = useState<Outcome>(early ?? { kind: "working" });

  useEffect(() => {
    if (early) {
      // a refused or mismatched return is final: the pending record is of no use any more
      clearPending();
      return;
    }
    if (started.current || !pending || !code || !state) return;
    started.current = true;
    complete.mutate(
      {
        state,
        code,
        redirectUri: pending.redirectUri,
        syncOptions: pending.syncOptions,
        ...(sellerId ? { externalAccountId: sellerId } : {}),
      },
      {
        onSuccess: (result) => setOutcome({ kind: "done", result }),
        onError: (e) =>
          setOutcome({
            kind: "problem",
            title: "The connection could not be finished",
            message: errorMessage(e),
          }),
        // the code works once: whatever happened, a second attempt needs a fresh authorization
        onSettled: clearPending,
      },
    );
    // runs once per mount; the inputs come from the URL and storage read above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const back = pending?.returnPath ?? ROUTES.MARKETPLACE_HUB_CONNECTORS;

  return (
    <div className="mx-auto max-w-[900px] space-y-6 pb-20">
      <PageHeader
        eyebrow="CONNECTOR SETUP"
        title={
          pending
            ? `Finishing ${pending.connectorName}`
            : "Finishing the connection"
        }
      />

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {outcome.kind === "working" && (
          <div
            role="status"
            aria-live="polite"
            className="space-y-3 py-6 text-center"
          >
            <Spinner className="mx-auto h-6 w-6" />
            <h2 className="text-base font-bold text-foreground">
              Finishing your connection
            </h2>
            <p className="text-xs text-muted-foreground">
              Checking the approval with the marketplace and queuing the first
              sync.
            </p>
          </div>
        )}

        {outcome.kind === "problem" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <XCircle
                className="mt-0.5 h-6 w-6 shrink-0 text-destructive"
                aria-hidden
              />
              <div>
                <h2 className="text-base font-bold text-foreground">
                  {outcome.title}
                </h2>
                <p role="alert" className="mt-1 text-xs text-muted-foreground">
                  {outcome.message}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => navigate(ROUTES.MARKETPLACE_HUB)}
              >
                Go to Marketplace Hub
              </Button>
              <Button onClick={() => navigate(back)}>Start again</Button>
            </div>
          </div>
        )}

        {outcome.kind === "done" && pending && (
          <ConnectResultView
            result={outcome.result}
            connectorName={pending.connectorName}
            syncOptions={pending.syncOptions}
            onEdit={() => navigate(back)}
            onNavigate={navigate}
          />
        )}
      </div>
    </div>
  );
}
