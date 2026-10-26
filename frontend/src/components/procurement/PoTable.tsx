import { MoreHorizontal } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatCurrency, formatNumber } from "@/utils/format";
import { Button } from "@/components/ui/button";
import type { PurchaseOrderSummary } from "@/types/procurement";
import { dateOrDash } from "./procurementFormat";
import { LateChip, PoStatusPill } from "./procurementUi";

interface PoTableProps {
  rows: PurchaseOrderSummary[];
  refreshing: boolean;
  activeId: string | undefined;
  onOpen: (id: string) => void;
}

export function PoTable({ rows, refreshing, activeId, onOpen }: PoTableProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-2xs transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground">
              <th scope="col" className="w-10 px-4 py-3">
                <input type="checkbox" aria-label="Select all purchase orders" className="rounded border-border text-foreground focus:ring-1" />
              </th>
              <th scope="col" className="px-4 py-3">Purchase order</th>
              <th scope="col" className="px-4 py-3">Supplier</th>
              <th scope="col" className="px-4 py-3 text-right">Quantity</th>
              <th scope="col" className="px-4 py-3 text-right">Value</th>
              <th scope="col" className="px-4 py-3">Expected delivery</th>
              <th scope="col" className="px-4 py-3 text-center">Status</th>
              <th scope="col" className="px-4 py-3 text-right">Next action</th>
              <th scope="col" className="w-10 px-3 py-3 text-center">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((po) => {
              let nextAction = "View order >";
              if (po.status === "draft") nextAction = "Review & approve >";
              else if (po.isLate) nextAction = "Follow up >";
              else if (po.status === "partially_received") nextAction = "Record receipt >";

              return (
                <tr
                  key={po.id}
                  data-testid={`po-row-${po.poNumber}`}
                  onClick={() => onOpen(po.id)}
                  className={cn("cursor-pointer transition-colors hover:bg-muted/40", activeId === po.id && "bg-muted/50")}
                >
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select ${po.poNumber}`} className="rounded border-border text-foreground focus:ring-1" />
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(po.id);
                      }}
                      aria-label={`Open ${po.poNumber}`}
                      className="font-mono font-semibold text-foreground hover:underline"
                    >
                      {po.poNumber}
                    </button>
                    <div className="text-[11px] text-muted-foreground">
                      Created {dateOrDash(po.orderDate)}
                      {po.reference && <span className="ml-1">· Ref: {po.reference}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-foreground">{po.supplierName}</div>
                    <div className="text-[11px] text-muted-foreground">{po.itemsCount} SKUs</div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium text-foreground">
                    <div>{formatNumber(po.unitsOrdered)} units</div>
                    <div className="text-[10px] text-muted-foreground">
                      <span>{formatNumber(po.unitsReceived)} / {formatNumber(po.unitsOrdered)}</span>
                      {po.unitsDamaged > 0 && (
                        <>
                          <span className="mx-1">·</span>
                          <span className="text-rose-600 dark:text-rose-400">{formatNumber(po.unitsDamaged)} damaged</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-foreground">
                    {formatCurrency(po.totalMinor, po.currency)}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className={cn("text-xs", po.isLate ? "font-semibold text-rose-600 dark:text-rose-400" : "text-foreground")}>
                      {dateOrDash(po.expectedAt)}
                      {po.isLate && <span className="ml-1.5"><LateChip /></span>}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <PoStatusPill status={po.status} isLate={po.isLate} />
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium text-foreground hover:underline">
                    {nextAction}
                  </td>
                  <td className="px-3 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${po.poNumber}`} onClick={() => onOpen(po.id)}>
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
