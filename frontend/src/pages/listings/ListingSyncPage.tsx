import { Link, useParams, useNavigate } from "react-router-dom";
import { Plus, RefreshCw } from "lucide-react";
import { useListingChannels, useListingSync, useSyncActions } from "@/hooks/useListingAudit";
import { useCan } from "@/hooks/useCan";
import { useToastStore } from "@/hooks/useToast";
import { errorMessage } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { AuditError, AuditLoading } from "@/components/listings/audit/AuditStates";
import { agoText, AMBER, BLUE, GREEN, GREY, RED, STATUS_COLOR, STATUS_LABEL } from "@/components/listings/audit/format";
import type { ListingSync, StepStatus, SyncState } from "@/types/listingAudit";

const STEP_COLOR: Record<StepStatus, string> = { complete: GREEN, in_progress: BLUE, pending: GREY, failed: RED, attention: AMBER };
const STEP_LABEL: Record<StepStatus, string> = { complete: "Complete", in_progress: "In progress", pending: "Waiting", failed: "Failed", attention: "Needs attention" };

const TONE: Record<SyncState, { color: string; border: string; bg: string; badge: string }> = {
  syncing: { color: "#2563EB", border: "#BFDBFE", bg: "#EFF6FF", badge: "Syncing" },
  synced: { color: "#16A34A", border: "#BBF7D0", bg: "#F0FDF4", badge: "Synced" },
  attention: { color: "#DC2626", border: "#FECACA", bg: "#FEF2F2", badge: "Needs attention" },
  idle: { color: "#6B7280", border: "#E5E7EB", bg: "#F9FAFB", badge: "Not live" },
};

const JOB_LABEL: Record<string, string> = { listing_publish: "Publish", listings: "Content update", inventory: "Stock push", listing_status: "Status check", prices: "Price push" };

function banner(s: ListingSync): { title: string; subtext: string } {
  const name = s.listing.marketplaceName;
  switch (s.state) {
    case "syncing":
      return { title: `Sync in progress · ${name}`, subtext: "Content, stock, and listing data are being synchronized. No action required." };
    case "attention": {
      const step = s.steps.find((x) => x.status === "failed") ?? s.steps.find((x) => x.status === "attention");
      return { title: `Sync needs attention · ${name}`, subtext: step ? `${step.label}: ${step.detail}` : "A sync step needs your attention." };
    }
    case "synced":
      return { title: `Up to date · ${name}`, subtext: "Content, stock, and listing data match the marketplace." };
    default:
      return { title: `Not synced yet · ${name}`, subtext: "The listing is not live on the marketplace yet, so nothing is being synchronized." };
  }
}

export default function ListingSyncPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const listingId = id ?? "";
  const canWrite = useCan("listings:write");
  const toast = useToastStore.getState().addToast;

  const { data: sync, isLoading, isRefetching, refetch, error } = useListingSync(listingId);
  const channels = useListingChannels(listingId);
  const { refresh, content } = useSyncActions(listingId);

  if (isLoading) return <AuditLoading label="Loading sync telemetry…" tone="text-[#2563EB]" />;

  if (error || !sync) {
    return (
      <AuditError title="Failed to load listing sync telemetry." error={error} onRetry={() => void refetch()}>
        <button type="button" onClick={() => navigate(ROUTES.LISTINGS)} className="text-xs underline font-semibold cursor-pointer">
          ← Back to Listings
        </button>
      </AuditError>
    );
  }

  const tone = TONE[sync.state];
  const { title, subtext } = banner(sync);
  const syncing = sync.state === "syncing";
  const contentStuck = sync.steps.some((s) => s.key === "content" && s.status === "failed");

  const run = (m: typeof refresh, ok: string) =>
    m.mutate(undefined, {
      onSuccess: () => toast({ title: ok, variant: "success" }),
      onError: (e) => toast({ title: "Could not start the sync", description: errorMessage(e), variant: "destructive" }),
    });

  return (
    <div className="w-full flex flex-col items-start gap-6 font-['Inter',sans-serif] text-[#000000] pb-24">
      {/* 2. PAGE HEADER */}
      <header className="w-full flex flex-row justify-between items-start pt-1">
        <div className="flex flex-col items-start gap-1">
          <span className="text-[10px] font-medium leading-[12px] tracking-wider text-[#707070] uppercase">COMMERCE</span>
          <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">Listings</h1>
          <p className="text-[13px] font-normal leading-[19px] text-[#666666]">Manage how your master products appear across every connected marketplace.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(ROUTES.LISTINGS)}
            className="h-9 px-3 flex items-center justify-center gap-1.5 border border-[#BDBDBD] rounded-lg text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.2]" />
            Create listing
          </button>
          <button
            onClick={() => navigate(ROUTES.LISTINGS_PUBLISH)}
            className="h-9 px-4 flex items-center justify-center gap-2 bg-[#000000] rounded-lg text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors cursor-pointer shadow-none"
          >
            Publish products
          </button>
        </div>
      </header>

      {/* 3. BANNER */}
      <div role="status" className="w-full p-4 rounded-lg border flex items-center justify-between gap-4" style={{ borderColor: tone.border, backgroundColor: tone.bg }}>
        <div className="flex flex-col items-start gap-0.5">
          <h3 className="text-sm font-semibold" style={{ color: tone.color }}>
            {title}
          </h3>
          <p className="text-xs text-[#6B7280]">{subtext}</p>
        </div>
        <span className="text-xs text-[#6B7280] font-normal shrink-0">{syncing && sync.startedAt ? `Started ${agoText(sync.startedAt)}` : `Last synced ${agoText(sync.lastSyncedAt)}`}</span>
      </div>

      {/* 4. PRODUCT TELEMETRY HEADER & BADGE */}
      <div className="w-full relative flex items-start justify-between pl-4">
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r" style={{ backgroundColor: tone.color }} />

        <div className="space-y-1">
          <span className="text-xs text-[#6B7280] font-normal">
            {sync.listing.marketplaceName} · {STATUS_LABEL[sync.listing.screenStatus]}
          </span>
          <h2 className="text-[20px] font-semibold text-black tracking-tight leading-snug">
            <Link to={`${ROUTES.LISTINGS}/${sync.listing.id}`} className="hover:underline">
              {sync.listing.productTitle}
            </Link>
          </h2>
          <p className="text-xs text-[#6B7280]">
            {sync.listing.sku} · {sync.listing.variantsCount} variant{sync.listing.variantsCount === 1 ? "" : "s"} · Last synced {agoText(sync.lastSyncedAt)}
          </p>
        </div>

        <div>
          <span className="px-3 py-1 rounded-md text-xs font-medium border" style={{ color: tone.color, borderColor: tone.color, backgroundColor: tone.bg }}>
            {tone.badge}
          </span>
        </div>
      </div>

      {/* 5. PROGRESS TELEMETRY CARD */}
      <section className="w-full rounded-lg border border-[#EAEAEA] bg-white p-6 space-y-6 shadow-none">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-black">{syncing ? "Sync in progress" : "Sync status"}</h4>
          <div className="flex items-center gap-2">
            {contentStuck && (
              <button
                type="button"
                onClick={() => run(content, "Latest content queued")}
                disabled={!canWrite || content.isPending}
                className="h-8 px-3 rounded-lg border border-[#BDBDBD] bg-white text-[11px] font-semibold text-black hover:bg-neutral-50 disabled:opacity-50 cursor-pointer"
              >
                Send latest content
              </button>
            )}
            <button
              type="button"
              onClick={() => run(refresh, "Marketplace status check queued")}
              disabled={!canWrite || refresh.isPending}
              title={canWrite ? undefined : "You do not have permission to start a sync"}
              className="h-8 px-3 rounded-lg border border-[#BDBDBD] bg-white text-[11px] font-semibold text-black hover:bg-neutral-50 disabled:opacity-50 cursor-pointer"
            >
              Check marketplace status
            </button>
            <button type="button" onClick={() => void refetch()} aria-label="Refresh" className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#BDBDBD] bg-white hover:bg-neutral-50 cursor-pointer">
              <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {sync.steps.map((step) => {
            const color = STEP_COLOR[step.status];
            const indeterminate = step.status === "in_progress" && step.progressPct === null;
            const pct = step.progressPct ?? 0;
            // every step with a measurable progress shows its real percentage; a failed step or one that needs a decision shows its status
            const label = step.progressPct !== null && step.status !== "failed" && step.status !== "attention" ? (step.status === "in_progress" ? `${step.progressPct}%` : `${STEP_LABEL[step.status]} · ${step.progressPct}%`) : STEP_LABEL[step.status];
            const counts = step.progress ? `${step.progress.done.toLocaleString()} of ${step.progress.total.toLocaleString()} ${step.progress.unit === "stages" ? "stages" : step.progress.total === 1 ? "listing" : "listings"}${step.progress.failed > 0 ? ` (${step.progress.failed} failed)` : ""} · ` : "";
            return (
              <div key={step.key} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-normal text-[#1F2937]">{step.label}</span>
                  <span className="font-medium" style={{ color }}>
                    {label}
                  </span>
                </div>

                <div
                  className="w-full h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden"
                  role="progressbar"
                  aria-label={step.label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={indeterminate ? undefined : pct}
                  aria-valuetext={label}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${indeterminate ? "animate-pulse" : ""}`}
                    style={{ width: indeterminate ? "40%" : `${step.status === "failed" || step.status === "attention" ? 100 : pct}%`, backgroundColor: color, opacity: step.status === "failed" || step.status === "attention" ? 0.35 : 1 }}
                  />
                </div>
                <p className="text-[11px] text-[#6B7280]">
                  {counts}
                  {step.detail}
                  {step.at && ` · ${agoText(step.at)}`}
                </p>
              </div>
            );
          })}
        </div>

        {sync.jobs.length > 0 && (
          <div className="pt-4 border-t border-[#EAEAEA] space-y-2">
            <h5 className="text-[11px] font-semibold tracking-wider text-[#666666] uppercase">RECENT SYNC JOBS</h5>
            <ul className="text-xs divide-y divide-[#EAEAEA]">
              {sync.jobs.slice(0, 5).map((j) => (
                <li key={j.id} className="py-1.5 flex items-center justify-between gap-3">
                  <span className="text-[#1F2937]">{JOB_LABEL[j.type] ?? j.type}</span>
                  <span className="text-[#6B7280] truncate">{j.error ? j.error.message : j.status.replace(/_/g, " ")}</span>
                  <span className="text-[#6B7280] shrink-0">{agoText(j.finishedAt ?? j.startedAt ?? j.scheduledAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 6. OTHER CHANNELS FOR THIS PRODUCT */}
      <section className="w-full space-y-3 pt-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-[#666666] uppercase">OTHER CHANNELS FOR THIS PRODUCT</h3>

        {channels.isLoading ? (
          <p className="text-xs text-[#666666]">Loading channels…</p>
        ) : channels.isError || !channels.data ? (
          <p role="alert" className="text-xs text-red-700">
            Could not load the other channels.{" "}
            <button type="button" onClick={() => void channels.refetch()} className="underline font-semibold cursor-pointer">
              Try again
            </button>
          </p>
        ) : (
          <div className="w-full border border-[#EAEAEA] rounded-md overflow-hidden bg-white text-xs">
            <div className="h-9 bg-[#F5F5F5] px-4 grid grid-cols-3 items-center text-[11px] font-medium text-[#666666]">
              <div>Channel</div>
              <div>Status</div>
              <div>Last sync</div>
            </div>

            <div className="divide-y divide-[#EAEAEA]">
              {channels.data.channels.map((item) => {
                const accent = STATUS_COLOR[item.screenStatus];
                return (
                  <div key={item.accountId} className="h-11 px-4 grid grid-cols-3 items-center hover:bg-[#FAFAFA] transition-colors relative">
                    <div className="absolute left-0 top-2 bottom-2 w-[3px]" style={{ backgroundColor: accent }} />

                    <div className="font-semibold text-black pl-1 truncate">
                      {item.listingId && !item.current ? (
                        <Link to={ROUTES.LISTING_SYNC.replace(":id", item.listingId)} className="hover:underline">
                          {item.marketplaceName}
                        </Link>
                      ) : (
                        item.marketplaceName
                      )}
                      {item.accountName !== item.marketplaceName && <span className="ml-1.5 font-normal text-[#666666]">{item.accountName}</span>}
                      {item.current && <span className="ml-1.5 font-normal text-[#666666]">(this listing)</span>}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                      <span className="font-medium" style={{ color: accent }}>
                        {STATUS_LABEL[item.screenStatus]}
                      </span>
                    </div>

                    <div className="text-[#666666]">{item.screenStatus === "not_listed" ? "No listing yet" : agoText(item.lastSyncAt)}</div>
                  </div>
                );
              })}
              {channels.data.channels.length === 0 && <div className="h-11 px-4 flex items-center text-[#666666]">No marketplace account is connected.</div>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
