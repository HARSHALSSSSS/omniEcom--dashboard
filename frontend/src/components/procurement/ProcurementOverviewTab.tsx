import { useMemo, useState } from "react";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/api/errors";
import { useCreateFromSuggestions } from "@/hooks/useProcurement";
import { toast } from "@/hooks/useToast";
import { formatCurrency, formatNumber } from "@/utils/format";
import type { ProcurementOverview, PurchaseOrderStatus, PurchaseOrderSummary, ReorderSuggestion, Supplier } from "@/types/procurement";
import { ProcurementPulse } from "./ProcurementPulse";
import { PoStatusPill } from "./procurementUi";
import { dateOrDash } from "./procurementFormat";

type PoFilter = "all" | "draft" | "incoming" | "overdue";

interface ProcurementOverviewTabProps {
  overview: ProcurementOverview | undefined;
  suggestions: ReorderSuggestion[];
  suggestionsLoading?: boolean;
  orders: PurchaseOrderSummary[];
  suppliers: Supplier[];
  canWrite: boolean;
  onOpenOrder: (id: string) => void;
  onOpenSupplier: (id: string) => void;
  /** a tab, and for the orders tab optionally the status to show (the URL carries it) */
  onNavigateTab: (tab: "orders" | "suppliers" | "reorder", status?: PurchaseOrderStatus) => void;
  onCreateOrder: () => void;
  onAddSupplier: () => void;
}

const isOpen = (o: PurchaseOrderSummary) => o.status !== "received" && o.status !== "cancelled";

function Empty({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{description}</p>
      {children && <div className="flex items-center gap-2 pt-1">{children}</div>}
    </div>
  );
}

/** Overview: the pulse, what to replenish, the open orders and the supplier network. Everything is the business's own data; an empty list is shown as empty. */
export function ProcurementOverviewTab({ overview, suggestions, suggestionsLoading, orders, suppliers, canWrite, onOpenOrder, onOpenSupplier, onNavigateTab, onCreateOrder, onAddSupplier }: ProcurementOverviewTabProps) {
  const [poFilter, setPoFilter] = useState<PoFilter>("all");
  const createFromSuggestion = useCreateFromSuggestions();
  const [busyVariant, setBusyVariant] = useState<string | null>(null);
  const noWrite = canWrite ? undefined : "You need purchasing permission to do this";

  const openOrders = useMemo(() => orders.filter(isOpen), [orders]);
  const displayedOrders = useMemo(() => {
    if (poFilter === "draft") return openOrders.filter((o) => o.status === "draft");
    if (poFilter === "incoming") return openOrders.filter((o) => o.status === "submitted" || o.status === "acknowledged" || o.status === "partially_received");
    if (poFilter === "overdue") return openOrders.filter((o) => o.isLate);
    return openOrders.slice(0, 5);
  }, [openOrders, poFilter]);

  // the counts come from the server, not from the rows that happen to be loaded
  const awaiting = overview?.awaitingApproval;
  const incoming = overview ? overview.openPurchaseOrders : undefined;
  const overdue = overview?.latePurchaseOrders;
  const allOpen = overview ? overview.openPurchaseOrders + overview.awaitingApproval : undefined;
  const cnt = (v: number | undefined) => (v === undefined ? "—" : formatNumber(v));

  const prioritySuggestions = suggestions.slice(0, 4);
  const urgentCount = overview?.belowCoverCount ?? 0;

  const createFor = (s: ReorderSuggestion) => {
    setBusyVariant(s.variantId);
    createFromSuggestion.mutate(
      { variantIds: [s.variantId], dryRun: false },
      {
        onSuccess: (res) => {
          const made = res.orders[0];
          if (made?.id) {
            toast({ title: "Draft purchase order created", description: `${made.poNumber ?? "Draft"} for ${s.title ?? s.sku}. Review it, then approve it to send.`, variant: "success" });
            onOpenOrder(made.id);
          } else {
            toast({ title: "No order was created", description: "No supplier is set up for this product yet.", variant: "destructive" });
          }
        },
        onError: (e) => toast({ title: "Could not create the draft order", description: errorMessage(e), variant: "destructive" }),
        onSettled: () => setBusyVariant(null),
      },
    );
  };

  const chip = (id: PoFilter, label: string, count: string, tone?: "late") =>
    (
      <button
        key={id}
        type="button"
        onClick={() => setPoFilter(id)}
        className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
          poFilter === id ? `bg-background shadow-2xs ${tone ? "text-rose-600 dark:text-rose-400" : "text-foreground"}` : tone ? "text-rose-600 hover:text-rose-700 dark:text-rose-400" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label} <span className={tone ? "font-semibold" : "text-muted-foreground"}>{count}</span>
      </button>
    );

  return (
    <div className="space-y-8">
      <ProcurementPulse overview={overview} variant="procurement" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Replenishment needs</h3>
            <span className="text-xs text-muted-foreground">
              {prioritySuggestions.length} priority SKUs / {cnt(overview?.reorderSuggestionsCount ?? suggestions.length)} total
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
            {suggestionsLoading && suggestions.length === 0 ? (
              <p role="status" className="px-6 py-8 text-center text-xs text-muted-foreground">
                Loading replenishment needs...
              </p>
            ) : suggestions.length === 0 ? (
              <Empty title="Stock levels are fine" description="No product is running low against its recent sales, after counting what is already on order. Suggestions appear here when one is." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground">
                      <th scope="col" className="px-4 py-3">Product / Supplier</th>
                      <th scope="col" className="px-4 py-3 text-right">Stock</th>
                      <th scope="col" className="px-4 py-3">Cover / Lead</th>
                      <th scope="col" className="px-4 py-3 text-right">Suggested</th>
                      <th scope="col" className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {prioritySuggestions.map((item) => {
                      const lead = item.supplier?.leadTimeDays ?? null;
                      const cover = item.daysOfCover !== null ? Math.round(item.daysOfCover) : null;
                      const isUrgent = cover !== null && lead !== null && cover < lead;
                      return (
                        <tr key={item.variantId} className="hover:bg-muted/30">
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-foreground">{item.title ?? item.sku}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {item.sku} {item.supplier ? `· ${item.supplier.name}` : "· no supplier yet"}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium text-foreground">{formatNumber(item.available)}</td>
                          <td className="px-4 py-3.5">
                            <span className={isUrgent ? "font-semibold text-rose-600 dark:text-rose-400" : "text-foreground"}>{cover !== null ? `${cover} days` : "—"}</span>
                            <span className="text-muted-foreground"> · {lead !== null ? `${lead}-day lead` : "lead time unknown"}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold text-foreground">{formatNumber(item.netUnits)} units</td>
                          <td className="px-4 py-3.5 text-right">
                            {item.supplier ? (
                              <button
                                type="button"
                                disabled={!canWrite || busyVariant === item.variantId}
                                title={noWrite}
                                onClick={() => createFor(item)}
                                className="font-medium text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                              >
                                {busyVariant === item.variantId ? "Creating..." : "Create PO >"}
                              </button>
                            ) : (
                              <button type="button" onClick={() => onNavigateTab("suppliers")} className="font-medium text-foreground hover:underline">
                                Add a supplier &gt;
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
              <span>From your recent sales speed and stock, minus what is already on order. Review quantities before ordering.</span>
              <button type="button" onClick={() => onNavigateTab("reorder")} className="font-medium text-foreground hover:underline">
                View all {cnt(overview?.reorderSuggestionsCount ?? suggestions.length)} →
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-[#D6CDFB]/80 bg-gradient-to-r from-[#E6DEFF] via-[#CFE1FF] to-[#E6F0FF] p-5 shadow-2xs dark:border-border dark:from-card dark:via-card dark:to-card">
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden />
              <span>Procurement intelligence</span>
            </div>
            <h4 className="text-base font-bold leading-snug text-foreground">
              {urgentCount > 0 ? `${urgentCount} product${urgentCount === 1 ? "" : "s"} may run out before the next supplier delivery.` : "No product is set to run out before a delivery could arrive."}
            </h4>
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-foreground">Why this matters</span>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {urgentCount > 0
                  ? "Their stock cover is shorter than the supplier's lead time. Prioritise these SKUs and confirm availability with suppliers before raising a purchase order."
                  : "Cover is compared with each supplier's lead time. Products without a supplier are compared with the average lead time of your active suppliers."}
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => onNavigateTab("reorder")} className="w-full gap-2 bg-white/80 text-xs font-medium text-foreground shadow-2xs hover:bg-white dark:bg-card/80">
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              Review replenishment
            </Button>
            <p className="text-[10px] leading-tight text-muted-foreground">Advisory only. Nothing is ordered until you approve a purchase order.</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-sm font-semibold text-foreground">Purchase orders</h3>
            <div className="flex items-center gap-1 rounded-md bg-muted/40 p-0.5 text-xs">
              {chip("all", "All open", cnt(allOpen))}
              {chip("draft", "Awaiting approval", cnt(awaiting))}
              {chip("incoming", "Incoming", cnt(incoming))}
              {chip("overdue", "Overdue", cnt(overdue), "late")}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">
              {displayedOrders.length} shown of {cnt(allOpen)} open orders
            </span>
            <button type="button" onClick={() => onNavigateTab("orders", poFilter === "draft" ? "draft" : undefined)} className="text-xs font-medium text-foreground hover:underline">
              View all purchase orders →
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
          {orders.length === 0 ? (
            <Empty title="No purchase orders yet" description="A purchase order asks a supplier for stock. Create one by hand, or start from the replenishment needs above.">
              <Button size="sm" className="gap-1.5 text-xs" disabled={!canWrite} title={noWrite} onClick={onCreateOrder}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Create purchase order
              </Button>
            </Empty>
          ) : displayedOrders.length === 0 ? (
            <Empty title={poFilter === "overdue" ? "No delivery is overdue" : poFilter === "draft" ? "Nothing is waiting for approval" : "No open purchase orders in this view"} description="Orders that match appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground">
                    <th scope="col" className="px-4 py-3">Purchase order</th>
                    <th scope="col" className="px-4 py-3">Supplier</th>
                    <th scope="col" className="px-4 py-3 text-right">Quantity</th>
                    <th scope="col" className="px-4 py-3 text-right">Value</th>
                    <th scope="col" className="px-4 py-3">Expected delivery</th>
                    <th scope="col" className="px-4 py-3 text-center">Status</th>
                    <th scope="col" className="px-4 py-3 text-right">Next action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayedOrders.map((po) => {
                    const nextAction = po.status === "draft" ? "Review & approve >" : po.isLate ? "Follow up >" : po.status === "partially_received" ? "Record receipt >" : "View order >";
                    return (
                      <tr key={po.id} onClick={() => onOpenOrder(po.id)} className="cursor-pointer hover:bg-muted/30">
                        <td className="px-4 py-3.5">
                          <div className="font-mono font-semibold text-foreground">{po.poNumber}</div>
                          <div className="text-[11px] text-muted-foreground">Created {dateOrDash(po.orderDate)}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-foreground">{po.supplierName}</div>
                          <div className="text-[11px] text-muted-foreground">{po.itemsCount} {po.itemsCount === 1 ? "SKU" : "SKUs"}</div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium text-foreground">{formatNumber(po.unitsOrdered)} units</td>
                        <td className="px-4 py-3.5 text-right font-semibold text-foreground">{formatCurrency(po.totalMinor, po.currency)}</td>
                        <td className="px-4 py-3.5">
                          <span className={po.isLate ? "font-semibold text-rose-600 dark:text-rose-400" : "text-foreground"}>{dateOrDash(po.expectedAt)}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <PoStatusPill status={po.status} isLate={po.isLate} />
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium text-foreground hover:underline">{nextAction}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Supplier context</h3>
          <button type="button" onClick={() => onNavigateTab("suppliers")} className="text-xs font-medium text-foreground hover:underline">
            Manage suppliers →
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
          {suppliers.length === 0 ? (
            <Empty title="No suppliers yet" description="A supplier sells you products. Add one with its price list and lead time so purchase orders and reorder suggestions can use it.">
              <Button size="sm" className="gap-1.5 text-xs" disabled={!canWrite} title={noWrite} onClick={onAddSupplier}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add supplier
              </Button>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground">
                    <th scope="col" className="px-4 py-3">Supplier</th>
                    <th scope="col" className="px-4 py-3">Lead time</th>
                    <th scope="col" className="px-4 py-3">Payment terms</th>
                    <th scope="col" className="px-4 py-3 text-right">Open orders</th>
                    <th scope="col" className="px-4 py-3">Planning context</th>
                    <th scope="col" className="px-4 py-3 text-right">Next action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {suppliers.slice(0, 4).map((sup) => {
                    const needsSetup = sup.status === "active" && (!sup.email || sup.activeSkusCount === 0);
                    const context = needsSetup ? (sup.activeSkusCount === 0 ? "No products on its price list yet" : "No contact email yet") : sup.openPurchaseOrders > 0 ? `${formatNumber(sup.openPurchaseOrders)} open ${sup.openPurchaseOrders === 1 ? "order" : "orders"}` : `${formatNumber(sup.activeSkusCount)} ${sup.activeSkusCount === 1 ? "product" : "products"} listed`;
                    return (
                      <tr key={sup.id} onClick={() => onOpenSupplier(sup.id)} className="cursor-pointer hover:bg-muted/30">
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-foreground">{sup.name}</div>
                          <div className="text-[11px] text-muted-foreground">{sup.location || sup.code}</div>
                        </td>
                        <td className="px-4 py-3.5 text-foreground">{sup.leadTimeDays > 0 ? `${sup.leadTimeDays} days` : "Not set"}</td>
                        <td className="px-4 py-3.5 text-foreground">{sup.paymentTerms ?? "Not set"}</td>
                        <td className="px-4 py-3.5 text-right font-medium text-foreground">
                          {formatNumber(sup.openPurchaseOrders)} {sup.openPurchaseOrders === 1 ? "order" : "orders"}
                        </td>
                        <td className="px-4 py-3.5 text-[11px]">
                          <span className={needsSetup ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>{context}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium text-foreground hover:underline">{needsSetup ? "Complete setup >" : "View supplier >"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
