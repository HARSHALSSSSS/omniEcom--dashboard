import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { promotionsApi } from "@/api/promotions.api";
import { errorMessage } from "@/api/errors";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { toast } from "@/hooks/useToast";
import { downloadText } from "@/components/pricing/pricingFormat";
import { formatNumber } from "@/utils/format";
import { CAMPAIGN_HORIZONS, CAMPAIGN_SORTS, PROMOTION_STATUSES, type CampaignHorizon, type PromotionAccount, type PromotionCampaignRow, type CampaignsPage } from "@/types/promotions";
import { campaignsQueryOf, type PromotionsUrlState } from "./promoParams";
import { CampaignRowMenu, type CampaignRowActions } from "./CampaignRowMenu";
import { CampaignBadge, EmptyCampaigns, LoadError, NoMatches, PromoPagination, TableSkeleton } from "./PromoUi";
import {
  CONTRIBUTION_NOTES,
  END_REASON_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  WRITE_REASON,
  campaignsCsv,
  describeTerms,
  marketplaceLabel,
  money,
  percentLabel,
  whenOf,
} from "./promoFormat";

/** a CSV export stops here; the seller is told when the list was longer */
export const CAMPAIGN_EXPORT_CAP = 10_000;
const EXPORT_PAGE = 100;

const HORIZON_LABELS: Record<CampaignHorizon, string> = { past: "Past", now: "Now", next: "Next" };
const SORT_LABELS = { newest: "Newest first", ends_soon: "Ending soonest", revenue: "Most revenue", name: "Name" } as const;
const CAPABILITY_TEXT = { supported: "Prices can be applied", partial: "Some channels cannot take prices", not_supported: "Cannot take price changes", none: "No channel" } as const;
const CAPABILITY_TONE = { supported: "text-emerald-600", partial: "text-amber-600", not_supported: "text-red-600", none: "text-muted-foreground" } as const;
const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-xs";

interface CampaignsTabProps extends CampaignRowActions {
  url: PromotionsUrlState;
  update: (patch: Partial<Record<"q" | "status" | "market" | "sort" | "page" | "size" | "when" | "ending", string | null>>, opts?: { replace?: boolean }) => void;
  clearFilters: () => void;
  data: CampaignsPage | undefined;
  loading: boolean;
  fetching: boolean;
  error: unknown;
  onRetry: () => void;
  accounts: PromotionAccount[];
  canWrite: boolean;
  busyId: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onCreateCampaign: () => void;
}

/** "Ends in 5h", "Ends in 2d 3h": a running campaign's countdown from the server's hours left */
export function countdown(hours: number): string {
  if (hours < 1) return "Ends within the hour";
  if (hours < 48) return `Ends in ${hours}h`;
  return `Ends in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function Subtitle({ c }: { c: PromotionCampaignRow }) {
  if (c.status === "active" && c.endsInHours !== null) {
    return <p className={`text-[11px] ${c.endingSoon ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>{c.endingSoon ? "Ending soon · " : ""}{countdown(c.endsInHours)}</p>;
  }
  if (c.status === "scheduled") return <p className="text-[11px] text-muted-foreground">Starts {whenOf(c.startsAt)}</p>;
  if (c.status === "draft") return <p className="text-[11px] text-muted-foreground">{c.startsAt ? `Planned for ${whenOf(c.startsAt)}` : "No dates set yet"}</p>;
  if ((c.status === "ended" || c.status === "cancelled") && c.endReason) return <p className="text-[11px] text-muted-foreground">{END_REASON_LABELS[c.endReason] ?? c.endReason}</p>;
  return null;
}

function RiskCell({ c }: { c: PromotionCampaignRow }) {
  const r = c.marginRisk;
  if (!r || r.checkedProducts === 0) return <span className="text-muted-foreground">—</span>;
  const flags: Array<{ key: string; text: string; tone: string }> = [];
  if (r.belowTarget > 0) flags.push({ key: "below", text: `${r.belowTarget} below margin target`, tone: "border-amber-500/30 bg-amber-50 text-amber-700" });
  if (r.unknownCost > 0) flags.push({ key: "cost", text: `${r.unknownCost} without a cost price`, tone: "border-amber-500/30 bg-amber-50 text-amber-700" });
  if (r.conflicts > 0) flags.push({ key: "conflict", text: `${r.conflicts} in conflict`, tone: "border-red-500/30 bg-red-50 text-red-700" });
  if (flags.length === 0) return <span className="inline-flex rounded border border-emerald-500/30 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Margins OK</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      {flags.map((f) => (
        <span key={f.key} className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${f.tone}`}>
          {f.text}
        </span>
      ))}
    </div>
  );
}

function PerformanceCell({ c }: { c: PromotionCampaignRow }) {
  if (c.status === "draft" || c.status === "scheduled" || (c.unitsMoved === 0 && c.revenueMinor === 0)) return <span className="text-muted-foreground">{c.status === "draft" || c.status === "scheduled" ? "—" : "No sales yet"}</span>;
  return (
    <div className="space-y-0.5">
      <p className="font-mono">{formatNumber(c.unitsMoved)} units · {money(c.revenueMinor, c.currency)}</p>
      {c.contributionMinor === null ? (
        <p className="text-[11px] text-muted-foreground">Contribution — (needs cost prices)</p>
      ) : (
        <p className="text-[11px] text-muted-foreground" title={c.contributionBasis ? CONTRIBUTION_NOTES[c.contributionBasis] : undefined}>
          Contribution {money(c.contributionMinor, c.currency)}
          {c.contributionBps === null ? "" : ` (${percentLabel(c.contributionBps)})`}
        </p>
      )}
    </div>
  );
}

export function CampaignsTab({ url, update, clearFilters, data, loading, fetching, error, onRetry, accounts, canWrite, busyId, refreshing, onRefresh, onCreateCampaign, ...actions }: CampaignsTabProps) {
  const [text, setText] = useState(url.q ?? "");
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
  const rows = data?.items ?? [];
  const filtered = Boolean(url.q || url.status || url.endingSoon || url.marketplace);
  const noneAtAll = !loading && !error && data !== undefined && data.counts.all === 0 && !filtered;
  const horizonActive = url.status ? null : url.horizon;

  const exportCsv = () =>
    void exportGuard.run(async () => {
      try {
        const base = { ...campaignsQueryOf(url), page: 1, pageSize: EXPORT_PAGE };
        let out: PromotionCampaignRow[] = [];
        let capped = false;
        for (let page = 1; ; page++) {
          const res = await promotionsApi.campaigns({ ...base, page });
          out.push(...res.items);
          if (out.length >= res.total || res.items.length === 0 || page >= res.pages) break;
          if (out.length >= CAMPAIGN_EXPORT_CAP) {
            capped = res.total > CAMPAIGN_EXPORT_CAP;
            break;
          }
        }
        if (out.length > CAMPAIGN_EXPORT_CAP) {
          out = out.slice(0, CAMPAIGN_EXPORT_CAP);
          capped = true;
        }
        downloadText(`promotions-campaigns-${new Date().toISOString().slice(0, 10)}.csv`, campaignsCsv(out));
        if (capped) toast({ title: `The export holds the first ${formatNumber(CAMPAIGN_EXPORT_CAP)} rows`, description: "Narrow the filters to export the rest.", variant: "warning" });
      } catch (e) {
        toast({ title: "Could not export the campaigns", description: errorMessage(e), variant: "destructive" });
      }
    });

  return (
    <div className="w-full space-y-6">
      {/* Header and Actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Campaigns</h1>
          <p className="text-xs text-muted-foreground">Review promotion activity and manage campaigns on the connected channels. Based on connector capabilities.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-1.5 bg-foreground text-xs text-background hover:bg-foreground/90" disabled={!canWrite} title={canWrite ? undefined : WRITE_REASON} onClick={onCreateCampaign}>
            <Plus className="h-3.5 w-3.5" /> Create Campaign
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" aria-label="Export campaigns" loading={exportGuard.busy} disabled={!data || data.total === 0} onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onRefresh} loading={refreshing} disabled={!canWrite} title={canWrite ? "Start due campaigns, end finished ones and refresh the results now" : WRITE_REASON}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" aria-label="Search campaigns" placeholder="Search name or code" value={text} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)} className="w-56 pl-9 text-xs" />
            </div>
            <select aria-label="Marketplace" value={url.marketplace ?? ""} onChange={(e) => update({ market: e.target.value || null })} className={selectClass}>
              <option value="">All Marketplaces</option>
              {markets.map((m) => (
                <option key={m} value={m}>
                  {marketplaceLabel(m)}
                </option>
              ))}
            </select>
            <select aria-label="Status" value={url.status ?? ""} onChange={(e) => update({ status: e.target.value || null })} className={selectClass}>
              <option value="">Any status</option>
              {PROMOTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                  {data ? ` (${data.counts[s] ?? 0})` : ""}
                </option>
              ))}
            </select>
            <select aria-label="Sort by" value={url.campaignSort} onChange={(e) => update({ sort: e.target.value === "newest" ? null : e.target.value })} className={selectClass}>
              {CAMPAIGN_SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5 text-xs">
              {[
                { id: "ending", label: "Ending soon", on: url.endingSoon, click: () => update({ ending: url.endingSoon ? null : "true" }) },
                { id: "active", label: "Active", on: url.status === "active", click: () => update({ status: url.status === "active" ? null : "active" }) },
                { id: "past", label: "Past", on: !url.status && url.horizon === "past", click: () => update({ status: null, when: url.horizon === "past" && !url.status ? null : "past" }) },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={p.on}
                  onClick={p.click}
                  className={`rounded-md border px-3 py-1 font-medium transition-colors ${p.on ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <span className="font-mono text-xs text-muted-foreground">{data ? `${formatNumber(data.total)} campaign${data.total === 1 ? "" : "s"}` : ""}</span>
        </div>

        {/* Time horizon toggle */}
        <div role="group" aria-label="Time horizon" className="inline-flex rounded-lg border border-border bg-muted p-1 text-xs">
          {CAMPAIGN_HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={horizonActive === h}
              onClick={() => update({ status: null, when: h === "now" ? null : h })}
              className={`rounded-md px-3.5 py-1.5 font-medium transition-all ${horizonActive === h ? "bg-foreground font-semibold text-background shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              {HORIZON_LABELS[h]}
              {data && <span className="ml-1 font-mono text-[11px] opacity-80">{formatNumber(data.horizonCounts[h])}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Campaigns Table */}
      {loading && !data ? (
        <TableSkeleton label="Loading campaigns" />
      ) : error && !data ? (
        <LoadError noun="The campaigns" message={errorMessage(error)} onRetry={onRetry} />
      ) : noneAtAll ? (
        <EmptyCampaigns canWrite={canWrite} onCreate={onCreateCampaign} />
      ) : rows.length === 0 ? (
        <NoMatches noun="campaigns" onClear={clearFilters} />
      ) : (
        <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-2xs transition-opacity ${fetching ? "opacity-60" : ""}`} aria-busy={fetching}>
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Marketplace</th>
                <th className="px-4 py-3 font-medium">Discount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Products</th>
                <th className="px-4 py-3 font-medium">Performance</th>
                <th className="px-4 py-3 font-medium">Margin check</th>
                <th className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="align-top hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => actions.onOpen(c)} className="flex flex-col text-left" aria-label={`Open ${c.name}`}>
                      <span className="font-semibold text-foreground hover:underline">{c.name}</span>
                      <span className="font-mono text-[11px] text-blue-600">{c.code}</span>
                    </button>
                    <Subtitle c={c} />
                  </td>
                  <td className="px-4 py-3">
                    {c.channels.length === 0 ? (
                      <span className="text-muted-foreground">No connected account</span>
                    ) : (
                      <p className="font-medium text-foreground">{c.channels.map((ch) => ch.displayName || marketplaceLabel(ch.marketplace)).join(", ")}</p>
                    )}
                    <p className={`text-[11px] ${CAPABILITY_TONE[c.capability]}`}>{CAPABILITY_TEXT[c.capability]}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{describeTerms(c)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {TYPE_LABELS[c.type]}
                      {c.avgDiscountBps !== null ? ` · average ${percentLabel(c.avgDiscountBps)} off` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {whenOf(c.startsAt)} → {whenOf(c.endsAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <CampaignBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono">
                      {formatNumber(c.itemCounts.total)} product{c.itemCounts.total === 1 ? "" : "s"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.itemCounts.live > 0 ? `${formatNumber(c.itemCounts.live)} live · ` : ""}
                      {formatNumber(c.itemCounts.eligible + c.itemCounts.pending_sync)} ready
                      {c.itemCounts.ineligible > 0 ? <span className="text-rose-600"> · {formatNumber(c.itemCounts.ineligible)} cannot run</span> : null}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <PerformanceCell c={c} />
                  </td>
                  <td className="px-4 py-3">
                    <RiskCell c={c} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <CampaignRowMenu c={c} canWrite={canWrite} busy={busyId === c.id} {...actions} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 0 && (
        <PromoPagination page={url.page} pages={data.pages} total={data.total} pageSize={url.pageSize} shown={rows.length} noun="campaigns" onPage={(p) => update({ page: String(p) })} onPageSize={(n) => update({ size: String(n) })} />
      )}

      <p className="text-[11px] text-muted-foreground">Based on connector capabilities. No campaign starts without your confirmation.</p>
    </div>
  );
}
