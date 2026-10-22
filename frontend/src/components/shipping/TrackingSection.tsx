import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, RefreshCw, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useSyncTracking, useTrackingFailures, useTrackingList } from "@/hooks/useShipping";
import { toast } from "@/hooks/useToast";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { TRACKING_STATUSES, type TrackingFilters, type TrackingItem, type TrackingQuery, type TrackingStatus } from "@/types/shipping";
import { DEFAULT_PAGE_SIZE } from "./shippingParams";
import { NO_WRITE_REASON, dateOrDash } from "./shippingFormat";
import { FilterSelect, Notice, SearchBox } from "./shippingUi";
import { ShippingPagination } from "./ShippingPagination";

type TrackingPatch = Partial<Record<"tq" | "tmarketplace" | "tstatus" | "tpage" | "tsize", string | null>>;

const STATUS: Record<TrackingStatus, { text: string; tone: string }> = {
  tracking_active: { text: "Tracking active", tone: "text-black" },
  awaiting_first_scan: { text: "Awaiting first scan", tone: "text-[#D97706]" },
  in_transit: { text: "In Transit", tone: "text-[#2563EB]" },
  delivery_delayed: { text: "Delivery delayed", tone: "text-[#D97706]" },
  tracking_sync_failed: { text: "Sync Failed", tone: "text-[#DC2626]" },
  delivered: { text: "Delivered", tone: "text-[#16A34A]" },
};

const ATTENTION_TEXT: Record<TrackingItem["attention"], string> = {
  none: "",
  check_first_scan: "Check first scan",
  review_update: "Review update",
  retry_required: "Retry required",
  completed: "Completed",
};

interface TrackingSectionProps {
  query: TrackingQuery;
  filters: TrackingFilters;
  filtered: boolean;
  channels: ReadonlyArray<{ code: string; name: string }>;
  canWrite: boolean;
  embedded: boolean;
  onUpdate: (patch: TrackingPatch, opts?: { replace?: boolean; keepPage?: boolean }) => void;
  onClear: () => void;
  /** the second argument is what finds the shipment's row again (its AWB, else the order number) */
  onOpenShipment: (shipmentId: string, hint: string) => void;
}

function Stage({ label, count, done }: { label: string; count: number | undefined; done?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 className="h-4 w-4 stroke-[2] text-[#16A34A]" aria-hidden />
      ) : (
        <span className="flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-[#2563EB]" aria-hidden>
          <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
        </span>
      )}
      <span className="font-semibold text-black">{label}</span>
      {count !== undefined && <span className="text-[11px] text-[#666666]">{formatNumber(count)}</span>}
    </div>
  );
}

function Connector() {
  return (
    <div className="mx-6 flex flex-1 items-center justify-center" aria-hidden>
      <div className="h-[1px] w-full bg-[#EAEAEA]" />
      <ArrowRight className="ml-4 h-3.5 w-3.5 shrink-0 stroke-[1.5] text-[#666666]" />
    </div>
  );
}

/** dispatched shipments with the status derived from their tracking, the tracking sync, and what failed */
export function TrackingSection(props: TrackingSectionProps) {
  const { query, filters, canWrite, onUpdate } = props;
  const tracking = useTrackingList(query);
  const failures = useTrackingFailures();
  const sync = useSyncTracking();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);

  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    const data = tracking.data;
    if (data && data.total > 0 && data.items.length === 0 && query.page > data.pages) onUpdate({ tpage: String(data.pages) }, { replace: true });
  }, [tracking.data, query.page, onUpdate]);

  const rows = tracking.data?.items ?? [];
  const failed = failures.data ?? [];
  const live = failed.filter((f) => !dismissed.includes(f.shipmentId));
  const active = live[0];
  const stages = tracking.data?.counters.stages;
  const total = tracking.data?.total ?? 0;

  /** one shipment (retry) or every open one (Sync Tracking) */
  const run = (ids: string[] | undefined, key: string | null) => {
    setRetrying(key);
    sync.mutate(ids, {
      onSuccess: (r) =>
        toast({
          title: r.failed > 0 ? "Tracking sync finished with failures" : "Tracking synced",
          description: `${r.processed} checked, ${r.updated} updated${r.failed > 0 ? `, ${r.failed} failed` : ""}.`,
          variant: r.failed > 0 ? "destructive" : "success",
        }),
      onError: (e) => toast({ title: "Tracking could not be synced", description: errorMessage(e), variant: "destructive" }),
      onSettled: () => setRetrying(null),
    });
  };

  return (
    <section className={cn("space-y-4 border-t border-[#EAEAEA]", props.embedded ? "pt-6" : "pt-4")} aria-label="Tracking">
      {props.embedded && (
        <div className="flex items-center gap-2 text-[10px]">
          <span className="font-semibold uppercase tracking-wider text-[#666666]">ALTERNATE VIEW</span>
          <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
          <span className="text-[11px] font-semibold text-black">Tracking</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-black">Tracking</h2>
          <p className="text-[11px] text-[#666666]">Dispatched shipments and what their carriers last reported · connector support must be verified</p>
        </div>
        <button
          type="button"
          onClick={() => run(undefined, "all")}
          disabled={!canWrite || sync.isPending}
          title={canWrite ? undefined : NO_WRITE_REASON}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3.5 text-[12px] font-medium text-black shadow-sm transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 stroke-[1.75] text-[#666666]", retrying === "all" && "animate-spin")} />
          <span>{retrying === "all" ? "Syncing..." : "Sync Tracking"}</span>
        </button>
      </div>

      <div className="flex items-center justify-between border-y border-[#EAEAEA] px-1 py-3.5 text-[12px]">
        <Stage label="Dispatched" count={stages?.dispatched} />
        <Connector />
        <Stage label="In Transit" count={stages?.inTransit} />
        <Connector />
        <Stage label="Delivered" count={stages?.delivered} done />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={filters.q ?? ""} label="Search tracking" placeholder="Search order / AWB" onSearch={(q) => onUpdate({ tq: q }, { replace: true })} />
        <FilterSelect label="Marketplace" value={filters.marketplace ?? ""} options={props.channels.map((c) => ({ value: c.code, label: c.name }))} onChange={(v) => onUpdate({ tmarketplace: v })} />
        <FilterSelect label="Tracking status" allLabel="Any tracking status" value={filters.status ?? ""} options={TRACKING_STATUSES.map((s) => ({ value: s, label: STATUS[s].text }))} onChange={(v) => onUpdate({ tstatus: v })} />
        {props.filtered && (
          <button type="button" onClick={props.onClear} className="h-8 rounded-lg px-2.5 text-[12px] font-medium text-[#666666] underline-offset-2 hover:text-black hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {tracking.isLoading ? (
        <div role="status" aria-label="Loading tracking" className="space-y-px overflow-hidden rounded-lg border border-[#EAEAEA] bg-white p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="my-2 h-8 w-full" />
          ))}
        </div>
      ) : tracking.isError && !tracking.data ? (
        <Notice role="alert" title="Tracking could not be loaded.">
          <p>{errorMessage(tracking.error)}</p>
          <button type="button" onClick={() => void tracking.refetch()} className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-medium text-black hover:bg-neutral-50">
            Retry
          </button>
        </Notice>
      ) : rows.length === 0 ? (
        <Notice title={props.filtered ? "No tracked shipment matches these filters." : "No shipment is being tracked yet."}>
          {props.filtered ? (
            <button type="button" onClick={props.onClear} className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-medium text-black hover:bg-neutral-50">
              Clear filters
            </button>
          ) : (
            <p>Shipments appear here once they are dispatched to a carrier.</p>
          )}
        </Notice>
      ) : (
        <>
          <div className={cn("overflow-x-auto rounded-lg border border-[#EAEAEA] bg-white text-[11px] transition-opacity", tracking.isFetching && tracking.isPlaceholderData && "opacity-60")}>
            <table className="w-full min-w-[950px] border-collapse text-left">
              <thead className="border-y border-[#EAEAEA] bg-[#F5F5F5] text-[10px] font-normal text-[#666666]">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-normal">Order</th>
                  <th scope="col" className="px-2 py-2.5 font-normal">Marketplace</th>
                  <th scope="col" className="px-2 py-2.5 font-normal">Shipping Method</th>
                  <th scope="col" className="px-2 py-2.5 font-normal">Tracking ID</th>
                  <th scope="col" className="px-2 py-2.5 font-normal">Dispatch Date</th>
                  <th scope="col" className="px-2 py-2.5 font-normal">Current Status</th>
                  <th scope="col" className="px-2 py-2.5 font-normal">Last Update</th>
                  <th scope="col" className="py-2.5 pr-3 text-right font-normal">Attention</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {rows.map((t) => (
                  <tr key={t.shipmentId} className="transition-colors hover:bg-neutral-50/50">
                    <td className="px-3 py-2.5 font-semibold text-black">
                      <button type="button" aria-label={`Open tracking ${t.awb ?? t.number}`} onClick={() => props.onOpenShipment(t.shipmentId, t.awb ?? t.number)} className="font-semibold hover:underline">
                        {t.number}
                      </button>
                    </td>
                    <td className="px-2 py-2.5 text-black">{t.channel.name}</td>
                    <td className="px-2 py-2.5 text-black">{t.method.name}</td>
                    <td className="px-2 py-2.5 font-normal text-black">{t.awb ?? "—"}</td>
                    <td className="px-2 py-2.5 text-black">{dateOrDash(t.dispatchedAt)}</td>
                    <td className="px-2 py-2.5 font-normal">
                      <span className={STATUS[t.status].tone}>{STATUS[t.status].text}</span>
                    </td>
                    <td className="px-2 py-2.5 text-black">{dateOrDash(t.lastUpdateAt)}</td>
                    <td className="py-2.5 pr-3 text-right font-normal text-black">
                      {t.attention === "retry_required" ? (
                        <button type="button" disabled={!canWrite || sync.isPending} title={canWrite ? undefined : NO_WRITE_REASON} onClick={() => run([t.shipmentId], t.shipmentId)} className="cursor-pointer font-medium text-[#DC2626] hover:underline disabled:cursor-not-allowed disabled:opacity-60">
                          Retry required
                        </button>
                      ) : t.attention === "none" ? (
                        <span>{t.estimatedDeliveryAt ? `ETA ${dateOrDash(t.estimatedDeliveryAt)}` : "—"}</span>
                      ) : (
                        <span className={t.attention === "completed" ? "text-[#16A34A]" : "text-[#D97706]"}>{ATTENTION_TEXT[t.attention]}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ShippingPagination
            noun="tracked shipments"
            page={tracking.data?.page ?? query.page}
            pages={tracking.data?.pages ?? 1}
            total={total}
            pageSize={query.pageSize}
            shown={rows.length}
            onPage={(p) => onUpdate({ tpage: p > 1 ? String(p) : null })}
            onPageSize={(size) => onUpdate({ tsize: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
          />
        </>
      )}

      {active && (
        <div className="animate-in fade-in relative space-y-2.5 rounded-lg border border-l-4 border-neutral-200/40 border-l-[#DC2626] bg-[#FFF8F8] p-3.5 text-[11px] shadow-sm duration-200" role="alert">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#DC2626] text-[9px] font-bold text-[#DC2626]" aria-hidden>
                !
              </span>
              <span className="text-[12px] font-semibold text-black">
                Tracking sync needs attention
                {live.length > 1 && <span className="ml-2 rounded bg-red-100/70 px-1.5 py-0.5 text-[10px] font-medium text-[#DC2626]">+{live.length - 1} more</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#DC2626]">
                <span className="flex h-3 w-3 items-center justify-center rounded-full border border-[#DC2626] text-[8px]" aria-hidden>
                  ✕
                </span>
                <span>{active.orderNumber} · Sync failed</span>
              </div>
              <button type="button" onClick={() => setDismissed((prev) => [...prev, active.shipmentId])} title="Dismiss alert" aria-label="Dismiss alert" className="cursor-pointer rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100/50 hover:text-neutral-700">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 pt-0.5 md:grid-cols-12">
            <div className="space-y-0.5 md:col-span-4">
              <span className="text-[11px] font-semibold text-black">What failed?</span>
              <p className="text-[11px] leading-relaxed text-[#666666]">{active.whatFailed}</p>
              <p className="text-[10px] text-[#666666]">
                Failed {dateOrDash(active.failedAt)} · {active.orderNumber}
              </p>
            </div>
            <div className="space-y-0.5 md:col-span-4">
              <span className="text-[11px] font-semibold text-black">Possible reason</span>
              <p className="text-[11px] leading-relaxed text-[#666666]">{active.possibleReason}</p>
            </div>
            <div className="space-y-1.5 md:col-span-4">
              <p className="text-[11px] leading-relaxed text-[#666666]">Verify the connector configuration, then retry the tracking update.</p>
              <div>
                <button
                  type="button"
                  onClick={() => run([active.shipmentId], active.shipmentId)}
                  disabled={!canWrite || sync.isPending}
                  title={canWrite ? undefined : NO_WRITE_REASON}
                  className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[11px] font-medium text-black shadow-sm transition-colors hover:bg-neutral-50 disabled:opacity-60"
                >
                  <RefreshCw className={cn("h-3 w-3 stroke-[1.75] text-[#666666]", retrying === active.shipmentId && "animate-spin")} />
                  <span>{retrying === active.shipmentId ? "Retrying..." : "Retry"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
