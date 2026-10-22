import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { useReturnNextActions, useRunReturnAction } from "@/hooks/useReturns";
import { toast } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { NextAction } from "@/types/returns";
import { cn } from "@/utils/cn";
import { DRAWER_BTN_DARK, DRAWER_BTN_LIGHT } from "./design";
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
  /** the inspection and the refund have their own drawers: their step opens it */
  onOpenInspection: () => void;
  onOpenRefund: () => void;
}

type Open = { kind: FormKind; action: NextAction | null } | null;

/**
 * The steps of the return flow (GET /returns/{id}/next-actions): approve, receive, inspect, disposition, refund, complete.
 * Each says whether it is done, ready, or why it is blocked. Approve, receive, disposition and complete take their form here; the
 * inspection and the refund open their own drawers. Refunds need returns:refund (admins); reject and cancel are the ways out before the goods arrive.
 */
export function ReturnActions({ returnId, returnNumber, status, onOpenInspection, onOpenRefund }: ReturnActionsProps) {
  const permissions = useWorkspaceStore((s) => s.permissions);
  const { data, isLoading, isError, error, refetch } = useReturnNextActions(returnId);
  const run = useRunReturnAction();
  const [open, setOpen] = useState<Open>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (isLoading) return <div role="status" aria-label="Loading next steps" className="h-32 w-full animate-pulse rounded-lg bg-[#F5F5F5]" />;
  if (isError || !data) {
    return (
      <div role="alert" className="space-y-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-[12px]">
        <p className="text-[#991B1B]">The next steps could not be loaded. {errorMessage(error)}</p>
        <button type="button" className={DRAWER_BTN_LIGHT} onClick={() => void refetch()}>
          Retry
        </button>
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
    <section aria-label="Next steps" className="space-y-2 pt-1">
      <h3 className="pb-1 text-[14px] font-semibold leading-[20px] text-black">Next steps</h3>
      <ol className="space-y-2">
        {data.actions.map((a) => {
          const reason = blockedReason(a);
          const isOpen = open?.kind === a.key;
          const isNext = data.next === a.key;
          const opensDrawer = a.key === "inspection" || a.key === "refund";
          return (
            <li key={a.key} className="space-y-2 rounded-lg border border-[#EAEAEA] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-black">{a.label}</p>
                  <p className={cn("text-[11px]", a.done ? "text-[#16A34A]" : reason ? "text-[#666666]" : "text-[#D97706]")}>
                    {a.done ? "Done" : (reason ?? (isNext ? "Ready to do now" : "Can be done now"))}
                  </p>
                </div>
                {!a.done && (
                  <button
                    type="button"
                    className={cn(isNext ? DRAWER_BTN_DARK : DRAWER_BTN_LIGHT, "shrink-0")}
                    disabled={reason !== null || run.isPending}
                    title={reason ?? undefined}
                    aria-expanded={opensDrawer ? undefined : isOpen}
                    aria-label={opensDrawer ? `Open ${a.label}` : isOpen ? `Hide ${a.label}` : a.label}
                    onClick={() => {
                      if (a.key === "inspection") onOpenInspection();
                      else if (a.key === "refund") onOpenRefund();
                      else toggle({ kind: a.key as FormKind, action: a });
                    }}
                  >
                    {opensDrawer ? "Open" : isOpen ? "Hide" : "Start"}
                  </button>
                )}
              </div>
              {isOpen && !opensDrawer && (
                <ReturnActionForm
                  kind={a.key as FormKind}
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
        <div className="space-y-2 pt-1">
          <div className="flex gap-2">
            {canReject && (
              <button type="button" className={DRAWER_BTN_LIGHT} aria-expanded={open?.kind === "reject"} onClick={() => toggle({ kind: "reject", action: null })}>
                Reject return
              </button>
            )}
            {canCancel && (
              <button type="button" className={DRAWER_BTN_LIGHT} aria-expanded={open?.kind === "cancel"} onClick={() => toggle({ kind: "cancel", action: null })}>
                Cancel return
              </button>
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
      {!canWrite && <p className="text-[11px] text-[#666666]">{NO_WRITE_REASON}</p>}
    </section>
  );
}
