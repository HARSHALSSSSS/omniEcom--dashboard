import { useEffect, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/utils/cn";
import type { ShipmentStatus } from "@/types/shipping";
import { STATUS_LABELS } from "./shippingParams";

const TONE: Record<ShipmentStatus, string> = {
  created: "bg-slate-100 text-slate-700",
  label_ready: "bg-slate-100 text-slate-700",
  manifested: "bg-blue-50 text-blue-700",
  dispatched: "bg-blue-50 text-blue-700",
  in_transit: "bg-blue-50 text-blue-700",
  out_for_delivery: "bg-indigo-50 text-indigo-700",
  delivered: "bg-emerald-50 text-emerald-700",
  delivery_failed: "bg-amber-50 text-amber-700",
  rto_initiated: "bg-rose-50 text-rose-700",
  rto_in_transit: "bg-rose-50 text-rose-700",
  rto_delivered: "bg-rose-50 text-rose-700",
  cancelled: "bg-neutral-100 text-neutral-600",
};

export function ShipmentStatusPill({ status, label }: { status: ShipmentStatus; label?: string }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[status])}>{label ?? STATUS_LABELS[status]}</span>;
}

/** a design-style filter button: a native select (so it is keyboard and screen-reader friendly) dressed as the chevron button */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string | null) => void;
  /** the first entry (no filter); defaults to the label */
  allLabel?: string;
}) {
  const known = options.some((o) => o.value === value);
  return (
    <span className="relative inline-flex">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        className={cn(
          "h-8 appearance-none rounded-lg border border-[#EAEAEA] bg-white py-0 pl-2.5 pr-7 text-[12px] transition-colors hover:bg-neutral-50 focus:border-black focus:outline-none",
          value ? "font-medium text-black" : "text-[#666666]",
        )}
      >
        <option value="">{allLabel ?? label}</option>
        {!known && value && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-3 w-3 text-[#666666]" aria-hidden />
    </span>
  );
}

/** the design's search box; typing is debounced into the URL */
export function SearchBox({ value, label, placeholder, onSearch }: { value: string; label: string; placeholder: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, value, onSearch]);
  return (
    <div className="relative min-w-[240px] max-w-[500px] flex-1">
      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 stroke-[1.5] text-[#666666]" aria-hidden />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-8 w-full rounded-lg border border-[#EAEAEA] bg-white pl-8 pr-3 text-[12px] text-black placeholder:text-[#666666] focus:border-black focus:outline-none"
      />
    </div>
  );
}

/** a quiet box for loading failures, empty lists and "nothing matches" */
export function Notice({ title, children, role }: { title: string; children?: React.ReactNode; role?: "alert" }) {
  return (
    <div role={role} className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-[#EAEAEA] bg-[#FAF9F7] px-6 py-8 text-center">
      <h3 className="text-[14px] font-semibold text-black">{title}</h3>
      {children && <div className="max-w-[520px] space-y-2 text-[12px] text-[#666666]">{children}</div>}
    </div>
  );
}
