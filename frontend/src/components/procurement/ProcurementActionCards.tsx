import { AlertCircle, CheckCircle2, Clock, Truck } from "lucide-react";
import type { PurchaseOrderSummary, Supplier } from "@/types/procurement";

interface KeepOrdersMovingProps {
  orders?: PurchaseOrderSummary[];
  onOpenOrder?: (id: string) => void;
}

export function KeepOrdersMoving({ orders = [], onOpenOrder }: KeepOrdersMovingProps) {
  const cards = [
    {
      title: "Approval check",
      icon: CheckCircle2,
      poNumber: "PO-1048",
      supplier: "Urban Textiles",
      description: "Review 3 SKUs, 240 units and ₹72,000. Confirm pricing and the 18 Oct commitment before approval.",
      actionLabel: "Review & approve →",
      orderId: orders.find((o) => o.status === "draft")?.id ?? orders[0]?.id,
    },
    {
      title: "Delivery follow-up",
      icon: AlertCircle,
      poNumber: "PO-1043",
      supplier: "Craft Leather",
      description: "Expected 06 Oct; now 2 days overdue. Contact the supplier and confirm a revised delivery date.",
      actionLabel: "Follow up →",
      orderId: orders.find((o) => o.isLate)?.id ?? orders[1]?.id,
    },
    {
      title: "Receipt reconciliation",
      icon: Truck,
      poNumber: "PO-1041",
      supplier: "Homeware Co.",
      description: "This order is partially received. Record delivered quantities against the PO and check any outstanding balance.",
      actionLabel: "Record receipt →",
      orderId: orders.find((o) => o.status === "partially_received")?.id ?? orders[2]?.id,
    },
  ];

  return (
    <div className="space-y-3 pt-4">
      <div className="flex flex-wrap items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">Keep orders moving</h3>
        <span className="text-[11px] text-muted-foreground">Next steps from the displayed orders</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span>{c.title}</span>
                </div>
                <div className="text-xs font-medium text-foreground">
                  {c.poNumber} · <span className="text-muted-foreground">{c.supplier}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {c.description}
                </p>
              </div>
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => c.orderId && onOpenOrder?.(c.orderId)}
                  className="inline-flex items-center text-xs font-semibold text-foreground hover:underline"
                >
                  {c.actionLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="pt-2 text-[11px] text-muted-foreground">
        ⓘ All procurement records, dates, quantities and statuses are illustrative, not synced or verified. Confirm supplier commitments, pricing and payment terms before approval; record receipts against delivered quantities. Your review and approval are required. No orders sent automatically.
      </div>
    </div>
  );
}

interface KeepSupplyMovingProps {
  suppliers?: Supplier[];
  onOpenSupplier?: (id: string) => void;
  onOpenOrder?: (id: string) => void;
}

export function KeepSupplyMoving({ suppliers = [], onOpenSupplier }: KeepSupplyMovingProps) {
  const cards = [
    {
      title: "Delivery follow-up",
      icon: AlertCircle,
      supplierLabel: "Craft Leather · PO-1043",
      description: "60 units expected on 06 Oct are now 2 days overdue. Contact the supplier and confirm a revised delivery date.",
      actionLabel: "Follow up →",
      supplierId: suppliers[0]?.id,
    },
    {
      title: "Confirm supplier commitment",
      icon: CheckCircle2,
      supplierLabel: "Urban Textiles · PO-1048",
      description: "Review 3 SKUs, 240 units and ₹72,000. Confirm pricing and the 18 Oct commitment before approving the order.",
      actionLabel: "Review purchase order →",
      supplierId: suppliers[1]?.id ?? suppliers[0]?.id,
    },
    {
      title: "Complete supplier setup",
      icon: Clock,
      supplierLabel: "Terra Home · Illustrative supplier",
      description: "Confirm the primary contact, agree payment terms and record lead time before approving the draft purchase order.",
      actionLabel: "Complete setup →",
      supplierId: suppliers[2]?.id ?? suppliers[0]?.id,
    },
  ];

  return (
    <div className="space-y-3 pt-4">
      <div className="flex flex-wrap items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">Keep supply moving</h3>
        <span className="text-[11px] text-muted-foreground">Next steps from your supplier network</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span>{c.title}</span>
                </div>
                <div className="text-xs font-medium text-foreground">{c.supplierLabel}</div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {c.description}
                </p>
              </div>
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => c.supplierId && onOpenSupplier?.(c.supplierId)}
                  className="inline-flex items-center text-xs font-semibold text-foreground hover:underline"
                >
                  {c.actionLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="pt-2 text-[11px] text-muted-foreground">
        ⓘ All supplier records, contacts, terms, lead times and statuses are illustrative, not synced or verified. Terra Home is a conceptual supplier. Confirm supplier details, pricing and payment terms before approval. Your review and approval are required. No orders sent automatically.
      </div>
    </div>
  );
}
