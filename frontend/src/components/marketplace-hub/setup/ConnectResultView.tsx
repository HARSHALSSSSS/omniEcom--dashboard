import { AlertTriangle, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import type { ConnectResult, SyncOptions } from "@/types/directory";
import { StepResults } from "./StepResults";

interface Props {
  result: ConnectResult;
  connectorName: string;
  syncOptions: SyncOptions | null;
  onEdit: () => void;
  onNavigate: (path: string) => void;
}

const JOB_LABEL: Record<string, string> = {
  orders: "orders",
  inventory: "inventory",
  catalog: "products",
  listings: "listings",
};

/** the outcome of a finished connect call: connected, connected with a warning, or failed (and cleaned up) */
export function ConnectResultView({
  result,
  connectorName,
  syncOptions,
  onEdit,
  onNavigate,
}: Props) {
  const { account } = result;

  if (result.status === "failed" || !account) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <XCircle
            className="mt-0.5 h-6 w-6 shrink-0 text-destructive"
            aria-hidden
          />
          <div>
            <h2 className="text-base font-bold text-foreground">
              {connectorName} could not be connected
            </h2>
            <p role="alert" className="mt-1 text-xs text-muted-foreground">
              {result.error?.message ?? "The connection did not complete."}
            </p>
            {result.cleanedUp && (
              <p className="mt-1 text-xs text-muted-foreground">
                The unfinished account was removed, so nothing is left half set
                up. You can try again.
              </p>
            )}
          </div>
        </div>
        <StepResults steps={result.steps} />
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => onNavigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
          >
            Back to connectors
          </Button>
          <Button onClick={onEdit}>Edit details and retry</Button>
        </div>
      </div>
    );
  }

  const warning = !result.ok;
  const queued = [
    ...new Set(result.jobs.map((j) => JOB_LABEL[j.type] ?? j.type)),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        {warning ? (
          <AlertTriangle
            className="mt-0.5 h-6 w-6 shrink-0 text-amber-600"
            aria-hidden
          />
        ) : (
          <CheckCircle2
            className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600"
            aria-hidden
          />
        )}
        <div>
          <h2 className="text-lg font-bold text-foreground">
            {warning
              ? `${account.name} is connected, with a warning`
              : `${account.name} is connected`}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {connectorName}, {account.mode === "sandbox" ? "Sandbox" : "Live"}
            {account.accountIdentifier
              ? `, account ${account.accountIdentifier}`
              : ""}
            .
          </p>
          {warning && result.error && (
            <p role="alert" className="mt-1 text-xs text-amber-800">
              {result.error.message}
            </p>
          )}
        </div>
      </div>

      <StepResults steps={result.steps} />

      <p
        className="text-xs text-muted-foreground"
        data-testid="first-sync-summary"
      >
        {queued.length > 0
          ? `First sync queued for ${queued.join(", ")}. Follow its progress on the Marketplace Hub.`
          : syncOptions && !syncOptions.runFirstSync
            ? "No first sync was requested. You can sync from the Marketplace Hub at any time."
            : "No first sync was queued."}
      </p>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() =>
            onNavigate(
              `${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${account.marketplace}`,
            )
          }
        >
          View {connectorName} details
        </Button>
        <Button
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => onNavigate(ROUTES.MARKETPLACE_HUB)}
        >
          Go to Marketplace Hub <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
