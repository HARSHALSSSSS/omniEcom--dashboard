import { Skeleton } from "@/components/ui/skeleton";
import type { LedgerOrder } from "@/types/orders";
import { NO_WRITE_REASON } from "./orderFormat";
import { OrderRow } from "./OrderRow";

interface OrdersTableProps {
  orders: LedgerOrder[];
  selected: ReadonlySet<string>;
  canWrite: boolean;
  refreshing: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
}

const COLUMNS = ["Order / Channel", "Customer & Destination", "Items & SKU", "Amount", "SLA timer", "Status", "Carrier & warehouse"];

export function OrdersTable({ orders, selected, canWrite, refreshing, onToggle, onToggleAll, onOpen }: OrdersTableProps) {
  const allSelected = orders.length > 0 && orders.every((o) => selected.has(o.id));
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${refreshing ? "opacity-60" : ""}`} aria-busy={refreshing}>
      <table className="w-full min-w-[980px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            <th className="w-10 py-3 pl-4 pr-2">
              <input
                type="checkbox"
                aria-label="Select all orders on this page"
                checked={allSelected}
                disabled={!canWrite}
                title={canWrite ? undefined : NO_WRITE_REASON}
                onChange={onToggleAll}
                className="h-4 w-4 cursor-pointer accent-[#1D4ED8] disabled:cursor-not-allowed"
              />
            </th>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" className="px-3 py-3">
                {c}
              </th>
            ))}
            <th scope="col" className="py-3 pl-3 pr-4 text-right">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} selected={selected.has(order.id)} canWrite={canWrite} onToggle={onToggle} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div role="status" aria-label="Loading orders" className="space-y-px overflow-hidden rounded-xl border border-border bg-card p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="my-2 h-10 w-full" />
      ))}
    </div>
  );
}
