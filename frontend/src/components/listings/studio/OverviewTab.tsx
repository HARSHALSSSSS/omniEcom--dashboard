import { Eye, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/common/StatusPill";
import { ProductImage } from "@/components/products/detail/ProductImage";
import type { ListingStudio } from "@/types/listingStudio";
import { formatINR } from "@/utils/format";
import { isSafeUrl } from "@/utils/security";
import { StatusIcon } from "./ReadinessTab";

interface Props {
  s: ListingStudio;
  /** the seller can pick a marketplace category now; otherwise `categoryReason` says why not */
  canChangeCategory: boolean;
  categoryReason: string | null;
  dirty: boolean;
  onChangeCategory: () => void;
  onOpenReadiness: () => void;
}

/** channel specifications, what the customer sees, the readiness score and what the marketplace reported */
export function OverviewTab({ s, canChangeCategory, categoryReason, dirty, onChangeCategory, onOpenReadiness }: Props) {
  const p = s.preview;
  const attention = s.readiness.groups.flatMap((g) => g.items).filter((i) => i.status !== "pass").slice(0, 5);
  const issues = s.marketplaceIssues;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-base font-semibold text-foreground">Channel Listing Specifications</h3>
          <dl className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <dt className="text-muted-foreground">Marketplace Category</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-foreground">
                {s.category.marketplaceCategoryName ?? s.category.marketplaceCategoryId ?? "Not chosen yet"}
                <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" disabled={!canChangeCategory} title={categoryReason ?? undefined} onClick={onChangeCategory}>
                  {s.category.marketplaceCategoryId ? "Change category" : "Choose category"}
                </Button>
              </dd>
              {s.category.masterCategoryName && <dd className="mt-1 text-[11px] text-muted-foreground">Your category: {s.category.masterCategoryName}</dd>}
            </div>
            <div>
              <dt className="text-muted-foreground">Channel SKU</dt>
              <dd className="mt-1 font-mono font-semibold text-foreground">{s.listing.externalSku}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Channel ASIN / Identifier</dt>
              <dd className="mt-1 flex items-center gap-2 font-mono font-semibold text-foreground">
                {s.listing.externalListingId ?? "Pending Creation"}
                {s.externalUrl && isSafeUrl(s.externalUrl) && (
                  <a href={s.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-sans text-[11px] font-medium text-primary hover:underline" aria-label="Open the listing on the marketplace">
                    View <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Publication State</dt>
              <dd className="mt-1">
                <StatusPill status={s.listing.table.screenStatus} />
              </dd>
            </div>
          </dl>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Eye className="h-4 w-4" aria-hidden="true" /> Marketplace Customer Preview
          </h4>
          {dirty && <p className="text-[11px] text-amber-700">Showing the saved listing. Save your edits to update this preview.</p>}
          <div className="flex gap-4 rounded-lg border border-border bg-muted/20 p-4">
            <ProductImage url={p.images[0] ?? s.listing.table.thumbnailUrl} alt={p.title} className="h-24 w-24 shrink-0 rounded-lg border border-border" />
            <div className="min-w-0 space-y-1.5 text-xs">
              <p className="text-sm font-bold text-foreground">{p.title}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-base font-bold text-foreground">{p.priceMinor === null ? "Price not set" : formatINR(p.priceMinor)}</span>
                {p.mrpMinor !== null && p.priceMinor !== null && p.mrpMinor > p.priceMinor && <span className="text-muted-foreground line-through">{formatINR(p.mrpMinor)}</span>}
                {p.discountPercent > 0 && <span className="text-[11px] font-semibold text-emerald-600">{p.discountPercent}% off</span>}
              </div>
              {p.description && <p className="line-clamp-2 text-muted-foreground">{p.description}</p>}
              {p.bulletPoints.length > 0 && (
                <ul className="list-disc pl-4 text-muted-foreground">
                  {p.bulletPoints.slice(0, 3).map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6 lg:col-span-4">
        <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Readiness Score</h4>
            <span className="font-mono text-sm font-bold text-foreground">{s.readiness.percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Readiness score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.readiness.percent}>
            <div className={`h-full ${s.readiness.ready ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${s.readiness.percent}%` }} />
          </div>
          <div className="space-y-2 pt-2">
            {attention.length === 0 && <p className="text-xs text-emerald-700">Every check passed.</p>}
            {attention.map((i) => (
              <div key={i.key} className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${i.status === "fail" ? "border-rose-200 bg-rose-50/50 text-rose-900" : "border-amber-200 bg-amber-50/50 text-amber-900"}`}>
                <StatusIcon status={i.status} />
                <p>
                  <span className="font-semibold">{i.label}:</span> {i.message}
                </p>
              </div>
            ))}
            <Button type="button" variant="link" className="text-xs" onClick={onOpenReadiness}>
              See all checks
            </Button>
          </div>
        </div>

        {issues.length > 0 && (
          <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/50 p-5 text-xs text-rose-900">
            <h4 className="font-semibold uppercase tracking-wider">Reported by {s.account.marketplaceName}</h4>
            <ul className="space-y-1.5">
              {issues.map((i, n) => (
                <li key={`${i.code}-${n}`}>
                  <span className="font-semibold">{i.attribute ? `${i.attribute}: ` : ""}</span>
                  {i.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
