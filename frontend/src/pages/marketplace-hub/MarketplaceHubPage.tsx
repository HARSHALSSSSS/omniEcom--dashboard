import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useConnections, useConnection, useConnectorDirectory } from "@/hooks/useConnectors";
import type { ChannelConnection } from "@/types/connection";
import { LoadError } from "@/components/marketplace-hub/accounts/hubUi";
import { WRITE_REASON, ago } from "@/components/marketplace-hub/accounts/hubFormat";
import { useAccountActions } from "@/components/marketplace-hub/accounts/useAccountActions";

// Sub-components
import { CommerceNetworkDiagram, NetworkChannelNode } from "./components/CommerceNetworkDiagram";
import { MarketplaceHubToolbar, ChannelSortOption } from "./components/MarketplaceHubToolbar";
import { MarketplaceHubTable } from "./components/MarketplaceHubTable";
import { AttentionTableView } from "./components/AttentionTableView";
import { ChannelDetailsDrawer } from "./components/ChannelDetailsDrawer";
import { AddChannelModal } from "./components/AddChannelModal";
import { MarketplaceHubSkeleton } from "./components/MarketplaceHubSkeleton";
import { MarketplaceHubEmptyState } from "./components/MarketplaceHubEmptyState";
import { isConnectedConnection, needsAttention, rowFromConnection, rowFromDirectory, type ChannelRowData } from "./components/channelRows";

type TabFilter = "all" | "connected" | "attention" | "not_connected" | "syncing";
const TABS: TabFilter[] = ["all", "connected", "attention", "not_connected", "syncing"];
const SORTS: ChannelSortOption[] = ["health", "recent", "products"];

/** the first connection that needs attention, with the sync retry the old hub tiles had */
function AttentionAdvisory({ connection, onReview }: { connection: ChannelConnection; onReview: (id: string) => void }) {
  const a = useAccountActions(connection.account!);
  const needsReconnect = connection.account!.accountStatus !== "active" && connection.account!.accountStatus !== "paused";
  const points = connection.health.frictionPoints;
  return (
    <>
      <p className="text-[12px] text-[#737373]">{points.length > 0 ? points.join(". ") : "Synchronization has encountered warnings or needs an update."}</p>
      <p className="text-[11px] text-[#8C8C8C]">
        Last successful sync: {connection.lastSyncAt && connection.lastSyncAt !== "Never" ? ago(connection.lastSyncAt) : "never"}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-[12px]">
        <button
          type="button"
          disabled={needsReconnect ? !a.canWrite : Boolean(a.syncReason) || a.syncing}
          title={(needsReconnect ? (a.canWrite ? null : WRITE_REASON) : a.syncReason) ?? undefined}
          onClick={needsReconnect ? () => a.openDialog("reconnect") : a.startSync}
          className="font-semibold text-[#121212] hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {needsReconnect ? "Reconnect" : "Retry sync"}
        </button>
        <button type="button" onClick={() => onReview(connection.id)} className="font-medium text-[#121212] hover:underline cursor-pointer">
          Review issue →
        </button>
      </div>
      {a.dialogs}
    </>
  );
}

export default function MarketplaceHubPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canWrite = useCan("marketplace_accounts:write");

  // Queries
  const connectionsQuery = useConnections();
  const { data: directory = [] } = useConnectorDirectory();
  const listConnections = useMemo(() => connectionsQuery.data?.data ?? [], [connectionsQuery.data]);

  // Filters live in the URL (tab, q, sort) so a reload or a shared link shows the same list
  const tabParam = params.get("tab");
  const activeTab: TabFilter = TABS.includes(tabParam as TabFilter) ? (tabParam as TabFilter) : "all";
  const searchQuery = params.get("q") ?? "";
  const sortParam = params.get("sort");
  const sortBy: ChannelSortOption = SORTS.includes(sortParam as ChannelSortOption) ? (sortParam as ChannelSortOption) : "health";
  const setFilter = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  const setActiveTab = (t: TabFilter) => setFilter({ tab: t === "all" ? null : t });

  // Local state
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Full detail (per-entity sync state, recent jobs) when the drawer opens
  const detailQuery = useConnection(selectedChannelId);
  const selectedConnectionDetail = detailQuery.data;

  // the list and the open detail panel read the same account twice; whichever was fetched last wins for both,
  // so a count (listings, open orders) never differs between the row and its panel
  const connections = useMemo(() => {
    const detail = selectedConnectionDetail;
    if (!detail || detailQuery.dataUpdatedAt <= connectionsQuery.dataUpdatedAt) return listConnections;
    return listConnections.map((c) => (c.id === detail.id ? detail : c));
  }, [listConnections, selectedConnectionDetail, detailQuery.dataUpdatedAt, connectionsQuery.dataUpdatedAt]);

  // Real accounts first, then the directory connectors that are not connected yet
  const allChannelRows: ChannelRowData[] = useMemo(() => {
    const connectedRows = connections.map(rowFromConnection);
    const connectedMarketplaces = new Set(connections.map((c) => c.connectorId));
    const unConnectedRows = directory.filter((d) => !connectedMarketplaces.has(d.id)).map(rowFromDirectory);
    return [...connectedRows, ...unConnectedRows];
  }, [connections, directory]);

  const networkNodes: NetworkChannelNode[] = useMemo(
    () => allChannelRows.map((ch) => ({ id: ch.id, name: ch.name, slug: ch.slug, status: ch.status, connected: ch.connected, listings: ch.listings, lastSyncAt: ch.lastSyncAt })),
    [allChannelRows],
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rank = (status: string) => ({ healthy: 1, paused: 2, warning: 3, error: 4, disconnected: 5, syncing: 6 })[status] ?? 7;
    return allChannelRows
      .filter((ch) => {
        if (activeTab === "connected") return ch.connected && ch.status !== "disconnected";
        if (activeTab === "attention") return needsAttention(ch.status);
        if (activeTab === "not_connected") return !ch.connected || ch.status === "disconnected";
        if (activeTab === "syncing") return ch.status === "syncing";
        return true;
      })
      .filter((ch) => !q || ch.name.toLowerCase().includes(q) || (ch.accountIdentifier ?? "").toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === "products") return (b.listings ?? 0) - (a.listings ?? 0);
        if (sortBy === "recent") return new Date(b.lastSyncAt ?? 0).getTime() - new Date(a.lastSyncAt ?? 0).getTime();
        return rank(a.status) - rank(b.status);
      });
  }, [allChannelRows, activeTab, searchQuery, sortBy]);

  const selectedConnection = useMemo(() => {
    if (!selectedChannelId) return null;
    const fromList = connections.find((c) => c.id === selectedChannelId);
    // the detail carries the per-entity sync state the list lacks; its numbers are the merged ones
    return selectedConnectionDetail ? { ...selectedConnectionDetail, stats: fromList?.stats ?? selectedConnectionDetail.stats } : (fromList ?? null);
  }, [connections, selectedChannelId, selectedConnectionDetail]);

  const attentionCandidate = useMemo(() => connections.find((c) => c.account && needsAttention(rowFromConnection(c).status)) ?? null, [connections]);

  const suggestedNextChannel = useMemo(() => {
    const connectedMarketplaces = new Set(connections.map((c) => c.connectorId));
    return directory.find((d) => !connectedMarketplaces.has(d.id) && d.status !== "unavailable") ?? null;
  }, [connections, directory]);

  // Handlers
  const handleSelectChannel = (channelId: string) => {
    if (channelId.startsWith("dir-")) {
      handleConnectTrigger(channelId);
      return;
    }
    setSelectedChannelId((prev) => (prev === channelId ? null : channelId));
  };

  const handleConnectTrigger = (connectorId: string) => {
    const cleanId = connectorId.replace("dir-", "");
    navigate(`${ROUTES.MARKETPLACE_HUB}/connect/${cleanId}`);
  };
  const viewListings = (id: string) => navigate(`${ROUTES.LISTINGS}?account=${id}`);
  const viewOrders = (id: string) => {
    const marketplace = connections.find((c) => c.id === id)?.connectorId;
    navigate(marketplace ? `${ROUTES.ORDERS}?marketplace=${marketplace}` : ROUTES.ORDERS);
  };
  const openDetails = (id: string) => navigate(`${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${id}`);

  // 1. Loading State
  if (connectionsQuery.isPending) {
    return (
      <div className="w-full font-['Inter',sans-serif] pb-24 space-y-6">
        <header className="w-full flex flex-col sm:flex-row justify-between items-start gap-4 sm:gap-0 pt-1">
          <div className="space-y-1">
            <span className="text-[10px] font-medium leading-[12px] tracking-wider text-[#707070] uppercase">
              CHANNELS
            </span>
            <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">
              Marketplace hub
            </h1>
            <p className="text-[13px] font-normal leading-[19px] text-[#666666]">
              Connect, monitor and manage every sales channel from one workspace.
            </p>
          </div>
        </header>
        <MarketplaceHubSkeleton />
      </div>
    );
  }

  // Error with retry
  if (connectionsQuery.isError) {
    return (
      <div className="w-full font-['Inter',sans-serif] pb-24 space-y-6">
        <header className="space-y-1 pt-1">
          <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">Marketplace hub</h1>
        </header>
        <LoadError title="Connections could not be loaded." message={errorMessage(connectionsQuery.error)} onRetry={() => void connectionsQuery.refetch()} />
      </div>
    );
  }

  // 2. Empty State
  if (connections.length === 0) {
    return (
      <div className="w-full font-['Inter',sans-serif] pb-24 space-y-6">
        <header className="w-full flex flex-col sm:flex-row justify-between items-start gap-4 sm:gap-0 pt-1 pb-4 border-b border-[#EAEAEA]">
          <div className="space-y-1">
            <span className="text-[10px] font-medium leading-[12px] tracking-wider text-[#707070] uppercase">
              CHANNELS
            </span>
            <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">
              Marketplace hub
            </h1>
            <p className="text-[13px] font-normal leading-[19px] text-[#666666]">
              Connect, monitor and manage every sales channel from one workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => navigate(ROUTES.MARKETPLACE_HUB_HEALTH)}
              className="h-10 sm:h-9 px-4 flex items-center justify-center border border-[#BDBDBD] rounded-lg text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Connection health
            </button>
            <button
              type="button"
              onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
              className="h-10 sm:h-9 px-4 flex items-center justify-center border border-[#BDBDBD] rounded-lg text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Connector marketplace
            </button>
          </div>
        </header>

        <div className="text-[13px] text-[#666666]">
          No channels connected · Your master catalog is ready
        </div>

        <MarketplaceHubEmptyState
          onAddChannel={() => setIsAddModalOpen(true)}
          onBrowseConnectors={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
          connectorNames={directory.map((d) => d.name)}
        />

        <div className="text-[11px] text-[#737373] max-w-4xl pt-4">
          <p className="font-semibold text-[#121212]">Your master catalog stays central.</p>
          <p className="mt-0.5">
            Connected channels receive the product, inventory and operational information
            they support, while marketplace-specific requirements remain manageable from
            the channel listing layer.
          </p>
        </div>

        <AddChannelModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onConnect={handleConnectTrigger}
          onBrowseAll={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
        />
      </div>
    );
  }

  const latestSync = connections.map((c) => c.lastSyncAt).filter((t) => t && t !== "Never").sort().pop();
  const isDrawerOpen = Boolean(selectedChannelId && selectedConnection);
  const isSyncingAny = connections.some((c) => c.syncState === "syncing");
  const healthyCount = allChannelRows.filter((c) => c.status === "healthy").length;
  const attentionCount = allChannelRows.filter((c) => needsAttention(c.status)).length;
  // a disconnected account stays on the list (so it can be reconnected) but is not a connected channel any more
  const connectedCount = connections.filter(isConnectedConnection).length;
  const notConnectedCount = allChannelRows.filter((c) => !c.connected || c.status === "disconnected").length;

  return (
    <div className="w-full font-['Inter',sans-serif] text-[#121212] pb-24 space-y-6">
      {/* PAGE HEADER */}
      <header className="w-full flex flex-col sm:flex-row justify-between items-start gap-4 sm:gap-0 pt-1">
        <div className="space-y-1">
          <span className="text-[10px] font-medium leading-[12px] tracking-wider text-[#707070] uppercase">
            CHANNELS
          </span>
          <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">
            Marketplace hub
          </h1>
          <p className="text-[13px] font-normal leading-[19px] text-[#666666]">
            Connect, monitor and manage every sales channel from one workspace.
          </p>
        </div>

        {/* Top actions */}
        {!isDrawerOpen && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => navigate(ROUTES.MARKETPLACE_HUB_HEALTH)}
              className="h-10 sm:h-9 px-4 flex items-center justify-center border border-[#BDBDBD] rounded-lg text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Connection health
            </button>
            <button
              type="button"
              onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
              className="h-10 sm:h-9 px-4 flex items-center justify-center border border-[#BDBDBD] rounded-lg text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Connector marketplace
            </button>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="h-10 sm:h-9 px-4 flex items-center justify-center gap-1.5 bg-[#000000] rounded-lg text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors cursor-pointer shadow-none"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.2]" />
              Add channel
            </button>
          </div>
        )}
      </header>

      {!canWrite && (
        <p role="status" className="rounded-lg border border-[#EAEAEA] bg-[#F5F5F5] px-3 py-2 text-[12px] text-[#666666]">
          You have read-only access. Syncing, testing and changing connections needs the marketplace_accounts:write permission.
        </p>
      )}

      {/* COMMERCE NETWORK DIAGRAM */}
      {!isDrawerOpen && activeTab !== "attention" && (
        <CommerceNetworkDiagram
          channels={networkNodes}
          selectedChannelId={selectedChannelId}
          onSelectChannel={handleSelectChannel}
        />
      )}

      {/* SUBHEADER / KPI METRIC LINE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[12px] text-[#737373] pt-1 gap-1.5 sm:gap-0">
        {isSyncingAny ? (
          <div className="flex items-center gap-2 text-blue-600 font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span>Synchronizing active channels · Live data pipelines running</span>
          </div>
        ) : isDrawerOpen ? (
          <div>
            {connectedCount} connected · {notConnectedCount} available · {selectedConnection?.name} selected
          </div>
        ) : activeTab === "attention" ? (
          <div className="flex flex-wrap items-center justify-between w-full gap-2">
            <span className="font-medium text-[#121212]">
              {attentionCount === 0
                ? "All channels healthy · No attention needed"
                : `${attentionCount} connection${attentionCount > 1 ? "s" : ""} need attention`}
            </span>
            <span className="text-[#737373]">Live telemetry</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-[#121212]">{allChannelRows.length} channels</span>
            <span className="text-emerald-700 font-medium">{healthyCount} healthy</span>
            {attentionCount > 0 && (
              <span className="text-amber-600 font-medium">{attentionCount} need attention</span>
            )}
            <span>{notConnectedCount} not connected</span>
          </div>
        )}

        {!isDrawerOpen && activeTab !== "attention" && !isSyncingAny && (
          <div className="text-[11px] text-[#737373] mt-0.5 sm:mt-0">
            {latestSync ? `Last sync ${ago(latestSync)}` : "No sync yet"}
          </div>
        )}
      </div>

      {/* FILTER TABS */}
      {!isDrawerOpen && (
        <div className="flex items-center gap-1 border-b border-[#E5E5E5] pb-2 overflow-x-auto max-w-full [-webkit-overflow-scrolling:touch]">
          {(
            [
              { id: "all", label: "All" },
              { id: "connected", label: "Connected" },
              { id: "attention", label: "Needs attention" },
              { id: "not_connected", label: "Not connected" },
              { id: "syncing", label: "Syncing" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedChannelId(null);
              }}
              className={`shrink-0 min-h-[36px] sm:min-h-0 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "bg-[#121212] text-white"
                  : "text-[#737373] hover:text-[#121212] hover:bg-[#F5F5F5]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* SEARCH & SORT TOOLBAR */}
      {!isDrawerOpen && (
        <MarketplaceHubToolbar
          searchQuery={searchQuery}
          onSearchChange={(q) => setFilter({ q: q || null })}
          sortBy={sortBy}
          onSortChange={(sort) => setFilter({ sort: sort === "health" ? null : sort })}
        />
      )}

      {/* MAIN CONTENT AREA */}
      <div className="w-full flex flex-col lg:flex-row items-start gap-6">
        {/* Table Area */}
        <div className="flex-1 w-full min-w-0 space-y-6">
          {activeTab === "attention" ? (
            <AttentionTableView
              connections={connections}
              onViewDetails={(id) => {
                setSelectedChannelId(id);
                setActiveTab("all");
              }}
            />
          ) : (
            <MarketplaceHubTable
              channels={filteredRows}
              isCompactMode={isDrawerOpen}
              selectedChannelId={selectedChannelId}
              onSelectChannel={handleSelectChannel}
              onConnectChannel={handleConnectTrigger}
              onViewListings={viewListings}
              onViewOrders={viewOrders}
              onOpenDetails={openDetails}
            />
          )}

          {/* Bottom Advisory Cards */}
          {!isDrawerOpen && activeTab !== "attention" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Left Box: Attention / Health Status */}
              <div className="p-5 rounded-xl bg-white border border-[#E5E5E5] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#121212]">
                    Connection health
                  </span>
                  <span
                    className={`text-[12px] font-medium ${
                      attentionCandidate ? "text-amber-600" : "text-emerald-600"
                    }`}
                  >
                    {attentionCandidate
                      ? `${attentionCandidate.name} needs attention`
                      : "All connections healthy"}
                  </span>
                </div>
                {attentionCandidate ? (
                  <AttentionAdvisory connection={attentionCandidate} onReview={setSelectedChannelId} />
                ) : (
                  <p className="text-[12px] text-[#737373]">Data flow pipelines are running normally across all connected marketplaces.</p>
                )}
              </div>

              {/* Right Box: Suggested next channel */}
              <div className="p-5 rounded-xl bg-[#F5F5F5] border border-[#E5E5E5] space-y-1.5">
                <div className="text-[11px] font-medium text-[#737373]">
                  Suggested next channel
                </div>
                <div className="text-[13px] font-semibold text-[#121212]">
                  {suggestedNextChannel ? suggestedNextChannel.name : "Connector Directory"}
                </div>
                <p className="text-[12px] text-[#737373]">
                  {suggestedNextChannel
                    ? suggestedNextChannel.description
                    : "Explore supported marketplaces and commerce platforms in our directory."}
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (suggestedNextChannel) {
                        navigate(`${ROUTES.MARKETPLACE_HUB}/connect/${suggestedNextChannel.id}`);
                      } else {
                        navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS);
                      }
                    }}
                    className="text-[12px] font-semibold text-[#121212] hover:underline cursor-pointer"
                  >
                    {suggestedNextChannel
                      ? `Explore ${suggestedNextChannel.name} →`
                      : "Browse directory →"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footnote below table when drawer is open */}
          {isDrawerOpen && (
            <div className="text-[11px] text-[#666666] max-w-3xl pt-2">
              <p className="font-semibold text-black">Your master catalog stays central.</p>
              <p className="mt-0.5 leading-relaxed">
                Connected channels receive the product, inventory and operational information
                they support, while marketplace-specific requirements remain manageable from
                the channel listing layer.
              </p>
            </div>
          )}
        </div>

        {/* Slide-over Side Drawer */}
        {isDrawerOpen && selectedConnection && (
          <ChannelDetailsDrawer
            connection={selectedConnection}
            isOpen={isDrawerOpen}
            onClose={() => setSelectedChannelId(null)}
            onViewListings={viewListings}
            onViewOrders={viewOrders}
            onDeleted={() => setSelectedChannelId(null)}
          />
        )}
      </div>

      {/* PAGE FOOTER NOTE */}
      {!isDrawerOpen && (
        <div className="text-[11px] text-[#737373] max-w-4xl pt-4 border-t border-[#E5E5E5]">
          <p className="font-semibold text-[#121212]">Your master catalog stays central.</p>
          <p className="mt-0.5">
            Connected channels receive the product, inventory and operational information
            they support, while marketplace-specific requirements remain manageable from
            the channel listing layer.
          </p>
        </div>
      )}

      {/* MODALS */}
      <AddChannelModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onConnect={handleConnectTrigger}
        onBrowseAll={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
      />

    </div>
  );
}
