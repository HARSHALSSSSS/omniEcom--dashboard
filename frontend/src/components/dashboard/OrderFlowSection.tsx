import { Link } from "react-router-dom";
import { DONE_STAGES, STAGE_LABELS } from "@/constants/dashboard.data";
import { ROUTES } from "@/constants/routes";
import { formatNumber } from "@/utils/format";
import type { Dashboard } from "@/types/dashboard";

interface OrderFlowSectionProps {
  stages: NonNullable<Dashboard["orderFlow"]>;
}

export const OrderFlowSection: React.FC<OrderFlowSectionProps> = ({ stages }) => {
  const empty = stages.every((s) => s.count === 0);
  return (
    <section
      aria-labelledby="order-flow-title"
      className="w-full bg-white border border-[#EAEAEA] rounded-[12px] p-4 sm:p-6 flex flex-col gap-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div className="flex flex-col gap-1">
          <h2 id="order-flow-title" className="text-[18px] font-semibold text-[#000000] leading-[145%]">
            Order flow
          </h2>
          <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
            {empty ? "No orders placed today yet" : "Today’s operational pipeline"}
          </p>
        </div>

        <Link to={ROUTES.ORDERS} className="text-[12px] font-medium text-[#000000] hover:underline leading-[145%] min-h-[44px] sm:min-h-0 flex items-center">
          View all orders →
        </Link>
      </div>

      <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
        {stages.map(({ stage, count }, idx) => (
          <li key={stage} className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between h-[17px]">
              <span className="text-[12px] font-normal text-[#666666] leading-[145%] truncate">{STAGE_LABELS[stage]}</span>
              {idx < stages.length - 1 && (
                <span aria-hidden="true" className="text-[13px] text-[#BDBDBD] font-normal select-none">
                  →
                </span>
              )}
            </div>
            <div className="text-[22px] sm:text-[26px] font-semibold text-[#000000] leading-[120%] tracking-normal">
              {formatNumber(count)}
            </div>
            <div className={`h-[3px] w-full rounded-[2px] ${DONE_STAGES.has(stage) ? "bg-[#16A34A]" : "bg-[#2563EB]"}`} />
          </li>
        ))}
      </ol>
    </section>
  );
};
