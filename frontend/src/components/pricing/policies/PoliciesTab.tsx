import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { useDeletePolicy, usePolicies, useUpdatePolicy } from "@/hooks/usePricing";
import { toast } from "@/hooks/useToast";
import { formatNumber } from "@/utils/format";
import type { PricingChannel, PricingPolicy } from "@/types/pricing";
import { ConflictDialog } from "../ConflictDialog";
import { ListSkeleton, LoadError, StateBox } from "../PricingStates";
import { NO_WRITE_REASON, STRATEGY_LABELS, bpsText, isVersionConflict } from "../pricingFormat";
import { PolicyDialog } from "./PolicyDialog";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function PolicyCard({ policy, canWrite, busy, onToggle, onEdit, onDelete }: { policy: PricingPolicy; canWrite: boolean; busy: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const active = policy.status === "active";
  const p = policy.params;
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm" aria-label={policy.name}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{policy.name}</h3>
          <p className="text-[11px] font-medium text-[#1D4ED8]">
            {STRATEGY_LABELS[policy.strategy]} · {policy.channel}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label={`${policy.name} is ${active ? "active" : "paused"}`}
          disabled={!canWrite || busy}
          title={canWrite ? (active ? "Pause this policy" : "Resume this policy") : NO_WRITE_REASON}
          onClick={onToggle}
          className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted text-muted-foreground"}`}
        >
          {active ? "Active" : "Paused"}
        </button>
      </header>

      <dl className="space-y-1.5 border-t border-border pt-3 text-xs">
        <Row label="Margin floor" value={policy.targetMarginMinBps > 0 ? bpsText(policy.targetMarginMinBps) : "None"} />
        <Row label="Max discount" value={policy.maxDiscountBps > 0 ? bpsText(policy.maxDiscountBps) : "No decreases"} />
        <Row label="Auto-apply under" value={policy.autoApproveUnderBps > 0 ? bpsText(policy.autoApproveUnderBps) : "Always review"} />
        {typeof p.undercutBps === "number" && <Row label="Undercut competitor" value={bpsText(p.undercutBps)} />}
        {typeof p.targetMarginBps === "number" && <Row label="Target margin" value={bpsText(p.targetMarginBps)} />}
        {typeof p.stepBps === "number" && <Row label="Price cut" value={bpsText(p.stepBps)} />}
        <Row label="Looks at" value={`${formatNumber(policy.affectedVariants)} ${policy.affectedVariants === 1 ? "listing" : "listings"}`} />
      </dl>

      {canWrite && (
        <footer className="flex items-center gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onEdit}>
            <Pencil className="h-3 w-3" aria-hidden />
            Edit
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={onDelete} aria-label={`Delete ${policy.name}`}>
            <Trash2 className="h-3 w-3" aria-hidden />
            Delete
          </Button>
        </footer>
      )}
    </article>
  );
}

interface PoliciesTabProps {
  channels: PricingChannel[];
  canWrite: boolean;
}

/** the strategy rules and guardrails: pause, resume, edit, create and delete are each saved by the API */
export function PoliciesTab({ channels, canWrite }: PoliciesTabProps) {
  const list = usePolicies();
  const update = useUpdatePolicy();
  const remove = useDeletePolicy();
  const [editing, setEditing] = useState<PricingPolicy | "new" | null>(null);
  const [deleting, setDeleting] = useState<PricingPolicy | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = (policy: PricingPolicy) => {
    setBusyId(policy.id);
    const status = policy.status === "active" ? "paused" : "active";
    update.mutate(
      { id: policy.id, patch: { status }, version: policy.version },
      {
        onSuccess: () => toast({ title: status === "active" ? "Policy resumed" : "Policy paused", description: policy.name }),
        onError: (e) => (isVersionConflict(e) ? setConflict(true) : toast({ title: "Could not change the policy", description: errorMessage(e), variant: "destructive" })),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const policy = deleting;
    remove.mutate(policy.id, {
      onSuccess: () => {
        setDeleting(null);
        toast({ title: "Policy deleted", description: "Open proposals it created stay reviewable." });
      },
      onError: (e) => {
        setDeleting(null);
        toast({ title: "Could not delete the policy", description: errorMessage(e), variant: "destructive" });
      },
    });
  };

  const policies = list.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Strategy rules and margin floors</h2>
          <p className="text-xs text-muted-foreground">Policies decide which prices are proposed; the guardrails stop a price from going below a sustainable margin.</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" disabled={!canWrite} title={canWrite ? undefined : NO_WRITE_REASON} onClick={() => setEditing("new")}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New policy
        </Button>
      </div>

      {list.isLoading ? (
        <ListSkeleton label="Loading policies" rows={3} />
      ) : list.isError ? (
        <LoadError what="Policies" message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : policies.length === 0 ? (
        <StateBox title="No pricing policies yet." description="Create a policy to have price changes proposed automatically, for example following a competitor or protecting a minimum margin.">
          {canWrite && (
            <Button size="sm" className="text-xs" onClick={() => setEditing("new")}>
              Create your first policy
            </Button>
          )}
        </StateBox>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {policies.map((p) => (
            <PolicyCard key={p.id} policy={p} canWrite={canWrite} busy={busyId === p.id && update.isPending} onToggle={() => toggle(p)} onEdit={() => setEditing(p)} onDelete={() => setDeleting(p)} />
          ))}
        </div>
      )}

      <PolicyDialog
        open={editing !== null}
        policy={editing === "new" ? null : editing}
        channels={channels}
        onClose={() => setEditing(null)}
        onConflict={() => {
          setEditing(null);
          void list.refetch();
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this policy?"
        description={deleting ? `"${deleting.name}" will stop proposing prices. Proposals it already created stay in the queue.` : ""}
        confirmText="Delete policy"
        variant="destructive"
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
      <ConflictDialog
        open={conflict}
        what="policy"
        onClose={() => setConflict(false)}
        onReload={() => {
          setConflict(false);
          void list.refetch();
        }}
      />
    </div>
  );
}
