import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { StatusPill } from "@/components/common/StatusPill";
import { AuthThumbnail } from "@/components/products/list/AuthThumbnail";
import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { formatRelativeTime } from "@/utils/format";
import type { ListingRow } from "@/types/listing";
import { initialsOf, price } from "./listingFormat";
import { CONTENT_LABELS, LIFECYCLE_LABELS } from "./listingParams";

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground">{children}</span>
    </div>
  );
}

interface ListingDrawerProps {
  row: ListingRow | null;
  onClose: () => void;
}

/** a quick look at one listing from the data already on the page; the studio edits it */
export function ListingDrawer({ row, onClose }: ListingDrawerProps) {
  if (!row) return null;
  const t = row.table;
  const problems = row.issues.filter((i) => i.severity === "error");
  const studio = `${ROUTES.LISTINGS}/${row.id}`;
  return (
    <ContextDrawer
      open
      onClose={onClose}
      title={row.productTitle}
      description={`LISTING · ${t.marketplaceName.toUpperCase()} · ${t.accountName}`}
      footer={
        <div className="flex w-full gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onClose}>
            Close
          </Button>
          <Link to={studio} className={buttonVariants({ size: "sm", className: "flex-1 bg-primary text-xs text-primary-foreground hover:bg-primary/90" })}>
            Open studio
          </Link>
        </div>
      }
    >
      <div className="space-y-6 text-xs">
        <AuthThumbnail url={t.thumbnailUrl} alt={row.productTitle} initials={initialsOf(row.productTitle)} />

        <div className="space-y-3">
          <Line label="Status">
            <StatusPill status={t.screenStatus} />
          </Line>
          <Line label="Lifecycle">{LIFECYCLE_LABELS[row.status]}</Line>
          <Line label="Selling price">{price(t.priceMinor)}</Line>
          <Line label="MRP">{price(t.mrpMinor)}</Line>
          <Line label="Sellable stock">{t.stock.sellable}</Line>
          <Line label="Readiness">
            <span className="font-mono">{t.readiness.percent}%</span>
          </Line>
          <Line label="Content sync">{CONTENT_LABELS[row.contentState]}</Line>
          <Line label="Last synced">{t.lastSyncAt ? formatRelativeTime(t.lastSyncAt) : "Never"}</Line>
        </div>

        {(problems.length > 0 || row.contentError || t.readiness.topBlocker) && (
          <div className="space-y-1.5 rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-destructive">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4" aria-hidden /> What needs fixing
            </p>
            <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed">
              {row.contentError && <li>{row.contentError}</li>}
              {problems.map((i) => (
                <li key={`${i.code}-${i.attribute ?? ""}`}>{i.message}</li>
              ))}
              {problems.length === 0 && t.readiness.topBlocker && <li>{t.readiness.topBlocker.message}</li>}
            </ul>
          </div>
        )}
      </div>
    </ContextDrawer>
  );
}
