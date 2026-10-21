import { useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { ORDER_STATUSES, PAYMENT_FILTERS, type MarketplaceRef, type OrderFilters as Filters, type OrderSort, type OrderStatus, type PaymentFilter, type SlaState } from "@/types/orders";
import { PAYMENT_LABELS, SLA_FILTER_OPTIONS, SLA_LABELS, SORT_OPTIONS } from "./orderParams";

const STATUS_NAME: Record<OrderStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  picking: "Picking",
  packed: "Packed",
  ready_to_dispatch: "Ready to dispatch",
  dispatched: "Dispatched",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

const SELECT = "h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground disabled:opacity-50";

interface OrderFiltersProps {
  filters: Filters;
  sort: OrderSort;
  channels: MarketplaceRef[];
  filtered: boolean;
  exporting: boolean;
  onSearch: (q: string) => void;
  onChannel: (code: string | null) => void;
  onStatus: (statuses: OrderStatus[]) => void;
  onSla: (states: SlaState[]) => void;
  onPayment: (payment: PaymentFilter | null) => void;
  onSort: (sort: OrderSort) => void;
  onClear: () => void;
  onExport: () => void;
}

/** search, marketplace chips and the filter selects; every change goes to the URL */
export function OrderFilters({ filters, sort, channels, filtered, exporting, onSearch, onChannel, onStatus, onSla, onPayment, onSort, onClear, onExport }: OrderFiltersProps) {
  const q = filters.q ?? "";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);

  const selected = filters.marketplace ?? [];
  // a code from a deep link that is not among the connected channels still shows (and can be cleared)
  const chips = [...channels, ...selected.filter((c) => !channels.some((x) => x.code === c)).map((code) => ({ code, name: code }))];

  const statusValue = (filters.status ?? []).join(",");
  const statusIsCustom = (filters.status?.length ?? 0) > 1;
  const slaValue = (filters.slaState ?? []).join(",");
  const slaIsCustom = (filters.slaState?.length ?? 0) > 1 || (filters.slaState?.length === 1 && !SLA_FILTER_OPTIONS.includes(filters.slaState[0] as SlaState));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search orders"
            placeholder="Search order #, customer or SKU..."
            value={text}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div role="group" aria-label="Marketplace" className="flex flex-wrap items-center gap-2">
          {[{ code: "", name: "All channels" }, ...chips].map((c) => {
            const active = c.code === "" ? selected.length === 0 : selected.includes(c.code);
            return (
              <button
                key={c.code || "all"}
                type="button"
                aria-pressed={active}
                onClick={() => onChannel(c.code || null)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Status" className={SELECT} value={statusValue} onChange={(e) => onStatus(e.target.value ? [e.target.value as OrderStatus] : [])}>
          <option value="">Any status</option>
          {statusIsCustom && <option value={statusValue}>{(filters.status ?? []).map((s) => STATUS_NAME[s]).join(" + ")}</option>}
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_NAME[s]}
            </option>
          ))}
        </select>

        <select aria-label="Dispatch SLA" className={SELECT} value={slaValue} onChange={(e) => onSla(e.target.value ? (e.target.value.split(",") as SlaState[]) : [])}>
          <option value="">Any SLA</option>
          {slaIsCustom && <option value={slaValue}>{(filters.slaState ?? []).map((s) => SLA_LABELS[s]).join(" + ")}</option>}
          {SLA_FILTER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {SLA_LABELS[s]}
            </option>
          ))}
        </select>

        <select aria-label="Payment" className={SELECT} value={filters.payment ?? ""} onChange={(e) => onPayment((e.target.value || null) as PaymentFilter | null)}>
          <option value="">Any payment</option>
          {PAYMENT_FILTERS.map((p) => (
            <option key={p} value={p}>
              {PAYMENT_LABELS[p]}
            </option>
          ))}
        </select>

        <select aria-label="Sort orders" className={SELECT} value={sort} onChange={(e) => onSort(e.target.value as OrderSort)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>

        {filtered && (
          <button type="button" onClick={onClear} className="h-9 rounded-lg px-2.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Clear filters
          </button>
        )}

        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>
    </div>
  );
}
