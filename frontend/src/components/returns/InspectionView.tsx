import { useState } from "react";
import { Ban, Hammer, Package, PackageX, ShieldAlert, Wrench, XCircle, type LucideIcon } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { useDispositionOptions, useReturnDetail, useReturnsLedger, useRunReturnAction } from "@/hooks/useReturns";
import { toast } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { cn } from "@/utils/cn";
import type { DispositionKind, LedgerQuery } from "@/types/returns";
import { AssignInspector } from "./AssignInspector";
import { BTN_LIGHT, DesignPagination, INSPECTION_COLOR, Notice, SectionHeading, SkeletonRows, TABLE_WRAP } from "./design";
import { NO_WRITE_REASON, writeErrorMessage } from "./returnFormat";
import {
  DEFAULT_PAGE_SIZE,
  DISPOSITION_LABELS,
  INSPECTION_LABELS,
  INSPECTION_QUEUES,
  INSPECTION_QUEUE_LABELS,
  REFUND_LABELS,
  type DrawerKind,
  type InspectionQueue,
  type useReturnsUrlState,
} from "./returnParams";
import { PHYSICAL_COLOR, PHYSICAL_LABEL, recommendedDisposition, systemCondition } from "./returnUi";

type UrlState = ReturnType<typeof useReturnsUrlState>;

const QUEUE_FILTER: Record<InspectionQueue, Pick<LedgerQuery, "tab" | "inspectionStatus">> = {
  awaiting: { tab: "awaiting_inspection" },
  review: { inspectionStatus: "requires_review" },
  passed: { inspectionStatus: "passed" },
  failed: { inspectionStatus: "failed" },
};

const ICONS: Record<DispositionKind, LucideIcon> = { sellable: Package, damaged: PackageX, rejected: XCircle, quarantine: ShieldAlert, repair: Wrench, write_off: Ban };

const BLOCKED_TEXT: Record<string, string> = {
  not_received: "The goods have not been received yet.",
  inspection_not_finished: "Finish the inspection before choosing a disposition.",
  no_undecided_units: "Every received unit already has a decision.",
};

/** what should happen to the returned stock: the API's suggestion, the options, and an explicit confirm (nothing moves before it) */
function DecisionCard({ returnId, onClose }: { returnId: string; onClose: () => void }) {
  const options = useDispositionOptions(returnId);
  const detail = useReturnDetail(returnId);
  const run = useRunReturnAction();
  const canWrite = useWorkspaceStore((s) => s.permissions.includes("returns:write"));
  const [selected, setSelected] = useState<DispositionKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const o = options.data;
  const d = detail.data;

  if (options.isLoading || detail.isLoading) return <div role="status" aria-label="Loading disposition options" className="h-48 w-full animate-pulse rounded-lg bg-[#F5F5F5]" />;
  if (options.isError || !o) {
    return (
      <Notice
        role="alert"
        tone="error"
        title="The disposition options could not be loaded."
        description={errorMessage(options.error)}
        action={
          <button type="button" className={BTN_LIGHT} onClick={() => void options.refetch()}>
            Retry
          </button>
        }
      />
    );
  }

  const suggestion = o.recommendation.kind ? (o.options.find((x) => x.kind === o.recommendation.kind)?.label ?? o.recommendation.kind) : "Pending inspection";
  const blocked = !canWrite ? NO_WRITE_REASON : o.canConfirm ? null : (BLOCKED_TEXT[o.blockedReason ?? ""] ?? "A disposition cannot be confirmed now.");
  const received = d?.receipt.received ?? 0;

  const confirm = () => {
    if (!selected || blocked) return;
    setError(null);
    run.mutate(
      { id: returnId, action: "disposition", body: { kind: selected } },
      {
        onSuccess: () => {
          toast({ title: `${o.number} updated`, description: `Disposition confirmed: ${DISPOSITION_LABELS[selected]}`, variant: "success" });
          setSelected(null);
        },
        onError: (e) => setError(writeErrorMessage(e)),
      },
    );
  };

  return (
    <section className="animate-in fade-in space-y-4 pt-2 duration-200" aria-label="Inspection and inventory decision">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[#666666]">
          <span>CONTEXTUAL DRAWER</span>
          <span>|</span>
          <span className="font-semibold text-black">{o.number} / Inspection and inventory decision</span>
        </div>
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-[11px] font-medium text-[#666666] transition-colors hover:bg-neutral-100 hover:text-black" title="Close decision section">
          Close ✕
        </button>
      </div>

      <SectionHeading
        level={3}
        title="What should happen to this returned stock?"
        description={`${o.number} · ${d?.product.title ?? "—"}${d?.product.sku ? ` (${d.product.sku})` : ""} · ${received} received ${received === 1 ? "unit" : "units"}. Select one disposition, then confirm.`}
      />

      <div className="space-y-1 rounded-xl border border-[#BAE6FD] bg-[#F0F7FF] p-4">
        <div className="text-[12px] font-semibold text-[#0284C7]">Recommendation: {suggestion}</div>
        <p className="text-[12px] text-[#334155]">{o.recommendation.reason}</p>
        <p className="pt-0.5 text-[11px] font-medium text-[#0284C7]">Suggested only · No decision selected or inventory change made</p>
      </div>

      <div role="radiogroup" aria-label="Disposition" className="space-y-2.5">
        {o.options.map((opt) => {
          const Icon = ICONS[opt.kind] ?? Hammer;
          const isSelected = selected === opt.kind;
          return (
            <div
              key={opt.kind}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => setSelected(opt.kind)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  setSelected(opt.kind);
                }
              }}
              className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors", isSelected ? "border-black bg-[#F5F8FE]" : "border-[#EAEAEA] bg-white hover:bg-neutral-50/50")}
            >
              <div className="mt-0.5">
                <div className={cn("flex h-4 w-4 items-center justify-center rounded-full border transition-colors", isSelected ? "border-black bg-black" : "border-[#BDBDBD] bg-white")}>
                  {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#666666]" aria-hidden />
              <div className="flex-1">
                <div className="text-[13px] font-semibold leading-tight text-black">{opt.label}</div>
                <div className="text-[12px] leading-relaxed text-[#666666]">{opt.description}.</div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="pt-1 text-[12px] text-[#666666]">{blocked ?? (selected ? "Option selected. Click confirm to apply the disposition." : o.note)}</p>
      {error && (
        <p role="alert" className="text-[12px] text-[#DC2626]">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!selected || blocked !== null || run.isPending}
          onClick={confirm}
          className={cn("h-[34px] rounded-lg px-3.5 text-[12px] font-semibold text-white transition-colors", selected && blocked === null ? "cursor-pointer bg-[#111111] hover:bg-black" : "cursor-not-allowed bg-[#BDBDBD]")}
        >
          {run.isPending ? "Confirming..." : "Confirm disposition"}
        </button>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            onClose();
          }}
          className="h-[34px] rounded-lg border border-[#EAEAEA] bg-white px-3.5 text-[12px] font-semibold text-black transition-colors hover:bg-neutral-50"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-1 border-t border-[#EAEAEA] pt-6 text-[11px] text-[#666666]">
        <div className="font-semibold text-black">Resolution labels across return details</div>
        <div>Inspection: {Object.values(INSPECTION_LABELS).join(" / ")}</div>
        <div>Refund: {Object.values(REFUND_LABELS).join(" / ")}</div>
        <div>Disposition: {Object.values(DISPOSITION_LABELS).slice(0, 7).join(" / ")}</div>
      </div>
    </section>
  );
}

interface InspectionViewProps {
  url: UrlState;
  canWrite: boolean;
  onOpen: (kind: DrawerKind, id: string) => void;
}

/** the Inspection tab: what came back and in what state, and the explicit inventory decision for the picked return */
export function InspectionView({ url, canWrite, onOpen }: InspectionViewProps) {
  const { update, page, pageSize, sort, focus, inspectionQueue } = url;
  const ledger = useReturnsLedger({ ...QUEUE_FILTER[inspectionQueue], sort, page, pageSize });
  const [assigning, setAssigning] = useState(false);
  const rows = ledger.data?.items ?? [];
  const selected = rows.find((r) => r.id === focus) ?? null;

  const pick = (id: string) => update({ focus: focus === id ? null : id }, { keepPage: true });

  return (
    <div className="animate-in fade-in space-y-8 duration-200">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading title="Return Inspection" description={selected ? `${selected.number} selected · Decide inventory disposition below.` : focus ? "Decide inventory disposition below." : "Select any order above to decide inventory disposition."} />
          {canWrite && (
            <button
              type="button"
              disabled={!focus}
              aria-expanded={assigning}
              title={focus ? undefined : "Select a return in the table first"}
              onClick={() => setAssigning((v) => !v)}
              className="inline-flex h-[34px] items-center rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-semibold text-black shadow-2xs transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Assign inspection
            </button>
          )}
        </div>
        {assigning && focus && canWrite && <AssignInspector ids={[focus]} label={selected?.number ?? "The return"} onDone={() => setAssigning(false)} />}

        <div role="tablist" aria-label="Inspection queues" className="flex flex-wrap items-center gap-2">
          {INSPECTION_QUEUES.map((q) => (
            <button
              key={q}
              type="button"
              role="tab"
              aria-selected={q === inspectionQueue}
              onClick={() => update({ iq: q === "awaiting" ? null : q })}
              className={cn("cursor-pointer rounded-lg px-3 py-1.5 text-[12px] transition-colors", q === inspectionQueue ? "bg-[#F5F5F5] font-semibold text-black" : "bg-white text-black hover:bg-neutral-50")}
            >
              {INSPECTION_QUEUE_LABELS[q]}
            </button>
          ))}
        </div>

        {ledger.isLoading ? (
          <SkeletonRows rows={5} label="Loading inspections" />
        ) : ledger.isError && !ledger.data ? (
          <Notice
            role="alert"
            tone="error"
            title="Inspections could not be loaded."
            description={errorMessage(ledger.error)}
            action={
              <button type="button" className={BTN_LIGHT} onClick={() => void ledger.refetch()}>
                Retry
              </button>
            }
          />
        ) : rows.length === 0 ? (
          <Notice title={inspectionQueue === "awaiting" ? "Nothing is waiting for inspection." : "No returns here."} description="Returns appear in this queue once their goods are received." />
        ) : (
          <>
            <div className={cn(TABLE_WRAP, "transition-opacity", ledger.isFetching && ledger.isPlaceholderData && "opacity-60")}>
              <table aria-label="Return inspection" className="w-full whitespace-nowrap text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#EAEAEA] bg-[#F5F5F5] text-[10px] text-[#666666]">
                    {["Return", "Product", "SKU"].map((c) => (
                      <th key={c} scope="col" className="px-3 py-2.5 font-normal">
                        {c}
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2.5 text-center font-normal">
                      Quantity
                    </th>
                    {["Physical Condition", "System Condition", "Inspector", "Inspection Status", "Recommended Disposition"].map((c) => (
                      <th key={c} scope="col" className="px-3 py-2.5 font-normal">
                        {c}
                      </th>
                    ))}
                    <th scope="col" className="py-2.5 pr-4 text-right font-normal">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA]/80">
                  {rows.map((row) => {
                    const isSelected = row.id === focus;
                    const sys = systemCondition(row);
                    const rec = recommendedDisposition(row);
                    const phys = row.inspection.physical;
                    const finished = row.inspection.status === "passed" || row.inspection.status === "failed";
                    const actionLabel = finished ? "View →" : row.inspection.status === "requires_review" ? "Review →" : "Start →";
                    return (
                      <tr key={row.id} aria-selected={isSelected} onClick={() => pick(row.id)} className={cn("cursor-pointer transition-colors", isSelected ? "bg-[#F5F8FE]" : "hover:bg-neutral-50/50")}>
                        <td className="px-3 py-3 font-semibold text-black">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              update({ focus: row.id }, { keepPage: true });
                              onOpen("inspect", row.id);
                            }}
                            className="font-semibold text-black hover:underline"
                          >
                            {row.number}
                          </button>
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-3 font-medium text-black">{row.product.title ?? "—"}</td>
                        <td className="px-3 py-3 text-[#666666]">{row.product.sku ?? "No SKU"}</td>
                        <td className="px-3 py-3 text-center text-[#666666]">{row.receivedAt ? `${row.receivedQuantity} of ${row.quantity}` : row.quantity}</td>
                        <td className={cn("px-3 py-3", phys ? PHYSICAL_COLOR[phys] : "text-[#666666]")}>{phys ? PHYSICAL_LABEL[phys] : "Not verified"}</td>
                        <td className={cn("px-3 py-3", sys.color)}>{sys.label}</td>
                        <td className="px-3 py-3 text-[#666666]">{row.inspection.inspector?.name ?? "Unassigned"}</td>
                        <td className="px-3 py-3 font-medium">
                          <span className={INSPECTION_COLOR[row.inspection.status]}>{INSPECTION_LABELS[row.inspection.status]}</span>
                        </td>
                        <td className="px-3 py-3 font-medium">
                          <span className={rec.color}>{rec.label}</span>
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <button
                            type="button"
                            aria-label={`${actionLabel.replace(" →", "")} inspection ${row.number}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              update({ focus: row.id }, { keepPage: true });
                              onOpen("inspect", row.id);
                            }}
                            className="cursor-pointer font-medium text-black hover:underline"
                          >
                            {actionLabel}
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
              noun="items"
              onPage={(p) => update({ page: p > 1 ? String(p) : null }, { keepPage: true })}
              onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
            />
          </>
        )}
      </section>

      {focus && <DecisionCard key={focus} returnId={focus} onClose={() => update({ focus: null }, { keepPage: true })} />}
    </div>
  );
}
