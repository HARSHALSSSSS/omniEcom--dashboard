import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { FILTERABLE_OPTION } from "@/api/variants.api";
import type { VariantGridParams, VariantsProductHeader } from "@/types/variants";
import { titleCase } from "./variantUtils";

function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  title,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
}) {
  const active = value !== "";
  return (
    <div className="relative" title={title}>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none box-border min-h-[44px] sm:min-h-[34px] h-auto sm:h-[34px] pl-2.5 pr-8 bg-[#FFFFFF] border rounded-[8px] text-[12px] font-medium text-[#000000] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#000000] ${
          active ? "border-[#000000]" : "border-[#BDBDBD]"
        }`}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {label}: {o.label}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#666666]" aria-hidden />
    </div>
  );
}

interface Props {
  params: VariantGridParams;
  header: VariantsProductHeader | undefined;
  onSearch: (q: string) => void;
  onOption: (name: string, value: string) => void;
  onChannel: (value: string) => void;
  onInventory: (value: string) => void;
  onClear: () => void;
  /** the bulk-actions control sits at the end of the search row */
  bulk: ReactNode;
}

export function VariantToolbar({ params, header, onSearch, onOption, onChannel, onInventory, onClear, bulk }: Props) {
  const [text, setText] = useState(params.q);
  const sent = useRef(params.q);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  // the URL is the source of truth (back / forward / clear filters change it)
  useEffect(() => {
    if (params.q !== sent.current) {
      sent.current = params.q;
      setText(params.q);
    }
  }, [params.q]);

  // debounce typing into the URL
  useEffect(() => {
    if (text.trim() === sent.current.trim()) return;
    const t = setTimeout(() => {
      sent.current = text;
      onSearchRef.current(text);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  const optionNames = Object.keys(header?.options ?? {}).filter((n) => FILTERABLE_OPTION.test(n));
  const tabSetsInventory = params.tab === "low_stock" || params.tab === "out_of_stock";
  const anyFilter = !!params.q || !!params.channel || !!params.inventory || Object.keys(params.options).length > 0;

  return (
    <>
      <div className="w-full flex flex-col sm:flex-row items-center gap-2">
        <label className="flex-1 w-full box-border flex flex-row items-center px-3 min-h-[44px] sm:min-h-9 h-auto sm:h-9 bg-[#F5F5F5] rounded-[8px] gap-2 focus-within:outline focus-within:outline-2 focus-within:outline-[#000000]">
          <Search className="h-4 w-4 text-[#666666] shrink-0" aria-hidden />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search by variant, SKU, barcode…"
            aria-label="Search variants"
            className="flex-1 bg-transparent border-0 outline-none text-[12px] leading-[17px] text-[#000000] placeholder-[#666666]"
          />
        </label>
        {bulk}
      </div>

      <div className="w-full flex flex-row flex-wrap items-center gap-2">
        {optionNames.map((name) => (
          <FilterSelect
            key={name}
            label={titleCase(name)}
            value={params.options[name] ?? ""}
            options={(header?.options[name] ?? []).map((v) => ({ value: v, label: v }))}
            onChange={(v) => onOption(name, v)}
          />
        ))}
        {(header?.channels.length ?? 0) > 0 && (
          <FilterSelect
            label="Channel"
            value={params.channel}
            options={(header?.channels ?? []).map((c) => ({ value: c.code, label: c.name }))}
            onChange={onChannel}
          />
        )}
        <FilterSelect
          label="Inventory"
          value={tabSetsInventory ? (params.tab === "low_stock" ? "low" : "out") : params.inventory}
          disabled={tabSetsInventory}
          title={tabSetsInventory ? "Set by the selected tab" : undefined}
          options={[
            { value: "healthy", label: "In stock" },
            { value: "low", label: "Low stock" },
            { value: "out", label: "Out of stock" },
          ]}
          onChange={onInventory}
        />
        {anyFilter && (
          <button type="button" onClick={onClear} className="min-h-[44px] sm:min-h-[34px] h-auto sm:h-[34px] px-2 text-[12px] font-medium text-[#666666] underline hover:text-[#000000] cursor-pointer flex items-center">
            Clear filters
          </button>
        )}
      </div>
    </>
  );
}
