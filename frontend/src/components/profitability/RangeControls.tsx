import { Input } from "@/components/ui/input";
import { RANGE_PRESETS, type DateRange, type RangePreset } from "@/types/profitability";
import { PRESET_LABELS, rangeLabel } from "./profitFormat";

interface Props {
  preset: RangePreset;
  range: DateRange | null;
  rangeError: string | null;
  customFrom: string;
  customTo: string;
  compare: boolean;
  onPreset: (preset: RangePreset) => void;
  onCustom: (patch: { from?: string; to?: string }) => void;
  onCompare: (on: boolean) => void;
}

/** date range pills (each one a real from/to), a custom range and the compare-with-previous switch */
export function RangeControls({ preset, range, rangeError, customFrom, customTo, compare, onPreset, onCustom, onCompare }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Date range" className="inline-flex flex-wrap items-center rounded-lg border border-border bg-muted p-1">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={preset === p}
              onClick={() => onPreset(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${preset === p ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
          <input type="checkbox" checked={compare} onChange={(e) => onCompare(e.target.checked)} className="h-3.5 w-3.5" />
          Compare with the previous period
        </label>
        {range && <span className="text-xs text-muted-foreground">{rangeLabel(range)} (UTC days)</span>}
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="profit-from" className="block text-[11px] font-medium text-muted-foreground">
              From
            </label>
            <Input id="profit-from" type="date" value={customFrom} max={customTo || undefined} onChange={(e) => onCustom({ from: e.target.value })} error={Boolean(rangeError)} className="w-40" />
          </div>
          <div className="space-y-1">
            <label htmlFor="profit-to" className="block text-[11px] font-medium text-muted-foreground">
              To
            </label>
            <Input id="profit-to" type="date" value={customTo} min={customFrom || undefined} onChange={(e) => onCustom({ to: e.target.value })} error={Boolean(rangeError)} className="w-40" />
          </div>
          {rangeError && (
            <p role="alert" className="pb-2 text-xs text-destructive">
              {rangeError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
