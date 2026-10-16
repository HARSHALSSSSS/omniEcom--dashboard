import { useState } from "react";
import { Truck, Plus } from "lucide-react";
import {
  MOCK_SUPPLIERS,
  MOCK_PURCHASE_ORDERS,
} from "@/mocks/data/phase10.data";
import type { Supplier, PurchaseOrder } from "@/types/procurement";
import { formatINR } from "@/utils/format";

export default function ProcurementPage() {
  const [activeTab, setActiveTab] = useState<"orders" | "suppliers">("orders");
  const [orders, setOrders] = useState<PurchaseOrder[]>(MOCK_PURCHASE_ORDERS);
  const [suppliers, setSuppliers] = useState<Supplier[]>(MOCK_SUPPLIERS);
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);

  // New PO state
  const [selectedSupplierId, setSelectedSupplierId] = useState(
    suppliers[0]?.id || "",
  );
  const [poQty, setPoQty] = useState("100");
  const [poNotes, setPoNotes] = useState("");

  // New Supplier state
  const [newSupName, setNewSupName] = useState("");
  const [newSupContact, setNewSupContact] = useState("");
  const [newSupCity, setNewSupCity] = useState("");
  const [newSupLeadTime, setNewSupLeadTime] = useState("14");

  const handleCreatePO = (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === selectedSupplierId);
    if (!sup) return;

    const count = Number(poQty) || 50;
    const newPO: PurchaseOrder = {
      id: `po-${Date.now()}`,
      poNumber: `PO-2026-00${orders.length + 50}`,
      supplierId: sup.id,
      supplierName: sup.name,
      warehouseLocation: "Mumbai Hub B2",
      status: "submitted",
      itemsCount: count,
      totalAmount: count * 1250,
      currency: "INR",
      orderDate: new Date().toISOString().split("T")[0],
      expectedDeliveryDate: "2026-10-31",
      notes: poNotes || "Stock replenishment from Procurement Center",
      lineItems: [
        {
          id: `li-${Date.now()}`,
          productId: "prod-1",
          productName: "Premium Travel Bag (Midnight Black)",
          sku: "TRV-1042-BLK",
          quantityOrdered: count,
          quantityReceived: 0,
          unitCost: 1250,
          totalCost: count * 1250,
        },
      ],
    };

    setOrders([newPO, ...orders]);
    setShowCreatePO(false);
    setPoNotes("");
  };

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupName.trim()) return;

    const created: Supplier = {
      id: `sup-${Date.now()}`,
      name: newSupName,
      code: `SUP-${newSupName.slice(0, 3).toUpperCase()}-0${suppliers.length + 1}`,
      contactPerson: newSupContact || "Manager",
      email: `${newSupName.toLowerCase().replace(/\s+/g, "")}@supply.in`,
      phone: "+91 98000 12345",
      leadTimeDays: Number(newSupLeadTime) || 14,
      paymentTerms: "Net 30",
      activeSkusCount: 0,
      rating: 4.7,
      city: newSupCity || "Mumbai",
      status: "active",
    };

    setSuppliers([...suppliers, created]);
    setShowAddSupplier(false);
    setNewSupName("");
    setNewSupContact("");
    setNewSupCity("");
  };

  return (
    <div className="flex flex-col gap-6 w-full select-none pb-12 font-['Inter',sans-serif]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAEAEA] pb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold text-[#000000] tracking-tight">
              Procurement &amp; Inbound
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
              <Truck className="h-3 w-3" />
              Automated Reorder Pipeline
            </span>
          </div>
          <p className="text-[13px] text-[#666666]">
            Manage vendor relations, generate purchase orders (POs), and track warehouse
            inbound shipments before stockouts occur.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center bg-neutral-100 p-1 rounded-lg border border-[#EAEAEA]">
            <button
              type="button"
              onClick={() => setActiveTab("orders")}
              className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                activeTab === "orders"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              Purchase Orders ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("suppliers")}
              className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                activeTab === "suppliers"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              Suppliers ({suppliers.length})
            </button>
          </div>

          {activeTab === "orders" ? (
            <button
              type="button"
              onClick={() => setShowCreatePO(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-black text-white text-[12px] font-semibold rounded-lg hover:bg-neutral-800 transition-colors shadow-2xs"
            >
              <Plus className="h-4 w-4" />
              Create Purchase Order
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddSupplier(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-black text-white text-[12px] font-semibold rounded-lg hover:bg-neutral-800 transition-colors shadow-2xs"
            >
              <Plus className="h-4 w-4" />
              Add Supplier
            </button>
          )}
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-1 shadow-2xs">
          <span className="text-[11px] text-[#666666] uppercase font-medium">
            Active Purchase Orders
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            {orders.filter((o) => o.status !== "received").length}
          </span>
          <span className="text-[11px] text-blue-600 font-medium">
            In-transit / Pending QC
          </span>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-1 shadow-2xs">
          <span className="text-[11px] text-[#666666] uppercase font-medium">
            Committed Inventory
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            {orders.reduce((sum, o) => sum + o.itemsCount, 0)} units
          </span>
          <span className="text-[11px] text-[#666666]">
            Replenishment expected
          </span>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-1 shadow-2xs">
          <span className="text-[11px] text-[#666666] uppercase font-medium">
            Total Inbound Value
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            {formatINR(orders.reduce((sum, o) => sum + o.totalAmount, 0))}
          </span>
          <span className="text-[11px] text-emerald-600 font-medium">
            Across 3 warehouses
          </span>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-1 shadow-2xs">
          <span className="text-[11px] text-[#666666] uppercase font-medium">
            Active Suppliers
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            {suppliers.length} vendors
          </span>
          <span className="text-[11px] text-[#666666]">
            Avg lead time: 15 days
          </span>
        </div>
      </div>

      {/* Tab 1: Purchase Orders Table */}
      {activeTab === "orders" && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-[#EAEAEA] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#000000]">
              Inbound Purchase Order Registry
            </span>
            <span className="text-[11px] text-[#666666]">
              Real-time delivery status &amp; gate checks
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="bg-neutral-50/75 border-b border-[#EAEAEA] text-[#666666] font-medium text-[11px]">
                  <th className="py-3 px-4">PO Number</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Destination</th>
                  <th className="py-3 px-4 text-right">Units</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4">Expected Date</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {orders.map((po) => (
                  <tr key={po.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-semibold text-blue-600">
                      {po.poNumber}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-[#000000]">
                      {po.supplierName}
                    </td>
                    <td className="py-3.5 px-4 text-[#666666]">
                      {po.warehouseLocation}
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-[#000000]">
                      {po.itemsCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-[#000000]">
                      {formatINR(po.totalAmount)}
                    </td>
                    <td className="py-3.5 px-4 text-[#666666] text-[11px]">
                      {po.expectedDeliveryDate}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          po.status === "received"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : po.status === "partially_received"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}
                      >
                        {po.status.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Suppliers Table */}
      {activeTab === "suppliers" && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-[#EAEAEA] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#000000]">
              Qualified Vendors &amp; Manufacturers
            </span>
            <span className="text-[11px] text-[#666666]">
              Performance scorecards and contact details
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="bg-neutral-50/75 border-b border-[#EAEAEA] text-[#666666] font-medium text-[11px]">
                  <th className="py-3 px-4">Supplier Name</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4 text-center">Lead Time</th>
                  <th className="py-3 px-4">Payment Terms</th>
                  <th className="py-3 px-4 text-center">Rating</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {suppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-[#000000]">
                          {sup.name}
                        </span>
                        <span className="text-[11px] text-[#666666] font-mono">
                          {sup.code}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-[#666666]">{sup.city}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <span className="text-[#000000]">{sup.contactPerson}</span>
                        <span className="text-[11px] text-[#666666]">
                          {sup.email}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-medium text-[#000000]">
                      {sup.leadTimeDays} days
                    </td>
                    <td className="py-3.5 px-4 text-[#666666]">
                      {sup.paymentTerms}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="font-bold text-amber-600">
                        ★ {sup.rating}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {sup.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create PO Modal */}
      {showCreatePO && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
              <h3 className="text-[16px] font-semibold text-[#000000]">
                Issue Purchase Order
              </h3>
              <button
                type="button"
                onClick={() => setShowCreatePO(false)}
                className="text-neutral-400 hover:text-black"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePO} className="flex flex-col gap-4 text-[12px]">
              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  Select Supplier
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px] bg-white"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.city})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  Replenishment Quantity (Units)
                </label>
                <input
                  type="number"
                  required
                  value={poQty}
                  onChange={(e) => setPoQty(e.target.value)}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  PO Notes / Delivery Instructions
                </label>
                <textarea
                  rows={3}
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                  placeholder="e.g. Expedited festive batch delivery requested."
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#EAEAEA]">
                <button
                  type="button"
                  onClick={() => setShowCreatePO(false)}
                  className="px-4 py-2 border border-[#EAEAEA] rounded-lg text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-black text-white font-semibold rounded-lg hover:bg-neutral-800"
                >
                  Submit Purchase Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddSupplier && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
              <h3 className="text-[16px] font-semibold text-[#000000]">
                Register New Supplier
              </h3>
              <button
                type="button"
                onClick={() => setShowAddSupplier(false)}
                className="text-neutral-400 hover:text-black"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSupplier} className="flex flex-col gap-4 text-[12px]">
              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  Supplier / Company Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Deccan Mills Private Limited"
                  value={newSupName}
                  onChange={(e) => setNewSupName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#666666] mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Vivek R."
                    value={newSupContact}
                    onChange={(e) => setNewSupContact(e.target.value)}
                    className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#666666] mb-1">
                    City / Hub
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Coimbatore"
                    value={newSupCity}
                    onChange={(e) => setNewSupCity(e.target.value)}
                    className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  Standard Lead Time (Days)
                </label>
                <input
                  type="number"
                  value={newSupLeadTime}
                  onChange={(e) => setNewSupLeadTime(e.target.value)}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#EAEAEA]">
                <button
                  type="button"
                  onClick={() => setShowAddSupplier(false)}
                  className="px-4 py-2 border border-[#EAEAEA] rounded-lg text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-black text-white font-semibold rounded-lg hover:bg-neutral-800"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
