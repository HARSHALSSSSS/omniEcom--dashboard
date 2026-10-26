import { useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDateTime, formatNumber, formatRelativeTime } from "@/utils/format";
import { errorMessage } from "@/api/errors";
import type { CandidatesPage, PressurePick, PromotionCandidate, PromotionOverview } from "@/types/promotions";
import { CAPABILITY_LABELS, CONTRIBUTION_NOTES, activityText, marketplaceLabel } from "./promoFormat";

interface OverviewTabProps {
  overview: PromotionOverview | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** the recommended products list (a few rows) */
  candidates: CandidatesPage | undefined;
  candidatesLoading: boolean;
  candidatesError: unknown;
  onRetryCandidates: () => void;
  canWrite: boolean;
  onReviewProduct: (variantId: string) => void;
  onNavigateToProducts: () => void;
}

const percent = (bps: number | null): string => (bps === null ? "unknown" : `${(Math.round(bps / 10) / 10).toFixed(1)}%`);

function Pulse({ dot, value, label }: { dot: string; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="text-sm font-semibold text-foreground">{formatNumber(value)}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Measure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}

const pressureTitle = (p: PressurePick): string =>
  p.eligibility === "low_inventory" ? "High demand / Low stock" : p.eligibility === "margin_risk" ? "High demand / Thin margin" : "High demand / Review before promoting";

function OpportunityRow({ row, canWrite, onReview }: { row: PromotionCandidate; canWrite: boolean; onReview: (variantId: string) => void }) {
  const reason = row.recommendationReasons[0]?.text ?? row.eligibilityReason;
  const blocked = row.promotionStatus === "connector_unavailable";
  return (
    <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{marketplaceLabel(row.marketplace)}</span>
          <span className="text-[11px] text-muted-foreground">·</span>
          <span className="text-[11px] text-muted-foreground">{row.channel}</span>
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${blocked ? "text-red-600" : "text-blue-600"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${blocked ? "bg-red-600" : "bg-blue-600"}`} />
            {blocked ? "Cannot take prices" : "Available"}
          </span>
        </div>
        <p className="truncate text-sm font-medium text-foreground">{row.productName}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{row.sku}</p>
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="text-left sm:max-w-[320px] sm:text-right">
          {reason && <p className="text-xs font-medium text-foreground">{reason}</p>}
          <p className="text-[11px] text-muted-foreground">
            {formatNumber(row.availableStock)} units available · {row.marginBps === null ? "margin unknown (no cost price)" : `${percent(row.marginBps)} margin`}
          </p>
        </div>
        <Badge variant="outline" className={row.promotionStatus === "recommended" ? "border-blue-500/30 bg-blue-50 text-blue-700" : "border-amber-500/30 bg-amber-50 text-amber-700"}>
          {row.promotionStatus === "recommended" ? "Recommended" : "Review"}
        </Badge>
        {blocked ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-blue-600 hover:text-blue-700" disabled={!canWrite} title={canWrite ? undefined : "You need the promotions:write permission to create campaigns."} onClick={() => onReview(row.variantId)}>
            Review <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function OverviewTab({ overview: o, loading, error, onRetry, candidates, candidatesLoading, candidatesError, onRetryCandidates, canWrite, onReviewProduct, onNavigateToProducts }: OverviewTabProps) {
  const [intelDismissed, setIntelDismissed] = useState(false);

  if (loading && !o) {
    return (
      <div className="w-full space-y-4" aria-busy="true" aria-label="Loading the promotions overview">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }
  if (!o) {
    return (
      <div role="alert" className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-center">
        <h2 className="text-base font-semibold text-foreground">The overview could not be loaded.</h2>
        <p className="max-w-[520px] text-xs text-muted-foreground">{error ? errorMessage(error) : "Try again in a moment."}</p>
        <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  const readyChannels = o.channels.filter((c) => c.capability === "supported").length;
  const strong = o.pressure.strongCandidate;
  const review = o.pressure.reviewFirst;
  const opportunities = candidates?.items ?? [];
  const watch: Array<{ key: string; text: string }> = [];
  if (o.endingSoonCampaigns > 0) watch.push({ key: "ending", text: `${o.endingSoonCampaigns} campaign${o.endingSoonCampaigns === 1 ? " ends" : "s end"} within ${o.thresholds.endingSoonHours} hours${o.nextEndsAt ? ` (next: ${formatDateTime(o.nextEndsAt)})` : ""}` });
  else if (o.nextEndsAt) watch.push({ key: "next", text: `The next campaign ends ${formatDateTime(o.nextEndsAt)}` });
  if (o.conflictItems > 0) watch.push({ key: "conflict", text: `${o.conflictItems} campaign product${o.conflictItems === 1 ? " is" : "s are"} blocked by another campaign or an existing sale` });
  if (o.belowMarginTargetItems !== null && o.belowMarginTargetItems > 0)
    watch.push({ key: "margin", text: `${o.belowMarginTargetItems} product${o.belowMarginTargetItems === 1 ? "" : "s"} in scheduled or running campaigns ${o.belowMarginTargetItems === 1 ? "is" : "are"} below the margin target after marketplace fees` });
  if (o.unlistedVariants > 0) watch.push({ key: "unlisted", text: `${o.unlistedVariants} active variant${o.unlistedVariants === 1 ? " has" : "s have"} no active listing and cannot be promoted` });

  return (
    <div className="w-full space-y-7">
      {/* Promotion pulse strip */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-2xs" aria-label="Promotion pulse">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Promotion pulse</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 md:gap-8">
          <Pulse dot="bg-emerald-500" value={o.opportunities} label="Opportunities" />
          <div className="hidden h-px w-6 bg-border md:block" />
          <Pulse dot="bg-blue-500" value={o.eligibleProducts} label="Eligible products" />
          <div className="hidden h-px w-6 bg-border md:block" />
          <Pulse dot="bg-emerald-600" value={o.activeCampaigns} label="Active promotions" />
          <div className="hidden h-px w-6 bg-border md:block" />
          <Pulse dot="bg-amber-500" value={o.resultsCampaigns} label="Results" />
          <div className="hidden h-px w-6 bg-border md:block" />
          <Pulse dot="bg-neutral-400" value={readyChannels} label={readyChannels === 1 ? "Channel ready" : "Channels ready"} />
        </div>
      </section>

      {/* Results of campaigns that ran */}
      <section className="space-y-3" aria-label="Promotion results">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Promotion results</h2>
          <span className="text-[11px] text-muted-foreground">{o.statsUpdatedAt ? `Updated ${formatRelativeTime(o.statsUpdatedAt)} from real orders` : "Appear once a campaign has run"}</span>
        </div>
        <div className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-2xs sm:grid-cols-2 lg:grid-cols-5">
          <Measure label="Products on promotion" value={formatNumber(o.productsOnPromotion)} note={`${formatNumber(o.liveProducts)} live`} />
          <Measure label="Units sold" value={formatNumber(o.unitsMoved)} note={o.velocityLiftBps === null ? undefined : `${o.velocityLiftBps > 0 ? "+" : ""}${(o.velocityLiftBps / 100).toFixed(0)}% sales rate vs before`} />
          <Measure label="Revenue" value={formatCurrency(o.revenueMinor, o.currency)} />
          <Measure label="Discount given" value={formatCurrency(o.spendMinor, o.currency)} note={o.budgetUsedBps === null ? undefined : `${(o.budgetUsedBps / 100).toFixed(0)}% of the discount budget`} />
          <Measure
            label="Contribution"
            value={o.contributionMinor === null ? "—" : formatCurrency(o.contributionMinor, o.currency)}
            note={
              o.contributionMinor === null
                ? o.unitsMoved > 0
                  ? "Needs a cost price on every promoted product"
                  : "No promoted sales yet"
                : `${o.contributionBps === null ? "" : `${percent(o.contributionBps)} of revenue · `}${o.contributionBasis ? CONTRIBUTION_NOTES[o.contributionBasis] : ""}`
            }
          />
        </div>
        {watch.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-900" aria-label="Needs a look">
            {watch.map((w) => (
              <li key={w.key}>{w.text}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Two Column Section: Opportunities & Promotion Intelligence */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="space-y-3 lg:col-span-7" aria-label="Promotion opportunities">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Promotion opportunities</h2>
            <span className="text-[11px] text-muted-foreground">Based on connector capabilities</span>
          </div>

          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {candidatesLoading && !candidates ? (
              <div className="space-y-3 p-4" aria-busy="true">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : candidatesError && !candidates ? (
              <div role="alert" className="flex flex-col items-center gap-2 p-6 text-center text-xs text-muted-foreground">
                <p>The opportunities could not be loaded: {errorMessage(candidatesError)}</p>
                <Button variant="outline" size="sm" className="text-xs" onClick={onRetryCandidates}>
                  Retry
                </Button>
              </div>
            ) : opportunities.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                <p>No product needs a promotion push right now.</p>
                <p className="mt-1">Products appear here when they are listed, in stock, have margin room and sell slowly.</p>
              </div>
            ) : (
              opportunities.map((row) => <OpportunityRow key={`${row.variantId}:${row.accountId}`} row={row} canWrite={canWrite} onReview={onReviewProduct} />)
            )}
          </div>
          {candidates && candidates.total > opportunities.length && (
            <button type="button" onClick={onNavigateToProducts} className="text-[11px] font-medium text-blue-600 underline hover:text-blue-700">
              See all {formatNumber(candidates.total)} in Products
            </button>
          )}
        </section>

        {/* Right Column: Promotion Intelligence Card */}
        <section className="lg:col-span-5">
          {!intelDismissed ? (
            <div className="flex flex-col justify-between rounded-xl border border-blue-200/50 p-5 shadow-2xs" style={{ background: "linear-gradient(98deg, #E9D5FF 0%, #DBEAFE 48%, #93C5FD 100%)" }}>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-950">
                  <Sparkles className="h-4 w-4 text-blue-950" />
                  <span>Promotion Intelligence</span>
                </div>

                <h3 className="text-base font-semibold leading-snug text-foreground">
                  {o.opportunities > 0
                    ? `${formatNumber(o.opportunities)} product${o.opportunities === 1 ? " has" : "s have"} healthy stock and margin room, and sales that could use a push.`
                    : "No product needs a promotion push right now."}
                </h3>

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">Why this matters</p>
                  <p className="text-xs text-foreground/85">Promoting products with low available stock may increase stockout risk. Review recommendations against margin and lead times.</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-2">
                  {o.opportunities > 0 && (
                    <Button size="sm" className="h-8 gap-1.5 bg-foreground text-xs text-background shadow-sm hover:bg-foreground/90" onClick={onNavigateToProducts}>
                      <ArrowRight className="h-3.5 w-3.5" /> Review Products
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-8 border-white/60 bg-white text-xs text-foreground shadow-sm hover:bg-neutral-100" onClick={() => setIntelDismissed(true)}>
                    Dismiss
                  </Button>
                </div>
                <p className="text-[11px] text-foreground/75">Advisory only · nothing is enrolled without your confirmation.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Advisory card dismissed.{" "}
              <button type="button" onClick={() => setIntelDismissed(false)} className="cursor-pointer font-medium text-blue-600 underline hover:text-blue-700">
                Restore advisory
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Promotion Pressure Section: a card only when a product qualifies */}
      {(strong || review) && (
        <section className="space-y-3" aria-label="Promotion pressure">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Promotion pressure</h2>
            <span className="text-[11px] text-muted-foreground">Demand → Inventory → Margin → Promotion Opportunity</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {strong && (
              <div className="rounded-xl border border-l-4 border-border border-l-emerald-500 bg-card p-4 shadow-2xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">High demand / Healthy stock / Healthy margin</p>
                    <p className="text-sm font-medium text-foreground">{strong.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      Stock: {formatNumber(strong.availableStock)} · Current margin: {percent(strong.marginBps)} · {formatNumber(strong.unitsSold30d)} sold in 30 days
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="block text-[11px] text-muted-foreground">Strong candidate</span>
                    <Badge variant="outline" className="mt-1 border-emerald-500/30 bg-emerald-50 text-emerald-700">
                      ● Suitable
                    </Badge>
                  </div>
                </div>
              </div>
            )}
            {review && (
              <div className="rounded-xl border border-l-4 border-border border-l-amber-500 bg-card p-4 shadow-2xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">{pressureTitle(review)}</p>
                    <p className="text-sm font-medium text-foreground">{review.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      Stock: {formatNumber(review.availableStock)} · Current margin: {percent(review.marginBps)} · {formatNumber(review.unitsSold30d)} sold in 30 days
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="block text-[11px] text-muted-foreground">Review before promoting</span>
                    <Badge variant="outline" className="mt-1 border-amber-500/30 bg-amber-50 text-amber-700">
                      ● Review
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Recent Promotion Activity */}
      <section className="space-y-3" aria-label="Recent promotion activity">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Recent promotion activity</h2>
          <span className="text-[11px] text-muted-foreground">From the audit trail</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card p-4 shadow-2xs">
          {o.recentActivity.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">No promotion activity yet.</p>
          ) : (
            <ul className="flex min-w-max items-center gap-6">
              {o.recentActivity.slice(0, 5).map((act, i) => (
                <li key={act.id} className="flex items-center gap-2.5 text-xs">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${i % 2 === 0 ? "bg-blue-500" : "bg-emerald-500"}`} />
                  <span className="font-medium text-foreground">{activityText(act)}</span>
                  <span className="text-[11px] text-muted-foreground">{formatRelativeTime(act.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Marketplace Promotion Landscape Table */}
      <section className="space-y-3" aria-label="Marketplace Promotion Landscape">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Marketplace Promotion Landscape</h2>
          <span className="text-[11px] text-muted-foreground">Based on connector capabilities</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                <th className="px-4 py-3 font-medium">Marketplace</th>
                <th className="px-4 py-3 font-medium">Promotion Capability</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">Live products</th>
                <th className="px-4 py-3 font-medium">Opportunities</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {o.channels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-muted-foreground">
                    No marketplace accounts connected.
                  </td>
                </tr>
              ) : (
                o.channels.map((ch) => (
                  <tr key={ch.accountId} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold text-foreground">{ch.displayName || marketplaceLabel(ch.marketplace)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ch.canPushPrices ? "Prices can be applied" : "Prices cannot be applied automatically"}</td>
                    <td className="px-4 py-3 font-mono">{ch.activeCampaigns}</td>
                    <td className="px-4 py-3 font-mono">{ch.liveProducts}</td>
                    <td className="px-4 py-3 font-mono">{ch.opportunities}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={
                          ch.capability === "supported"
                            ? "border-emerald-500/30 bg-emerald-50 text-emerald-700"
                            : ch.capability === "not_supported"
                              ? "border-red-500/30 bg-red-50 text-red-700"
                              : "border-amber-500/30 bg-amber-50 text-amber-700"
                        }
                      >
                        {CAPABILITY_LABELS[ch.capability]}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
