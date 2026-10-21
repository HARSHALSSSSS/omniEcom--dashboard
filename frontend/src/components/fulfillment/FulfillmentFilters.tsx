import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EXCEPTION_STATUSES, PRIORITIES, type CarrierOption, type ExceptionStatus, type Priority, type WarehouseOption } from "@/types/fulfillment";
import { EXCEPTION_STATUS_LABELS, PRIORITY_LABELS, type FulfillmentUrlState } from "./fulfillmentParams";

const SELECT = "h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground disabled:opacity-50";

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

/** search and the filter selects; every change goes to the URL */
export function FulfillmentFilters({ state, warehouses, carriers, filtered, onSearch, onWarehouse, onCarrier, onPriority, onException, onExceptionStatus, onClear }: FulfillmentFiltersProps) {
  const { q } = state;
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);

  const exceptions = state.tab === "exceptions";
  // a carrier from a deep link that is not among the configured ones still shows (and can be cleared)
  const carrierOptions = carriers && state.carrier && !carriers.some((c) => c.providerCode === state.carrier) ? [...carriers, { providerCode: state.carrier, name: state.carrier }] : carriers;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-sm flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label={exceptions ? "Search exceptions" : "Search fulfillment queue"}
          placeholder="Search order or fulfillment #..."
          value={text}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
          className="pl-9 text-xs"
        />
      </div>

      <select aria-label="Warehouse" className={SELECT} value={state.warehouse ?? ""} onChange={(e) => onWarehouse(e.target.value || null)}>
        <option value="">All warehouses</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>

      {exceptions ? (
        <select aria-label="Exception status" className={SELECT} value={state.exceptionStatus} onChange={(e) => onExceptionStatus(e.target.value as ExceptionStatus)}>
          {EXCEPTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {EXCEPTION_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      ) : (
        <>
          {carrierOptions && (
            <select aria-label="Carrier" className={SELECT} value={state.carrier ?? ""} onChange={(e) => onCarrier(e.target.value || null)}>
              <option value="">All carriers</option>
              {carrierOptions.map((c) => (
                <option key={c.providerCode} value={c.providerCode}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <select aria-label="Priority" className={SELECT} value={state.priority ?? ""} onChange={(e) => onPriority((e.target.value || null) as Priority | null)}>
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
          <select aria-label="Exceptions" className={SELECT} value={state.hasException === undefined ? "" : String(state.hasException)} onChange={(e) => onException((e.target.value || null) as "true" | "false" | null)}>
            <option value="">With or without exceptions</option>
            <option value="true">Has open exceptions</option>
            <option value="false">No open exceptions</option>
          </select>
        </>
      )}

      {filtered && (
        <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
