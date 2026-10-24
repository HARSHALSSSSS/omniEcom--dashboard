import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MoreMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
}

/** the "More" menu of the pricing header: a real menu (aria-haspopup / expanded), closes on outside click and Escape, arrow keys move */
export function PricingMoreMenu({ items }: { items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) refs.current[0]?.focus();
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      close(true);
      return;
    }
    if (!open) return;
    const i = refs.current.findIndex((r) => r === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      refs.current[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      refs.current[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={root} onKeyDown={onKeyDown}>
      <Button
        ref={trigger}
        variant="outline"
        size="sm"
        className="gap-1 text-xs h-8 cursor-pointer"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
        More
      </Button>
      {open && (
        <div role="menu" aria-label="More pricing views" className="absolute right-0 mt-1 w-44 rounded-lg border border-border bg-card p-1 shadow-lg z-20 text-xs">
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-muted focus:bg-muted focus:outline-none text-foreground cursor-pointer transition-colors"
              onClick={() => {
                close(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
