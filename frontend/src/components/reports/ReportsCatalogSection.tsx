import { useState } from "react";
import {
  AlertCircle,
  BarChart,
  Boxes,
  Download,
  FileSpreadsheet,
  PackageCheck,
  Plus,
  Search,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export interface StandardReportItem {
  id: string;
  title: string;
  description: string;
  category: "Sales" | "Products" | "Inventory" | "Operations" | "Procurement";
  scope: string;
  format: string;
  iconName: string;
}

const DEFAULT_REPORTS: StandardReportItem[] = [
  {
    id: "sales-overview",
    title: "Sales overview",
    description: "Orders, net sales and average order value",
    category: "Sales",
    scope: "All channels",
    format: "CSV / PDF",
    iconName: "bar",
  },
  {
    id: "channel-perf",
    title: "Channel performance",
    description: "Revenue mix, growth and channel margins",
    category: "Sales",
    scope: "By channel",
    format: "CSV / PDF",
    iconName: "cart",
  },
  {
    id: "product-profit",
    title: "Product profitability",
    description: "SKU-level sales, cost of goods and gross profit",
    category: "Products",
    scope: "By SKU",
    format: "CSV",
    iconName: "boxes",
  },
  {
    id: "inventory-val",
    title: "Inventory valuation",
    description: "Stock on hand, unit cost and inventory value",
    category: "Inventory",
    scope: "As of 30 Sep 2026",
    format: "CSV",
    iconName: "package",
  },
  {
    id: "returns-refunds",
    title: "Returns and refunds",
    description: "Return reasons, refunded value and rate",
    category: "Operations",
    scope: "All channels",
    format: "CSV / PDF",
    iconName: "truck",
  },
  {
    id: "procurement-spend",
    title: "Procurement spend",
    description: "Purchase order value and supplier spend",
    category: "Procurement",
    scope: "By supplier",
    format: "CSV",
    iconName: "file",
  },
];

interface ReportsCatalogSectionProps {
  reports?: StandardReportItem[];
  onExportReport?: (report: StandardReportItem) => void;
  onCreateSchedule?: () => void;
}

export function ReportsCatalogSection({
  reports = DEFAULT_REPORTS,
  onExportReport,
  onCreateSchedule,
}: ReportsCatalogSectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("All reports");
  const [searchQuery, setSearchQuery] = useState("");

  const categories = [
    { label: "All reports", count: 6 },
    { label: "Sales", count: 2 },
    { label: "Products", count: 1 },
    { label: "Inventory", count: 1 },
    { label: "Operations", count: 1 },
    { label: "Procurement", count: 1 },
  ];

  const filtered = reports.filter((r) => {
    const matchesCat = selectedCategory === "All reports" || r.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const getIcon = (name: string) => {
    switch (name) {
      case "bar":
        return <BarChart className="h-4 w-4" />;
      case "cart":
        return <ShoppingCart className="h-4 w-4" />;
      case "boxes":
        return <Boxes className="h-4 w-4" />;
      case "package":
        return <PackageCheck className="h-4 w-4" />;
      case "truck":
        return <Truck className="h-4 w-4" />;
      default:
        return <FileSpreadsheet className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Available Reports Header + Filter bar */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Available reports</h3>
            <span className="text-xs text-muted-foreground">
              {reports.length} standard reports · Exports use illustrative data
            </span>
          </div>

          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Find a report..."
              aria-label="Find a report"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Filter categories */}
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((c) => {
            const active = selectedCategory === c.label;
            return (
              <button
                key={c.label}
                type="button"
                onClick={() => setSelectedCategory(c.label)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "bg-foreground font-semibold text-background"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {c.label} <span className="ml-1 opacity-70">{c.count}</span>
              </button>
            );
          })}
        </div>

        {/* Reports Table */}
        <div className="overflow-x-auto pt-1">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="pb-2.5 font-semibold">Report</th>
                <th className="pb-2.5 font-semibold">Category</th>
                <th className="pb-2.5 font-semibold">Scope</th>
                <th className="pb-2.5 font-semibold">Format</th>
                <th className="pb-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-muted/20">
                  <td className="py-3.5">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-foreground">
                        {getIcon(item.iconName)}
                      </div>
                      <div className="space-y-0.5">
                        <span className="font-semibold text-foreground">{item.title}</span>
                        <p className="text-muted-foreground text-[11px]">{item.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 text-muted-foreground">{item.category}</td>
                  <td className="py-3.5 text-muted-foreground">{item.scope}</td>
                  <td className="py-3.5 font-mono text-[11px] text-muted-foreground">{item.format}</td>
                  <td className="py-3.5 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs font-semibold"
                      onClick={() => onExportReport?.(item)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Keep Your Team Informed Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-foreground">Keep your team informed</h4>
          <p className="text-xs text-muted-foreground">
            Choose a report, recipients and cadence. No schedules are active; nothing is sent automatically.
          </p>
        </div>

        <Button size="sm" className="gap-1.5 text-xs" onClick={onCreateSchedule}>
          <Plus className="h-4 w-4" />
          Create schedule
        </Button>
      </div>

      {/* 3. Illustrative Disclaimer Footer */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground border-t border-border pt-3">
        <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
        <p className="leading-relaxed">
          All report figures are illustrative, not synced or verified. Validate source records before using exports for accounting or business decisions.
        </p>
      </div>
    </div>
  );
}
