import { formatNumber } from "@/utils/format";
import type { OrdersWorkspace } from "@/types/orders";

const SOURCE_SHADES = ["bg-[#525252]", "bg-[#888888]", "bg-[#BDBDBD]", "bg-[#DDDDDD]"];

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** orders placed in the last day, per marketplace (GET /orders/workspace `sources`) */
export function OrderSources({ workspace }: { workspace: OrdersWorkspace }) {
  const { sources } = workspace;
  return (
    <div className="box-border flex flex-col items-start lg:pr-5 gap-[10px] w-full lg:w-[372px] shrink-0 lg:border-r border-[#EAEAEA]">
      <div className="w-full flex flex-row justify-between items-center min-h-[17px]">
        <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">Order sources</span>
        <span className="text-[11px] font-normal leading-[145%] text-[#666666]">
          {plural(sources.total, "order", "orders")} · last {sources.windowHours} h
        </span>
      </div>

      {sources.items.length === 0 ? (
        <p className="text-[11px] leading-[145%] text-[#666666]">No orders arrived in the last {sources.windowHours} hours.</p>
      ) : (
        <>
          <div className="w-full flex flex-row items-start gap-[3px] h-[8px]" aria-hidden>
            {sources.items.map((s, i) => (
              <div
                key={s.channel.code}
                className={`h-[8px] ${SOURCE_SHADES[Math.min(i, SOURCE_SHADES.length - 1)]} ${i === 0 ? "rounded-l-[2px]" : ""} ${i === sources.items.length - 1 ? "rounded-r-[2px]" : ""}`}
                style={{ width: `${Math.max(s.sharePct, 2)}%` }}
                title={`${s.channel.name}: ${s.sharePct}%`}
              />
            ))}
          </div>

          <div className="w-full flex flex-row flex-wrap items-start gap-[10px]">
            {sources.items.map((s) => (
              <div key={s.channel.code} className="flex-1 min-w-[72px] flex flex-col items-start gap-1">
                <div className="flex flex-row items-center gap-1 min-h-[14px]">
                  <div className="flex items-center justify-center w-[14px] h-[14px] bg-[#F5F5F5] rounded-[3px]">
                    <span className="text-[9px] font-semibold text-[#000000] leading-none">{s.channel.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="text-[11px] font-normal leading-[13px] text-[#666666]">{s.channel.name}</span>
                </div>
                <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">
                  {formatNumber(s.orders)} · {s.sharePct}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface SlaPressureProps {
  workspace: OrdersWorkspace;
  onReview: () => void;
}

/** the four dispatch-deadline bands with their thresholds, and a way into the at-risk orders (GET /orders/workspace `slaPressure`) */
export function SlaPressure({ workspace, onReview }: SlaPressureProps) {
  const p = workspace.slaPressure;
  const urgent = p.atRisk.orders + p.breached.orders;
  return (
    <div className="flex-1 w-full flex flex-col items-start gap-[6px]">
      <div className="w-full flex flex-row flex-wrap justify-between items-start gap-x-4 min-h-[17px]">
        <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">SLA Pressure</span>
        <span className="text-[11px] font-normal leading-[145%] text-[#666666]">Time remaining → Dispatch deadline → Overdue</span>
      </div>

      <div className="w-full flex flex-row items-start gap-3 min-h-[39px]">
        <div className="box-border flex-1 flex flex-col items-start px-2 py-[3px] gap-[1px] min-h-[39px] bg-[#F5F5F5] border-b-2 border-[#666666] rounded-t-[2px]">
          <span className="text-[11px] font-normal leading-[13px] text-[#666666]">Safe</span>
          <span className="text-[11px] font-semibold leading-[13px] text-[#666666]">{plural(p.safe.orders, "order", "orders")}</span>
        </div>
        <div className="box-border flex-1 flex flex-col items-start px-2 py-[3px] gap-[1px] min-h-[39px] bg-[#FFFBF5] border-b-2 border-[#D97706] rounded-t-[2px]">
          <span className="text-[11px] font-normal leading-[13px] text-[#D97706]">Approaching deadline</span>
          <span className="text-[11px] font-semibold leading-[13px] text-[#D97706]">{plural(p.approaching.orders, "order", "orders")}</span>
        </div>
        <div className="box-border flex-[0.7] flex flex-col items-start px-2 py-[3px] gap-[1px] min-h-[39px] bg-[#FFFBF5] border-b-2 border-[#D97706] rounded-t-[2px]">
          <span className="text-[11px] font-normal leading-[13px] text-[#D97706]">At risk</span>
          <span className="text-[11px] font-semibold leading-[13px] text-[#D97706]">{plural(p.atRisk.orders, "order", "orders")}</span>
        </div>
        <div className="box-border flex-[0.6] flex flex-col items-start px-2 py-[3px] gap-[1px] min-h-[39px] bg-[#FEF2F2] border-b-2 border-[#DC2626] rounded-t-[2px]">
          <span className="text-[11px] font-normal leading-[13px] text-[#DC2626]">Breached</span>
          <span className="text-[11px] font-semibold leading-[13px] text-[#DC2626]">{plural(p.breached.orders, "order", "orders")}</span>
        </div>
      </div>

      <div className="w-full flex flex-row items-start gap-3 min-h-[12px]">
        <span className="flex-1 text-[10px] font-normal leading-[12px] text-[#666666]">{sentence(p.safe.hint)}</span>
        <span className="flex-1 text-[10px] font-normal leading-[12px] text-[#666666]">{sentence(p.approaching.hint)}</span>
        <span className="flex-[0.7] text-[10px] font-normal leading-[12px] text-[#D97706]">{sentence(p.atRisk.hint)}</span>
        <span className="flex-[0.6] text-[10px] font-normal leading-[12px] text-[#DC2626]">{sentence(p.breached.hint)}</span>
      </div>

      {urgent > 0 && (
        <div role="alert" className="w-full flex flex-row flex-wrap justify-between items-center gap-x-4 min-h-[13px] pt-1">
          <span className="text-[11px] font-normal leading-[13px] text-[#666666]">
            {p.summary}
            {p.breached.orders > 0 ? ` ${plural(p.breached.orders, "order is", "orders are")} already past the deadline.` : ""}
          </span>
          <button type="button" onClick={onReview} className="text-[11px] font-semibold leading-[13px] text-[#D97706] hover:underline cursor-pointer">
            Review at-risk orders →
          </button>
        </div>
      )}
    </div>
  );
}
