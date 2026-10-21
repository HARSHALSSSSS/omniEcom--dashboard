import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDateTime } from "@/utils/format";
import type { DecisionAction, PriceProposal } from "@/types/pricing";
import { NO_APPROVE_REASON, STATUS_LABELS, STATUS_TONE, STRATEGY_LABELS, isDecidable, money, signedBps } from "../pricingFormat";
import { TOOLBAR_BUTTON } from "../PricingStates";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <span className="block text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-semibold text-foreground">{value}</span>
      {hint && <span className="mt-0.5 block text-[10px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

interface ProposalDrawerProps {
  proposal: PriceProposal | null;
  canApprove: boolean;
  onClose: () => void;
  onDecide: (row: PriceProposal, action: DecisionAction) => void;
}

/** the reasoning behind one proposal, with what the competitor charges and what the change is expected to do */
export function ProposalDrawer({ proposal: p, canApprove, onClose, onDecide }: ProposalDrawerProps) {
  return (
    <Sheet open={p !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[440px] max-w-full overflow-y-auto">
        {p && (
          <div className="flex flex-col gap-4">
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="text-base">{p.productTitle}</SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {p.sku} · {p.channelName}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[p.status]}`}>{STATUS_LABELS[p.status]}</span>
              <span className="text-[11px] text-muted-foreground">{STRATEGY_LABELS[p.strategy]}</span>
              {p.policyName && <span className="text-[11px] text-muted-foreground">Policy: {p.policyName}</span>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Current price" value={money(p.currentPriceMinor, p.currency)} />
              <Stat label="Proposed price" value={money(p.proposedPriceMinor, p.currency)} hint={signedBps(p.priceChangeBps)} />
              <Stat
                label="Competitor price"
                value={p.competitorPriceMinor === null ? "N/A" : money(p.competitorPriceMinor, p.currency)}
                hint={p.competitorPriceMinor === null ? "No competitor price recorded" : undefined}
              />
              <Stat
                label="Margin change"
                value={p.estMarginDeltaBps === null ? "N/A" : signedBps(p.estMarginDeltaBps)}
                hint={p.estMarginDeltaBps === null ? "Add a cost price to the variant" : "Per unit, estimated"}
              />
              <Stat
                label="Sales change"
                value={p.projectedSalesDeltaBps === null ? "N/A" : signedBps(p.projectedSalesDeltaBps)}
                hint={p.projectedSalesDeltaBps === null ? "Not enough sales history" : "Projected units"}
              />
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-3.5">
              <span className="text-xs font-semibold text-foreground">Why this price</span>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{p.reasoning}</p>
            </div>

            {p.failureMessage && (
              <p role="status" className={`rounded-lg border px-3 py-2 text-xs ${p.status === "failed" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                {p.failureMessage}
              </p>
            )}

            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDateTime(p.createdAt)}</dd>
              {p.expiresAt && (
                <>
                  <dt className="text-muted-foreground">Expires</dt>
                  <dd>{formatDateTime(p.expiresAt)}</dd>
                </>
              )}
              {p.decidedAt && (
                <>
                  <dt className="text-muted-foreground">Decided</dt>
                  <dd>
                    {formatDateTime(p.decidedAt)}
                    {p.decidedByName ? ` by ${p.decidedByName}` : ""}
                  </dd>
                </>
              )}
              {p.appliedAt && (
                <>
                  <dt className="text-muted-foreground">Price applied</dt>
                  <dd>{formatDateTime(p.appliedAt)}</dd>
                </>
              )}
              {p.decisionNote && (
                <>
                  <dt className="text-muted-foreground">Note</dt>
                  <dd className="break-words">{p.decisionNote}</dd>
                </>
              )}
            </dl>

            {isDecidable(p) && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <button type="button" className={`${TOOLBAR_BUTTON} bg-primary text-primary-foreground hover:bg-primary/90`} disabled={!canApprove} title={canApprove ? undefined : NO_APPROVE_REASON} onClick={() => onDecide(p, "approve")}>
                  {p.status === "failed" ? "Retry price" : "Approve price"}
                </button>
                <button type="button" className={TOOLBAR_BUTTON} disabled={!canApprove} title={canApprove ? undefined : NO_APPROVE_REASON} onClick={() => onDecide(p, "reject")}>
                  Reject
                </button>
                {!canApprove && <span className="text-[11px] text-muted-foreground">{NO_APPROVE_REASON}.</span>}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
