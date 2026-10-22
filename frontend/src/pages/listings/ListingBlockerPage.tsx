import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Sparkles, X } from "lucide-react";
import { errorMessage, isApiError } from "@/api/errors";
import { AttributeInput } from "@/components/listings/flows/AttributeInput";
import { attributeHint, attributeIssueOf, coerceAttribute, failingItems, suggestionFor } from "@/components/listings/flows/flowFormat";
import { FlowError, FlowHeader, FlowLoading, OtherChannels } from "@/components/listings/flows/FlowShell";
import { SuggestionNote } from "@/components/listings/flows/SuggestionNote";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useFixAttribute, useFixSuggestions, useFlowDetails, useListingChannelsView, usePublishListing } from "@/hooks/useListingFlows";
import { useStudio } from "@/hooks/useListingStudio";
import { cn } from "@/utils/cn";

const FIX_HINT: Record<string, string> = {
  edit_content: "Edit the content of this listing in the Listing Studio.",
  upload_images: "Add product images in the product's media.",
  set_price: "Set a valid selling price in the Listing Studio.",
  set_mrp: "Set the MRP in the Listing Studio.",
  map_category: "Map this product to a marketplace category in the Listing Studio.",
  add_barcode: "Add a barcode to the product variant.",
  restock: "Add stock for this channel.",
  reconnect_account: "Reconnect the marketplace account.",
  validate: "Run the validation in the Listing Studio.",
  review_marketplace_feedback: "Review what the marketplace reported in the Listing Studio.",
};

const FIELD = "h-8 w-full rounded border border-neutral-300 bg-white px-3 text-xs text-black focus:outline-none focus:ring-1 focus:ring-black";
const BTN_PRIMARY = "flex h-9 cursor-pointer items-center rounded-lg bg-black px-4 text-xs font-semibold text-white shadow-none transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_OUTLINE = "flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[#BDBDBD] bg-white px-4 text-xs font-medium text-black shadow-none transition-colors hover:bg-neutral-50";

/** /listings/:id/blocked: why a listing cannot be published, fixed right here (the value is saved to the listing and re-validated) */
export default function ListingBlockerPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canWrite = useCan("listings:write");

  const studioQuery = useStudio(id);
  const channelsQuery = useListingChannelsView(id);
  const detailsQuery = useFlowDetails(id);
  const fix = useFixAttribute(id);
  const publish = usePublishListing(id);
  // the engine only has something to say while an attribute is failing; it reads, it never saves
  const hasIssue = studioQuery.data ? attributeIssueOf(studioQuery.data) !== null : false;
  const suggestionsQuery = useFixSuggestions(id, hasIssue);

  const [isFixing, setIsFixing] = useState(false);
  const [text, setText] = useState("");
  const [fixedKey, setFixedKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  if (studioQuery.isLoading) return <FlowLoading text="Loading listing issue details…" />;
  if (studioQuery.isError || !studioQuery.data) return <FlowError text="Failed to load listing issue details." error={studioQuery.error} onRetry={() => void studioQuery.refetch()} />;

  const studio = studioQuery.data;
  const { listing, account } = studio;
  const failing = failingItems(studio);
  const issue = attributeIssueOf(studio);
  const primary = issue?.item ?? failing[0] ?? null;
  const others = failing.filter((f) => f !== primary);
  const isResolved = failing.length === 0;
  const isLive = listing.table.screenStatus === "live";
  const marketplaceName = account.marketplaceName;
  const studioPath = `${ROUTES.LISTINGS}/${listing.id}`;
  const category = studio.category.marketplaceCategoryName ?? studio.category.marketplaceCategoryId;
  const categoryDetails = detailsQuery.data?.category;
  const channelCategory = categoryDetails?.channelCategory ?? (category ? `${marketplaceName} ${category}` : "No category yet");
  /** "Apparel > Tops > Shirts": the full path of the marketplace category, else of your own category */
  const fullCategoryPath = categoryDetails?.fullPath ?? studio.category.marketplaceCategoryName ?? "Not mapped yet";
  const variantsCount = detailsQuery.data?.variantsCount ?? channelsQuery.data?.variantsCount;
  const fixedAttribute = fixedKey ? studio.category.attributes.find((a) => a.key === fixedKey) ?? null : null;
  const editing = issue?.attribute ?? fixedAttribute;
  const suggestion = suggestionFor(suggestionsQuery.data, issue?.attribute.key);

  const openFix = (prefill?: string) => {
    setFormError(null);
    setText(prefill ?? (editing?.value !== null && editing?.value !== undefined ? String(editing.value) : ""));
    setIsFixing(true);
  };

  /** "Fix with AI": run the engine again and open the form with what it found; the user still confirms before anything is saved */
  const fixWithAi = async () => {
    setAiBusy(true);
    setNotice(null);
    const res = await suggestionsQuery.refetch();
    setAiBusy(false);
    const found = suggestionFor(res.data, issue?.attribute.key);
    if (found) openFix(String(found.value));
    else {
      openFix();
      setNotice({ tone: "bad", text: `No suggestion could be made for ${issue?.attribute.label.toLowerCase() ?? "this attribute"}: enter it by hand.` });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const value = coerceAttribute(editing, text);
    if (value === null) {
      setFormError(`Enter a valid ${editing.label.toLowerCase()}.`);
      return;
    }
    setFormError(null);
    fix.mutate(
      { key: editing.key, value, version: listing.version },
      {
        onSuccess: ({ validation }) => {
          setIsFixing(false);
          setFixedKey(editing.key);
          const left = validation?.errors.length ?? 0;
          setNotice({
            tone: "ok",
            text: `${editing.label} saved for ${marketplaceName} and the listing was checked again.${left > 0 ? ` ${left} ${left === 1 ? "issue still needs" : "issues still need"} fixing.` : ""}`,
          });
        },
        onError: (err) => setFormError(isApiError(err) && err.code === "VERSION_CONFLICT" ? "This listing was changed by someone else. The latest version is loaded: check it and save again." : errorMessage(err, "Could not save this value. Please try again.")),
      },
    );
  };

  const publishNow = () =>
    publish.mutate(undefined, {
      onSuccess: (res) => {
        if (res.outcome === "queued") setNotice({ tone: "ok", text: "Publishing started. Follow it in the Listing Studio." });
        else setNotice({ tone: "bad", text: res.steps.find((s) => s.status === "failed")?.message ?? "The listing could not be published." });
      },
      onError: (err) => setNotice({ tone: "bad", text: errorMessage(err, "Could not publish this listing. Please try again.") }),
    });

  return (
    <div className="flex w-full flex-col items-start gap-6 pb-24 font-['Inter',sans-serif] text-[#000000]">
      {/* breadcrumb */}
      <div className="flex w-full items-center justify-between text-xs text-[#666666]">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(ROUTES.LISTINGS)} className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-black">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            <span>Workspace</span>
          </button>
          <span>/</span>
          <button type="button" onClick={() => navigate(ROUTES.LISTINGS)} className="cursor-pointer transition-colors hover:text-black">
            Listings
          </button>
          <span>/</span>
          <span className="font-medium text-black">{listing.productTitle} · Blocker</span>
        </div>
      </div>

      <FlowHeader />

      {/* banner */}
      {!isResolved ? (
        <div role="alert" className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-[#FCA5A5] bg-white p-4">
          <h3 className="text-sm font-semibold text-[#DC2626]">1 listing is blocked and cannot be published</h3>
          <p className="text-xs text-[#DC2626]">
            {issue ? (
              `${issue.attribute.required ? "A mandatory product attribute" : "A product attribute"} is ${issue.attribute.value === null ? "missing" : "invalid"}. Resolve the issue below to enable publishing.`
            ) : (
              <>
                {failing.length > 1 ? `${failing.length} checks need fixing. ` : ""}
                {primary?.message}
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="flex w-full items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            <div>
              <h3 className="text-sm font-semibold">{isLive ? "This listing is live" : "This listing is ready to publish"}</h3>
              <p className="text-xs text-emerald-700">{isLive ? "Nothing blocks this listing." : "Every blocking check passes now."}</p>
            </div>
          </div>
          {!isLive && (
            <button
              type="button"
              onClick={publishNow}
              disabled={!canWrite || publish.isPending}
              title={canWrite ? undefined : "Your role can view listings but not change them."}
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publish.isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              Publish now →
            </button>
          )}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className={cn("flex w-full items-center gap-2 rounded-lg border p-3 text-xs", notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700")}
        >
          {notice.tone === "ok" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* main issue card */}
      <section className="relative w-full space-y-5 rounded-lg border border-[#EAEAEA] bg-white p-6 shadow-none">
        <div className={cn("absolute bottom-6 left-0 top-6 w-1 rounded-r", !isResolved ? "bg-[#DC2626]" : "bg-[#16A34A]")} />

        <div className="flex items-start justify-between pl-3">
          <div className="space-y-1">
            <span className="text-xs text-[#666666]">
              {marketplaceName} · {!isResolved ? "Blocked" : isLive ? "Live" : "Ready"}
            </span>
            <h2 className="text-[20px] font-semibold leading-snug tracking-tight text-black">{listing.productTitle}</h2>
            <p className="text-xs text-[#666666]">
              {listing.sku}
              {variantsCount !== undefined && ` · ${variantsCount} ${variantsCount === 1 ? "variant" : "variants"}`} · {channelCategory}
            </p>
          </div>
          <span
            className={cn("rounded border px-2.5 py-0.5 text-xs font-medium", !isResolved ? "border-[#DC2626] bg-red-50/50 text-[#DC2626]" : "border-[#16A34A] bg-emerald-50/50 text-[#16A34A]")}
          >
            {!isResolved ? "Blocked" : isLive ? "Live" : "Ready"}
          </span>
        </div>

        <div className="space-y-3 pl-3 pt-2">
          <h4 className={cn("text-sm font-semibold", !isResolved ? "text-[#DC2626]" : "text-emerald-700")}>
            {isResolved
              ? fixedAttribute
                ? "✓ Attribute configured"
                : "✓ No blocking issues"
              : issue
                ? `${issue.attribute.required ? "Mandatory" : "Invalid"} product attribute ${issue.attribute.value === null ? "missing" : "invalid"}`
                : `${primary?.label ?? "Listing"} needs attention`}
          </h4>

          <div className="max-w-xl space-y-1.5 text-xs">
            {(issue || fixedAttribute) && (
              <div className="flex items-center justify-between">
                <span className="text-[#666666]">{isResolved ? "Attribute" : "Missing attribute"}</span>
                <span className={cn("font-medium", !isResolved ? "text-[#DC2626]" : "text-emerald-700")}>
                  {(issue?.attribute ?? fixedAttribute)?.label}
                  {(issue?.attribute ?? fixedAttribute)?.value != null && ` (${String((issue?.attribute ?? fixedAttribute)?.value)})`}
                </span>
              </div>
            )}
            {!isResolved && !issue && primary && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#666666]">Issue</span>
                <span className="text-right font-medium text-[#DC2626]">{primary.label}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[#666666]">Affected marketplace</span>
              <span className="font-medium text-black">{marketplaceName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#666666]">Category</span>
              <span className="font-medium text-black">{fullCategoryPath}</span>
            </div>
          </div>

          {!isResolved && primary && (
            <p className="pt-1 text-xs leading-relaxed text-[#666666]">
              {issue && `Add ${issue.attribute.label.toLowerCase()} to continue. This attribute is required for ${channelCategory} categories and cannot be published without it. `}
              {primary.message}
              {!issue && primary.fix ? ` ${FIX_HINT[primary.fix.action] ?? ""}` : ""}
            </p>
          )}

          {others.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-[#666666]">
              {others.map((o) => (
                <li key={o.key}>
                  <span className="font-medium text-black">{o.label}:</span> {o.message}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-3 pt-2">
            {!isResolved && issue ? (
              <>
                <button type="button" onClick={() => openFix()} disabled={!canWrite} title={canWrite ? undefined : "Your role can view listings but not change them."} className={BTN_PRIMARY}>
                  Fix listing
                </button>
                <button
                  type="button"
                  onClick={() => void fixWithAi()}
                  disabled={!canWrite || aiBusy}
                  title={canWrite ? "Suggests a value from the product data. Nothing is saved until you confirm it." : "Your role can view listings but not change them."}
                  className={cn(BTN_OUTLINE, "font-semibold disabled:cursor-not-allowed disabled:opacity-50")}
                >
                  {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5 text-neutral-700" aria-hidden />}
                  Fix with AI
                </button>
              </>
            ) : !isResolved ? (
              <Link to={studioPath} className={BTN_PRIMARY}>
                Fix in Listing Studio
              </Link>
            ) : fixedAttribute ? (
              <button type="button" onClick={() => openFix()} disabled={!canWrite} className={cn(BTN_OUTLINE, "font-semibold disabled:cursor-not-allowed disabled:opacity-50")}>
                Edit attribute
              </button>
            ) : null}
            <Link to={studioPath} className={BTN_OUTLINE}>
              <span>View full listing</span>
              <ExternalLink className="h-3.5 w-3.5 text-[#666666]" aria-hidden />
            </Link>
          </div>
        </div>

        {isFixing && editing && (
          <form onSubmit={submit} aria-label={`Provide ${editing.label}`} className="ml-3 mt-4 max-w-xl space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-black">
                Provide {editing.label} for {marketplaceName}
              </span>
              <button type="button" onClick={() => setIsFixing(false)} aria-label="Close" className="cursor-pointer text-neutral-500 hover:text-black">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="space-y-1">
              <label htmlFor="blocker-attribute" className="text-[11px] font-medium text-neutral-600">
                {editing.label} specification:
              </label>
              <AttributeInput id="blocker-attribute" attribute={editing} value={text} onChange={setText} className={FIELD} />
              <span className="text-[10px] text-neutral-500">{attributeHint(editing, marketplaceName, studio.category.marketplaceCategoryName)}</span>
              {suggestion && editing.key === suggestion.key && (
                <div className="space-y-1.5 pt-1.5">
                  <SuggestionNote suggestion={suggestion} />
                  {text !== String(suggestion.value) && (
                    <button type="button" onClick={() => setText(String(suggestion.value))} className="cursor-pointer text-[11px] font-semibold text-black underline">
                      Use this suggestion
                    </button>
                  )}
                </div>
              )}
              {formError && (
                <p role="alert" className="text-[11px] text-red-600">
                  {formError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setIsFixing(false)} className="h-8 cursor-pointer rounded border border-neutral-300 px-3 text-xs text-neutral-700 hover:bg-neutral-100">
                Cancel
              </button>
              <button
                type="submit"
                disabled={fix.isPending || !text.trim()}
                className="flex h-8 cursor-pointer items-center gap-1.5 rounded bg-black px-4 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {fix.isPending ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Save & Unblock"
                )}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* other channels */}
      {channelsQuery.isError ? (
        <p role="alert" className="text-xs text-red-700">
          Could not load the other channels of this product.
        </p>
      ) : channelsQuery.data ? (
        <OtherChannels channels={channelsQuery.data.channels} showReadiness />
      ) : (
        <p className="text-xs text-[#666666]">Loading the other channels…</p>
      )}
    </div>
  );
}
