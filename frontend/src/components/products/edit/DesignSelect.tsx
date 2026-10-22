import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";
import { boxClass } from "./fieldStyles";

export interface SelectOption {
  value: string;
  label: string;
  /** small grey text under the label (a nested category's path) */
  hint?: string;
}

const MENU = "absolute left-0 right-0 top-[44px] max-h-[260px] overflow-y-auto bg-white border border-[#EAEAEA] rounded-[8px] p-1 flex flex-col gap-0.5 z-40 shadow-[0px_4px_12px_rgba(0,0,0,0.08)]";

/** a menu with more options than this gets a search box (the category tree of a business can be long) */
export const SEARCH_THRESHOLD = 8;

function useDismiss(open: boolean, close: () => void) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return root;
}

function Menu({ options, value, onPick, searchable }: { options: SelectOption[]; value: string; onPick: (v: string) => void; searchable?: boolean }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.value === "" || o.label.toLowerCase().includes(needle) || (o.hint ?? "").toLowerCase().includes(needle)) : options;
  const noMatches = needle !== "" && shown.every((o) => o.value === "");
  return (
    <div className={MENU}>
      {searchable && (
        <input
          type="search"
          autoFocus
          aria-label="Search options"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-1 h-8 w-full shrink-0 rounded-[4px] border border-[#EAEAEA] bg-white px-2.5 text-[12px] text-[#000000] outline-none placeholder:text-[#666666] focus:border-[#000000]"
        />
      )}
      <div role="listbox" className="flex flex-col gap-0.5">
        {shown.map((o) => (
          <button
            key={o.value || "__none__"}
            type="button"
            role="option"
            aria-selected={value === o.value}
            onClick={() => onPick(o.value)}
            className={cn(
              "flex items-center justify-between w-full min-h-8 px-2.5 rounded-[4px] text-[12px] leading-[145%] text-left transition-colors cursor-pointer",
              value === o.value ? "bg-[#F5F5F5] text-[#000000] font-medium" : "bg-white text-[#000000] font-normal hover:bg-[#F5F5F5]",
            )}
          >
            <span className="flex flex-col">
              <span>{o.label}</span>
              {o.hint && <span className="text-[11px] font-normal text-[#666666]">{o.hint}</span>}
            </span>
            {value === o.value && <Check className="w-3.5 h-3.5 text-[#666666] shrink-0 stroke-[2]" aria-hidden="true" />}
          </button>
        ))}
      </div>
      {noMatches && <p className="px-2.5 py-1.5 text-[12px] text-[#666666]">No matches</p>}
    </div>
  );
}

interface SelectProps {
  id: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  modified?: boolean;
  error?: boolean;
  describedBy?: string;
  /** show a search box in the menu (default: when there are more than SEARCH_THRESHOLD options) */
  searchable?: boolean;
}

/** the design's dropdown: a bordered button with a chevron and a small menu with a check on the current option */
export function DesignSelect({ id, value, options, onChange, disabled, modified, error, describedBy, searchable }: SelectProps) {
  const [open, setOpen] = useState(false);
  const root = useDismiss(open, () => setOpen(false));
  const current = options.find((o) => o.value === value);
  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={error || undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((o) => !o)}
        className={cn(boxClass({ modified, error, disabled, open }), "justify-between w-full text-[13px] text-[#000000] leading-[145%] cursor-pointer", !open && !modified && !error && "hover:border-[#666666]", disabled && "cursor-not-allowed")}
      >
        <span className={cn("truncate", !current?.value && "text-[#666666]")}>{current?.label ?? ""}</span>
        <ChevronDown className={cn("w-4 h-4 text-[#666666] shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <Menu
          options={options}
          value={value}
          searchable={searchable ?? options.length > SEARCH_THRESHOLD}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface ComboProps {
  id: string;
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  modified?: boolean;
  error?: boolean;
  maxLength?: number;
  describedBy?: string;
}

/** a text input (any value can be typed) with the design's dropdown listing the known values */
export function DesignCombo({ id, value, suggestions, onChange, disabled, modified, error, maxLength, describedBy }: ComboProps) {
  const [open, setOpen] = useState(false);
  const root = useDismiss(open, () => setOpen(false));
  const options = suggestions.map((s) => ({ value: s, label: s }));
  return (
    <div className="relative" ref={root}>
      <div className={cn(boxClass({ modified, error, disabled, open }), "gap-2")}>
        <input
          id={id}
          type="text"
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          autoComplete="off"
          aria-invalid={error || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 text-[13px] text-[#000000] leading-[145%] outline-none bg-transparent disabled:cursor-not-allowed"
        />
        {options.length > 0 && !disabled && (
          <button type="button" aria-label="Show known values" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="shrink-0 cursor-pointer">
            <ChevronDown className={cn("w-4 h-4 text-[#666666] transition-transform", open && "rotate-180")} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <Menu
          options={options}
          value={value}
          searchable={false}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
