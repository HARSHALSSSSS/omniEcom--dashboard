
import { Link } from "react-router-dom";
import type { OrderPipelineStage } from "@/types/dashboard";

interface OrderFlowSectionProps {
  stages: OrderPipelineStage[];
}

export const OrderFlowSection: React.FC<OrderFlowSectionProps> = ({
  stages,
}) => {
  return (
    <div className="w-full bg-white border border-[#EAEAEA] rounded-[12px] p-6 flex flex-col gap-6">
      {/* Section Introduction */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
            Order flow
          </h2>
          <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
            Today&apos;s operational pipeline
          </p>
        </div>

        <Link
          to="/orders"
          className="text-[12px] font-medium text-[#000000] hover:underline leading-[145%]"
        >
          View all orders →
        </Link>
      </div>

      {/* Pipeline Stages */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
        {stages.map((stage, idx) => {
          const isLast = idx === stages.length - 1;
          const isGreen = stage.indicatorColor === "green";

          return (
            <div key={stage.id} className="flex flex-col gap-2.5">
              {/* Stage label and arrow */}
              <div className="flex items-center justify-between h-[17px]">
                <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
                  {stage.label}
                </span>
                {!isLast && (
                  <span className="text-[13px] text-[#BDBDBD] font-normal select-none">
                    →
                  </span>
                )}
              </div>

              {/* Order Count */}
              <div className="text-[26px] font-semibold text-[#000000] leading-[120%] tracking-normal">
                {stage.count}
              </div>

              {/* Colored Indicator Line (height 3px, radius 2px) */}
              <div
                className={`h-[3px] w-full rounded-[2px] ${
                  isGreen ? "bg-[#16A34A]" : "bg-[#2563EB]"
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

