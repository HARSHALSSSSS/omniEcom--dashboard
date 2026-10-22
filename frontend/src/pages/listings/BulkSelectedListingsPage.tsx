import { useEffect, useMemo, useState } from "react";
import { rememberBulkSelection } from "@/components/listings/audit/bulkScope";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Download, Eye, Loader2, Minus, RefreshCw } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { BulkContentEditDialog } from "@/components/listings/flows/BulkContentEditDialog";
import { accentOf, downloadCsv, parseIds, selectionCsv, STATUS_COLOR, STATUS_LABEL, isGood } from "@/components/listings/flows/flowFormat";
import { FlowError, FlowLoading } from "@/components/listings/flows/FlowShell";
import { ListingBulkResultsDialog } from "@/components/listings/list/ListingBulkResultsDialog";
import { NO_WRITE_REASON, viewOfBulk, type ResultsView } from "@/components/listings/list/listingFormat";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useListingSelection } from "@/hooks/useListingFlows";
import { useBulkListings } from "@/hooks/useListings";
import { toast } from "@/hooks/useToast";
import type { ListingBulkAction } from "@/types/listing";
import { MAX_SELECTION } from "@/types/listingFlows";

const COLS = "grid-cols-[36px_1fr_140px_140px_160px_120px]";
const OUTLINE = "h-8 cursor-pointer rounded-lg border border-[#BDBDBD] bg-white px-3 text-[12px] font-medium text-black transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";

function Box({ state, onClick, label }: { state: "all" | "some" | "none"; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
      aria-label={label}
      onClick={onClick}
      className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded transition-colors ${state === "none" ? "border border-[#BDBDBD] bg-white hover:border-black" : "bg-black text-white"}`}
    >
      {state === "all" && <Check className="h-3 w-3 stroke-[3]" aria-hidden />}
      {state === "some" && <Minus className="h-3 w-3 stroke-[3]" aria-hidden />}
    </button>
  );
}

/** /listings/bulk?ids=a,b: review the listings that were selected on the Listings screen and run a bulk action on them */
export default function BulkSelectedListingsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const canWrite = useCan("listings:write");
  const { ids, extra } = useMemo(() => parseIds(params.get("ids")), [params]);

  const query = useListingSelection(ids);
  const bulk = useBulkListings();

  const [unchecked, setUnchecked] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [results, setResults] = useState<ResultsView | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [editing, setEditing] = useState(false);

  // the Publishing preparation screen reports how many of these listings are its separate scope
  const shownIds = query.data?.items.map((i) => i.id).join(",") ?? "";
  useEffect(() => {
    if (query.data) rememberBulkSelection(shownIds ? shownIds.split(",") : []);
  }, [query.data, shownIds]);

  if (ids.length === 0) {
    return (
      <div className="flex w-full flex-col items-start gap-3 font-['Inter',sans-serif] text-[#000000]">
        <Link to={ROUTES.LISTINGS} className="flex items-center gap-1.5 text-xs text-[#666666] transition-colors hover:text-black">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          <span>Back to all listings</span>
        </Link>
        <div className="w-full rounded-lg border border-[#EAEAEA] bg-[#F5F5F5] p-3.5 text-[12px] text-[#666666]">No listings are selected. Select listings on the Listings screen and open them here to review and publish them together.</div>
      </div>
    );
  }
  if (query.isLoading) return <FlowLoading text="Loading the selected listings…" />;
  if (query.isError || !query.data) return <FlowError text="Failed to load the selected listings." error={query.error} onRetry={() => void query.refetch()} />;

  const items = query.data.items;
  const missing = query.data.missingIds.length;
  const checked = items.filter((i) => !unchecked.includes(i.id));
  const checkedIds = checked.map((i) => i.id);
  const state: "all" | "some" | "none" = checked.length === 0 ? "none" : checked.length === items.length ? "all" : "some";
  const off = bulk.isPending || !canWrite || checked.length === 0;
  const reason = canWrite ? undefined : NO_WRITE_REASON;

  const toggle = (id: string) => setUnchecked((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]));
  const toggleAll = () => setUnchecked(state === "all" ? items.map((i) => i.id) : []);

  const run = (action: ListingBulkAction) => {
    if (checkedIds.length === 0) {
      toast({ title: "No listings selected", description: "Please check at least one listing first.", variant: "destructive" });
      return;
    }
    bulk.mutate(
      { action, ids: checkedIds },
      {
        onSuccess: (res) => setResults(viewOfBulk(action, res)),
        onError: (e) => toast({ title: "The action could not be started", description: errorMessage(e), variant: "destructive" }),
      },
    );
  };

  const exportCsv = () => {
    downloadCsv("selected_listings_batch.csv", selectionCsv(checked.length ? checked : items));
    toast({ title: "Export downloaded", description: `Downloaded CSV of ${checked.length || items.length} selected listings.`, variant: "success" });
  };

  return (
    <div className="flex w-full flex-col items-start gap-4 pb-24 font-['Inter',sans-serif] text-[#000000]">
      <div className="flex w-full items-center justify-between text-xs text-[#666666]">
        <button type="button" onClick={() => navigate(ROUTES.LISTINGS)} className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-black">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          <span>← Back to all listings</span>
        </button>
      </div>

      {/* bulk action bar */}
      <div role="toolbar" aria-label="Bulk actions" className="flex h-12 w-full items-center justify-between rounded-lg border border-[#EAEAEA] bg-white px-4 shadow-none">
        <div className="flex items-center gap-3">
          <Box state={state} onClick={toggleAll} label="Select all listings" />
          <span className="text-[13px] font-semibold tracking-tight text-black" aria-live="polite">
            {checked.length} {checked.length === 1 ? "listing" : "listings"} selected
          </span>
        </div>

        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={off}
            title={reason ?? "Change the title, description, bullet points, search terms or brand of the checked listings together"}
            className={OUTLINE}
          >
            Edit content
          </button>
          <button
            type="button"
            onClick={() => run("publish")}
            disabled={off}
            title={reason}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-black px-4 text-[12px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulk.isPending && bulk.variables?.action === "publish" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Publishing…
              </>
            ) : (
              "Publish"
            )}
          </button>
          <button type="button" onClick={() => setConfirmUnpublish(true)} disabled={off} title={reason} className={OUTLINE}>
            Unpublish
          </button>
          <button type="button" onClick={() => run("sync_inventory")} disabled={off} title={reason ?? "Send the current stock of the selected listings to their marketplaces"} className={`${OUTLINE} flex items-center gap-1`}>
            {bulk.isPending && bulk.variables?.action === "sync_inventory" ? <RefreshCw className="h-3 w-3 animate-spin text-[#2563EB]" aria-hidden /> : "Sync"}
          </button>
          <button type="button" onClick={exportCsv} className={OUTLINE}>
            Export
          </button>

          <div className="relative">
            <button type="button" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)} className={`${OUTLINE} flex items-center gap-1`}>
              <span>More</span>
              <span className="text-[10px]" aria-hidden>
                ⌄
              </span>
            </button>
            {moreOpen && (
              <div role="menu" className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-[#EAEAEA] bg-white py-1 text-[12px] shadow-lg" onMouseLeave={() => setMoreOpen(false)}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    navigate(ROUTES.LISTINGS_READINESS);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-black hover:bg-neutral-100"
                >
                  <Eye className="h-3.5 w-3.5 text-neutral-500" aria-hidden />
                  <span>Audit readiness</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    run("validate");
                  }}
                  disabled={off}
                  title={reason}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5 text-neutral-500" aria-hidden />
                  <span>Validate</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    run("retry");
                  }}
                  disabled={off}
                  title={reason}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-neutral-500" aria-hidden />
                  <span>Retry failed</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    exportCsv();
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-black hover:bg-neutral-100"
                >
                  <Download className="h-3.5 w-3.5 text-neutral-500" aria-hidden />
                  <span>Download report</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* selected listings table */}
      <div className="w-full overflow-hidden rounded-lg border border-[#EAEAEA] bg-white text-xs shadow-none">
        <div className={`grid h-10 ${COLS} items-center border-b border-[#EAEAEA] bg-white px-4 text-[12px] font-normal text-[#666666]`}>
          <div>
            <Box state={state} onClick={toggleAll} label="Select all rows" />
          </div>
          <div>Listing</div>
          <div>SKU</div>
          <div>Marketplace</div>
          <div>Readiness</div>
          <div>Status</div>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-[#666666]">None of the selected listings exist any more.</p>
        ) : (
          <div className="divide-y divide-[#EAEAEA]">
            {items.map((item) => {
              const isChecked = !unchecked.includes(item.id);
              const s = item.table.screenStatus;
              const color = STATUS_COLOR[s];
              const good = isGood(s);
              const pct = item.table.readiness.percent;
              return (
                <div key={item.id} className={`grid h-12 ${COLS} items-center px-4 transition-colors hover:bg-[#FAFAFA]`}>
                  <div>
                    <Box state={isChecked ? "all" : "none"} onClick={() => toggle(item.id)} label={`Select ${item.productTitle} on ${item.table.marketplaceName}`} />
                  </div>
                  <div className={`truncate text-[13px] ${good ? "font-semibold text-black" : "font-normal text-[#666666]"}`}>
                    <Link to={`${ROUTES.LISTINGS}/${item.id}`} className="hover:underline">
                      {item.productTitle}
                    </Link>
                  </div>
                  <div className="font-mono text-[12px] text-[#666666]">{item.sku}</div>
                  <div className={`flex items-center gap-1.5 text-[12px] ${good ? "font-semibold text-black" : "font-normal text-[#666666]"}`}>
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: accentOf(item.marketplace) }} />
                    {item.table.marketplaceName}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#EAEAEA]">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <span className="text-[12px] font-semibold" style={{ color }}>
                      {pct}%
                    </span>
                  </div>
                  <div className="text-[12px] font-medium" style={{ color }}>
                    {STATUS_LABEL[s]}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="w-full rounded-lg border border-[#EAEAEA] bg-[#F5F5F5] p-3.5 text-[12px] font-normal text-[#666666]">
        Showing {items.length} of {items.length + missing} selected listings. Review listing readiness before publishing.
        {missing > 0 && ` ${missing} selected ${missing === 1 ? "listing no longer exists" : "listings no longer exist"}.`}
        {extra > 0 && ` Only the first ${MAX_SELECTION} are shown: ${extra} more ${extra === 1 ? "was" : "were"} left out.`}
      </div>

      <ConfirmDialog
        open={confirmUnpublish}
        onOpenChange={setConfirmUnpublish}
        title={`Unpublish ${checked.length} ${checked.length === 1 ? "listing" : "listings"}?`}
        description="The selected live listings are taken down from their marketplaces. You can publish them again later."
        confirmText="Unpublish"
        variant="destructive"
        loading={bulk.isPending}
        onConfirm={() => {
          setConfirmUnpublish(false);
          run("unpublish");
        }}
      />
      <ListingBulkResultsDialog view={results} onClose={() => setResults(null)} />
      <BulkContentEditDialog open={editing} listingIds={checkedIds} onClose={() => setEditing(false)} onDone={() => void query.refetch()} />
    </div>
  );
}
