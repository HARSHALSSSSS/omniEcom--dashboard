import { useEffect, useState } from "react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGenerateProposals, usePolicies } from "@/hooks/usePricing";
import { formatINR, formatNumber } from "@/utils/format";
import type { GenerateItem, GenerateResponse, PricingChannel } from "@/types/pricing";
import { SELECT_CLASS } from "../PricingStates";

const ITEM_TEXT: Record<GenerateItem["status"], string> = {
  proposed: "Proposed",
  auto_applied: "Applied automatically",
  unchanged: "No change needed",
  skipped: "Skipped",
  failed: "Failed",
};

function Summary({ response }: { response: GenerateResponse }) {
  if (response.queued) {
    return (
      <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        This is a large run ({formatNumber(response.pairs)} products on channels), so it runs in the background. New proposals appear in the queue in a few minutes.
      </p>
    );
  }
  const r = response.result;
  const skipped = response.pushed.filter((p) => p.skipped).length;
  return (
    <div className="space-y-2" role="status">
      <p className="text-xs">
        <strong>{r.dryRun ? "Preview, nothing was saved. " : ""}</strong>
        {formatNumber(r.evaluated)} checked · {formatNumber(r.proposed)} {r.dryRun ? "would be proposed" : "proposed"} · {formatNumber(r.autoApplied)} {r.dryRun ? "would apply automatically" : "applied automatically"} · {formatNumber(r.unchanged)} unchanged
        · {formatNumber(r.skipped)} skipped
        {r.failed > 0 ? ` · ${formatNumber(r.failed)} failed` : ""}
      </p>
      {response.truncated && <p className="text-[11px] text-amber-700">Only the first products were checked in this run. Run it again after reviewing to cover the rest.</p>}
      {skipped > 0 && <p className="text-[11px] text-amber-700">{skipped} auto-applied {skipped === 1 ? "price" : "prices"} could not be pushed to the marketplace API: change them in the seller panel.</p>}
      {r.items.length > 0 && (
        <ul className="max-h-[220px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {r.items.map((i) => (
            <li key={`${i.variantId}:${i.accountId}`} className="flex items-start justify-between gap-3 px-3 py-1.5 text-xs">
              <span className="min-w-0">
                <span className="font-mono font-semibold">{i.sku}</span>
                {i.reason && <span className="block truncate text-[11px] text-muted-foreground">{i.reason}</span>}
              </span>
              <span className="shrink-0 text-right">
                {i.proposedPriceMinor !== null && i.proposedPriceMinor !== i.currentPriceMinor ? (
                  <span className="font-mono">
                    {formatINR(i.currentPriceMinor)} → {formatINR(i.proposedPriceMinor)}
                  </span>
                ) : null}
                <span className="block text-[11px] text-muted-foreground">{ITEM_TEXT[i.status]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface GenerateDialogProps {
  open: boolean;
  channels: PricingChannel[];
  onClose: () => void;
}

/** runs the active policies against the listings: a preview first, then the real run that creates the proposals */
export function GenerateDialog({ open, channels, onClose }: GenerateDialogProps) {
  const policies = usePolicies(open);
  const generate = useGenerateProposals();
  const [accountId, setAccountId] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [response, setResponse] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { reset } = generate;

  useEffect(() => {
    if (open) return;
    setResponse(null);
    setError(null);
    reset();
  }, [open, reset]);

  const active = (policies.data ?? []).filter((p) => p.status === "active");
  const noPolicies = policies.isSuccess && active.length === 0;

  const run = (dryRun: boolean) => {
    setError(null);
    generate.mutate(
      { dryRun, ...(accountId ? { accountId } : {}), ...(policyId ? { policyId } : {}) },
      { onSuccess: setResponse, onError: (e) => setError(errorMessage(e)) },
    );
  };
  const edit = () => {
    setResponse(null);
    setError(null);
  };
  const wasPreview = response !== null && !response.queued && response.result.dryRun;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !generate.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate price proposals</DialogTitle>
          <DialogDescription className="text-xs">
            Checks every active listing against your active policies. Price changes under a policy&apos;s auto-approve limit are applied at once; everything else waits in the queue for your review.
          </DialogDescription>
        </DialogHeader>

        {noPolicies && (
          <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            There are no active policies yet. Create one in the Policies tab first.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold">
            Channel
            <select className={`${SELECT_CLASS} w-full`} value={accountId} disabled={generate.isPending} onChange={(e) => { setAccountId(e.target.value); edit(); }}>
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c.accountId} value={c.accountId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Policy
            <select className={`${SELECT_CLASS} w-full`} value={policyId} disabled={generate.isPending} onChange={(e) => { setPolicyId(e.target.value); edit(); }}>
              <option value="">All active policies</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        )}
        {response && <Summary response={response} />}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" disabled={generate.isPending} onClick={onClose}>
            Close
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={generate.isPending || noPolicies} onClick={() => run(true)}>
            Preview only
          </Button>
          <Button type="button" size="sm" loading={generate.isPending} disabled={noPolicies || (response !== null && !wasPreview)} onClick={() => run(false)}>
            {wasPreview ? "Generate proposals now" : "Generate proposals"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
