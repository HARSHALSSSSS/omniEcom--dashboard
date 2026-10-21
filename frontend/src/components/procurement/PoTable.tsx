import { cn } from "@/utils/cn";
import { formatCurrency, formatNumber } from "@/utils/format";
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
              <th scope="col" className="px-4 py-3">PO number</th>
              <th scope="col" className="px-4 py-3">Supplier</th>
              <th scope="col" className="px-4 py-3">Deliver to</th>
              <th scope="col" className="px-4 py-3 text-right">Lines</th>
              <th scope="col" className="px-4 py-3 text-right">Units received</th>
              <th scope="col" className="px-4 py-3 text-right">Total (with GST)</th>
              <th scope="col" className="px-4 py-3">Ordered</th>
              <th scope="col" className="px-4 py-3">Expected</th>
              <th scope="col" className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((po) => (
              <tr key={po.id} data-testid={`po-row-${po.poNumber}`} onClick={() => onOpen(po.id)} className={cn("cursor-pointer transition-colors hover:bg-muted/40", activeId === po.id && "bg-muted/50")}>
                <td className="px-4 py-3.5">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(po.id); }} aria-label={`Open ${po.poNumber}`} className="font-mono font-semibold text-blue-700 hover:underline">
                    {po.poNumber}
                  </button>
                  {po.reference && <div className="text-[10px] text-muted-foreground">Ref: {po.reference}</div>}
                </td>
                <td className="px-4 py-3.5 font-medium text-foreground">{po.supplierName}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{po.warehouseName}</td>
                <td className="px-4 py-3.5 text-right text-foreground">{formatNumber(po.itemsCount)}</td>
                <td className="px-4 py-3.5 text-right text-foreground">
                  {formatNumber(po.unitsReceived)} / {formatNumber(po.unitsOrdered)}
                  {po.unitsDamaged > 0 && <div className="text-[10px] text-rose-700">{formatNumber(po.unitsDamaged)} damaged</div>}
                </td>
                <td className="px-4 py-3.5 text-right font-semibold text-foreground">{formatCurrency(po.totalMinor, po.currency)}</td>
                <td className="px-4 py-3.5 text-[11px] text-muted-foreground">{dateOrDash(po.orderDate)}</td>
                <td className="px-4 py-3.5 text-[11px] text-muted-foreground">
                  <span className="mr-1.5">{dateOrDash(po.expectedAt)}</span>
                  {po.isLate && <LateChip />}
                </td>
                <td className="px-4 py-3.5 text-center">
                  <PoStatusPill status={po.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
