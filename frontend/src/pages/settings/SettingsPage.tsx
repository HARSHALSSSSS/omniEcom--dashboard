import { useState, useEffect } from "react";
import { Plus, Trash2, Check, Save } from "lucide-react";
import {
  MOCK_BUSINESS_SETTINGS,
  MOCK_GSTIN_ENTRIES,
  MOCK_OPERATIONAL_PREFERENCES,
} from "@/mocks/data/settings.data";
import type {
  BusinessSettings,
  GstinEntry,
  OperationalPreferences,
} from "@/types/settings";
import { usePlatformSettings } from "@/hooks/usePlatform";

export default function SettingsPage() {
  const { data: serverSettings } = usePlatformSettings();
  const [activeTab, setActiveTab] = useState<
    "business" | "gstin" | "operations" | "notifications"
  >("business");

  // Editable states
  const [business, setBusiness] = useState<BusinessSettings>(
    MOCK_BUSINESS_SETTINGS,
  );
  const [gstinList, setGstinList] = useState<GstinEntry[]>(MOCK_GSTIN_ENTRIES);
  const [preferences, setPreferences] = useState<OperationalPreferences>(
    MOCK_OPERATIONAL_PREFERENCES,
  );

  useEffect(() => {
    if (serverSettings) {
      if (serverSettings.business) setBusiness(serverSettings.business);
      if (serverSettings.gstin) setGstinList(serverSettings.gstin);
      if (serverSettings.preferences) setPreferences(serverSettings.preferences);
    }
  }, [serverSettings]);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [showAddGstinModal, setShowAddGstinModal] = useState(false);

  // New GSTIN form
  const [newGstState, setNewGstState] = useState("");
  const [newGstNumber, setNewGstNumber] = useState("");
  const [newGstAddress, setNewGstAddress] = useState("");

  const markChanged = () => {
    if (!hasUnsavedChanges) setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    setHasUnsavedChanges(false);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  };

  const handleReset = () => {
    setBusiness(MOCK_BUSINESS_SETTINGS);
    setGstinList(MOCK_GSTIN_ENTRIES);
    setPreferences(MOCK_OPERATIONAL_PREFERENCES);
    setHasUnsavedChanges(false);
  };

  const handleAddGstin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGstState.trim() || !newGstNumber.trim()) return;

    const entry: GstinEntry = {
      id: `gst-${Date.now()}`,
      state: newGstState,
      stateCode: newGstNumber.slice(0, 2),
      gstin: newGstNumber.toUpperCase(),
      legalTradeName: business.legalEntityName,
      isDefault: gstinList.length === 0,
      registeredAddress: newGstAddress || "Warehouse & Office facility",
    };

    setGstinList([...gstinList, entry]);
    setShowAddGstinModal(false);
    setNewGstState("");
    setNewGstNumber("");
    setNewGstAddress("");
    markChanged();
  };

  const handleDeleteGstin = (id: string) => {
    setGstinList(gstinList.filter((g) => g.id !== id));
    markChanged();
  };

  return (
    <div className="flex flex-col gap-6 w-full select-none pb-24 font-['Inter',sans-serif]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAEAEA] pb-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-semibold text-[#000000] tracking-tight">
            Workspace &amp; Regional Settings
          </h1>
          <p className="text-[13px] text-[#666666]">
            Manage legal entities, multi-state GSTIN registrations, operational safety
            buffers, and system notifications.
          </p>
        </div>

        {/* Setting Navigation Pills */}
        <div className="inline-flex items-center bg-neutral-100 p-1 rounded-lg border border-[#EAEAEA]">
          <button
            type="button"
            onClick={() => setActiveTab("business")}
            className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              activeTab === "business"
                ? "bg-white text-black shadow-xs font-semibold"
                : "text-[#666666] hover:text-black"
            }`}
          >
            Business &amp; Regional
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("gstin")}
            className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              activeTab === "gstin"
                ? "bg-white text-black shadow-xs font-semibold"
                : "text-[#666666] hover:text-black"
            }`}
          >
            GSTIN Registrations ({gstinList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("operations")}
            className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              activeTab === "operations"
                ? "bg-white text-black shadow-xs font-semibold"
                : "text-[#666666] hover:text-black"
            }`}
          >
            Operational Buffers
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("notifications")}
            className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              activeTab === "notifications"
                ? "bg-white text-black shadow-xs font-semibold"
                : "text-[#666666] hover:text-black"
            }`}
          >
            Alert Preferences
          </button>
        </div>
      </div>

      {/* Tab 1: Business Profile & Regional Formats */}
      {activeTab === "business" && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6 shadow-2xs flex flex-col gap-6">
          <div className="border-b border-[#EAEAEA] pb-3">
            <h2 className="text-[15px] font-semibold text-[#000000]">
              Legal Entity &amp; Regional Localization
            </h2>
            <p className="text-[12px] text-[#666666]">
              Configured company identification printed on commercial invoices and shipping labels.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-[12px]">
            <div>
              <label className="block text-[11px] font-medium text-[#666666] mb-1">
                Legal Entity Name
              </label>
              <input
                type="text"
                value={business.legalEntityName}
                onChange={(e) => {
                  setBusiness({ ...business, legalEntityName: e.target.value });
                  markChanged();
                }}
                className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#666666] mb-1">
                Display Brand Name
              </label>
              <input
                type="text"
                value={business.brandName}
                onChange={(e) => {
                  setBusiness({ ...business, brandName: e.target.value });
                  markChanged();
                }}
                className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#666666] mb-1">
                Corporate Identification / PAN
              </label>
              <input
                type="text"
                value={business.cinOrPan}
                onChange={(e) => {
                  setBusiness({ ...business, cinOrPan: e.target.value });
                  markChanged();
                }}
                className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px] font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#666666] mb-1">
                Customer Care Support Email
              </label>
              <input
                type="email"
                value={business.supportEmail}
                onChange={(e) => {
                  setBusiness({ ...business, supportEmail: e.target.value });
                  markChanged();
                }}
                className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px]"
              />
            </div>
          </div>

          <div className="border-t border-[#EAEAEA] pt-4">
            <h3 className="text-[13px] font-semibold text-[#000000] mb-3">
              Regional Currencies &amp; Number Systems
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-[12px]">
              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  Operating Currency
                </label>
                <input
                  type="text"
                  disabled
                  value={business.currency}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px] bg-neutral-100 text-neutral-600 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  Number System Format
                </label>
                <select
                  value={business.numberFormat}
                  onChange={(e) => {
                    setBusiness({
                      ...business,
                      numberFormat: e.target.value as "lakhs" | "millions",
                    });
                    markChanged();
                  }}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px] bg-white"
                >
                  <option value="lakhs">Indian System (Lakhs &amp; Crores · ₹2.84L)</option>
                  <option value="millions">International System (Millions · ₹284K)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  Timezone
                </label>
                <input
                  type="text"
                  disabled
                  value={business.timezone}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px] bg-neutral-100 text-neutral-600 cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Multi-State GSTIN Table */}
      {activeTab === "gstin" && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-[#EAEAEA] flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-[#000000]">
                State GSTIN Tax Registrations
              </h2>
              <p className="text-[11px] text-[#666666]">
                Enables multi-warehouse fulfillment and interstate GSTR-1 compliant invoicing.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddGstinModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-[12px] font-semibold rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add State GSTIN
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-[#EAEAEA] text-[#666666] font-medium text-[11px]">
                  <th className="py-3 px-4">State &amp; Code</th>
                  <th className="py-3 px-4">GST Identification Number</th>
                  <th className="py-3 px-4">Registered Facility Address</th>
                  <th className="py-3 px-4 text-center">Default State</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {gstinList.map((g) => (
                  <tr key={g.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-[#000000]">
                      {g.state} ({g.stateCode})
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-blue-600">
                      {g.gstin}
                    </td>
                    <td className="py-3.5 px-4 text-[#666666] max-w-sm truncate">
                      {g.registeredAddress}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {g.isDefault ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Primary Entity
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#888888]">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {!g.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleDeleteGstin(g.id)}
                          className="text-red-500 hover:text-red-700 p-1 rounded"
                          title="Delete registration"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Operational Buffers */}
      {activeTab === "operations" && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6 shadow-2xs flex flex-col gap-6">
          <div className="border-b border-[#EAEAEA] pb-3">
            <h2 className="text-[15px] font-semibold text-[#000000]">
              Inventory Safety Buffers &amp; Fulfillment Guardrails
            </h2>
            <p className="text-[12px] text-[#666666]">
              Automated rules to protect against overselling during sudden flash sale surges.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[12px]">
            <div className="border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-[#000000]">
                Marketplace Safety Buffer
              </span>
              <p className="text-[11px] text-[#666666]">
                Percentage of stock held in reserve and hidden from Amazon/Flipkart feeds.
              </p>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="number"
                  value={preferences.defaultInventoryBufferPercent}
                  onChange={(e) => {
                    setPreferences({
                      ...preferences,
                      defaultInventoryBufferPercent: Number(e.target.value) || 0,
                    });
                    markChanged();
                  }}
                  className="w-24 px-3 py-1.5 border border-[#EAEAEA] rounded-lg text-[13px]"
                />
                <span className="font-semibold text-[#000000]">% stock reserve</span>
              </div>
            </div>

            <div className="border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-[#000000]">
                Low Stock Warning Trigger
              </span>
              <p className="text-[11px] text-[#666666]">
                Global unit count threshold before an item appears in the Needs Attention queue.
              </p>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="number"
                  value={preferences.lowStockThresholdUnits}
                  onChange={(e) => {
                    setPreferences({
                      ...preferences,
                      lowStockThresholdUnits: Number(e.target.value) || 0,
                    });
                    markChanged();
                  }}
                  className="w-24 px-3 py-1.5 border border-[#EAEAEA] rounded-lg text-[13px]"
                />
                <span className="font-semibold text-[#000000]">units remaining</span>
              </div>
            </div>

            <div className="border border-[#EAEAEA] rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[13px] font-semibold text-[#000000] block">
                  Automatic Order Ingestion Acknowledgment
                </span>
                <span className="text-[11px] text-[#666666]">
                  Acknowledge orders immediately upon marketplace webhook arrival.
                </span>
              </div>
              <input
                type="checkbox"
                checked={preferences.autoAcknowledgeOrders}
                onChange={(e) => {
                  setPreferences({
                    ...preferences,
                    autoAcknowledgeOrders: e.target.checked,
                  });
                  markChanged();
                }}
                className="h-4 w-4 rounded accent-black"
              />
            </div>

            <div className="border border-[#EAEAEA] rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[13px] font-semibold text-[#000000] block">
                  Commerce Copilot Advisory Features
                </span>
                <span className="text-[11px] text-[#666666]">
                  Display prescriptive AI suggestions across catalog and pricing.
                </span>
              </div>
              <input
                type="checkbox"
                checked={preferences.enableAdvisoryAI}
                onChange={(e) => {
                  setPreferences({
                    ...preferences,
                    enableAdvisoryAI: e.target.checked,
                  });
                  markChanged();
                }}
                className="h-4 w-4 rounded accent-black"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Alert Preferences */}
      {activeTab === "notifications" && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6 shadow-2xs flex flex-col gap-5">
          <div className="border-b border-[#EAEAEA] pb-3">
            <h2 className="text-[15px] font-semibold text-[#000000]">
              Dispatch &amp; Alert Routing
            </h2>
            <p className="text-[12px] text-[#666666]">
              Choose which operational events trigger high-priority alerts.
            </p>
          </div>

          <div className="space-y-4 text-[13px]">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked
                onChange={markChanged}
                className="h-4 w-4 rounded accent-black"
              />
              <span>Marketplace dispatch SLA breaches (&lt; 45 minutes remaining)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked
                onChange={markChanged}
                className="h-4 w-4 rounded accent-black"
              />
              <span>Critical SKU stockouts and inventory runway expiration warnings</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked
                onChange={markChanged}
                className="h-4 w-4 rounded accent-black"
              />
              <span>Channel API token renewals &amp; marketplace sync failures</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked
                onChange={markChanged}
                className="h-4 w-4 rounded accent-black"
              />
              <span>New return requests &amp; reverse logistics inspection items</span>
            </label>
          </div>
        </div>
      )}

      {/* Sticky Unsaved Changes Bar */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-neutral-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-5 border border-neutral-700 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-[12px] font-medium">
            You have unsaved changes in your settings.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1 text-[11px] text-neutral-300 hover:text-white transition-colors"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white text-black text-[12px] font-semibold rounded-full hover:bg-neutral-200 transition-colors shadow-xs"
            >
              <Save className="h-3.5 w-3.5" />
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {showSavedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-black text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-[12px] animate-in fade-in slide-in-from-bottom-2">
          <Check className="h-4 w-4 text-emerald-400" />
          Settings successfully updated.
        </div>
      )}

      {/* Add GSTIN Modal */}
      {showAddGstinModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
              <h3 className="text-[16px] font-semibold text-[#000000]">
                Register State GSTIN
              </h3>
              <button
                type="button"
                onClick={() => setShowAddGstinModal(false)}
                className="text-neutral-400 hover:text-black"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddGstin} className="flex flex-col gap-4 text-[12px]">
              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  State Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tamil Nadu"
                  value={newGstState}
                  onChange={(e) => setNewGstState(e.target.value)}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  15-Digit GSTIN
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 33AABCN8412P1ZD"
                  value={newGstNumber}
                  onChange={(e) => setNewGstNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px] font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  Registered Address
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Industrial Estate, Guindy, Chennai"
                  value={newGstAddress}
                  onChange={(e) => setNewGstAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#EAEAEA]">
                <button
                  type="button"
                  onClick={() => setShowAddGstinModal(false)}
                  className="px-4 py-2 border border-[#EAEAEA] rounded-lg text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-black text-white font-semibold rounded-lg hover:bg-neutral-800"
                >
                  Save Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
