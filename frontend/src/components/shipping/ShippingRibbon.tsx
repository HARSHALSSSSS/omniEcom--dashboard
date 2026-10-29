import { AlertTriangle, Truck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/utils/format";
import { SUMMARY_DAYS, type CarrierSummary, type ShippingSummary } from "@/types/shipping";
import { orDash } from "./shippingFormat";

interface ShippingRibbonProps {
  summary: ShippingSummary | undefined;
  loading: boolean;
  error: string | null;
  days: number;
  onDays: (days: number) => void;
  onRetry: () => void;
  onExceptions: () => void;
}

const percent = (v: number | null) => (v === null ? "—" : `${v}%`);

function CarrierCard({ carrier }: { carrier: CarrierSummary }) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-5 shadow-sm" data-testid="carrier-card">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">{carrier.name}</span>
        <Truck className="h-4 w-4 shrink-0 text-[#1D4ED8]" aria-hidden />
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-2xl font-bold text-foreground">
          {formatNumber(carrier.awbCount)} {carrier.awbCount === 1 ? "AWB" : "AWBs"}
        </span>
        <span
          className={`text-xs font-semibold ${carrier.onTimePercent === null ? "text-muted-foreground" : carrier.onTimePercent >= 90 ? "text-emerald-600" : "text-amber-600"}`}
          title={carrier.onTimeSample > 0 ? `Based on ${carrier.onTimeSample} delivered shipments with an ETA` : "No delivered shipment with an ETA yet"}
        >
          {percent(carrier.onTimePercent)} on time
        </span>
      </div>
      <dl className="grid grid-cols-3 min-[400px]:grid-cols-5 sm:grid-cols-5 gap-2 min-[400px]:gap-1 text-[11px]">
        {(
          [
            ["In transit", formatNumber(carrier.inTransit)],
            ["Delivered", formatNumber(carrier.delivered)],
            ["NDR", formatNumber(carrier.ndr)],
            ["RTO", formatNumber(carrier.rto)],
            ["Avg days", orDash(carrier.avgDeliveryDays)],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** carrier performance for the chosen window (shipments created in the last N days); unknown values read "—", never a guess */
export function ShippingRibbon({ summary, loading, error, days, onDays, onRetry, onExceptions }: ShippingRibbonProps) {
  return (
    <section aria-label="Carrier performance" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Carrier performance</h2>
        <select
          aria-label="Performance window"
          value={days}
          onChange={(e) => onDays(Number(e.target.value))}
          className="h-9 sm:h-8 min-h-[36px] sm:min-h-0 rounded-lg border border-border bg-card px-2 text-xs font-medium"
        >
          {SUMMARY_DAYS.map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div role="status" aria-label="Loading carrier performance" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[112px] rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4 text-xs">
          <span className="text-muted-foreground">Carrier performance could not be loaded. {error}</span>
          <button type="button" onClick={onRetry} className="h-8 rounded-lg border border-border px-3 font-semibold hover:bg-muted">
            Retry
          </button>
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {summary.carriers.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card p-5 text-xs text-muted-foreground">
              No shipments were created in the last {summary.window.days} days, so there is nothing to compare yet.
            </div>
          )}
          {summary.carriers.map((c) => (
            <CarrierCard key={c.code} carrier={c} />
          ))}
          <div className="space-y-2 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">In-transit exceptions</span>
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className={`font-mono text-2xl font-bold ${summary.exceptions.shipments > 0 ? "text-amber-600" : "text-foreground"}`}>
                {formatNumber(summary.exceptions.shipments)} {summary.exceptions.shipments === 1 ? "shipment" : "shipments"}
              </span>
              <span className="text-xs text-muted-foreground">
                {summary.exceptions.ndr} NDR · {summary.exceptions.rto} RTO
              </span>
            </div>
            {summary.exceptions.shipments > 0 && (
              <button type="button" onClick={onExceptions} className="text-xs font-semibold text-primary hover:underline">
                Review exceptions
              </button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
