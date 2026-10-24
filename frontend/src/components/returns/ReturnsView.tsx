import { errorMessage } from "@/api/errors";
import { useReturnDetail, useReturnOrder, useReturnsLedger } from "@/hooks/useReturns";
import { cn } from "@/utils/cn";
import type { LedgerRow, ReturnDetail, ReturnOrder } from "@/types/returns";
import { BTN_LIGHT, DesignPagination, Notice, SectionHeading, SkeletonRows, STAGE_COLOR, TABLE_WRAP } from "./design";
import { fmtStamp, humanize } from "./returnFormat";
import { DEFAULT_PAGE_SIZE, isFiltered, ledgerQueryOf, type DrawerKind, type useReturnsUrlState } from "./returnParams";
import { rowAction } from "./returnUi";

type UrlState = ReturnType<typeof useReturnsUrlState>;

interface ReturnsViewProps {
  url: UrlState;
  onOpen: (kind: DrawerKind, id: string) => void;
}

function Step({ done, title, text, cta, onClick }: { done: boolean; title: string; text: string; cta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group -mx-2.5 flex w-full cursor-pointer items-center justify-between rounded-lg border border-transparent p-2.5 text-left transition-all hover:border-[#EAEAEA] hover:bg-neutral-50/80"
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors", done ? "border-[#16A34A] bg-[#16A34A] text-white" : "border-[#BDBDBD] bg-white group-hover:border-black")}>
          {done && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>
        <div>
          <span className="block text-[13px] font-semibold leading-tight text-black">
            {title}
            <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
          </span>
          <span className="text-[12px] leading-[17px] text-[#666666]">{text}</span>
        </div>
      </div>
      <div className="shrink-0 pl-3">
        <span className="flex items-center gap-1 text-[11px] font-medium text-[#666666] group-hover:text-black group-hover:underline">{cta}</span>
      </div>
    </button>
  );
}

function Reconciliation({ row, detail, order }: { row: LedgerRow; detail: ReturnDetail | undefined; order: ReturnOrder | undefined }) {
  const received = detail?.timeline.find((s) => s.step === "received");
  const who = received?.actor?.name;
  const mismatch = detail?.receipt.match === "quantity_mismatch";
  const inspected = row.inspection.status === "passed" || row.inspection.status === "failed";
  const decided = row.disposition !== "pending";
  return (
    <section className="space-y-3 pt-2" aria-label="Receipt reconciliation">
      <SectionHeading
        level={3}
        title="Receipt reconciliation"
        description={received?.status === "complete" && received.at ? `${row.number} · Received${who ? ` by ${who}` : ""} · ${fmtStamp(received.at)}` : `${row.number} · Not received yet`}
      />
      <div className={TABLE_WRAP}>
        <table aria-label="Receipt reconciliation" className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-[#EAEAEA] bg-[#F5F5F5] text-[11px] text-[#666666]">
              <th scope="col" className="w-1/2 px-4 py-2.5 font-normal">
                Product / SKU
              </th>
              <th scope="col" className="px-4 py-2.5 font-normal">
                Expected
              </th>
              <th scope="col" className="px-4 py-2.5 font-normal">
                Received
              </th>
              <th scope="col" className="px-4 py-2.5 font-normal">
                Match
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAEAEA]/80">
            {(order?.items ?? []).length === 0 ? (
              <tr>
                <td className="px-4 py-3 font-medium text-black">
                  {row.product.title ?? "—"} · {row.product.sku ?? "No SKU"}
                </td>
                <td className="px-4 py-3 text-[#666666]">{row.quantity}</td>
                <td className="px-4 py-3 text-[#666666]">{row.receivedQuantity}</td>
                <td className={cn("px-4 py-3 font-medium", !row.receivedAt ? "text-[#666666]" : row.receivedQuantity < row.quantity ? "text-[#D97706]" : "text-[#16A34A]")}>{!row.receivedAt ? "Awaiting receipt" : row.receivedQuantity < row.quantity ? "Quantity mismatch" : "Matched"}</td>
              </tr>
            ) : (
              order?.items.map((it) => {
                const short = it.receivedQuantity < it.quantity;
                return (
                  <tr key={it.id}>
                    <td className="px-4 py-3 font-medium text-black">
                      {order.items.length === 1 ? `${row.product.title ?? "—"} · ` : ""}
                      {it.sku ?? "No SKU"}
                    </td>
                    <td className="px-4 py-3 text-[#666666]">{it.quantity}</td>
                    <td className="px-4 py-3 text-[#666666]">{it.receivedQuantity}</td>
                    <td className={cn("px-4 py-3 font-medium", !row.receivedAt ? "text-[#666666]" : short ? "text-[#D97706]" : "text-[#16A34A]")}>{!row.receivedAt ? "Awaiting receipt" : short ? "Quantity mismatch" : "Matched"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] leading-[17px] text-[#666666]">
        {!row.receivedAt
          ? "The goods have not arrived yet."
          : mismatch && detail?.receipt.mismatch
            ? `Quantity does not match the request: ${detail.receipt.mismatch.expected} expected, ${detail.receipt.mismatch.received} received.`
            : "Quantity matches the request."}{" "}
        {row.receivedAt && !inspected ? "Physical condition still needs verification. " : ""}
        {row.receivedAt && !decided ? "The received units have not been added to sellable stock." : ""}
      </p>
    </section>
  );
}

/** the Returns tab: the ledger as a short list and, under the picked return, the three steps (verify, decide, resolve) and its receipt reconciliation */
export function ReturnsView({ url, onOpen }: ReturnsViewProps) {
  const { update, clearFilters, filters, page, pageSize, focus } = url;
  const ledger = useReturnsLedger(ledgerQueryOf(url));
  const rows = ledger.data?.items ?? [];
  const selected = focus ? (rows.find((r) => r.id === focus) ?? null) : null;
  const detail = useReturnDetail(selected?.id ?? null);
  const order = useReturnOrder(selected?.id ?? null);
  const filtered = isFiltered(filters);

  const pick = (id: string) => update({ focus: focus === id ? null : id }, { keepPage: true });

  const resolvedLine = selected ? (["closed", "refunded", "rejected", "cancelled"].includes(selected.stage) ? `${selected.stageLabel}.` : `${selected.stageLabel} is not resolved.`) : "";

  return (
    <div className="animate-in fade-in space-y-8 duration-200">
      <section className="space-y-3">
        <SectionHeading
          title="Returns"
          description={selected ? `${selected.number} selected · Your place in the ledger is preserved.` : "Click on any product above to view resolution workflow · Your place in the ledger is preserved."}
        />
        {filtered && (
          <p className="text-[11px] text-[#666666]">
            Filters from the Overview tab apply.{" "}
            <button type="button" onClick={clearFilters} className="font-semibold text-black hover:underline">
              Clear filters
            </button>
          </p>
        )}

        {ledger.isLoading ? (
          <SkeletonRows rows={6} label="Loading returns" />
        ) : ledger.isError && !ledger.data ? (
          <Notice
            role="alert"
            tone="error"
            title="Returns could not be loaded."
            description={errorMessage(ledger.error)}
            action={
              <button type="button" className={BTN_LIGHT} onClick={() => void ledger.refetch()}>
                Retry
              </button>
            }
          />
        ) : rows.length === 0 ? (
          <Notice title={filtered ? "No returns match these filters." : "No returns yet."} description={filtered ? "Clear the filters to see every return." : "Return requests from your marketplaces and from your own team appear here."} />
        ) : (
          <>
            <div className={cn(TABLE_WRAP, "overflow-hidden transition-opacity", ledger.isFetching && ledger.isPlaceholderData && "opacity-60")}>
              <table aria-label="Returns" className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#EAEAEA] bg-[#F5F5F5] text-[11px] text-[#666666]">
                    <th scope="col" className="w-1/4 px-4 py-2.5 font-normal">
                      Return
                    </th>
                    <th scope="col" className="w-1/3 px-4 py-2.5 font-normal">
                      Product
                    </th>
                    <th scope="col" className="w-1/5 px-4 py-2.5 font-normal">
                      State
                    </th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-normal">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA]/80">
                  {rows.map((ret) => {
                    const isSelected = ret.id === focus;
                    const act = rowAction(ret);
                    return (
                      <tr key={ret.id} aria-selected={isSelected} onClick={() => pick(ret.id)} className={cn("cursor-pointer transition-colors", isSelected ? "bg-[#F5F8FE]" : "hover:bg-neutral-50/50")}>
                        <td className="px-4 py-3 font-semibold text-black">{ret.number}</td>
                        <td className="px-4 py-3 text-black">
                          {ret.product.title ?? "—"}
                          {ret.product.sku ? ` ${ret.product.sku}` : ""}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("font-medium", STAGE_COLOR[ret.stage])}>{ret.stageLabel}</span>
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <button
                            type="button"
                            aria-label={`${act.label.replace(" →", "")} ${ret.number}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              update({ focus: ret.id }, { keepPage: true });
                              onOpen(act.drawer, ret.id);
                            }}
                            className="inline-flex cursor-pointer items-center gap-0.5 font-medium text-black hover:underline"
                          >
                            {act.label}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <DesignPagination
              page={ledger.data?.page ?? page}
              pages={ledger.data?.pages ?? 1}
              total={ledger.data?.total ?? 0}
              pageSize={pageSize}
              shown={rows.length}
              noun="returns"
              onPage={(p) => update({ page: p > 1 ? String(p) : null }, { keepPage: true })}
              onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
            />
          </>
        )}
      </section>

      {selected && (
        <div className="animate-in fade-in space-y-8 duration-200">
          <section className="space-y-3 pt-2" aria-label="Resolution steps">
            <div className="flex items-center justify-between">
              <SectionHeading level={3} title={resolvedLine} description="Confirm what came back before committing a refund or moving stock into inventory." />
              <button type="button" onClick={() => update({ focus: null }, { keepPage: true })} className="rounded px-2 py-1 text-[11px] font-medium text-[#666666] transition-colors hover:bg-neutral-100 hover:text-black" title="Close resolution section">
                Close ✕
              </button>
            </div>
            <div className="max-w-3xl space-y-1 pt-1">
              <Step
                done={selected.inspection.status === "passed" || selected.inspection.status === "failed"}
                title="Verify"
                text="Inspect the returned product and check quantity."
                cta={selected.inspection.status === "passed" || selected.inspection.status === "failed" ? "View inspection →" : "Start inspection →"}
                onClick={() => onOpen("inspect", selected.id)}
              />
              <Step
                done={selected.disposition !== "pending"}
                title="Decide"
                text="Explicitly confirm its next inventory disposition."
                cta={selected.disposition !== "pending" ? "Change disposition →" : "Confirm disposition →"}
                onClick={() => update({ view: "inspection", focus: selected.id, iq: null })}
              />
              <Step
                done={selected.refund.status === "processed" || selected.stage === "closed"}
                title="Resolve"
                text="Process the connector-supported refund, then close."
                cta={selected.refund.status === "processed" ? "View refund →" : "Review refund →"}
                onClick={() => onOpen("refund", selected.id)}
              />
            </div>
            {selected.disposition !== "pending" && <p className="text-[11px] text-[#666666]">Current disposition: {humanize(selected.disposition)}.</p>}
          </section>

          <Reconciliation row={selected} detail={detail.data} order={order.data} />
        </div>
      )}

      <div className="pt-2 text-[11px] text-[#666666]">Customer information is shown only when provided by the connected channel. No customer data is inferred.</div>
    </div>
  );
}
