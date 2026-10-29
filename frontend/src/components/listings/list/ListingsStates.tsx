import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import type { ListingChannels } from "@/types/listing";

const PRIMARY = "flex h-9 min-h-[44px] sm:min-h-9 cursor-pointer items-center justify-center rounded-lg bg-[#000000] px-5 text-[12px] font-semibold text-white shadow-none transition-colors hover:bg-neutral-800";
const SECONDARY = "flex h-9 min-h-[44px] sm:min-h-9 cursor-pointer items-center justify-center rounded-lg border border-[#BDBDBD] bg-white px-5 text-[12px] font-medium text-[#000000] shadow-none transition-colors hover:bg-neutral-50";

function Box({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-[#EAEAEA] bg-white px-4 sm:px-6 py-6 text-center">
      <h2 className="text-[16px] font-semibold tracking-tight text-[#000000]">{title}</h2>
      <p className="max-w-[520px] text-[13px] text-[#666666]">{description}</p>
      {children && <div className="flex flex-col sm:flex-row items-center gap-3 pt-3">{children}</div>}
    </div>
  );
}

/** a filter, search or tab that leaves nothing to show (inside the table area) */
export function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex h-44 w-full flex-col items-center justify-center gap-2 border-b border-[#EAEAEA] text-sm text-[#666666]">
      <p>No listings match the current filters.</p>
      <button type="button" onClick={onClear} className="min-h-[44px] sm:min-h-0 inline-flex items-center cursor-pointer text-xs font-semibold text-black underline">
        Clear all filters
      </button>
    </div>
  );
}

interface EmptyCatalogProps {
  masterProducts: number | undefined;
  channels: ListingChannels | undefined;
  onCreate: () => void;
}

/** nothing is listed on any marketplace yet: the design's empty state, with the connected channels */
export function EmptyCatalog({ masterProducts, channels, onCreate }: EmptyCatalogProps) {
  const connected = (channels?.accounts ?? []).filter((a) => a.status === "active");
  const names = new Map((channels?.marketplaces ?? []).map((m) => [m.code, m.name]));
  const codes = [...new Set(connected.map((a) => a.marketplace))];
  return (
    <>
      <div className="flex w-full flex-col items-center justify-center rounded-xl border border-[#EAEAEA] bg-white px-4 sm:px-6 py-12 sm:py-24 text-center shadow-none">
        <h2 className="text-[20px] font-semibold leading-snug tracking-tight text-[#000000]">Your master products are ready for the marketplace.</h2>
        <p className="mt-2 max-w-[540px] text-[13px] font-normal text-[#666666]">Choose a connected channel and prepare your first listings to start selling across marketplaces.</p>

        <div className="my-7 h-[1px] w-44 bg-[#EAEAEA]" />

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto justify-center">
          <button type="button" onClick={onCreate} className={PRIMARY}>
            Create listing
          </button>
          <Link to={ROUTES.LISTINGS_PUBLISH} className={SECONDARY}>
            Explore publishing opportunities
          </Link>
        </div>

        <span className="mt-5 text-[11px] font-normal text-[#666666]">
          {masterProducts === undefined ? "" : `${masterProducts} master products ready to list · `}
          {codes.length} channels connected ·{" "}
          <Link to={ROUTES.PRODUCTS} className="underline">
            Go to products
          </Link>
        </span>
      </div>

      <div className="w-full space-y-2 pt-2">
        <span className="text-[10px] font-medium uppercase leading-[12px] tracking-wider text-[#707070]">CONNECTED CHANNELS</span>
        <div className="flex flex-row flex-wrap items-center gap-2.5">
          {codes.length === 0 ? (
            <Link to={ROUTES.MARKETPLACE_HUB} className="flex h-9 min-h-[44px] sm:min-h-9 items-center gap-2 rounded-lg border border-[#EAEAEA] bg-white px-3.5 text-[12px] font-medium text-[#000000] hover:bg-neutral-50">
              No marketplace connected · Open marketplace hub
            </Link>
          ) : (
            codes.map((code) => (
              <Link key={code} to={ROUTES.MARKETPLACE_HUB} className="flex h-9 min-h-[44px] sm:min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-[#EAEAEA] bg-white px-3.5 text-[12px] font-medium text-[#000000] shadow-none transition-colors hover:bg-neutral-50">
                <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                <span>{names.get(code) ?? code}</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}

/** the "Not listed" tab is empty: every product is listed, or no marketplace is connected */
export function EmptyNotListed({ hasAccounts }: { hasAccounts: boolean }) {
  return hasAccounts ? (
    <Box title="Everything is listed." description="Every active product already has a listing on each connected marketplace account that accepts listings." />
  ) : (
    <Box title="No marketplace connected." description="Connect a marketplace account to list your products on it.">
      <Link to={ROUTES.MARKETPLACE_HUB} className={PRIMARY}>
        Open marketplace hub
      </Link>
    </Box>
  );
}
