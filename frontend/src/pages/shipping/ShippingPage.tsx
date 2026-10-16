import {
  Truck,
  AlertTriangle,
  Printer,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/common/StatusPill";
import { useOrders } from "@/hooks/useOrders";

export default function ShippingPage() {
  const { data: ordersData } = useOrders();
  const orders = ordersData?.data ?? [];

  const dispatched = orders.filter((o) => o.shippingCarrier);

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow="CARRIER LOGISTICS"
        title="Shipping Workspace"
        description="Courier allocation rules, automated AWB generation, manifest dispatch, and transit telemetry across Delhivery, Blue Dart, and Amazon ATS."
        actions={
          <Button
            size="sm"
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => alert("Printing aggregated daily carrier manifests...")}
          >
            <Printer className="h-4 w-4" /> Print Daily Manifests
          </Button>
        }
      />

      {/* Carrier Performance Ribbon (Screen 34) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Delhivery Surface & Express
            </span>
            <Truck className="h-4 w-4 text-[#1D4ED8]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-foreground">
              34 AWBs
            </span>
            <span className="text-xs text-emerald-600 font-semibold">
              98.2% On-Time SLA
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Blue Dart Apex Express
            </span>
            <Truck className="h-4 w-4 text-purple-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-foreground">
              18 AWBs
            </span>
            <span className="text-xs text-emerald-600 font-semibold">
              99.5% Premium COD
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              In-Transit Exceptions
            </span>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-amber-600">
              2 Shipments
            </span>
            <span className="text-xs text-muted-foreground">
              RTO / Address re-attempt
            </span>
          </div>
        </div>
      </div>

      {/* Dispatched Shipments Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
            <tr>
              <th className="py-3 pl-4 pr-3">AWB / Order</th>
              <th className="px-3 py-3">Carrier</th>
              <th className="px-3 py-3">Destination Pincode</th>
              <th className="px-3 py-3">Customer</th>
              <th className="px-3 py-3">Payment</th>
              <th className="px-3 py-3">Status</th>
              <th className="py-3 pl-3 pr-4 text-right">Label</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dispatched.map((ord) => (
              <tr key={ord.id} className="hover:bg-muted/20">
                <td className="py-3 pl-4 pr-3">
                  <p className="font-mono font-bold text-foreground">
                    {ord.awbNumber ?? "AWB-IN-PENDING"}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {ord.orderNumber}
                  </p>
                </td>
                <td className="px-3 py-3 font-medium text-foreground">
                  {ord.shippingCarrier}
                </td>
                <td className="px-3 py-3">
                  <p className="font-mono font-semibold">{ord.customer.pincode}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {ord.customer.city}, {ord.customer.state}
                  </p>
                </td>
                <td className="px-3 py-3">{ord.customer.name}</td>
                <td className="px-3 py-3 font-mono font-semibold uppercase">
                  {ord.paymentMethod}
                </td>
                <td className="px-3 py-3">
                  <StatusPill status={ord.status} />
                </td>
                <td className="py-3 pl-3 pr-4 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => alert(`Downloading shipping label for ${ord.awbNumber}`)}
                  >
                    Print Label
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
