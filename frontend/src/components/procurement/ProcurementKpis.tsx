import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, formatNumber } from "@/utils/format";
import type { ProcurementOverview } from "@/types/procurement";

function Tile({ label, value, note, tone }: { label: string; value: ReactNode; note: ReactNode; tone?: "warn" | "bad" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 shadow-2xs">
      <span className="text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold text-foreground">{value}</span>
      <span className={tone === "bad" ? "text-[11px] font-medium text-rose-700" : tone === "warn" ? "text-[11px] font-medium text-amber-700" : "text-[11px] text-muted-foreground"}>{note}</span>
    </div>
  );
}

interface ProcurementKpisProps {
  overview: ProcurementOverview | undefined;
  loading: boolean;
  failed: boolean;
}

/** GET /procurement/overview: every number is computed by the server from the purchase orders */
export function ProcurementKpis({ overview: o, loading, failed }: ProcurementKpisProps) {
  if (loading) {
    return (
      <div role="status" aria-label="Loading procurement summary" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
    );
  }
  if (!o) {
    return failed ? (
      <p role="alert" className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        The procurement summary could not be loaded. The lists below still work.
      </p>
    ) : null;
  }
  const lead = o.averageLeadTimeDays ?? o.configuredLeadTimeDays;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Tile
        label="Open purchase orders"
        value={formatNumber(o.openPurchaseOrders)}
        tone={o.latePurchaseOrders > 0 ? "bad" : undefined}
        note={o.latePurchaseOrders > 0 ? `${formatNumber(o.latePurchaseOrders)} late · ${formatNumber(o.dueThisWeek)} due this week` : `${formatNumber(o.dueThisWeek)} due this week`}
      />
      <Tile label="Units on the way" value={`${formatNumber(o.unitsInTransit)} units`} note={`${formatINR(o.valueInTransitMinor)} before GST · ${formatNumber(o.warehousesWithInbound)} of ${formatNumber(o.warehousesCount)} warehouses`} />
      <Tile
        label="Active suppliers"
        value={`${formatNumber(o.activeSuppliers)} of ${formatNumber(o.totalSuppliers)}`}
        note={lead === null ? "No lead time yet" : `${o.averageLeadTimeDays !== null ? "Average" : "Set"} lead time: ${lead} days`}
      />
      <Tile label="Reorder suggestions" value={formatNumber(o.reorderSuggestionsCount)} tone={o.reorderSuggestionsCount > 0 ? "warn" : undefined} note={o.reorderSuggestionsCount > 0 ? "Products running low" : "Nothing to reorder"} />
    </div>
  );
}
