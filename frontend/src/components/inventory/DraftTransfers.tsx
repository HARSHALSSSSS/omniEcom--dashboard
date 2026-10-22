import { useState } from "react";
import { AlertTriangle, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useDiscardDraftTransfer, useDraftTransfers, useSubmitDraftTransfer, useUpdateDraftTransfer } from "@/hooks/useInventory";
import { formatNumber, formatRelativeTime } from "@/utils/format";
import type { LedgerRow, StockTransfer, Warehouse } from "@/types/inventory";
import { InlineError } from "./inventoryUi";
import { NO_WRITE_REASON } from "./inventoryLabels";
import { ProductField } from "./ProductField";

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-3 text-xs";
const units = (d: StockTransfer) => d.items.reduce((sum, i) => sum + i.quantity, 0);
const noun = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;
const warehouseName = (warehouses: Warehouse[], id: string) => warehouses.find((w) => w.id === id)?.name ?? "Warehouse";
/** how many lines ask for more than the source holds today (a draft can be saved, but the submit would be refused) */
const shortLines = (d: StockTransfer) => d.items.filter((i) => i.availableAtSource !== null && i.quantity > i.availableAtSource).length;

interface DraftTransfersProps {
  warehouses: Warehouse[];
  canWrite: boolean;
}

/** "Draft transfers": transfers saved but not submitted. Nothing has moved yet: review one, edit it, submit it (the stock moves) or discard it. */
export function DraftTransfers({ warehouses, canWrite }: DraftTransfersProps) {
  const drafts = useDraftTransfers();
  const submit = useSubmitDraftTransfer();
  const discard = useDiscardDraftTransfer();
  const [openId, setOpenId] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<StockTransfer | null>(null);
  const list = drafts.data ?? [];
  const open = list.find((d) => d.id === openId) ?? null;

  const onSubmit = (d: StockTransfer, after?: () => void) =>
    submit.mutate(d.id, {
      onSuccess: (res) => {
        toast({ title: res.duplicate ? "Already submitted" : "Transfer submitted", description: `${d.number}: ${noun(units(d), "unit", "units")} moved from ${warehouseName(warehouses, d.fromWarehouseId)} to ${warehouseName(warehouses, d.toWarehouseId)}.`, variant: "success" });
        after?.();
      },
      onError: (e) => toast({ title: `Could not submit ${d.number}`, description: errorMessage(e, "The transfer could not be submitted."), variant: "destructive" }),
    });

  const onDiscard = (d: StockTransfer) =>
    discard.mutate(d.id, {
      onSuccess: () => {
        toast({ title: "Draft discarded", description: `${d.number} was discarded. No stock moved.`, variant: "success" });
        setDiscarding(null);
        setOpenId((id) => (id === d.id ? null : id));
      },
      onError: (e) => toast({ title: `Could not discard ${d.number}`, description: errorMessage(e, "The draft could not be discarded."), variant: "destructive" }),
    });

  if (drafts.isPending) return null;
  if (drafts.isError && !drafts.data) {
    return (
      <div className="w-full space-y-2">
        <InlineError message={`The draft transfers could not be loaded. ${errorMessage(drafts.error)}`} />
        <Button variant="outline" size="sm" onClick={() => void drafts.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (list.length === 0) return null;

  return (
    <section id="draft-transfers" aria-label="Draft transfers" className="flex w-full flex-col items-start gap-3">
      <div className="flex w-full flex-row flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[20px] font-semibold tracking-tight text-[#111111]">Draft transfers</h2>
        <span className="text-[12px] font-normal text-[#737373]">{noun(list.length, "draft", "drafts")} · saved, not submitted: no stock has moved</span>
      </div>

      <ul className="m-0 w-full list-none divide-y divide-[#F0F0F0] overflow-hidden rounded-xl border border-[#EAEAEA] bg-white p-0 shadow-2xs">
        {list.map((d) => {
          const short = shortLines(d);
          const busy = submit.isPending && submit.variables === d.id;
          return (
            <li key={d.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-semibold text-[#111111]">{d.number}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">Draft</span>
                  <span className="flex items-center gap-1.5 text-[#111111]">
                    {warehouseName(warehouses, d.fromWarehouseId)}
                    <ArrowRight className="h-3.5 w-3.5 stroke-[1.75px] text-[#888888]" aria-label="to" />
                    {warehouseName(warehouses, d.toWarehouseId)}
                  </span>
                </div>
                <p className="m-0 truncate text-[12px] text-[#555555]">
                  {noun(d.items.length, "product", "products")} · {noun(units(d), "unit", "units")}
                  {d.items.length > 0 && ` · ${d.items.slice(0, 3).map((i) => `${i.sku} × ${formatNumber(i.quantity)}`).join(", ")}${d.items.length > 3 ? ` and ${d.items.length - 3} more` : ""}`}
                </p>
                <p className="m-0 text-[11px] text-[#737373]">
                  Saved {formatRelativeTime(d.createdAt)}
                  {d.notes ? ` · ${d.notes}` : ""}
                </p>
                {short > 0 && (
                  <p className="m-0 flex items-center gap-1 text-[11px] text-[#D97706]">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    {noun(short, "line asks", "lines ask")} for more than the source holds today. Submitting would be refused.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-row items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpenId(d.id)}>
                  {canWrite ? "Review and edit" : "Review"}
                </Button>
                <span title={canWrite ? undefined : NO_WRITE_REASON}>
                  <Button size="sm" disabled={!canWrite || submit.isPending} loading={busy} onClick={() => onSubmit(d)}>
                    Submit
                  </Button>
                </span>
                <span title={canWrite ? undefined : NO_WRITE_REASON}>
                  <Button variant="outline" size="sm" disabled={!canWrite || discard.isPending} onClick={() => setDiscarding(d)} aria-label={`Discard ${d.number}`}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Discard
                  </Button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <DraftDialog draft={open} warehouses={warehouses} canWrite={canWrite} onClose={() => setOpenId(null)} onSubmit={(d) => onSubmit(d, () => setOpenId(null))} submitting={submit.isPending} onDiscard={setDiscarding} />

      <Dialog open={discarding !== null} onOpenChange={(o) => !o && setDiscarding(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard {discarding?.number}?</DialogTitle>
            <DialogDescription>The draft is thrown away. No stock has moved and none will. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" disabled={discard.isPending} onClick={() => setDiscarding(null)}>
              Keep draft
            </Button>
            <Button variant="destructive" size="sm" loading={discard.isPending} onClick={() => discarding && onDiscard(discarding)}>
              Discard draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

interface Line {
  variantId: string;
  sku: string;
  title: string;
  qty: string;
  /** what the source holds (null = not known until the draft is saved) */
  available: number | null;
}

const linesOf = (d: StockTransfer): Line[] => d.items.map((i) => ({ variantId: i.variantId, sku: i.sku, title: i.title, qty: String(i.quantity), available: i.availableAtSource }));
const wholeQty = (qty: string): number => (/^\d+$/.test(qty.trim()) ? Number(qty.trim()) : NaN);

interface DraftDialogProps {
  draft: StockTransfer | null;
  warehouses: Warehouse[];
  canWrite: boolean;
  onClose: () => void;
  onSubmit: (draft: StockTransfer) => void;
  submitting: boolean;
  onDiscard: (draft: StockTransfer) => void;
}

function DraftDialog({ draft, warehouses, canWrite, onClose, onSubmit, submitting, onDiscard }: DraftDialogProps) {
  return (
    <Dialog open={draft !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">{draft && <DraftEditor key={`${draft.id}:${draft.version}`} draft={draft} warehouses={warehouses} canWrite={canWrite} onClose={onClose} onSubmit={onSubmit} submitting={submitting} onDiscard={onDiscard} />}</DialogContent>
    </Dialog>
  );
}

function DraftEditor({ draft, warehouses, canWrite, onClose, onSubmit, submitting, onDiscard }: Omit<DraftDialogProps, "draft"> & { draft: StockTransfer }) {
  const update = useUpdateDraftTransfer();
  const [from, setFrom] = useState(draft.fromWarehouseId);
  const [to, setTo] = useState(draft.toWarehouseId);
  const [notes, setNotes] = useState(draft.notes ?? "");
  const [lines, setLines] = useState<Line[]>(() => linesOf(draft));
  const [serverError, setServerError] = useState<string | null>(null);
  const sameSource = from === draft.fromWarehouseId;

  const parsed = lines.map((l) => ({ ...l, n: wholeQty(l.qty) }));
  const badLine = parsed.some((l) => !Number.isInteger(l.n) || l.n < 1 || l.n > 10_000_000);
  const dirty =
    from !== draft.fromWarehouseId ||
    to !== draft.toWarehouseId ||
    notes.trim() !== (draft.notes ?? "") ||
    JSON.stringify(lines.map((l) => [l.variantId, wholeQty(l.qty)])) !== JSON.stringify(draft.items.map((i) => [i.variantId, i.quantity]));
  const valid = from !== "" && to !== "" && from !== to && lines.length > 0 && !badLine;
  const disabledReason = canWrite ? undefined : NO_WRITE_REASON;

  const setLine = (variantId: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)));
  const add = (row: LedgerRow) =>
    setLines((ls) => (ls.some((l) => l.variantId === row.variantId) ? ls : [...ls, { variantId: row.variantId, sku: row.sku, title: row.title, qty: "1", available: sameSource ? (row.warehouses.find((w) => w.warehouseId === from)?.available ?? 0) : null }]));

  const save = () =>
    update.mutateAsync({
      id: draft.id,
      patch: { fromWarehouseId: from, toWarehouseId: to, items: parsed.map((l) => ({ variantId: l.variantId, quantity: l.n })), notes: notes.trim() || null, version: draft.version },
    });

  const onSave = async () => {
    setServerError(null);
    try {
      await save();
      toast({ title: "Draft saved", description: `${draft.number} was updated. No stock has moved.`, variant: "success" });
    } catch (e) {
      setServerError(errorMessage(e, "The draft could not be saved."));
    }
  };

  const onSubmitClick = async () => {
    setServerError(null);
    try {
      if (dirty) await save();
    } catch (e) {
      setServerError(errorMessage(e, "The draft could not be saved."));
      return;
    }
    onSubmit(draft);
  };

  const busy = update.isPending || submitting;
  return (
    <div className="flex flex-col gap-3">
      <DialogHeader>
        <DialogTitle>Draft transfer {draft.number}</DialogTitle>
        <DialogDescription>Nothing moves until you submit. Change the warehouses, the products or the units, then save or submit.</DialogDescription>
      </DialogHeader>
      {serverError && <InlineError message={serverError} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="draft-from" className="text-xs font-semibold">
            From warehouse
          </label>
          <select
            id="draft-from"
            value={from}
            disabled={!canWrite}
            onChange={(e) => {
              setFrom(e.target.value);
              if (e.target.value === to) setTo(warehouses.find((w) => w.id !== e.target.value)?.id ?? "");
              setLines((ls) => ls.map((l) => ({ ...l, available: null })));
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
          <label htmlFor="draft-to" className="text-xs font-semibold">
            To warehouse
          </label>
          <select id="draft-to" value={to} disabled={!canWrite} onChange={(e) => setTo(e.target.value)} className={SELECT}>
            {warehouses
              .filter((w) => w.id !== from)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold" id="draft-lines">
          Products
        </span>
        <ul aria-labelledby="draft-lines" className="m-0 max-h-[34vh] list-none divide-y divide-[#F0F0F0] overflow-auto rounded-lg border border-[#EAEAEA] p-0">
          {parsed.map((l) => {
            const over = l.available !== null && Number.isInteger(l.n) && l.n > l.available;
            return (
              <li key={l.variantId} className="flex items-center justify-between gap-3 p-2.5 text-xs">
                <div className="min-w-0">
                  <p className="m-0 truncate font-medium text-[#111111]">{l.title}</p>
                  <p className="m-0 text-[11px] text-[#737373]">
                    {l.sku}
                    {l.available !== null && ` · ${formatNumber(l.available)} available in the source`}
                  </p>
                  {over && <p className="m-0 text-[11px] text-[#D97706]">More than the source holds today: submitting would be refused.</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Input aria-label={`Units of ${l.sku}`} inputMode="numeric" value={l.qty} disabled={!canWrite} error={!Number.isInteger(l.n) || l.n < 1} onChange={(e) => setLine(l.variantId, { qty: e.target.value })} className="h-8 w-20 text-xs" autoComplete="off" />
                  <button
                    type="button"
                    aria-label={`Remove ${l.sku}`}
                    disabled={!canWrite || lines.length <= 1}
                    title={lines.length <= 1 ? "A transfer needs at least one product. Discard the draft instead." : undefined}
                    onClick={() => setLines((ls) => ls.filter((x) => x.variantId !== l.variantId))}
                    className="cursor-pointer border-none bg-transparent p-1 text-[#666666] hover:text-[#B42318] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {badLine && <p role="alert" className="m-0 text-[11px] text-red-700">Enter a whole number of units, 1 or more, for every product.</p>}
      </div>

      {canWrite && (
        <div className="flex flex-col gap-1">
          <label htmlFor="draft-add" className="text-xs font-semibold">
            Add a product
          </label>
          <ProductField id="draft-add" value={null} onPick={add} />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="draft-notes" className="text-xs font-semibold">
          Note
        </label>
        <Input id="draft-notes" value={notes} maxLength={500} disabled={!canWrite} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" autoComplete="off" className="text-xs" />
      </div>

      <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:gap-0">
        <span title={disabledReason}>
          <Button type="button" variant="outline" size="sm" disabled={!canWrite || busy} onClick={() => onDiscard(draft)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Discard draft
          </Button>
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>
            Close
          </Button>
          <span title={disabledReason}>
            <Button type="button" variant="outline" size="sm" loading={update.isPending && !submitting} disabled={!canWrite || !dirty || !valid || busy} onClick={() => void onSave()}>
              Save changes
            </Button>
          </span>
          <span title={disabledReason}>
            <Button type="button" size="sm" loading={submitting} disabled={!canWrite || !valid || busy} onClick={() => void onSubmitClick()}>
              Submit transfer
            </Button>
          </span>
        </div>
      </DialogFooter>
    </div>
  );
}
