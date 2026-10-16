import { useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/common/StatusPill";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { useReturns } from "@/hooks/useOrders";
import { ReturnOrder } from "@/types/orders";
import { formatINR } from "@/utils/format";

export default function ReturnsPage() {
  const { data: returns = [] } = useReturns();
  const [selectedReturn, setSelectedReturn] = useState<ReturnOrder | null>(null);

  return (
    <div className="w-full space-y-6 pb-24">
      {/* Page Header */}
      <PageHeader
        eyebrow="REVERSE LOGISTICS & RTO"
        title="Returns & Reverse Logistics"
        description="Inspect return deliveries, disposition damaged or sellable stock, and issue multi-channel customer refunds."
      />

      {/* Returns KPI Ribbon (Screen 35) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Return Requests
          </p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-foreground">
              {returns.length}
            </span>
            <span className="text-xs text-muted-foreground">Today</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Awaiting Warehouse Inspection
          </p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-amber-600">
              1
            </span>
            <span className="text-xs text-amber-700">QC pending</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Return Rate (30D)
          </p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-foreground">
              4.8%
            </span>
            <span className="text-xs text-emerald-600 font-semibold">
              -0.4% vs industry avg
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pending Refunds
          </p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-foreground">
              ₹5,398
            </span>
            <span className="text-xs text-muted-foreground">2 orders</span>
          </div>
        </div>
      </div>

      {/* Returns Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
            <tr>
              <th className="py-3 pl-4 pr-3">Return # / Order</th>
              <th className="px-3 py-3">Channel</th>
              <th className="px-3 py-3">Customer</th>
              <th className="px-3 py-3">Reason for Return</th>
              <th className="px-3 py-3">Refund Value</th>
              <th className="px-3 py-3">Status</th>
              <th className="py-3 pl-3 pr-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {returns.map((ret) => (
              <tr key={ret.id} className="hover:bg-muted/20">
                <td className="py-3 pl-4 pr-3">
                  <p
                    onClick={() => setSelectedReturn(ret)}
                    className="font-mono font-bold text-foreground hover:underline cursor-pointer"
                  >
                    {ret.returnNumber}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {ret.orderNumber}
                  </p>
                </td>
                <td className="px-3 py-3 capitalize font-medium text-foreground">
                  {ret.channel}
                </td>
                <td className="px-3 py-3">{ret.customerName}</td>
                <td className="px-3 py-3 max-w-[240px] truncate text-muted-foreground">
                  {ret.reason}
                </td>
                <td className="px-3 py-3 font-semibold text-foreground">
                  {formatINR(ret.refundAmount)}
                </td>
                <td className="px-3 py-3">
                  <StatusPill status={ret.status} />
                </td>
                <td className="py-3 pl-3 pr-4 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setSelectedReturn(ret)}
                  >
                    Inspect
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inspection Drawer (Screen 35 — Inspection contextual drawer) */}
      {selectedReturn && (
        <ContextDrawer
          open={Boolean(selectedReturn)}
          onClose={() => setSelectedReturn(null)}
          title={`Return ${selectedReturn.returnNumber}`}
          description={`Order: ${selectedReturn.orderNumber} · ${selectedReturn.channel.toUpperCase()}`}
          footer={
            <div className="flex w-full gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => {
                  alert("Restocked as sellable inventory!");
                  setSelectedReturn(null);
                }}
              >
                Accept as Sellable
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  alert("Approved refund & processed customer payout!");
                  setSelectedReturn(null);
                }}
              >
                Approve Refund
              </Button>
            </div>
          }
        >
          <div className="space-y-6 text-xs">
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
              <p className="text-muted-foreground">Return Customer:</p>
              <p className="font-semibold text-foreground">
                {selectedReturn.customerName}
              </p>
              <p className="text-muted-foreground pt-1">Return Rationale:</p>
              <p className="font-medium text-foreground">{selectedReturn.reason}</p>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                Returned Items
              </h4>
              {selectedReturn.items.map((it, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3 space-y-1">
                  <p className="font-semibold text-foreground">{it.title}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    SKU: {it.sku} · Qty: {it.quantity}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Refund Total:</span>
                <span className="font-mono font-bold text-foreground">
                  {formatINR(selectedReturn.refundAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Status:</span>
                <span className="capitalize font-semibold text-amber-600">
                  {selectedReturn.refundStatus}
                </span>
              </div>
            </div>
          </div>
        </ContextDrawer>
      )}
    </div>
  );
}
