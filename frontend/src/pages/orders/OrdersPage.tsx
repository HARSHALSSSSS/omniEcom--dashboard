import { useState } from "react";
import {
  Search,
  Clock,
  MapPin,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/common/StatusPill";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { useOrders, useOrdersSummary, useUpdateOrderStatus } from "@/hooks/useOrders";
import { Order, OrderStatus } from "@/types/orders";
import { SlaState } from "@/constants/enums";
import { formatINR, formatRelativeTime } from "@/utils/format";

export default function OrdersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeStatus, setActiveStatus] = useState<string>("all");
  const [activeChannel, setActiveChannel] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const { data: summary } = useOrdersSummary();
  const { data: ordersData } = useOrders({
    status: activeStatus === "all" ? undefined : activeStatus,
    channel: activeChannel === "all" ? undefined : activeChannel,
    search: searchTerm,
  });

  const updateStatusMutation = useUpdateOrderStatus();
  const orders = ordersData?.data ?? [];
  const meta = ordersData?.meta;

  const handleAdvanceStatus = (order: Order) => {
    let next: OrderStatus | null = null;
    if (order.status === OrderStatus.New) next = OrderStatus.Confirmed;
    else if (order.status === OrderStatus.Confirmed) next = OrderStatus.Picking;
    else if (order.status === OrderStatus.Picking) next = OrderStatus.Packing;
    else if (order.status === OrderStatus.Packing) next = OrderStatus.Dispatched;
    else if (order.status === OrderStatus.Dispatched) next = OrderStatus.Delivered;

    if (next) {
      updateStatusMutation.mutate({ id: order.id, nextStatus: next });
    }
  };

  return (
    <div className="w-full space-y-6 pb-24">
      {/* Page Header */}
      <PageHeader
        eyebrow="OPERATIONS & FULFILLMENT"
        title="Orders Workspace"
        description="Multi-channel order processing, SLA countdown monitors, wave picking, and automated courier dispatches."
      />

      {/* SLA & Orders Pulse Strip (Screen 28) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div
          onClick={() => setActiveStatus("all")}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            activeStatus === "all"
              ? "border-[#1D4ED8] bg-[#E6F4FF]/30 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total Orders
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-foreground">
            {meta?.total ?? 5}
          </p>
          <span className="text-[11px] text-muted-foreground">
            Today: {summary?.totalOrdersToday ?? 126}
          </span>
        </div>

        <div
          onClick={() => setActiveStatus(OrderStatus.New)}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            activeStatus === OrderStatus.New
              ? "border-blue-500 bg-blue-50/50 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1D4ED8]">
            New / Ingested
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-[#1D4ED8]">
            {meta?.new ?? 1}
          </p>
          <span className="text-[11px] text-[#1D4ED8]">Requires confirm</span>
        </div>

        <div
          onClick={() => setActiveStatus(OrderStatus.Confirmed)}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            activeStatus === OrderStatus.Confirmed
              ? "border-amber-500 bg-amber-50/50 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            Confirmed / SLA Risk
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-amber-600">
            {meta?.confirmed ?? 1}
          </p>
          <span className="text-[11px] text-amber-700">25m deadline</span>
        </div>

        <div
          onClick={() => setActiveStatus(OrderStatus.Picking)}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            activeStatus === OrderStatus.Picking
              ? "border-purple-500 bg-purple-50/50 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-700">
            Picking Queue
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-purple-600">
            {meta?.picking ?? 1}
          </p>
          <span className="text-[11px] text-purple-700">In warehouse wave</span>
        </div>

        <div
          onClick={() => setActiveStatus(OrderStatus.Packing)}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            activeStatus === OrderStatus.Packing
              ? "border-indigo-500 bg-indigo-50/50 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
            Packing / Manifest
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-indigo-600">
            {meta?.packing ?? 1}
          </p>
          <span className="text-[11px] text-indigo-700">AWB Generated</span>
        </div>

        <div
          onClick={() => setActiveStatus(OrderStatus.Dispatched)}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            activeStatus === OrderStatus.Dispatched
              ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            Dispatched / In Transit
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-emerald-600">
            {meta?.dispatched ?? 1}
          </p>
          <span className="text-[11px] text-emerald-700">Carrier in custody</span>
        </div>
      </div>

      {/* Critical SLA Warning Banner */}
      {(summary?.slaAtRiskCount ?? 0) > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-600 text-white">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-rose-950">
                SLA Pressure Alert: 1 order is within 30 minutes of dispatch breach
              </p>
              <p className="text-[11px] text-rose-800">
                ORD-IN-90804 (Flipkart) must be handed over to Blue Dart by 15:55 IST to prevent marketplace late dispatch penalty.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs bg-rose-700 hover:bg-rose-800 text-white"
            onClick={() => setActiveStatus(OrderStatus.Confirmed)}
          >
            Prioritize Order
          </Button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search order #, customer, SKU, or tracking..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchTerm(e.target.value)
            }
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          {["all", "amazon", "flipkart", "meesho", "shopify"].map((ch) => (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                activeChannel === ch
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {ch === "all" ? "All Channels" : ch}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
            <tr>
              <th className="py-3 pl-4 pr-3">Order / Channel</th>
              <th className="px-3 py-3">Customer & Destination</th>
              <th className="px-3 py-3">Items & SKU</th>
              <th className="px-3 py-3">Amount</th>
              <th className="px-3 py-3">SLA Timer</th>
              <th className="px-3 py-3">Status</th>
              <th className="py-3 pl-3 pr-4 text-right">Fulfillment Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((order) => {
              const isAtRisk = order.slaState === SlaState.AtRisk;
              return (
                <tr
                  key={order.id}
                  className={`hover:bg-muted/20 transition-colors ${
                    isAtRisk ? "bg-rose-50/20" : ""
                  }`}
                >
                  <td className="py-3 pl-4 pr-3">
                    <p
                      onClick={() => setSelectedOrder(order)}
                      className="font-mono font-semibold text-foreground hover:underline cursor-pointer"
                    >
                      {order.orderNumber}
                    </p>
                    <p className="text-[11px] text-muted-foreground capitalize">
                      {order.channel} · {formatRelativeTime(order.orderedAt)}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-foreground">
                      {order.customer.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {order.customer.city}, {order.customer.state} ({order.customer.pincode})
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="space-y-0.5">
                      {order.items.map((it) => (
                        <p key={it.id} className="text-[11px] text-foreground">
                          <span className="font-mono font-semibold">{it.sku}</span> × {it.quantity}
                        </p>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-semibold text-foreground">
                    {formatINR(order.totalAmount)}
                    <span className="ml-1 text-[10px] uppercase font-mono text-muted-foreground">
                      ({order.paymentMethod})
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                      {order.slaState === SlaState.AtRisk ? (
                        <span className="rounded bg-rose-100 text-destructive px-1.5 py-0.5">
                          25m left
                        </span>
                      ) : order.slaState === SlaState.Approaching ? (
                        <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">
                          1h 30m
                        </span>
                      ) : (
                        <span className="text-emerald-600">On Track</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={order.status} />
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setSelectedOrder(order)}
                      >
                        Drawer
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => handleAdvanceStatus(order)}
                      >
                        {order.status === OrderStatus.New
                          ? "Confirm"
                          : order.status === OrderStatus.Confirmed
                            ? "Start Picking"
                            : order.status === OrderStatus.Picking
                              ? "Pack Item"
                              : order.status === OrderStatus.Packing
                                ? "Dispatch Courier"
                                : "View"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 390px Contextual Slide-Over Drawer (Screen 28 — Order context drawer) */}
      {selectedOrder && (
        <ContextDrawer
          open={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          title={`Order ${selectedOrder.orderNumber}`}
          description={`${selectedOrder.channel.toUpperCase()} · ${formatINR(selectedOrder.totalAmount)}`}
          footer={
            <Button
              className="w-full text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                handleAdvanceStatus(selectedOrder);
                setSelectedOrder(null);
              }}
            >
              Advance Order State
            </Button>
          }
        >
          <div className="space-y-6 text-xs">
            {/* Customer & Shipping Address */}
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                Shipping Details
              </div>
              <p className="font-semibold text-foreground">
                {selectedOrder.customer.name}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {selectedOrder.customer.addressLine}, {selectedOrder.customer.city},{" "}
                {selectedOrder.customer.state} - {selectedOrder.customer.pincode}
              </p>
              <p className="text-muted-foreground">
                Phone: {selectedOrder.customer.phone}
              </p>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                Order Items ({selectedOrder.items.length})
              </h4>
              {selectedOrder.items.map((it) => (
                <div key={it.id} className="flex gap-3 rounded-lg border border-border p-3">
                  {it.imageUrl && (
                    <img
                      src={it.imageUrl}
                      alt=""
                      className="h-12 w-12 rounded object-cover border border-border"
                    />
                  )}
                  <div className="space-y-0.5 flex-1">
                    <p className="font-semibold text-foreground line-clamp-1">
                      {it.title}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      SKU: {it.sku} · Qty: {it.quantity}
                    </p>
                    <p className="font-semibold text-foreground">
                      {formatINR(it.unitPrice)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Carrier & Tracking */}
            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="text-muted-foreground">Fulfillment Node:</p>
              <p className="font-semibold text-foreground">
                {selectedOrder.warehouseName}
              </p>
              {selectedOrder.shippingCarrier && (
                <div className="pt-2 border-t border-border flex justify-between">
                  <span className="text-muted-foreground">Carrier:</span>
                  <span className="font-semibold text-foreground">
                    {selectedOrder.shippingCarrier}
                  </span>
                </div>
              )}
              {selectedOrder.awbNumber && (
                <div className="flex justify-between font-mono">
                  <span className="text-muted-foreground">AWB:</span>
                  <span className="font-bold text-foreground">
                    {selectedOrder.awbNumber}
                  </span>
                </div>
              )}
            </div>

            {/* Order Timeline */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                Order Timeline
              </h4>
              <div className="space-y-3 border-l border-border pl-3">
                {selectedOrder.timeline.map((event, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <p className="font-semibold text-foreground capitalize">
                      {event.status}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      {event.description}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {formatRelativeTime(event.timestamp)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ContextDrawer>
      )}
    </div>
  );
}
