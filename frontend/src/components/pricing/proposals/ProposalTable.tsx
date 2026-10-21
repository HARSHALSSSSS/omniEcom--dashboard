import { formatNumber, formatRelativeTime } from "@/utils/format";
import type { DecisionAction, PriceProposal } from "@/types/pricing";
import { NO_APPROVE_REASON, STATUS_LABELS, STATUS_TONE, STRATEGY_LABELS, isDecidable, money, signedBps } from "../pricingFormat";
import { TOOLBAR_BUTTON } from "../PricingStates";

interface ProposalTableProps {
  rows: PriceProposal[];
  selected: ReadonlySet<string>;
  canApprove: boolean;
  refreshing: boolean;
  /** the proposal whose decision is running */
  busyId: string | null;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (row: PriceProposal) => void;
  onDecide: (row: PriceProposal, action: DecisionAction) => void;
}

export function ProposalTable({ rows, selected, canApprove, refreshing, busyId, onToggle, onToggleAll, onOpen, onDecide }: ProposalTableProps) {
  const selectable = rows.filter(isDecidable);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${refreshing ? "opacity-60" : ""}`} aria-busy={refreshing}>
      <table className="w-full min-w-[1040px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            <th className="w-10 py-3 pl-4 pr-2">
              <input
                type="checkbox"
                aria-label="Select all open proposals on this page"
                checked={allSelected}
                disabled={!canApprove || selectable.length === 0}
                title={canApprove ? undefined : NO_APPROVE_REASON}
                onChange={onToggleAll}
                className="h-4 w-4 cursor-pointer accent-[#1D4ED8] disabled:cursor-not-allowed"
              />
            </th>
            {["Product / SKU", "Channel", "Current", "Proposed", "Margin change", "Sales change", "Status"].map((c, i) => (
              <th key={c} scope="col" className={`px-3 py-3 ${i >= 2 && i <= 5 ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
            <th scope="col" className="py-3 pl-3 pr-4 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => {
            const decidable = isDecidable(p);
            const busy = busyId === p.id;
            return (
              <tr key={p.id} className="cursor-pointer hover:bg-muted/30" onClick={() => onOpen(p)}>
                <td className="py-3 pl-4 pr-2" onClick={(e) => e.stopPropagation()}>
                  {decidable && canApprove ? (
                    <input type="checkbox" aria-label={`Select ${p.sku}`} checked={selected.has(p.id)} onChange={() => onToggle(p.id)} className="h-4 w-4 cursor-pointer accent-[#1D4ED8]" />
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <button type="button" className="block max-w-[260px] truncate text-left font-semibold text-foreground hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(p); }}>
                    {p.productTitle}
                  </button>
                  <span className="font-mono text-[11px] text-muted-foreground">{p.sku}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">{STRATEGY_LABELS[p.strategy]}</span>
                </td>
                <td className="px-3 py-3 font-medium">{p.channelName}</td>
                <td className="px-3 py-3 text-right font-mono">{money(p.currentPriceMinor, p.currency)}</td>
                <td className="px-3 py-3 text-right">
                  <span className="font-mono font-semibold text-[#1D4ED8]">{money(p.proposedPriceMinor, p.currency)}</span>
                  <span className={`block text-[11px] ${p.priceChangeBps >= 0 ? "text-emerald-700" : "text-amber-700"}`}>{signedBps(p.priceChangeBps)}</span>
                </td>
                <td className="px-3 py-3 text-right font-mono">
                  {p.estMarginDeltaBps === null ? (
                    <span className="text-muted-foreground" title="The variant has no cost price">
                      —
                    </span>
                  ) : (
                    <span className={`font-semibold ${p.estMarginDeltaBps >= 0 ? "text-emerald-700" : "text-amber-700"}`}>{signedBps(p.estMarginDeltaBps)}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right font-mono">
                  {p.projectedSalesDeltaBps === null ? (
                    <span className="text-muted-foreground" title="Not enough sales history">
                      —
                    </span>
                  ) : (
                    signedBps(p.projectedSalesDeltaBps)
                  )}
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[p.status]}`}>{STATUS_LABELS[p.status]}</span>
                  {p.status === "pending_review" && p.expiresAt && <span className="mt-0.5 block text-[10px] text-muted-foreground">Expires {formatRelativeTime(p.expiresAt)}</span>}
                  {p.pushSkipped && <span className="mt-0.5 block text-[10px] text-amber-700">Update on the marketplace</span>}
                </td>
                <td className="py-3 pl-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                  {decidable && canApprove ? (
                    <span className="inline-flex items-center gap-1.5">
                      <button type="button" className={TOOLBAR_BUTTON} disabled={busy} aria-label={`${p.status === "failed" ? "Retry" : "Approve"} ${p.sku}`} onClick={() => onDecide(p, "approve")}>
                        {p.status === "failed" ? "Retry" : "Approve"}
                      </button>
                      <button type="button" className={TOOLBAR_BUTTON} disabled={busy} aria-label={`Reject ${p.sku}`} onClick={() => onDecide(p, "reject")}>
                        Reject
                      </button>
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">{decidable ? "View only" : p.decidedByName ?? (p.status === "auto_applied" ? "Automatic" : "")}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** the line under the table: how the numbers are meant */
export function ProposalFootnote({ total }: { total: number }) {
  return (
    <p className="text-[11px] text-muted-foreground">
      {formatNumber(total)} {total === 1 ? "proposal" : "proposals"}. Margin and sales changes are estimates; a dash means there is no cost price or not enough sales history to estimate.
    </p>
  );
}
