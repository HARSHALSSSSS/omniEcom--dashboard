import { Skeleton } from "@/components/ui/skeleton";
import type { ShipmentRow } from "@/types/shipping";
import { ShipmentStatusPill } from "./shippingUi";
import { NO_WRITE_REASON, dateOrDash, orDash, paymentText } from "./shippingFormat";

interface ShipmentsTableProps {
  rows: ShipmentRow[];
  selected: ReadonlySet<string>;
  canWrite: boolean;
  refreshing: boolean;
  labelBusyId: string | null;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  onLabel: (id: string) => void;
}

const COLUMNS = ["AWB / Order", "Carrier", "Destination", "Payment", "Status / last event", "ETA"];

export function ShipmentsTable({ rows, selected, canWrite, refreshing, labelBusyId, onToggle, onToggleAll, onOpen, onLabel }: ShipmentsTableProps) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${refreshing ? "opacity-60" : ""}`} aria-busy={refreshing}>
      <table className="w-full min-w-[980px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            <th className="w-10 py-3 pl-4 pr-2">
              <input
                type="checkbox"
                aria-label="Select all shipments on this page"
                checked={allSelected}
                disabled={!canWrite}
                title={canWrite ? undefined : NO_WRITE_REASON}
                onChange={onToggleAll}
                className="h-4 w-4 cursor-pointer accent-[#1D4ED8] disabled:cursor-not-allowed"
              />
            </th>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" className="px-3 py-3">
                {c}
              </th>
            ))}
            <th scope="col" className="py-3 pl-3 pr-4 text-right">
              Label
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((s) => (
            <tr key={s.id} className="hover:bg-muted/20">
              <td className="py-3 pl-4 pr-2">
                <input
                  type="checkbox"
                  aria-label={`Select shipment ${s.awb ?? s.number}`}
                  checked={selected.has(s.id)}
                  disabled={!canWrite}
                  title={canWrite ? undefined : NO_WRITE_REASON}
                  onChange={() => onToggle(s.id)}
                  className="h-4 w-4 cursor-pointer accent-[#1D4ED8] disabled:cursor-not-allowed"
                />
              </td>
              <td className="px-3 py-3">
                <button type="button" onClick={() => onOpen(s.id)} aria-label={`Open shipment ${s.awb ?? s.number}`} className="text-left">
                  <span className="block font-mono font-bold text-foreground hover:underline">{s.awb ?? "No AWB yet"}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">{s.orderNumber}</span>
                </button>
              </td>
              <td className="px-3 py-3 font-medium text-foreground">
                {s.carrier}
                {s.service && <span className="block text-[11px] font-normal text-muted-foreground">{s.service}</span>}
              </td>
              <td className="px-3 py-3">
                <p className="font-mono font-semibold">{orDash(s.destination.pincode)}</p>
                <p className="text-[11px] text-muted-foreground">{[s.destination.city, s.destination.state].filter(Boolean).join(", ") || "—"}</p>
              </td>
              <td className="px-3 py-3 font-mono font-semibold uppercase">{paymentText(s.paymentMethod)}</td>
              <td className="px-3 py-3">
                <ShipmentStatusPill status={s.status} label={s.statusLabel} />
                {s.lastEvent ? (
                  <p className="mt-1 max-w-[220px] truncate text-[11px] text-muted-foreground" title={s.lastEvent.note ?? undefined}>
                    {[s.lastEvent.rawStatus ?? s.lastEvent.status.replace(/_/g, " "), s.lastEvent.location].filter(Boolean).join(" · ")} · {dateOrDash(s.lastEvent.occurredAt)}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">No tracking events yet</p>
                )}
              </td>
              <td className="px-3 py-3 text-muted-foreground">{dateOrDash(s.estimatedDeliveryAt)}</td>
              <td className="py-3 pl-3 pr-4 text-right">
                <button
                  type="button"
                  disabled={!s.labelAvailable || labelBusyId === s.id}
                  title={s.labelAvailable ? undefined : s.status === "cancelled" ? "The shipment was cancelled: its label is void." : "This shipment has no label yet."}
                  aria-label={`Print label ${s.awb ?? s.number}`}
                  onClick={() => onLabel(s.id)}
                  className="h-7 rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {labelBusyId === s.id ? "Preparing..." : "Print Label"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div role="status" aria-label="Loading shipments" className="space-y-px overflow-hidden rounded-xl border border-border bg-card p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="my-2 h-10 w-full" />
      ))}
    </div>
  );
}
