import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/utils/format";
import type { LedgerRow } from "@/types/returns";
import { formatMoney } from "./returnFormat";
import { RefundStatusText, StagePill } from "./returnUi";

interface ReturnsTableProps {
  rows: LedgerRow[];
  refreshing: boolean;
  onOpen: (id: string) => void;
}

const COLUMNS = ["Return # / Order", "Channel", "Customer", "Items", "Reason for return", "Status", "Refund", "Requested"];

function Row({ row, onOpen }: { row: LedgerRow; onOpen: (id: string) => void }) {
  const extra = row.product.itemCount - 1;
  return (
    <tr className="hover:bg-muted/20">
      <td className="py-3 pl-4 pr-3">
        <button type="button" onClick={() => onOpen(row.id)} className="font-mono font-bold text-foreground hover:underline">
          {row.number}
        </button>
        <p className="font-mono text-[11px] text-muted-foreground">{row.orderNumber}</p>
      </td>
      <td className="px-3 py-3 font-medium text-foreground">{row.channel.name}</td>
      <td className="px-3 py-3">{row.customer?.name ?? <span className="text-muted-foreground">Not provided</span>}</td>
      <td className="max-w-[220px] px-3 py-3">
        <p className="truncate text-foreground">{row.product.title ?? "—"}</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {row.product.sku ?? "No SKU"}
          {extra > 0 ? ` +${extra} more` : ""} · Qty {row.quantity}
        </p>
      </td>
      <td className="max-w-[200px] truncate px-3 py-3 text-muted-foreground">{row.reason.label}</td>
      <td className="px-3 py-3">
        <StagePill stage={row.stage} label={row.stageLabel} />
      </td>
      <td className="px-3 py-3">
        <p className="font-semibold text-foreground">{row.refund.amountMinor === null ? "—" : formatMoney(row.refund.amountMinor, row.refund.currency)}</p>
        <RefundStatusText status={row.refund.status} />
      </td>
      <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{formatDate(row.requestedAt)}</td>
      <td className="py-3 pl-3 pr-4 text-right">
        <Button size="sm" variant="outline" className="h-7 text-xs" aria-label={`Open return ${row.number}`} onClick={() => onOpen(row.id)}>
          Open
        </Button>
      </td>
    </tr>
  );
}

export function ReturnsTable({ rows, refreshing, onOpen }: ReturnsTableProps) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${refreshing ? "opacity-60" : ""}`} aria-busy={refreshing}>
      <table aria-label="Returns" className="w-full min-w-[980px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            {COLUMNS.map((c, i) => (
              <th key={c} scope="col" className={i === 0 ? "py-3 pl-4 pr-3" : "px-3 py-3"}>
                {c}
              </th>
            ))}
            <th scope="col" className="py-3 pl-3 pr-4 text-right">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <Row key={row.id} row={row} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div role="status" aria-label="Loading returns" className="space-y-px overflow-hidden rounded-xl border border-border bg-card p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="my-2 h-10 w-full" />
      ))}
    </div>
  );
}
