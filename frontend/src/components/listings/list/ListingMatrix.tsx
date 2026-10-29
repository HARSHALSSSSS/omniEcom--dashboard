import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { formatNumber } from "@/utils/format";
import type { ListingsMatrix, MatrixStatus } from "@/types/listing";
import { STATUS_COLOR, STATUS_LABEL, cellSublabel } from "./listingFormat";

const LEGEND: Array<{ color: string; label: string }> = [
  { color: STATUS_COLOR.live, label: "Live / Ready" },
  { color: STATUS_COLOR.needs_review, label: "Needs review" },
  { color: STATUS_COLOR.blocked, label: "Blocked / Failed" },
  { color: STATUS_COLOR.syncing, label: "Syncing" },
  { color: "#EAEAEA", label: "Not listed" },
];

/** a connecting line is dashed towards a marketplace the product is not on */
const lineStyle = (status: MatrixStatus): React.CSSProperties =>
  status === "not_listed" ? { borderTop: `1px dashed ${STATUS_COLOR.not_listed}` } : { backgroundColor: STATUS_COLOR[status] };

/** master product -> channel listing -> marketplace: where each product stands on every connected channel */
export function ListingMatrix({ matrix, onShowMore, onShowFewer, loading }: { matrix: ListingsMatrix; onShowMore?: () => void; onShowFewer?: () => void; loading?: boolean }) {
  const { channels, items } = matrix;
  return (
    <section aria-label="Listing matrix" className="w-full overflow-hidden rounded-md border border-[#EAEAEA] bg-white">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="flex h-9 flex-row items-center bg-[#F5F5F5] px-4 text-[11px] font-medium text-[#666666]">
            <div className="w-[240px] shrink-0">MASTER CATALOG</div>
            {channels.map((c) => (
              <div key={c.code} className="flex min-w-[120px] flex-1 items-center justify-center gap-1.5 uppercase">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.connected ? "#16A34A" : "#D97706" }} title={c.connected ? "Connected" : "Needs attention"} />
                {c.name}
              </div>
            ))}
            <div className="flex w-[100px] shrink-0 items-center justify-center">ACTION</div>
          </div>

          <div className="divide-y divide-[#EAEAEA]">
            {items.map((row) => (
              <div key={row.productId} className="relative flex h-[76px] flex-row items-center px-4 transition-colors hover:bg-[#FAFAFA]">
                <div className="absolute left-0 top-3 h-8 w-[2px]" style={{ backgroundColor: STATUS_COLOR[row.signal] }} />

                <div className="z-10 flex w-[240px] shrink-0 flex-col justify-center gap-0.5 pr-2">
                  <span className="truncate text-[13px] font-semibold leading-4 text-[#000000]" title={row.title}>
                    {row.title}
                  </span>
                  <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
                    {row.sku} · {row.variantsCount} {row.variantsCount === 1 ? "variant" : "variants"}
                  </span>
                </div>

                {channels.map((c, i) => {
                  const cell = row.channels[c.code] ?? { status: "not_listed" as const, listings: 0, listedVariants: 0, byStatus: {} };
                  const color = STATUS_COLOR[cell.status];
                  const nextChannel = channels[i + 1];
                  const next = nextChannel ? (row.channels[nextChannel.code]?.status ?? "not_listed") : null;
                  return (
                    <div key={c.code} className="relative z-10 flex h-full min-w-[120px] flex-1 flex-col items-center justify-center">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                        <div className="flex flex-col items-start leading-none">
                          <span className="text-[12px] font-medium leading-[15px]" style={{ color: cell.status === "not_listed" ? "#666666" : color }}>
                            {STATUS_LABEL[cell.status]}
                          </span>
                          <span className="mt-0.5 text-[10px] font-normal leading-3 text-[#666666]">{cellSublabel(cell, row.variantsCount)}</span>
                        </div>
                      </div>

                      <div className="pointer-events-none absolute bottom-[14px] left-0 right-0 flex items-center justify-center">
                        <div className="absolute left-0 h-[1px] w-1/2" style={i === 0 ? { backgroundColor: STATUS_COLOR[row.signal] } : lineStyle(cell.status)} />
                        {next && <div className="absolute left-1/2 h-[1px] w-1/2" style={lineStyle(next)} />}
                        <div className="z-20 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      </div>
                    </div>
                  );
                })}

                <div className="z-10 flex w-[100px] shrink-0 items-center justify-center">
                  <Link to={`${ROUTES.PRODUCTS}/${row.productId}`} className="text-[12px] font-semibold text-[#000000] hover:underline">
                    Manage →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 sm:gap-4 border-t border-[#EAEAEA] bg-[#FFFFFF] px-4 py-2 text-[10px] font-normal text-[#666666]">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          {LEGEND.map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: l.color }} />
              <span>{l.label}</span>
            </div>
          ))}
        </div>
        <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-3 text-[#666666]">
          <span>
            Showing {items.length} of {formatNumber(matrix.total)} master products · Master Product → Channel Listing → Marketplace
          </span>
          {onShowMore && items.length < matrix.total && (
            <button type="button" onClick={onShowMore} disabled={loading} className="min-h-[44px] sm:min-h-0 inline-flex items-center cursor-pointer text-[11px] font-semibold text-[#000000] hover:underline disabled:cursor-wait disabled:opacity-60">
              {loading ? "Loading…" : "Show more products"}
            </button>
          )}
          {onShowFewer && (
            <button type="button" onClick={onShowFewer} className="min-h-[44px] sm:min-h-0 inline-flex items-center cursor-pointer text-[11px] font-medium text-[#666666] hover:text-[#000000] hover:underline">
              Show fewer
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
