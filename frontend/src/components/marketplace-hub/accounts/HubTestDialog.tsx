import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/api/errors";
import { formatDateTime } from "@/utils/format";
import type { ConnectionTest } from "@/types/hub";
import { InlineError } from "./hubUi";

const STEP_LABEL: Record<string, string> = { credentials: "Credentials", profile: "Seller profile", catalog: "Catalogue read", orders: "Order read" };

interface HubTestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  pending: boolean;
  result: ConnectionTest | undefined;
  error: unknown;
  onRetry: () => void;
}

/** POST /marketplace-accounts/{id}/test: read-only calls against the marketplace, one row per step. */
export function HubTestDialog({ open, onOpenChange, accountName, pending, result, error, onRetry }: HubTestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Test connection: {accountName}</DialogTitle>
          <DialogDescription>Runs read-only calls with the stored credentials. Nothing is changed on the marketplace.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs" aria-live="polite">
          {pending && <p className="text-muted-foreground">Testing the connection...</p>}
          {Boolean(error) && <InlineError message={errorMessage(error, "The connection could not be tested.")} />}
          {result && (
            <>
              <p className={result.ok ? "font-medium text-green-700" : "font-medium text-red-700"}>
                {result.ok ? "The connection works." : "The connection test failed."} <span className="font-normal text-muted-foreground">Checked {formatDateTime(result.checkedAt)}</span>
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {result.steps.map((s) => (
                  <li key={s.name} className="flex items-start gap-2.5 p-3">
                    {s.skipped ? (
                      <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-label="Skipped" />
                    ) : s.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-label="Passed" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Failed" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{STEP_LABEL[s.name] ?? s.name}</p>
                      <p className="text-[11px] text-muted-foreground">{s.skipped ? "Not supported by this marketplace" : (s.message ?? (s.ok ? "OK" : "Failed"))}</p>
                    </div>
                    {!s.skipped && <span className="font-mono text-[11px] text-muted-foreground">{s.durationMs} ms</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <DialogFooter>
          {!pending && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Test again
            </Button>
          )}
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
