import { useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { gstinErrorMessage, useGstinActions } from "@/hooks/useSettings";
import { useToastStore } from "@/hooks/useToast";
import { GstinDialog } from "./GstinDialog";
import { InlineError, ReadOnlyNote, SectionCard } from "./fields";
import type { Gstin, GstinStatus } from "@/types/settings";

const STATUS_CLASS: Record<GstinStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  inactive: "border-amber-200 bg-amber-50 text-amber-700",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
};
const STATUS_LABEL: Record<GstinStatus, string> = { active: "Active", inactive: "Inactive", cancelled: "Cancelled" };

/** the GST registrations of the business, one per state. Each change is saved immediately (not part of the Save button). */
export function GstinTab({ gstins, canWrite }: { gstins: Gstin[]; canWrite: boolean }) {
  const actions = useGstinActions();
  const toast = useToastStore.getState().addToast;
  const [dialog, setDialog] = useState<{ editing: Gstin | null } | null>(null);
  const [removing, setRemoving] = useState<Gstin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const makePrimary = async (g: Gstin) => {
    setError(null);
    setBusyId(g.id);
    try {
      await actions.makePrimary.mutateAsync(g.id);
      toast({ title: "Primary GSTIN changed", description: `${g.gstin} is now your primary registration.`, variant: "success" });
    } catch (e) {
      setError(gstinErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setError(null);
    try {
      await actions.remove.mutateAsync(removing.id);
      toast({ title: "Registration removed", description: removing.gstin, variant: "success" });
    } catch (e) {
      setError(gstinErrorMessage(e));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-4">
      {!canWrite && <ReadOnlyNote>You have read-only access to settings. You can see the registrations but not change them.</ReadOnlyNote>}
      {error && <InlineError>{error}</InlineError>}
      <SectionCard
        title="State GST registrations"
        description="Enables multi-state fulfilment and GST-compliant invoicing. The primary registration is printed on invoices by default."
        aside={
          canWrite ? (
            <Button type="button" size="sm" className="gap-1.5" onClick={() => setDialog({ editing: null })}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add GSTIN
            </Button>
          ) : undefined
        }
      >
        {gstins.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No GST registrations yet. {canWrite ? "Add your first GSTIN to start issuing GST invoices." : ""}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <caption className="sr-only">GST registrations</caption>
              <thead>
                <tr className="border-b border-border text-[11px] font-medium text-muted-foreground">
                  <th scope="col" className="px-3 py-2">State</th>
                  <th scope="col" className="px-3 py-2">GSTIN</th>
                  <th scope="col" className="px-3 py-2">Trade name</th>
                  <th scope="col" className="px-3 py-2">Registered address</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  {canWrite && (
                    <th scope="col" className="px-3 py-2 text-right">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {gstins.map((g) => (
                  <tr key={g.id} className={g.status === "active" ? "" : "text-muted-foreground"}>
                    <td className="px-3 py-3 font-medium text-foreground">
                      {g.stateName} <span className="font-normal text-muted-foreground">({g.stateCode})</span>
                    </td>
                    <td className="px-3 py-3 font-mono">{g.gstin}</td>
                    <td className="px-3 py-3">{g.tradeName ?? g.legalName ?? "-"}</td>
                    <td className="max-w-xs truncate px-3 py-3" title={g.registeredAddress ?? undefined}>
                      {g.registeredAddress ?? "-"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[g.status]}`}>{STATUS_LABEL[g.status]}</span>
                        {g.isPrimary && <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">Primary</span>}
                      </div>
                    </td>
                    {canWrite && (
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {!g.isPrimary && g.status === "active" && (
                            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" loading={busyId === g.id} disabled={!!busyId} aria-label={`Make ${g.gstin} the primary GSTIN`} onClick={() => void makePrimary(g)}>
                              {busyId !== g.id && <Star className="h-3 w-3" aria-hidden="true" />} Make primary
                            </Button>
                          )}
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${g.gstin}`} title="Edit" onClick={() => setDialog({ editing: g })}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${g.gstin}`} title="Delete" className="text-destructive hover:text-destructive" onClick={() => setRemoving(g)}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {dialog && <GstinDialog key={dialog.editing?.id ?? "new"} editing={dialog.editing} hasRegistrations={gstins.length > 0} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && !actions.remove.isPending && setRemoving(null)}
        title="Remove this GST registration?"
        description={
          removing?.isPrimary
            ? `${removing.gstin} is your primary GSTIN. It can only be removed when it is your last registration, otherwise make another one primary first.`
            : `${removing?.gstin ?? ""} (${removing?.stateName ?? ""}) is removed from your business. Invoices already issued are not changed.`
        }
        confirmText="Remove"
        variant="destructive"
        loading={actions.remove.isPending}
        onConfirm={() => void confirmRemove()}
      />
    </div>
  );
}
