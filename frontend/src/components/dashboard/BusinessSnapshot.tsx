
import type { BusinessMetric } from "@/types/dashboard";

interface BusinessSnapshotProps {
  metrics: BusinessMetric[];
}

export const BusinessSnapshot: React.FC<BusinessSnapshotProps> = ({
  metrics,
}) => {
  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-semibold text-[#000000] leading-[26px]">
          Business snapshot
        </h2>
        <span className="text-[12px] font-medium text-[#666666]">Today</span>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 border border-[#EAEAEA] rounded-xl bg-white divide-y md:divide-y-0 md:divide-x divide-[#EAEAEA] overflow-hidden">
        {metrics.map((metric) => (
          <div
            key={metric.id}
            className="flex flex-col justify-between p-5 md:py-5 md:px-6 gap-2"
          >
            <span className="text-[12px] text-[#666666]">{metric.label}</span>
            <span className="text-[28px] font-semibold leading-[34px] text-[#000000] tracking-tight">
              {metric.value}
            </span>
            <span
              className={
                metric.trend === "up"
                  ? "text-[11px] text-[#16A34A] font-medium"
                  : metric.trend === "down"
                    ? "text-[11px] text-[#16A34A] font-medium" // Return rate down is good in commerce
                    : "text-[11px] text-[#666666]"
              }
            >
              {metric.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
