import { useState } from "react";
import {
  Boxes,
  ScanLine,
  Printer,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/common/StatusPill";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { useFulfillmentQueue } from "@/hooks/useOrders";
import { FulfillmentBatch } from "@/types/orders";
import { formatRelativeTime } from "@/utils/format";

export default function FulfillmentPage() {
  const { data: queueData } = useFulfillmentQueue();

  const [activeTab, setActiveTab] = useState<"waves" | "picking" | "packing">("waves");
  const [selectedBatch, setSelectedBatch] = useState<FulfillmentBatch | null>(null);

  const batches = queueData?.batches ?? [];
  const unbatched = queueData?.unbatchedOrders ?? [];

  return (
    <div className="w-full space-y-6 pb-24">
      {/* Page Header */}
      <PageHeader
        eyebrow="OPERATIONAL DISPATCH"
        title="Fulfillment Workspace"
        description="Pick, pack, manifest, and dispatch orders across warehouses with barcode scanning and batch generation."
        actions={
          <Button
            size="sm"
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => alert("Generating new picking wave for 18 unassigned orders...")}
          >
            <Boxes className="h-4 w-4" /> Create Picking Wave Batch
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2 text-xs">
        <button
          onClick={() => setActiveTab("waves")}
          className={`rounded-lg px-3.5 py-1.5 font-medium transition-colors ${
            activeTab === "waves"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Picking Waves & Batches ({batches.length})
        </button>
        <button
          onClick={() => setActiveTab("picking")}
          className={`rounded-lg px-3.5 py-1.5 font-medium transition-colors ${
            activeTab === "picking"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Orders Awaiting Wave Batching ({unbatched.length})
        </button>
      </div>

      {/* Picking Batches Grid (Screen 29) */}
      {activeTab === "waves" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {batches.map((batch) => (
            <div
              key={batch.id}
              className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-foreground">
                      {batch.batchNumber}
                    </h3>
                    <StatusPill status={batch.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Carrier: <span className="font-semibold text-foreground">{batch.carrier}</span> · Created {formatRelativeTime(batch.createdAt)}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold bg-muted px-2.5 py-1 rounded-lg">
                  {batch.orderCount} Orders
                </span>
              </div>

              {/* Progress and Picking status */}
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span>Wave Progress:</span>
                  <span className="font-mono font-bold text-primary">
                    {batch.status === "picking" ? "12 of 18 items picked (67%)" : "18 of 18 items packed"}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: batch.status === "picking" ? "67%" : "100%" }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => alert(`Printing picklist for ${batch.batchNumber}`)}
                >
                  <Printer className="h-3.5 w-3.5" /> Print Picklist
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setSelectedBatch(batch)}
                >
                  Open Picking Drawer <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unbatched Orders List */}
      {activeTab === "picking" && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
              <tr>
                <th className="py-3 pl-4 pr-3">Order Number</th>
                <th className="px-3 py-3">Channel</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">SKU</th>
                <th className="py-3 pl-3 pr-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {unbatched.map((ord) => (
                <tr key={ord.id} className="hover:bg-muted/20">
                  <td className="py-3 pl-4 pr-3 font-mono font-semibold">
                    {ord.orderNumber}
                  </td>
                  <td className="px-3 py-3 capitalize">{ord.channel}</td>
                  <td className="px-3 py-3">{ord.customer.name}</td>
                  <td className="px-3 py-3 font-mono">{ord.items[0]?.sku}</td>
                  <td className="py-3 pl-3 pr-4 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => alert(`Added ${ord.orderNumber} to active wave.`)}
                    >
                      Assign Wave
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Picking Context Drawer (Screen 29 — Picking drawer) */}
      {selectedBatch && (
        <ContextDrawer
          open={Boolean(selectedBatch)}
          onClose={() => setSelectedBatch(null)}
          title={selectedBatch.batchNumber}
          description={`Carrier: ${selectedBatch.carrier} · ${selectedBatch.orderCount} Orders`}
          footer={
            <Button
              className="w-full text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                alert(`Batch ${selectedBatch.batchNumber} manifest generated!`);
                setSelectedBatch(null);
              }}
            >
              Generate Shipping Manifest
            </Button>
          }
        >
          <div className="space-y-6 text-xs">
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <ScanLine className="h-4 w-4 text-primary" />
                Barcode Wave Scanner
              </div>
              <p className="text-muted-foreground">
                Scan product SKU or storage bin location barcode to verify item picks.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                Items in Wave Batch
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="font-mono font-bold text-foreground">TRV-1042</p>
                    <p className="text-muted-foreground text-[11px]">Bin: A-04-02 · Qty: 4</p>
                  </div>
                  <span className="text-emerald-600 font-semibold text-xs">✓ Picked</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="font-mono font-bold text-foreground">OS-2048</p>
                    <p className="text-muted-foreground text-[11px]">Bin: B-12-01 · Qty: 6</p>
                  </div>
                  <span className="text-emerald-600 font-semibold text-xs">✓ Picked</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-amber-50/40 border-amber-200">
                  <div>
                    <p className="font-mono font-bold text-amber-950">NL-001</p>
                    <p className="text-amber-800 text-[11px]">Bin: C-01-08 · Qty: 8</p>
                  </div>
                  <span className="text-amber-700 font-semibold text-xs">In Progress</span>
                </div>
              </div>
            </div>
          </div>
        </ContextDrawer>
      )}
    </div>
  );
}
