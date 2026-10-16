
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
      <div className="flex items-center justify-between h-[26px]">
        <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
          Business snapshot
        </h2>
        <span className="text-[12px] font-medium text-[#000000] leading-[145%]">
          Today
        </span>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 border border-[#EAEAEA] rounded-[12px] bg-white divide-y md:divide-y-0 md:divide-x divide-[#EAEAEA] overflow-hidden min-h-[123px]">
        {metrics.map((metric) => (
          <div
            key={metric.id}
            className="flex flex-col justify-between p-[20px_24px] gap-2"
          >
            <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
              {metric.label}
            </span>
            <span className="text-[28px] font-semibold leading-[120%] text-[#000000] tracking-normal">
              {metric.value}
            </span>
            <span className="text-[11px] font-normal leading-[145%] text-[#666666]">
              {metric.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

