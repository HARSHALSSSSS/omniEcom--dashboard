import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/utils/format";
import type { InventoryOverview } from "@/types/inventory";

const BUCKETS = [
  { key: "available", label: "Available", dot: "#242424", bar: "#16A34A" },
  { key: "reserved", label: "Reserved", dot: "#737373", bar: "#D9BD06" },
  { key: "incoming", label: "Incoming", dot: "#0C41D1", bar: "#0C41D1" },
  { key: "returned", label: "Returned", dot: "#D4D4D4", bar: "#D4D4D4" },
  { key: "damaged", label: "Damaged", dot: "#DC2626", bar: "#DC2626" },
  { key: "quarantined", label: "Quarantined", dot: "#D97706", bar: "#D97706" },
] as const;

interface StockPulseProps {
  pulse: InventoryOverview["pulse"] | undefined;
  /** "₹1.25L" at cost, from the KPI call (empty while it loads) */
  valuation: string | null;
}

/** "The stock pulse": the six stock buckets as numbers and as one proportional bar. All values come from GET /inventory/overview. */
export function StockPulse({ pulse, valuation }: StockPulseProps) {
  const master = pulse ? pulse.available + pulse.reserved : null;
  const total = pulse ? BUCKETS.reduce((sum, b) => sum + pulse[b.key], 0) : 0;
  return (
    <section aria-label="The stock pulse" className="flex w-full flex-col items-start gap-[14px]">
      <div className="flex min-h-[26px] w-full flex-row flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[18px] font-semibold leading-[145%] text-[#000000]">The stock pulse</h2>
        <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
          {master === null ? <Skeleton className="h-3 w-28" /> : `Master stock: ${formatNumber(master)}`}
          {valuation && ` · Valued at ${valuation} (cost)`}
        </span>
      </div>

      <div className="flex w-full flex-row flex-wrap items-start justify-between gap-x-6 gap-y-3">
        {BUCKETS.map((b) => (
          <div key={b.key} className="flex flex-col items-start gap-[3px]">
            <div className="flex h-[17px] flex-row items-center gap-1.5">
              <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ backgroundColor: b.dot }} />
              <span className="text-[12px] font-normal leading-[145%] text-[#666666]">{b.label}</span>
            </div>
            <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">{pulse ? formatNumber(pulse[b.key]) : <Skeleton className="h-3 w-10" />}</span>
          </div>
        ))}
      </div>

      <div className="flex h-[14px] w-full flex-row items-start gap-[2px] overflow-hidden rounded-[3px] bg-[#F2F2F2]" role="img" aria-label="Stock composition">
        {pulse &&
          total > 0 &&
          BUCKETS.filter((b) => pulse[b.key] > 0).map((b) => (
            <div key={b.key} style={{ flex: String(pulse[b.key]), backgroundColor: b.bar }} className="h-[14px]" title={`${b.label}: ${formatNumber(pulse[b.key])}`} />
          ))}
      </div>

      <div className="flex w-full flex-row flex-wrap items-start justify-between gap-2">
        <span className="text-[12px] font-normal leading-[145%] text-[#666666]">Available units are actively synced across live marketplace connections.</span>
        <span className="text-[12px] font-normal leading-[145%] text-[#666666]">Reserved + Damaged + Quarantined withheld automatically.</span>
      </div>
    </section>
  );
}
