import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportSession } from "@/types/import";
import type { ImportRevalidation, IssueX, RevalidationChange } from "@/types/importProcessing";
import { cn } from "@/utils/cn";
import { ImportProgress } from "../ImportProgress";
import { num } from "../importFormat";
import { IssuePanelFrame } from "./IssueDetail";

const CARD = "p-4 bg-white dark:bg-card rounded-[6px] border border-[#E3E3E3] dark:border-border";
const PRIMARY = "w-full bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black dark:hover:bg-white/90 text-[12px] leading-[18px] font-medium h-[36px] rounded-[5px]";

const describe = (c: RevalidationChange): string => `Row ${c.rowNumber} · ${c.field}${c.to ? ` → ${c.to}` : ""}`;

interface RunningProps {
  session: ImportSession;
  revalidation: ImportRevalidation | null;
  productTitle: string | null;
  validCount: number;
  remaining: number;
}

/** Case A of the design: "Revalidating N corrected items..." with the checked corrections and the one being checked now. */
export function RevalidatingPanel({ session, revalidation, productTitle, validCount, remaining }: RunningProps) {
  if (!revalidation) {
    return (
      <IssuePanelFrame label="Revalidation" row={null}>
        <div className="space-y-4">
          <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">Revalidating</h3>
          <ImportProgress session={session} mode="validate" />
        </div>
      </IssuePanelFrame>
    );
  }
  const { total, checked, current, changes } = revalidation;
  return (
    <IssuePanelFrame label="Revalidation" row={null}>
      <div className="space-y-4">
        <div>
          <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">Revalidating {num(total)} corrected items...</h3>
          {productTitle && <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">{productTitle}</p>}
          <p className="text-[11px] leading-[17px] text-[#666666]">In progress · Corrections preserved</p>
        </div>

        <div className={cn(CARD, "space-y-2")}>
          <div className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white">Checking approved corrections</div>
          <p className="text-[11px] leading-[17px] text-[#666666]" aria-live="polite">
            {num(checked)} of {num(total)} checked{current ? ` · ${current}` : ""}
          </p>
          <ul className="space-y-1.5 text-[12px] leading-[18px] pt-2" aria-label="Checked corrections">
            {changes.map((c) => (
              <li key={`${c.rowNumber}-${c.field}`} className="flex items-center gap-2 text-[#000000] dark:text-white">
                <span className={`w-1.5 h-1.5 rounded-full ${c.outcome === "passed" ? "bg-emerald-500" : "bg-red-500"}`} />
                {describe(c)}
              </li>
            ))}
            {current && (
              <li className="flex items-center gap-2 text-[#666666]">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                {current}
              </li>
            )}
            {total - checked - (current ? 1 : 0) > 0 && (
              <li className="flex items-center gap-2 text-[#666666]">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
                {num(total - checked - (current ? 1 : 0))} waiting
              </li>
            )}
          </ul>
        </div>

        <p className="text-[11px] leading-[17px] text-[#666666]">
          Only corrected items are checked. {num(validCount)} valid products remain imported. The {num(remaining)} unreviewed issues stay in the queue; no import restart is needed.
        </p>
      </div>
    </IssuePanelFrame>
  );
}

interface ResultProps {
  revalidation: ImportRevalidation;
  productTitle: string | null;
  committed: boolean;
  openIssues: IssueX[];
  openTotal: number;
  onReview: () => void;
}

/** Case B of the design: "This batch passed", what was validated and the issues that are still open. */
export function RevalidationResultPanel({ revalidation, productTitle, committed, openIssues, openTotal, onReview }: ResultProps) {
  const passed = revalidation.changes.filter((c) => c.outcome === "passed");
  const failing = revalidation.changes.filter((c) => c.outcome === "still_failing");
  const all = failing.length === 0;
  return (
    <IssuePanelFrame label="Revalidation result" row={null}>
      <div className="space-y-4">
        <div>
          <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">{num(passed.length)} resolved</h3>
          {productTitle && <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">{productTitle}</p>}
          <p className="text-[11px] leading-[17px] text-[#666666]">Revalidation complete · {all ? "This batch passed" : `${num(failing.length)} still failing`}</p>
        </div>

        <div className={cn(CARD, "space-y-3")}>
          <div className="text-[12px] leading-[18px] font-semibold text-[#000000] dark:text-white">{all ? "Approved corrections validated" : "Corrections checked"}</div>
          <p className="text-[12px] leading-[18px] text-[#666666]">
            {all ? `All ${num(passed.length)} corrected items passed.` : `${num(passed.length)} of ${num(revalidation.changes.length)} corrected items passed.`}
            {committed ? " These products have now completed import." : ""}
          </p>
          <ul className="space-y-1.5 text-[12px] leading-[18px] font-medium text-[#000000] dark:text-white pt-1" aria-label="Validated corrections">
            {revalidation.changes.map((c) => (
              <li key={`${c.rowNumber}-${c.field}`} className="flex items-center gap-2">
                {c.outcome === "passed" ? <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" aria-hidden /> : <X className="w-3.5 h-3.5 text-red-600 stroke-[2.5]" aria-hidden />}
                {describe(c)}
                {c.outcome === "still_failing" && <span className="font-normal text-red-600"> · still needs a fix</span>}
              </li>
            ))}
          </ul>
        </div>

        {openTotal > 0 && (
          <div className={cn(CARD, "text-[12px] leading-[18px] space-y-1")}>
            <div className="font-semibold text-[#000000] dark:text-white">
              {num(openTotal)} {openTotal === 1 ? "issue still needs" : "issues still need"} review
            </div>
            <p className="text-[#666666]">
              {openIssues
                .slice(0, 5)
                .map((i) => `Row ${i.rowNumber}: ${i.title}.`)
                .join(" ")}{" "}
              These were not part of this validation batch.
            </p>
          </div>
        )}

        <Button onClick={onReview} className={PRIMARY}>
          Review remaining issues
        </Button>
      </div>
    </IssuePanelFrame>
  );
}
