import React, { useState } from "react";
import { X, Search, Plus, Minus } from "lucide-react";
import { cn } from "@/utils/cn";

interface ReturnItemOption {
  id: string;
  title: string;
  variant: string;
  sku: string;
  fulfilledQty: number;
  returnQty: number;
  unitPrice: number;
  selected: boolean;
}

interface CreateReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate?: (returnData: {
    orderNumber: string;
    customerName: string;
    items: Array<{ title: string; sku: string; quantity: number; unitPrice: number }>;
    reason: string;
    notes?: string;
  }) => void;
}

export const CreateReturnModal: React.FC<CreateReturnModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  if (!isOpen) return null;

  const [orderQuery, setOrderQuery] = useState("#1048");
  const [returnReason, setReturnReason] = useState("Size or fit issue");
  const [notes, setNotes] = useState("");

  const [items, setItems] = useState<ReturnItemOption[]>([
    {
      id: "item-1",
      title: "Essential Cotton Tee",
      variant: "Black / M",
      sku: "SKU TEE-BLK-M",
      fulfilledQty: 2,
      returnQty: 1,
      unitPrice: 28.0,
      selected: true,
    },
    {
      id: "item-2",
      title: "Relaxed Chino",
      variant: "Sand / 32",
      sku: "SKU CHN-SND-32",
      fulfilledQty: 1,
      returnQty: 1,
      unitPrice: 68.0,
      selected: true,
    },
    {
      id: "item-3",
      title: "Everyday Canvas Tote",
      variant: "Natural",
      sku: "SKU TOTE-NAT",
      fulfilledQty: 1,
      returnQty: 0,
      unitPrice: 18.0,
      selected: false,
    },
  ]);

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextSelected = !item.selected;
          return {
            ...item,
            selected: nextSelected,
            returnQty: nextSelected && item.returnQty === 0 ? 1 : !nextSelected ? 0 : item.returnQty,
          };
        }
        return item;
      })
    );
  };

  const updateQty = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newQty = Math.max(0, Math.min(item.fulfilledQty, item.returnQty + delta));
          return {
            ...item,
            returnQty: newQty,
            selected: newQty > 0,
          };
        }
        return item;
      })
    );
  };

  const selectedItems = items.filter((i) => i.selected && i.returnQty > 0);
  const totalUnits = selectedItems.reduce((acc, curr) => acc + curr.returnQty, 0);
  const totalValue = selectedItems.reduce(
    (acc, curr) => acc + curr.returnQty * curr.unitPrice,
    0
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalUnits === 0) return;

    if (onCreate) {
      onCreate({
        orderNumber: orderQuery.startsWith("ORD-") ? orderQuery : `ORD-${orderQuery.replace("#", "")}`,
        customerName: "Emma Wilson",
        items: selectedItems.map((i) => ({
          title: i.title,
          sku: i.sku.replace("SKU ", ""),
          quantity: i.returnQty,
          unitPrice: i.unitPrice,
        })),
        reason: returnReason,
        notes,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-['Inter',sans-serif]">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/25 backdrop-blur-[1px] transition-opacity animate-in fade-in duration-200"
      />

      {/* Drawer Container (580px width matching Figma spec) */}
      <aside
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-white border-l border-[#EAEAEA] shadow-2xl transition-transform duration-300 ease-out animate-in slide-in-from-right text-[#0A0A0A]",
          "w-full sm:w-[580px] max-w-[580px]"
        )}
      >
        {/* Drawer Header */}
        <div className="p-6 border-b border-[#EAEAEA]">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold tracking-wider text-[#666666] uppercase block">
                Returns Operations
              </span>
              <h2 className="text-[20px] font-semibold text-black leading-tight">
                Create Return
              </h2>
              <p className="text-[12px] text-[#666666]">
                Find an order and choose the items you want to return.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#666666] hover:bg-neutral-100 hover:text-black transition-colors cursor-pointer"
            >
              <X className="h-4 w-4 stroke-[1.5]" />
            </button>
          </div>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Order Lookup */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-medium text-black">Order</label>
              <span className="text-[11px] text-[#666666]">Shopify orders only</span>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#666666]" />
                <input
                  type="text"
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                  placeholder="Search order number..."
                  className="w-full h-[36px] pl-9 pr-3 rounded-lg border border-[#EAEAEA] text-[12px] text-black bg-white focus:outline-none focus:border-black transition-colors"
                />
              </div>
              <button
                type="button"
                className="h-[36px] px-3.5 rounded-lg border border-[#EAEAEA] bg-white text-[12px] font-semibold text-black hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Find order
              </button>
            </div>

            {/* Found Order Card */}
            <div className="rounded-lg border border-[#EAEAEA] bg-neutral-50/50 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-semibold text-black">
                  Order #1048 · Emma Wilson
                </div>
                <span className="inline-flex items-center rounded-md bg-[#F0FDF4] px-2 py-0.5 text-[11px] font-medium text-[#16A34A] border border-[#DCFCE7]">
                  Fulfilled
                </span>
              </div>
              <div className="text-[11px] text-[#666666]">
                emma.wilson@example.com · Oct 2, 2026 · 4 items · $142.00 USD
              </div>
            </div>
          </div>

          {/* Section 2: Items to return */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-medium text-black">Items to return</label>
              <span className="text-[11px] text-[#666666]">
                {selectedItems.length} items selected
              </span>
            </div>

            <div className="rounded-lg border border-[#EAEAEA] overflow-hidden bg-white">
              {/* Table header */}
              <div className="grid grid-cols-12 items-center bg-[#FAFAFA] border-b border-[#EAEAEA] py-2 px-3 text-[11px] font-medium text-[#666666]">
                <div className="col-span-6">Product</div>
                <div className="col-span-2 text-center">Fulfilled</div>
                <div className="col-span-2 text-center">Return qty.</div>
                <div className="col-span-2 text-right">Unit price</div>
              </div>

              {/* Items rows */}
              <div className="divide-y divide-[#EAEAEA]">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "grid grid-cols-12 items-center py-2.5 px-3 text-[12px] transition-colors",
                      item.selected ? "bg-white" : "bg-neutral-50/40"
                    )}
                  >
                    {/* Product & checkbox */}
                    <div className="col-span-6 flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleItem(item.id)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-[#BDBDBD] accent-black cursor-pointer"
                      />
                      <div>
                        <div className="font-medium text-black leading-tight">{item.title}</div>
                        <div className="text-[11px] text-[#666666]">
                          {item.variant} · {item.sku}
                        </div>
                      </div>
                    </div>

                    {/* Fulfilled qty */}
                    <div className="col-span-2 text-center text-[#666666] font-medium">
                      {item.fulfilledQty}
                    </div>

                    {/* Return qty stepper */}
                    <div className="col-span-2 flex items-center justify-center">
                      <div className="inline-flex items-center border border-[#EAEAEA] rounded-md overflow-hidden bg-white">
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, -1)}
                          disabled={item.returnQty <= 0}
                          className="h-6 w-6 flex items-center justify-center text-[#666666] hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-white cursor-pointer"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center text-[11px] font-semibold text-black">
                          {item.returnQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, 1)}
                          disabled={item.returnQty >= item.fulfilledQty}
                          className="h-6 w-6 flex items-center justify-center text-[#666666] hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-white cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Unit price */}
                    <div className="col-span-2 text-right font-medium text-black">
                      ${item.unitPrice.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-[#666666] leading-tight">
              Only fulfilled items are eligible. Quantities cannot exceed the amount available to
              return.
            </p>
          </div>

          {/* Section 3: Return reason */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-black">Return reason</label>
            <select
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className="w-full h-[36px] px-3 rounded-lg border border-[#EAEAEA] bg-white text-[12px] text-black focus:outline-none focus:border-black cursor-pointer"
            >
              <option value="Size or fit issue">Size or fit issue</option>
              <option value="Damaged in transit">Damaged in transit</option>
              <option value="Defective item">Defective item</option>
              <option value="Color mismatch">Color mismatch</option>
              <option value="Incorrect item sent">Incorrect item sent</option>
              <option value="Customer changed mind">Customer changed mind</option>
            </select>
            <p className="text-[11px] text-[#666666]">Applies to all selected items.</p>
          </div>

          {/* Section 4: Notes (optional) */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-black">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add details for the team handling this return..."
              rows={3}
              className="w-full p-3 rounded-lg border border-[#EAEAEA] bg-white text-[12px] text-black placeholder:text-[#999999] focus:outline-none focus:border-black resize-none"
            />
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="border-t border-[#EAEAEA] p-4 bg-white flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-[13px] font-semibold text-black">
              {totalUnits} units · ${totalValue.toFixed(2)} item value
            </div>
            <div className="text-[11px] text-[#666666]">
              Creating a return does not issue a refund.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-[34px] px-3.5 rounded-lg border border-[#EAEAEA] bg-white text-[12px] font-semibold text-black hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={totalUnits === 0}
              className="h-[34px] px-4 rounded-lg bg-[#111111] hover:bg-black text-white text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Return</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};
