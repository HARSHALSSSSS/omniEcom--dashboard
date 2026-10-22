import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, GitBranch, Layers, MoreHorizontal, Plus, RefreshCw, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { SHIPPING_VIEWS, SYNC_FAILED, SYNC_RUNNING, type ShippingOverview, type ShippingView, type SyncJob } from "@/types/shipping";
import { NO_CONFIGURE_REASON, NO_WRITE_REASON } from "./shippingFormat";
import { VIEW_LABELS } from "./shippingParams";

const OUTLINE_BTN = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-normal text-[#000000] transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60";

/** what the header knows about Sync Shipping: the job (null when none is shown), whether it is being started, and why starting failed */
export interface SyncState {
  job: SyncJob | null;
  starting: boolean;
  startError: string | null;
}

interface SyncPanelProps {
  sync: SyncState;
  overview: ShippingOverview | undefined;
  onDismiss: () => void;
  onViewExceptions: () => void;
}

function Eyebrow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="font-semibold uppercase tracking-wider text-[#666666]">STATUS REPLACEMENT</span>
      <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
      <span className="text-[11px] font-semibold text-black">{label}</span>
    </div>
  );
}

/** the status area under the title: syncing, completed or failed. What is counted is what the API reports. */
function SyncPanel({ sync, overview, onDismiss, onViewExceptions }: SyncPanelProps) {
  const { job } = sync;
  const running = sync.starting || (job !== null && SYNC_RUNNING.includes(job.status));
  const failed = sync.startError ?? (job && SYNC_FAILED.includes(job.status) ? (job.error?.message ?? "The sync job stopped before it finished.") : null);
  const result = job && (job.status === "succeeded" || job.status === "partially_failed") ? job : null;
  if (running && !failed) {
    const total = job?.progress.total ?? 0;
    const done = job?.progress.done ?? 0;
    const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    return (
      <div role="status" className="animate-in fade-in space-y-3 rounded-xl border border-[#DCEBFE] bg-[#F7FAFF] p-4 shadow-sm duration-200 sm:p-5">
        <Eyebrow label="Syncing" />
        <div className="flex items-center gap-2 text-[13px] font-semibold text-black">
          <RefreshCw className="h-4 w-4 animate-spin stroke-[2] text-[#2563EB]" />
          <span>Synchronizing shipping data…</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-black">
          <span>Orders: {job?.payload.orders === undefined ? "—" : formatNumber(job.payload.orders)}</span>
          <span>
            Shipping statuses: {formatNumber(done)} / {formatNumber(total)}
            {job && job.progress.failed > 0 ? ` · ${formatNumber(job.progress.failed)} failed` : ""}
          </span>
        </div>
        <div role="progressbar" aria-label="Shipping sync progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 w-full overflow-hidden rounded-full bg-[#EAEAEA]">
          <div className="h-full rounded-full bg-[#2563EB] transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
        <div className="flex items-center gap-2 pt-0.5 text-[11px] font-medium text-[#2563EB]">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#2563EB]">
            <span className="h-1 w-1 rounded-full bg-[#2563EB]" />
          </span>
          <span>Tracking updates: {job?.status === "queued" || !job ? "waiting to start" : "processing"} · {percent}%</span>
        </div>
        <p className="text-[11px] text-[#666666]">Keep working while shipping data synchronizes.</p>
      </div>
    );
  }
  if (failed) {
    return (
      <div role="alert" className="animate-in fade-in space-y-2 rounded-xl border border-[#FECACA] bg-[#FFF8F8] p-4 shadow-sm duration-200 sm:p-5">
        <div className="flex items-center justify-between">
          <Eyebrow label="Sync failed" />
          <button type="button" onClick={onDismiss} title="Dismiss" aria-label="Dismiss" className="cursor-pointer rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100/50 hover:text-neutral-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-[13px] font-semibold text-black">
          <AlertTriangle className="h-4 w-4 stroke-[2] text-[#DC2626]" />
          <span>Shipping sync did not complete</span>
        </div>
        <p className="text-[11px] text-[#666666]">{failed}</p>
      </div>
    );
  }
  if (result) {
    const stat = (k: string): number => result.stats[k] ?? 0;
    return (
      <div className="animate-in fade-in space-y-3 rounded-xl border border-[#DCFCE7] bg-[#F9FEFA] p-4 shadow-sm duration-200 sm:p-5">
        <div className="flex items-center justify-between">
          <Eyebrow label="Completion" />
          <button type="button" onClick={onDismiss} title="Dismiss" aria-label="Dismiss sync result" className="cursor-pointer rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100/50 hover:text-neutral-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-[13px] font-semibold text-black">
          <CheckCircle2 className="h-4 w-4 stroke-[2] text-[#16A34A]" />
          <span>Shipping sync complete</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="font-bold text-black">{formatNumber(stat("processed"))} processed</span>
          <span className="font-medium text-[#16A34A]">{formatNumber(stat("updated"))} updated</span>
          <span className="font-medium text-[#D97706]">{formatNumber(stat("requireAttention"))} require attention</span>
        </div>
        <p className="text-[11px] leading-relaxed text-[#666666]">
          {stat("requireAttention")} {stat("requireAttention") === 1 ? "exception" : "exceptions"} from this sync only
          {overview ? `; Overview's ${overview.attention.total} represent overall shipping attention.` : "."}
        </p>
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onViewExceptions}
            className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-[#EAEAEA] bg-white px-3.5 text-[12px] font-medium text-black shadow-sm transition-colors hover:bg-neutral-50"
          >
            <ArrowRight className="h-3.5 w-3.5 stroke-[1.75] text-black" />
            <span>View Exceptions</span>
          </button>
          <button type="button" onClick={onDismiss} className="cursor-pointer text-[11px] font-medium text-[#666666] underline hover:text-black">
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-[11px] leading-[16px] text-[#666666]">
      <CheckCircle2 className="h-3 w-3 stroke-[1.5] text-[#16A34A]" />
      <span>
        {overview
          ? `${overview.statusLine.connectedChannels} connected ${overview.statusLine.connectedChannels === 1 ? "channel" : "channels"} · ${overview.statusLine.activeMethods} shipping ${overview.statusLine.activeMethods === 1 ? "method" : "methods"} active · ${overview.statusLine.ordersNeedAttention} ${overview.statusLine.ordersNeedAttention === 1 ? "order needs" : "orders need"} attention`
          : "Loading shipping status…"}
      </span>
    </div>
  );
}

interface ShippingHeaderProps {
  view: ShippingView;
  onView: (view: ShippingView) => void;
  canWrite: boolean;
  canConfigure: boolean;
  sync: SyncState;
  refreshing: boolean;
  overview: ShippingOverview | undefined;
  onSync: () => void;
  onDismissSync: () => void;
  onViewExceptions: () => void;
  onRules: () => void;
  onAddProvider: () => void;
  onManifests: () => void;
  onPickupSlots: () => void;
  onRefresh: () => void;
}

export function ShippingHeader(props: ShippingHeaderProps) {
  const { view, onView, canWrite, canConfigure, refreshing } = props;
  const syncing = props.sync.starting || (props.sync.job !== null && SYNC_RUNNING.includes(props.sync.job.status));
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[#707070]">SHIPPING OPERATIONS</span>
      </div>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000]">Shipping</h1>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={props.onRules} title={canConfigure ? undefined : "You can review the rules; only an admin can create them."} className={OUTLINE_BTN}>
            <GitBranch className="h-3.5 w-3.5 stroke-[1.5] text-[#666666]" />
            <span>Shipping Rules</span>
          </button>

          <button type="button" onClick={props.onAddProvider} disabled={!canConfigure} title={canConfigure ? undefined : NO_CONFIGURE_REASON} className={OUTLINE_BTN}>
            <Plus className="h-3.5 w-3.5 stroke-[1.5] text-[#666666]" />
            <span>Add Provider</span>
          </button>

          <button
            type="button"
            onClick={props.onSync}
            disabled={!canWrite || syncing || refreshing}
            title={canWrite ? undefined : NO_WRITE_REASON}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black bg-black px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-75"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 stroke-[1.5] text-white", (syncing || refreshing) && "animate-spin")} />
            <span>{syncing ? "Syncing..." : "Sync Shipping"}</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="More shipping actions"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
              className="inline-flex h-8 w-9 items-center justify-center rounded-lg border border-[#EAEAEA] bg-white text-[12px] text-[#000000] transition-colors hover:bg-neutral-50"
            >
              <MoreHorizontal className="h-4 w-4 text-[#666666]" />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-[#EAEAEA] bg-white py-1 text-[12px] shadow-lg">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    props.onManifests();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-black hover:bg-neutral-50"
                >
                  <Layers className="h-3.5 w-3.5 text-[#666666]" aria-hidden /> Manifests
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    props.onPickupSlots();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-black hover:bg-neutral-50"
                >
                  <CalendarClock className="h-3.5 w-3.5 text-[#666666]" aria-hidden /> Pickup slots
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    props.onRefresh();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-black hover:bg-neutral-50"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-[#666666]" aria-hidden /> Refresh data
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-[13px] leading-[19px] text-[#666666]">Choose, configure and monitor the shipping method used to move every order.</p>

      <SyncPanel
        sync={props.sync}
        overview={props.overview}
        onDismiss={props.onDismissSync}
        onViewExceptions={props.onViewExceptions}
      />

      <div className="mt-2 flex items-center justify-between border-b border-[#EAEAEA]">
        <div role="tablist" aria-label="Shipping workspace" className="flex flex-wrap items-center gap-x-7">
          {SHIPPING_VIEWS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => onView(id)}
              className={cn(
                "relative pb-2.5 text-[12px] transition-colors",
                view === id ? "font-semibold text-black after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-black" : "font-normal text-[#666666] hover:text-black",
              )}
            >
              {VIEW_LABELS[id]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
