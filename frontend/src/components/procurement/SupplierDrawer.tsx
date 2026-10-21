import { useState } from "react";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { toast } from "@/hooks/useToast";
import { useDeleteSupplier, useSupplier } from "@/hooks/useProcurement";
import { formatCurrency, formatNumber } from "@/utils/format";
import type { SupplierDetail } from "@/types/procurement";
import { dateOrDash } from "./procurementFormat";
import { PoStatusPill, Row, Section, SupplierStatusPill } from "./procurementUi";
import { SupplierProducts } from "./SupplierProducts";

interface SupplierDrawerProps {
  supplierId: string | undefined;
  onClose: () => void;
  onEdit: (supplier: SupplierDetail) => void;
  onNewOrder: (supplierId: string) => void;
  onOpenOrder: (id: string) => void;
}

/** one supplier: scorecard from real receipts, contact, price list, recent orders */
export function SupplierDrawer({ supplierId, onClose, onEdit, onNewOrder, onOpenOrder }: SupplierDrawerProps) {
  const query = useSupplier(supplierId ?? null);
  const s = query.data;
  const canWrite = useCan("procurement:write");
  const remove = useDeleteSupplier();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const noWrite = canWrite ? undefined : "You need purchasing permission to do this";

  const doDelete = (sup: SupplierDetail) =>
    remove.mutate(sup.id, {
      onSuccess: () => {
        toast({ title: "Supplier deleted", description: `${sup.name} was removed.`, variant: "success" });
        setConfirmDelete(false);
        onClose();
      },
      onError: (e) => {
        setConfirmDelete(false);
        // refused while the supplier has a draft or open purchase order: the message says so
        toast({ title: "Could not delete the supplier", description: errorMessage(e), variant: "destructive" });
      },
    });

  return (
    <>
      <ContextDrawer
        open={supplierId !== undefined}
        onClose={onClose}
        className="w-[720px] sm:max-w-[720px]"
        title={s ? s.name : "Supplier"}
        description={s ? `${s.code}${s.location ? ` · ${s.location}` : ""}` : undefined}
        badge={s ? <SupplierStatusPill status={s.status} /> : undefined}
        footer={
          s ? (
            <div className="flex w-full flex-wrap items-center gap-2">
              <Button size="sm" className="text-xs" disabled={!canWrite || s.status !== "active"} title={s.status !== "active" ? "Only active suppliers can get new purchase orders" : noWrite} onClick={() => onNewOrder(s.id)}>
                New purchase order
              </Button>
              <Button size="sm" variant="outline" className="text-xs" disabled={!canWrite} title={noWrite} onClick={() => onEdit(s)}>
                Edit supplier
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto text-xs text-rose-700" disabled={!canWrite} title={noWrite} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            </div>
          ) : undefined
        }
      >
        {query.isLoading && (
          <div role="status" aria-label="Loading supplier" className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {query.isError && !s && (
          <div role="alert" className="space-y-2 text-xs">
            <p className="text-muted-foreground">This supplier could not be loaded. {errorMessage(query.error)}</p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {s && (
          <div className="space-y-6 text-xs">
            <Section title="Delivery record">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="On-time" value={s.onTimeRatePercent === null ? "—" : `${Math.round(s.onTimeRatePercent)}%`} />
                <Stat label="Rating" value={s.rating === null ? "—" : `★ ${s.rating.toFixed(1)}`} />
                <Stat label="Actual lead time" value={s.averageLeadTimeDays === null ? "—" : `${s.averageLeadTimeDays} days`} />
                <Stat label="Open orders" value={formatNumber(s.openPurchaseOrders)} />
              </div>
              {(s.onTimeRatePercent === null || s.rating === null) && (
                <p className="text-[11px] text-muted-foreground">
                  On-time rate and rating appear after 3 fully received orders ({formatNumber(s.deliveredPurchaseOrders)} so far).
                </p>
              )}
            </Section>

            <Section title="Contact and terms">
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                <Row label="Contact" value={s.contactPerson ?? "—"} />
                <Row label="E-mail" value={s.email ?? "—"} />
                <Row label="Phone" value={s.phone ?? "—"} />
                <Row label="GSTIN" value={s.gstin ? <span className="font-mono">{s.gstin}</span> : "—"} />
                <Row label="Payment terms" value={s.paymentTerms ?? "—"} />
                <Row label="Standard lead time" value={`${s.leadTimeDays} days`} />
                {s.notes && <Row label="Notes" value={s.notes} />}
              </div>
            </Section>

            <Section title={`Price list (${formatNumber(s.activeSkusCount)})`}>
              <SupplierProducts supplierId={s.id} canWrite={canWrite} />
            </Section>

            <Section title="Recent purchase orders">
              {s.recentPurchaseOrders.length === 0 ? (
                <p className="text-muted-foreground">No purchase orders yet.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {s.recentPurchaseOrders.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div>
                        <button type="button" onClick={() => onOpenOrder(p.id)} className="font-mono font-semibold text-blue-700 hover:underline">
                          {p.poNumber}
                        </button>
                        <p className="text-[11px] text-muted-foreground">
                          {dateOrDash(p.orderDate)} · {formatCurrency(p.totalMinor, p.currency)}
                        </p>
                      </div>
                      <PoStatusPill status={p.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </ContextDrawer>
      <ConfirmDialog
        open={confirmDelete && s !== undefined}
        onOpenChange={setConfirmDelete}
        title={`Delete ${s?.name ?? "supplier"}?`}
        description="The supplier is removed from your lists. Suppliers with a draft or open purchase order cannot be deleted."
        confirmText="Delete supplier"
        variant="destructive"
        loading={remove.isPending}
        onConfirm={() => s && doDelete(s)}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-bold text-foreground">{value}</p>
    </div>
  );
}
