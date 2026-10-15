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
      <div className="rounded-lg bg-white p-3 shadow-xl border border-neutral-200 text-[#191F28] text-[12px] space-y-1.5 min-w-[160px]">
        <div className="flex items-center gap-2 font-medium">
          <span className="h-2.5 w-2.5 rounded-full bg-[#4C5A6E]" />
          <span>
            {label}: ₹{prevRev.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2 font-medium">
          <span className="h-2.5 w-2.5 rounded-full bg-[#5183F4]" />
          <span>
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
    <div className="w-full bg-[#FAFAFA] border border-[#EAEAEA] rounded-xl p-6 flex flex-col gap-7">
      {/* Performance Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[18px] font-semibold text-[#000000] leading-[26px]">
            Sales performance
          </h2>
          <p className="text-[12px] text-[#666666]">
            Track how your business is performing across connected channels.
          </p>
        </div>

        {/* Date range toggle */}
        <div className="inline-flex items-center rounded-lg border border-[#EAEAEA] bg-neutral-100 p-0.5">
          <button
            type="button"
            onClick={() => setSelectedRange("7d")}
            className={`rounded-md px-3 py-1 text-[12px] font-medium transition-all ${
              selectedRange === "7d"
                ? "bg-white text-black shadow-2xs font-semibold"
                : "text-[#666666] hover:text-black"
            }`}
          >
            7 days
          </button>
          <button
            type="button"
            onClick={() => setSelectedRange("30d")}
            className={`rounded-md px-3 py-1 text-[12px] font-medium transition-all ${
              selectedRange === "30d"
                ? "bg-white text-black shadow-2xs font-semibold"
                : "text-[#666666] hover:text-black"
            }`}
          >
            30 days
          </button>
          <button
            type="button"
            onClick={() => setSelectedRange("90d")}
            className={`rounded-md px-3 py-1 text-[12px] font-medium transition-all ${
              selectedRange === "90d"
                ? "bg-white text-black shadow-2xs font-semibold"
                : "text-[#666666] hover:text-black"
            }`}
          >
            90 days
          </button>
        </div>
      </div>

      {/* Revenue and Channels Area */}
      <div className="flex flex-col lg:flex-row items-stretch gap-8">
        {/* Left: Revenue History with Dark Chart */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Chart Legend */}
          <div className="flex items-center justify-between flex-wrap gap-4 text-[11px]">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 bg-[#5183F4] rounded-full" />
                <span className="font-normal text-[#000000]">Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 border-b-2 border-dashed border-[#4C5A6E]" />
                <span className="font-normal text-[#666666]">
                  Previous period
                </span>
              </div>
            </div>
            <span className="text-[10px] text-[#666666]">
              Daily revenue · INR
            </span>
          </div>

          {/* Daily Revenue Chart Card */}
          <div className="w-full bg-[#191F28] rounded-[20px] p-5 pt-6 shadow-md relative min-h-[325px]">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={history}
                margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="#2E3B4F"
                  strokeDasharray="0"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="#B6B6B6"
                  tick={{ fill: "#B6B6B6", fontSize: 12, fontFamily: "Inter" }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="#B6B6B6"
                  tick={{ fill: "#B6B6B6", fontSize: 12, fontFamily: "Inter" }}
                  tickFormatter={(val: number) =>
                    val === 0 ? "0" : `${val / 1000}K`
                  }
                  axisLine={false}
                  tickLine={false}
                  dx={-5}
                  domain={[0, 60000]}
                  ticks={[0, 20000, 40000, 60000]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="previousRevenue"
                  stroke="#4C5A6E"
                  strokeWidth={3.5}
                  dot={false}
                  activeDot={{ r: 5, fill: "#4C5A6E", strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#5183F4"
                  strokeWidth={3.5}
                  dot={false}
                  activeDot={{
                    r: 6,
                    fill: "#5183F4",
                    stroke: "#FFFFFF",
                    strokeWidth: 2,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Channel contribution Today */}
        <div className="w-full lg:w-[248px] bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col justify-between shrink-0 shadow-2xs">
          <h3 className="text-[12px] font-semibold text-[#000000]">
            Channel contribution · Today
          </h3>

          <div className="flex flex-col gap-5 my-auto">
            {channels.map((item) => (
              <div key={item.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-normal text-[#000000]">
                    {item.channel}
                  </span>
                  <span className="font-medium text-[#000000]">
                    {item.revenue}
                  </span>
                </div>
                <div className="h-1 w-full bg-[#EAEAEA] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#2563EB] rounded-full transition-all duration-500"
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
