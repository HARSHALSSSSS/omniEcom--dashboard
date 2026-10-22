import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";

export interface ListingMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}

interface ListingMenuProps {
  /** the button's text ("More") */
  label: string;
  items: ListingMenuItem[];
  buttonClassName: string;
  menuClassName?: string;
}

/** the "More ⌄" dropdown of the design: closes on a pick, outside click or Escape */
export function ListingMenu({ label, items, buttonClassName, menuClassName }: ListingMenuProps) {
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

  return (
    <div ref={root} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={buttonClassName}>
        <span>{label}</span>
        <span className="text-[10px]" aria-hidden>
          ⌄
        </span>
      </button>
      {open && (
        <div role="menu" className={cn("absolute right-0 z-30 mt-1 w-48 rounded-lg border border-[#EAEAEA] bg-white py-1.5 text-[12px] shadow-lg", menuClassName)}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full cursor-pointer items-center px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                item.danger ? "text-red-600 hover:bg-red-50" : "text-[#000000] hover:bg-[#F5F5F5]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
