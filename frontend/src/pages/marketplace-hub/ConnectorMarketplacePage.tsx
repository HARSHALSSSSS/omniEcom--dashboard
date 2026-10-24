import { useState, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, X, Radar, ArrowRight } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useConnectorDirectory, useConnections } from "@/hooks/useConnectors";
import type { ConnectorDirectoryItem } from "@/types/connection";
import { LoadError } from "@/components/marketplace-hub/accounts/hubUi";
import { WRITE_REASON } from "@/components/marketplace-hub/accounts/hubFormat";
import { ConnectorCardItem } from "./components/ConnectorCardItem";
import { ConnectorPreviewDrawer } from "./components/ConnectorPreviewDrawer";
import { ConnectorCompareModal } from "./components/ConnectorCompareModal";
import { CAPABILITY_LABEL, FEE_NOTE, loadBookmarks, saveBookmarks } from "./components/connectorFacts";
import { isConnectedConnection } from "./components/channelRows";

/** category tab -> the directory categories it shows. Tabs without a connector in the directory stay and show an honest empty state. */
const CATEGORY_TABS = [
  { id: "all", label: "All", categories: ["marketplace", "storefront", "shipping"] },
  { id: "marketplace", label: "Marketplaces", categories: ["marketplace"] },
  { id: "commerce", label: "Commerce", categories: ["storefront"] },
  { id: "shipping", label: "Shipping", categories: ["shipping"] },
  { id: "operations", label: "Operations", categories: [] as string[] },
  { id: "social", label: "Social Commerce", categories: [] as string[] },
  { id: "other", label: "Other", categories: [] as string[] },
];

const I_NEED_OPTIONS = [
  { id: "product_import", label: "Product import" },
  { id: "listings", label: "Product listing" },
  { id: "inventory", label: "Inventory sync" },
  { id: "orders", label: "Orders" },
  { id: "shipping", label: "Shipping" },
  { id: "returns", label: "Returns" },
  { id: "reviews", label: "Reviews" },
  { id: "promotions", label: "Promotions" },
];

const STATUS_OPTIONS = [
  { id: "all", label: "All" },
  { id: "connected", label: "Connected" },
  { id: "needs_attention", label: "Needs attention" },
  { id: "available", label: "Not connected" },
];

const AVAILABILITY_OPTIONS = [
  { id: "all", label: "All" },
  { id: "now", label: "Available now" },
  { id: "partner", label: "Partner approval required" },
  { id: "unavailable", label: "Not available yet" },
];

type SortId = "recommended" | "name" | "status";
const SORT_OPTIONS: Array<{ id: SortId; label: string }> = [
  { id: "recommended", label: "Recommended" },
  { id: "name", label: "Name A-Z" },
  { id: "status", label: "Connection status" },
];

const STATUS_RANK: Record<ConnectorDirectoryItem["status"], number> = { available: 0, needs_attention: 1, connected: 2, unavailable: 3 };

const MENU = "absolute left-0 top-full mt-1.5 z-30 rounded-xl border border-[#E5E5E5] bg-[#FFFFFF] p-1.5 shadow-xl space-y-0.5 text-[12px]";
const TRIGGER = "h-8 px-3 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 transition-colors";

function ChoiceMenu<T extends string>({
  label,
  value,
  options,
  isOpen,
  onToggle,
  onPick,
  width = "w-48",
  showValue = false,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  isOpen: boolean;
  onToggle: () => void;
  onPick: (id: T) => void;
  width?: string;
  showValue?: boolean;
}) {
  const current = options.find((o) => o.id === value);
  const active = value !== options[0].id;
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={onToggle}
        className={`${TRIGGER} ${active ? "border-[#111111] bg-[#F5F5F5] text-[#111111]" : "border-[#D4D4D4] bg-[#FFFFFF] text-[#111111] hover:bg-[#F9F9F9]"}`}
      >
        {active || showValue ? `${label}: ${current?.label}` : label} <ChevronDown className="h-3.5 w-3.5 text-[#737373]" />
      </button>
      {isOpen && (
        <div role="menu" className={`${MENU} ${width}`}>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === o.id}
              onClick={() => onPick(o.id)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg ${value === o.id ? "bg-[#F5F5F5] font-semibold text-[#111111]" : "text-[#525252] hover:bg-[#F9F9F9]"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConnectorMarketplacePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canConnect = useCan("marketplace_accounts:write");

  const directory = useConnectorDirectory();
  const connectionsQuery = useConnections();
  const connectors = useMemo(() => directory.data ?? [], [directory.data]);
  const connections = useMemo(() => connectionsQuery.data?.data ?? [], [connectionsQuery.data]);

  // Filters live in the URL so a reload or a shared link shows the same list
  const searchTerm = params.get("q") ?? "";
  const activeTab = CATEGORY_TABS.some((t) => t.id === params.get("tab")) ? (params.get("tab") as string) : "all";
  const statusFilter = STATUS_OPTIONS.some((o) => o.id === params.get("status")) ? (params.get("status") as string) : "all";
  const availFilter = AVAILABILITY_OPTIONS.some((o) => o.id === params.get("avail")) ? (params.get("avail") as string) : "all";
  const sortBy: SortId = SORT_OPTIONS.some((o) => o.id === params.get("sort")) ? (params.get("sort") as SortId) : "recommended";
  const selectedCapabilities = useMemo(() => (params.get("need") ?? "").split(",").filter((c) => I_NEED_OPTIONS.some((o) => o.id === c)), [params]);

  const setFilter = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) {
        if (v && v !== "all") next.set(k, v);
        else next.delete(k);
      }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const [openMenu, setOpenMenu] = useState<null | "category" | "need" | "status" | "availability" | "subscription" | "sort">(null);
  const toggleMenu = (m: NonNullable<typeof openMenu>) => setOpenMenu((cur) => (cur === m ? null : m));

  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [compareNotice, setCompareNotice] = useState<string | null>(null);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<string[]>(() => loadBookmarks());

  const previewConnector = connectors.find((c) => c.id === previewId) ?? null;
  const connectionOf = useCallback((id: string) => connections.find((c) => c.connectorId === id), [connections]);
  const previewConnection = previewConnector ? (connectionOf(previewConnector.id) ?? null) : null;

  // only channels the business sells through now (connected, paused, needing attention); a disconnected one is not "connected"
  const sellingConnections = useMemo(() => connections.filter(isConnectedConnection), [connections]);
  const connectedCount = sellingConnections.length;
  const connectedNames = useMemo(() => {
    const names = sellingConnections.map((c) => c.name).filter(Boolean);
    if (names.length <= 1) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }, [sellingConnections]);

  // the first connector the business can connect and has not connected yet
  const recommendedConnector = useMemo(() => {
    const open = connectors.filter((c) => c.status === "available" && !c.isPartnerGated);
    return open[0] ?? connectors.find((c) => c.status === "available") ?? null;
  }, [connectors]);
  const recommendedCapabilitiesText = recommendedConnector?.capabilities.map((c) => CAPABILITY_LABEL[c] ?? c).slice(0, 4).join(" · ") ?? "";

  const toggleCompare = (id: string) => {
    setCompareNotice(null);
    if (selectedForCompare.includes(id)) {
      setSelectedForCompare(selectedForCompare.filter((x) => x !== id));
    } else if (selectedForCompare.length >= 3) {
      setCompareNotice("You can compare up to 3 connectors at once.");
    } else {
      setSelectedForCompare([...selectedForCompare, id]);
    }
  };

  const toggleBookmark = (id: string) => {
    const next = bookmarks.includes(id) ? bookmarks.filter((b) => b !== id) : [...bookmarks, id];
    setBookmarks(next);
    saveBookmarks(next);
  };

  const toggleCapability = (cap: string) =>
    setFilter({ need: (selectedCapabilities.includes(cap) ? selectedCapabilities.filter((c) => c !== cap) : [...selectedCapabilities, cap]).join(",") || null });

  const filteredConnectors = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const tab = CATEGORY_TABS.find((t) => t.id === activeTab) ?? CATEGORY_TABS[0];
    const list = connectors.filter((item) => {
      if (q && !`${item.name} ${item.description} ${item.id} ${item.capabilities.join(" ")} ${item.category}`.toLowerCase().includes(q)) return false;
      if (!tab.categories.includes(item.category)) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (availFilter === "now" && item.status === "unavailable") return false;
      if (availFilter === "unavailable" && item.status !== "unavailable") return false;
      if (availFilter === "partner" && !item.isPartnerGated) return false;
      if (selectedCapabilities.length > 0 && !selectedCapabilities.every((cap) => (item.capabilities as string[]).includes(cap))) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      return byStatus !== 0 ? byStatus : a.name.localeCompare(b.name);
    });
  }, [connectors, searchTerm, activeTab, statusFilter, availFilter, selectedCapabilities, sortBy]);

  const compareItems = useMemo(() => connectors.filter((c) => selectedForCompare.includes(c.id)), [connectors, selectedForCompare]);
  const hasFilters = Boolean(searchTerm || activeTab !== "all" || statusFilter !== "all" || availFilter !== "all" || selectedCapabilities.length || sortBy !== "recommended");
  const clearFilters = () => setParams({}, { replace: true });

  const connect = (id: string) => navigate(`${ROUTES.MARKETPLACE_HUB}/connect/${id}`);
  const manage = (id: string) => {
    const conn = connectionOf(id);
    navigate(conn ? `${ROUTES.MARKETPLACE_HUB}?q=${encodeURIComponent(conn.name)}` : ROUTES.MARKETPLACE_HUB);
  };

  const supportingNeeded =
    selectedCapabilities.length > 0
      ? `${filteredConnectors.length} connector${filteredConnectors.length === 1 ? "" : "s"} support ${selectedCapabilities.map((k) => I_NEED_OPTIONS.find((o) => o.id === k)?.label ?? k).join(" + ")}`
      : null;
  const connectedInList = filteredConnectors.filter((c) => c.status === "connected").length;

  return (
    <div className="w-full space-y-6 pb-24 text-[#111111] animate-in fade-in duration-200" onClick={() => openMenu && setOpenMenu(null)}>
      {/* HEADER WITH ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">CONNECTORS</span>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight text-[#111111]">Expand your commerce network</h1>
          <p className="mt-1 text-[13px] text-[#666666]">Connect new marketplaces, commerce platforms and operational services as your business grows.</p>
        </div>

        <div className="flex flex-col sm:items-end gap-1.5">
          <div className="text-[12px] text-[#737373]">
            <span className="font-semibold text-[#111111]">Connected channels · {connectedCount}</span>
            <span className="ml-2 text-[#8A8A8A]">{connectors.length} in directory</span>
          </div>
          <button
            type="button"
            onClick={() => navigate(ROUTES.MARKETPLACE_HUB)}
            className="h-9 px-4 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors"
          >
            Manage connections
          </button>
        </div>
      </div>

      {!canConnect && (
        <p role="status" className="rounded-lg border border-[#EAEAEA] bg-[#F5F5F5] px-3 py-2 text-[12px] text-[#666666]">
          You have read-only access. You can browse and compare connectors. {WRITE_REASON}
        </p>
      )}

      {/* SEARCH */}
      <div className="relative w-full">
        <input
          type="text"
          aria-label="Search connectors"
          placeholder="Search marketplaces, capabilities or categories..."
          value={searchTerm}
          onChange={(e) => setFilter({ q: e.target.value || null })}
          className="w-full h-11 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] px-4 text-[13px] text-[#111111] placeholder:text-[#8A8A8A] focus:border-[#000000] focus:outline-none transition-colors"
        />
        {searchTerm && (
          <button type="button" aria-label="Clear search" onClick={() => setFilter({ q: null })} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8A8A8A] hover:text-[#111111]">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* CATEGORY TABS */}
      <div className="flex items-center gap-6 border-b border-[#E5E5E5] text-[13px] overflow-x-auto">
        {CATEGORY_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilter({ tab: tab.id })}
              className={`pb-3 font-medium transition-colors whitespace-nowrap relative ${isActive ? "text-[#111111] font-semibold" : "text-[#737373] hover:text-[#111111]"}`}
            >
              {tab.label}
              {isActive && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#000000]" />}
            </button>
          );
        })}
      </div>

      {/* RECOMMENDATION BANNER */}
      {!searchTerm && activeTab === "all" && recommendedConnector && (
        <div className="relative flex flex-col md:flex-row rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-6 gap-8">
          <div className="flex-1 space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#737373]">Expand your reach</span>
            <h2 className="text-[18px] font-bold text-[#111111]">{recommendedConnector.name}</h2>
            <p className="text-[12px] text-[#525252] leading-relaxed">{recommendedConnector.description}</p>
            {recommendedCapabilitiesText && <p className="text-[12px] text-[#737373] font-medium pt-0.5">{recommendedCapabilitiesText}</p>}
            <button type="button" onClick={() => setPreviewId(recommendedConnector.id)} className="text-[12px] font-semibold text-[#111111] hover:underline flex items-center gap-1 pt-1">
              View connector <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 border-t md:border-t-0 md:border-l border-[#E5E5E5] md:pl-8 pt-4 md:pt-0 space-y-2">
            <h4 className="text-[13px] font-bold text-[#111111]">Based on your connected channels</h4>
            <p className="text-[12px] text-[#525252] leading-relaxed">
              {connectedNames
                ? `You currently sell on ${connectedNames}. ${recommendedConnector.name} is not connected yet.`
                : `You have not connected a channel yet. ${recommendedConnector.name} is a good first channel to centralize your catalog, inventory and orders.`}
            </p>
          </div>
        </div>
      )}

      {/* AVAILABLE CONNECTORS + TOOLBAR */}
      <div className="space-y-4">
        <div>
          <h2 className="text-[18px] font-bold text-[#111111]">Available connectors</h2>
          <p className="text-[12px] text-[#737373] mt-0.5">Choose what you need. You can add connectors as your business grows.</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap items-center gap-2">
            <ChoiceMenu
              label="Category"
              value={activeTab}
              options={CATEGORY_TABS.map((t) => ({ id: t.id, label: t.label }))}
              isOpen={openMenu === "category"}
              onToggle={() => toggleMenu("category")}
              onPick={(id) => {
                setFilter({ tab: id });
                setOpenMenu(null);
              }}
            />

            {/* "I need" capability filter */}
            <div className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={openMenu === "need"}
                onClick={() => toggleMenu("need")}
                className={`${TRIGGER} ${selectedCapabilities.length > 0 ? "border-[#111111] bg-[#F5F5F5] text-[#111111]" : "border-[#D4D4D4] bg-[#FFFFFF] text-[#111111] hover:bg-[#F9F9F9]"}`}
              >
                {selectedCapabilities.length > 0 ? `I need: ${selectedCapabilities.map((k) => I_NEED_OPTIONS.find((o) => o.id === k)?.label ?? k).join(", ")}` : "I need"}{" "}
                <ChevronDown className="h-3.5 w-3.5 text-[#737373]" />
              </button>
              {openMenu === "need" && (
                <div className={`${MENU} w-56`}>
                  <div className="px-2 py-1 text-[11px] font-bold text-[#737373] uppercase tracking-wider">I need</div>
                  {I_NEED_OPTIONS.map((opt) => {
                    const supportedBy = connectors.filter((c) => (c.capabilities as string[]).includes(opt.id)).length;
                    return (
                      <label key={opt.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#F5F5F5] text-[12px] text-[#111111] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCapabilities.includes(opt.id)}
                          onChange={() => toggleCapability(opt.id)}
                          className="h-3.5 w-3.5 rounded border-[#D4D4D4] text-[#111111] focus:ring-0"
                        />
                        <span className="flex-1">{opt.label}</span>
                        <span className="text-[11px] text-[#8A8A8A]">{supportedBy}</span>
                      </label>
                    );
                  })}
                  {selectedCapabilities.length > 0 && (
                    <div className="border-t border-[#F0F0F0] pt-1">
                      <button type="button" onClick={() => setFilter({ need: null })} className="w-full text-left px-2 py-1 text-[11px] font-medium text-[#737373] hover:text-[#111111]">
                        Clear selection
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <ChoiceMenu
              label="Connection status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              isOpen={openMenu === "status"}
              onToggle={() => toggleMenu("status")}
              onPick={(id) => {
                setFilter({ status: id });
                setOpenMenu(null);
              }}
            />

            <ChoiceMenu
              label="Availability"
              value={availFilter}
              options={AVAILABILITY_OPTIONS}
              isOpen={openMenu === "availability"}
              onToggle={() => toggleMenu("availability")}
              onPick={(id) => {
                setFilter({ avail: id });
                setOpenMenu(null);
              }}
              width="w-60"
            />

            {/* Subscription: the platform has no connector billing, so this says so */}
            <div className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={openMenu === "subscription"}
                onClick={() => toggleMenu("subscription")}
                className={`${TRIGGER} border-[#D4D4D4] bg-[#FFFFFF] text-[#111111] hover:bg-[#F9F9F9]`}
              >
                Subscription <ChevronDown className="h-3.5 w-3.5 text-[#737373]" />
              </button>
              {openMenu === "subscription" && (
                <div role="status" className={`${MENU} w-64 p-3 text-[#525252]`}>
                  <p className="font-semibold text-[#111111]">Included in your workspace</p>
                  <p className="mt-1 text-[11px] leading-relaxed">{FEE_NOTE} Every connector in the directory is covered by your workspace.</p>
                </div>
              )}
            </div>
          </div>

          <ChoiceMenu
            label="Sort"
            showValue
            value={sortBy}
            options={SORT_OPTIONS}
            isOpen={openMenu === "sort"}
            onToggle={() => toggleMenu("sort")}
            onPick={(id) => {
              setFilter({ sort: id });
              setOpenMenu(null);
            }}
          />
        </div>

        <div className="flex items-center justify-between text-[12px] text-[#737373] pt-1">
          <div>
            {supportingNeeded ?? (
              <span>
                {filteredConnectors.length} connector{filteredConnectors.length === 1 ? "" : "s"} · {connectedInList} connected
              </span>
            )}
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="ml-3 font-medium text-[#111111] hover:underline">
                Clear filters
              </button>
            )}
          </div>
          <div>{compareNotice ?? "Compare up to 3"}</div>
        </div>
      </div>

      {/* LOADING */}
      {directory.isPending && (
        <div className="space-y-3 pt-2" aria-busy="true">
          <p className="text-[12px] text-[#737373]">Loading connectors...</p>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 w-full animate-pulse rounded-xl border border-[#EDEDED] bg-[#F9F9FA]" />
          ))}
        </div>
      )}

      {/* ERROR */}
      {directory.isError && <LoadError title="Connectors could not be loaded." message={errorMessage(directory.error)} onRetry={() => void directory.refetch()} />}

      {/* EMPTY */}
      {directory.isSuccess && filteredConnectors.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-[#000000] px-8 py-16 text-center text-white space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900">
            <Radar className="h-6 w-6 text-amber-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-[18px] font-bold text-white">{connectors.length === 0 ? "No connectors are available yet." : "No connectors match your search."}</h3>
            <p className="text-[13px] text-neutral-400">
              {searchTerm ? `No results for "${searchTerm}". ` : ""}
              {activeTab !== "all" && CATEGORY_TABS.find((t) => t.id === activeTab)?.categories.length === 0
                ? "There is no connector in this category yet."
                : "Try a different marketplace or capability."}
            </p>
          </div>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="mt-2 h-9 px-5 rounded-lg bg-[#FFFFFF] text-[12px] font-semibold text-[#000000] hover:bg-neutral-100 transition-colors shadow-none">
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* GRID */}
      {directory.isSuccess && filteredConnectors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredConnectors.map((item) => (
            <ConnectorCardItem
              key={item.id}
              item={item}
              connection={connectionOf(item.id)}
              isSelectedForCompare={selectedForCompare.includes(item.id)}
              isBookmarked={bookmarks.includes(item.id)}
              canConnect={canConnect}
              onToggleCompare={toggleCompare}
              onToggleBookmark={toggleBookmark}
              onOpenPreview={(c) => setPreviewId(c.id)}
              onConnect={connect}
              onManage={manage}
            />
          ))}
        </div>
      )}

      {/* COMPARE TOOLBAR */}
      {selectedForCompare.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-full border border-[#E5E5E5] bg-[#FFFFFF] px-6 py-3 shadow-2xl animate-in slide-in-from-bottom duration-200">
          <span className="text-[12px] font-medium text-[#111111]">{compareItems.map((c) => c.name).join(" · ")}</span>
          <span className="text-[11px] text-[#737373]">Maximum 3 connectors</span>
          <button type="button" onClick={() => setIsCompareModalOpen(true)} className="h-8 px-4 rounded-full bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors">
            Compare ({selectedForCompare.length})
          </button>
          <button type="button" onClick={() => setSelectedForCompare([])} className="text-[12px] font-medium text-[#737373] hover:text-[#111111]">
            Clear selection
          </button>
        </div>
      )}

      <ConnectorPreviewDrawer isOpen={!!previewConnector} onClose={() => setPreviewId(null)} connector={previewConnector} connection={previewConnection} canConnect={canConnect} />

      <ConnectorCompareModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        items={compareItems}
        canConnect={canConnect}
        onConnect={(id) => {
          setIsCompareModalOpen(false);
          connect(id);
        }}
        onManage={(id) => {
          setIsCompareModalOpen(false);
          manage(id);
        }}
      />

      <div className="pt-8 text-[11px] text-[#8A8A8A] leading-relaxed">
        {FEE_NOTE} Capabilities depend on each connector's supported APIs and on the permissions the marketplace grants.
      </div>
    </div>
  );
}
