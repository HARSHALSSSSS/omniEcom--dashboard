import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import { isSafeUrl } from "@/utils/security";
import { formatRelativeTime } from "@/utils/format";
import type { ListingBulkAction, ListingRow as Row } from "@/types/listing";
import { CONTENT_ALERT, NO_WRITE_REASON, STATUS_COLOR, STATUS_LABEL, price, readinessColor, rowActionOf, secondaryActionOf, statusPathOf, studioPath } from "./listingFormat";
import { CONTENT_LABELS } from "./listingParams";

interface ListingRowProps {
  row: Row;
  selected: boolean;
  canWrite: boolean;
  busy: boolean;
  onToggle: (id: string) => void;
  onQuickView: (row: Row) => void;
  onAction: (row: Row, action: ListingBulkAction) => void;
}

const LINK = "text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer";

export function ListingRow({ row, selected, canWrite, busy, onToggle, onQuickView, onAction }: ListingRowProps) {
  const t = row.table;
  const score = t.readiness.percent;
  const scoreColor = readinessColor(score);
  const statusColor = STATUS_COLOR[t.screenStatus];
  const statusPath = statusPathOf(row);
  const primary = rowActionOf(row);
  const secondary = secondaryActionOf(row);
  const contentAlert = (CONTENT_ALERT as readonly string[]).includes(row.contentState);
  const onSale = t.mrpMinor !== null && t.priceMinor !== null && t.mrpMinor > t.priceMinor;
  const where = `${row.productTitle} on ${t.marketplaceName}`;

  // a draft listing carries the design's grey "Draft" pill; what is wrong with it (blocked, needs review) stays visible under it
  const draft = row.status === "draft";
  const pillColor = draft ? STATUS_COLOR.draft : statusColor;
  const status = (
    <>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full transition-transform group-hover:scale-125" style={{ backgroundColor: pillColor }} />
      <span className={cn("truncate text-[12px] font-medium", statusPath && "group-hover:underline")} style={{ color: draft ? "#666666" : statusColor }}>
        {draft ? "Draft" : STATUS_LABEL[t.screenStatus]}
      </span>
    </>
  );

  return (
    <div role="row" className={cn("relative flex min-h-[48px] w-full flex-row items-center px-4 py-1.5 pl-12 text-[12px] transition-colors hover:bg-[#FAFAFA]", selected && "bg-[#F9FAFB]")}>
      {/* the readiness meter on the left edge */}
      <div className="pointer-events-none absolute left-[3px] top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-sm bg-[#E5E7EB]" title={`Readiness score: ${score}%`}>
        <div className="absolute bottom-0 w-full rounded-sm transition-all" style={{ height: `${score}%`, backgroundColor: scoreColor }} />
      </div>
      <span className="pointer-events-none absolute left-[10px] top-1/2 mt-[2px] select-none text-[8px] font-medium leading-[10px]" style={{ color: scoreColor }} aria-hidden>
        {score}%
      </span>

      <div role="cell" className="w-6 shrink-0">
        <input
          type="checkbox"
          aria-label={`Select ${where}`}
          checked={selected}
          disabled={!canWrite}
          title={canWrite ? undefined : NO_WRITE_REASON}
          onChange={() => onToggle(row.id)}
          className="h-3.5 w-3.5 cursor-pointer rounded border border-[#BDBDBD] accent-black disabled:cursor-not-allowed"
        />
      </div>

      <div role="cell" className="w-[240px] shrink-0 pr-3">
        <Link to={studioPath(row.id)} className="block truncate text-[13px] font-medium text-[#000000] hover:underline" title={row.productTitle}>
          {row.productTitle}
        </Link>
        <p className="truncate text-[10px] text-[#666666]">
          <span>{price(t.priceMinor)}</span>
          {onSale && <span className="ml-1 line-through">{price(t.mrpMinor)}</span>}
          {t.salePriceMinor !== null && <span className="ml-1 text-[#16A34A]">Sale {price(t.salePriceMinor)}</span>}
          {t.externalListingId && (
            <>
              {" · "}
              {t.externalUrl && isSafeUrl(t.externalUrl) ? (
                <a href={t.externalUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" aria-label={`Open ${t.externalListingId} on ${t.marketplaceName}`}>
                  {t.externalListingId}
                </a>
              ) : (
                <span>{t.externalListingId}</span>
              )}
            </>
          )}
        </p>
      </div>

      <div role="cell" className="w-[170px] shrink-0 pr-3">
        <Link to={`${ROUTES.PRODUCTS}/${row.productId}`} className="block truncate text-[12px] font-normal text-[#000000] hover:underline" title={`Open the master product ${row.productTitle}`} aria-label={`Master product ${row.productTitle}`}>
          {row.productTitle}
        </Link>
        <p className="truncate font-mono text-[10px] font-normal text-[#666666]" title={row.sku}>
          {row.sku}
        </p>
      </div>

      <div role="cell" className="w-[120px] shrink-0 pr-2">
        <p className="truncate text-[12px] font-normal text-[#000000]">{t.marketplaceName}</p>
        <p className="truncate text-[10px] text-[#666666]">{t.accountName}</p>
      </div>

      <div role="cell" className="w-[130px] shrink-0 pr-2" title={t.readiness.topBlocker?.message}>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-8 overflow-hidden rounded-full bg-[#F5F5F5]" role="img" aria-label={`Readiness ${score} percent`}>
            <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: scoreColor }} />
          </div>
          <span className="text-[11px] font-medium" style={{ color: scoreColor }}>
            {score}%
          </span>
        </div>
        {t.readiness.topBlocker && <p className="max-w-[120px] truncate text-[10px] text-[#666666]">{t.readiness.topBlocker.message}</p>}
      </div>

      <div role="cell" className="w-[90px] shrink-0">
        <span className={cn("font-mono text-[12px]", t.stock.sellable === 0 ? "font-bold text-[#DC2626]" : "font-normal text-[#000000]")}>{t.stock.sellable}</span>
        {t.stock.dirty && (
          <p className="text-[10px] text-[#666666]" title="The marketplace has not received the latest stock yet">
            Push pending
          </p>
        )}
      </div>

      <div role="cell" className="w-[120px] shrink-0 truncate text-[12px] font-normal text-[#666666]">
        {t.lastSyncAt ? formatRelativeTime(t.lastSyncAt) : "Never"}
      </div>

      <div role="cell" className="min-w-[120px] flex-1">
        {statusPath ? (
          <Link to={statusPath} className="group flex items-center gap-1.5 truncate" title={`Open ${STATUS_LABEL[t.screenStatus]} details`}>
            {status}
          </Link>
        ) : (
          <div className="group flex items-center gap-1.5 truncate">{status}</div>
        )}
        {draft && t.screenStatus !== "ready" && (
          <span className="block truncate text-[10px]" style={{ color: statusColor }}>
            {STATUS_LABEL[t.screenStatus]}
          </span>
        )}
        {contentAlert && (
          <span className="flex items-center gap-1 text-[10px] text-[#92400E]">
            Content: {CONTENT_LABELS[row.contentState]}
            <Link to={studioPath(row.id)} className="font-semibold underline underline-offset-2" aria-label={`Resolve content update for ${row.productTitle}`}>
              Resolve
            </Link>
          </span>
        )}
      </div>

      <div role="cell" className="flex w-[150px] shrink-0 items-center justify-end gap-3">
        {secondary && (
          <button
            type="button"
            className="cursor-pointer text-[11px] font-medium text-[#666666] hover:text-[#000000] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canWrite || busy}
            title={canWrite ? undefined : NO_WRITE_REASON}
            aria-label={`${secondary.label} ${where}`}
            onClick={() => onAction(row, secondary.action)}
          >
            {secondary.label}
          </button>
        )}
        {primary.kind === "link" ? (
          <Link to={primary.to} className={cn(LINK, (t.screenStatus === "blocked" || t.screenStatus === "failed") && "text-[#DC2626]")} aria-label={`${primary.label.replace(" →", "")} ${where}`}>
            {primary.label}
          </Link>
        ) : primary.kind === "review" ? (
          <button type="button" className={LINK} onClick={() => onQuickView(row)} aria-label={`Review ${where}`}>
            {primary.label}
          </button>
        ) : (
          <button
            type="button"
            className={cn(LINK, "disabled:cursor-not-allowed disabled:opacity-50")}
            disabled={!canWrite || busy}
            title={canWrite ? undefined : NO_WRITE_REASON}
            aria-label={`Publish ${where}`}
            onClick={() => onAction(row, "publish")}
          >
            {busy ? "Publishing…" : primary.label}
          </button>
        )}
      </div>
    </div>
  );
}
