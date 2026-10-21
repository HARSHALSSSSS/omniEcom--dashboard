import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useReturnNextActions, useRunReturnAction } from "@/hooks/useReturns";
import { toast } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { NextAction } from "@/types/returns";
import { ReturnActionForm, type FormKind } from "./ReturnActionForm";
import { NO_REFUND_REASON, NO_WRITE_REASON, writeErrorMessage } from "./returnFormat";

/** states in which the goods have not arrived yet, so the return can still be cancelled */
const CANCELLABLE = ["requested", "approved", "pickup_scheduled"];

/** the path after /returns/{id}/ that the step's href points at (approve, receive, refund/retry, ...) */
const pathOf = (a: NextAction, id: string): string => a.href.split(`/returns/${id}/`)[1] ?? a.key;

interface ReturnActionsProps {
  returnId: string;
  returnNumber: string;
  /** the return's status from the detail, for reject and cancel */
  status: string;
}

type Open = { kind: FormKind; action: NextAction | null } | null;

/**
 * The steps of the return flow (GET /returns/{id}/next-actions): approve, receive, inspect, disposition, refund, complete.
 * Each says whether it is done, ready, or why it is blocked, and its form is built from the inputs the API returns.
 * Refunds need returns:refund (admins); reject and cancel are the ways out before the goods arrive.
 */
export function ReturnActions({ returnId, returnNumber, status }: ReturnActionsProps) {
  const permissions = useWorkspaceStore((s) => s.permissions);
  const { data, isLoading, isError, error, refetch } = useReturnNextActions(returnId);
  const run = useRunReturnAction();
  const [open, setOpen] = useState<Open>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-32 w-full" role="status" aria-label="Loading next steps" />;
  if (isError || !data) {
    return (
      <div role="alert" className="space-y-2 rounded-lg border border-border p-3 text-xs">
        <p className="text-muted-foreground">The next steps could not be loaded. {errorMessage(error)}</p>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const canWrite = permissions.includes("returns:write");
  const toggle = (next: NonNullable<Open>) => {
    setFormError(null);
    setOpen((cur) => (cur?.kind === next.kind ? null : next));
  };

  const submit = (path: string, label: string, body: Record<string, unknown>) =>
    run.mutate(
      { id: returnId, action: path, body },
      {
        onSuccess: () => {
          setOpen(null);
          setFormError(null);
          toast({ title: `${returnNumber} updated`, description: label, variant: "success" });
        },
        onError: (e) => setFormError(writeErrorMessage(e)),
      },
    );

  const blockedReason = (a: NextAction): string | null => {
    if (a.done) return null;
    if (!permissions.includes(a.permission)) return a.permission === "returns:refund" ? NO_REFUND_REASON : NO_WRITE_REASON;
    return a.enabled ? null : a.disabledReason;
  };

  const canReject = canWrite && status === "requested";
  const canCancel = canWrite && CANCELLABLE.includes(status);

  return (
    <section aria-label="Next steps" className="space-y-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Next steps</h4>
      <ol className="space-y-2">
        {data.actions.map((a) => {
          const reason = blockedReason(a);
          const isOpen = open?.kind === a.key;
          const state = a.done ? "Done" : reason ? "Blocked" : data.next === a.key ? "Next" : "Ready";
          return (
            <li key={a.key} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{a.label}</p>
                  <p className="text-[11px] text-muted-foreground">{a.done ? "Done" : (reason ?? (state === "Next" ? "Ready to do now" : "Can be done now"))}</p>
                </div>
                {!a.done && (
                  <Button
                    size="sm"
                    variant={state === "Next" ? "default" : "outline"}
                    className="h-7 shrink-0 text-xs"
                    disabled={reason !== null || run.isPending}
                    title={reason ?? undefined}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Hide ${a.label}` : a.label}
                    onClick={() => toggle({ kind: a.key, action: a })}
                  >
                    {isOpen ? "Hide" : "Start"}
                  </Button>
                )}
              </div>
              {isOpen && (
                <ReturnActionForm
                  kind={a.key}
                  action={a}
                  busy={run.isPending}
                  error={formError}
                  submitLabel={a.label}
                  onSubmit={(body) => submit(pathOf(a, returnId), a.label, body)}
                  onClose={() => setOpen(null)}
                />
              )}
            </li>
          );
        })}
      </ol>

      {(canReject || canCancel) && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {canReject && (
              <Button variant="outline" size="sm" className="h-8 text-xs" aria-expanded={open?.kind === "reject"} onClick={() => toggle({ kind: "reject", action: null })}>
                Reject return
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" size="sm" className="h-8 text-xs" aria-expanded={open?.kind === "cancel"} onClick={() => toggle({ kind: "cancel", action: null })}>
                Cancel return
              </Button>
            )}
          </div>
          {(open?.kind === "reject" || open?.kind === "cancel") && (
            <ReturnActionForm
              kind={open.kind}
              action={null}
              busy={run.isPending}
              error={formError}
              submitLabel={open.kind === "reject" ? "Reject return" : "Cancel return"}
              onSubmit={(body) => submit(open.kind, open.kind === "reject" ? "Return rejected" : "Return cancelled", body)}
              onClose={() => setOpen(null)}
            />
          )}
        </div>
      )}
      {!canWrite && <p className="text-[11px] text-muted-foreground">{NO_WRITE_REASON}</p>}
    </section>
  );
}
