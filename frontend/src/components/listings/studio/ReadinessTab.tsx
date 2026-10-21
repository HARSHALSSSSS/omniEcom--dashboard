import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CheckStatus, FixActionKey, Readiness, ReadinessItem } from "@/types/listingStudio";

const FIX_LABEL: Record<FixActionKey, string> = {
  edit_content: "Edit content",
  upload_images: "Add images",
  fill_attribute: "Fill attribute",
  set_price: "Set price",
  set_mrp: "Set MRP",
  map_category: "Choose category",
  add_barcode: "Add barcode",
  restock: "Restock",
  reconnect_account: "Reconnect account",
  validate: "Run validation",
  review_marketplace_feedback: "See feedback",
};

const TONE: Record<CheckStatus, { box: string; text: string; label: string }> = {
  pass: { box: "border-emerald-200 bg-emerald-50/40", text: "text-emerald-950", label: "Passed" },
  warn: { box: "border-amber-200 bg-amber-50/40", text: "text-amber-950", label: "Warning" },
  fail: { box: "border-rose-200 bg-rose-50/40", text: "text-rose-950", label: "Failed" },
};

export const StatusIcon = ({ status }: { status: CheckStatus }) =>
  status === "pass" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : status === "warn" ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" /> : <XCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />;

interface Props {
  readiness: Readiness;
  canWrite: boolean;
  checking: boolean;
  onFix: (item: ReadinessItem) => void;
  onRecheck: () => void;
}

/** the real checklist, grouped; every failing or warning check offers its fix */
export function ReadinessTab({ readiness, canWrite, checking, onFix, onRecheck }: Props) {
  const { summary } = readiness;
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Marketplace Gateway Validation</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {readiness.percent}% ready · {summary.pass} passed, {summary.warn} warning{summary.warn === 1 ? "" : "s"}, {summary.fail} failed
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="text-xs" loading={checking} onClick={onRecheck}>
          Re-check
        </Button>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Readiness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readiness.percent}>
        <div className={`h-full ${readiness.ready ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${readiness.percent}%` }} />
      </div>

      {readiness.groups.map((g) => (
        <section key={g.key} aria-label={g.label} className="space-y-2">
          <h4 className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{g.label}</span>
            <span className="font-mono normal-case">
              {g.passed} of {g.total} passed
            </span>
          </h4>
          {g.items.map((item) => {
            const tone = TONE[item.status];
            return (
              <div key={item.key} className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-xs ${tone.box}`}>
                <div className="flex min-w-0 items-start gap-2">
                  <StatusIcon status={item.status} />
                  <div className="min-w-0">
                    <p className={`font-medium ${tone.text}`}>
                      {item.label} <span className="sr-only">{tone.label}</span>
                    </p>
                    <p className="text-muted-foreground">{item.message}</p>
                  </div>
                </div>
                {item.fix && item.status !== "pass" && (
                  <Button type="button" variant="outline" size="sm" className="shrink-0 text-xs" disabled={!canWrite && item.fix.action !== "review_marketplace_feedback"} onClick={() => onFix(item)} aria-label={`${FIX_LABEL[item.fix.action]}: ${item.label}`}>
                    {FIX_LABEL[item.fix.action]}
                  </Button>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
