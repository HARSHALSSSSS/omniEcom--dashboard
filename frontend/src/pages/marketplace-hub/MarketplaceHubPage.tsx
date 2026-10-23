import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import {
  useConnections,
  useConnection,
  useConnectorDirectory,
  useSyncConnection,
  useDisconnectConnection,
} from "@/hooks/useConnectors";
import type { ChannelConnection } from "@/types/connection";

// Sub-components
import {
  CommerceNetworkDiagram,
  NetworkChannelNode,
} from "./components/CommerceNetworkDiagram";
import {
  MarketplaceHubToolbar,
  ChannelSortOption,
} from "./components/MarketplaceHubToolbar";
import {
  MarketplaceHubTable,
  ChannelRowData,
} from "./components/MarketplaceHubTable";
import { AttentionTableView } from "./components/AttentionTableView";
import { ChannelDetailsDrawer } from "./components/ChannelDetailsDrawer";
import { AddChannelModal } from "./components/AddChannelModal";
import { DisconnectChannelModal } from "./components/DisconnectChannelModal";
import { MarketplaceHubSkeleton } from "./components/MarketplaceHubSkeleton";
import { MarketplaceHubEmptyState } from "./components/MarketplaceHubEmptyState";

type TabFilter = "all" | "connected" | "attention" | "not_connected" | "syncing";

function formatSyncAgo(isoString?: string): string {
  if (!isoString || isoString === "Never") return "Never synced";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 0 || isNaN(diffMs)) return "Just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

export default function MarketplaceHubPage() {
  const navigate = useNavigate();

  // Queries & Mutations
  const { data: connectionsData, isLoading } = useConnections();
  const { data: directory = [] } = useConnectorDirectory();
  const syncMutation = useSyncConnection();
  const disconnectMutation = useDisconnectConnection();

  const connections = useMemo(() => connectionsData?.data ?? [], [connectionsData]);

  // Local State
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<ChannelSortOption>("health");
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [disconnectCandidate, setDisconnectCandidate] = useState<ChannelConnection | null>(null);
  const [syncingChannelIds, setSyncingChannelIds] = useState<Set<string>>(new Set());

  // Fetch full detail (entitySyncStatus, activityHistory, capabilities) when drawer opens
  const { data: selectedConnectionDetail } = useConnection(selectedChannelId);

  // Merge live backend connections with un-connected directory suggestions
  const allChannelRows: ChannelRowData[] = useMemo(() => {
    const connectedRows: ChannelRowData[] = connections.map((c) => {
      const isSyncing = syncingChannelIds.has(c.id) || c.syncState === "syncing";
      return {
        id: c.id,
        name: c.name,
        slug: c.connectorId,
        connected: true,
        status: isSyncing
          ? "syncing"
          : c.status === "warning"
            ? "warning"
            : c.status === "error"
              ? "error"
              : "healthy",
        accountIdentifier: c.accountIdentifier,
        catalogCount: c.stats.activeListings,
        ordersToday: c.stats.pendingOrders,
        inventoryStatus: "Synced",
        lastSyncText: formatSyncAgo(c.lastSyncAt),
      };
    });

    const connectedMarketplaces = new Set(connections.map((c) => c.connectorId));
    const unConnectedRows: ChannelRowData[] = directory
      .filter((d) => !connectedMarketplaces.has(d.id))
      .map((d) => ({
        id: `dir-${d.id}`,
        name: d.name,
        slug: d.id,
        connected: false,
        status: "not_connected",
        notConnectedText:
          d.description ||
          "Connect this channel to bring its catalog, inventory and orders into your workspace.",
      }));

    return [...connectedRows, ...unConnectedRows];
  }, [connections, directory, syncingChannelIds]);

  // Diagram Nodes
  const networkNodes: NetworkChannelNode[] = useMemo(() => {
    return allChannelRows.map((ch) => ({
      id: ch.id,
      name: ch.name,
      slug: ch.slug,
      status: ch.status,
      connected: ch.connected,
      productCount: ch.catalogCount,
      lastSyncText: ch.lastSyncText,
    }));
  }, [allChannelRows]);

  // Filtered & Sorted Rows
  const filteredRows = useMemo(() => {
    return allChannelRows
      .filter((ch) => {
        // Tab Filter
        if (activeTab === "connected") return ch.connected;
        if (activeTab === "attention") return ch.status === "warning" || ch.status === "error";
        if (activeTab === "not_connected") return !ch.connected;
        if (activeTab === "syncing") return ch.status === "syncing";
        return true;
      })
      .filter((ch) => {
        // Search Filter
        if (!searchQuery.trim()) return true;
        return ch.name.toLowerCase().includes(searchQuery.toLowerCase());
      })
      .sort((a, b) => {
        // Sort Option
        if (sortBy === "products") {
          return (b.catalogCount ?? 0) - (a.catalogCount ?? 0);
        }
        if (sortBy === "recent") {
          return (b.catalogCount ?? 0) - (a.catalogCount ?? 0);
        }
        // "health" default: healthy -> warning -> error -> syncing -> not connected
        const rank = (status: string) => {
          if (status === "healthy") return 1;
          if (status === "warning") return 2;
          if (status === "error") return 3;
          if (status === "syncing") return 4;
          return 5;
        };
        return rank(a.status) - rank(b.status);
      });
  }, [allChannelRows, activeTab, searchQuery, sortBy]);

  // Active Selected Channel Connection — prefer the full detail when loaded
  const selectedConnection = useMemo(() => {
    if (!selectedChannelId) return null;
    return selectedConnectionDetail ?? connections.find((c) => c.id === selectedChannelId) ?? null;
  }, [connections, selectedChannelId, selectedConnectionDetail]);

  // Attention item for bottom card
  const attentionCandidate = useMemo(() => {
    return connections.find((c) => c.status === "warning" || c.status === "error") ?? null;
  }, [connections]);

  // Suggested next channel from directory
  const suggestedNextChannel = useMemo(() => {
    const connectedMarketplaces = new Set(connections.map((c) => c.connectorId));
    return directory.find((d) => !connectedMarketplaces.has(d.id) && d.status !== "unavailable") ?? null;
  }, [connections, directory]);

  // Handlers
  const handleSelectChannel = (channelId: string) => {
    setSelectedChannelId((prev) => (prev === channelId ? null : channelId));
  };

  const handleSyncChannel = (channelId: string) => {
    setSyncingChannelIds((prev) => new Set(prev).add(channelId));
    syncMutation.mutate(channelId, {
      onSettled: () => {
        setTimeout(() => {
          setSyncingChannelIds((prev) => {
            const next = new Set(prev);
            next.delete(channelId);
            return next;
          });
        }, 2000);
      },
    });
  };

  const handleConnectTrigger = (connectorId: string) => {
    const cleanId = connectorId.replace("ch-", "").replace("dir-", "");
    navigate(`${ROUTES.MARKETPLACE_HUB}/connect/${cleanId}`);
  };

  const handleDisconnectConfirm = () => {
    if (!disconnectCandidate) return;
    disconnectMutation.mutate(disconnectCandidate.id, {
      onSuccess: () => {
        if (selectedChannelId === disconnectCandidate.id) {
          setSelectedChannelId(null);
        }
        setDisconnectCandidate(null);
      },
    });
  };

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="w-full font-['Inter',sans-serif] pb-24 space-y-6">
        <header className="w-full flex justify-between items-start pt-1">
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

  // 2. Empty State
  if (connections.length === 0) {
    return (
      <div className="w-full font-['Inter',sans-serif] pb-24 space-y-6">
        <header className="w-full flex justify-between items-start pt-1 pb-4 border-b border-[#EAEAEA]">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(ROUTES.MARKETPLACE_HUB_HEALTH)}
              className="h-9 px-4 flex items-center justify-center border border-[#BDBDBD] rounded-lg text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Connection health
            </button>
            <button
              type="button"
              onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
              className="h-9 px-4 flex items-center justify-center border border-[#BDBDBD] rounded-lg text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
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

  const isDrawerOpen = Boolean(selectedChannelId && selectedConnection);
  const isSyncingAny = syncingChannelIds.size > 0 || connections.some((c) => c.syncState === "syncing");
  const healthyCount = connections.filter((c) => c.status === "healthy").length;
  const attentionCount = connections.filter((c) => c.status === "warning" || c.status === "error").length;
  const notConnectedCount = allChannelRows.filter((c) => !c.connected).length;

  return (
    <div className="w-full font-['Inter',sans-serif] text-[#121212] pb-24 space-y-6">
      {/* PAGE HEADER */}
      <header className="w-full flex flex-row justify-between items-start pt-1">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(ROUTES.MARKETPLACE_HUB_HEALTH)}
              className="h-9 px-4 flex items-center justify-center border border-[#BDBDBD] rounded-lg text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Connection health
            </button>
            <button
              type="button"
              onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
              className="h-9 px-4 flex items-center justify-center border border-[#BDBDBD] rounded-lg text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Connector marketplace
            </button>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="h-9 px-4 flex items-center justify-center gap-1.5 bg-[#000000] rounded-lg text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors cursor-pointer shadow-none"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.2]" />
              Add channel
            </button>
          </div>
        )}
      </header>

      {/* COMMERCE NETWORK DIAGRAM */}
      {!isDrawerOpen && activeTab !== "attention" && (
        <CommerceNetworkDiagram
          channels={networkNodes}
          selectedChannelId={selectedChannelId}
          onSelectChannel={handleSelectChannel}
        />
      )}

      {/* SUBHEADER / KPI METRIC LINE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[12px] text-[#737373] pt-1">
        {isSyncingAny ? (
          <div className="flex items-center gap-2 text-blue-600 font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span>Synchronizing active channels · Live data pipelines running</span>
          </div>
        ) : isDrawerOpen ? (
          <div>
            {connections.length} connected · {notConnectedCount} available · {selectedConnection?.name} selected
          </div>
        ) : activeTab === "attention" ? (
          <div className="flex items-center justify-between w-full">
            <span className="font-medium text-[#121212]">
              {attentionCount === 0
                ? "All channels healthy · No attention needed"
                : `${attentionCount} connection${attentionCount > 1 ? "s" : ""} need attention`}
            </span>
            <span className="text-[#737373]">Live telemetry</span>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <span className="font-semibold text-[#121212]">{allChannelRows.length} channels</span>
            <span className="text-emerald-700 font-medium">{healthyCount} healthy</span>
            {attentionCount > 0 && (
              <span className="text-amber-600 font-medium">{attentionCount} need attention</span>
            )}
            <span>{notConnectedCount} not connected</span>
          </div>
        )}

        {!isDrawerOpen && activeTab !== "attention" && !isSyncingAny && (
          <div className="text-[11px] text-[#737373] mt-1 sm:mt-0">
            {connections[0]?.lastSyncAt ? `Last sync ${formatSyncAgo(connections[0].lastSyncAt)}` : "Live"}
          </div>
        )}
      </div>

      {/* FILTER TABS */}
      {!isDrawerOpen && (
        <div className="flex items-center gap-1 border-b border-[#E5E5E5] pb-2">
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
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer ${
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
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />
      )}

      {/* MAIN CONTENT AREA */}
      <div className="w-full flex flex-col lg:flex-row items-start gap-6">
        {/* Table Area */}
        <div className="flex-1 w-full space-y-6">
          {activeTab === "attention" ? (
            <AttentionTableView
              connections={connections}
              onReconnect={(id) => handleConnectTrigger(id)}
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
              onDisconnectChannel={(id) => {
                const found = connections.find((c) => c.id === id);
                if (found) setDisconnectCandidate(found);
              }}
              onViewListings={(id) => navigate(`${ROUTES.LISTINGS}?channel=${id}`)}
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
                <p className="text-[12px] text-[#737373]">
                  {attentionCandidate
                    ? attentionCandidate.attentionIssue?.issueDescription ||
                      "Synchronization has encountered warnings or required updates."
                    : "Data flow pipelines are running normally across all connected marketplaces."}
                </p>
                {attentionCandidate && (
                  <>
                    <p className="text-[11px] text-[#8C8C8C]">
                      Last successful sync: {formatSyncAgo(attentionCandidate.lastSyncAt)}
                    </p>
                    <div className="flex items-center gap-4 pt-2 text-[12px]">
                      <button
                        type="button"
                        onClick={() => handleSyncChannel(attentionCandidate.id)}
                        className="font-semibold text-[#121212] hover:underline cursor-pointer"
                      >
                        Retry sync
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedChannelId(attentionCandidate.id)}
                        className="font-medium text-[#121212] hover:underline cursor-pointer"
                      >
                        Review issue →
                      </button>
                    </div>
                  </>
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
            isSyncing={
              syncingChannelIds.has(selectedConnection.id) ||
              selectedConnection.syncState === "syncing"
            }
            onTriggerSync={handleSyncChannel}
            onViewListings={(id) => navigate(`${ROUTES.LISTINGS}?channel=${id}`)}
            onDisconnect={(id) => {
              const found = connections.find((c) => c.id === id);
              if (found) setDisconnectCandidate(found);
            }}
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

      <DisconnectChannelModal
        channelName={disconnectCandidate?.name ?? "Channel"}
        isOpen={Boolean(disconnectCandidate)}
        onClose={() => setDisconnectCandidate(null)}
        onConfirm={handleDisconnectConfirm}
        isPending={disconnectMutation.isPending}
      />
    </div>
  );
}
