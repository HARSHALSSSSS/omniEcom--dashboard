import { useState } from "react";
import { Download, Mail, Printer } from "lucide-react";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { toast } from "@/hooks/useToast";
import { useDeletePurchaseOrder, useDuplicatePurchaseOrder, usePurchaseOrder } from "@/hooks/useProcurement";
import { useWorkspaceStore } from "@/store/workspace.store";
import { saveBlob } from "@/components/products/list/saveBlob";
import { formatCurrency, formatDateTime, formatNumber } from "@/utils/format";
import type { PurchaseOrder } from "@/types/procurement";
import { canCancel, canReceive, dateOrDash, gstLabel, isDraft, orderCsv, orderPrintHtml, printHtml } from "./procurementFormat";
import { LateChip, PoStatusPill, Row, Section } from "./procurementUi";
import { CancelOrderDialog, DateActionDialog, ReceiveDialog } from "./PoActionDialogs";

interface PoDrawerProps {
  orderId: string | undefined;
  onClose: () => void;
  onEdit: (id: string) => void;
  /** after "duplicate" the new draft opens */
  onOpen: (id: string) => void;
}

type Dialog = "approve" | "acknowledge" | "cancel" | "receive" | "delete" | null;

/** one purchase order: summary, lines with receiving progress, totals, receipts, history and the actions its status allows */
export function PoDrawer({ orderId, onClose, onEdit, onOpen }: PoDrawerProps) {
  const query = usePurchaseOrder(orderId ?? null);
  const po = query.data;
  const canWrite = useCan("procurement:write");
  const canApprove = useCan("procurement:approve");
  const businessName = useWorkspaceStore((s) => s.shell?.business.name ?? "");
  const duplicate = useDuplicatePurchaseOrder();
  const remove = useDeletePurchaseOrder();
  const [dialog, setDialog] = useState<Dialog>(null);

  const doDuplicate = (p: PurchaseOrder) =>
    duplicate.mutate(p.id, {
      onSuccess: (copy) => {
        toast({ title: "Draft created", description: `${copy.poNumber} is a copy of ${p.poNumber}.`, variant: "success" });
        onOpen(copy.id);
      },
      onError: (e) => toast({ title: "Could not duplicate the order", description: errorMessage(e), variant: "destructive" }),
    });

  const doDelete = (p: PurchaseOrder) =>
    remove.mutate(p.id, {
      onSuccess: () => {
        toast({ title: "Draft deleted", description: `${p.poNumber} was removed.`, variant: "success" });
        setDialog(null);
        onClose();
      },
      onError: (e) => {
        setDialog(null);
        toast({ title: "Could not delete the draft", description: errorMessage(e), variant: "destructive" });
      },
    });

  const footer = po ? <Actions po={po} canWrite={canWrite} canApprove={canApprove} busy={duplicate.isPending} onDialog={setDialog} onEdit={() => onEdit(po.id)} onDuplicate={() => doDuplicate(po)} businessName={businessName} /> : undefined;

  return (
    <>
      <ContextDrawer
        open={orderId !== undefined}
        onClose={onClose}
        className="w-[680px] sm:max-w-[680px]"
        title={po ? po.poNumber : "Purchase order"}
        description={po ? `${po.supplierName} · deliver to ${po.warehouseName}` : undefined}
        badge={
          po ? (
            <span className="flex items-center gap-1.5">
              <PoStatusPill status={po.status} />
              {po.isLate && <LateChip />}
            </span>
          ) : undefined
        }
        footer={footer}
      >
        {query.isLoading && (
          <div role="status" aria-label="Loading purchase order" className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {query.isError && !po && (
          <div role="alert" className="space-y-2 text-xs">
            <p className="text-muted-foreground">This purchase order could not be loaded. {errorMessage(query.error)}</p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {po && <Detail po={po} />}
      </ContextDrawer>

      <DateActionDialog order={dialog === "approve" || dialog === "acknowledge" ? (po ?? null) : null} mode={dialog === "acknowledge" ? "acknowledge" : "approve"} onClose={() => setDialog(null)} />
      <CancelOrderDialog order={dialog === "cancel" ? (po ?? null) : null} onClose={() => setDialog(null)} />
      <ReceiveDialog order={dialog === "receive" ? (po ?? null) : null} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={dialog === "delete" && po !== undefined}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete ${po?.poNumber ?? "draft"}?`}
        description="The draft is removed for good. Nothing was ordered, so no stock is affected."
        confirmText="Delete draft"
        variant="destructive"
        loading={remove.isPending}
        onConfirm={() => po && doDelete(po)}
      />
    </>
  );
}

function Actions({ po, canWrite, canApprove, busy, businessName, onDialog, onEdit, onDuplicate }: { po: PurchaseOrder; canWrite: boolean; canApprove: boolean; busy: boolean; businessName: string; onDialog: (d: Dialog) => void; onEdit: () => void; onDuplicate: () => void }) {
  const noWrite = canWrite ? undefined : "You need purchasing permission to do this";
  const noApprove = canApprove ? undefined : "Only administrators can approve purchase orders";
  const mail = po.supplier.email
    ? `mailto:${encodeURIComponent(po.supplier.email).replace(/%40/g, "@")}?subject=${encodeURIComponent(`Purchase order ${po.poNumber}`)}&body=${encodeURIComponent(`Hello ${po.supplier.contactPerson ?? po.supplier.name},\n\nPlease find purchase order ${po.poNumber} (${formatCurrency(po.totalMinor, po.currency)}) from ${businessName}. Please confirm the delivery date.\n\nThank you`)}`
    : null;
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      {isDraft(po) && (
        <>
          <Button size="sm" className="text-xs" disabled={!canApprove} title={noApprove} onClick={() => onDialog("approve")}>
            Approve and submit
          </Button>
          <Button size="sm" variant="outline" className="text-xs" disabled={!canWrite} title={noWrite} onClick={onEdit}>
            Edit
          </Button>
        </>
      )}
      {po.status === "submitted" && (
        <Button size="sm" variant="outline" className="text-xs" disabled={!canWrite} title={noWrite} onClick={() => onDialog("acknowledge")}>
          Supplier confirmed
        </Button>
      )}
      {canReceive(po) && (
        <Button size="sm" className="text-xs" disabled={!canWrite} title={noWrite} onClick={() => onDialog("receive")}>
          Receive stock
        </Button>
      )}
      <Button size="sm" variant="outline" className="text-xs" disabled={!canWrite || busy} title={noWrite} onClick={onDuplicate}>
        Duplicate
      </Button>
      {canCancel(po) && (
        <Button size="sm" variant="outline" className="text-xs text-rose-700" disabled={!canWrite} title={noWrite} onClick={() => onDialog("cancel")}>
          Cancel order
        </Button>
      )}
      {isDraft(po) && (
        <Button size="sm" variant="ghost" className="text-xs text-rose-700" disabled={!canWrite} title={noWrite} onClick={() => onDialog("delete")}>
          Delete draft
        </Button>
      )}
      <span className="ml-auto flex items-center gap-1">
        <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => printHtml(orderPrintHtml(po, businessName))}>
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print
        </Button>
        <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => saveBlob(new Blob([orderCsv(po)], { type: "text/csv;charset=utf-8" }), `${po.poNumber}.csv`)}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          CSV
        </Button>
        {mail && po.status !== "draft" && (
          <a href={mail} className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium hover:bg-muted">
            <Mail className="h-3.5 w-3.5" aria-hidden />
            Email supplier
          </a>
        )}
      </span>
    </div>
  );
}

function Detail({ po }: { po: PurchaseOrder }) {
  const cur = po.currency;
  const pct = po.unitsOrdered > 0 ? Math.min(100, Math.round(((po.unitsReceived) / po.unitsOrdered) * 100)) : 0;
  return (
    <div className="space-y-6 text-xs">
      <Section title="Order">
        <div className="space-y-1.5 rounded-lg border border-border p-3">
          <Row label="Supplier" value={`${po.supplier.name} (${po.supplier.code})`} />
          {po.supplier.gstin && <Row label="Supplier GSTIN" value={<span className="font-mono">{po.supplier.gstin}</span>} />}
          <Row label="Deliver to" value={`${po.warehouse.name} (${po.warehouse.code})`} />
          <Row label="Ordered" value={dateOrDash(po.orderDate)} />
          <Row label="Expected" value={dateOrDash(po.expectedAt)} />
          {po.receivedAt && <Row label="Fully received" value={dateOrDash(po.receivedAt)} />}
          <Row label="Payment terms" value={po.paymentTerms ?? "—"} />
          {po.reference && <Row label="Reference" value={po.reference} />}
          {po.cancelReason && <Row label="Cancelled because" value={po.cancelReason} />}
          {po.notes && <Row label="Notes" value={po.notes} />}
        </div>
      </Section>

      <Section title={`Receiving progress · ${formatNumber(po.unitsReceived)} of ${formatNumber(po.unitsOrdered)} units`}>
        <div role="progressbar" aria-label="Share of ordered units received" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {formatNumber(po.unitsOutstanding)} still expected{po.unitsDamaged > 0 ? ` · ${formatNumber(po.unitsDamaged)} arrived damaged` : ""}
        </p>
      </Section>

      <Section title={`Lines (${po.lines.length})`}>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] text-muted-foreground">
                <th scope="col" className="px-3 py-2">Product</th>
                <th scope="col" className="px-3 py-2 text-right">Ordered</th>
                <th scope="col" className="px-3 py-2 text-right">Received</th>
                <th scope="col" className="px-3 py-2 text-right">Unit cost</th>
                <th scope="col" className="px-3 py-2 text-right">GST</th>
                <th scope="col" className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {po.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-foreground">{l.title}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{l.sku}</p>
                  </td>
                  <td className="px-3 py-2 text-right">{formatNumber(l.quantityOrdered)}</td>
                  <td className="px-3 py-2 text-right">
                    {formatNumber(l.quantityReceived)}
                    {l.quantityDamaged > 0 && <span className="block text-[10px] text-rose-700">{formatNumber(l.quantityDamaged)} damaged</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(l.unitCostMinor, cur)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{gstLabel(l.taxRateBps)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(l.totalMinor, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto w-full max-w-xs space-y-1 pt-1">
          <Row label="Subtotal" value={formatCurrency(po.subtotalMinor, cur)} />
          <Row label="GST" value={formatCurrency(po.taxMinor, cur)} />
          <Row label="Shipping" value={formatCurrency(po.shippingMinor, cur)} />
          <div className="border-t border-border pt-1">
            <Row label="Total" value={formatCurrency(po.totalMinor, cur)} strong />
          </div>
        </div>
      </Section>

      {po.receipts.length > 0 && (
        <Section title={`Receipts (${po.receipts.length})`}>
          <ul className="space-y-2">
            {po.receipts.map((r) => (
              <li key={r.id} className="space-y-1 rounded-lg border border-border p-3">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-foreground">{formatDateTime(r.receivedAt)}</span>
                  <span className="text-muted-foreground">{r.receivedBy?.name ?? "—"}</span>
                </div>
                {r.items.map((i) => (
                  <p key={`${r.id}-${i.lineId}`} className="font-mono text-[11px] text-muted-foreground">
                    {i.sku ?? i.variantId}: {formatNumber(i.received - i.damaged)} good{i.damaged > 0 ? `, ${formatNumber(i.damaged)} damaged` : ""}
                  </p>
                ))}
                {r.note && <p className="text-[11px] text-foreground">{r.note}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="History">
        {po.timeline.length === 0 ? (
          <p className="text-muted-foreground">No history yet.</p>
        ) : (
          <ol className="space-y-3 border-l border-border pl-3">
            {po.timeline.map((e, i) => (
              <li key={`${e.at}-${i}`} className="space-y-0.5">
                <p className="font-semibold text-foreground">{e.label}</p>
                {e.note && <p className="text-[11px] text-muted-foreground">{e.note}</p>}
                <p className="font-mono text-[10px] text-muted-foreground">
                  {formatDateTime(e.at)}
                  {e.actorName ? ` · ${e.actorName}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
