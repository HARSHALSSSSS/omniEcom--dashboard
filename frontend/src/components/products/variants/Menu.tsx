import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

interface Props {
  /** accessible name of the trigger button */
  label: string;
  items: MenuItem[];
  className: string;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
  align?: "left" | "right";
}

/** A small dropdown menu: button + role="menu" list, arrow keys, Escape and outside click close it. */
export function Menu({ label, items, className, children, disabled, title, align = "right" }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && open) {
      e.preventDefault();
      const nodes = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
      const at = nodes.indexOf(document.activeElement as HTMLButtonElement);
      nodes[(at + (e.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length]?.focus();
    }
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={title}
        onClick={() => {
          const r = trigger.current?.getBoundingClientRect();
          if (r) setPos(align === "right" ? { top: r.bottom + 4, right: window.innerWidth - r.right } : { top: r.bottom + 4, left: r.left });
          setOpen((o) => !o);
        }}
        className={className}
      >
        {children}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          style={pos}
          className={`fixed z-50 min-w-[180px] rounded-lg border border-[#EAEAEA] bg-white p-1 shadow-lg text-[12px]`}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.hint}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`w-full text-left px-3 py-2 rounded hover:bg-[#F5F5F5] focus:bg-[#F5F5F5] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                item.danger ? "text-[#B42318]" : "text-[#000000]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
