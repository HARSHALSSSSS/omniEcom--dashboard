import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, CheckCircle2, Minus, MoreHorizontal } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { toAppPath } from "@/lib/links";
import type { CatalogPrimaryActionKey, CatalogProduct } from "@/types/product";
import { AuthThumbnail } from "./AuthThumbnail";
import { NO_DELETE_REASON, NO_EDIT_REASON, statusPill, type RowAction, type Tone } from "./listModel";
import { formatNumber } from "@/utils/format";

const TONE_TEXT: Record<Tone, string> = {
  healthy: "text-[#166534]",
  warning: "text-[#B45309]",
  critical: "text-[#B42318]",
  draft: "text-[#6941C6]",
  archived: "text-[#666666]",
};

const ACTION_LABEL: Record<CatalogPrimaryActionKey, string> = {
  open: "Open product",
  review_inventory: "Review inventory",
  update_inventory: "Update inventory",
  continue_editing: "Continue editing",
};

interface ProductCardProps {
  product: CatalogProduct;
  selected: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onToggle: (id: string) => void;
  onAction: (action: RowAction, product: CatalogProduct) => void;
}

export function ProductCard({ product: p, selected, canWrite, canDelete, onToggle, onAction }: ProductCardProps) {
  const navigate = useNavigate();
  const pill = statusPill(p);
  const s = p.summary;
  const isDraft = p.status === "draft";

  // a viewer cannot edit: the "continue editing" shortcut becomes a plain open
  const primaryKey: CatalogPrimaryActionKey = s.primaryAction.key === "continue_editing" && !canWrite ? "open" : s.primaryAction.key;
  const primaryPath = primaryKey === "open" ? `${ROUTES.PRODUCTS}/${p.id}` : toAppPath(s.primaryAction.href);

  const channels = s.channels.map((c) => c.name).join(" / ");
  const channelLine = channels || (isDraft ? "Not published" : "Not listed on a channel");

  return (
    <div
      data-testid="product-card"
      onClick={() => navigate(`${ROUTES.PRODUCTS}/${p.id}`)}
      className={`group relative box-border flex flex-col justify-between p-4 h-auto min-h-[262px] md:h-[262px] bg-[#FFFFFF] rounded-[12px] transition-all cursor-pointer ${
        selected ? "border-2 border-[#000000] shadow-[0px_2px_8px_rgba(0,0,0,0.06)]" : "border border-[#EAEAEA] hover:border-[#BDBDBD]"
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select ${p.title}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(p.id);
        }}
        className={`absolute top-3 left-3 z-10 w-5 h-5 sm:w-4 sm:h-4 rounded-[4px] border flex items-center justify-center transition-all cursor-pointer focus-visible:opacity-100 ${
          selected ? "bg-[#000000] border-[#000000] text-[#FFFFFF]" : "border-[#BDBDBD] bg-[#FFFFFF] opacity-80 sm:opacity-0 group-hover:opacity-100 hover:border-[#000000]"
        }`}
      >
        {selected && <Check className="h-3 w-3 stroke-[3]" aria-hidden />}
      </button>

      <div className="w-full flex flex-col gap-6">
        <div className="w-full flex flex-row items-start justify-between gap-2">
          <div className={`min-w-0 flex flex-col gap-1 transition-all ${selected ? "pl-5" : "group-hover:pl-5 group-focus-within:pl-5"}`}>
            <span className="text-[14px] font-semibold leading-[20px] text-[#000000] truncate" title={p.title}>
              {p.title}
            </span>
            <span className="text-[12px] font-normal leading-[17px] text-[#666666] truncate">
              {s.skuFamily} · {s.variantCount} {s.variantCount === 1 ? "variant" : "variants"}
            </span>
          </div>

          <div className="flex flex-row items-center gap-1 shrink-0">
            <div className={`box-border flex flex-row items-center px-2 py-0.5 gap-1.5 h-[26px] bg-[#FFFFFF] border border-[#EAEAEA] rounded-[4px] text-[11px] font-medium whitespace-nowrap ${TONE_TEXT[pill.tone]}`}>
              {pill.tone === "healthy" && <CheckCircle2 className="h-3 w-3" aria-hidden />}
              {pill.tone === "warning" && <div className="h-3 w-3 rounded-full border border-dashed border-[#B45309]" />}
              {pill.tone === "critical" && <Minus className="h-3 w-3" aria-hidden />}
              {pill.tone === "draft" && <div className="h-3 w-3 rounded-full border border-dashed border-[#6941C6]" />}
              {pill.tone === "archived" && <div className="h-3 w-3 rounded-full border border-[#666666]" />}
              <span>{pill.label}</span>
            </div>
            <RowMenu product={p} canWrite={canWrite} canDelete={canDelete} onAction={onAction} />
          </div>
        </div>

        <div className="w-full flex flex-row items-center gap-4">
          <AuthThumbnail url={s.thumbnailUrl} alt={p.title} initials={s.skuFamily.slice(0, 3).toUpperCase()} />
          <div className="flex-1 min-w-0 flex flex-col items-start gap-1">
            <span className="text-[26px] font-semibold leading-[32px] tracking-tight text-[#000000]">
              {isDraft ? `${s.publishReadinessPct}%` : formatNumber(s.availableUnits)}
            </span>
            <span className="text-[12px] font-normal leading-[17px] text-[#666666]">{isDraft ? "Publish readiness" : "Available units"}</span>
            <span className="text-[11px] font-normal leading-[16px] text-[#666666] truncate max-w-full" title={channelLine}>
              {channelLine}
            </span>
          </div>
        </div>
      </div>

      <div className="text-[12px] font-normal leading-[17px] text-[#333333] -mt-2">{s.hint.text}</div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigate(primaryPath);
        }}
        className="w-full h-[32px] min-h-[44px] sm:min-h-[32px] flex flex-row justify-center items-center gap-2 bg-[#000000] text-[#FFFFFF] rounded-[8px] text-[12px] font-semibold hover:bg-[#1A1A1A] transition-colors"
      >
        <span>{ACTION_LABEL[primaryKey]}</span>
        <span className="text-[13px]" aria-hidden>→</span>
      </button>
    </div>
  );
}

function RowMenu({ product, canWrite, canDelete, onAction }: { product: CatalogProduct; canWrite: boolean; canDelete: boolean; onAction: ProductCardProps["onAction"] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = (label: string, run: () => void, opts: { disabled?: boolean; reason?: string; danger?: boolean } = {}) => (
    <button
      key={label}
      type="button"
      role="menuitem"
      disabled={opts.disabled}
      title={opts.disabled ? opts.reason : undefined}
      onClick={() => {
        setOpen(false);
        run();
      }}
      className={`w-full min-h-[36px] sm:min-h-0 px-2 py-1.5 rounded-[4px] text-left text-[12px] hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${opts.danger ? "text-[#B42318]" : "text-[#000000]"}`}
    >
      {label}
    </button>
  );

  const archived = product.status === "archived";
  return (
    <div className="relative" ref={root} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={`Actions for ${product.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="h-[26px] w-[26px] min-h-[36px] min-w-[36px] sm:min-h-[26px] sm:min-w-[26px] flex items-center justify-center rounded-[4px] text-[#666666] hover:bg-[#F5F5F5] hover:text-[#000000]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[30px] z-40 w-[170px] bg-[#FFFFFF] border border-[#EAEAEA] rounded-[8px] shadow-[0px_4px_12px_rgba(0,0,0,0.08)] p-1">
          {item("Open product", () => navigate(`${ROUTES.PRODUCTS}/${product.id}`))}
          {item("Edit", () => navigate(`${ROUTES.PRODUCTS}/${product.id}/edit`), { disabled: !canWrite, reason: NO_EDIT_REASON })}
          {item("Duplicate", () => onAction("duplicate", product), { disabled: !canWrite, reason: NO_EDIT_REASON })}
          {archived
            ? item("Unarchive", () => onAction("unarchive", product), { disabled: !canWrite, reason: NO_EDIT_REASON })
            : item("Archive", () => onAction("archive", product), { disabled: !canWrite, reason: NO_EDIT_REASON })}
          {item("Delete", () => onAction("delete", product), { disabled: !canDelete, reason: NO_DELETE_REASON, danger: true })}
        </div>
      )}
    </div>
  );
}
