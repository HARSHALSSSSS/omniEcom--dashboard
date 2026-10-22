import { errorMessage } from "@/api/errors";
import { useReturnsRefunds } from "@/hooks/useReturns";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { RefundQuery, RefundStatus } from "@/types/returns";
import { BTN_LIGHT, DesignPagination, INSPECTION_COLOR, Notice, REFUND_COLOR, SectionHeading, SkeletonRows, TABLE_WRAP } from "./design";
import { fmtStamp, formatMoney, humanize } from "./returnFormat";
import { DEFAULT_PAGE_SIZE, INSPECTION_LABELS, REFUND_DESIGN_LABELS, REFUND_QUEUES, REFUND_QUEUE_LABELS, type DrawerKind, type useReturnsUrlState } from "./returnParams";

type UrlState = ReturnType<typeof useReturnsUrlState>;

const ACTION_LABEL = { review_failure: "Review failure →", review_refund: "Review refund →", view: "View →" } as const;

interface RefundsViewProps {
  url: UrlState;
  onOpen: (kind: DrawerKind, id: string) => void;
}

/** the Refunds tab: the refund queue (actionable refunds after inspection, plus processed ones) with the connector's amounts and status */
export function RefundsView({ url, onOpen }: RefundsViewProps) {
  const { update, page, pageSize, refundQueue } = url;
  const query: RefundQuery = { page, pageSize, ...(refundQueue === "all" ? {} : { status: refundQueue as RefundStatus }) };
  const refunds = useReturnsRefunds(query);
  const data = refunds.data;
  const rows = data?.items ?? [];
  const counts = data?.counts;
  const waiting = counts ? counts.pending + counts.ready + counts.processing + counts.failed : 0;

  return (
    <div className="animate-in fade-in space-y-6 duration-200">
      <section className="space-y-3">
        <SectionHeading title="Refunds" description="Review connector-provided amounts and status. Availability depends on the connected channel." />

        <div role="tablist" aria-label="Refund queues" className="flex flex-wrap items-center gap-2">
          {REFUND_QUEUES.map((q) => (
            <button
              key={q}
              type="button"
              role="tab"
              aria-selected={q === refundQueue}
              onClick={() => update({ rq: q === "all" ? null : q })}
              className={cn("flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition-colors", q === refundQueue ? "bg-[#F5F5F5] font-semibold text-black" : "bg-white text-black hover:bg-neutral-50")}
            >
              {REFUND_QUEUE_LABELS[q]}
              {counts && q !== "all" && q !== "processed" && <span className="font-mono text-[10px] text-[#666666]">{formatNumber(counts[q])}</span>}
            </button>
          ))}
        </div>

        {refunds.isLoading ? (
          <SkeletonRows rows={5} label="Loading refunds" />
        ) : refunds.isError && !data ? (
          <Notice
            role="alert"
            tone="error"
            title="Refunds could not be loaded."
            description={errorMessage(refunds.error)}
            action={
              <button type="button" className={BTN_LIGHT} onClick={() => void refunds.refetch()}>
                Retry
              </button>
            }
          />
        ) : rows.length === 0 ? (
          <Notice title="No refunds in this queue." description="Returns reach the refund queue once their inspection is done. Pre-inspection returns are not in it." />
        ) : (
          <>
            <div className={cn(TABLE_WRAP, "overflow-hidden transition-opacity", refunds.isFetching && refunds.isPlaceholderData && "opacity-60")}>
              <table aria-label="Refunds" className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#EAEAEA] bg-[#FAFAFA] text-[11px] text-[#666666]">
                    <th scope="col" className="px-4 py-2.5 font-normal">
                      Return
                    </th>
                    {["Order", "Marketplace", "Refund Status", "Refund Amount", "Return Status", "Inspection Status", "Last Update"].map((c) => (
                      <th key={c} scope="col" className="px-3 py-2.5 font-normal">
                        {c}
                      </th>
                    ))}
                    <th scope="col" className="py-2.5 pr-4 text-right font-normal">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA]">
                  {rows.map((row) => (
                    <tr key={row.returnId} className="transition-colors hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-semibold text-black">
                        <button type="button" onClick={() => onOpen("refund", row.returnId)} className="cursor-pointer font-semibold text-black hover:underline">
                          {row.number}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-[#666666]">
                        <button type="button" onClick={() => onOpen("refund", row.returnId)} className="cursor-pointer text-[#666666] hover:text-black hover:underline">
                          {row.orderNumber}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-[#666666]">{row.channel.name}</td>
                      <td className="px-3 py-3">
                        <button type="button" aria-label={`Refund status of ${row.number}`} onClick={() => onOpen("refund", row.returnId)} className={cn("cursor-pointer text-left hover:underline", REFUND_COLOR[row.refund.status])}>
                          {REFUND_DESIGN_LABELS[row.refund.status]}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-medium text-black">{row.refund.amountMinor === null ? "—" : formatMoney(row.refund.amountMinor, row.refund.currency)}</td>
                      <td className="px-3 py-3 font-medium text-[#666666]">{humanize(row.returnStatus)}</td>
                      <td className="px-3 py-3">
                        <button type="button" aria-label={`Inspection of ${row.number}`} onClick={() => onOpen("inspect", row.returnId)} className={cn("cursor-pointer text-left hover:underline", INSPECTION_COLOR[row.inspectionStatus])}>
                          {INSPECTION_LABELS[row.inspectionStatus]}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-[#666666]">{fmtStamp(row.lastUpdateAt)}</td>
                      <td className="py-3 pr-4 text-right">
                        <button type="button" aria-label={`${ACTION_LABEL[row.action.key].replace(" →", "")} ${row.number}`} onClick={() => onOpen("refund", row.returnId)} className="inline-flex cursor-pointer items-center gap-0.5 font-medium text-black hover:underline">
                          {ACTION_LABEL[row.action.key]}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DesignPagination
              page={data?.page ?? page}
              pages={data?.pages ?? 1}
              total={data?.total ?? 0}
              pageSize={pageSize}
              shown={rows.length}
              noun="refunds"
              onPage={(p) => update({ page: p > 1 ? String(p) : null }, { keepPage: true })}
              onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
            />
          </>
        )}

        {counts && (
          <p className="pt-1 text-[11px] text-[#666666]">
            {formatNumber(waiting)} {waiting === 1 ? "refund" : "refunds"} pending resolution: {formatNumber(counts.ready)} ready · {formatNumber(counts.processing)} processing · {formatNumber(counts.failed)} failed. Pre-inspection returns are not yet in the actionable refund queue.
          </p>
        )}
      </section>
    </div>
  );
}
