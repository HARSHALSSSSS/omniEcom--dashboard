import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { HorizonItem, InventorySignal, SignalRow, StockHealth } from "@/types/inventory";
import { InventoryThumb } from "./inventoryUi";
import { HEALTH_ICON, HEALTH_LABEL, SIGNAL_ICON, SIGNAL_LABEL, TONE_HEX, TONE_OF_HEALTH, sparkPath } from "./inventoryLabels";

const HORIZON_GRID = "grid grid-cols-[minmax(240px,1.4fr)_80px_90px_minmax(280px,2fr)_80px_minmax(180px,1.2fr)] items-center";

const colorOf = (health: StockHealth) => TONE_HEX[TONE_OF_HEALTH[health]];

function HorizonRow({ item, scaleMax, onOpen }: { item: HorizonItem; scaleMax: number; onOpen: (variantId: string) => void }) {
  const color = colorOf(item.health);
  const StatusIcon = HEALTH_ICON[item.health];
  const hasCover = item.coverDays !== null && item.stock > 0;
  const cover = item.stock === 0 ? 0 : (item.coverDays ?? 0);
  const fillPct = Math.min(cover / scaleMax, 1) * 100;
  const leadPct = Math.min(item.leadTimeDays / scaleMax, 1) * 100;
  const coverText = item.stock === 0 ? "0 days" : item.coverDays === null ? "No sales data" : `${formatNumber(Math.round(item.coverDays))} days`;
  const textColor = item.stock === 0 || hasCover ? color : "#737373";
  const open = () => onOpen(item.variantId);

  return (
    <li className={cn(HORIZON_GRID, "w-full py-4")}>
      <div className="flex flex-row items-center gap-3 pr-4">
        <InventoryThumb url={item.thumbnailUrl} title={item.title} size={40} className="shadow-sm" />
        <div className="flex min-w-0 flex-col items-start">
          <button type="button" onClick={open} className="max-w-full truncate bg-transparent p-0 text-left text-[13px] font-semibold leading-snug text-[#111111] hover:underline">
            {item.title}
          </button>
          <span className="mt-0.5 text-[11px] text-[#737373]">{item.sku}</span>
        </div>
      </div>

      <span className="text-[13px] font-semibold text-[#111111]">{formatNumber(item.stock)}</span>
      <span className="text-[13px] font-normal text-[#111111]" title="Units sold per day">
        {item.unitsPerDay > 0 ? formatNumber(Math.round(item.unitsPerDay * 10) / 10) : "—"}
      </span>

      <div className="flex w-full max-w-[320px] flex-col items-start pr-8">
        <span style={{ color: textColor }} className="mb-1 text-[12px] font-semibold">
          {coverText}
        </span>
        <div className="relative h-[22px] w-full">
          <div className="absolute left-0 top-[2px] h-[2.5px] w-full rounded-full bg-[#F2F2F2]" />
          {fillPct > 0 && <div style={{ width: `${fillPct}%`, backgroundColor: color }} className="absolute left-0 top-[2px] h-[2.5px] rounded-full" />}
          {(hasCover || item.stock === 0) && <div style={{ left: fillPct === 0 ? "0px" : `calc(${fillPct}% - 1px)`, backgroundColor: color }} className="absolute top-0 h-[7px] w-[2px] rounded-sm" title={coverText} />}
          <div style={{ left: `calc(${leadPct}% - 0.75px)` }} className="absolute top-0 h-[9px] w-[1.5px] bg-[#555555]" title={`${item.leadTimeDays}d lead`} />
          <div className="absolute left-0 top-[10px] flex w-full flex-row items-center text-[10px] text-[#888888]">
            {leadPct >= 16 && <span>0</span>}
            <span
              style={{
                position: "absolute",
                left: `${leadPct}%`,
                transform: leadPct < 16 ? (leadPct < 6 ? "none" : "translateX(-25%)") : leadPct > 82 ? "translateX(-100%)" : "translateX(-50%)",
              }}
              className="whitespace-nowrap text-[#555555]"
            >
              {item.leadTimeDays}d lead
            </span>
            {leadPct <= 82 && <span className="ml-auto">{scaleMax}d</span>}
          </div>
        </div>
      </div>

      <span className="text-[13px] font-normal text-[#111111]" title={item.leadTimeSource === "default" ? "The business default lead time" : "Lead time of this product"}>
        {item.leadTimeDays}d
      </span>

      <div className="flex flex-col items-start gap-0.5">
        <div className="flex flex-row items-center gap-1.5">
          <StatusIcon style={{ color }} className="h-3.5 w-3.5 stroke-[2px]" aria-hidden />
          <span style={{ color }} className="text-[12px] font-medium">
            {HEALTH_LABEL[item.health]}
          </span>
        </div>
        <button type="button" onClick={open} className={cn("mt-0.5 bg-transparent p-0 text-left text-[12px] hover:underline", item.health === "attention" ? "text-[#444444]" : "text-[#111111]")}>
          {item.health === "attention" ? item.action.label : `${item.action.label} →`}
        </button>
      </div>
    </li>
  );
}

interface StockHorizonProps {
  items: HorizonItem[] | undefined;
  scaleMax: number;
  onOpen: (variantId: string) => void;
}

/** "Stock Horizon": coverage against lead time for the products closest to trouble (GET /inventory/overview -> horizon). */
export function StockHorizon({ items, scaleMax, onOpen }: StockHorizonProps) {
  return (
    <section aria-label="Stock Horizon" className="flex min-w-0 flex-1 flex-col items-start">
      <div className="mb-4 flex w-full flex-row flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[20px] font-semibold tracking-tight text-[#111111]">Stock Horizon</h2>
        <span className="text-[12px] font-normal text-[#737373]">Coverage against replenishment lead time</span>
      </div>
      <div className="w-full overflow-x-auto">
        <div className="min-w-[860px]">
          <div className={cn(HORIZON_GRID, "border-b border-[#EAEAEA] pb-2.5 pt-1 text-[11px] font-medium uppercase tracking-wider text-[#737373]")}>
            <span>PRODUCT / SKU</span>
            <span>STOCK</span>
            <span>AVG / DAY</span>
            <span>COVERAGE</span>
            <span>LEAD</span>
            <span>HEALTH / ACTION</span>
          </div>
          {!items ? (
            <div className="space-y-3 py-4" role="status" aria-label="Loading stock horizon">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-[12px] text-[#737373]">No product has stock to measure yet.</p>
          ) : (
            <ul className="m-0 flex w-full list-none flex-col items-start divide-y divide-[#EAEAEA] p-0">
              {items.map((item) => (
                <HorizonRow key={item.variantId} item={item} scaleMax={scaleMax} onOpen={onOpen} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

interface SignalsRailProps {
  signals: SignalRow[] | undefined;
  active: InventorySignal | undefined;
  onSelect: (signal: InventorySignal | null) => void;
}

/** "Inventory signals": counts per signal with a 7-day waveform; a click filters the ledger by that signal. */
export function SignalsRail({ signals, active, onSelect }: SignalsRailProps) {
  return (
    <section aria-label="Inventory signals" className="flex w-full flex-col items-start lg:w-[300px] lg:shrink-0 lg:border-l lg:border-[#EAEAEA] lg:pl-8">
      <div className="mb-4 flex w-full flex-row items-baseline justify-between">
        <h2 className="m-0 text-[20px] font-semibold tracking-tight text-[#111111]">Inventory signals</h2>
      </div>
      {!signals ? (
        <div className="w-full space-y-3" role="status" aria-label="Loading signals">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : (
        <ul className="m-0 flex w-full list-none flex-col items-start divide-y divide-[#F0F0F0] p-0">
          {signals.map((sig) => {
            const Icon = SIGNAL_ICON[sig.key];
            const color = TONE_HEX[sig.tone];
            const path = sig.trend ? sparkPath(sig.trend) : "";
            const on = active === sig.key;
            return (
              <li key={sig.key} className="w-full">
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${SIGNAL_LABEL[sig.key]}: ${sig.count}`}
                  onClick={() => onSelect(on ? null : sig.key)}
                  className={cn("group flex w-full flex-row items-center gap-2.5 py-3 text-left transition-colors hover:bg-neutral-50/70", on && "bg-neutral-50")}
                >
                  <span className="w-5 shrink-0 text-[13px] font-semibold text-[#111111]">{formatNumber(sig.count)}</span>
                  <Icon className="h-3.5 w-3.5 shrink-0 stroke-[1.75px] text-[#555555]" aria-hidden />
                  <span className="flex-1 truncate text-[13px] font-normal text-[#111111]">{SIGNAL_LABEL[sig.key]}</span>
                  <svg className="h-3.5 w-7 shrink-0" viewBox="0 0 28 14" fill="none" aria-hidden>
                    {path && <path d={path} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
                  </svg>
                  <span style={{ backgroundColor: color }} className="mx-0.5 h-3.5 w-[2.5px] shrink-0 rounded-full" aria-hidden />
                  <span className="shrink-0 text-[13px] leading-none text-[#888888] transition-colors group-hover:text-black" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
