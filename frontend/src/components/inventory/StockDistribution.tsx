import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/utils/format";
import type { InventoryOverview } from "@/types/inventory";

interface StockDistributionProps {
  distribution: NonNullable<InventoryOverview["distribution"]> | undefined;
  loading: boolean;
}

/** "Stock distribution": the share of available units per warehouse (warehouse mode only). GET /inventory/overview -> distribution. */
export function StockDistribution({ distribution, loading }: StockDistributionProps) {
  if (!loading && (!distribution || distribution.byWarehouse.length === 0)) return null;
  const rows = [...(distribution?.byWarehouse ?? [])].sort((a, b) => b.units - a.units);
  const maxShare = Math.max(...rows.map((r) => r.sharePct), 1);
  const insight = distribution?.insight ?? null;
  const others = insight ? rows.filter((r) => r.warehouseId !== insight.warehouseId).map((r) => r.name) : [];

  return (
    <section aria-label="Stock distribution" className="flex w-full flex-col items-start gap-3">
      <div className="flex min-h-[26px] w-full flex-row flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[18px] font-semibold leading-[145%] text-[#000000]">Stock distribution</h2>
        <span className="text-[12px] font-normal leading-[145%] text-[#666666]">Distribution across warehouse locations · Available units</span>
      </div>

      {loading && !distribution ? (
        <Skeleton className="h-[112px] w-full" role="status" aria-label="Loading stock distribution" />
      ) : (
        <div className="flex w-full flex-col items-start gap-8 lg:min-h-[112px] lg:flex-row">
          <div className="relative isolate flex min-h-[112px] w-full flex-1 flex-row flex-wrap items-center gap-6">
            <div className="absolute left-0 right-0 top-[56px] z-0 hidden h-[1px] bg-[#BDBDBD] lg:block" />
            {rows.map((r) => {
              const size = Math.round(44 + (r.sharePct / maxShare) * 26);
              return (
                <div key={r.warehouseId} className="z-10 flex flex-1 flex-row items-center gap-3 sm:max-w-[260px]">
                  <div style={{ width: size, height: size }} className="box-border flex shrink-0 items-center justify-center rounded-full border border-[#BDBDBD] bg-white">
                    <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">{Math.round(r.sharePct)}%</span>
                  </div>
                  <div className="flex flex-col items-start gap-[5px] bg-white p-1">
                    <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">{r.name}</span>
                    <span className="text-[12px] font-normal leading-[145%] text-[#666666]">{formatNumber(r.units)} units</span>
                  </div>
                </div>
              );
            })}
          </div>

          {insight && (
            <div className="box-border flex w-full shrink-0 flex-col items-start gap-2 border-[#EAEAEA] pt-3.5 lg:w-[300px] lg:border-l lg:pl-5">
              <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">{insight.text}</span>
              {others.length > 0 && <span className="text-[12px] font-normal leading-[145%] text-[#666666]">Advisory: verify {others.join(" and ")} replenishments.</span>}
            </div>
          )}
        </div>
      )}

      <span className="text-[12px] font-normal leading-[145%] text-[#666666]">Distribution is unified across master inventory. Real-time ledger updates as shipments move between facilities.</span>
      <div className="mt-1 h-[1px] w-full bg-[#EAEAEA]" />
    </section>
  );
}
