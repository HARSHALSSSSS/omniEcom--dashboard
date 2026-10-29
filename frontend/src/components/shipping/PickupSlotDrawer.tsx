import { useState } from "react";
import { CalendarClock, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import type { WarehouseOption } from "@/api/shipping.api";
import { useBookPickupSlot, useCancelPickupSlot, usePickupSlots } from "@/hooks/useShipping";
import { toast } from "@/hooks/useToast";
import type { PickupSlot, ShippingMethod } from "@/types/shipping";
import { BTN_PRIMARY, BTN_SECONDARY, ShippingDrawer } from "./ShippingDrawer";
import { NO_WRITE_REASON } from "./shippingFormat";

const FIELD = "h-9 sm:h-8 min-h-[36px] sm:min-h-0 w-full rounded-lg border border-[#EAEAEA] bg-white px-3 text-[11px] text-black focus:border-black focus:outline-none";

const dayText = (iso: string): string => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });

const STATUS: Record<PickupSlot["status"], { text: string; tone: string }> = {
  confirmed: { text: "Confirmed with the carrier", tone: "text-[#16A34A]" },
  manual: { text: "Recorded · arrange it with the carrier", tone: "text-[#D97706]" },
  requested: { text: "Requested", tone: "text-[#2563EB]" },
  failed: { text: "The carrier refused it", tone: "text-[#DC2626]" },
  cancelled: { text: "Cancelled", tone: "text-[#666666]" },
};

interface PickupSlotDrawerProps {
  open: boolean;
  canWrite: boolean;
  /** what the row it was opened from already says */
  preset: { warehouseId: string; methodId: string | null } | null;
  methods: ReadonlyArray<ShippingMethod>;
  warehouses: ReadonlyArray<WarehouseOption>;
  onClose: () => void;
}

export function PickupSlotDrawer(props: PickupSlotDrawerProps) {
  if (!props.open) return null;
  return <Body key={`${props.preset?.warehouseId ?? ""}:${props.preset?.methodId ?? ""}`} {...props} />;
}

const tomorrow = (): string => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function Body({ canWrite, preset, methods, warehouses, onClose }: PickupSlotDrawerProps) {
  const slots = usePickupSlots(true);
  const book = useBookPickupSlot();
  const cancel = useCancelPickupSlot();
  const usable = methods.filter((m) => m.active);
  const [methodId, setMethodId] = useState(preset?.methodId ?? usable[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(preset?.warehouseId ?? warehouses[0]?.id ?? "");
  const [date, setDate] = useState(tomorrow());
  const [from, setFrom] = useState("10:00");
  const [to, setTo] = useState("12:00");
  const [parcels, setParcels] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const count = Number(parcels);
  const ready = methodId !== "" && warehouseId !== "" && /^\d{4}-\d{2}-\d{2}$/.test(date) && from !== "" && to > from && Number.isInteger(count) && count >= 1;

  const submit = () => {
    setError(null);
    book.mutate(
      { warehouseId, methodId, date, windowStart: from, windowEnd: to, parcelCount: count, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: (s) => {
          if (s.status === "failed") setError(`The carrier did not accept the pickup. ${s.note ?? ""}`.trim());
          else toast({ title: s.status === "confirmed" ? "Pickup slot confirmed" : "Pickup slot recorded", description: `${dayText(s.date)}, ${s.windowStart}–${s.windowEnd} · ${s.parcelCount} ${s.parcelCount === 1 ? "parcel" : "parcels"}`, variant: "success" });
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  const onCancel = (s: PickupSlot) =>
    cancel.mutate(s.id, {
      onSuccess: () => toast({ title: "Pickup slot cancelled", variant: "success" }),
      onError: (e) => toast({ title: "The slot could not be cancelled", description: errorMessage(e), variant: "destructive" }),
    });

  const upcoming = (slots.data?.items ?? []).filter((s) => s.status !== "failed");
  return (
    <ShippingDrawer
      open
      eyebrow="Book Slot"
      title="Book a pickup slot"
      subtitle="Tell the carrier when to collect the parcels."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={submit} disabled={!canWrite || !ready || book.isPending} title={canWrite ? undefined : NO_WRITE_REASON} className={BTN_PRIMARY}>
            {book.isPending ? "Booking..." : "Book slot"}
          </button>
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>
            Close
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3">
        <label className="block space-y-1 text-[11px] text-[#666666]">
          <span>Shipping method</span>
          <select aria-label="Shipping method" value={methodId} onChange={(e) => setMethodId(e.target.value)} className={FIELD}>
            {usable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-[11px] text-[#666666]">
          <span>Warehouse</span>
          <select aria-label="Warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={FIELD}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-[11px] text-[#666666]">
          <span>Pickup date</span>
          <input aria-label="Pickup date" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className={FIELD} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1 text-[11px] text-[#666666]">
            <span>Window from</span>
            <input aria-label="Window from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={FIELD} />
          </label>
          <label className="block space-y-1 text-[11px] text-[#666666]">
            <span>Window to</span>
            <input aria-label="Window to" type="time" value={to} onChange={(e) => setTo(e.target.value)} className={FIELD} />
          </label>
        </div>
        {to <= from && <p className="text-[10px] text-[#DC2626]">The window must end after it starts.</p>}
        <label className="block space-y-1 text-[11px] text-[#666666]">
          <span>Parcels to collect</span>
          <input aria-label="Parcels to collect" inputMode="numeric" value={parcels} onChange={(e) => setParcels(e.target.value)} className={FIELD} />
        </label>
        <label className="block space-y-1 text-[11px] text-[#666666]">
          <span>Note for the carrier (optional)</span>
          <input aria-label="Note for the carrier" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className={FIELD} />
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-[#FECACA] bg-[#FFF8F8] p-3 text-[11px] text-[#B91C1C]">
          {error}
        </p>
      )}

      <div className="space-y-2 pt-1">
        <h4 className="text-[12px] font-semibold text-black">Upcoming slots</h4>
        {slots.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : slots.isError ? (
          <p role="alert" className="text-[11px] text-[#DC2626]">
            The slots could not be loaded. {errorMessage(slots.error)}
          </p>
        ) : upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#EAEAEA] px-3 py-4 text-center text-[11px] text-[#666666]">No pickup slot is booked yet.</p>
        ) : (
          <ul className="divide-y divide-[#EAEAEA]/80 rounded-lg border border-[#EAEAEA]">
            {upcoming.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-[11px]">
                <div className="space-y-0.5">
                  <p className="flex items-center gap-1.5 font-semibold text-black">
                    <CalendarClock className="h-3 w-3 text-[#666666]" aria-hidden />
                    {dayText(s.date)}, {s.windowStart}–{s.windowEnd}
                  </p>
                  <p className="text-[#666666]">
                    {s.method.name} · {s.warehouse.name} · {s.parcelCount} {s.parcelCount === 1 ? "parcel" : "parcels"}
                  </p>
                  <p className={STATUS[s.status].tone}>
                    {STATUS[s.status].text}
                    {s.reference ? ` · ${s.reference}` : ""}
                  </p>
                  {s.note && <p className="text-[#888888]">{s.note}</p>}
                </div>
                {s.cancellable && (
                  <button type="button" disabled={!canWrite || cancel.isPending} title={canWrite ? undefined : NO_WRITE_REASON} aria-label={`Cancel slot ${dayText(s.date)} ${s.windowStart}`} onClick={() => onCancel(s)} className="shrink-0 font-medium text-[#DC2626] hover:underline disabled:opacity-50">
                    Cancel slot
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-[#EAEAEA] bg-[#FAF9F7] p-3 text-[11px] text-[#666666]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#666666]" />
        <span>A carrier that can schedule pickups is asked to; for any other method the slot is recorded here and you arrange it with the carrier.</span>
      </div>
    </ShippingDrawer>
  );
}
