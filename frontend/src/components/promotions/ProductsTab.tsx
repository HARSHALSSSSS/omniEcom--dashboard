import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Sparkles, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROUTES } from "@/constants/routes";
import { promotionsApi } from "@/api/promotions.api";
import { errorMessage } from "@/api/errors";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { toast } from "@/hooks/useToast";
import { downloadText } from "@/components/pricing/pricingFormat";
import { formatNumber } from "@/utils/format";
import {
  CANDIDATE_QUICK_FILTERS,
  CANDIDATE_SORTS,
  type CandidatesPage,
  type CandidatesQuery,
  type ProductSegment,
  type PromotionAccount,
  type PromotionCandidate,
} from "@/types/promotions";
import type { PromotionsUrlState } from "./promoParams";
import { candidatesQueryOf } from "./promoParams";
import { LoadError, PromoPagination, TableSkeleton } from "./PromoUi";
import {
  CANDIDATE_SORT_LABELS,
  CANDIDATE_STATUS_LABELS,
  CANDIDATE_STATUS_TONE,
  ELIGIBILITY_LABELS,
  ELIGIBILITY_TONE,
  WRITE_REASON,
  candidateKey,
  candidatesCsv,
  marketplaceLabel,
  money,
  percentLabel,
  quickFilterLabel,
} from "./promoFormat";

/** a CSV export stops here; the seller is told when the list was longer */
export const EXPORT_CAP = 10_000;
const EXPORT_PAGE = 100;

interface ProductsTabProps {
  url: PromotionsUrlState;
  update: (patch: Partial<Record<"q" | "status" | "seg" | "quick" | "market" | "sort" | "page" | "size", string | null>>, opts?: { replace?: boolean }) => void;
  data: CandidatesPage | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  accounts: PromotionAccount[];
  /** the seller's own selection, kept across pages and filters (variant + channel) */
  selected: Map<string, PromotionCandidate>;
  onSelectedChange: (next: Map<string, PromotionCandidate>) => void;
  canWrite: boolean;
  /** rows of ONE channel */
  onCreateCampaign: (rows: PromotionCandidate[]) => void;
  onOpenCampaign: (campaignId: string) => void;
}

const SEGMENT_LABELS: Record<ProductSegment, string> = { recommended: "● Recommended", custom: "Custom", all: "All Matching" };

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-xs";
const pricingLink = (r: PromotionCandidate): string => `${ROUTES.PRICING}?view=proposals&tab=pending_review&q=${encodeURIComponent(r.sku)}&account=${r.accountId}`;

function MarginCell({ r }: { r: PromotionCandidate }) {
  if (r.marginBps === null) {
    return (
      <div>
        <span className="font-mono text-muted-foreground">—</span>
        <p className="text-[11px] text-muted-foreground">{r.unitCostMinor === null ? "cost not set" : "margin unknown"}</p>
        {r.feesMinor === null && <p className="text-[11px] text-muted-foreground">fees not configured</p>}
      </div>
    );
  }
  const below = r.targetMarginBps !== null && r.marginBps < r.targetMarginBps;
  return (
    <div className="space-y-0.5">
      <span className={`font-mono ${below ? "font-semibold text-amber-600" : ""}`}>{percentLabel(r.marginBps)}</span>
      {r.feesMinor === null && <p className="text-[11px] text-muted-foreground">fees not configured</p>}
      {r.targetMarginBps !== null && (
        <p className="text-[11px] text-muted-foreground">
          Target {percentLabel(r.targetMarginBps)} {below && <span className="font-semibold text-amber-600">· below target</span>}
        </p>
      )}
      {r.maxDiscountBps !== null && (
        <p className="text-[11px] text-muted-foreground">{r.maxDiscountBps > 0 ? `Up to ${percentLabel(r.maxDiscountBps)} off keeps the target` : "No discount keeps the target"}</p>
      )}
    </div>
  );
}

function CampaignCell({ r, onOpen }: { r: PromotionCandidate; onOpen: (id: string) => void }) {
  const others = r.conflicts.filter((c) => c.kind !== "other_campaign" || !r.existingCampaign);
  return (
    <div className="space-y-0.5">
      {r.existingCampaign ? (
        <button type="button" onClick={() => onOpen(r.existingCampaign!.id)} className="font-medium text-foreground underline-offset-2 hover:underline">
          {r.existingCampaign.name} <span className="font-normal text-muted-foreground">({r.existingCampaign.status})</span>
        </button>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      {others.map((c) =>
        c.kind === "pending_price_proposal" ? (
          <p key={c.kind} className="text-[11px]">
            <Link to={pricingLink(r)} className="font-medium text-blue-600 underline hover:text-blue-700">
              Price change waiting in Pricing
            </Link>
          </p>
        ) : (
          <p key={c.kind + c.message} className="text-[11px] text-amber-700">
            {c.message}
          </p>
        ),
      )}
    </div>
  );
}

export function ProductsTab({ url, update, data, loading, error, onRetry, accounts, selected, onSelectedChange, canWrite, onCreateCampaign, onOpenCampaign }: ProductsTabProps) {
  const custom = url.segment === "custom";
  const [text, setText] = useState(url.q ?? "");
  const [chooser, setChooser] = useState<Array<{ accountId: string; channel: string; rows: PromotionCandidate[] }> | null>(null);
  const exportGuard = useSubmitGuard();

  // typing goes to the URL after a pause, so the server is not asked on every key
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== (url.q ?? "")) update({ q: text.trim() || null }, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [text, url.q, update]);
  useEffect(() => setText(url.q ?? ""), [url.q]);

  const markets = useMemo(() => [...new Set(accounts.map((a) => a.marketplace))].sort(), [accounts]);
  const needle = url.q?.toLowerCase();
  const customRows = useMemo(
    () => [...selected.values()].filter((r) => !needle || r.sku.toLowerCase().includes(needle) || r.productName.toLowerCase().includes(needle)),
    [selected, needle],
  );
  const rows = custom ? customRows.slice((url.page - 1) * url.pageSize, url.page * url.pageSize) : (data?.items ?? []);
  const total = custom ? customRows.length : (data?.total ?? 0);
  const pages = custom ? Math.max(1, Math.ceil(customRows.length / url.pageSize)) : (data?.pages ?? 1);
  const thresholds = data?.thresholds;
  const counts = data?.counts;
  const summary = data?.summary;
  const filtered = Boolean(url.q || url.quick || url.marketplace || url.candidateStatus);

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(candidateKey(r)));
  const toggleOne = (r: PromotionCandidate) => {
    const next = new Map(selected);
    if (next.has(candidateKey(r))) next.delete(candidateKey(r));
    else next.set(candidateKey(r), r);
    onSelectedChange(next);
  };
  const togglePage = () => {
    const next = new Map(selected);
    for (const r of rows) {
      if (allOnPage) next.delete(candidateKey(r));
      else next.set(candidateKey(r), r);
    }
    onSelectedChange(next);
  };

  /** a campaign runs on one channel: with products from several channels selected, the seller picks which one to start with */
  const createWithSelected = () => {
    const groups = new Map<string, { accountId: string; channel: string; rows: PromotionCandidate[] }>();
    for (const r of selected.values()) {
      const g = groups.get(r.accountId) ?? { accountId: r.accountId, channel: r.channel, rows: [] };
      g.rows.push(r);
      groups.set(r.accountId, g);
    }
    const list = [...groups.values()];
    if (list.length === 0) onCreateCampaign([]);
    else if (list.length === 1) onCreateCampaign(list[0]!.rows);
    else setChooser(list);
  };

  const exportCsv = () =>
    void exportGuard.run(async () => {
      try {
        let out: PromotionCandidate[];
        let capped = false;
        if (custom) out = customRows;
        else {
          const base: CandidatesQuery = { ...candidatesQueryOf(url), page: 1, pageSize: EXPORT_PAGE };
          out = [];
          for (let page = 1; ; page++) {
            const res = await promotionsApi.candidates({ ...base, page });
            out.push(...res.items);
            if (out.length >= res.total || res.items.length === 0 || page >= res.pages) break;
            if (out.length >= EXPORT_CAP) {
              capped = res.total > EXPORT_CAP;
              break;
            }
          }
          if (out.length > EXPORT_CAP) {
            out = out.slice(0, EXPORT_CAP);
            capped = true;
          }
        }
        downloadText(`promotions-products-${new Date().toISOString().slice(0, 10)}.csv`, candidatesCsv(out));
        if (capped) toast({ title: `The export holds the first ${formatNumber(EXPORT_CAP)} rows`, description: "Narrow the filters to export the rest.", variant: "warning" });
      } catch (e) {
        toast({ title: "Could not export the products", description: errorMessage(e), variant: "destructive" });
      }
    });

  const noneListed = !loading && !error && summary !== undefined && summary.placements === 0 && !filtered;

  return (
    <div className="w-full space-y-6">
      {/* Title & Top Actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Promotion Products</h1>
          <p className="text-xs text-muted-foreground">Select products for promotion analysis or campaign participation. Based on connector capabilities.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 bg-foreground text-xs text-background hover:bg-foreground/90"
            disabled={!canWrite}
            title={canWrite ? undefined : WRITE_REASON}
            onClick={createWithSelected}
          >
            <Plus className="h-3.5 w-3.5" /> Create Campaign{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
          <Button variant="outline" size="sm" className="gap-1 text-xs" aria-label="Export products" loading={exportGuard.busy} disabled={total === 0} onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {/* KPI & Segmented Strip */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
        <div className="flex items-baseline gap-6">
          <div>
            <span className="text-2xl font-bold text-blue-600">{summary ? formatNumber(summary.recommendedProducts) : "—"}</span>
            <p className="text-xs text-muted-foreground">recommended products</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <span className="text-2xl font-bold text-foreground">{summary ? formatNumber(summary.listedProducts) : "—"}</span>
            <p className="text-xs text-muted-foreground">total products</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <span className="text-2xl font-bold text-foreground">{selected.size}</span>
            <p className="text-xs text-muted-foreground">products selected</p>
          </div>
        </div>

        <div role="group" aria-label="Segment" className="inline-flex rounded-lg border border-border bg-muted p-1 text-xs">
          {(["recommended", "custom", "all"] as const).map((seg) => {
            const n = seg === "custom" ? selected.size : counts ? (seg === "all" ? counts.all : counts.recommended + counts.review) : null;
            return (
              <button
                key={seg}
                type="button"
                aria-pressed={url.segment === seg}
                onClick={() => update({ seg: seg === "recommended" ? null : seg })}
                className={`rounded-md px-3.5 py-1.5 font-medium transition-all ${url.segment === seg ? "bg-background font-semibold text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
              >
                {SEGMENT_LABELS[seg]}
                {n !== null && <span className="ml-1 font-mono text-[11px] text-muted-foreground">{formatNumber(n)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Recommendation Banner */}
      {summary && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200/50 p-4 shadow-2xs" style={{ background: "linear-gradient(98deg, #E9D5FF 0%, #DBEAFE 48%, #93C5FD 100%)" }}>
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
          <div className="space-y-0.5 text-xs text-foreground">
            <p className="font-semibold text-foreground">
              {summary.recommendedProducts === 0
                ? "No product is recommended for a promotion right now."
                : `${formatNumber(summary.recommendedProducts)} product${summary.recommendedProducts === 1 ? " is" : "s are"} recommended: listed, in stock, with margin room and slow recent sales.`}
            </p>
            <p className="text-foreground/80">Recommendations are suggestions, not selections. Nothing is selected or enrolled automatically; the final choice is yours.</p>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" aria-label="Search products" placeholder="Search product or SKU" value={text} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)} className="pl-9 text-xs" />
          </div>

          <div className="flex items-center gap-2">
            <select aria-label="Marketplace" value={url.marketplace ?? ""} onChange={(e) => update({ market: e.target.value || null })} className={selectClass} disabled={custom}>
              <option value="">All Marketplaces</option>
              {markets.map((m) => (
                <option key={m} value={m}>
                  {marketplaceLabel(m)}
                </option>
              ))}
            </select>
            <select aria-label="Status" value={url.candidateStatus ?? ""} onChange={(e) => update({ status: e.target.value || null })} className={selectClass} disabled={custom}>
              <option value="">Any status</option>
              {(["recommended", "review", "not_selected", "connector_unavailable"] as const).map((s) => (
                <option key={s} value={s}>
                  {CANDIDATE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select aria-label="Sort by" value={url.sort} onChange={(e) => update({ sort: e.target.value === "priority" ? null : e.target.value })} className={selectClass} disabled={custom}>
              {CANDIDATE_SORTS.map((s) => (
                <option key={s} value={s}>
                  {CANDIDATE_SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          {CANDIDATE_QUICK_FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={url.quick === id}
              disabled={custom}
              onClick={() => update({ quick: url.quick === id ? null : id })}
              className={`rounded-full border px-3 py-1 font-medium transition-colors disabled:opacity-50 ${url.quick === id ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}
            >
              {quickFilterLabel(id, thresholds)}
            </button>
          ))}
          {filtered && (
            <button type="button" onClick={() => update({ q: null, status: null, quick: null, market: null })} className="text-xs text-muted-foreground underline hover:text-foreground">
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Products Table */}
      {loading && !data && !custom ? (
        <TableSkeleton label="Loading products" />
      ) : error && !data && !custom ? (
        <LoadError noun="The products" message={errorMessage(error)} onRetry={onRetry} />
      ) : noneListed && !custom ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-center">
          <h2 className="text-base font-semibold text-foreground">No product is listed on a connected marketplace yet.</h2>
          <p className="max-w-[520px] text-xs text-muted-foreground">A product can only be promoted where it has an active listing. Publish products to a marketplace first{summary && summary.unlistedVariants > 0 ? ` (${formatNumber(summary.unlistedVariants)} active variants have no listing)` : ""}.</p>
          <div className="flex items-center gap-2 pt-2">
            <Link to={ROUTES.LISTINGS} className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">
              Open Listings
            </Link>
            <Link to={ROUTES.MARKETPLACE_HUB} className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">
              Open Marketplace Hub
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                <th className="w-10 px-3 py-3 text-center">
                  <Checkbox checked={allOnPage} onCheckedChange={togglePage} aria-label="Select all on this page" disabled={rows.length === 0} />
                </th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Marketplace</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Existing Campaign</th>
                <th className="px-4 py-3 font-medium">Recent sales</th>
                <th className="px-4 py-3 font-medium">Avail. stock</th>
                <th className="px-4 py-3 font-medium">Margin</th>
                <th className="px-4 py-3 font-medium">Promotion status</th>
                <th className="px-4 py-3 font-medium">Eligibility</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-muted-foreground">
                    {custom ? "No products selected yet. Tick products in another segment to collect them here." : "No products matched the current filters."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const key = candidateKey(r);
                  const isSelected = selected.has(key);
                  return (
                    <tr key={key} className={`align-top hover:bg-muted/30 ${isSelected ? "bg-muted/20" : ""}`}>
                      <td className="px-3 py-3 text-center">
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(r)} aria-label={`Select ${r.productName} on ${r.channel}`} />
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="truncate font-medium text-foreground">{r.productName}</p>
                        {r.promotionStatus === "recommended" && r.recommendationReasons[0] && <p className="text-[11px] text-muted-foreground">{r.recommendationReasons[0].text}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{r.sku}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{marketplaceLabel(r.marketplace)}</p>
                        <p className="text-[11px] text-muted-foreground">{r.channel}</p>
                        {!r.canPushPrices && <p className="text-[11px] text-red-600">Cannot take price changes</p>}
                      </td>
                      <td className="px-4 py-3 font-mono">{money(r.regularPriceMinor)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <CampaignCell r={r} onOpen={onOpenCampaign} />
                      </td>
                      <td className="px-4 py-3 font-mono">{formatNumber(r.unitsSold30d)} units</td>
                      <td className="px-4 py-3 font-mono">
                        <span className={r.lowStock || r.availableStock <= 0 ? "font-semibold text-amber-600" : ""}>{formatNumber(r.availableStock)}</span>
                        {r.availableStock <= 0 ? <p className="font-sans text-[11px] text-amber-600">Sold out</p> : r.lowStock ? <p className="font-sans text-[11px] text-amber-600">Low stock</p> : null}
                      </td>
                      <td className="px-4 py-3">
                        <MarginCell r={r} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={CANDIDATE_STATUS_TONE[r.promotionStatus]}>
                          ● {CANDIDATE_STATUS_LABELS[r.promotionStatus]}
                        </Badge>
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        <Badge variant="outline" className={ELIGIBILITY_TONE[r.eligibility]} title={r.eligibilityReason ?? undefined}>
                          ● {ELIGIBILITY_LABELS[r.eligibility]}
                        </Badge>
                        {r.eligibilityReason && <p className="mt-1 text-[11px] text-muted-foreground">{r.eligibilityReason}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.canPushPrices ? (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600 hover:text-blue-700" disabled={!canWrite} title={canWrite ? undefined : WRITE_REASON} onClick={() => onCreateCampaign([r])}>
                            Review &gt;
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {(rows.length > 0 || total > 0) && (
        <PromoPagination page={url.page} pages={pages} total={total} pageSize={url.pageSize} shown={rows.length} noun="products" onPage={(p) => update({ page: String(p) })} onPageSize={(n) => update({ size: String(n) })} />
      )}

      <div className="flex flex-col justify-between gap-1 text-[11px] text-muted-foreground sm:flex-row">
        <p>Based on connector capabilities. Selecting products does not submit or enroll them.</p>
        {summary && summary.unlistedVariants > 0 && <p>{formatNumber(summary.unlistedVariants)} active variants have no active listing and are not shown.</p>}
      </div>

      {/* which channel to start with, when the selection spans several */}
      <Dialog open={chooser !== null} onOpenChange={(o) => !o && setChooser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Which marketplace is this campaign for?</DialogTitle>
            <DialogDescription>A campaign runs on one marketplace. Your selection spans several; pick one to start with. The other products stay selected.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {chooser?.map((g) => (
              <Button
                key={g.accountId}
                variant="outline"
                className="w-full justify-between text-xs"
                onClick={() => {
                  setChooser(null);
                  onCreateCampaign(g.rows);
                }}
              >
                <span>{g.channel}</span>
                <span className="font-mono text-muted-foreground">
                  {g.rows.length} product{g.rows.length === 1 ? "" : "s"}
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
