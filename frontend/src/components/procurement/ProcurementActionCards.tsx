import { AlertCircle, CheckCircle2, Clock, Truck, type LucideIcon } from "lucide-react";
import { formatCurrency, formatNumber } from "@/utils/format";
import type { PurchaseOrderSummary, Supplier } from "@/types/procurement";
import { dateOrDash } from "./procurementFormat";

interface Card {
  title: string;
  icon: LucideIcon;
  /** what it is about: a purchase order and its supplier, or a supplier */
  subject: string | null;
  description: string;
  actionLabel: string;
  /** null when there is nothing to act on: the card then says so */
  onAction: (() => void) | null;
}

const daysLate = (expectedAt: string | null): number | null => (expectedAt ? Math.max(0, Math.floor((Date.now() - new Date(expectedAt).getTime()) / 86_400_000)) : null);

function Cards({ heading, hint, cards }: { heading: string; hint: string; cards: Card[] }) {
  return (
    <div className="space-y-3 pt-4">
      <div className="flex flex-wrap items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">{heading}</h3>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.title} className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span>{c.title}</span>
                </div>
                {c.subject && <div className="text-xs font-medium text-foreground">{c.subject}</div>}
                <p className="text-[11px] leading-relaxed text-muted-foreground">{c.description}</p>
              </div>
              {c.onAction && (
                <div className="pt-3">
                  <button type="button" onClick={c.onAction} className="inline-flex items-center text-xs font-semibold text-foreground hover:underline">
                    {c.actionLabel}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface KeepOrdersMovingProps {
  orders?: PurchaseOrderSummary[];
  onOpenOrder?: (id: string) => void;
}

/** the next step for the orders on screen: a draft to approve, a late delivery to chase, a partial receipt to finish; a card with nothing to do says so */
export function KeepOrdersMoving({ orders = [], onOpenOrder }: KeepOrdersMovingProps) {
  const draft = orders.find((o) => o.status === "draft");
  const late = orders.find((o) => o.isLate);
  const partial = orders.find((o) => o.status === "partially_received");
  const open = (o: PurchaseOrderSummary | undefined) => (o && onOpenOrder ? () => onOpenOrder(o.id) : null);

  const cards: Card[] = [
    {
      title: "Approval check",
      icon: CheckCircle2,
      subject: draft ? `${draft.poNumber} · ${draft.supplierName}` : null,
      description: draft
        ? `Review ${formatNumber(draft.itemsCount)} line${draft.itemsCount === 1 ? "" : "s"}, ${formatNumber(draft.unitsOrdered)} units and ${formatCurrency(draft.totalMinor, draft.currency)}. Confirm the pricing${draft.expectedAt ? ` and the ${dateOrDash(draft.expectedAt)} delivery date` : ""} before approval.`
        : "No draft purchase order is waiting for approval.",
      actionLabel: "Review & approve →",
      onAction: open(draft),
    },
    {
      title: "Delivery follow-up",
      icon: AlertCircle,
      subject: late ? `${late.poNumber} · ${late.supplierName}` : null,
      description: late
        ? `Expected ${dateOrDash(late.expectedAt)}${daysLate(late.expectedAt) ? `, ${daysLate(late.expectedAt)} day${daysLate(late.expectedAt) === 1 ? "" : "s"} ago` : ""}. Contact the supplier and confirm a revised delivery date.`
        : "No delivery is overdue.",
      actionLabel: "Follow up →",
      onAction: open(late),
    },
    {
      title: "Receipt reconciliation",
      icon: Truck,
      subject: partial ? `${partial.poNumber} · ${partial.supplierName}` : null,
      description: partial
        ? `${formatNumber(partial.unitsOutstanding)} of ${formatNumber(partial.unitsOrdered)} units are still outstanding. Record what arrived against the order.`
        : "No order is partially received.",
      actionLabel: "Record receipt →",
      onAction: open(partial),
    },
  ];

  return <Cards heading="Keep orders moving" hint="Next steps from the displayed orders" cards={cards} />;
}

interface KeepSupplyMovingProps {
  suppliers?: Supplier[];
  orders?: PurchaseOrderSummary[];
  onOpenSupplier?: (id: string) => void;
  onOpenOrder?: (id: string) => void;
}

/** the next step for the supplier network: a late delivery, a draft waiting on a supplier's commitment, a supplier that cannot be ordered from yet */
export function KeepSupplyMoving({ suppliers = [], orders = [], onOpenSupplier, onOpenOrder }: KeepSupplyMovingProps) {
  const late = orders.find((o) => o.isLate);
  const draft = orders.find((o) => o.status === "draft");
  const incomplete = suppliers.find((s) => s.status === "active" && (!s.email || s.activeSkusCount === 0));

  const cards: Card[] = [
    {
      title: "Delivery follow-up",
      icon: AlertCircle,
      subject: late ? `${late.supplierName} · ${late.poNumber}` : null,
      description: late ? `${formatNumber(late.unitsOutstanding)} units expected on ${dateOrDash(late.expectedAt)} have not arrived. Contact the supplier and confirm a revised date.` : "No supplier delivery is overdue.",
      actionLabel: "Follow up →",
      onAction: late && onOpenOrder ? () => onOpenOrder(late.id) : null,
    },
    {
      title: "Confirm supplier commitment",
      icon: CheckCircle2,
      subject: draft ? `${draft.supplierName} · ${draft.poNumber}` : null,
      description: draft ? `Review ${formatNumber(draft.unitsOrdered)} units and ${formatCurrency(draft.totalMinor, draft.currency)} and confirm pricing with the supplier before approving.` : "No draft purchase order is waiting on a supplier.",
      actionLabel: "Review purchase order →",
      onAction: draft && onOpenOrder ? () => onOpenOrder(draft.id) : null,
    },
    {
      title: "Complete supplier setup",
      icon: Clock,
      subject: incomplete ? incomplete.name : null,
      description: incomplete
        ? `${!incomplete.email ? "Add a contact email" : "Add the products this supplier sells"} so purchase orders and reorder suggestions can use it.`
        : "Every active supplier has a contact email and a product list.",
      actionLabel: "Complete setup →",
      onAction: incomplete && onOpenSupplier ? () => onOpenSupplier(incomplete.id) : null,
    },
  ];

  return <Cards heading="Keep supply moving" hint="Next steps from your supplier network" cards={cards} />;
}
