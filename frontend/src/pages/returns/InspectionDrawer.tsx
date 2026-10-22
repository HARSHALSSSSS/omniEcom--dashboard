import { useState } from "react";
import { Plus } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { useReturnDetail, useReturnInspection, useSaveInspection } from "@/hooks/useReturns";
import { toast } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { AssignInspector } from "@/components/returns/AssignInspector";
import { cn } from "@/utils/cn";
import type { InspectionChecklist, InspectionResult, InspectionStatus, InspectionView, ReturnDetail } from "@/types/returns";
import { CloseButton, DrawerShell, DRAWER_BTN_DARK, DRAWER_BTN_LIGHT } from "@/components/returns/design";
import { NO_WRITE_REASON, fmtFullStamp, writeErrorMessage } from "@/components/returns/returnFormat";

interface InspectionDrawerProps {
  /** the return to inspect; the drawer is closed when this is null */
  returnId: string | null;
  onClose: () => void;
}

const CHECKS: ReadonlyArray<{ key: keyof Omit<InspectionChecklist, "custom">; label: string }> = [
  { key: "packagingIntact", label: "Packaging intact" },
  { key: "productUsable", label: "Product usable" },
  { key: "accessoriesPresent", label: "Accessories present" },
  { key: "visibleDamage", label: "Visible damage" },
  { key: "productMismatch", label: "Product mismatch" },
  { key: "missingQuantity", label: "Missing quantity" },
];

const DEFAULT_CHECKLIST: InspectionChecklist = { packagingIntact: true, productUsable: true, accessoriesPresent: true, visibleDamage: false, productMismatch: false, missingQuantity: false };

const RESULTS: ReadonlyArray<{ value: InspectionResult; label: string; active: string }> = [
  { value: "pass", label: "Pass", active: "bg-[#16A34A] text-white border-[#16A34A] font-semibold" },
  { value: "fail", label: "Fail", active: "bg-[#DC2626] text-white border-[#DC2626] font-semibold" },
  { value: "needs_review", label: "Needs Review", active: "border-[#D97706] text-[#D97706] bg-[#FFFBF5] font-semibold" },
];

const STATUS_LABEL: Record<InspectionStatus, string> = { not_started: "Not started", in_progress: "In progress", passed: "Passed", failed: "Failed", requires_review: "Requires Review" };

/** what is wrong according to the checklist, in words ("missing unit and accessory") */
function problemsOf(c: InspectionChecklist): string[] {
  const out: string[] = [];
  if (c.missingQuantity) out.push("missing unit");
  if (!c.accessoriesPresent) out.push("accessory missing");
  if (!c.packagingIntact) out.push("packaging not intact");
  if (!c.productUsable) out.push("product not usable");
  if (c.visibleDamage) out.push("visible damage");
  if (c.productMismatch) out.push("product mismatch");
  for (const x of c.custom ?? []) if (!x.ok) out.push(x.label.toLowerCase());
  return out;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 text-[12px]">
      <span className="w-36 text-[#666666]">{label}</span>
      <span className="flex-1 text-left text-black">{children}</span>
    </div>
  );
}

function YesNo({ value, onChange, label }: { value: boolean; onChange: (next: boolean) => void; label: string }) {
  const btn = (on: boolean, text: string) => (
    <button
      type="button"
      aria-pressed={value === on}
      aria-label={`${label}: ${text}`}
      onClick={() => onChange(on)}
      className={cn("rounded-md px-3 py-1 text-[11px] font-semibold transition-colors", value === on ? "bg-black text-white shadow-xs" : "text-[#666666] hover:text-black")}
    >
      {text}
    </button>
  );
  return (
    <div className="flex items-center rounded-lg border border-[#EAEAEA] bg-[#F5F5F5] p-0.5">
      {btn(true, "Yes")}
      {btn(false, "No")}
    </div>
  );
}

/** a return's inspection: the real checklist of the API (six checks and your own), the result and who inspects it */
export function InspectionDrawer({ returnId, onClose }: InspectionDrawerProps) {
  if (!returnId) return null;
  return <Body returnId={returnId} onClose={onClose} />;
}

function Body({ returnId, onClose }: { returnId: string; onClose: () => void }) {
  const inspection = useReturnInspection(returnId);
  const detail = useReturnDetail(returnId);
  const ready = inspection.data && detail.data;
  const number = inspection.data?.number ?? detail.data?.header.number;

  return (
    <DrawerShell label={number ? `Inspect ${number}` : "Inspect return"} onClose={onClose}>
      {!ready && (
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="flex items-start justify-between">
            <h2 className="text-[18px] font-semibold leading-tight text-black">{number ? `Inspect ${number}` : "Inspect return"}</h2>
            <CloseButton onClick={onClose} />
          </div>
          {(inspection.isLoading || detail.isLoading) && (
            <div role="status" aria-label="Loading inspection" className="space-y-3">
              <div className="h-24 w-full animate-pulse rounded-lg bg-[#F5F5F5]" />
              <div className="h-40 w-full animate-pulse rounded-lg bg-[#F5F5F5]" />
            </div>
          )}
          {(inspection.isError || detail.isError) && (
            <div role="alert" className="space-y-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-[12px]">
              <p className="text-[#991B1B]">The inspection could not be loaded. {errorMessage(inspection.error ?? detail.error)}</p>
              <button
                type="button"
                className={DRAWER_BTN_LIGHT}
                onClick={() => {
                  void inspection.refetch();
                  void detail.refetch();
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
      {inspection.data && detail.data && <InspectionForm key={returnId} returnId={returnId} view={inspection.data} detail={detail.data} onClose={onClose} />}
    </DrawerShell>
  );
}

function InspectionForm({ returnId, view, detail, onClose }: { returnId: string; view: InspectionView; detail: ReturnDetail; onClose: () => void }) {
  const permissions = useWorkspaceStore((s) => s.permissions);
  const canWrite = permissions.includes("returns:write");
  const save = useSaveInspection();

  const latest = view.latest;
  const [checks, setChecks] = useState<InspectionChecklist>(() => ({ ...DEFAULT_CHECKLIST, ...(latest?.checklist ?? {}), custom: latest?.checklist.custom ?? [] }));
  const [result, setResult] = useState<InspectionResult | null>(latest?.result ?? null);
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const status = detail.header.status;
  const inspectable = status === "received" || status === "inspecting";
  const blocked = !canWrite ? NO_WRITE_REASON : !inspectable ? "Receive the goods first: only a received return can be inspected." : null;
  const finished = view.status === "passed" || view.status === "failed" || view.status === "requires_review";
  const custom = checks.custom ?? [];
  const problems = problemsOf(checks);
  const missing = Math.max(0, view.quantity.expected - view.quantity.received);

  const setCheck = (key: keyof Omit<InspectionChecklist, "custom">, value: boolean) => setChecks((c) => ({ ...c, [key]: value }));

  const addCustom = () => {
    const label = customLabel.trim();
    if (!label || custom.length >= 20) return;
    setChecks((c) => ({ ...c, custom: [...(c.custom ?? []), { label: label.slice(0, 80), ok: true }] }));
    setCustomLabel("");
    setAdding(false);
  };

  const onSave = () => {
    if (!result || blocked) return;
    setError(null);
    save.mutate(
      { id: returnId, checklist: checks, result, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: (saved) => {
          toast({ title: `${view.number} updated`, description: `Inspection saved: ${STATUS_LABEL[saved.status]}`, variant: "success" });
          onClose();
        },
        onError: (e) => setError(writeErrorMessage(e)),
      },
    );
  };

  return (
    <>
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-[18px] font-semibold leading-tight text-black">Inspect {view.number}</h2>
            <p className="text-[12px] text-[#666666]">
              {STATUS_LABEL[view.status]} · {view.inspector?.name ?? "Unassigned"} · {latest ? fmtFullStamp(latest.at) : "Not inspected yet"}
            </p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="space-y-3">
          <h3 className="text-[14px] font-semibold text-black">Product Verification</h3>
          <div className="divide-y divide-[#EAEAEA] border-t border-[#EAEAEA]">
            <Row label="Product">
              <span className="font-medium">
                {detail.product.title ?? "—"}
                {detail.product.itemCount > 1 ? ` and ${detail.product.itemCount - 1} more` : ""}
              </span>
            </Row>
            <Row label="SKU">
              <span className="font-medium">{detail.product.sku ?? "No SKU"}</span>
            </Row>
            <Row label="Expected quantity">{view.quantity.expected}</Row>
            <Row label="Received quantity">{view.quantity.received}</Row>
          </div>

          {view.systemCondition === "quantity_mismatch" && missing > 0 && (
            <div className="space-y-1 rounded-lg border border-[#FDE68A]/60 bg-[#FFFBF5] p-3.5">
              <div className="text-[12px] font-semibold text-[#D97706]">
                {missing} {missing === 1 ? "unit is" : "units are"} missing
              </div>
              <div className="text-[12px] text-[#666666]">
                Expected {view.quantity.expected} · Received {view.quantity.received}. Review the receipt before confirming disposition.
              </div>
            </div>
          )}
        </div>

        {canWrite && !finished && inspectable && (
          <div className="space-y-2">
            <h3 className="text-[14px] font-semibold text-black">Inspector</h3>
            <AssignInspector ids={[returnId]} label={view.number} />
          </div>
        )}

        <div className="space-y-3 pt-1">
          <h3 className="text-[14px] font-semibold text-black">Condition Check</h3>
          <div className="space-y-2.5 divide-y divide-[#EAEAEA]/80">
            {CHECKS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between pt-2.5 text-[12px] first:pt-0">
                <span className="text-black">{label}</span>
                <YesNo label={label} value={checks[key]} onChange={(v) => setCheck(key, v)} />
              </div>
            ))}
            {custom.map((c, i) => (
              <div key={`${c.label}-${i}`} className="flex items-center justify-between pt-2.5 text-[12px]">
                <span className="text-black">{c.label}</span>
                <div className="flex items-center gap-2">
                  <YesNo label={c.label} value={c.ok} onChange={(v) => setChecks((s) => ({ ...s, custom: (s.custom ?? []).map((x, j) => (j === i ? { ...x, ok: v } : x)) }))} />
                  <button type="button" aria-label={`Remove ${c.label}`} onClick={() => setChecks((s) => ({ ...s, custom: (s.custom ?? []).filter((_, j) => j !== i) }))} className="text-[11px] text-[#666666] hover:text-black hover:underline">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {adding ? (
            <div className="flex items-center gap-2 pt-2">
              <input
                aria-label="New condition"
                autoFocus
                maxLength={80}
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder="For example: Tags attached"
                className="h-8 flex-1 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] focus:border-black focus:outline-none"
              />
              <button type="button" onClick={addCustom} disabled={!customLabel.trim()} className={DRAWER_BTN_DARK}>
                Add
              </button>
              <button type="button" onClick={() => setAdding(false)} className={DRAWER_BTN_LIGHT}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setAdding(true)}
                disabled={custom.length >= 20}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-black px-3.5 text-[11px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Conditions</span>
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3 pt-1">
          <h3 className="text-[14px] font-semibold text-black">Inspection Result</h3>
          <div role="group" aria-label="Inspection result" className="flex items-center gap-2">
            {RESULTS.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={result === r.value}
                onClick={() => setResult(r.value)}
                className={cn("h-8 rounded-lg border px-4 text-[12px] font-medium transition-colors", result === r.value ? r.active : "border-[#EAEAEA] text-black hover:bg-neutral-50")}
              >
                {r.label}
              </button>
            ))}
          </div>
          <label className="block space-y-1">
            <span className="text-[12px] font-semibold text-black">Note (optional)</span>
            <textarea
              aria-label="Inspection note"
              value={note}
              maxLength={500}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              className="w-full resize-none rounded-lg border border-[#EAEAEA] bg-white p-3 text-[12px] text-black focus:border-black focus:outline-none"
            />
          </label>
          <p className="text-[12px] leading-relaxed text-[#666666]">
            {result === "needs_review" && problems.length > 0 ? `Requires Review: ${problems.join(" and ")}. ` : ""}
            {view.note}
          </p>
          {blocked && <p className="text-[12px] text-[#D97706]">{blocked}</p>}
          {error && (
            <p role="alert" className="text-[12px] text-[#DC2626]">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[#EAEAEA] bg-white p-4">
        <button type="button" onClick={onSave} disabled={!result || blocked !== null || save.isPending} title={blocked ?? (!result ? "Choose a result first" : undefined)} className={cn(DRAWER_BTN_DARK, "px-4")}>
          {save.isPending ? "Saving..." : "Save inspection"}
        </button>
        <button type="button" onClick={onClose} className={cn(DRAWER_BTN_LIGHT, "px-4")}>
          Close
        </button>
      </div>
    </>
  );
}
