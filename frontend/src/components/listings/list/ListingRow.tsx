import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/common/StatusPill";
import { AuthThumbnail } from "@/components/products/list/AuthThumbnail";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import { formatRelativeTime } from "@/utils/format";
import type { ListingBulkAction, ListingRow as Row } from "@/types/listing";
import { CONTENT_ALERT, NO_WRITE_REASON, initialsOf, price, rowActionOf } from "./listingFormat";
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

const readinessTone = (percent: number) => (percent >= 90 ? "bg-emerald-500" : percent >= 70 ? "bg-amber-500" : "bg-destructive");

export function ListingRow({ row, selected, canWrite, busy, onToggle, onQuickView, onAction }: ListingRowProps) {
  const t = row.table;
  const action = rowActionOf(row);
  const studio = `${ROUTES.LISTINGS}/${row.id}`;
  const contentAlert = (CONTENT_ALERT as readonly string[]).includes(row.contentState);
  const onSale = t.mrpMinor !== null && t.priceMinor !== null && t.mrpMinor > t.priceMinor;

  return (
    <tr className={cn("transition-colors hover:bg-muted/20", selected && "bg-muted/30")}>
      <td className="py-3 pl-4 pr-2">
        <input
          type="checkbox"
          aria-label={`Select ${row.productTitle} on ${t.marketplaceName}`}
          checked={selected}
          disabled={!canWrite}
          title={canWrite ? undefined : NO_WRITE_REASON}
          onChange={() => onToggle(row.id)}
          className="h-4 w-4 cursor-pointer accent-[#1D4ED8] disabled:cursor-not-allowed"
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <AuthThumbnail url={t.thumbnailUrl} alt="" initials={initialsOf(row.productTitle)} compact />
          <div className="min-w-0">
            <Link to={studio} className="block max-w-[280px] truncate font-medium text-foreground hover:underline">
              {row.productTitle}
            </Link>
            <p className="font-mono text-[11px] text-muted-foreground">
              SKU: {row.sku}
              {t.externalListingId && (
                <>
                  {" · "}
                  {t.externalUrl ? (
                    <a href={t.externalUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" aria-label={`Open ${t.externalListingId} on ${t.marketplaceName}`}>
                      {t.externalListingId}
                    </a>
                  ) : (
                    <span>{t.externalListingId}</span>
                  )}
                </>
              )}
            </p>
            {t.categoryName && <p className="text-[11px] text-muted-foreground">{t.categoryName}</p>}
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <p className="font-medium text-foreground">{t.marketplaceName}</p>
        <p className="text-[11px] text-muted-foreground">{t.accountName}</p>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col items-start gap-1">
          <StatusPill status={t.screenStatus} />
          {contentAlert && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
              Content: {CONTENT_LABELS[row.contentState]}
              <Link to={studio} className="font-semibold underline underline-offset-2" aria-label={`Resolve content update for ${row.productTitle}`}>
                Resolve
              </Link>
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        <span className="font-semibold text-foreground">{price(t.priceMinor)}</span>
        {onSale && <span className="ml-1 text-[11px] text-muted-foreground line-through">{price(t.mrpMinor)}</span>}
        {t.salePriceMinor !== null && <p className="text-[11px] text-emerald-700">Sale {price(t.salePriceMinor)}</p>}
      </td>
      <td className="px-3 py-3 font-mono">
        <span className={t.stock.sellable === 0 ? "font-bold text-destructive" : "text-foreground"}>{t.stock.sellable}</span>
        {t.stock.dirty && (
          <p className="font-sans text-[11px] text-muted-foreground" title="The marketplace has not received the latest stock yet">
            Push pending
          </p>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2" title={t.readiness.topBlocker?.message}>
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Readiness ${t.readiness.percent} percent`}>
            <div className={cn("h-full", readinessTone(t.readiness.percent))} style={{ width: `${t.readiness.percent}%` }} />
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">{t.readiness.percent}%</span>
        </div>
        {t.readiness.topBlocker && <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-muted-foreground">{t.readiness.topBlocker.message}</p>}
      </td>
      <td className="px-3 py-3 text-muted-foreground">{t.lastSyncAt ? formatRelativeTime(t.lastSyncAt) : "Never"}</td>
      <td className="py-3 pl-3 pr-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onQuickView(row)} aria-label={`Quick view of ${row.productTitle}`}>
            Quick view
          </Button>
          {action && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={!canWrite || busy}
              title={canWrite ? undefined : NO_WRITE_REASON}
              aria-label={`${action.label} ${row.productTitle} on ${t.marketplaceName}`}
              onClick={() => onAction(row, action.action)}
            >
              {action.label}
            </Button>
          )}
          <Link to={studio} className={buttonVariants({ size: "sm", className: "h-7 bg-primary text-xs text-primary-foreground hover:bg-primary/90" })}>
            Studio
          </Link>
        </div>
      </td>
    </tr>
  );
}
