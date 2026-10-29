import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, GitBranch, Layers, MoreHorizontal, Plus, RefreshCw, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { SHIPPING_VIEWS, SYNC_FAILED, SYNC_RUNNING, type ShippingOverview, type ShippingView, type SyncJob } from "@/types/shipping";
import { NO_CONFIGURE_REASON, NO_WRITE_REASON } from "./shippingFormat";
import { VIEW_LABELS } from "./shippingParams";

const OUTLINE_BTN = "inline-flex h-9 sm:h-8 min-h-[36px] sm:min-h-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 shadow-2xs";

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
    <div className="flex items-center gap-2 text-xs">
      <span className="font-semibold uppercase tracking-wider text-muted-foreground">STATUS REPLACEMENT</span>
      <span className="h-2.5 w-[1px] bg-border" />
      <span className="text-xs font-semibold text-foreground">{label}</span>
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
      <div role="status" className="animate-in fade-in space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 dark:border-blue-900/50 dark:bg-blue-950/20 p-4 shadow-2xs duration-200 sm:p-5">
        <Eyebrow label="Syncing" />
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
          <span>Synchronizing shipping data…</span>
        </div>
        <div className="flex items-center justify-between text-xs text-foreground">
          <span>Orders: {job?.payload.orders === undefined ? "—" : formatNumber(job.payload.orders)}</span>
          <span>
            Shipping statuses: {formatNumber(done)} / {formatNumber(total)}
            {job && job.progress.failed > 0 ? ` · ${formatNumber(job.progress.failed)} failed` : ""}
          </span>
        </div>
        <div role="progressbar" aria-label="Shipping sync progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-blue-600 dark:bg-blue-400 transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
        <div className="flex items-center gap-2 pt-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current">
            <span className="h-1 w-1 rounded-full bg-current" />
          </span>
          <span>Tracking updates: {job?.status === "queued" || !job ? "waiting to start" : "processing"} · {percent}%</span>
        </div>
        <p className="text-xs text-muted-foreground">Keep working while shipping data synchronizes.</p>
      </div>
    );
  }
  if (failed) {
    return (
      <div role="alert" className="animate-in fade-in space-y-2 rounded-xl border border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20 p-4 shadow-2xs duration-200 sm:p-5">
        <div className="flex items-center justify-between">
          <Eyebrow label="Sync failed" />
          <button type="button" onClick={onDismiss} title="Dismiss" aria-label="Dismiss" className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4" />
          <span>Shipping sync did not complete</span>
        </div>
        <p className="text-xs text-muted-foreground">{failed}</p>
      </div>
    );
  }
  if (result) {
    const stat = (k: string): number => result.stats[k] ?? 0;
    return (
      <div className="animate-in fade-in space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20 p-4 shadow-2xs duration-200 sm:p-5">
        <div className="flex items-center justify-between">
          <Eyebrow label="Completion" />
          <button type="button" onClick={onDismiss} title="Dismiss" aria-label="Dismiss sync result" className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          <span>Shipping sync complete</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-bold text-foreground">{formatNumber(stat("processed"))} processed</span>
          <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatNumber(stat("updated"))} updated</span>
          <span className="font-medium text-amber-600 dark:text-amber-500">{formatNumber(stat("requireAttention"))} require attention</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {stat("requireAttention")} {stat("requireAttention") === 1 ? "exception" : "exceptions"} from this sync only
          {overview ? `; Overview's ${overview.attention.total} represent overall shipping attention.` : "."}
        </p>
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onViewExceptions}
            className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-muted"
          >
            <ArrowRight className="h-3.5 w-3.5 text-foreground" />
            <span>View Exceptions</span>
          </button>
          <button type="button" onClick={onDismiss} className="cursor-pointer text-xs font-medium text-muted-foreground underline hover:text-foreground">
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
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
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SHIPPING OPERATIONS</p>
      </div>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Shipping</h1>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={props.onRules} title={canConfigure ? undefined : "You can review the rules; only an admin can create them."} className={OUTLINE_BTN}>
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Shipping Rules</span>
          </button>

          <button type="button" onClick={props.onAddProvider} disabled={!canConfigure} title={canConfigure ? undefined : NO_CONFIGURE_REASON} className={OUTLINE_BTN}>
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Add Provider</span>
          </button>

          <button
            type="button"
            onClick={props.onSync}
            disabled={!canWrite || syncing || refreshing}
            title={canWrite ? undefined : NO_WRITE_REASON}
            className="inline-flex h-9 sm:h-8 min-h-[36px] sm:min-h-0 items-center gap-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 px-3 text-xs font-medium text-white dark:text-neutral-900 shadow-2xs transition-colors hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", (syncing || refreshing) && "animate-spin")} />
            <span>{syncing ? "Syncing..." : "Sync Shipping"}</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="More shipping actions"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
              className="inline-flex h-9 w-9 sm:h-8 sm:w-8 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-md border border-border bg-background text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shadow-2xs cursor-pointer"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-border bg-popover py-1 text-xs text-popover-foreground shadow-md">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    props.onManifests();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Manifests
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    props.onPickupSlots();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Pickup slots
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    props.onRefresh();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Refresh data
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground max-w-2xl">Choose, configure and monitor the shipping method used to move every order.</p>

      <SyncPanel
        sync={props.sync}
        overview={props.overview}
        onDismiss={props.onDismissSync}
        onViewExceptions={props.onViewExceptions}
      />

      <div className="mt-2 flex items-center justify-between border-b border-border">
        <div role="tablist" aria-label="Shipping workspace" className="flex items-center gap-x-6 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {SHIPPING_VIEWS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => onView(id)}
              className={cn(
                "-mb-px border-b-2 pb-2.5 text-xs transition-colors cursor-pointer shrink-0 whitespace-nowrap",
                view === id
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent font-medium text-muted-foreground hover:text-foreground",
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
