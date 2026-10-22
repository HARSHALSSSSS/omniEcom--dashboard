import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { FlowError, FlowHeader, FlowLoading, OtherChannels } from "@/components/listings/flows/FlowShell";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { usePrepareListing, useUnlistedContext } from "@/hooks/useListingFlows";

/** /listings/:id/unlisted?account=...: a product (variant) that has no listing on that account yet; "Prepare listing" starts it and opens the Listing Studio */
export default function ListingUnlistedPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const accountId = params.get("account");
  const navigate = useNavigate();
  const canWrite = useCan("listings:write");

  const query = useUnlistedContext(id, accountId);
  const prepare = usePrepareListing();
  const [error, setError] = useState<string | null>(null);

  if (!accountId) return <FlowError text="Choose a marketplace account first: open this screen from the Not listed tab of the Listings screen." />;
  if (query.isLoading) return <FlowLoading text="Loading unlisted channel details…" />;
  if (query.isError || !query.data) return <FlowError text="Failed to load unlisted channel details. Please check your connection." error={query.error} onRetry={() => void query.refetch()} />;

  const u = query.data;
  const channelName = u.account.marketplaceName;
  const exists = u.existingListingId !== null;
  const blocked = !canWrite ? "Your role can view listings but not change them." : !u.account.canCreateListings ? `${u.account.displayName} cannot take new listings through the API right now.` : null;

  const handlePrepare = () => {
    setError(null);
    prepare.mutate(
      { variantId: u.variantId, accountId: u.account.id },
      {
        onSuccess: (listing) => navigate(`${ROUTES.LISTINGS}/${listing.id}`),
        onError: (e) => setError(errorMessage(e, "Could not prepare this listing. Please try again.")),
      },
    );
  };

  return (
    <div className="flex w-full flex-col items-start gap-6 pb-24 font-['Inter',sans-serif] text-[#000000]">
      <FlowHeader />

      {/* product header and badge */}
      <div className="relative flex w-full items-start justify-between pl-4">
        <div className="absolute inset-y-0 left-0 w-1 rounded-r bg-[#E5E7EB]" />
        <div className="space-y-1">
          <span className="text-xs font-normal text-[#666666]">
            {channelName} · {exists ? "Draft started" : "Not listed"}
          </span>
          <h2 className="text-[20px] font-semibold leading-snug tracking-tight text-black">{u.productTitle}</h2>
          <p className="text-xs text-[#666666]">
            {u.sku} · {u.variantsCount} {u.variantsCount === 1 ? "variant" : "variants"} · Master catalog
          </p>
        </div>
        <span className="rounded-md border border-[#BDBDBD] bg-white px-3 py-1 text-xs font-medium text-[#666666]">{exists ? "Has a listing" : "Not listed"}</span>
      </div>

      {/* master product card */}
      <section className="w-full space-y-6 rounded-lg border border-[#EAEAEA] bg-white p-6 shadow-none">
        <p className="text-xs text-[#666666]">
          {exists
            ? `${u.productTitle} already has a listing on ${u.account.displayName}. Open it in the Listing Studio to finish and publish it.`
            : `This product exists in your master catalog but has no ${channelName} listing yet. Prepare a listing to map its category and attributes, check readiness and publish it.`}
        </p>

        <div className="max-w-xl space-y-2 text-xs">
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[#666666]">Master SKU</span>
            <span className="font-mono font-medium text-black">{u.sku}</span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[#666666]">Target marketplace</span>
            <span className="font-medium text-black">
              {channelName} · {u.account.displayName}
            </span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[#666666]">Variants</span>
            <span className="font-medium text-black">
              {u.variantsCount} {u.variantsCount === 1 ? "variant" : "variants"}
            </span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[#666666]">Inventory available</span>
            <span className="font-mono font-medium text-black">{u.inventoryAvailable} units</span>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          {exists ? (
            <Link to={`${ROUTES.LISTINGS}/${u.existingListingId}`} className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-black px-4 text-xs font-semibold text-white shadow-none transition-colors hover:bg-neutral-800">
              Open listing
            </Link>
          ) : (
            <button
              type="button"
              onClick={handlePrepare}
              disabled={prepare.isPending || blocked !== null}
              title={blocked ?? undefined}
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-black px-4 text-xs font-semibold text-white shadow-none transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prepare.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Preparing…
                </>
              ) : (
                <span>Prepare listing</span>
              )}
            </button>
          )}
          <Link to={`${ROUTES.PRODUCTS}/${u.productId}`} className="flex h-9 cursor-pointer items-center rounded-lg border border-[#BDBDBD] bg-white px-4 text-xs font-medium text-black shadow-none transition-colors hover:bg-neutral-50">
            View product
          </Link>
        </div>
        {blocked && !exists && <p className="text-[11px] text-[#666666]">{blocked}</p>}
      </section>

      <OtherChannels channels={u.channels} showReadiness={false} />
    </div>
  );
}
