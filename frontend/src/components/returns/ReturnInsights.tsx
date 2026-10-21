import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/utils/format";
import type { InsightsData } from "@/types/returns";

interface ReturnInsightsProps {
  data: InsightsData | undefined;
  loading: boolean;
  error: string | null;
  days: number;
  onRetry: () => void;
  /** a marketplace code to its display name */
  channelName: (code: string) => string;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{title}</h3>
      {children}
    </section>
  );
}

const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

function Bars({ rows, label }: { rows: Array<{ key: string; label: string; count: number; share: number | null }>; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul aria-label={label} className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="space-y-1">
          <div className="flex justify-between gap-3 text-xs">
            <span className="truncate text-foreground">{r.label}</span>
            <span className="shrink-0 font-mono text-muted-foreground">
              {formatNumber(r.count)} · {pct(r.share)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
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
            className={`min-w-[2px] flex-1 rounded-t ${p.returns > 0 ? "bg-primary" : "bg-muted"}`}
            style={{ height: `${p.returns > 0 ? Math.max(6, (p.returns / max) * 100) : 3}%` }}
          />
        ))}
      </div>
      {first && last && (
        <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>{first.date}</span>
          <span>Per {unit}, peak {max}</span>
          <span>{last.date}</span>
        </div>
      )}
    </div>
  );
}

/** why and what comes back: reasons, most returned SKUs (with their return rate), channels and the trend, all for the chosen window */
export function ReturnInsights({ data, loading, error, days, onRetry, channelName }: ReturnInsightsProps) {
  if (error && !data) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-xs">
        <span className="text-muted-foreground">Return insights could not be loaded. {error}</span>
        <button type="button" onClick={onRetry} className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted">
          Retry
        </button>
      </div>
    );
  }
  if (loading && !data) {
    return (
      <div role="status" aria-label="Loading insights" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!data) return null;
  if (data.window.returns === 0) {
    return (
      <Card title="Return insights">
        <p className="text-xs text-muted-foreground">No returns in the last {days} days, so there is nothing to break down yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-foreground">Return insights</h2>
        <span className="text-xs text-muted-foreground">
          {formatNumber(data.window.returns)} returns in the last {days} days. Rejected and cancelled requests are not counted.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Why products come back">
          <Bars label="Return reasons" rows={data.reasons.map((r) => ({ key: r.code, label: r.label, count: r.count, share: r.sharePercent }))} />
        </Card>
        <Card title="Returns over time">
          <Trend trend={data.trend} />
        </Card>
        <Card title="Most returned products">
          {data.topSkus.length === 0 ? (
            <p className="text-xs text-muted-foreground">No product detail for these returns.</p>
          ) : (
            <table aria-label="Most returned products" className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="pb-1.5 font-medium">
                    Product
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-medium">
                    Returned
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-medium">
                    Sold
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-medium">
                    Return rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.topSkus.map((s) => (
                  <tr key={s.sku}>
                    <td className="max-w-[200px] py-1.5 pr-2">
                      <p className="truncate text-foreground">{s.title}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{s.sku}</p>
                    </td>
                    <td className="py-1.5 text-right font-mono">{formatNumber(s.unitsReturned)}</td>
                    <td className="py-1.5 text-right font-mono">{formatNumber(s.unitsSold)}</td>
                    <td className="py-1.5 text-right font-mono">{pct(s.returnRatePercent)}</td>
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
    </div>
  );
}
