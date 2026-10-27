import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/utils/cn";

export interface PerformanceProductRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  netSales: string;
  unitsSold: number;
  grossProfit: string;
  grossMargin: string;
  stockCoverDays: number;
  onHandUnits: number;
  signalLabel: string;
  signalTone: "red" | "amber" | "yellow" | "green" | "blue";
  isPrioritized: boolean;
  isTopSeller: boolean;
}

const DEFAULT_ROWS: PerformanceProductRow[] = [
  {
    id: "prod-1",
    sku: "NL-THR-002",
    name: "Cotton throw",
    category: "Textiles",
    netSales: "₹4,50,000",
    unitsSold: 300,
    grossProfit: "₹1,53,000",
    grossMargin: "34.0%",
    stockCoverDays: 5,
    onHandUnits: 50,
    signalLabel: "P1 · Stock risk",
    signalTone: "red",
    isPrioritized: true,
    isTopSeller: false,
  },
  {
    id: "prod-2",
    sku: "NL-DIN-004",
    name: "Stoneware dinner set",
    category: "Dining",
    netSales: "₹3,00,000",
    unitsSold: 200,
    grossProfit: "₹84,000",
    grossMargin: "28.0%",
    stockCoverDays: 24,
    onHandUnits: 160,
    signalLabel: "P2 · Margin gap",
    signalTone: "amber",
    isPrioritized: true,
    isTopSeller: false,
  },
  {
    id: "prod-3",
    sku: "NL-CUS-005",
    name: "Linen cushion",
    category: "Textiles",
    netSales: "₹2,50,000",
    unitsSold: 250,
    grossProfit: "₹75,000",
    grossMargin: "30.0%",
    stockCoverDays: 72,
    onHandUnits: 600,
    signalLabel: "P3 · Slow mover",
    signalTone: "yellow",
    isPrioritized: true,
    isTopSeller: false,
  },
  {
    id: "prod-4",
    sku: "NL-LMP-001",
    name: "Arc table lamp",
    category: "Lighting",
    netSales: "₹6,00,000",
    unitsSold: 300,
    grossProfit: "₹2,16,000",
    grossMargin: "36.0%",
    stockCoverDays: 18,
    onHandUnits: 180,
    signalLabel: "Top seller",
    signalTone: "green",
    isPrioritized: false,
    isTopSeller: true,
  },
  {
    id: "prod-5",
    sku: "NL-VAS-003",
    name: "Ceramic vase",
    category: "Decor",
    netSales: "₹3,50,000",
    unitsSold: 350,
    grossProfit: "₹1,12,000",
    grossMargin: "32.0%",
    stockCoverDays: 36,
    onHandUnits: 420,
    signalLabel: "At avg. margin",
    signalTone: "blue",
    isPrioritized: false,
    isTopSeller: false,
  },
  {
    id: "prod-6",
    sku: "NL-ORG-006",
    name: "Bamboo organizer",
    category: "Storage",
    netSales: "₹1,50,000",
    unitsSold: 100,
    grossProfit: "₹32,000",
    grossMargin: "21.3%",
    stockCoverDays: 30,
    onHandUnits: 100,
    signalLabel: "Monitor margin",
    signalTone: "blue",
    isPrioritized: false,
    isTopSeller: false,
  },
];

const SIGNAL_CLASSES = {
  red: "border-red-200 bg-red-50 text-red-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-800",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
};

interface ProductPerformanceTableProps {
  rows?: PerformanceProductRow[];
  onInspectProduct?: (sku: string, title: string) => void;
}

export function ProductPerformanceTable({
  rows = DEFAULT_ROWS,
  onInspectProduct,
}: ProductPerformanceTableProps) {
  const [filterMode, setFilterMode] = useState<"all" | "prioritized" | "top">("all");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("priority");

  const filtered = rows.filter((r) => {
    if (filterMode === "prioritized" && !r.isPrioritized) return false;
    if (filterMode === "top" && !r.isTopSeller) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <h3 className="text-sm font-bold text-foreground">Product performance</h3>
        <span className="text-xs text-muted-foreground">
          {rows.length} products · All channels · Illustrative examples
        </span>
      </div>

      {/* Filter Chips & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              filterMode === "all"
                ? "bg-foreground font-semibold text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
          >
            All products <span className="ml-1 opacity-70">6</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("prioritized")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              filterMode === "prioritized"
                ? "bg-foreground font-semibold text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
          >
            Prioritized <span className="ml-1 opacity-70">3</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("top")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              filterMode === "top"
                ? "bg-foreground font-semibold text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
          >
            Top sellers
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Search box with aria-label="Search products" */}
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Find a product or SKU..."
              aria-label="Search products"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground"
            />
          </div>

          {/* Sort dropdown */}
          <select
            aria-label="Sort product performance"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground"
          >
            <option value="priority">Sort: review priority</option>
            <option value="sales">Sort: net sales</option>
            <option value="margin">Sort: gross margin</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="pb-2.5 font-semibold">Product / SKU</th>
              <th className="pb-2.5 font-semibold">Net sales</th>
              <th className="pb-2.5 font-semibold">Units sold</th>
              <th className="pb-2.5 font-semibold">Gross profit</th>
              <th className="pb-2.5 font-semibold">Gross margin</th>
              <th className="pb-2.5 font-semibold">Stock cover</th>
              <th className="pb-2.5 font-semibold">Signal</th>
              <th className="pb-2.5 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((row) => (
              <tr key={row.id} className="hover:bg-muted/20">
                <td className="py-3.5">
                  <span className="font-semibold text-foreground">{row.name}</span>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {row.sku} · {row.category}
                  </p>
                </td>
                <td className="py-3.5 font-mono font-medium text-foreground">{row.netSales}</td>
                <td className="py-3.5 font-mono text-muted-foreground">{row.unitsSold}</td>
                <td className="py-3.5 font-mono text-muted-foreground">{row.grossProfit}</td>
                <td className="py-3.5 font-mono font-medium text-foreground">{row.grossMargin}</td>
                <td className="py-3.5">
                  <span className="font-mono font-semibold text-foreground">{row.stockCoverDays} days</span>
                  <p className="text-[11px] text-muted-foreground">{row.onHandUnits} on hand</p>
                </td>
                <td className="py-3.5">
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
                      SIGNAL_CLASSES[row.signalTone]
                    )}
                  >
                    {row.signalLabel}
                  </span>
                </td>
                <td className="py-3.5 text-right">
                  <button
                    type="button"
                    onClick={() => onInspectProduct?.(row.sku, row.name)}
                    className="inline-flex items-center gap-1 font-semibold text-foreground hover:underline"
                  >
                    Inspect product →
                  </button>
                </td>
              </tr>
            ))}

            {/* Summary Row */}
            <tr className="bg-muted/10 font-bold text-foreground border-t-2 border-border">
              <td className="py-3.5">All products</td>
              <td className="py-3.5 font-mono">₹21,00,000</td>
              <td className="py-3.5 font-mono">1,500</td>
              <td className="py-3.5 font-mono">₹6,72,000</td>
              <td className="py-3.5 font-mono">32.0%</td>
              <td className="py-3.5 font-mono">—</td>
              <td className="py-3.5 text-muted-foreground">3 prioritized</td>
              <td className="py-3.5 text-right font-normal text-muted-foreground">6 products</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Subtext footer */}
      <div className="flex flex-wrap items-center justify-between border-t border-border pt-3 text-[11px] text-muted-foreground">
        <span>Units are items sold, not orders · Net sales exclude tax and shipping · Margins rounded to 1 decimal</span>
        <span>Showing 6 of 6 products</span>
      </div>
    </div>
  );
}
