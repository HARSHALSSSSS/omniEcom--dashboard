import { errorMessage } from "@/api/errors";
import { saveBlob } from "@/components/products/list/saveBlob";
import { useExportAttention, useReturnsAttention } from "@/hooks/useReturns";
import { toast } from "@/hooks/useToast";
import { formatNumber } from "@/utils/format";
import type { AttentionIssue } from "@/types/returns";
import { BTN_LIGHT, Notice, SkeletonRows } from "./design";
import type { DrawerKind } from "./returnParams";

const ISSUE_LABEL: Record<AttentionIssue, string> = {
  inspection_overdue: "Inspection overdue",
  refund_pending: "Refund pending",
  quantity_mismatch: "Quantity mismatch",
  disposition_missing: "Disposition missing",
};

const SHOWN = 10;

/** which drawer a recommended action belongs to, from the endpoint it points at */
function drawerOf(href: string): DrawerKind {
  if (href.endsWith("/inspection")) return "inspect";
  if (href.endsWith("/refund")) return "refund";
  return "return";
}

/** the returns that need attention, one row each, with the next action and an export (GET /returns/attention) */
export function AttentionSection({ onOpen }: { onOpen: (kind: DrawerKind, id: string) => void }) {
  const attention = useReturnsAttention();
  const exporter = useExportAttention();
  const data = attention.data;
  const total = data?.total ?? 0;

  const onExport = () =>
    exporter.mutate(undefined, {
      onSuccess: (file) => saveBlob(file.blob, file.fileName),
      onError: (e) => toast({ title: "Export failed", description: errorMessage(e), variant: "destructive" }),
    });

  return (
    <section className="space-y-3.5 border-t border-[#EAEAEA] pt-4" aria-label="Returns that need attention">
      <div className="flex items-center gap-2 text-[10px]">
        <span className="font-semibold uppercase tracking-wider text-[#666666]">FILTERED VIEW</span>
        <span className="h-2.5 w-[1px] bg-[#BDBDBD]" aria-hidden />
        <span className="text-[11px] font-semibold text-black">Needs Attention</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-semibold leading-[26px] text-black">{data ? `${formatNumber(total)} ${total === 1 ? "return needs" : "returns need"} attention` : "Returns that need attention"}</h2>
          <p className="text-[12px] leading-[17px] text-[#666666]">One row per affected return. Signals can overlap; these are not additional returns.</p>
        </div>
        <button type="button" onClick={onExport} disabled={exporter.isPending || total === 0} className={BTN_LIGHT}>
          {exporter.isPending ? "Exporting..." : "Export exceptions"}
        </button>
      </div>

      {attention.isLoading && !data ? (
        <SkeletonRows rows={3} label="Loading returns that need attention" />
      ) : attention.isError && !data ? (
        <Notice
          role="alert"
          tone="error"
          title="The attention list could not be loaded."
          description={errorMessage(attention.error)}
          action={
            <button type="button" className={BTN_LIGHT} onClick={() => void attention.refetch()}>
              Retry
            </button>
          }
        />
      ) : data && data.items.length === 0 ? (
        <Notice title="Nothing needs attention." description="No overdue inspections, quantity mismatches, undecided stock or refunds waiting on you." />
      ) : data ? (
        <div className="w-full overflow-hidden rounded-lg border border-[#EAEAEA] bg-white text-[12px]">
          <table aria-label="Returns that need attention" className="w-full text-left">
            <thead>
              <tr className="bg-[#F5F5F5] text-[10px] text-[#666666]">
                <th scope="col" className="w-[17%] px-4 py-2.5 font-normal">
                  Return
                </th>
                <th scope="col" className="w-1/4 py-2.5 font-normal">
                  Issue
                </th>
                <th scope="col" className="py-2.5 font-normal">
                  Impact
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">
                  Recommended action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA]/80">
              {data.items.slice(0, SHOWN).map((x) => (
                <tr key={x.returnId} className="hover:bg-neutral-50/50">
                  <td className="px-4 py-3 font-semibold text-[#666666]">{x.number}</td>
                  <td className="py-3 pr-3 font-medium text-[#D97706]">{ISSUE_LABEL[x.issue]}</td>
                  <td className="py-3 pr-3 text-[#666666]">{x.impact}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" aria-label={`${x.recommendedAction.text} ${x.number}`} onClick={() => onOpen(drawerOf(x.recommendedAction.href), x.returnId)} className="cursor-pointer font-medium text-black hover:underline">
                      {x.recommendedAction.text} →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && data.items.length > 0 && (
        <div className="flex items-center justify-between pt-1 text-[10px] text-[#666666]">
          <span>One row per affected return{total > SHOWN ? `. Showing the first ${SHOWN}; export for the full list` : ""}</span>
          <span>
            {formatNumber(total)} {total === 1 ? "return needs" : "returns need"} attention
          </span>
        </div>
      )}
    </section>
  );
}
