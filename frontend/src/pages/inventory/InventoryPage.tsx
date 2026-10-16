import { useState } from "react";
import {
  RefreshCw,
  Search,
  History,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/common/StatusPill";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import {
  useInventorySummary,
  useInventoryLedger,
  useStockMovements,
  useAdjustStock,
  useSyncInventoryChannels,
} from "@/hooks/useInventory";
import { InventoryItem } from "@/types/inventory";
import { formatNumber, formatRelativeTime } from "@/utils/format";

export default function InventoryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  // Stock Adjustment State
  const [adjustModalItem, setAdjustModalItem] = useState<InventoryItem | null>(
    null,
  );
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<
    "audit_correction" | "damaged" | "shrinkage" | "manual_addition"
  >("audit_correction");

  const { data: summary } = useInventorySummary();
  const { data: ledgerData } = useInventoryLedger({
    status: activeTab === "all" ? undefined : activeTab,
    search: searchTerm,
  });
  const { data: movements = [] } = useStockMovements();

  const adjustStockMutation = useAdjustStock();
  const syncChannelsMutation = useSyncInventoryChannels();

  const inventory = ledgerData?.data ?? [];

  const handleAdjustSubmit = () => {
    if (!adjustModalItem || adjustQty === 0) return;
    adjustStockMutation.mutate(
      {
        sku: adjustModalItem.sku,
        warehouseId: "wh-delhi-01",
        quantityDelta: adjustQty,
        reason: adjustReason,
      },
      {
        onSuccess: () => {
          setAdjustModalItem(null);
          setAdjustQty(0);
        },
      },
    );
  };

  return (
    <div className="w-full space-y-6 pb-24">
      {/* Page Header with Action buttons */}
      <PageHeader
        eyebrow="COMMERCE OPERATIONS"
        title="Inventory Control Room"
        description="Unified stock visibility, real-time safety buffers, warehouse distribution, and multi-channel synchronization."
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={syncChannelsMutation.isPending}
              onClick={() => syncChannelsMutation.mutate()}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  syncChannelsMutation.isPending ? "animate-spin" : ""
                }`}
              />
              Sync All Channels
            </Button>
          </div>
        }
      />

      {/* Stock Pulse Ribbon (Screen 26) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div
          onClick={() => setActiveTab("all")}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            activeTab === "all"
              ? "border-[#1D4ED8] bg-[#E6F4FF]/30 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total Inventory Units
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">
            {formatNumber(summary?.totalUnitsAvailable ?? 14850)}
          </p>
          <span className="text-[11px] text-muted-foreground">
            Across {summary?.totalSkus ?? 427} Active SKUs
          </span>
        </div>

        <div
          onClick={() => setActiveTab("healthy")}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            activeTab === "healthy"
              ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            Healthy Stock
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-600">
            {summary?.healthySkus ?? 403}
          </p>
          <span className="text-[11px] text-emerald-700">
            &gt; 7 days coverage
          </span>
        </div>

        <div
          onClick={() => setActiveTab("low_stock")}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            activeTab === "low_stock"
              ? "border-amber-500 bg-amber-50/50 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            Low Stock Threshold
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-600">
            {summary?.lowStockSkus ?? 18}
          </p>
          <span className="text-[11px] text-amber-700">
            Reorder recommended
          </span>
        </div>

        <div
          onClick={() => setActiveTab("out_of_stock")}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            activeTab === "out_of_stock"
              ? "border-rose-500 bg-rose-50/50 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive">
            Out of Stock
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-destructive">
            {summary?.outOfStockSkus ?? 6}
          </p>
          <span className="text-[11px] text-destructive">
            Zero units available
          </span>
        </div>

        <div
          onClick={() => setActiveTab("excess")}
          className={`cursor-pointer rounded-xl border p-4 transition-all col-span-2 sm:col-span-1 ${
            activeTab === "excess"
              ? "border-blue-500 bg-blue-50/50 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1D4ED8]">
            Excess / Slow Moving
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#1D4ED8]">
            {summary?.excessStockSkus ?? 12}
          </p>
          <span className="text-[11px] text-[#1D4ED8]">&gt; 90 days cover</span>
        </div>
      </div>

      {/* Reorder Recommendation Card (from Screen 08 / Screen 26) */}
      {(summary?.lowStockSkus ?? 0) > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-950">
                18 products are approaching their critical stock thresholds
              </p>
              <p className="text-[11px] text-amber-800">
                Oasis Linen Shirt and Nomad Canvas Backpack are forecast to stock
                out within 48 hours across Amazon & Flipkart.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs bg-amber-700 hover:bg-amber-800 text-white"
            onClick={() => setActiveTab("low_stock")}
          >
            Review Low Stock Items
          </Button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by SKU, Barcode, or Product Name..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchTerm(e.target.value)
            }
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          {["all", "healthy", "low_stock", "out_of_stock", "excess"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Main Stock Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
            <tr>
              <th className="py-3 pl-4 pr-3">Product / SKU</th>
              <th className="px-3 py-3">Available</th>
              <th className="px-3 py-3">Reserved</th>
              <th className="px-3 py-3">On Hand</th>
              <th className="px-3 py-3">Days Cover</th>
              <th className="px-3 py-3">Channels Allocation</th>
              <th className="px-3 py-3">Status</th>
              <th className="py-3 pl-3 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {inventory.map((item) => (
              <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                <td className="py-3 pl-4 pr-3">
                  <div className="flex items-center gap-3">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-10 w-10 rounded-md object-cover border border-border bg-muted"
                      />
                    )}
                    <div>
                      <p
                        onClick={() => setSelectedItem(item)}
                        className="font-medium text-foreground hover:underline cursor-pointer"
                      >
                        {item.title}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {item.sku} · Barcode: {item.barcode ?? "—"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 font-mono font-bold text-sm">
                  <span
                    className={
                      item.totalAvailable === 0
                        ? "text-destructive"
                        : item.totalAvailable <= 15
                          ? "text-amber-600"
                          : "text-foreground"
                    }
                  >
                    {item.totalAvailable}
                  </span>
                </td>
                <td className="px-3 py-3 font-mono text-muted-foreground">
                  {item.totalReserved}
                </td>
                <td className="px-3 py-3 font-mono text-foreground">
                  {item.totalOnHand}
                </td>
                <td className="px-3 py-3 font-mono">
                  {item.coverageDays > 0 ? (
                    <span
                      className={
                        item.coverageDays < 4
                          ? "text-destructive font-bold"
                          : "text-foreground"
                      }
                    >
                      {item.coverageDays} days
                    </span>
                  ) : (
                    <span className="text-destructive font-bold">Depleted</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
                    <span title="Amazon">Amz: {item.channelAllocations.amazon}</span> ·
                    <span title="Flipkart">Fk: {item.channelAllocations.flipkart}</span> ·
                    <span title="Meesho">Msh: {item.channelAllocations.meesho}</span> ·
                    <span title="Buffer">Buf: {item.channelAllocations.buffer}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <StatusPill status={item.healthStatus} />
                </td>
                <td className="py-3 pl-3 pr-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setAdjustModalItem(item)}
                    >
                      Adjust
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setSelectedItem(item)}
                    >
                      Drawer
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stock Movements Ledger (Screen 26) */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">
              Recent Stock Movements & Audit Trail
            </h3>
          </div>
          <span className="text-xs text-muted-foreground">
            Live synchronization stream
          </span>
        </div>

        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {movements.map((mov) => (
            <div
              key={mov.id}
              className="flex items-center justify-between p-3.5 text-xs hover:bg-muted/20"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {mov.productTitle}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    ({mov.sku})
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase font-mono">
                    {mov.type.replace("_", " ")}
                  </span>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  {mov.warehouseName}{" "}
                  {mov.referenceId && `· Ref: ${mov.referenceId}`}
                  {mov.reason && ` · Note: ${mov.reason}`}
                </p>
              </div>

              <div className="text-right">
                <span
                  className={`font-mono font-bold ${
                    mov.quantityDelta < 0
                      ? "text-destructive"
                      : "text-emerald-600"
                  }`}
                >
                  {mov.quantityDelta > 0 ? `+${mov.quantityDelta}` : mov.quantityDelta}{" "}
                  units
                </span>
                <p className="text-[11px] text-muted-foreground">
                  {formatRelativeTime(mov.timestamp)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manual Stock Adjustment Dialog Modal (Screen 26 — Adjust stock context) */}
      {adjustModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">
              Adjust Stock: {adjustModalItem.sku}
            </h3>
            <p className="text-xs text-muted-foreground">
              {adjustModalItem.title}
            </p>

            <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs flex justify-between">
              <span>Current Available:</span>
              <span className="font-mono font-bold">
                {adjustModalItem.totalAvailable} units
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Quantity Delta (e.g. +10 or -5)
              </label>
              <Input
                type="number"
                placeholder="0"
                value={adjustQty}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setAdjustQty(Number(e.target.value))
                }
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Reason for adjustment
              </label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                value={adjustReason}
                onChange={(e) =>
                  setAdjustReason(
                    e.target.value as
                      | "audit_correction"
                      | "damaged"
                      | "shrinkage"
                      | "manual_addition",
                  )
                }
              >
                <option value="audit_correction">Physical Audit Correction</option>
                <option value="damaged">Damaged in Transit / Inspection</option>
                <option value="shrinkage">Inventory Shrinkage</option>
                <option value="manual_addition">Manual Inward Stock Addition</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAdjustModalItem(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={adjustQty === 0 || adjustStockMutation.isPending}
                onClick={handleAdjustSubmit}
              >
                Apply Adjustment
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 390px Contextual Right Drawer for Item Deep Dive (Screen 26 — Black T-Shirt context) */}
      {selectedItem && (
        <ContextDrawer
          open={Boolean(selectedItem)}
          onClose={() => setSelectedItem(null)}
          title={selectedItem.title}
          description={`SKU: ${selectedItem.sku} · ${selectedItem.category}`}
          footer={
            <Button
              className="w-full text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                setAdjustModalItem(selectedItem);
                setSelectedItem(null);
              }}
            >
              Adjust Available Stock
            </Button>
          }
        >
          <div className="space-y-6 text-xs">
            {selectedItem.imageUrl && (
              <img
                src={selectedItem.imageUrl}
                alt=""
                className="h-44 w-full rounded-lg object-cover border border-border"
              />
            )}

            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Available</span>
                <span className="font-mono font-bold text-foreground">
                  {selectedItem.totalAvailable} units
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Reserved</span>
                <span className="font-mono text-foreground">
                  {selectedItem.totalReserved} units
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">On Hand Physical</span>
                <span className="font-mono text-foreground">
                  {selectedItem.totalOnHand} units
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Days of Coverage</span>
                <span className="font-mono font-bold text-foreground">
                  {selectedItem.coverageDays} days
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                Warehouse Allocation
              </h4>
              {selectedItem.warehouses.map((wh) => (
                <div
                  key={wh.warehouseId}
                  className="rounded-lg border border-border p-3 space-y-1"
                >
                  <p className="font-semibold text-foreground">
                    {wh.warehouseName}
                  </p>
                  <div className="flex justify-between text-muted-foreground text-[11px]">
                    <span>Available: {wh.available}</span>
                    <span>Reserved: {wh.reserved}</span>
                    <span>Safety Stock: {wh.safetyStock}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                Active Channel Reserves
              </h4>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded border border-border p-2">
                  <p className="text-[10px] text-muted-foreground">Amazon</p>
                  <p className="font-mono font-bold text-foreground">
                    {selectedItem.channelAllocations.amazon}
                  </p>
                </div>
                <div className="rounded border border-border p-2">
                  <p className="text-[10px] text-muted-foreground">Flipkart</p>
                  <p className="font-mono font-bold text-foreground">
                    {selectedItem.channelAllocations.flipkart}
                  </p>
                </div>
                <div className="rounded border border-border p-2">
                  <p className="text-[10px] text-muted-foreground">Meesho</p>
                  <p className="font-mono font-bold text-foreground">
                    {selectedItem.channelAllocations.meesho}
                  </p>
                </div>
                <div className="rounded border border-border p-2">
                  <p className="text-[10px] text-muted-foreground">Shopify</p>
                  <p className="font-mono font-bold text-foreground">
                    {selectedItem.channelAllocations.shopify}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ContextDrawer>
      )}
    </div>
  );
}
