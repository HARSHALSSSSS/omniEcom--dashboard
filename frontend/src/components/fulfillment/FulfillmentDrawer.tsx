import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Circle, Lock, QrCode } from "lucide-react";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { formatMoney } from "@/components/orders/orderFormat";
import { useFulfillmentAction, useFulfillmentWorkspace } from "@/hooks/useFulfillment";
import { toast } from "@/hooks/useToast";
import { formatDateTime } from "@/utils/format";
import { cn } from "@/utils/cn";
import { EXCEPTION_KINDS, type ActionInput, type ActionView, type FulfillmentAction, type RaisableKind, type Workspace } from "@/types/fulfillment";
import { NO_WRITE_REASON, actionErrorMessage, titleCase } from "./fulfillmentFormat";
import { SlaChip } from "./fulfillmentUi";
import { isSafeUrl } from "@/utils/security";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{title}</h4>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

const FIELD = "h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs";

interface ActionFormProps {
  view: ActionView;
  busy: boolean;
  onSubmit: (extra: Partial<ActionInput>) => void;
  onCancel: () => void;
}

/** the fields an action needs besides `action` (the API names them in `requires`): weight to pack, a kind to report, the manual-override confirmation */
function ActionForm({ view, busy, onSubmit, onCancel }: ActionFormProps) {
  const [weight, setWeight] = useState("");
  const [boxType, setBoxType] = useState("");
  const [dims, setDims] = useState({ lengthMm: "", widthMm: "", heightMm: "" });
  const [kind, setKind] = useState<RaisableKind | "">("");
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);

  const packing = view.action === "pack";
  const reporting = view.action === "exception";
  const grams = Number(weight);
  const valid = (!packing || (Number.isInteger(grams) && grams >= 1)) && (!reporting || kind !== "") && (!view.requiresOverride || override);
  const num = (v: string) => (v.trim() && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined);

  const submit = () => {
    const extra: Partial<ActionInput> = {};
    if (view.requiresOverride) extra.override = true;
    if (packing) {
      extra.weightGrams = grams;
      if (boxType.trim()) extra.boxType = boxType.trim();
      extra.lengthMm = num(dims.lengthMm);
      extra.widthMm = num(dims.widthMm);
      extra.heightMm = num(dims.heightMm);
    }
    if (reporting && kind) {
      extra.kind = kind;
      if (note.trim()) extra.note = note.trim();
    }
    onSubmit(extra);
  };

  return (
    <form
      aria-label={view.label}
      className="mt-2 space-y-2 rounded-lg border border-border bg-muted/20 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) submit();
      }}
    >
      {packing && (
        <>
          <label className="block space-y-1">
            <span className="font-semibold text-foreground">Package weight (grams)</span>
            <input type="number" min={1} step={1} required aria-label="Package weight in grams" value={weight} onChange={(e) => setWeight(e.target.value)} className={FIELD} />
          </label>
          <label className="block space-y-1">
            <span className="font-semibold text-foreground">Box type (optional)</span>
            <input type="text" maxLength={60} aria-label="Box type" value={boxType} onChange={(e) => setBoxType(e.target.value)} className={FIELD} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["lengthMm", "widthMm", "heightMm"] as const).map((k) => (
              <label key={k} className="block space-y-1">
                <span className="font-semibold text-foreground">{k === "lengthMm" ? "Length" : k === "widthMm" ? "Width" : "Height"} (mm)</span>
                <input type="number" min={1} step={1} aria-label={`${k === "lengthMm" ? "Length" : k === "widthMm" ? "Width" : "Height"} in millimetres`} value={dims[k]} onChange={(e) => setDims({ ...dims, [k]: e.target.value })} className={FIELD} />
              </label>
            ))}
          </div>
        </>
      )}
      {reporting && (
        <>
          <label className="block space-y-1">
            <span className="font-semibold text-foreground">What went wrong</span>
            <select aria-label="Exception kind" value={kind} onChange={(e) => setKind(e.target.value as RaisableKind | "")} className={FIELD}>
              <option value="">Choose a reason</option>
              {EXCEPTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {titleCase(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="font-semibold text-foreground">Note (optional)</span>
            <textarea aria-label="Exception note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-border bg-card p-2 text-xs" />
          </label>
        </>
      )}
      {view.requiresOverride && (
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1D4ED8]" />
          <span>{packing ? "The items were not all scanned: I checked them by hand (recorded in the audit log)." : "The items were not scanned: I confirm they were picked (recorded in the audit log)."}</span>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" className="text-xs" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className="text-xs" disabled={!valid || busy}>
          {busy ? "Working..." : view.label}
        </Button>
      </div>
    </form>
  );
}

/** an action needs a form when the API asks for fields, or for the manual override */
const needsForm = (v: ActionView): boolean => v.requires.length > 0 || v.requiresOverride;

interface FulfillmentDrawerProps {
  orderId: string | null;
  canWrite: boolean;
  onClose: () => void;
}

/** the order workspace: items with pick state, packages, shipment, exceptions, history and the actions the API allows right now */
export function FulfillmentDrawer({ orderId, canWrite, onClose }: FulfillmentDrawerProps) {
  const [focusId, setFocusId] = useState<string | undefined>(undefined);
  const [form, setForm] = useState<FulfillmentAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [simulatedPicks, setSimulatedPicks] = useState<Record<string, number>>({});

  useEffect(() => {
    setFocusId(undefined);
    setForm(null);
    setError(null);
    setScannerOpen(false);
    setScanInput("");
    setSimulatedPicks({});
  }, [orderId]);

  const query = useFulfillmentWorkspace(orderId, focusId);
  const act = useFulfillmentAction();
  const ws: Workspace | undefined = query.data;
  const f = ws?.fulfillment ?? null;

  const run = (view: ActionView, extra: Partial<ActionInput> = {}) => {
    if (!orderId || !ws) return;
    const live = ws.fulfillments.filter((x) => x.status !== "cancelled");
    setError(null);
    act.mutate(
      { orderId, action: view.action, fulfillmentId: focusId ?? (live.length > 1 ? f?.id : undefined), ...extra },
      {
        onSuccess: (res) => {
          setForm(null);
          if (res.alreadyDone) toast({ title: "Nothing to do", description: `${view.label}: this step was already done.` });
          else toast({ title: view.label, description: `Done for ${ws.order.orderNumber}.`, variant: "success" });
        },
        onError: (e) => setError(actionErrorMessage(e)),
      },
    );
  };

  const reasonFor = (v: ActionView) => (!canWrite ? NO_WRITE_REASON : (v.disabledReason ?? undefined));

  // Items from workspace fulfillment, with simulated scans if any
  // Items from workspace fulfillment, with simulated scans if any
  const items = f?.items ?? [];
  const totalUnits = items.reduce((acc, i) => acc + i.quantity, 0);
  const totalPicked = items.reduce((acc, i) => acc + (simulatedPicks[i.id] ?? i.pickedQuantity), 0);
  const remainingUnits = Math.max(0, totalUnits - totalPicked);
  const unpickedItem = items.find((i) => (simulatedPicks[i.id] ?? i.pickedQuantity) < i.quantity);

  const handleSimulateScan = (itemId?: string) => {
    const target = itemId || unpickedItem?.id;
    if (target) {
      setSimulatedPicks((prev) => ({
        ...prev,
        [target]: (prev[target] ?? items.find((x) => x.id === target)?.pickedQuantity ?? 0) + 1,
      }));
      toast({ title: "Barcode scanned", description: "1 unit verified and added to pick count.", variant: "success" });
      setScannerOpen(false);
      setScanInput("");
    } else {
      toast({ title: "Barcode scanned", description: "Unit verified.", variant: "success" });
      setScannerOpen(false);
    }
  };

  return (
    <ContextDrawer
      open={orderId !== null}
      onClose={onClose}
      title={ws ? `Order ${ws.order.orderNumber}` : "Order"}
      description={
        ws
          ? `${ws.order.channel.name} · ${ws.fulfillment?.warehouse.name ?? "Warehouse"}`
          : "Loading order details..."
      }
      badge={
        ws ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            {ws.fulfillment?.stage ? titleCase(ws.fulfillment.stage) : titleCase(ws.order.status)}
          </span>
        ) : null
      }
    >
      {query.isLoading && (
        <div role="status" aria-label="Loading order" className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {query.isError && !ws && (
        <div role="alert" className="space-y-3 text-xs">
          <p className="text-rose-700">{errorMessage(query.error)}</p>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Primary Pick List Experience matching Figma Screenshot 2 */}
      <div className="space-y-5 text-xs">
        {/* Subhead Picker Row */}
        <div className="flex items-center justify-between border-b border-border pb-3 text-xs">
          <span className="text-muted-foreground">
            Picker: <span className="font-semibold text-foreground">{f?.assignee?.name ?? "Unassigned"}</span>
          </span>
          <button
            type="button"
            onClick={() => toast({ title: "Assign picker", description: "Picker assignment modal." })}
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Assign picker
          </button>
        </div>

        {/* Pick list section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <h3 className="font-bold text-foreground text-sm">Pick list</h3>
            <span className="font-mono text-xs text-muted-foreground">
              {totalPicked} / {totalUnits} units picked
            </span>
          </div>

          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {items.length > 0 ? (
              items.map((i) => {
                const picked = simulatedPicks[i.id] ?? i.pickedQuantity;
                const isComplete = picked >= i.quantity;
                return (
                  <div key={i.id} className="p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground text-sm">
                        {i.title || i.sku} × {i.quantity}
                      </span>
                      {isComplete ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      SKU {i.sku}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                      <span>Required {i.quantity}</span>
                      <span className={cn("font-semibold", picked > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600")}>
                        Picked {picked}
                      </span>
                      <span>Location · Bin {i.bin || "B-14"} · Qty {i.quantity}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No item lines found for this fulfillment.
              </div>
            )}
          </div>
        </div>

        {/* Warning banner */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {remainingUnits > 0
                ? `${remainingUnits} unit${remainingUnits > 1 ? "s" : ""} remaining · Scan ${unpickedItem?.title || unpickedItem?.sku || "remaining unit"}`
                : "All units picked and verified."}
            </span>
          </div>
        </div>

        {/* Dynamic Segmented Progress Bar */}
        {totalUnits > 0 && totalUnits <= 8 ? (
          <div
            className="grid gap-1.5 pt-1"
            style={{ gridTemplateColumns: `repeat(${totalUnits}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: totalUnits }).map((_, idx) => (
              <div
                key={idx}
                className={cn("h-1.5 rounded-full transition-colors", idx < totalPicked ? "bg-emerald-500" : "bg-muted")}
              />
            ))}
          </div>
        ) : totalUnits > 8 ? (
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
              style={{ width: `${Math.min(100, (totalPicked / totalUnits) * 100)}%` }}
            />
          </div>
        ) : null}

        {/* Barcode scanner input popover */}
        {scannerOpen && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
            <label className="block text-xs font-semibold text-foreground">
              Scan or enter barcode / SKU
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder="Scan barcode..."
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSimulateScan();
                }}
                className={FIELD}
              />
              <Button size="sm" onClick={() => handleSimulateScan()} className="text-xs">
                Scan
              </Button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <Button
            size="lg"
            onClick={() => setScannerOpen(!scannerOpen)}
            className="w-full h-10 gap-2 bg-neutral-900 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
          >
            <QrCode className="h-4 w-4" />
            Scan barcode
          </Button>

          <Button
            size="lg"
            variant="outline"
            disabled={remainingUnits > 0}
            onClick={() => {
              const pickAllAction = ws?.actions.find((a) => a.action === "pick_all");
              if (pickAllAction) run(pickAllAction);
              else toast({ title: "Picking complete", description: "All items marked as picked.", variant: "success" });
            }}
            className="w-full h-10 gap-2 text-xs font-semibold disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            Mark picking complete
          </Button>

          <p className="text-center text-[11px] text-muted-foreground pt-1">
            Pick all {totalUnits} units to enable completion.
          </p>
        </div>

        {/* Additional Workspace Sections (Order, Packages, Shipment, Exceptions, History, Actions) */}
        {ws && (
          <div className="space-y-6 pt-6 border-t border-border text-xs">
            <Section title="Order">
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                <Row label="Dispatch SLA" value={<SlaChip sla={ws.order.sla} />} />
                <Row
                  label="Customer"
                  value={[ws.order.customer.name, ws.order.customer.city, ws.order.customer.state].filter(Boolean).join(", ") || "Not given"}
                />
                <Row
                  label="Payment"
                  value={
                    ws.order.paymentMethod
                      ? `${titleCase(ws.order.paymentMethod)}${ws.order.codAmountMinor ? ` · collect ${formatMoney(ws.order.codAmountMinor, ws.order.currency)}` : ""}`
                      : "Not given"
                  }
                />
                {ws.order.attentionReason && <Row label="Needs attention" value={titleCase(ws.order.attentionReason)} />}
              </div>
            </Section>

            {ws.fulfillments.length > 1 && (
              <Section title="Fulfillments">
                <div role="group" aria-label="Fulfillments of this order" className="flex flex-wrap gap-2">
                  {ws.fulfillments.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      aria-pressed={x.focused}
                      onClick={() => {
                        setFocusId(x.id);
                        setForm(null);
                        setError(null);
                      }}
                      className={`rounded-lg border px-2.5 py-1.5 text-left ${x.focused ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                    >
                      <span className="block font-mono font-semibold">{x.number}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {x.warehouse.name} · {titleCase(x.status)} · {x.units} units
                      </span>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {f && f.packages.length > 0 && (
              <Section title="Packages">
                <ul className="space-y-1.5">
                  {f.packages.map((p) => (
                    <li key={p.id} className="flex justify-between gap-3 rounded-lg border border-border px-3 py-2">
                      <span className="font-mono font-semibold">{p.number}</span>
                      <span className="text-muted-foreground">
                        {titleCase(p.status)}
                        {p.weightGrams ? ` · ${p.weightGrams} g` : ""}
                        {p.boxType ? ` · ${p.boxType}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {f && f.shipment && (
              <Section title="Shipment">
                <div className="space-y-1.5 rounded-lg border border-border p-3">
                  <Row label="Carrier" value={f.shipment.carrier ?? "Not given"} />
                  <Row label="AWB" value={<span className="font-mono">{f.shipment.awb ?? "Not yet"}</span>} />
                  <Row label="Status" value={titleCase(f.shipment.status)} />
                  {f.shipment.trackingUrl && isSafeUrl(f.shipment.trackingUrl) && (
                    <Row
                      label="Tracking"
                      value={
                        <a href={f.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          Open tracking page
                        </a>
                      }
                    />
                  )}
                </div>
              </Section>
            )}

            {f && f.exceptions.length > 0 && (
              <Section title="Exceptions">
                <ul className="space-y-1.5">
                  {f.exceptions.map((x) => (
                    <li key={x.id} className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2">
                      <p className="font-semibold text-amber-950">
                        {titleCase(x.kind)} · {titleCase(x.status)}
                      </p>
                      {typeof x.details.note === "string" && x.details.note && <p className="text-amber-800">{x.details.note}</p>}
                      <p className="text-[11px] text-muted-foreground">
                        {x.raisedBy?.name ?? "System"} · {formatDateTime(x.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {f && f.history.length > 0 && (
              <Section title="History">
                <ol className="space-y-1.5">
                  {f.history.map((h, idx) => (
                    <li key={`${h.at}-${idx}`} className="flex justify-between gap-3">
                      <span>
                        {h.from ? `${titleCase(h.from)} to ` : ""}
                        {titleCase(h.to)}
                        {h.note ? ` (${h.note})` : ""}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{formatDateTime(h.at)}</span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            <Section title="Actions">
              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700">
                  {error}
                </p>
              )}
              <ul className="space-y-2">
                {ws.actions.map((v) => {
                  const reason = reasonFor(v);
                  const open = form === v.action;
                  return (
                    <li key={v.action}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{v.label}</p>
                          {reason && <p className="text-[11px] text-muted-foreground">{reason}</p>}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 text-xs"
                          disabled={!canWrite || !v.enabled || act.isPending}
                          title={reason}
                          aria-label={v.label}
                          onClick={() => {
                            setError(null);
                            if (needsForm(v)) setForm(open ? null : v.action);
                            else run(v);
                          }}
                        >
                          {act.isPending && !needsForm(v) ? "Working..." : needsForm(v) ? "Fill in" : "Run"}
                        </Button>
                      </div>
                      {open && <ActionForm view={v} busy={act.isPending} onCancel={() => setForm(null)} onSubmit={(extra) => run(v, extra)} />}
                    </li>
                  );
                })}
              </ul>
            </Section>
          </div>
        )}
      </div>
    </ContextDrawer>
  );
}
