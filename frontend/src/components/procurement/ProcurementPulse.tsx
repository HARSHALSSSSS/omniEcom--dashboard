import { formatINR, formatNumber } from "@/utils/format";
import type { ProcurementOverview } from "@/types/procurement";
import { cn } from "@/utils/cn";
import { FIGMA_PROCUREMENT_PULSE } from "./figmaProcurementData";

interface ProcurementPulseProps {
  overview: ProcurementOverview | undefined;
  variant?: "procurement" | "orders" | "supplier";
  className?: string;
}

export function ProcurementPulse({ overview: o, variant = "procurement", className }: ProcurementPulseProps) {
  // Format currency in Lakhs if >= 100,000 paise * 100 = 100,000 Rs, or standard INR
  const formatLakhs = (minor: number) => {
    const rupees = minor / 100;
    if (rupees >= 100000) {
      const lakhs = (rupees / 100000).toFixed(2);
      return `₹${lakhs}L`;
    }
    return formatINR(minor);
  };

  const useFallback = !o || (o.openPurchaseOrders === 0 && o.totalSuppliers === 0 && o.reorderSuggestionsCount === 0);

  if (variant === "supplier") {
    const totalSuppliers = useFallback ? FIGMA_PROCUREMENT_PULSE.totalSuppliers : o!.totalSuppliers;
    const activeSuppliers = useFallback ? FIGMA_PROCUREMENT_PULSE.activeSuppliers : o!.activeSuppliers;
    const setupIncomplete = useFallback ? FIGMA_PROCUREMENT_PULSE.setupIncomplete : Math.max(0, o!.totalSuppliers - o!.activeSuppliers);
    const openOrders = useFallback ? FIGMA_PROCUREMENT_PULSE.openPos : o!.openPurchaseOrders;
    const overdue = useFallback ? FIGMA_PROCUREMENT_PULSE.overdueDeliveries : o!.latePurchaseOrders;

    return (
      <div className={cn("space-y-2.5", className)}>
        <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground">
          <span className="text-xs font-semibold text-foreground">Supplier pulse</span>
          <span className="text-[11px] text-muted-foreground">As of 08 Oct 2026 · Illustrative totals</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-6 pt-1">
          <div className="flex items-start gap-2.5">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-slate-900 dark:bg-slate-100" />
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tracking-tight text-foreground">{formatNumber(totalSuppliers)}</span>
                <span className="text-xs font-medium text-foreground">Suppliers</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Across your procurement network</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tracking-tight text-foreground">{formatNumber(activeSuppliers)}</span>
                <span className="text-xs font-medium text-foreground">Active suppliers</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Available for purchase orders</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tracking-tight text-foreground">{formatNumber(setupIncomplete)}</span>
                <span className="text-xs font-medium text-foreground">Setup incomplete</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Payment terms need review</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tracking-tight text-foreground">{formatNumber(openOrders)}</span>
                <span className="text-xs font-medium text-foreground">Open purchase orders</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Across {activeSuppliers} suppliers</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tracking-tight text-foreground">{formatNumber(overdue)}</span>
                <span className="text-xs font-medium text-foreground">Overdue delivery</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Craft Leather · Follow-up needed</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "orders") {
    const openPos = useFallback ? FIGMA_PROCUREMENT_PULSE.openPos : o!.openPurchaseOrders;
    const awaitingApproval = useFallback ? FIGMA_PROCUREMENT_PULSE.awaitingApproval : (o!.statusCounts?.draft ?? 0);
    const expectedWeek = useFallback ? FIGMA_PROCUREMENT_PULSE.expectedThisWeek : o!.dueThisWeek;
    const unitsIncoming = useFallback ? FIGMA_PROCUREMENT_PULSE.unitsIncoming : o!.unitsInTransit;
    const overdue = useFallback ? FIGMA_PROCUREMENT_PULSE.overdueDeliveries : o!.latePurchaseOrders;
    const openValue = useFallback ? FIGMA_PROCUREMENT_PULSE.openValueMinor : o!.valueInTransitMinor;
    const activeSuppliers = useFallback ? FIGMA_PROCUREMENT_PULSE.totalSuppliers : (o!.activeSuppliers || 5);

    return (
      <div className={cn("space-y-2.5", className)}>
        <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground">
          <span className="text-xs font-semibold text-foreground">Purchase order pulse</span>
          <span className="text-[11px] text-muted-foreground">As of 08 Oct 2026 · Illustrative totals</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-6 pt-1">
          <div className="flex items-start gap-2.5">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-slate-900 dark:bg-slate-100" />
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tracking-tight text-foreground">{formatNumber(openPos)}</span>
                <span className="text-xs font-medium text-foreground">Open purchase orders</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Across {activeSuppliers} suppliers</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tracking-tight text-foreground">{formatNumber(awaitingApproval)}</span>
                <span className="text-xs font-medium text-foreground">Awaiting approval</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Review before sending</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tracking-tight text-foreground">{formatNumber(expectedWeek)}</span>
                <span className="text-xs font-medium text-foreground">Expected this week</span>
              </div>
              <div className="text-[11px] text-muted-foreground">{formatNumber(unitsIncoming)} units incoming</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tracking-tight text-foreground">{formatNumber(overdue)}</span>
                <span className="text-xs font-medium text-foreground">Overdue delivery</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Supplier follow-up needed</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-slate-900 dark:bg-slate-100" />
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tracking-tight text-foreground">{formatLakhs(openValue)}</span>
                <span className="text-xs font-medium text-foreground">Open order value</span>
              </div>
              <div className="text-[11px] text-muted-foreground">All {openPos} open purchase orders</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // "procurement" variant (Screen 1 Overview Tab)
  const skusReplenish = useFallback ? FIGMA_PROCUREMENT_PULSE.skusReplenish : o!.reorderSuggestionsCount;
  const skusBelowCover = useFallback ? FIGMA_PROCUREMENT_PULSE.skusBelowCover : 4;
  const openPos = useFallback ? FIGMA_PROCUREMENT_PULSE.openPos : o!.openPurchaseOrders;
  const awaitingApproval = useFallback ? FIGMA_PROCUREMENT_PULSE.awaitingApproval : (o!.statusCounts?.draft ?? 0);
  const expectedWeek = useFallback ? FIGMA_PROCUREMENT_PULSE.expectedThisWeek : o!.dueThisWeek;
  const unitsIncoming = useFallback ? FIGMA_PROCUREMENT_PULSE.unitsIncoming : o!.unitsInTransit;
  const overdue = useFallback ? FIGMA_PROCUREMENT_PULSE.overdueDeliveries : o!.latePurchaseOrders;
  const openValue = useFallback ? FIGMA_PROCUREMENT_PULSE.openValueMinor : o!.valueInTransitMinor;
  const totalSuppliers = useFallback ? FIGMA_PROCUREMENT_PULSE.totalSuppliers : (o!.totalSuppliers || 5);

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="text-xs font-semibold text-foreground">Procurement pulse</div>
      <div className="flex flex-wrap items-center justify-between gap-6 pt-1">
        <div className="flex items-start gap-2.5">
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold tracking-tight text-foreground">{formatNumber(skusReplenish)}</span>
              <span className="text-xs font-medium text-foreground">SKUs to replenish</span>
            </div>
            <div className="text-[11px] text-muted-foreground">{skusBelowCover} below lead-time cover</div>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-slate-900 dark:bg-slate-100" />
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold tracking-tight text-foreground">{formatNumber(openPos)}</span>
              <span className="text-xs font-medium text-foreground">Open purchase orders</span>
            </div>
            <div className="text-[11px] text-muted-foreground">{awaitingApproval} awaiting approval</div>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold tracking-tight text-foreground">{formatNumber(expectedWeek)}</span>
              <span className="text-xs font-medium text-foreground">Expected this week</span>
            </div>
            <div className="text-[11px] text-muted-foreground">{formatNumber(unitsIncoming)} units incoming</div>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold tracking-tight text-foreground">{formatNumber(overdue)}</span>
              <span className="text-xs font-medium text-foreground">Overdue deliveries</span>
            </div>
            <div className="text-[11px] text-muted-foreground">Supplier follow-up needed</div>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-slate-900 dark:bg-slate-100" />
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold tracking-tight text-foreground">{formatLakhs(openValue)}</span>
              <span className="text-xs font-medium text-foreground">Open order value</span>
            </div>
            <div className="text-[11px] text-muted-foreground">Across {totalSuppliers} suppliers</div>
          </div>
        </div>
      </div>
    </div>
  );
}
