import { useEffect, useRef, useState } from "react";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { rangeLabel, rangeProblem } from "./profitFormat";
import type { DateRange, RangePreset } from "@/types/profitability";

export interface ProfitDateRangeDropdownProps {
  preset: RangePreset;
  range: DateRange | null;
  rangeError: string | null;
  customFrom: string;
  customTo: string;
  currency: string;
  compare: boolean;
  onPreset: (preset: RangePreset) => void;
  onCustom: (patch: { from?: string; to?: string }) => void;
  onCompare: (on: boolean) => void;
  className?: string;
}

interface PresetOption {
  key: string;
  label: string;
  isCustom7Days?: boolean;
  presetValue?: RangePreset;
}

const PRESET_OPTIONS: PresetOption[] = [
  { key: "7d", label: "Last 7 days", isCustom7Days: true },
  { key: "30d", label: "Last 30 days", presetValue: "30d" },
  { key: "90d", label: "Last 90 days", presetValue: "90d" },
  { key: "mtd", label: "This month", presetValue: "mtd" },
  { key: "last_month", label: "Last month", presetValue: "last_month" },
  { key: "ytd", label: "Year to date", presetValue: "ytd" },
  { key: "custom", label: "Custom range", presetValue: "custom" },
];

export function ProfitDateRangeDropdown({
  preset,
  range,
  rangeError,
  customFrom,
  customTo,
  currency,
  compare,
  onPreset,
  onCustom,
  onCompare,
  className,
}: ProfitDateRangeDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine if popover should align to left or right of the trigger button
  const [align, setAlign] = useState<"left" | "right">(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      return "left";
    }
    return "right";
  });

  useEffect(() => {
    if (!open) return;
    const updateAlign = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const screenWidth = window.innerWidth;
      const popoverWidth = Math.min(320, screenWidth - 32);

      const overflowsRight = rect.left + popoverWidth > screenWidth - 12;
      const overflowsLeft = rect.right - popoverWidth < 12;

      if (overflowsLeft && !overflowsRight) {
        setAlign("left");
      } else if (overflowsRight && !overflowsLeft) {
        setAlign("right");
      } else if (rect.left + rect.width / 2 > screenWidth / 2) {
        setAlign("right");
      } else {
        setAlign("left");
      }
    };

    updateAlign();
    window.addEventListener("resize", updateAlign);
    return () => window.removeEventListener("resize", updateAlign);
  }, [open]);

  // Check if current range corresponds to "Last 7 days"
  const today = new Date().toISOString().slice(0, 10);
  const d7 = new Date();
  d7.setDate(d7.getDate() - 6);
  const sevenDaysAgo = d7.toISOString().slice(0, 10);
  const is7Days = preset === "custom" && customFrom === sevenDaysAgo && customTo === today;

  const activeKey = is7Days ? "7d" : preset;
  const activeOption = PRESET_OPTIONS.find((o) => o.key === activeKey);
  const displayLabel = is7Days ? "Last 7 days" : activeOption?.label ?? (preset === "custom" ? "Custom range" : "Date range");

  // Draft inputs for custom date picking
  const [draftFrom, setDraftFrom] = useState(customFrom || range?.from || today);
  const [draftTo, setDraftTo] = useState(customTo || range?.to || today);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showCustomInputs, setShowCustomInputs] = useState(preset === "custom" && !is7Days);

  // Synchronize draft dates when range or customFrom/To changes
  useEffect(() => {
    if (customFrom) setDraftFrom(customFrom);
    else if (range?.from) setDraftFrom(range.from);

    if (customTo) setDraftTo(customTo);
    else if (range?.to) setDraftTo(range.to);
  }, [customFrom, customTo, range?.from, range?.to]);

  useEffect(() => {
    if (preset === "custom" && !is7Days) {
      setShowCustomInputs(true);
    }
  }, [preset, is7Days]);

  // Click outside and escape handling
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

  const handleSelectOption = (opt: PresetOption) => {
    setValidationError(null);
    if (opt.isCustom7Days) {
      setShowCustomInputs(false);
      onCustom({ from: sevenDaysAgo, to: today });
      setOpen(false);
    } else if (opt.presetValue === "custom") {
      setShowCustomInputs(true);
      if (preset !== "custom") {
        const from = range?.from ?? sevenDaysAgo;
        const to = range?.to ?? today;
        setDraftFrom(from);
        setDraftTo(to);
      }
    } else if (opt.presetValue) {
      setShowCustomInputs(false);
      onPreset(opt.presetValue);
      setOpen(false);
    }
  };

  const handleApplyCustom = () => {
    const error = rangeProblem(draftFrom, draftTo);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    onCustom({ from: draftFrom, to: draftTo });
    setOpen(false);
  };

  return (
    <div className={cn("relative inline-flex items-center gap-2", className)} ref={containerRef}>
      <button
        type="button"
        aria-label="Select date range"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-muted/60 focus:outline-hidden focus:ring-1 focus:ring-ring min-h-[36px] sm:min-h-[34px]",
          open && "bg-muted/80 ring-1 ring-ring"
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
        <span className="font-semibold text-foreground truncate">{displayLabel}</span>
        {range && (
          <span className="hidden sm:inline text-muted-foreground font-normal shrink-0">
            · {rangeLabel(range)}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Currency badge */}
      <span className="hidden sm:inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">
        {currency}
      </span>

      {/* Dropdown Popover */}
      {open && (
        <div
          role="dialog"
          aria-label="Select date range"
          className={cn(
            "absolute top-full mt-1.5 z-40 w-[calc(100vw-2rem)] sm:w-80 max-w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-3 shadow-xl text-card-foreground animate-in fade-in-0 zoom-in-95 max-h-[min(520px,calc(100vh-5rem))] overflow-y-auto",
            align === "right" ? "right-0 left-auto" : "left-0 right-auto"
          )}
        >
          <div className="flex items-center justify-between pb-2 mb-1 border-b border-border/80">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Date Range
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {currency}
            </span>
          </div>

          {/* Preset list */}
          <div className="space-y-0.5">
            {PRESET_OPTIONS.map((opt) => {
              const isSelected = activeKey === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleSelectOption(opt)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors text-left",
                    isSelected
                      ? "bg-muted font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-foreground shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Custom Date Form */}
          {showCustomInputs && (
            <div className="mt-2 pt-2 border-t border-border/80 space-y-2">
              <span className="block text-[11px] font-medium text-muted-foreground">
                Custom period (UTC)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 min-w-0">
                  <label htmlFor="profit-custom-from" className="block text-[10px] font-medium text-muted-foreground">
                    From
                  </label>
                  <input
                    id="profit-custom-from"
                    type="date"
                    value={draftFrom}
                    max={draftTo || undefined}
                    onChange={(e) => {
                      setDraftFrom(e.target.value);
                      setValidationError(null);
                    }}
                    className="w-full min-w-0 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <label htmlFor="profit-custom-to" className="block text-[10px] font-medium text-muted-foreground">
                    To
                  </label>
                  <input
                    id="profit-custom-to"
                    type="date"
                    value={draftTo}
                    min={draftFrom || undefined}
                    onChange={(e) => {
                      setDraftTo(e.target.value);
                      setValidationError(null);
                    }}
                    className="w-full min-w-0 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              {(validationError || rangeError) && (
                <p role="alert" className="text-[11px] text-destructive font-medium">
                  {validationError || rangeError}
                </p>
              )}

              <Button
                type="button"
                size="sm"
                className="w-full h-8 text-xs font-medium mt-1"
                onClick={handleApplyCustom}
              >
                Apply Range
              </Button>
            </div>
          )}

          {/* Compare toggle */}
          <div className="mt-2.5 pt-2 border-t border-border/80">
            <label className="flex items-center gap-2 cursor-pointer py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors select-none">
              <input
                type="checkbox"
                checked={compare}
                onChange={(e) => onCompare(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-foreground focus:ring-ring shrink-0"
              />
              <span className="leading-tight">Compare with previous period</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
