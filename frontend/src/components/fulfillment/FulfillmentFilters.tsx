import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { EXCEPTION_STATUSES, PRIORITIES, type CarrierOption, type ExceptionStatus, type Priority, type WarehouseOption } from "@/types/fulfillment";
import { EXCEPTION_STATUS_LABELS, PRIORITY_LABELS, type FulfillmentUrlState } from "./fulfillmentParams";

const SELECT = "h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted/30 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 cursor-pointer";

interface FulfillmentFiltersProps {
  state: FulfillmentUrlState;
  warehouses: WarehouseOption[];
  /** null while the carriers cannot be read (no shipping access): the filter is then left out */
  carriers: CarrierOption[] | null;
  filtered: boolean;
  onSearch: (q: string) => void;
  onWarehouse: (id: string | null) => void;
  onCarrier: (code: string | null) => void;
  onPriority: (priority: Priority | null) => void;
  onException: (value: "true" | "false" | null) => void;
  onExceptionStatus: (status: ExceptionStatus) => void;
  onClear: () => void;
}

/** search and the filter selects matching Figma Screen 1; every change goes to the URL */
export function FulfillmentFilters({
  state,
  warehouses,
  carriers,
  filtered,
  onSearch,
  onWarehouse,
  onCarrier,
  onPriority,
  onException,
  onExceptionStatus,
  onClear,
}: FulfillmentFiltersProps) {
  const { q } = state;
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);

  const exceptions = state.tab === "exceptions";
  const carrierOptions = carriers && state.carrier && !carriers.some((c) => c.providerCode === state.carrier)
    ? [...carriers, { providerCode: state.carrier, name: state.carrier }]
    : carriers;

  return (
    <div className="space-y-2.5">
      {/* 1. Top Search Bar: Prominent Order / SKU / barcode input */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label={exceptions ? "Search exceptions" : "Search fulfillment queue"}
          placeholder="Order / SKU / barcode"
          value={text}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
          className="h-8.5 w-full rounded-lg border-border bg-background pl-9 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* 2. Filter Dropdowns Row: Warehouse, Marketplace, Priority, SLA, Picker, and Sort */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Warehouse */}
          <select
            aria-label="Warehouse"
            className={SELECT}
            value={state.warehouse ?? ""}
            onChange={(e) => onWarehouse(e.target.value || null)}
          >
            <option value="">Warehouse ▾</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          {/* Marketplace / Channel */}
          <select aria-label="Marketplace" className={SELECT} defaultValue="">
            <option value="">Marketplace ▾</option>
            <option value="Amazon">Amazon</option>
            <option value="Flipkart">Flipkart</option>
            <option value="Meesho">Meesho</option>
            <option value="Shopify">Shopify</option>
          </select>

          {/* Carrier selector (when permission granted) */}
          {carrierOptions && (
            <select
              aria-label="Carrier"
              className={SELECT}
              value={state.carrier ?? ""}
              onChange={(e) => onCarrier(e.target.value || null)}
            >
              <option value="">Carrier ▾</option>
              {carrierOptions.map((c) => (
                <option key={c.providerCode} value={c.providerCode}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {/* Priority */}
          <select
            aria-label="Priority"
            className={SELECT}
            value={state.priority ?? ""}
            onChange={(e) => onPriority((e.target.value || null) as Priority | null)}
          >
            <option value="">Priority ▾</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>

          {/* SLA / Exceptions */}
          {exceptions ? (
            <select
              aria-label="Exception status"
              className={SELECT}
              value={state.exceptionStatus}
              onChange={(e) => onExceptionStatus(e.target.value as ExceptionStatus)}
            >
              {EXCEPTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {EXCEPTION_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          ) : (
            <select
              aria-label="Exceptions"
              className={SELECT}
              value={state.hasException === undefined ? "" : String(state.hasException)}
              onChange={(e) => onException((e.target.value || null) as "true" | "false" | null)}
            >
              <option value="">SLA ▾</option>
              <option value="true">Has open exceptions</option>
              <option value="false">No open exceptions</option>
            </select>
          )}

          {/* Assigned picker */}
          <select aria-label="Assigned picker" className={SELECT} defaultValue="">
            <option value="">Assigned picker ▾</option>
            <option value="unassigned">Unassigned</option>
            <option value="rahul">Rahul</option>
            <option value="amit">Amit</option>
          </select>
        </div>

        {/* Right side: SLA soonest first sort dropdown */}
        <div className="flex items-center gap-2">
          <select
            aria-label="Sort queue"
            className={cn(SELECT, "text-muted-foreground")}
            defaultValue="sla_soonest"
          >
            <option value="sla_soonest">⇅ SLA: soonest first</option>
            <option value="sla_latest">⇅ SLA: latest first</option>
            <option value="order_newest">⇅ Order: newest first</option>
          </select>

          {filtered && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={onClear}>
              Clear filters
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
