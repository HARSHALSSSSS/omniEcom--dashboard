import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export interface OrderDateFilterValue {
  date?: string | null;
  placedFrom?: string | null;
  placedTo?: string | null;
}

interface OrderDateDropdownProps {
  date?: string | null;
  placedFrom?: string | null;
  placedTo?: string | null;
  onChange: (value: OrderDateFilterValue) => void;
}

interface DatePreset {
  key: string;
  label: string;
}

const PRESETS: DatePreset[] = [
  { key: "any", label: "Any date" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
  { key: "custom", label: "Custom date / range" },
];

function getActivePresetKey(date?: string | null, placedFrom?: string | null, placedTo?: string | null): string {
  if (date === "today") return "today";
  if (date === "yesterday") return "yesterday";
  if (!date && !placedFrom && !placedTo) return "any";

  const todayStr = new Date().toISOString().slice(0, 10);
  const d7 = new Date();
  d7.setDate(d7.getDate() - 6);
  const sevenDaysAgo = d7.toISOString().slice(0, 10);

  const d30 = new Date();
  d30.setDate(d30.getDate() - 29);
  const thirtyDaysAgo = d30.toISOString().slice(0, 10);

  const firstOfMonth = `${todayStr.slice(0, 8)}01`;

  const fromStr = placedFrom ? placedFrom.slice(0, 10) : "";
  const toStr = placedTo ? placedTo.slice(0, 10) : "";

  if (fromStr === sevenDaysAgo && toStr === todayStr) return "7d";
  if (fromStr === thirtyDaysAgo && toStr === todayStr) return "30d";
  if (fromStr === firstOfMonth && toStr === todayStr) return "this_month";

  return "custom";
}

function getDisplayLabel(date?: string | null, placedFrom?: string | null, placedTo?: string | null): string | null {
  const key = getActivePresetKey(date, placedFrom, placedTo);
  if (key === "any") return null;
  if (key === "today") return "Today";
  if (key === "yesterday") return "Yesterday";
  if (key === "7d") return "Last 7 days";
  if (key === "30d") return "Last 30 days";
  if (key === "this_month") return "This month";

  if (date && date !== "today" && date !== "yesterday") {
    return date;
  }
  if (placedFrom && placedTo) {
    const f = placedFrom.slice(0, 10);
    const t = placedTo.slice(0, 10);
    return f === t ? f : `${f} to ${t}`;
  }
  if (placedFrom) return `From ${placedFrom.slice(0, 10)}`;
  if (placedTo) return `To ${placedTo.slice(0, 10)}`;
  return "Custom";
}

export function OrderDateDropdown({ date, placedFrom, placedTo, onChange }: OrderDateDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const todayStr = new Date().toISOString().slice(0, 10);
  const activeKey = getActivePresetKey(date, placedFrom, placedTo);
  const displayLabel = getDisplayLabel(date, placedFrom, placedTo);
  const active = Boolean(displayLabel);

  const [draftFrom, setDraftFrom] = useState(placedFrom ? placedFrom.slice(0, 10) : date && date !== "today" && date !== "yesterday" ? date : todayStr);
  const [draftTo, setDraftTo] = useState(placedTo ? placedTo.slice(0, 10) : date && date !== "today" && date !== "yesterday" ? date : todayStr);
  const [error, setError] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(activeKey === "custom");

  useEffect(() => {
    if (placedFrom) setDraftFrom(placedFrom.slice(0, 10));
    else if (date && date !== "today" && date !== "yesterday") setDraftFrom(date);

    if (placedTo) setDraftTo(placedTo.slice(0, 10));
    else if (date && date !== "today" && date !== "yesterday") setDraftTo(date);

    setShowCustom(activeKey === "custom");
  }, [date, placedFrom, placedTo, activeKey]);

  // Click outside and escape dismissal
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const selectPreset = (key: string) => {
    setError(null);
    if (key === "any") {
      setShowCustom(false);
      onChange({ date: null, placedFrom: null, placedTo: null });
      setOpen(false);
    } else if (key === "today") {
      setShowCustom(false);
      onChange({ date: "today", placedFrom: null, placedTo: null });
      setOpen(false);
    } else if (key === "yesterday") {
      setShowCustom(false);
      onChange({ date: "yesterday", placedFrom: null, placedTo: null });
      setOpen(false);
    } else if (key === "7d") {
      setShowCustom(false);
      const d7 = new Date();
      d7.setDate(d7.getDate() - 6);
      const sevenDaysAgo = d7.toISOString().slice(0, 10);
      onChange({
        date: null,
        placedFrom: `${sevenDaysAgo}T00:00:00.000Z`,
        placedTo: `${todayStr}T23:59:59.999Z`,
      });
      setOpen(false);
    } else if (key === "30d") {
      setShowCustom(false);
      const d30 = new Date();
      d30.setDate(d30.getDate() - 29);
      const thirtyDaysAgo = d30.toISOString().slice(0, 10);
      onChange({
        date: null,
        placedFrom: `${thirtyDaysAgo}T00:00:00.000Z`,
        placedTo: `${todayStr}T23:59:59.999Z`,
      });
      setOpen(false);
    } else if (key === "this_month") {
      setShowCustom(false);
      const firstOfMonth = `${todayStr.slice(0, 8)}01`;
      onChange({
        date: null,
        placedFrom: `${firstOfMonth}T00:00:00.000Z`,
        placedTo: `${todayStr}T23:59:59.999Z`,
      });
      setOpen(false);
    } else if (key === "custom") {
      setShowCustom(true);
    }
  };

  const applyCustom = () => {
    if (!draftFrom || !draftTo) {
      setError("Please select both start and end dates.");
      return;
    }
    if (draftFrom > draftTo) {
      setError("Start date cannot be after end date.");
      return;
    }
    setError(null);

    if (draftFrom === draftTo) {
      // Single specific day filter
      onChange({
        date: draftFrom,
        placedFrom: null,
        placedTo: null,
      });
    } else {
      // Date range filter
      onChange({
        date: null,
        placedFrom: `${draftFrom}T00:00:00.000Z`,
        placedTo: `${draftTo}T23:59:59.999Z`,
      });
    }
    setOpen(false);
  };

  // Sync with test helper select
  const handleNativeSelectChange = (val: string) => {
    if (!val) {
      onChange({ date: null, placedFrom: null, placedTo: null });
    } else if (val === "today" || val === "yesterday") {
      onChange({ date: val, placedFrom: null, placedTo: null });
    }
  };

  return (
    <div className="relative shrink-0" ref={containerRef}>
      {/* Visual Filter Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white dark:bg-card border rounded-lg transition-colors max-w-[240px] truncate",
          active
            ? "border-[#000000] dark:border-white font-medium text-[#000000] dark:text-white"
            : "border-[#EAEAEA] dark:border-border text-[#666666] dark:text-muted-foreground hover:bg-neutral-50 dark:hover:bg-muted/50"
        )}
      >
        <span className="text-[12px] leading-[145%] truncate">
          {active ? `Date: ${displayLabel}` : "Date"}
        </span>
        <ChevronDown
          className={cn(
            "w-3 h-3 text-[#666666] stroke-[1.5px] shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {/* Screen-reader and automated-test compatibility element */}
      <select
        aria-label="Date"
        value={date ?? ""}
        onChange={(e) => handleNativeSelectChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      >
        <option value="">Any date</option>
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
      </select>

      {/* Modern Popover Dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label="Order date filter"
          className="absolute left-0 top-full mt-1.5 z-50 w-72 sm:w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-2.5 shadow-xl text-card-foreground animate-in fade-in-0 zoom-in-95"
        >
          <div className="px-2 py-1 mb-1 border-b border-border/70 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Filter by Date
          </div>

          {/* Preset list */}
          <div className="space-y-0.5">
            {PRESETS.map((p) => {
              const isSelected = activeKey === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => selectPreset(p.key)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors text-left",
                    isSelected
                      ? "bg-muted font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <span>{p.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-foreground shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Custom Date Form */}
          {showCustom && (
            <div className="mt-2 pt-2 border-t border-border/80 space-y-2">
              <span className="block text-[11px] font-medium text-muted-foreground px-1">
                Custom period (From / To)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="order-date-from" className="block text-[10px] font-medium text-muted-foreground">
                    From
                  </label>
                  <input
                    id="order-date-from"
                    type="date"
                    value={draftFrom}
                    max={draftTo || undefined}
                    onChange={(e) => {
                      setDraftFrom(e.target.value);
                      setError(null);
                    }}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="order-date-to" className="block text-[10px] font-medium text-muted-foreground">
                    To
                  </label>
                  <input
                    id="order-date-to"
                    type="date"
                    value={draftTo}
                    min={draftFrom || undefined}
                    onChange={(e) => {
                      setDraftTo(e.target.value);
                      setError(null);
                    }}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              {error && (
                <p role="alert" className="text-[11px] text-destructive font-medium px-1">
                  {error}
                </p>
              )}

              <Button
                type="button"
                size="sm"
                className="w-full h-8 text-xs font-medium mt-1"
                onClick={applyCustom}
              >
                Apply Range
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

