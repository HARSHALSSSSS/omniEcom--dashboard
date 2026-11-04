import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import {
  EXCEPTION_STATUSES,
  PRIORITIES,
  type CarrierOption,
  type ExceptionStatus,
  type Priority,
  type WarehouseOption,
} from "@/types/fulfillment";
import {
  EXCEPTION_STATUS_LABELS,
  PRIORITY_LABELS,
  type FulfillmentUrlState,
} from "./fulfillmentParams";

export type QueueSort = "sla_soonest" | "sla_latest" | "order_newest";

export interface FulfillmentFiltersProps {
  state: FulfillmentUrlState;
  warehouses: WarehouseOption[];
  /** null while the carriers cannot be read (no shipping access): the filter is then left out */
  carriers: CarrierOption[] | null;
  filtered: boolean;
  sort?: QueueSort;
  onSort?: (sort: QueueSort) => void;
  onSearch: (q: string) => void;
  onWarehouse: (id: string | null) => void;
  onCarrier: (code: string | null) => void;
  onPriority: (priority: Priority | null) => void;
  onException: (value: "true" | "false" | null) => void;
  onExceptionStatus: (status: ExceptionStatus) => void;
  onClear: () => void;
}

interface DropdownOption {
  value: string;
  label: string;
}

interface FulfillmentFilterDropdownProps {
  id: string;
  label: string;
  ariaLabel: string;
  value: string;
  options: ReadonlyArray<DropdownOption>;
  allLabel?: string;
  showAllOption?: boolean;
  valueText?: string;
  onChange: (value: string | null) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  align?: "left" | "right";
}

function FulfillmentFilterDropdown({
  id,
  label,
  ariaLabel,
  value,
  options,
  allLabel,
  showAllOption = true,
  valueText,
  onChange,
  isOpen,
  onToggle,
  onClose,
  align = "left",
}: FulfillmentFilterDropdownProps) {
  const active = Boolean(value);
  const selectedOption = options.find((o) => o.value === value);
  const resolvedValueText = valueText ?? selectedOption?.label;

  let buttonText = label;
  if (label === "Sort") {
    buttonText = resolvedValueText ? `Sort: ${resolvedValueText}` : "Sort";
  } else if (active && resolvedValueText) {
    buttonText = `${label}: ${resolvedValueText}`;
  }

  return (
    <div className="relative inline-block shrink-0">
      {/* Visual Button matching other screens' dropdown styling */}
      <button
        type="button"
        id={`filter-${id}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={onToggle}
        className={cn(
          "box-border flex flex-row items-center justify-between gap-1.5 h-8 sm:h-[32px] px-2.5 bg-white dark:bg-card border rounded-lg text-xs transition-colors cursor-pointer select-none max-w-full",
          active
            ? "border-[#000000] dark:border-white font-medium text-[#000000] dark:text-white"
            : "border-[#EAEAEA] dark:border-border font-normal text-[#666666] dark:text-muted-foreground hover:bg-neutral-50 dark:hover:bg-muted/50 hover:border-[#CCCCCC]"
        )}
      >
        <span className="truncate max-w-[130px] sm:max-w-[170px] md:max-w-[210px] text-left">
          {buttonText}
        </span>
        <ChevronDown
          className={cn(
            "w-3 h-3 text-[#666666] dark:text-muted-foreground stroke-[1.5px] shrink-0 transition-transform duration-150",
            isOpen && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {/* Screen-reader and automated-test compatibility select */}
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          onChange(e.target.value || null);
        }}
        tabIndex={-1}
        className="sr-only"
      >
        {showAllOption && <option value="">{allLabel ?? label}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Custom Styled Dropdown Popover */}
      {isOpen && (
        <div
          role="menu"
          aria-label={ariaLabel}
          className={cn(
            "absolute top-[calc(100%+4px)] z-50 min-w-[160px] sm:min-w-[190px] max-w-[calc(100vw-2rem)] max-h-60 overflow-y-auto rounded-lg border border-[#EAEAEA] dark:border-border bg-white dark:bg-card p-1 shadow-lg text-xs animate-in fade-in-0 zoom-in-95 duration-100",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          <div className="px-2 py-1 text-[10px] font-semibold text-[#888888] dark:text-muted-foreground uppercase tracking-wider">
            {label}
          </div>

          {showAllOption && (
            <button
              type="button"
              role="menuitem"
              aria-checked={!value}
              onClick={() => {
                onChange(null);
                onClose();
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer",
                !value
                  ? "bg-[#F5F5F5] dark:bg-muted font-medium text-black dark:text-foreground"
                  : "text-[#333333] dark:text-muted-foreground hover:bg-[#F9F9F9] dark:hover:bg-muted/60 hover:text-black dark:hover:text-foreground"
              )}
            >
              <span className="truncate">{allLabel ?? `All ${label.toLowerCase()}s`}</span>
              {!value && (
                <Check className="w-3.5 h-3.5 text-black dark:text-foreground shrink-0 stroke-[2] ml-2" />
              )}
            </button>
          )}

          {options.map((opt) => {
            const isSelected = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitem"
                aria-checked={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  onClose();
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer",
                  isSelected
                    ? "bg-[#F5F5F5] dark:bg-muted font-medium text-black dark:text-foreground"
                    : "text-[#333333] dark:text-muted-foreground hover:bg-[#F9F9F9] dark:hover:bg-muted/60 hover:text-black dark:hover:text-foreground"
                )}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-black dark:text-foreground shrink-0 stroke-[2] ml-2" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const SORT_OPTIONS: ReadonlyArray<DropdownOption> = [
  { value: "sla_soonest", label: "SLA: soonest first" },
  { value: "sla_latest", label: "SLA: latest first" },
  { value: "order_newest", label: "Order: newest first" },
];

/** Search and filter dropdowns matching other screens; responsive on all viewport sizes */
export function FulfillmentFilters({
  state,
  warehouses,
  carriers,
  filtered,
  sort = "sla_soonest",
  onSort,
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
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);

  // Click-outside and escape-key handling to close active dropdown
  useEffect(() => {
    if (!openDropdown) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenDropdown(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openDropdown]);

  const exceptions = state.tab === "exceptions";
  const carrierOptions =
    carriers && state.carrier && !carriers.some((c) => c.providerCode === state.carrier)
      ? [...carriers, { providerCode: state.carrier, name: state.carrier }]
      : carriers;

  const warehouseOptions: DropdownOption[] = warehouses.map((w) => ({
    value: w.id,
    label: w.name,
  }));

  const carrierDropdownOptions: DropdownOption[] = (carrierOptions ?? []).map((c) => ({
    value: c.providerCode,
    label: c.name,
  }));

  const priorityOptions: DropdownOption[] = PRIORITIES.map((p) => ({
    value: p,
    label: PRIORITY_LABELS[p],
  }));

  const exceptionStatusOptions: DropdownOption[] = EXCEPTION_STATUSES.map((s) => ({
    value: s,
    label: EXCEPTION_STATUS_LABELS[s],
  }));

  const exceptionFlagOptions: DropdownOption[] = [
    { value: "true", label: "Has open exceptions" },
    { value: "false", label: "No open exceptions" },
  ];

  const sortValueText = SORT_OPTIONS.find((s) => s.value === sort)?.label;

  return (
    <div className="space-y-2.5" ref={containerRef}>
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

      {/* 2. Filter Dropdowns Row: Responsive on smaller screen sizes */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
        {/* Left side: Filter dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Warehouse */}
          <FulfillmentFilterDropdown
            id="warehouse"
            label="Warehouse"
            ariaLabel="Warehouse"
            value={state.warehouse ?? ""}
            options={warehouseOptions}
            allLabel="All warehouses"
            onChange={(val) => onWarehouse(val)}
            isOpen={openDropdown === "warehouse"}
            onToggle={() => setOpenDropdown((prev) => (prev === "warehouse" ? null : "warehouse"))}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Carrier (when permission granted) */}
          {carrierOptions && (
            <FulfillmentFilterDropdown
              id="carrier"
              label="Carrier"
              ariaLabel="Carrier"
              value={state.carrier ?? ""}
              options={carrierDropdownOptions}
              allLabel="All carriers"
              onChange={(val) => onCarrier(val)}
              isOpen={openDropdown === "carrier"}
              onToggle={() => setOpenDropdown((prev) => (prev === "carrier" ? null : "carrier"))}
              onClose={() => setOpenDropdown(null)}
            />
          )}

          {/* Priority */}
          <FulfillmentFilterDropdown
            id="priority"
            label="Priority"
            ariaLabel="Priority"
            value={state.priority ?? ""}
            options={priorityOptions}
            allLabel="All priorities"
            onChange={(val) => onPriority(val as Priority | null)}
            isOpen={openDropdown === "priority"}
            onToggle={() => setOpenDropdown((prev) => (prev === "priority" ? null : "priority"))}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Exceptions */}
          {exceptions ? (
            <FulfillmentFilterDropdown
              id="exceptionStatus"
              label="Exception status"
              ariaLabel="Exception status"
              value={state.exceptionStatus}
              options={exceptionStatusOptions}
              showAllOption={false}
              onChange={(val) => onExceptionStatus((val ?? "open") as ExceptionStatus)}
              isOpen={openDropdown === "exceptionStatus"}
              onToggle={() =>
                setOpenDropdown((prev) => (prev === "exceptionStatus" ? null : "exceptionStatus"))
              }
              onClose={() => setOpenDropdown(null)}
            />
          ) : (
            <FulfillmentFilterDropdown
              id="exceptions"
              label="Exceptions"
              ariaLabel="Exceptions"
              value={state.hasException === undefined ? "" : String(state.hasException)}
              options={exceptionFlagOptions}
              allLabel="All exceptions"
              onChange={(val) => onException((val as "true" | "false" | null) ?? null)}
              isOpen={openDropdown === "exceptions"}
              onToggle={() =>
                setOpenDropdown((prev) => (prev === "exceptions" ? null : "exceptions"))
              }
              onClose={() => setOpenDropdown(null)}
            />
          )}
        </div>

        {/* Right side: Sorting dropdown & Clear filters */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 shrink-0 pt-1 sm:pt-0">
          <FulfillmentFilterDropdown
            id="sort"
            label="Sort"
            ariaLabel="Sort queue"
            value={sort}
            options={SORT_OPTIONS}
            showAllOption={false}
            valueText={sortValueText}
            onChange={(val) => onSort?.((val as QueueSort) ?? "sla_soonest")}
            isOpen={openDropdown === "sort"}
            onToggle={() => setOpenDropdown((prev) => (prev === "sort" ? null : "sort"))}
            onClose={() => setOpenDropdown(null)}
            align="right"
          />

          {filtered && (
            <button
              type="button"
              onClick={onClear}
              className="box-border flex flex-row items-center gap-1 h-8 px-2 text-xs text-[#666666] dark:text-muted-foreground hover:text-black dark:hover:text-foreground transition-colors cursor-pointer rounded-lg hover:bg-neutral-50 dark:hover:bg-muted/50"
            >
              <X className="w-3 h-3" aria-hidden />
              <span>Clear filters</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
