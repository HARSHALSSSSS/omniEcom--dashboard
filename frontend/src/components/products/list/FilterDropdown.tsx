import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface DropdownOption {
  id: string;
  label: string;
}

interface FilterDropdownProps {
  /** the button text while nothing is chosen ("Category") */
  label: string;
  /** the group heading inside the menu */
  heading: string;
  options: ReadonlyArray<DropdownOption>;
  value: string | null;
  /** an option that clears the choice ("All categories"); omit when every option is a real value */
  allLabel?: string;
  onChange: (id: string | null) => void;
  /** where the menu opens from */
  align?: "left" | "right";
  width?: number;
  /** show the chosen label in the button ("Category · Bags"), the sort menu shows only its label */
  showValue?: boolean;
  disabled?: boolean;
  /** the menu body when there is nothing to choose from (loading, failed, none) */
  emptyNote?: string;
  footer?: ReactNode;
  /** render the button as plain text (the sort control) */
  plain?: boolean;
}

/** One dropdown of the filter row: a button that opens a short menu of radio-style options. */
export function FilterDropdown({
  label,
  heading,
  options,
  value,
  allLabel,
  onChange,
  align = "left",
  width = 216,
  showValue = true,
  disabled,
  emptyNote,
  footer,
  plain,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const chosen = options.find((o) => o.id === value);
  const items: DropdownOption[] = allLabel ? [{ id: "", label: allLabel }, ...options] : [...options];
  const current = value ?? "";

  const buttonText = plain ? (chosen?.label ?? label) : chosen && showValue ? `${label} · ${chosen.label}` : label;
  const buttonClass = plain
    ? "flex items-center gap-1 hover:text-[#666666] transition-colors cursor-pointer disabled:cursor-not-allowed"
    : `box-border flex flex-row items-center justify-between px-2.5 h-[34px] bg-[#FFFFFF] rounded-[8px] text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        chosen ? "border border-[#000000] text-[#000000]" : "border border-[#BDBDBD] text-[#000000] hover:border-[#666666]"
      }`;

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={buttonClass}
      >
        <span className={plain ? undefined : "max-w-[200px] truncate"}>{buttonText}</span>
        {plain ? <span className="text-[11px]" aria-hidden>↓</span> : <ChevronDown className="h-3 w-3 text-[#666666] ml-2 shrink-0" aria-hidden />}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={heading}
          style={{ width }}
          className={`absolute ${align === "right" ? "right-0" : "left-0"} ${plain ? "top-[30px]" : "top-[40px]"} z-50 max-h-[320px] overflow-y-auto bg-[#FFFFFF] border border-[#EAEAEA] rounded-[8px] shadow-[0px_4px_12px_rgba(0,0,0,0.08)] p-1 text-xs`}
        >
          <div className="px-2 py-1 text-[11px] font-medium text-[#666666] uppercase">{heading}</div>
          {items.length === 0 && emptyNote && <div className="px-2 py-2 text-[12px] text-[#666666]">{emptyNote}</div>}
          {items.map((opt) => {
            const selected = current === opt.id;
            return (
              <button
                key={opt.id || "all"}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(opt.id || null);
                  setOpen(false);
                }}
                className={`w-full min-h-[30px] flex items-center justify-between gap-2 px-2 py-1.5 rounded-[4px] hover:bg-[#F5F5F5] text-left ${selected ? "bg-[#F5F5F5] font-medium" : ""}`}
              >
                <span className="truncate">{opt.label}</span>
                {selected && <Check className="h-3.5 w-3.5 text-[#666666] shrink-0" aria-hidden />}
              </button>
            );
          })}
          {footer}
        </div>
      )}
    </div>
  );
}
