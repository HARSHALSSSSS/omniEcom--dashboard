import { formatINR, formatNumber } from "@/utils/format";
import type { ProcurementOverview } from "@/types/procurement";
import { cn } from "@/utils/cn";

interface ProcurementPulseProps {
  overview: ProcurementOverview | undefined;
  variant?: "procurement" | "orders" | "supplier";
  className?: string;
}

/** ₹2.84L style for large amounts, the plain amount below a lakh */
const formatLakhs = (minor: number) => {
  const rupees = minor / 100;
  return rupees >= 100000 ? `₹${(rupees / 100000).toFixed(2)}L` : formatINR(minor);
};

const DOT = {
  ink: "bg-slate-900 dark:bg-slate-100",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
} as const;

interface TileProps {
  tone: keyof typeof DOT;
  value: string;
  label: string;
  note: string;
}

function Tile({ tone, value, label, note }: TileProps) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", DOT[tone])} />
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold tracking-tight text-foreground">{value}</span>
          <span className="text-xs font-medium text-foreground">{label}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">{note}</div>
      </div>
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** the strip of numbers above the Overview, Purchase Orders and Suppliers tabs: every figure comes from GET /procurement/overview, a dash while it loads */
export function ProcurementPulse({ overview: o, variant = "procurement", className }: ProcurementPulseProps) {
  const n = (v: number | undefined) => (v === undefined ? "—" : formatNumber(v));

  let title: string;
  let tiles: TileProps[];

  if (variant === "supplier") {
    title = "Supplier pulse";
    tiles = [
      { tone: "ink", value: n(o?.totalSuppliers), label: "Suppliers", note: "Across your procurement network" },
      { tone: "green", value: n(o?.activeSuppliers), label: "Active suppliers", note: "Available for purchase orders" },
      { tone: "amber", value: n(o?.setupIncompleteSuppliers), label: "Setup incomplete", note: "No contact email or no products listed" },
      { tone: "ink", value: n(o?.openPurchaseOrders), label: "Open purchase orders", note: o ? `Across ${plural(o.activeSuppliers, "active supplier")}` : "—" },
      { tone: "red", value: n(o?.latePurchaseOrders), label: "Overdue delivery", note: o && o.latePurchaseOrders > 0 ? "Supplier follow-up needed" : "Nothing overdue" },
    ];
  } else if (variant === "orders") {
    title = "Purchase order pulse";
    tiles = [
      { tone: "ink", value: n(o?.openPurchaseOrders), label: "Open purchase orders", note: o ? `Across ${plural(o.activeSuppliers, "active supplier")}` : "—" },
      { tone: "amber", value: n(o?.awaitingApproval), label: "Awaiting approval", note: "Drafts to review before sending" },
      { tone: "green", value: n(o?.dueThisWeek), label: "Expected this week", note: o ? `${formatNumber(o.unitsInTransit)} units incoming` : "—" },
      { tone: "red", value: n(o?.latePurchaseOrders), label: "Overdue delivery", note: o && o.latePurchaseOrders > 0 ? "Supplier follow-up needed" : "Nothing overdue" },
      { tone: "ink", value: o ? formatLakhs(o.valueInTransitMinor) : "—", label: "Open order value", note: o ? `Outstanding on ${plural(o.openPurchaseOrders, "open purchase order")}` : "—" },
    ];
  } else {
    title = "Procurement pulse";
    tiles = [
      { tone: "amber", value: n(o?.reorderSuggestionsCount), label: "SKUs to replenish", note: o ? `${formatNumber(o.belowCoverCount)} below lead-time cover` : "—" },
      { tone: "ink", value: n(o?.openPurchaseOrders), label: "Open purchase orders", note: o ? `${formatNumber(o.awaitingApproval)} awaiting approval` : "—" },
      { tone: "green", value: n(o?.dueThisWeek), label: "Expected this week", note: o ? `${formatNumber(o.unitsInTransit)} units incoming` : "—" },
      { tone: "red", value: n(o?.latePurchaseOrders), label: "Overdue deliveries", note: o && o.latePurchaseOrders > 0 ? "Supplier follow-up needed" : "Nothing overdue" },
      { tone: "ink", value: o ? formatLakhs(o.valueInTransitMinor) : "—", label: "Open order value", note: o ? `Across ${plural(o.totalSuppliers, "supplier")}` : "—" },
    ];
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground">
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-6 pt-1">
        {tiles.map((t) => (
          <Tile key={t.label} {...t} />
        ))}
      </div>
    </div>
  );
}
