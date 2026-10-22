import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { errorMessage } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { useReturnsAnalytics, useReturnsInsights } from "@/hooks/useReturns";
import { formatNumber } from "@/utils/format";
import type { InsightsData, ReturnsAnalytics } from "@/types/returns";
import { Notice } from "./design";

const PIE_COLORS = ["#111111", "#4B5563", "#6B7280", "#9CA3AF", "#D1D5DB", "#3B82F6", "#93C5FD", "#C084FC"];

const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-[#EAEAEA] bg-white p-5 shadow-2xs">
      <h3 className="text-[16px] font-semibold leading-tight text-black">{title}</h3>
      {children}
    </section>
  );
}

function ReasonsCard({ data, days }: { data: ReturnsAnalytics; days: number }) {
  const total = data.window.returns;
  const slices = data.reasons.map((r, i) => ({ name: r.label, value: r.sharePct, count: r.count, color: PIE_COLORS[i % PIE_COLORS.length] as string }));
  return (
    <div className="space-y-4 rounded-2xl border border-[#EAEAEA] bg-white p-5 shadow-2xs md:col-span-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[16px] font-semibold leading-tight text-black">Why products are coming back</h3>
          <p className="mt-0.5 text-[11px] text-[#666666]">
            Last {formatNumber(total)} {total === 1 ? "return" : "returns"} · Last {days} days · One primary reason per return
          </p>
        </div>
        <span className="rounded-full bg-[#F5F5F5] px-2.5 py-1 text-[11px] font-medium text-[#666666]">{formatNumber(total)} Total</span>
      </div>

      {slices.length === 0 ? (
        <p className="py-6 text-[12px] text-[#666666]">No returns in the last {days} days, so there is nothing to break down yet.</p>
      ) : (
        <div className="grid grid-cols-1 items-center gap-4 pt-1 sm:grid-cols-12">
          <div className="relative flex h-[200px] w-full items-center justify-center sm:col-span-5" role="img" aria-label="Return reasons chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  content={({ active, payload }) => {
                    const item = active ? payload?.[0]?.payload : null;
                    if (!item) return null;
                    return (
                      <div className="rounded-lg border border-[#EAEAEA] bg-white px-3 py-1.5 text-[11px] shadow-md">
                        <p className="font-semibold text-black">{item.name}</p>
                        <p className="text-[#666666]">
                          {item.value}% of returns ({item.count} {item.count === 1 ? "return" : "returns"})
                        </p>
                      </div>
                    );
                  }}
                />
                <Pie data={slices} cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={2} dataKey="value" isAnimationActive={false}>
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} stroke="#FFFFFF" strokeWidth={2} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[17px] font-bold leading-none text-black">100%</span>
              <span className="mt-0.5 text-[9px] uppercase tracking-wider text-[#666666]">Returns</span>
            </div>
          </div>

          <ul aria-label="Return reasons" className="space-y-1.5 pl-2 text-[11px] sm:col-span-7">
            {slices.map((s) => (
              <li key={s.name} className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-xs" style={{ backgroundColor: s.color }} />
                  <span className="font-medium text-black">{s.name}</span>
                </div>
                <span className="font-semibold text-black">
                  <span className="mr-2 font-normal text-[#666666]">{formatNumber(s.count)}</span>
                  {s.value}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-[#EAEAEA] pt-3 text-[11px]">
        <span className="text-[#666666]">{data.concentration.text}</span>
        <Link to={ROUTES.PRODUCTS} className="font-semibold text-black hover:underline">
          View Products →
        </Link>
      </div>
    </div>
  );
}

function IntelligenceCard({ data }: { data: ReturnsAnalytics }) {
  return (
    <div className="relative space-y-4 overflow-hidden rounded-[32px] border border-[#EAEAEA]/80 bg-gradient-to-br from-[#E4A0FF]/40 via-[#93C5FD]/30 to-[#2563EB]/40 p-6 text-black shadow-sm md:col-span-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 stroke-[2] text-[#2563EB]" aria-hidden />
          <h4 className="text-[14px] font-semibold text-black">Return Intelligence</h4>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-[#2563EB]">RECOMMENDATIONS ONLY</span>
      </div>

      {data.intelligence.length === 0 ? (
        <p className="text-[12px] text-[#444444]">Nothing stands out in the last {data.window.days} days: no reason above 15% of returns and no SKU returning at twice its recent baseline.</p>
      ) : (
        data.intelligence.map((note, i) => (
          <div key={`${note.kind}-${i}`} className="space-y-1 pt-1 first:pt-0">
            <div className="text-[13px] font-semibold text-black">{note.text}</div>
            <p className="text-[11px] leading-relaxed text-[#444444]">Evidence: {note.evidence}</p>
            <Link to={note.action.href} className="block pt-0.5 text-[12px] font-semibold text-[#2563EB] hover:underline">
              {note.action.label} →
            </Link>
          </div>
        ))
      )}

      <p className="border-t border-black/10 pt-2 text-[10px] text-[#555555]">{data.note}</p>
    </div>
  );
}

function Bars({ rows, label }: { rows: Array<{ key: string; label: string; count: number; share: number | null }>; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul aria-label={label} className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="space-y-1">
          <div className="flex justify-between gap-3 text-[12px]">
            <span className="truncate text-black">{r.label}</span>
            <span className="shrink-0 text-[#666666]">
              {formatNumber(r.count)} · {pct(r.share)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#F5F5F5]" aria-hidden>
            <div className="h-full rounded-full bg-[#111111]" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Trend({ trend }: { trend: InsightsData["trend"] }) {
  const max = Math.max(1, ...trend.points.map((p) => p.returns));
  const unit = trend.granularity === "day" ? "day" : "week";
  const first = trend.points[0];
  const last = trend.points[trend.points.length - 1];
  return (
    <div className="space-y-2">
      <div role="img" aria-label={`Returns per ${unit}, ${trend.points.length} points`} className="flex h-24 items-end gap-0.5">
        {trend.points.map((p) => (
          <div
            key={p.date}
            title={`${p.date}: ${p.returns} ${p.returns === 1 ? "return" : "returns"}, ${p.units} units`}
            className={`min-w-[2px] flex-1 rounded-t ${p.returns > 0 ? "bg-[#111111]" : "bg-[#F5F5F5]"}`}
            style={{ height: `${p.returns > 0 ? Math.max(6, (p.returns / max) * 100) : 3}%` }}
          />
        ))}
      </div>
      {first && last && (
        <div className="flex justify-between text-[10px] text-[#666666]">
          <span>{first.date}</span>
          <span>
            Per {unit}, peak {max}
          </span>
          <span>{last.date}</span>
        </div>
      )}
    </div>
  );
}

/** the return trend, the most returned products with their return rate, and the channel split (the reasons are the chart above) */
function InsightCards({ data, channelName }: { data: InsightsData; channelName: (code: string) => string }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card title="Returns over time">
        <Trend trend={data.trend} />
      </Card>
      <Card title="Most returned products">
        {data.topSkus.length === 0 ? (
          <p className="text-[12px] text-[#666666]">No product detail for these returns.</p>
        ) : (
          <table aria-label="Most returned products" className="w-full text-left text-[12px]">
            <thead className="text-[#666666]">
              <tr>
                <th scope="col" className="pb-1.5 font-normal">
                  Product
                </th>
                <th scope="col" className="pb-1.5 text-right font-normal">
                  Returned
                </th>
                <th scope="col" className="pb-1.5 text-right font-normal">
                  Sold
                </th>
                <th scope="col" className="pb-1.5 text-right font-normal">
                  Return rate
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA]">
              {data.topSkus.map((s) => (
                <tr key={s.sku}>
                  <td className="max-w-[160px] py-1.5 pr-2">
                    <p className="truncate text-black">{s.title}</p>
                    <p className="font-mono text-[11px] text-[#666666]">{s.sku}</p>
                  </td>
                  <td className="py-1.5 text-right">{formatNumber(s.unitsReturned)}</td>
                  <td className="py-1.5 text-right">{formatNumber(s.unitsSold)}</td>
                  <td className="py-1.5 text-right">{pct(s.returnRatePercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Returns by channel">
        <Bars label="Returns by channel" rows={data.channels.map((c) => ({ key: c.code, label: channelName(c.code), count: c.returns, share: c.sharePercent }))} />
      </Card>
    </div>
  );
}

interface AnalyticsSectionProps {
  days: number;
  channelName: (code: string) => string;
}

/** why products come back (chart + recommendations) and the supporting insights, for the chosen window */
export function AnalyticsSection({ days, channelName }: AnalyticsSectionProps) {
  const analytics = useReturnsAnalytics(days);
  const insights = useReturnsInsights(days);

  return (
    <section className="space-y-4" aria-label="Return analytics">
      {analytics.isLoading && !analytics.data ? (
        <div role="status" aria-label="Loading analytics" className="grid grid-cols-1 gap-8 md:grid-cols-12">
          <div className="h-64 animate-pulse rounded-2xl bg-[#F5F5F5] md:col-span-6" />
          <div className="h-64 animate-pulse rounded-[32px] bg-[#F5F5F5] md:col-span-6" />
        </div>
      ) : analytics.isError && !analytics.data ? (
        <Notice
          role="alert"
          tone="error"
          title="The return analytics could not be loaded."
          description={errorMessage(analytics.error)}
          action={
            <button type="button" onClick={() => void analytics.refetch()} className="rounded-lg border border-[#FCA5A5] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#991B1B] hover:bg-[#FEF2F2]">
              Retry
            </button>
          }
        />
      ) : analytics.data ? (
        <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-12">
          <ReasonsCard data={analytics.data} days={days} />
          <IntelligenceCard data={analytics.data} />
        </div>
      ) : null}

      {insights.isLoading && !insights.data ? (
        <div role="status" aria-label="Loading insights" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-[#F5F5F5]" />
          ))}
        </div>
      ) : insights.isError && !insights.data ? (
        <Notice
          role="alert"
          tone="error"
          title="Return insights could not be loaded."
          description={errorMessage(insights.error)}
          action={
            <button type="button" onClick={() => void insights.refetch()} className="rounded-lg border border-[#FCA5A5] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#991B1B] hover:bg-[#FEF2F2]">
              Retry
            </button>
          }
        />
      ) : insights.data && insights.data.window.returns > 0 ? (
        <InsightCards data={insights.data} channelName={channelName} />
      ) : null}
    </section>
  );
}
