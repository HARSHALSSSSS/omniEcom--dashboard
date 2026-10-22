import { useState } from "react";
import { Minus, Plus, Search } from "lucide-react";
import { useCreateReturn, useFindEligibleOrder, useReturnReasons } from "@/hooks/useReturns";
import { cn } from "@/utils/cn";
import type { Eligibility, ReturnOrder } from "@/types/returns";
import { BTN_LIGHT, CloseButton, DrawerShell, FIELD_INPUT } from "@/components/returns/design";
import { fmtDay, formatMoney, humanize, writeErrorMessage } from "@/components/returns/returnFormat";

interface CreateReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (created: ReturnOrder) => void;
  /** the stores a return can be created for ("Shopify orders only") */
  channelNames: string[];
}

/** the reasons of the design's form (code -> its label), in its order */
const DESIGN_REASONS: Record<string, string> = {
  size_fit: "Size or fit issue",
  damaged_in_transit: "Damaged in transit",
  defective: "Defective item",
  color_mismatch: "Color mismatch",
  wrong_item_sent: "Incorrect item sent",
  changed_mind: "Customer changed mind",
};

/** a seller-created return: find the order by number, choose the units that come back and the reason (creating it never issues a refund) */
export function CreateReturnModal({ isOpen, onClose, onCreated, channelNames }: CreateReturnModalProps) {
  if (!isOpen) return null;
  return <CreateForm onClose={onClose} onCreated={onCreated} channelNames={channelNames} />;
}

/** mounted only while the drawer is open, so every opening starts empty */
function CreateForm({ onClose, onCreated, channelNames }: Omit<CreateReturnModalProps, "isOpen">) {
  const find = useFindEligibleOrder();
  const create = useCreateReturn();
  const { data: reasons = [] } = useReturnReasons(true);
  const [orderQuery, setOrderQuery] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reasonPicked, setReasonPicked] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const eligible: Eligibility | undefined = find.data;
  const currency = eligible?.order.currency;
  // the six reasons of the design come first, in its order and words; the rest of the catalogue follows
  const rank = (code: string) => (code in DESIGN_REASONS ? Object.keys(DESIGN_REASONS).indexOf(code) : 99);
  const sellerReasons = reasons
    .filter((r) => r.sources.includes("seller"))
    .map((r) => ({ code: r.code, label: DESIGN_REASONS[r.code] ?? r.label }))
    .sort((a, b) => rank(a.code) - rank(b.code));
  const reasonCode = reasonPicked || sellerReasons[0]?.code || "other";
  const chosen = (eligible?.items ?? []).filter((i) => (quantities[i.orderItemId] ?? 0) > 0);
  const totalUnits = chosen.reduce((n, i) => n + (quantities[i.orderItemId] ?? 0), 0);
  const totalValue = chosen.reduce((n, i) => n + (quantities[i.orderItemId] ?? 0) * i.unitPriceMinor, 0);
  const busy = find.isPending || create.isPending;

  const lookup = () => {
    const term = orderQuery.trim();
    if (!term) return;
    setError(null);
    setQuantities({});
    find.mutate(term, { onError: (e) => setError(writeErrorMessage(e)) });
  };

  const setQty = (id: string, max: number, next: number) => setQuantities((q) => ({ ...q, [id]: Math.max(0, Math.min(max, next)) }));

  const submit = () => {
    if (!eligible || totalUnits === 0) return;
    setError(null);
    create.mutate(
      { orderId: eligible.order.id, reasonCode, reasonText: notes.trim() || undefined, items: chosen.map((i) => ({ orderItemId: i.orderItemId, quantity: quantities[i.orderItemId] ?? 0 })) },
      { onSuccess: (created) => onCreated(created), onError: (e) => setError(writeErrorMessage(e)) },
    );
  };

  const footer = (
    <div className="flex items-center justify-between border-t border-[#EAEAEA] bg-white p-4">
      <div className="space-y-0.5">
        <div className="text-[13px] font-semibold text-black">
          {totalUnits} {totalUnits === 1 ? "unit" : "units"} · {currency ? formatMoney(totalValue, currency) : "—"} item value
        </div>
        <div className="text-[11px] text-[#666666]">Creating a return does not issue a refund.</div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={BTN_LIGHT}>
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!eligible || totalUnits === 0 || busy}
          className="flex h-[34px] cursor-pointer items-center gap-1.5 rounded-lg bg-[#111111] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{create.isPending ? "Creating..." : "Create Return"}</span>
        </button>
      </div>
    </div>
  );

  return (
    <DrawerShell label="Create return" size="lg" onClose={onClose} footer={footer}>
      <div className="border-b border-[#EAEAEA] p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#666666]">Returns Operations</span>
            <h2 className="text-[20px] font-semibold leading-tight text-black">Create Return</h2>
            <p className="text-[12px] text-[#666666]">Find an order and choose the items you want to return.</p>
          </div>
          <CloseButton onClick={onClose} label="Close" />
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="return-order-query" className="text-[13px] font-medium text-black">
              Order
            </label>
            {channelNames.length > 0 && <span className="text-[11px] text-[#666666]">{channelNames.join(", ")} orders only</span>}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              lookup();
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#666666]" />
              <input id="return-order-query" aria-label="Order number" value={orderQuery} onChange={(e) => setOrderQuery(e.target.value)} placeholder="#1042 or the marketplace order id" className={cn(FIELD_INPUT, "pl-9")} />
            </div>
            <button type="submit" disabled={!orderQuery.trim() || busy} className="h-[36px] cursor-pointer rounded-lg border border-[#EAEAEA] bg-white px-3.5 text-[12px] font-semibold text-black transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50">
              {find.isPending ? "Finding..." : "Find order"}
            </button>
          </form>

          {eligible ? (
            <div className="space-y-1 rounded-lg border border-[#EAEAEA] bg-neutral-50/50 p-3">
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-semibold text-black">
                  Order {eligible.order.number}
                  {eligible.order.customer?.name ? ` · ${eligible.order.customer.name}` : ""}
                </div>
                <span className="inline-flex items-center rounded-md border border-[#DCFCE7] bg-[#F0FDF4] px-2 py-0.5 text-[11px] font-medium text-[#16A34A]">{humanize(eligible.order.status)}</span>
              </div>
              <div className="text-[11px] text-[#666666]">
                {[
                  eligible.order.customer?.email,
                  eligible.order.channel.name,
                  eligible.order.placedAt ? fmtDay(eligible.order.placedAt) : null,
                  eligible.order.itemCount !== undefined ? `${eligible.order.itemCount} ${eligible.order.itemCount === 1 ? "item" : "items"}` : null,
                  `${formatMoney(eligible.order.totalMinor, eligible.order.currency)} ${eligible.order.currency}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-[#666666]">Enter an order number to see which items can still be returned.</p>
          )}
        </div>

        {eligible && (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-black">Items to return</span>
                <span className="text-[11px] text-[#666666]">
                  {chosen.length} {chosen.length === 1 ? "item" : "items"} selected
                </span>
              </div>

              <div className="overflow-hidden rounded-lg border border-[#EAEAEA] bg-white">
                <div className="grid grid-cols-12 items-center border-b border-[#EAEAEA] bg-[#FAFAFA] px-3 py-2 text-[11px] font-medium text-[#666666]">
                  <div className="col-span-6">Product</div>
                  <div className="col-span-2 text-center">Fulfilled</div>
                  <div className="col-span-2 text-center">Return qty.</div>
                  <div className="col-span-2 text-right">Unit price</div>
                </div>
                <div className="divide-y divide-[#EAEAEA]">
                  {eligible.items.map((item) => {
                    const qty = quantities[item.orderItemId] ?? 0;
                    const selected = qty > 0;
                    const label = item.sku ?? item.title;
                    return (
                      <div key={item.orderItemId} className={cn("grid grid-cols-12 items-center px-3 py-2.5 text-[12px] transition-colors", selected ? "bg-white" : "bg-neutral-50/40")}>
                        <div className="col-span-6 flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${label}`}
                            checked={selected}
                            disabled={item.availableQty === 0}
                            onChange={() => setQty(item.orderItemId, item.availableQty, selected ? 0 : 1)}
                            className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded border-[#BDBDBD] accent-black"
                          />
                          <div>
                            <div className="font-medium leading-tight text-black">{item.title}</div>
                            <div className="text-[11px] text-[#666666]">
                              {[item.variant, item.sku ? `SKU ${item.sku}` : "No SKU"].filter(Boolean).join(" · ")}
                            </div>
                            {item.availableQty < item.fulfilledQty && (
                              <div className="text-[11px] text-[#D97706]">
                                {item.availableQty} of {item.fulfilledQty} can still be returned
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="col-span-2 text-center font-medium text-[#666666]">{item.fulfilledQty}</div>
                        <div className="col-span-2 flex items-center justify-center">
                          <div className="inline-flex items-center overflow-hidden rounded-md border border-[#EAEAEA] bg-white">
                            <button
                              type="button"
                              aria-label={`Fewer units of ${label}`}
                              onClick={() => setQty(item.orderItemId, item.availableQty, qty - 1)}
                              disabled={qty <= 0}
                              className="flex h-6 w-6 cursor-pointer items-center justify-center text-[#666666] hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-white"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span aria-label={`Units to return for ${label}`} className="w-6 text-center text-[11px] font-semibold text-black">
                              {qty}
                            </span>
                            <button
                              type="button"
                              aria-label={`More units of ${label}`}
                              onClick={() => setQty(item.orderItemId, item.availableQty, qty + 1)}
                              disabled={qty >= item.availableQty}
                              className="flex h-6 w-6 cursor-pointer items-center justify-center text-[#666666] hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-white"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <div className="col-span-2 text-right font-medium text-black">{formatMoney(item.unitPriceMinor, eligible.order.currency)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-[11px] leading-tight text-[#666666]">{eligible.note}</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="return-reason" className="text-[13px] font-medium text-black">
                Return reason
              </label>
              <select id="return-reason" aria-label="Return reason" value={reasonCode} onChange={(e) => setReasonPicked(e.target.value)} className={cn(FIELD_INPUT, "cursor-pointer")}>
                {sellerReasons.length === 0 && <option value="other">Other</option>}
                {sellerReasons.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[#666666]">Applies to all selected items.</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="return-notes" className="text-[13px] font-medium text-black">
                Notes (optional)
              </label>
              <textarea
                id="return-notes"
                aria-label="Return details"
                value={notes}
                maxLength={500}
                rows={3}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add details for the team handling this return..."
                className="w-full resize-none rounded-lg border border-[#EAEAEA] bg-white p-3 text-[12px] text-black placeholder:text-[#999999] focus:border-black focus:outline-none"
              />
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="text-[12px] text-[#DC2626]">
            {error}
          </p>
        )}
      </div>
    </DrawerShell>
  );
}
