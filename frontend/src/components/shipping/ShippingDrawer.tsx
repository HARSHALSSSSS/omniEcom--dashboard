import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ShippingDrawerProps {
  open: boolean;
  /** the small label after "DRAWER |" */
  eyebrow: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** the right-hand drawer of the shipping design: dimmed backdrop, 440px panel, header, scrolling body, footer actions */
export function ShippingDrawer({ open, eyebrow, title, subtitle, onClose, children, footer }: ShippingDrawerProps) {
  const panel = useRef<HTMLDivElement>(null);

  // the latest onClose without re-running the effect (that would pull focus out of the field being typed in)
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative z-50 flex h-full w-[440px] max-w-full flex-col bg-white text-[#0A0A0A] shadow-2xl outline-none animate-in slide-in-from-right duration-300"
      >
        <div className="flex items-center justify-between border-b border-[#EAEAEA] px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase text-[#666666]">
              <span>DRAWER</span>
              <span className="h-2 w-[1px] bg-[#BDBDBD]" />
              <span className="text-[11px] font-medium capitalize text-black">{eyebrow}</span>
            </div>
            <h3 className="mt-1 text-[17px] font-semibold text-black">{title}</h3>
            {subtitle && <p className="text-[11px] text-[#666666]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-[#666666] transition-colors hover:bg-neutral-100 hover:text-black">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-[12px]">{children}</div>
        {footer && <div className="flex items-center gap-3 border-t border-[#EAEAEA] bg-white px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/** the radio card used for shipping methods and provider types */
export function OptionCard({
  selected,
  disabled,
  tone = "dark",
  onSelect,
  title,
  children,
  badge,
}: {
  selected: boolean;
  disabled?: boolean;
  tone?: "dark" | "green";
  onSelect: () => void;
  title: string;
  children?: ReactNode;
  badge?: ReactNode;
}) {
  const border = selected ? (tone === "green" ? "border-[#16A34A] bg-[#F9FEFA]" : "border-black bg-neutral-50") : "border-[#EAEAEA] bg-white hover:bg-neutral-50";
  const dot = selected ? (tone === "green" ? "border-[#16A34A] bg-[#16A34A]" : "border-black bg-black") : "border-[#BDBDBD] bg-white";
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`space-y-1 rounded-xl border p-3.5 shadow-xs transition-all ${border} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${dot}`}>{selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}</div>
          <span className="text-[12px] font-semibold text-black">{title}</span>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

export const BTN_PRIMARY = "inline-flex h-9 items-center justify-center rounded-lg bg-black px-5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60";
export const BTN_SECONDARY = "inline-flex h-9 items-center justify-center rounded-lg border border-[#EAEAEA] bg-white px-4 text-[12px] font-medium text-black transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60";
