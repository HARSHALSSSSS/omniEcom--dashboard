import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import type { ProductOverview, ProductTab } from "@/types/productDetail";
import { ProductImage } from "./ProductImage";
import { relative, statusLabel } from "./format";
import type { ActionState, DetailActions } from "./useDetailActions";

const MENU_ITEM =
  "w-full text-left px-3 py-2 text-[14px] leading-[20px] font-normal text-[#000000] hover:bg-[#F5F5F5] rounded-[6px] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:text-[#999999] disabled:hover:bg-transparent";

/** Master product identity: image, title, status, counts and the primary actions. */
export function DetailHeader({
  overview,
  actions,
  onTab,
}: {
  overview: ProductOverview;
  actions: DetailActions;
  onTab: (tab: ProductTab) => void;
}) {
  const navigate = useNavigate();
  const { product } = overview;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { state } = actions;
  const published = overview.statusPanel.listings.state === "published";

  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  const item = (label: string, s: ActionState, run: () => void, busy = false) => (
    <button
      type="button"
      role="menuitem"
      disabled={!s.enabled || busy}
      title={s.enabled ? undefined : s.reason}
      onClick={() => {
        setMenuOpen(false);
        run();
      }}
      className={MENU_ITEM}
    >
      {label}
    </button>
  );

  return (
    <div className="w-full flex flex-col md:flex-row items-start justify-between gap-6 pb-2">
      <div className="flex flex-row items-center gap-5 min-w-0">
        <ProductImage url={overview.primaryImage?.url} alt={product.title} className="w-[100px] h-[100px] rounded-[8px] border border-[#EAEAEA] shrink-0" />

        <div className="flex flex-col items-start gap-1 min-w-0">
          {product.category ? <span className="text-[10px] font-medium leading-[12px] uppercase text-[#707070]">{product.category.name}</span> : null}
          <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight break-words max-w-full">{product.title}</h1>
          <div className="flex flex-row flex-wrap items-center gap-3 text-[12px] leading-[17px]">
            <span className="text-[#666666]">SKU family: {product.skuFamily}</span>
            <span className="box-border px-2 py-0.5 border border-[#EAEAEA] rounded-[4px] text-[11px] font-medium text-[#000000]">{statusLabel(product.status)}</span>
            {product.category ? <span className="text-[#666666]">{product.category.name}</span> : null}
          </div>
          <div className="text-[12px] font-normal leading-[17px] text-[#666666]">
            {overview.variants.count} {overview.variants.count === 1 ? "variant" : "variants"} · {overview.channels.connected} sales{" "}
            {overview.channels.connected === 1 ? "channel" : "channels"} · Last updated {relative(product.updatedAt)}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0">
        <div className="flex flex-row items-center gap-2">
          <button
            type="button"
            disabled={!state.edit.enabled}
            title={state.edit.enabled ? undefined : state.edit.reason}
            onClick={() => navigate(`${ROUTES.PRODUCTS}/${product.id}/edit`)}
            className="px-4 h-[36px] bg-[#000000] text-[#FFFFFF] rounded-[8px] text-[12px] font-semibold hover:bg-[#1A1A1A] transition-colors disabled:bg-[#BDBDBD] disabled:cursor-not-allowed"
          >
            Edit product
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
              className="px-4 h-[36px] bg-[#FFFFFF] border border-[#666666] text-[#000000] rounded-[8px] text-[12px] font-semibold hover:bg-[#F5F5F5] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>More</span>
              <ChevronDown className="h-3 w-3 text-[#666666]" aria-hidden="true" />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-[42px] z-50 w-[172px] bg-[#FFFFFF] border border-[#EAEAEA] shadow-[0px_4px_16px_rgba(0,0,0,0.08)] rounded-[10px] p-1.5 flex flex-col">
                {item("Duplicate", state.duplicate, actions.duplicate, actions.duplicating)}
                {item(actions.isArchived ? "Unarchive" : "Archive", state.archive, () => (actions.isArchived ? actions.archiveOrRestore() : actions.setArchiveOpen(true)), actions.archiving)}
                {item("Export", state.export, actions.exportCsv, actions.exporting)}
                {item("View activity", { enabled: true }, () => onTab("activity"))}
              </div>
            )}
          </div>
        </div>
        {published ? (
          <button type="button" onClick={() => onTab("listings")} className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer">
            Manage listings
          </button>
        ) : (
          <button
            type="button"
            disabled={!state.publish.enabled}
            title={state.publish.enabled ? undefined : state.publish.reason}
            onClick={() => actions.setPublishOpen(true)}
            className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer disabled:cursor-not-allowed disabled:text-[#999999] disabled:no-underline"
          >
            Publish product
          </button>
        )}
      </div>
    </div>
  );
}

/** Products / <title> (the top bar carries the full breadcrumb; this is the in-page way back) */
export function DetailBackLink({ title }: { title: string }) {
  return (
    <div className="w-full flex items-center text-[12px] font-normal leading-[17px]">
      <div className="flex items-center gap-2 text-[#666666] min-w-0">
        <Link to={ROUTES.PRODUCTS} className="hover:text-[#000000] transition-colors">
          Products
        </Link>
        <span className="text-[#BDBDBD]">/</span>
        <span className="text-[#000000] font-medium truncate">{title}</span>
      </div>
    </div>
  );
}
