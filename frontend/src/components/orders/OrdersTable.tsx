import { Skeleton } from "@/components/ui/skeleton";
import type { LedgerOrder } from "@/types/orders";
import { NO_WRITE_REASON } from "./orderFormat";
import { ORDER_GRID, OrderRow } from "./OrderRow";

interface OrdersTableProps {
  orders: LedgerOrder[];
  selected: ReadonlySet<string>;
  canWrite: boolean;
  refreshing: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
}

const COLUMNS = ["Order", "Marketplace", "Customer", "Items", "Value", "Payment", "Fulfillment", "SLA", "Status", "Created"];

export function OrdersTable({ orders, selected, canWrite, refreshing, onToggle, onToggleAll, onOpen }: OrdersTableProps) {
  const allSelected = orders.length > 0 && orders.every((o) => selected.has(o.id));
  return (
    <div className="w-full overflow-x-auto">
      <div
        role="table"
        aria-label="Orders"
        aria-busy={refreshing}
        className={`box-border w-full min-w-[1040px] flex flex-col items-start border-t border-[#EAEAEA] mt-1 transition-opacity ${refreshing ? "opacity-60" : ""}`}
      >
        <div role="row" className={`w-full ${ORDER_GRID} items-center h-[32px] bg-[#F5F5F5] text-[11px] font-medium leading-[14px] text-[#666666] px-1`}>
          <div role="columnheader" className="flex items-center justify-center">
            <input
              type="checkbox"
              aria-label="Select all orders on this page"
              checked={allSelected}
              disabled={!canWrite}
              title={canWrite ? undefined : NO_WRITE_REASON}
              onChange={onToggleAll}
              className="w-3.5 h-3.5 rounded-[2px] border border-[#BDBDBD] text-black focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
            />
          </div>
          {COLUMNS.map((c) => (
            <div key={c} role="columnheader" className="px-2">
              <span>{c}</span>
            </div>
          ))}
          <div role="columnheader" className="px-2 text-center">
            <span>Action</span>
          </div>
        </div>

        {orders.map((order) => (
          <OrderRow key={order.id} order={order} selected={selected.has(order.id)} canWrite={canWrite} onToggle={onToggle} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div role="status" aria-label="Loading orders" className="w-full space-y-px overflow-hidden border-t border-[#EAEAEA] p-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="my-2 h-10 w-full" />
      ))}
    </div>
  );
}
