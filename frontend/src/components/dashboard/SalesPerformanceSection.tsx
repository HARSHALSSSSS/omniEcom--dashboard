import { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { PERIOD_OPTIONS } from "@/constants/dashboard.data";
import { formatINR } from "@/utils/format";
import type { Dashboard, SalesPeriod } from "@/types/dashboard";
import { formatDay, formatMoneyCompact, formatShortDay, shiftDay } from "./format";

interface SalesPerformanceSectionProps {
  sales: Dashboard["sales"];
  period: SalesPeriod;
  onPeriodChange: (period: SalesPeriod) => void;
  /** a new period is loading while the previous one stays on screen */
  refreshing?: boolean;
}

interface ChartRow {
  day: string;
  label: string;
  /** whole rupees (the API sends paise) */
  revenue: number;
  previousRevenue: number;
  previousDay: string;
  orders: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}

const ChartTooltip: React.FC<TooltipProps> = ({ active, payload }) => {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="relative rounded-lg bg-white px-3.5 py-3 shadow-[0px_4px_15px_rgba(0,0,0,0.1)] text-[#191F28] text-[12px] space-y-1.5 min-w-[170px] border border-neutral-100">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-[#5183F4] shrink-0" />
        <span className="leading-[15px]">
          {formatDay(row.day)}: {formatINR(row.revenue * 100)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-[#4C5A6E] shrink-0" />
        <span className="leading-[15px]">
          {formatDay(row.previousDay)}: {formatINR(row.previousRevenue * 100)}
        </span>
      </div>
    </div>
  );
};

export const SalesPerformanceSection: React.FC<SalesPerformanceSectionProps> = ({
  sales,
  period,
  onPeriodChange,
  refreshing = false,
}) => {
  const days = PERIOD_OPTIONS.find((o) => o.value === period)?.days ?? sales.series.length;
  const rows = useMemo<ChartRow[]>(
    () =>
      sales.series.map((p) => ({
        day: p.day,
        label: formatShortDay(p.day),
        revenue: p.revenueMinor / 100,
        previousRevenue: p.previousRevenueMinor / 100,
        previousDay: shiftDay(p.day, days),
        orders: p.orders,
      })),
    [sales.series, days],
  );
  const totalMinor = sales.series.reduce((sum, p) => sum + p.revenueMinor, 0);
  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? period;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const chartLabel =
    first && last
      ? `Daily revenue from ${formatDay(first.day)} to ${formatDay(last.day)}, total ${formatINR(totalMinor)}, compared with the previous ${periodLabel}.`
      : "Daily revenue";

  return (
    <section
      aria-labelledby="sales-title"
      className="w-full bg-[#FAFAFA] border border-[#EAEAEA] rounded-[12px] p-4 sm:p-6 flex flex-col gap-5 sm:gap-7"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 id="sales-title" className="text-[18px] font-semibold text-[#000000] leading-[145%]">
            Sales performance
          </h2>
          <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
            Track how your business is performing across connected channels.
          </p>
        </div>

        <div
          role="group"
          aria-label="Sales period"
          className="inline-flex items-center rounded-[8px] bg-[#E6F4FF] p-1 gap-1 self-start max-w-full overflow-x-auto flex-wrap sm:flex-nowrap"
        >
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={period === option.value}
              onClick={() => onPeriodChange(option.value)}
              className={`w-16 sm:w-[72px] h-9 sm:h-[30px] rounded-[8px] border border-[#BFDBFE] text-[12px] font-semibold transition-all flex items-center justify-center leading-[145%] text-[#000000] cursor-pointer ${
                period === option.value ? "bg-[#DBEAFE]" : "bg-[#E6F4FF] hover:bg-[#d5e9fc]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row items-stretch gap-6 lg:gap-8">
        <div className="flex-1 flex flex-col gap-5 min-w-0">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] min-h-4">
            <div className="flex items-center gap-2">
              <span className="w-[18px] h-[2px] bg-[#000000]" />
              <span className="font-normal text-[11px] leading-[145%] text-[#000000]">Revenue</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[18px] h-[2px] border-t-[1.5px] border-dashed border-[#A3A3A3]" />
              <span className="font-normal text-[11px] leading-[145%] text-[#666666]">Previous period</span>
            </div>
            <span className="text-[10px] font-normal leading-[145%] text-[#666666]">
              Daily revenue · {sales.currency}
            </span>
          </div>

          <div
            aria-busy={refreshing}
            className={`w-full bg-[#191F28] rounded-[16px] sm:rounded-[20px] p-3 sm:p-6 shadow-md relative h-[300px] sm:h-[325px] flex flex-col justify-end transition-opacity ${
              refreshing ? "opacity-60" : ""
            }`}
          >
            <div role="img" aria-label={chartLabel} className="w-full">
              <ResponsiveContainer width="100%" height={265}>
                <LineChart data={rows} margin={{ top: 15, right: 15, left: -15, bottom: 5 }}>
                  <CartesianGrid stroke="#2E3B4F" strokeWidth={2} strokeDasharray="0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#B6B6B6"
                    tick={{ fill: "#B6B6B6", fontSize: 14, fontFamily: "Inter" }}
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                    interval="preserveStartEnd"
                    minTickGap={32}
                  />
                  <YAxis
                    stroke="#B6B6B6"
                    tick={{ fill: "#B6B6B6", fontSize: 14, fontFamily: "Inter" }}
                    tickFormatter={(rupees: number) => formatMoneyCompact(rupees * 100)}
                    axisLine={false}
                    tickLine={false}
                    dx={-10}
                    width={64}
                    tickCount={4}
                    domain={[0, (max: number) => (max > 0 ? max : 900)]}
                  />
                  <Tooltip content={<ChartTooltip />} />
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
                    activeDot={{ r: 8, fill: "#5183F4", stroke: "#FFFFFF", strokeWidth: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>Daily revenue, last {periodLabel}</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Revenue</th>
                  <th scope="col">Previous period</th>
                  <th scope="col">Orders</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.day}>
                    <th scope="row">{formatDay(r.day)}</th>
                    <td>{formatINR(r.revenue * 100)}</td>
                    <td>{formatINR(r.previousRevenue * 100)}</td>
                    <td>{r.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-full lg:w-[248px] bg-white border border-[#E6F4FF] rounded-[8px] p-4 flex flex-col gap-4 shrink-0">
          <h3 className="text-[12px] font-semibold text-[#000000] leading-[145%]">Channel contribution · Today</h3>

          {sales.channelContribution.length === 0 ? (
            <p className="text-[12px] text-[#666666] leading-[145%] my-auto">No sales on any channel today yet.</p>
          ) : (
            <ul className="flex flex-col gap-[22px] my-auto pt-2">
              {sales.channelContribution.map((item) => (
                <li key={item.channel.code} className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="font-normal text-[#000000] leading-[145%] truncate">{item.channel.name}</span>
                    <span className="font-medium text-[#000000] leading-[145%] shrink-0">
                      {formatMoneyCompact(item.revenueMinor)}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${item.channel.name} share of today's revenue`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.sharePct}
                    className="h-1 w-full bg-[#EAEAEA] rounded-[2px] overflow-hidden"
                  >
                    <div
                      className="h-full bg-[#2563EB] rounded-[2px]"
                      style={{ width: `${Math.min(100, Math.max(0, item.sharePct))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};
