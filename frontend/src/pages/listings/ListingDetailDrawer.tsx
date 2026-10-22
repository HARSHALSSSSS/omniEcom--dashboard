import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import { errorMessage, isApiError } from "@/api/errors";
import { AttributeInput } from "@/components/listings/flows/AttributeInput";
import { accentOf, attributeIssueOf, coerceAttribute, DRAWER_STATUS_LABEL, isGood, STATUS_COLOR, suggestionFor } from "@/components/listings/flows/flowFormat";
import { SuggestionNote } from "@/components/listings/flows/SuggestionNote";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useFixAttribute, useFixSuggestions, useFlowDetails } from "@/hooks/useListingFlows";
import { useStudio } from "@/hooks/useListingStudio";
import type { CompletenessRow } from "@/types/listingFlows";
import type { ListingStudio } from "@/types/listingStudio";
import { formatINR } from "@/utils/format";

export interface ListingDetailDrawerProps {
  listingId: string | null;
  onClose: () => void;
}

const FIELD = "h-8 w-full rounded border border-neutral-300 px-2.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-black";

/** The quick view of a listing (opened from the Listings table). It loads its own data and can fix a missing category attribute on the spot. */
export function ListingDetailDrawer({ listingId, onClose }: ListingDetailDrawerProps) {
  useEffect(() => {
    if (!listingId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listingId, onClose]);

  if (!listingId) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px] transition-opacity" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <DrawerPanel key={listingId} listingId={listingId} onClose={onClose} />
    </div>
  );
}

function DrawerPanel({ listingId, onClose }: { listingId: string; onClose: () => void }) {
  const query = useStudio(listingId);
  const frame = "flex h-full w-[430px] max-w-[95vw] flex-col justify-between overflow-y-auto border-l border-[#EAEAEA] bg-white shadow-2xl animate-in slide-in-from-right duration-200";

  if (query.isLoading) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Listing details" className={frame}>
        <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-500" aria-hidden />
          <span className="text-xs text-neutral-500">Loading listing…</span>
        </div>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Listing details" className={frame}>
        <div className="space-y-3 p-6 text-sm">
          <div className="flex justify-end">
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 cursor-pointer rounded p-1 text-neutral-400 hover:text-black">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p role="alert" className="text-red-700">
            Could not load this listing. {errorMessage(query.error)}
          </p>
          <button type="button" onClick={() => void query.refetch()} className="cursor-pointer text-xs font-semibold underline">
            Try again
          </button>
        </div>
      </div>
    );
  }
  return <DrawerBody studio={query.data} frame={frame} onClose={onClose} />;
}

/** the fixed completeness rows when the details call is not (yet) there: what the studio itself knows */
function derivedRows(studio: ListingStudio): CompletenessRow[] {
  const hasImage = studio.media.length > 0;
  return [
    { key: "title", label: "Title", status: studio.preview.title ? "pass" : "fail", detail: studio.preview.title, field: "title" },
    { key: "images", label: "Images", status: hasImage ? "pass" : "warn", detail: hasImage ? `${studio.media.length} images` : "No product images", field: "images" },
    { key: "sku", label: "SKU", status: "pass", detail: studio.listing.sku, field: "sku" },
    { key: "category", label: "Category", status: studio.category.marketplaceCategoryId ? "pass" : "fail", detail: studio.category.marketplaceCategoryName ?? "", field: "category" },
  ];
}

function DrawerBody({ studio, frame, onClose }: { studio: ListingStudio; frame: string; onClose: () => void }) {
  const { listing, account, product, preview, stock, readiness } = studio;
  const canWrite = useCan("listings:write");
  const fix = useFixAttribute(listing.id);
  const detailsQuery = useFlowDetails(listing.id);
  const issue = attributeIssueOf(studio);
  const suggestionsQuery = useFixSuggestions(listing.id, issue !== null);
  const [manual, setManual] = useState(false);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [fixed, setFixed] = useState<{ label: string; value: string } | null>(null);

  const status = listing.table.screenStatus;
  const color = STATUS_COLOR[status];
  const good = isGood(status) && readiness.ready;
  const variants = detailsQuery.data?.variantsCount ?? studio.variations.length;
  const image = studio.media.find((m) => m.url)?.url ?? product.thumbnailUrl;
  const studioPath = `${ROUTES.LISTINGS}/${listing.id}`;
  const allowed = issue?.attribute.allowedValues?.slice(0, 6) ?? [];
  const suggestion = dismissed ? null : suggestionFor(suggestionsQuery.data, issue?.attribute.key);
  const rows = detailsQuery.data?.completeness ?? derivedRows(studio);
  const passed = readiness.groups.reduce((n, g) => n + g.passed, 0);
  const total = readiness.groups.reduce((n, g) => n + g.total, 0);

  const save = (value: string, viaSuggestion = false) => {
    if (!issue) return;
    const coerced = coerceAttribute(issue.attribute, value);
    if (coerced === null) {
      setError(`Enter a valid ${issue.attribute.label.toLowerCase()}.`);
      return;
    }
    setError(null);
    const label = issue.attribute.label;
    fix.mutate(
      { key: issue.attribute.key, value: coerced, version: listing.version },
      {
        onSuccess: () => {
          setManual(false);
          setFixed({ label, value });
          setMessage(`${label} set to "${value}"${viaSuggestion ? " from the suggestion" : ""} and the listing was checked again.`);
        },
        onError: (e) => setError(isApiError(e) && e.code === "VERSION_CONFLICT" ? "This listing was changed by someone else. The latest version is loaded: try again." : errorMessage(e)),
      },
    );
  };

  const review = (value: string) => {
    setError(null);
    setText(value);
    setManual(true);
  };

  /** "Fix with AI": run the engine again, then let the user review what it found: nothing is saved before they confirm */
  const fixWithAi = async () => {
    setAiBusy(true);
    setError(null);
    setDismissed(false);
    const res = await suggestionsQuery.refetch();
    setAiBusy(false);
    const found = suggestionFor(res.data, issue?.attribute.key);
    if (found) review(String(found.value));
    else {
      setError(`No suggestion could be made for ${issue?.attribute.label.toLowerCase() ?? "this attribute"}: enter it by hand.`);
      review("");
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Listing details" className={frame}>
      <div className="space-y-5 p-6">
        {/* top header row */}
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <span className="text-[13px] font-normal text-[#666666]">{account.marketplaceName} listing</span>
            <div className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color }}>
              {good ? <CheckCircle2 className="h-3.5 w-3.5 stroke-[2.2]" aria-hidden /> : <AlertTriangle className="h-3.5 w-3.5 stroke-[2.2]" aria-hidden />}
              <span>
                {DRAWER_STATUS_LABEL[status]} · {readiness.percent}%
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 cursor-pointer rounded p-1 text-neutral-400 transition-colors hover:text-black">
            <X className="h-4 w-4 stroke-[2]" aria-hidden />
          </button>
        </div>

        {/* title and metadata */}
        <div>
          <h2 className="text-[24px] font-semibold leading-tight tracking-tight text-black">{listing.productTitle}</h2>
          <p className="mt-1 text-xs text-[#666666]">
            {listing.sku} · {variants} {variants === 1 ? "variant" : "variants"} · {account.marketplaceName}
          </p>
        </div>

        {message && (
          <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <span>{message}</span>
          </div>
        )}

        {/* listing preview card */}
        <div className="space-y-2.5 rounded-xl border border-neutral-100 bg-[#F8F9FA] p-3.5">
          <span className="block text-[10px] font-semibold uppercase leading-none tracking-wider text-neutral-400">LISTING PREVIEW</span>
          <div className="flex items-center gap-3">
            {image ? (
              <img src={image} alt={listing.productTitle} className="h-14 w-14 shrink-0 rounded-lg border border-neutral-200/60 bg-neutral-200 object-cover" />
            ) : (
              <div aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-neutral-200/60 bg-neutral-200 text-xs font-semibold text-neutral-500">
                {listing.productTitle.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h4 className="truncate text-xs font-semibold text-black">{preview.title}</h4>
              <p className="mt-0.5 text-[11px] text-[#666666]">
                {preview.priceMinor === null ? "No price yet" : formatINR(preview.priceMinor)}
                {preview.mrpMinor !== null && preview.priceMinor !== null && preview.mrpMinor > preview.priceMinor ? ` · MRP ${formatINR(preview.mrpMinor)}` : ""}
              </p>
              <p className="mt-0.5 text-[11px] text-[#666666]">{stock.sellable} available</p>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-sm bg-[#ECEFF1] px-2 py-0.5 text-[10px] font-medium text-[#37474F]">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accentOf(listing.marketplace) }} />
                {account.marketplaceName}
              </span>
            </div>
          </div>
        </div>

        {/* listing completeness: Title, Images, SKU, Category, Weight, then the failing attribute */}
        <div className="space-y-2.5 border-t border-[#F0F0F0] pt-2">
          <h3 className="text-[13px] font-semibold text-black">Listing completeness</h3>
          <div className="space-y-2 text-xs">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {r.status === "pass" ? (
                    <Check className="h-3.5 w-3.5 stroke-[2.5] text-[#16A34A]" aria-label="Complete" />
                  ) : (
                    <AlertTriangle className={`h-3.5 w-3.5 stroke-[2.2] ${r.status === "fail" ? "text-[#DC2626]" : "text-[#D97706]"}`} aria-label={r.status === "fail" ? "Blocking" : "Needs a look"} />
                  )}
                  <span className={r.status === "pass" ? "text-black" : r.status === "fail" ? "font-medium text-[#DC2626]" : "font-medium text-[#D97706]"}>{r.label}</span>
                </div>
                {r.status !== "pass" && <span className="truncate text-right text-[11px] text-neutral-400">{r.detail}</span>}
              </div>
            ))}
            {/* the material-style requirement of the category */}
            {issue ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 stroke-[2.2] text-[#D97706]" aria-hidden />
                  <span className="font-medium text-[#D97706]">{issue.attribute.label}</span>
                </div>
                <span className="text-xs text-neutral-400">{issue.attribute.required ? "Required for this category" : "Recommended for this category"}</span>
              </div>
            ) : fixed ? (
              <div className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 stroke-[2.5] text-[#16A34A]" aria-hidden />
                <span className="font-medium text-black">
                  {fixed.label}: {fixed.value}
                </span>
              </div>
            ) : null}
          </div>
          {/* the real readiness checks, as extras */}
          <div className="space-y-1 pt-1 text-[11px] text-neutral-500">
            <p>
              Readiness: {passed} of {total} checks pass
            </p>
            {readiness.groups
              .filter((g) => g.status !== "pass")
              .map((g) => (
                <ul key={g.key} className="space-y-0.5 pl-3">
                  {g.items
                    .filter((i) => i.status !== "pass")
                    .map((i) => (
                      <li key={i.key} className={i.status === "fail" ? "text-[#DC2626]" : undefined}>
                        <span className="font-medium">{g.label}:</span> {i.message}
                      </li>
                    ))}
                </ul>
              ))}
          </div>
        </div>

        {/* recommended value for the missing attribute */}
        {issue && (
          <div className="space-y-2.5 border-t border-[#F0F0F0] pt-2">
            <h3 className="text-[13px] font-semibold text-black">Recommended {issue.attribute.label.toLowerCase()}</h3>
            {!manual ? (
              <>
                {suggestion ? (
                  <>
                    <SuggestionNote suggestion={suggestion} />
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => review(String(suggestion.value))}
                        disabled={!canWrite || fix.isPending}
                        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-black px-3.5 text-xs font-semibold text-white shadow-none transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Review suggestion
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDismissed(true);
                          review("");
                        }}
                        className="cursor-pointer text-xs font-medium text-neutral-600 hover:text-black"
                      >
                        Dismiss
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-neutral-500">{issue.item.message}</p>
                )}
                {allowed.length > 0 && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {allowed.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => save(v)}
                          disabled={!canWrite || fix.isPending}
                          className="cursor-pointer rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-black transition-colors hover:border-black disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-neutral-500">Values the {account.marketplaceName} category accepts. Choosing one saves it to this listing.</p>
                  </>
                )}
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save(text, suggestion !== null && text === String(suggestion.value));
                }}
                className="space-y-2 pt-1"
              >
                <div className="space-y-1">
                  <label htmlFor="drawer-attribute" className="text-[11px] font-medium text-neutral-600">
                    Specify {issue.attribute.label.toLowerCase()} for {account.marketplaceName}:
                  </label>
                  <AttributeInput id="drawer-attribute" attribute={issue.attribute} value={text} onChange={setText} className={FIELD} />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button type="submit" disabled={fix.isPending || !text.trim()} className="flex h-7 cursor-pointer items-center gap-1.5 rounded bg-black px-3 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50">
                    {fix.isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                    Save
                  </button>
                  <button type="button" onClick={() => setManual(false)} className="h-7 cursor-pointer rounded border border-neutral-300 px-2.5 text-xs text-neutral-700 hover:bg-neutral-100">
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {error && (
              <p role="alert" className="text-[11px] text-red-600">
                {error}
              </p>
            )}
          </div>
        )}

        {/* units available */}
        <div className="border-t border-[#F0F0F0] pt-2">
          <div className="text-[32px] font-semibold leading-none text-black">{stock.sellable}</div>
          <p className="mt-1 text-xs text-neutral-500">units available</p>
        </div>
      </div>

      {/* bottom actions */}
      <div className="space-y-2.5 border-t border-[#EAEAEA] bg-white p-6 pt-4">
        <Link to={studioPath} onClick={onClose} className="flex h-10 w-full cursor-pointer items-center justify-center rounded-lg bg-black text-xs font-semibold text-white shadow-none transition-colors hover:bg-neutral-800">
          Open listing
        </Link>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => void fixWithAi()}
            disabled={!issue || !canWrite || aiBusy}
            title={!issue ? "Nothing to fix here" : !canWrite ? "Your role can view listings but not change them." : "Suggests a value from the product data. Nothing is saved until you confirm it."}
            className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-neutral-300 text-xs font-semibold text-black shadow-none transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiBusy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Sparkles className="h-3 w-3 text-neutral-700" aria-hidden />}
            Fix with AI
          </button>
          <button
            type="button"
            onClick={() => review("")}
            disabled={!issue || !canWrite}
            title={!issue ? "Nothing to fix here" : !canWrite ? "Your role can view listings but not change them." : undefined}
            className="flex h-9 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 text-xs font-semibold text-black shadow-none transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Manual Fix
          </button>
        </div>
        <Link to={ROUTES.LISTING_BLOCKED.replace(":id", listing.id)} onClick={onClose} className="block text-center text-xs font-medium text-neutral-600 hover:text-black hover:underline">
          Issue details
        </Link>
      </div>
    </div>
  );
}
