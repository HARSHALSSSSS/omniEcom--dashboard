import { useMemo, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/utils/format";
import type { ProcurementOverview, PurchaseOrderSummary, ReorderSuggestion, Supplier } from "@/types/procurement";
import { ProcurementPulse } from "./ProcurementPulse";
import { PoStatusPill } from "./procurementUi";
import { dateOrDash } from "./procurementFormat";
import {
  FIGMA_PURCHASE_ORDERS,
  FIGMA_REPLENISHMENT_SUGGESTIONS,
  FIGMA_SUPPLIERS,
} from "./figmaProcurementData";

interface ProcurementOverviewTabProps {
  overview: ProcurementOverview | undefined;
  suggestions: ReorderSuggestion[];
  orders: PurchaseOrderSummary[];
  suppliers: Supplier[];
  onOpenOrder: (id: string) => void;
  onOpenSupplier: (id: string) => void;
  onNavigateTab: (tab: "orders" | "suppliers" | "reorder") => void;
  onCreatePoWithSuggestion?: (suggestion: ReorderSuggestion) => void;
}

export function ProcurementOverviewTab({
  overview,
  suggestions,
  orders,
  suppliers,
  onOpenOrder,
  onOpenSupplier,
  onNavigateTab,
  onCreatePoWithSuggestion,
}: ProcurementOverviewTabProps) {
  const [poFilter, setPoFilter] = useState<"all" | "draft" | "incoming" | "overdue">("all");

  // Fallbacks to realistic Figma data when workspace database is empty
  const effectiveSuggestions = suggestions.length > 0 ? suggestions : FIGMA_REPLENISHMENT_SUGGESTIONS;
  const effectiveOrders = orders.length > 0 ? orders : FIGMA_PURCHASE_ORDERS;
  const effectiveSuppliers = suppliers.length > 0 ? suppliers : FIGMA_SUPPLIERS;

  // Filter purchase orders preview
  const openOrders = useMemo(() => {
    return effectiveOrders.filter((o) => o.status !== "received" && o.status !== "cancelled");
  }, [effectiveOrders]);

  const displayedOrders = useMemo(() => {
    if (poFilter === "draft") return openOrders.filter((o) => o.status === "draft");
    if (poFilter === "incoming") return openOrders.filter((o) => o.status === "submitted" || o.status === "acknowledged");
    if (poFilter === "overdue") return openOrders.filter((o) => o.isLate || (o.expectedAt && new Date(o.expectedAt) < new Date("2026-10-08T00:00:00Z")));
    return openOrders.slice(0, 5);
  }, [openOrders, poFilter]);

  const awaitingCount = openOrders.filter((o) => o.status === "draft").length;
  const incomingCount = openOrders.filter((o) => o.status === "submitted" || o.status === "acknowledged").length;
  const overdueCount = openOrders.filter((o) => o.isLate || (o.expectedAt && new Date(o.expectedAt) < new Date("2026-10-08T00:00:00Z"))).length;

  // Replenishment items (take first 4 as priority)
  const prioritySuggestions = effectiveSuggestions.slice(0, 4);
  const urgentCount = effectiveSuggestions.filter((s) => (s.daysOfCover ?? 999) < (s.supplier?.leadTimeDays ?? 7)).length;

  return (
    <div className="space-y-8">
      {/* 1. Procurement Pulse Bar */}
      <ProcurementPulse overview={overview} variant="procurement" />

      {/* 2. Replenishment Needs & Procurement Intelligence */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Replenishment Needs Table */}
        <div className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Replenishment needs</h3>
            </div>
            <span className="text-xs text-muted-foreground">
              {prioritySuggestions.length} priority SKUs / {overview?.reorderSuggestionsCount ?? effectiveSuggestions.length} total
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
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
                    const lead = item.supplier?.leadTimeDays ?? 7;
                    const cover = item.daysOfCover !== null ? Math.round(item.daysOfCover) : null;
                    const isUrgent = cover !== null && cover <= lead;

                    return (
                      <tr key={item.variantId} className="hover:bg-muted/30">
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-foreground">{item.title ?? item.sku}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {item.sku} {item.supplier ? `· ${item.supplier.name}` : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium text-foreground">
                          {formatNumber(item.available)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={isUrgent ? "font-semibold text-rose-600 dark:text-rose-400" : "text-foreground"}>
                            {cover !== null ? `${cover} days` : "—"}
                          </span>
                          <span className="text-muted-foreground"> · {lead}-day lead</span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-foreground">
                          {formatNumber(item.netUnits)} units
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              if (onCreatePoWithSuggestion) onCreatePoWithSuggestion(item);
                              else onNavigateTab("reorder");
                            }}
                            className="font-medium text-foreground hover:underline"
                          >
                            Review &gt;
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
              <span>Illustrative demand and lead times · Review quantities before ordering</span>
              <button
                type="button"
                onClick={() => onNavigateTab("reorder")}
                className="font-medium text-foreground hover:underline"
              >
                View all {overview?.reorderSuggestionsCount ?? effectiveSuggestions.length} →
              </button>
            </div>
          </div>
        </div>

        {/* Right: Procurement Intelligence Card */}
        <div className="flex flex-col justify-between rounded-xl border border-[#D6CDFB]/80 bg-gradient-to-r from-[#E6DEFF] via-[#CFE1FF] to-[#9DCBFF] dark:from-[#2B2148] dark:via-[#1C2846] dark:to-[#162D4D] dark:border-indigo-900/50 p-5 shadow-2xs">
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden />
              <span>Procurement intelligence</span>
            </div>
            <h4 className="text-base font-bold leading-snug text-foreground">
              {urgentCount > 0 ? `${urgentCount} products may run out before the next supplier delivery.` : "Stock levels are healthy against current demand."}
            </h4>
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-foreground">Why this matters</span>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Stock cover is shorter than the example lead time. Prioritize these SKUs and confirm availability with suppliers before raising a purchase order.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab("reorder")}
              className="w-full gap-2 bg-white/80 text-xs font-medium text-foreground shadow-2xs hover:bg-white dark:bg-card/80"
            >
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              Review replenishment
            </Button>
            <p className="text-[10px] leading-tight text-muted-foreground">
              Advisory only · Illustrative data · Your review and approval are required. No automatic purchasing.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Purchase Orders Preview */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-sm font-semibold text-foreground">Purchase orders</h3>
            <div className="flex items-center gap-1 rounded-md bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPoFilter("all")}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  poFilter === "all" ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All open <span className="text-muted-foreground">{openOrders.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setPoFilter("draft")}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  poFilter === "draft" ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Awaiting approval <span className="text-muted-foreground">{awaitingCount}</span>
              </button>
              <button
                type="button"
                onClick={() => setPoFilter("incoming")}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  poFilter === "incoming" ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Incoming <span className="text-muted-foreground">{incomingCount}</span>
              </button>
              <button
                type="button"
                onClick={() => setPoFilter("overdue")}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  poFilter === "overdue" ? "bg-background text-rose-600 shadow-2xs dark:text-rose-400" : "text-rose-600 hover:text-rose-700 dark:text-rose-400"
                }`}
              >
                Overdue <span className="font-semibold">{overdueCount}</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">
              Illustrative records · {displayedOrders.length} of {openOrders.length} open orders
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab("orders")}
              className="text-xs font-medium text-foreground hover:underline"
            >
              View all purchase orders →
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
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
                  let nextAction = "View order >";
                  if (po.status === "draft") nextAction = "Review & approve >";
                  else if (po.isLate || (po.expectedAt && new Date(po.expectedAt) < new Date("2026-10-08T00:00:00Z"))) nextAction = "Follow up >";
                  else if (po.status === "partially_received") nextAction = "Record receipt >";

                  const isLateRow = Boolean(po.isLate || (po.expectedAt && new Date(po.expectedAt) < new Date("2026-10-08T00:00:00Z")));

                  return (
                    <tr key={po.id} onClick={() => onOpenOrder(po.id)} className="cursor-pointer hover:bg-muted/30">
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-semibold text-foreground">{po.poNumber}</div>
                        <div className="text-[11px] text-muted-foreground">Created {dateOrDash(po.orderDate)}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-foreground">{po.supplierName}</div>
                        <div className="text-[11px] text-muted-foreground">{po.itemsCount} SKUs</div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-foreground">
                        {formatNumber(po.unitsOrdered)} units
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-foreground">
                        {formatCurrency(po.totalMinor, po.currency)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={isLateRow ? "font-semibold text-rose-600 dark:text-rose-400" : "text-foreground"}>
                          {dateOrDash(po.expectedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <PoStatusPill status={po.status} isLate={isLateRow} />
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-foreground hover:underline">
                        {nextAction}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
            Dates, quantities and statuses are illustrative. Confirm supplier commitments before approval; record receipts against delivered quantities.
          </div>
        </div>
      </div>

      {/* 4. Supplier Context Preview */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Supplier context</h3>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">Illustrative supplier terms</span>
            <button
              type="button"
              onClick={() => onNavigateTab("suppliers")}
              className="text-xs font-medium text-foreground hover:underline"
            >
              Manage suppliers →
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
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
                {effectiveSuppliers.slice(0, 4).map((sup, idx) => {
                  let planningContext = "Quote needed for priority replenishment";
                  let nextAction = "Request quote >";
                  if (idx === 1) {
                    planningContext = "80 units remaining on partial receipt";
                    nextAction = "View supplier >";
                  } else if (idx === 2) {
                    planningContext = "Next expected delivery · 12 Oct";
                    nextAction = "View supplier >";
                  } else if (idx === 3) {
                    planningContext = "Delivery overdue · Confirm revised date";
                    nextAction = "Contact supplier >";
                  }

                  const categoryLabel = sup.location || sup.code;

                  return (
                    <tr key={sup.id} onClick={() => onOpenSupplier(sup.id)} className="cursor-pointer hover:bg-muted/30">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-foreground">{sup.name}</div>
                        <div className="text-[11px] text-muted-foreground">{categoryLabel}</div>
                      </td>
                      <td className="px-4 py-3.5 text-foreground">
                        {sup.leadTimeDays > 0 ? `${sup.leadTimeDays} days` : "Not set"}
                      </td>
                      <td className="px-4 py-3.5 text-foreground">
                        {sup.paymentTerms ?? "Net 30"}
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-foreground">
                        {formatNumber(sup.openPurchaseOrders)} {sup.openPurchaseOrders === 1 ? "order" : "orders"}
                      </td>
                      <td className="px-4 py-3.5 text-[11px]">
                        <span className={idx === 3 ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                          {planningContext}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-foreground hover:underline">
                        {nextAction}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="pt-2 text-[11px] text-muted-foreground">
        ⓘ All procurement records are illustrative, not synced or verified. Confirm stock, pricing, lead times and payment terms with suppliers before placing an order.
      </div>
    </div>
  );
}
