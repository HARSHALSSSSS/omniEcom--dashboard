import { METRIC_LABELS } from "@/constants/dashboard.data";
import type { DashboardMetric } from "@/types/dashboard";
import { metricChange, metricValue } from "./format";

interface BusinessSnapshotProps {
  metrics: DashboardMetric[];
}

const COLUMNS: Record<number, string> = { 4: "md:grid-cols-4", 5: "md:grid-cols-5" };

export const BusinessSnapshot: React.FC<BusinessSnapshotProps> = ({ metrics }) => (
  <section aria-labelledby="snapshot-title" className="flex flex-col gap-3 w-full">
    <div className="flex items-center justify-between h-[26px]">
      <h2 id="snapshot-title" className="text-[18px] font-semibold text-[#000000] leading-[145%]">
        Business snapshot
      </h2>
      <span className="text-[12px] font-medium text-[#000000] leading-[145%]">Today</span>
    </div>

    <div
      className={`grid grid-cols-2 ${COLUMNS[metrics.length] ?? "md:grid-cols-4"} border border-[#EAEAEA] rounded-[12px] bg-white divide-y md:divide-y-0 md:divide-x divide-[#EAEAEA] overflow-hidden min-h-[123px]`}
    >
      {metrics.map((metric) => (
        <div key={metric.key} className="flex flex-col justify-between p-[20px_24px] gap-2 min-w-0">
          <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
            {METRIC_LABELS[metric.key] ?? metric.key}
          </span>
          <span className="text-[28px] font-semibold leading-[120%] text-[#000000] tracking-normal truncate">
            {metricValue(metric)}
          </span>
          <span className="text-[11px] font-normal leading-[145%] text-[#666666]">{metricChange(metric)}</span>
        </div>
      ))}
    </div>
  </section>
);
