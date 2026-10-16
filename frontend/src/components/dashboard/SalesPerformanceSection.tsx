import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type {
  SalesHistoryPoint,
  ChannelContributionItem,
} from "@/types/dashboard";

interface SalesPerformanceSectionProps {
  history: SalesHistoryPoint[];
  channels: ChannelContributionItem[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  label,
}) => {
  if (active && payload && payload.length) {
    const rev = payload.find((p) => p.dataKey === "revenue")?.value ?? 0;
    const prevRev =
      payload.find((p) => p.dataKey === "previousRevenue")?.value ?? 0;

    return (
      <div className="relative rounded-lg bg-white px-3.5 py-3 shadow-[0px_4px_15px_rgba(0,0,0,0.1)] text-[#191F28] text-[12px] space-y-1.5 min-w-[170px] border border-neutral-100">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#4C5A6E] shrink-0" />
          <span className="font-normal text-[12px] leading-[15px] text-[#191F28]">
            {label}: ₹{prevRev.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#5183F4] shrink-0" />
          <span className="font-normal text-[12px] leading-[15px] text-[#191F28]">
            {label}: ₹{rev.toLocaleString()}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export const SalesPerformanceSection: React.FC<
  SalesPerformanceSectionProps
> = ({ history, channels }) => {
  const [selectedRange, setSelectedRange] = useState<"7d" | "30d" | "90d">(
    "30d",
  );

  return (
    <div className="w-full bg-[#FAFAFA] border border-[#EAEAEA] rounded-[12px] p-6 flex flex-col gap-7">
      {/* Performance Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
            Sales performance
          </h2>
          <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
            Track how your business is performing across connected channels.
          </p>
        </div>

        {/* Date range toggle: background #E6F4FF, radius 8px, items 72px width x 30px height */}
        <div className="inline-flex items-center rounded-[8px] bg-[#E6F4FF] p-1 gap-1">
          <button
            type="button"
            onClick={() => setSelectedRange("7d")}
            className={`w-[72px] h-[30px] rounded-[8px] border text-[12px] font-semibold transition-all flex items-center justify-center leading-[145%] ${
              selectedRange === "7d"
                ? "bg-[#DBEAFE] border-[#BFDBFE] text-[#000000]"
                : "bg-[#E6F4FF] border-[#BFDBFE] text-[#000000] hover:bg-[#d5e9fc]"
            }`}
          >
            7 days
          </button>
          <button
            type="button"
            onClick={() => setSelectedRange("30d")}
            className={`w-[72px] h-[30px] rounded-[8px] border text-[12px] font-semibold transition-all flex items-center justify-center leading-[145%] ${
              selectedRange === "30d"
                ? "bg-[#DBEAFE] border-[#BFDBFE] text-[#000000]"
                : "bg-[#E6F4FF] border-[#BFDBFE] text-[#000000] hover:bg-[#d5e9fc]"
            }`}
          >
            30 days
          </button>
          <button
            type="button"
            onClick={() => setSelectedRange("90d")}
            className={`w-[72px] h-[30px] rounded-[8px] border text-[12px] font-semibold transition-all flex items-center justify-center leading-[145%] ${
              selectedRange === "90d"
                ? "bg-[#DBEAFE] border-[#BFDBFE] text-[#000000]"
                : "bg-[#E6F4FF] border-[#BFDBFE] text-[#000000] hover:bg-[#d5e9fc]"
            }`}
          >
            90 days
          </button>
        </div>
      </div>

      {/* Revenue and Channels Area */}
      <div className="flex flex-col lg:flex-row items-stretch gap-8">
        {/* Left: Revenue History with Dark Chart */}
        <div className="flex-1 flex flex-col gap-5 min-w-0">
          {/* Chart Legend */}
          <div className="flex items-center gap-5 text-[11px] h-4">
            <div className="flex items-center gap-2">
              <span className="w-[18px] h-[2px] bg-[#000000]" />
              <span className="font-normal text-[11px] leading-[145%] text-[#000000]">
                Revenue
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[18px] h-[2px] border-t-[1.5px] border-dashed border-[#A3A3A3]" />
              <span className="font-normal text-[11px] leading-[145%] text-[#666666]">
                Previous period
              </span>
            </div>
            <span className="text-[10px] font-normal leading-[145%] text-[#666666]">
              Daily revenue · INR
            </span>
          </div>

          {/* Daily Revenue Chart Card (background #191F28, radius 20px, height 325px) */}
          <div className="w-full bg-[#191F28] rounded-[20px] p-6 shadow-md relative h-[325px] flex flex-col justify-end">
            <ResponsiveContainer width="100%" height={265}>
              <LineChart
                data={history}
                margin={{ top: 15, right: 25, left: -10, bottom: 5 }}
              >
                <CartesianGrid
                  stroke="#2E3B4F"
                  strokeWidth={2}
                  strokeDasharray="0"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="#B6B6B6"
                  tick={{ fill: "#B6B6B6", fontSize: 14, fontFamily: "Inter" }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="#B6B6B6"
                  tick={{ fill: "#B6B6B6", fontSize: 14, fontFamily: "Inter" }}
                  tickFormatter={(val: number) =>
                    val === 0 ? "0" : `${val / 1000}K`
                  }
                  axisLine={false}
                  tickLine={false}
                  dx={-10}
                  domain={[0, 60000]}
                  ticks={[0, 20000, 40000, 60000]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="previousRevenue"
                  stroke="#4C5A6E"
                  strokeWidth={5}
                  dot={false}
                  activeDot={{ r: 6, fill: "#4C5A6E", strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#5183F4"
                  strokeWidth={5}
                  dot={false}
                  activeDot={{
                    r: 8,
                    fill: "#5183F4",
                    stroke: "#FFFFFF",
                    strokeWidth: 3,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Channel contribution (width 248px, border 1px solid #E6F4FF, radius 8px) */}
        <div className="w-full lg:w-[248px] bg-white border border-[#E6F4FF] rounded-[8px] p-4 flex flex-col justify-between shrink-0">
          <h3 className="text-[12px] font-semibold text-[#000000] leading-[145%]">
            Channel contribution · Today
          </h3>

          <div className="flex flex-col gap-[22px] my-auto pt-2">
            {channels.map((item) => (
              <div key={item.id} className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-normal text-[#000000] leading-[145%]">
                    {item.channel}
                  </span>
                  <span className="font-medium text-[#000000] leading-[145%]">
                    {item.revenue}
                  </span>
                </div>
                <div className="h-1 w-full bg-[#EAEAEA] rounded-[2px] overflow-hidden">
                  <div
                    className="h-full bg-[#2563EB] rounded-[2px]"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

