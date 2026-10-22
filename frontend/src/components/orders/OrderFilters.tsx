import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  DATE_FILTERS,
  FULFILLMENT_FILTERS,
  ORDER_STATUSES,
  PAYMENT_FILTERS,
  type AttentionKey,
  type DateFilter,
  type FulfillmentFilter,
  type MarketplaceRef,
  type OrderFilters as Filters,
  type OrderSavedView,
  type OrderSort,
  type OrderStatus,
  type PaymentFilter,
  type SlaState,
} from "@/types/orders";
import {
  ATTENTION_LABELS,
  DATE_LABELS,
  FULFILLMENT_LABELS,
  PAYMENT_LABELS,
  SLA_FILTER_OPTIONS,
  SLA_LABELS,
  SORT_OPTIONS,
  describeFilters,
} from "./orderParams";
import { OrderSavedViews } from "./OrderSavedViews";

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

interface FilterSelectProps {
  /** what the control is called while nothing is chosen (design: "Marketplace", "Order status", ...) */
  label: string;
  ariaLabel: string;
  value: string;
  /** the text of the chosen value (shown after the label) */
  valueText?: string;
  onChange: (value: string) => void;
  children: ReactNode;
}

/** a dropdown that looks like the design's filter button; the native select on top keeps it keyboard and screen-reader friendly */
function FilterSelect({ label, ariaLabel, value, valueText, onChange, children }: FilterSelectProps) {
  const active = value !== "";
  return (
    <div className="relative shrink-0">
      <div
        className={`box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white border rounded-lg transition-colors ${
          active ? "border-[#000000]" : "border-[#EAEAEA] hover:bg-neutral-50"
        }`}
      >
        <span className={`text-[12px] leading-[145%] ${active ? "font-medium text-[#000000]" : "font-normal text-[#666666]"}`}>
          {active && valueText ? `${label}: ${valueText}` : label}
        </span>
        <ChevronDown className="w-3 h-3 text-[#666666] stroke-[1.5px]" aria-hidden />
      </div>
      <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
        {children}
      </select>
    </div>
  );
}

interface OrderFiltersProps {
  filters: Filters;
  sort: OrderSort;
  channels: MarketplaceRef[];
  filtered: boolean;
  onSearch: (q: string) => void;
  onChannel: (code: string | null) => void;
  onStatus: (statuses: OrderStatus[]) => void;
  onSla: (states: SlaState[]) => void;
  onPayment: (payment: PaymentFilter | null) => void;
  onFulfillment: (values: FulfillmentFilter[]) => void;
  onDate: (date: DateFilter | null) => void;
  onAttention: (keys: AttentionKey[]) => void;
  onSort: (sort: OrderSort) => void;
  onClear: () => void;
  onApplyView: (view: OrderSavedView) => void;
}

const QUICK: ReadonlyArray<{ key: AttentionKey; bar?: string }> = [
  { key: "sla_risk", bar: "bg-[#D97706]" },
  { key: "unprocessed" },
  { key: "inventory_issue", bar: "bg-[#DC2626]" },
  { key: "payment_issue" },
  { key: "delayed" },
  { key: "returns" },
  { key: "disputes" },
];

/** search, the filter dropdowns, the quick filters and the "filtered by" line; every change goes to the URL */
export function OrderFilters({
  filters,
  sort,
  channels,
  filtered,
  onSearch,
  onChannel,
  onStatus,
  onSla,
  onPayment,
  onFulfillment,
  onDate,
  onAttention,
  onSort,
  onClear,
  onApplyView,
}: OrderFiltersProps) {
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
  const channelName = (code: string) => chips.find((c) => c.code === code)?.name ?? code;
  const channelValue = selected.join(",");
  const channelCustom = selected.length > 1;

  const statusValue = (filters.status ?? []).join(",");
  const statusIsCustom = (filters.status?.length ?? 0) > 1;
  const slaValue = (filters.slaState ?? []).join(",");
  const slaIsCustom = (filters.slaState?.length ?? 0) > 1 || (filters.slaState?.length === 1 && !SLA_FILTER_OPTIONS.includes(filters.slaState[0] as SlaState));
  const fulfillmentValue = (filters.fulfillment ?? []).join(",");
  const fulfillmentIsCustom = (filters.fulfillment?.length ?? 0) > 1;
  const attention = filters.attention ?? [];

  const scope = describeFilters({ ...filters, tab: undefined }, channelName);

  return (
    <div className="w-full flex flex-col items-start gap-[6px]">
      <div className="w-full flex flex-row flex-wrap items-center gap-[6px] min-h-[32px]">
        <div className="box-border flex-1 min-w-[220px] flex flex-row items-center px-[10px] gap-[6px] h-[32px] border border-[#EAEAEA] rounded-lg bg-white">
          <Search className="w-[14px] h-[14px] text-[#666666] stroke-[1.5px] shrink-0" aria-hidden />
          <input
            type="search"
            aria-label="Search orders"
            placeholder="Search order / customer / SKU"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-[11px] font-normal leading-[145%] text-[#000000] placeholder-[#666666]"
          />
        </div>

        <FilterSelect
          label="Marketplace"
          ariaLabel="Marketplace"
          value={channelValue}
          valueText={selected.map(channelName).join(" + ")}
          onChange={(v) => onChannel(v || null)}
        >
          <option value="">All channels</option>
          {channelCustom && <option value={channelValue}>{selected.map(channelName).join(" + ")}</option>}
          {chips.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Order status"
          ariaLabel="Status"
          value={statusValue}
          valueText={(filters.status ?? []).map((s) => STATUS_NAME[s]).join(" + ")}
          onChange={(v) => onStatus(v ? [v as OrderStatus] : [])}
        >
          <option value="">Any status</option>
          {statusIsCustom && <option value={statusValue}>{(filters.status ?? []).map((s) => STATUS_NAME[s]).join(" + ")}</option>}
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_NAME[s]}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="SLA state"
          ariaLabel="Dispatch SLA"
          value={slaValue}
          valueText={(filters.slaState ?? []).map((s) => SLA_LABELS[s]).join(" + ")}
          onChange={(v) => onSla(v ? (v.split(",") as SlaState[]) : [])}
        >
          <option value="">Any SLA</option>
          {slaIsCustom && <option value={slaValue}>{(filters.slaState ?? []).map((s) => SLA_LABELS[s]).join(" + ")}</option>}
          {SLA_FILTER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {SLA_LABELS[s]}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Payment"
          ariaLabel="Payment"
          value={filters.payment ?? ""}
          valueText={filters.payment ? PAYMENT_LABELS[filters.payment] : undefined}
          onChange={(v) => onPayment((v || null) as PaymentFilter | null)}
        >
          <option value="">Any payment</option>
          {PAYMENT_FILTERS.map((p) => (
            <option key={p} value={p}>
              {PAYMENT_LABELS[p]}
            </option>
          ))}
        </FilterSelect>
      </div>

      <div className="w-full flex flex-row flex-wrap items-center gap-[6px] min-h-[32px]">
        <FilterSelect
          label="Fulfillment"
          ariaLabel="Fulfillment"
          value={fulfillmentValue}
          valueText={(filters.fulfillment ?? []).map((f) => FULFILLMENT_LABELS[f]).join(" + ")}
          onChange={(v) => onFulfillment(v ? (v.split(",") as FulfillmentFilter[]) : [])}
        >
          <option value="">Any fulfillment</option>
          {fulfillmentIsCustom && <option value={fulfillmentValue}>{(filters.fulfillment ?? []).map((f) => FULFILLMENT_LABELS[f]).join(" + ")}</option>}
          {FULFILLMENT_FILTERS.map((f) => (
            <option key={f} value={f}>
              {FULFILLMENT_LABELS[f]}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Date"
          ariaLabel="Date"
          value={filters.date ?? ""}
          valueText={filters.date ? DATE_LABELS[filters.date] : undefined}
          onChange={(v) => onDate((v || null) as DateFilter | null)}
        >
          <option value="">Any date</option>
          {DATE_FILTERS.map((d) => (
            <option key={d} value={d}>
              {DATE_LABELS[d]}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Sort"
          ariaLabel="Sort orders"
          value={sort === "-placedAt" ? "" : sort}
          valueText={SORT_OPTIONS.find((o) => o.id === sort)?.label}
          onChange={(v) => onSort((v || "-placedAt") as OrderSort)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id === "-placedAt" ? "" : o.id}>
              {o.label}
            </option>
          ))}
        </FilterSelect>

        <OrderSavedViews filters={filters} sort={sort} channelName={channelName} onApply={onApplyView} />

        <div className="flex-1 min-w-[160px] text-right">
          <span className="text-[11px] font-normal leading-[145%] text-[#666666]" aria-live="polite">
            {scope.length > 0 ? `Filtered by ${scope.join(" · ")}` : "No filters applied"}
          </span>
          {filtered && (
            <button type="button" onClick={onClear} className="ml-3 text-[11px] font-medium leading-[145%] text-[#000000] underline-offset-2 hover:underline cursor-pointer">
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div role="group" aria-label="Quick filters" className="w-full flex flex-row flex-wrap items-center gap-x-4 gap-y-1 min-h-[22px]">
        {QUICK.map((c) => {
          const on = attention.includes(c.key);
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => onAttention(on ? attention.filter((k) => k !== c.key) : [c.key])}
              className="flex flex-row items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
            >
              {c.bar && <div className={`w-[3px] h-[10px] ${c.bar} rounded-[1px]`} />}
              <span className={`text-[11px] leading-[13px] ${on ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"}`}>{ATTENTION_LABELS[c.key]}</span>
            </button>
          );
        })}
        {attention.filter((k) => !QUICK.some((c) => c.key === k)).map((k) => (
          <button key={k} type="button" aria-pressed onClick={() => onAttention(attention.filter((x) => x !== k))} className="text-[11px] font-semibold leading-[13px] text-[#000000] cursor-pointer">
            {ATTENTION_LABELS[k]}
          </button>
        ))}
      </div>
    </div>
  );
}
