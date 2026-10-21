import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { Waterfall } from "@/types/profitability";
import { MISSING_HELP, WRITE_REASON, missingLabel, money } from "./profitFormat";

const TONES = {
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
  info: "border-border bg-muted/50 text-foreground",
};

function Banner({ tone, title, children, action }: { tone: keyof typeof TONES; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === "info" ? "status" : "alert"} className={cn("flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3.5 text-xs", TONES[tone])}>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
      {action}
    </div>
  );
}

interface Props {
  data: Waterfall;
  canWrite: boolean;
  onAddSpend: () => void;
}

/** what the numbers cannot tell yet: truncated analysis, missing or estimated costs, advertising that belongs to no channel */
export function ProfitBanners({ data, canWrite, onAddSpend }: Props) {
  const truncated = data.truncated || data.comparison?.truncated === true;
  const adMissing = data.missing.includes("advertising");
  return (
    <div className="space-y-3">
      {truncated && (
        <Banner tone="warning" title="This range has more orders than can be analysed at once">
          <p>
            {data.truncated
              ? `${formatNumber(data.ordersAnalysed)} of ${formatNumber(data.ordersInRange)} orders were analysed, so the figures below are partial.`
              : "The previous period has more orders than can be analysed, so the comparison is partial."}{" "}
            Choose a shorter range for exact numbers.
          </p>
        </Banner>
      )}

      {data.completeness === "incomplete" && (
        <Banner
          tone="danger"
          title="Net contribution is not shown because some costs are missing"
          action={
            adMissing && canWrite ? (
              <Button size="sm" variant="outline" className="shrink-0 bg-background text-xs" onClick={onAddSpend}>
                Record advertising spend
              </Button>
            ) : undefined
          }
        >
          <p>Nothing is guessed: a missing cost is shown as a dash, and revenue minus the costs that are known is not a profit figure.</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {data.missing.map((k) => (
              <li key={k}>
                <span className="font-medium capitalize">{missingLabel(k)}</span>: {MISSING_HELP[k] ?? "No data for this period."}
                {k === "advertising" && !canWrite ? ` ${WRITE_REASON}` : ""}
              </li>
            ))}
          </ul>
        </Banner>
      )}

      {data.completeness === "estimated" && (
        <Banner tone="warning" title="Some figures are estimates">
          <p>Product cost uses each product's current cost price and some marketplace fees come from your fee profile. Steps marked Estimated will move once actuals are recorded.</p>
        </Banner>
      )}

      {data.unallocatedAdvertisingMinor > 0 && (
        <Banner tone="info" title={`${money(data.unallocatedAdvertisingMinor)} of advertising is not tied to a marketplace`}>
          <p>It is counted in the total but appears in no channel row, so the channel margins add up to more than the total.</p>
        </Banner>
      )}
    </div>
  );
}
