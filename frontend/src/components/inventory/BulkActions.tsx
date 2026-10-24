import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/api/errors";
import { saveBlob } from "@/components/products/list/saveBlob";
import { toast } from "@/hooks/useToast";
import { useBulkAction, useSubmitDraftTransfer } from "@/hooks/useInventory";
import { formatNumber } from "@/utils/format";
import type { BulkParams, BulkResult, BulkSelection, InventoryGroup, Warehouse } from "@/types/inventory";
import { AdjustFields } from "./adjustForm";
import { adjustFields, initialAdjustState, isAdjustReady, noteProblem, qtyProblem, reasonProblem, type AdjustFormState } from "./adjustModel";
import { InlineError } from "./inventoryUi";
import { NO_WRITE_REASON, ONE_WAREHOUSE_REASON } from "./inventoryLabels";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-3 text-xs";
const BAR_BUTTON = "cursor-pointer whitespace-nowrap border-none bg-transparent p-0 text-[13px] font-normal text-[#000000] hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline";
const noun = (n: number) => `${formatNumber(n)} ${n === 1 ? "product" : "products"}`;

type DialogKind = "adjust" | "transfer" | "group";

interface BulkBarProps {
  count: number;
  selection: BulkSelection;
  warehouses: Warehouse[];
  multiWarehouse: boolean;
  groups: InventoryGroup[];
  canWrite: boolean;
  canSync: boolean;
  onClear: () => void;
}

/** the floating bar of "N products selected" with the bulk stock operations (POST /inventory/bulk). Every product is its own unit of work: the result lists what failed. */
export function BulkBar({ count, selection, warehouses, multiWarehouse, groups, canWrite, canSync, onClear }: BulkBarProps) {
  const bulk = useBulkAction();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [result, setResult] = useState<{ title: string; res: BulkResult } | null>(null);
  const reason = canWrite ? undefined : NO_WRITE_REASON;

  const finish = (title: string, res: BulkResult) => {
    setDialog(null);
    if (res.failed > 0) setResult({ title, res });
    toast({
      title: res.failed === 0 ? `${title} done` : `${title} partly done`,
      description: `${noun(res.succeeded)} of ${formatNumber(res.total)} done${res.failed > 0 ? `, ${formatNumber(res.failed)} failed` : ""}.`,
      variant: res.failed === 0 ? "success" : "warning",
    });
    // a partial result stays selected so the failures can be read (and retried) against the same selection
    if (res.failed === 0 && res.succeeded > 0) onClear();
  };

  /** a bulk transfer makes ONE draft for the products that have enough stock; "Transfer now" also submits it (the stock moves only then) */
  const finishTransfer = (res: BulkResult, outcome: TransferOutcome) => {
    setDialog(null);
    if (res.failed > 0) setResult({ title: "Transfer", res });
    if (!res.transfer) {
      toast({ title: "Nothing to transfer", description: "No selected product has enough stock in the source warehouse.", variant: "warning" });
      return;
    }
    const partial = res.failed > 0;
    const items = noun(res.transfer.items);
    if (outcome.submitted) toast({ title: "Transfer submitted", description: `${res.transfer.number}: ${items} moved${partial ? `, ${formatNumber(res.failed)} could not be included` : ""}.`, variant: partial ? "warning" : "success" });
    else if (outcome.submitError) toast({ title: "Draft saved, not submitted", description: `${res.transfer.number} is waiting under Draft transfers. ${outcome.submitError}`, variant: "warning" });
    else toast({ title: "Draft saved", description: `${res.transfer.number} holds ${items}${partial ? `, ${formatNumber(res.failed)} could not be included` : ""}. Nothing has moved yet: review and submit it under Draft transfers.`, variant: partial ? "warning" : "success" });
    if (!partial && res.succeeded > 0) onClear();
  };

  const run =(params: BulkParams, action: "export" | "sync") =>
    bulk.mutate(
      { selection, action, params },
      {
        onSuccess: (res) => {
          if (action === "export" && res.export) {
            saveBlob(new Blob([res.export.csv], { type: res.export.contentType || "text/csv" }), res.export.filename);
            toast({ title: "Export ready", description: `${formatNumber(res.export.rows)} rows saved to ${res.export.filename}.`, variant: "success" });
            return;
          }
          const queued = res.jobs?.filter((j) => j.status !== "failed").length ?? 0;
          const failed = res.jobs?.filter((j) => j.status === "failed") ?? [];
          if (failed.length > 0 || res.failed > 0) setResult({ title: "Channel sync", res });
          toast({
            title: queued > 0 ? "Sync queued" : "Nothing to sync",
            description: queued > 0 ? `${queued} ${queued === 1 ? "channel" : "channels"} will get the stock of ${noun(res.total)}.` : "These products are not listed on any connected channel.",
            variant: queued > 0 ? "success" : "default",
          });
        },
        onError: (e) => toast({ title: action === "export" ? "Export failed" : "Sync failed", description: errorMessage(e, "The request was refused."), variant: "destructive" }),
      },
    );

  return (
    <>
      <div className="sticky bottom-4 z-30 flex w-full justify-center pt-2">
        <div role="toolbar" aria-label="Bulk stock operations" className="box-border flex h-[54px] w-[609px] max-w-full flex-row items-center justify-between gap-2 overflow-x-auto rounded-[10px] border border-[#BDBDBD] bg-white px-4 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.05)]">
          <div className="flex shrink-0 flex-row items-center gap-2.5 border-r border-[#EAEAEA] pr-3">
            <div className="flex h-4 w-4 items-center justify-center rounded-[3px] border border-[#737373] bg-white">
              <CheckCircle2 className="h-3 w-3 stroke-[2.5px] text-[#111111]" aria-hidden />
            </div>
            <span className="whitespace-nowrap text-[13px] font-semibold tracking-tight text-[#000000]" aria-live="polite">
              {formatNumber(count)} {count === 1 ? "product" : "products"} selected
            </span>
          </div>
          <div className="flex shrink-0 flex-row items-center gap-4">
            <span title={reason}>
              <button type="button" disabled={!canWrite} onClick={() => setDialog("adjust")} className={BAR_BUTTON}>
                Adjust stock
              </button>
            </span>
            <span title={!canWrite ? NO_WRITE_REASON : !multiWarehouse ? ONE_WAREHOUSE_REASON : undefined}>
              <button type="button" disabled={!canWrite || !multiWarehouse} onClick={() => setDialog("transfer")} className={BAR_BUTTON}>
                Transfer
              </button>
            </span>
            <span title={reason}>
              <button type="button" disabled={!canWrite || bulk.isPending} onClick={() => run({}, "export")} className={BAR_BUTTON}>
                Export
              </button>
            </span>
            <span title={canSync ? undefined : "Syncing channels needs both inventory and listings write access."}>
              <button type="button" disabled={!canSync || bulk.isPending} onClick={() => run({}, "sync")} className={BAR_BUTTON}>
                Sync
              </button>
            </span>
            <span title={reason}>
              <button type="button" disabled={!canWrite} onClick={() => setDialog("group")} className={BAR_BUTTON}>
                Add to saved group
              </button>
            </span>
          </div>
          <button type="button" aria-label="Clear selection" onClick={onClear} className="flex shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 pl-2 text-[#737373] hover:text-[#000000]">
            <X className="h-4 w-4 stroke-[1.5px]" aria-hidden />
          </button>
        </div>
      </div>

      <BulkAdjustDialog open={dialog === "adjust"} count={count} selection={selection} warehouses={warehouses} onClose={() => setDialog(null)} onResult={(res) => finish("Stock adjustment", res)} />
      <BulkTransferDialog open={dialog === "transfer"} count={count} selection={selection} warehouses={warehouses} onClose={() => setDialog(null)} onResult={finishTransfer} />
      <BulkGroupDialog open={dialog === "group"} count={count} selection={selection} groups={groups} onClose={() => setDialog(null)} onResult={(res) => finish("Saved group", res)} />
      <ResultDialog result={result} onClose={() => setResult(null)} />
    </>
  );
}

/** what a bulk call did: how many worked, and why the others did not */
function ResultDialog({ result, onClose }: { result: { title: string; res: BulkResult } | null; onClose: () => void }) {
  const res = result?.res;
  const failures = res?.results.filter((r) => !r.ok) ?? [];
  const failedJobs = res?.jobs?.filter((j) => j.status === "failed") ?? [];
  return (
    <Dialog open={result !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{result?.title}: what happened</DialogTitle>
          <DialogDescription>
            {res ? `${formatNumber(res.succeeded)} of ${formatNumber(res.total)} products done, ${formatNumber(res.failed)} failed.` : ""}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[40vh] divide-y divide-border overflow-auto rounded-lg border border-border text-xs">
          {failures.map((f) => (
            <li key={f.variantId} className="flex items-start justify-between gap-3 p-2.5">
              <span className="font-medium text-foreground">{f.sku ?? f.variantId}</span>
              <span className="text-right text-red-700">{f.error?.message ?? "Failed"}</span>
            </li>
          ))}
          {failedJobs.map((j) => (
            <li key={j.accountId} className="flex items-start justify-between gap-3 p-2.5">
              <span className="font-medium text-foreground">Channel account</span>
              <span className="text-right text-red-700">{j.error?.message ?? "Could not queue"}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DialogProps {
  open: boolean;
  count: number;
  selection: BulkSelection;
  onClose: () => void;
  onResult: (res: BulkResult) => void;
}

function BulkAdjustDialog({ open, count, selection, warehouses, onClose, onResult }: DialogProps & { warehouses: Warehouse[] }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">{open && <BulkAdjustForm count={count} selection={selection} warehouses={warehouses} onClose={onClose} onResult={onResult} />}</DialogContent>
    </Dialog>
  );
}

function BulkAdjustForm({ count, selection, warehouses, onClose, onResult }: Omit<DialogProps, "open"> & { warehouses: Warehouse[] }) {
  const bulk = useBulkAction();
  const [state, setState] = useState<AdjustFormState>(initialAdjustState);
  const [warehouseId, setWarehouseId] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const ready = isAdjustReady(state, null);

  const acquire = useSubmitLock();
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!ready) return;
    const release = acquire();
    if (!release) return;
    setServerError(null);
    try {
      onResult(await bulk.mutateAsync({ selection, action: "adjust", params: { ...adjustFields(state), ...(warehouseId ? { warehouseId } : {}) } }));
    } catch (e) {
      setServerError(errorMessage(e, "The adjustment could not be applied."));
    } finally {
      release();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <DialogHeader>
        <DialogTitle>Adjust stock</DialogTitle>
        <DialogDescription>Applies the same change to {noun(count)}. Each product is checked on its own; the ones that cannot take it are listed afterwards.</DialogDescription>
      </DialogHeader>
      {serverError && <InlineError message={serverError} />}
      {warehouses.length > 1 && (
        <div className="flex flex-col gap-1">
          <label htmlFor="bulk-adj-warehouse" className="text-[11px] font-semibold">
            Location
          </label>
          <select id="bulk-adj-warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={SELECT}>
            <option value="">The location holding the most stock</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <AdjustFields idPrefix="bulk-adj" state={state} onChange={setState} qtyError={qtyProblem(state, null)} noteError={noteProblem(state)} reasonError={reasonProblem(state)} />
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" size="sm" disabled={bulk.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={bulk.isPending} disabled={!ready}>
          Apply to {noun(count)}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface TransferOutcome {
  /** the draft was also submitted (the stock moved) */
  submitted: boolean;
  /** the draft was saved but submitting it failed: why */
  submitError?: string;
}

type TransferDialogProps = Omit<DialogProps, "onResult"> & { warehouses: Warehouse[]; onResult: (res: BulkResult, outcome: TransferOutcome) => void };

function BulkTransferDialog({ open, count, selection, warehouses, onClose, onResult }: TransferDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">{open && <BulkTransferForm count={count} selection={selection} warehouses={warehouses} onClose={onClose} onResult={onResult} />}</DialogContent>
    </Dialog>
  );
}

function BulkTransferForm({ count, selection, warehouses, onClose, onResult }: Omit<TransferDialogProps, "open">) {
  const bulk = useBulkAction();
  const submitDraft = useSubmitDraftTransfer();
  const [from, setFrom] = useState(warehouses[0]?.id ?? "");
  const [to, setTo] = useState(warehouses.find((w) => w.id !== warehouses[0]?.id)?.id ?? "");
  const [qty, setQty] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const n = /^\d+$/.test(qty.trim()) ? Number(qty.trim()) : NaN;
  const qtyError = qty.trim() !== "" && (!Number.isInteger(n) || n < 1) ? "Enter a whole number of units, 1 or more" : null;
  const ready = from !== "" && to !== "" && from !== to && qty.trim() !== "" && !qtyError;

  /** "draft": saved for review, nothing moves. "now": the draft is submitted straight away. */
  const acquire = useSubmitLock();
  const run = async (mode: "draft" | "now") => {
    if (!ready) return;
    const release = acquire();
    if (!release) return;
    try {
      setServerError(null);
      let res: BulkResult;
      try {
        res = await bulk.mutateAsync({ selection, action: "transfer", params: { fromWarehouseId: from, toWarehouseId: to, quantity: n } });
      } catch (e) {
        setServerError(errorMessage(e, "The transfer could not be created."));
        return;
      }
      if (mode === "now" && res.transfer) {
        try {
          await submitDraft.mutateAsync(res.transfer.id);
          onResult(res, { submitted: true });
        } catch (e) {
          onResult(res, { submitted: false, submitError: errorMessage(e, "It could not be submitted.") });
        }
        return;
      }
      onResult(res, { submitted: false });
    } finally {
      release();
    }
  };
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    void run("now");
  };
  const busy = bulk.isPending || submitDraft.isPending;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <DialogHeader>
        <DialogTitle>Transfer stock</DialogTitle>
        <DialogDescription>Moves the same number of units of each of {noun(count)} between two warehouses. One draft transfer is created for the products that have enough stock: save it to review it first (nothing moves until you submit it), or transfer now.</DialogDescription>
      </DialogHeader>
      {serverError && <InlineError message={serverError} />}
      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-tr-from" className="text-xs font-semibold">
          From warehouse
        </label>
        <select
          id="bulk-tr-from"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            if (e.target.value === to) setTo(warehouses.find((w) => w.id !== e.target.value)?.id ?? "");
          }}
          className={SELECT}
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-tr-to" className="text-xs font-semibold">
          To warehouse
        </label>
        <select id="bulk-tr-to" value={to} onChange={(e) => setTo(e.target.value)} className={SELECT}>
          {warehouses
            .filter((w) => w.id !== from)
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-tr-qty" className="text-xs font-semibold">
          Units per product
        </label>
        <Input id="bulk-tr-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} error={!!qtyError} aria-invalid={!!qtyError} autoComplete="off" className="text-xs" />
        {qtyError && (
          <p role="alert" className="text-[11px] text-red-700">
            {qtyError}
          </p>
        )}
      </div>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!ready || busy} onClick={() => void run("draft")}>
          Save as draft
        </Button>
        <Button type="submit" size="sm" loading={busy} disabled={!ready}>
          Transfer now
        </Button>
      </DialogFooter>
    </form>
  );
}

const NEW_GROUP = "__new__";

function BulkGroupDialog({ open, count, selection, groups, onClose, onResult }: DialogProps & { groups: InventoryGroup[] }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">{open && <BulkGroupForm count={count} selection={selection} groups={groups} onClose={onClose} onResult={onResult} />}</DialogContent>
    </Dialog>
  );
}

function BulkGroupForm({ count, selection, groups, onClose, onResult }: Omit<DialogProps, "open"> & { groups: InventoryGroup[] }) {
  const bulk = useBulkAction();
  const [groupId, setGroupId] = useState(groups[0]?.id ?? NEW_GROUP);
  const [name, setName] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const isNew = groupId === NEW_GROUP;
  const ready = isNew ? name.trim().length > 0 : groupId !== "";

  const acquire = useSubmitLock();
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!ready) return;
    const release = acquire();
    if (!release) return;
    setServerError(null);
    try {
      onResult(await bulk.mutateAsync({ selection, action: "group", params: isNew ? { groupName: name.trim() } : { groupId } }));
    } catch (e) {
      setServerError(errorMessage(e, "The group could not be saved."));
    } finally {
      release();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <DialogHeader>
        <DialogTitle>Add to saved group</DialogTitle>
        <DialogDescription>Saved groups are fixed lists of products. {noun(count)} will be added; use the Saved groups menu to bring a group back.</DialogDescription>
      </DialogHeader>
      {serverError && <InlineError message={serverError} />}
      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-group" className="text-xs font-semibold">
          Group
        </label>
        <select id="bulk-group" value={groupId} onChange={(e) => setGroupId(e.target.value)} className={SELECT}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.itemCount})
            </option>
          ))}
          <option value={NEW_GROUP}>New group...</option>
        </select>
      </div>
      {isNew && (
        <div className="flex flex-col gap-1">
          <label htmlFor="bulk-group-name" className="text-xs font-semibold">
            Group name
          </label>
          <Input id="bulk-group-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="off" className="text-xs" />
        </div>
      )}
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" size="sm" disabled={bulk.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={bulk.isPending} disabled={!ready}>
          Add to group
        </Button>
      </DialogFooter>
    </form>
  );
}

