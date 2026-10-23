import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronDown } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import type { ChannelConnection } from "@/types/connection";
import type { HubSyncJob } from "@/types/hub";

interface ConnectionsRecoveryTableProps {
  connections: ChannelConnection[];
  onOpenRecoveryDrawer: (connection: ChannelConnection) => void;
  onRetrySync: (connectionId: string) => void;
  recentJobs?: HubSyncJob[];
}

export function ConnectionsRecoveryTable({
  connections,
  onOpenRecoveryDrawer,
  onRetrySync,
  recentJobs = [],
}: ConnectionsRecoveryTableProps) {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [affectedAreaFilter, setAffectedAreaFilter] = useState<string>("all");

  const healthyCount = connections.filter((c) => c.status === "healthy").length;
  const attentionCount = connections.filter((c) => c.status === "warning").length;
  const criticalCount = connections.filter((c) => c.status === "error").length;

  const filteredConnections = useMemo(() => {
    return connections.filter((c) => {
      // Search
      if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }

      // Tab
      if (activeTab === "healthy" && c.status !== "healthy") return false;
      if (activeTab === "syncing" && c.syncState !== "syncing") return false;
      if (activeTab === "attention" && c.status !== "warning") return false;
      if (activeTab === "critical" && c.status !== "error") return false;

      // Area filter
      if (affectedAreaFilter !== "all") {
        if (affectedAreaFilter === "inventory" && c.category === "shipping") return false;
      }

      return true;
    });
  }, [connections, searchTerm, activeTab, affectedAreaFilter]);

  const attentionConn = connections.find((c) => c.status === "warning" || c.status === "error") || connections[0];

  // Generate real 24-hour timeline points from recentJobs or fall back to Figma sample
  const timelineEvents = useMemo(() => {
    if (!recentJobs || recentJobs.length === 0) {
      return [
        { time: "8 AM", label: "Stable", dotColor: "bg-[#16A34A]", textColor: "text-[#737373]" },
        { time: "11 AM", label: "Shopify sync", dotColor: "bg-[#1D4ED8]", textColor: "text-[#737373]" },
        { time: "1 PM", label: "Meesho delay", dotColor: "bg-[#D97706]", textColor: "text-[#D97706] font-medium" },
        { time: "3 PM", label: "Recovered", dotColor: "bg-[#16A34A]", textColor: "text-[#737373]" },
        { time: "5 PM", label: "Stable", dotColor: "bg-[#16A34A]", textColor: "text-[#737373]" },
        { time: "5:42 PM", label: "New Meesho delay", dotColor: "bg-[#D97706]", textColor: "text-[#D97706] font-bold" },
      ];
    }

    const sorted = [...recentJobs]
      .filter((j) => j.startedAt || j.createdAt)
      .sort((a, b) => new Date(a.startedAt || a.createdAt).getTime() - new Date(b.startedAt || b.createdAt).getTime())
      .slice(-6);

    return sorted.map((job) => {
      const date = new Date(job.startedAt || job.createdAt);
      const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const isFailed = job.status === "failed" || job.status === "dead_lettered";
      const isRunning = job.status === "running" || job.status === "retrying";
      const scopeLabel = job.type.charAt(0).toUpperCase() + job.type.slice(1);

      const conn = connections.find((c) => c.id === job.marketplaceAccountId);
      const channelName = conn?.name || scopeLabel;

      const dotColor = isFailed ? "bg-[#DC2626]" : isRunning ? "bg-[#1D4ED8]" : "bg-[#16A34A]";
      const textColor = isFailed ? "text-[#DC2626] font-medium" : "text-[#737373]";
      const label = `${channelName} ${isFailed ? "delay" : isRunning ? "syncing" : "sync"}`;

      return { time, label, dotColor, textColor };
    });
  }, [recentJobs, connections]);

  const timelineSummary = useMemo(() => {
    if (!recentJobs || recentJobs.length === 0) {
      return "Recovered at 3 PM; a new inventory delay was detected at 5:42 PM.";
    }
    const failedJob = recentJobs.find((j) => j.status === "failed" || j.status === "dead_lettered");
    if (failedJob && (failedJob.startedAt || failedJob.createdAt)) {
      const time = new Date(failedJob.startedAt || failedJob.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return `Latest sync issue: ${failedJob.type} delay detected at ${time}.`;
    }
    return "All sync pipelines operating within normal parameters over the last 24 hours.";
  }, [recentJobs]);

  return (
    <div className="space-y-8 text-[#111111]">
      {/* Title & Counters */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-b border-[#F0F0F0] pb-4">
        <div>
          <h2 className="text-[20px] font-bold text-[#111111]">
            All connections
          </h2>
          <p className="text-[12px] text-[#737373] mt-0.5">
            {connections.length} connected · {healthyCount} healthy · {attentionCount + criticalCount} attention
          </p>
        </div>
      </div>

      {/* Tabs & Search & Area Filter Pills */}
      <div className="space-y-4">
        {/* Filter Tabs */}
        <div className="flex items-center gap-6 border-b border-[#E5E5E5] text-[13px] overflow-x-auto">
          {[
            { id: "all", label: "All" },
            { id: "healthy", label: "Healthy" },
            { id: "syncing", label: "Syncing" },
            { id: "attention", label: "Attention" },
            { id: "critical", label: "Critical" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 font-medium transition-colors whitespace-nowrap relative ${
                  isActive ? "text-[#111111] font-semibold" : "text-[#737373] hover:text-[#111111]"
                }`}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#000000]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Search Bar & Affected Area Dropdowns */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8A8A8A]" />
            <input
              type="text"
              placeholder="Search connections..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] placeholder:text-[#8A8A8A] focus:border-[#000000] focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto text-[12px]">
            <span className="text-[#737373] font-medium whitespace-nowrap">Affected area:</span>
            {["Products", "Inventory", "Orders", "Listings", "Authentication"].map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => setAffectedAreaFilter(affectedAreaFilter === area.toLowerCase() ? "all" : area.toLowerCase())}
                className={`h-8 px-2.5 rounded-lg border text-[11px] font-medium transition-colors flex items-center gap-1 ${
                  affectedAreaFilter === area.toLowerCase()
                    ? "border-[#000000] bg-[#000000] text-white"
                    : "border-[#D4D4D4] bg-[#FFFFFF] text-[#111111] hover:bg-[#F5F5F5]"
                }`}
              >
                {area} <ChevronDown className="h-3 w-3" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="rounded-2xl border border-[#EDEDED] bg-[#FFFFFF] overflow-hidden shadow-sm">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b border-[#F0F0F0] bg-[#FAFAFA] text-[11px] font-semibold uppercase tracking-wider text-[#737373]">
            <tr>
              <th className="py-3 px-6">Connector</th>
              <th className="py-3 px-4">Auth</th>
              <th className="py-3 px-4">Catalog</th>
              <th className="py-3 px-4">Inventory</th>
              <th className="py-3 px-4">Orders</th>
              <th className="py-3 px-4">Last sync</th>
              <th className="py-3 px-4">Health</th>
              <th className="py-3 px-6 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {filteredConnections.map((conn) => {
              const isAttention = conn.status === "warning";
              const isCritical = conn.status === "error";
              const isShipping = conn.category === "shipping" || conn.name.toLowerCase().includes("shipping");
              const isReturns = conn.name.toLowerCase().includes("returns");

              const borderIndicator = isCritical
                ? "border-l-4 border-l-[#DC2626]"
                : isAttention
                ? "border-l-4 border-l-[#D97706]"
                : "border-l-4 border-l-[#16A34A]";

              const healthLabel = isCritical
                ? "Critical"
                : isAttention
                ? "Attention"
                : "Healthy";

              const healthColor = isCritical
                ? "text-[#DC2626] font-semibold"
                : isAttention
                ? "text-[#D97706] font-semibold"
                : "text-[#16A34A] font-semibold";

              return (
                <tr key={conn.id} className={`hover:bg-[#FAFAFA] transition-colors ${borderIndicator}`}>
                  <td className="py-3.5 px-6">
                    <span className="font-bold text-[#111111] block">{conn.name}</span>
                    <span className="text-[11px] text-[#737373] capitalize">{conn.category}</span>
                  </td>
                  <td className="py-3.5 px-4 text-[#16A34A] font-bold">✓</td>
                  <td className="py-3.5 px-4 font-bold">
                    {isShipping || isReturns ? <span className="text-[#A3A3A3] font-normal">—</span> : <span className="text-[#16A34A]">✓</span>}
                  </td>
                  <td className="py-3.5 px-4 font-bold">
                    {isShipping || isReturns ? (
                      <span className="text-[#A3A3A3] font-normal">—</span>
                    ) : isAttention ? (
                      <span className="text-[#D97706]">⚠</span>
                    ) : isCritical ? (
                      <span className="text-[#DC2626]">✕</span>
                    ) : (
                      <span className="text-[#16A34A]">✓</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-[#16A34A] font-bold">✓</td>
                  <td className="py-3.5 px-4 text-[#525252]">
                    {conn.lastSyncAt ? conn.lastSyncAt : "Recently"}
                  </td>
                  <td className={`py-3.5 px-4 ${healthColor}`}>
                    {healthLabel}
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    {isAttention || isCritical ? (
                      <button
                        type="button"
                        onClick={() => onOpenRecoveryDrawer(conn)}
                        className="font-bold text-[#111111] hover:underline"
                      >
                        Review →
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate(ROUTES.MARKETPLACE_HUB)}
                        className="text-[#737373] hover:text-[#111111] hover:underline"
                      >
                        Manage →
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Legend Footnote */}
        <div className="border-t border-[#F0F0F0] px-6 py-3 bg-[#FAFAFA] flex items-center gap-6 text-[11px] text-[#737373]">
          <div className="flex items-center gap-1.5">
            <span className="text-[#16A34A] font-bold">✓</span>
            <span>Healthy capability</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#D97706] font-bold">⚠</span>
            <span>Needs attention</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#A3A3A3] font-bold">—</span>
            <span>Not supported by this service</span>
          </div>
        </div>
      </div>

      {/* 24 Hours Event Timeline Section */}
      <div className="rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#111111]">
            Last 24 hours
          </h3>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A8A8A]">
            Connection event timeline
          </span>
        </div>

        {/* Timeline Bar with Event Points */}
        <div className="relative pt-4 pb-2">
          <div className="h-[2px] w-full bg-[#E5E5E5] relative">
            <div className="absolute left-0 top-0 h-full w-[85%] bg-[#111111]" />
          </div>

          <div className="flex justify-between items-start pt-3 text-[11px]">
            {timelineEvents.map((ev, i) => (
              <div key={i} className="flex flex-col items-center">
                <span className="font-semibold text-[#111111]">{ev.time}</span>
                <span className={`h-2 w-2 rounded-full ${ev.dotColor} mt-1`} />
                <span className={`${ev.textColor} mt-1 text-center max-w-[90px] truncate`}>
                  {ev.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[12px] text-[#737373] border-t border-[#F0F0F0] pt-4">
          {timelineSummary}
        </p>

        {/* Stepper + Action Callout */}
        <div className="rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-5 space-y-4">
          <div className="flex items-center justify-between text-[11px] text-[#737373]">
            <span className="text-[#16A34A] font-bold">Detected ✓</span>
            <span className="text-[#16A34A] font-bold">Diagnosed ✓</span>
            <span className="text-[#1D4ED8] font-bold">Retry ○</span>
            <span>Verified ○</span>
            <span>Healthy ○</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
            <div>
              <h4 className="text-[13px] font-bold text-[#111111]">
                Retry {attentionConn.name} inventory synchronization
              </h4>
              <p className="text-[12px] text-[#525252] mt-0.5">
                The connection is authenticated; inventory is the only affected stream.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onRetrySync(attentionConn.id)}
                className="h-8 px-3.5 rounded-lg bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => onOpenRecoveryDrawer(attentionConn)}
                className="h-8 px-3.5 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors"
              >
                Review first
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
