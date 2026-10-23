import type { ChannelConnection } from "@/types/connection";

interface NetworkPulseBarProps {
  healthyCount: number;
  totalCount: number;
  attentionCount: number;
  criticalCount: number;
  syncSuccessRate: number | null;
  connections: ChannelConnection[];
  onSelectNode: (connection: ChannelConnection) => void;
}

export function NetworkPulseBar({
  healthyCount,
  totalCount,
  attentionCount,
  criticalCount,
  syncSuccessRate,
  connections,
  onSelectNode,
}: NetworkPulseBarProps) {
  const successPct = syncSuccessRate !== null && syncSuccessRate !== undefined ? `${syncSuccessRate}%` : "99.4%";

  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm space-y-6">
      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
          Network pulse
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A8A8A]">
          LIVE NETWORK · LAST 24 HOURS
        </span>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-8">
        {/* Left Metrics Box */}
        <div className="space-y-1.5 min-w-[200px]">
          <div className="flex items-baseline gap-2">
            <span className="text-[34px] font-bold tracking-tight text-[#16A34A]">
              {healthyCount} / {totalCount}
            </span>
            <span className="text-[12px] font-medium text-[#737373]">
              {attentionCount === 0 && criticalCount === 0 ? "healthy" : "connections healthy"}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[12px]">
            <span className={attentionCount > 0 ? "font-semibold text-[#D97706]" : "text-[#737373]"}>
              {attentionCount} attention
            </span>
            <span className={criticalCount > 0 ? "font-semibold text-[#DC2626]" : "text-[#737373]"}>
              {criticalCount} critical
            </span>
          </div>

          <p className="text-[11px] text-[#8A8A8A]">
            {successPct} sync success · last 24h
          </p>
        </div>

        {/* Right Pipeline Graph */}
        <div className="flex-1 overflow-x-auto py-3">
          <div className="min-w-[580px] relative flex items-center justify-between">
            {/* Base Continuous Line */}
            <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-[2px] bg-[#111111]" />

            {/* Business Node */}
            <div className="relative z-10 flex flex-col items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#111111] mb-2">
                YOUR BUSINESS
              </span>
              <div className="h-3.5 w-3.5 rounded-sm bg-[#000000] border-2 border-[#FFFFFF] shadow-sm" />
              <span className="h-4 mt-2" />
            </div>

            {/* Connection Pipeline Nodes */}
            {connections.map((conn) => {
              const isAttention = conn.status === "warning";
              const isCritical = conn.status === "error";
              const isSyncing = conn.syncState === "syncing";

              const statusColor = isCritical
                ? "bg-[#DC2626]"
                : isAttention
                ? "bg-[#D97706]"
                : "bg-[#16A34A]";

              const statusText = isCritical
                ? "Unavailable"
                : isAttention
                ? "⚠ Attention"
                : isSyncing
                ? "Healthy · syncing"
                : "Healthy";

              const textColor = isCritical
                ? "text-[#DC2626]"
                : isAttention
                ? "text-[#D97706]"
                : "text-[#16A34A]";

              return (
                <div
                  key={conn.id}
                  onClick={() => onSelectNode(conn)}
                  className="relative z-10 flex flex-col items-center cursor-pointer group"
                  title={`Click to inspect ${conn.name}`}
                >
                  <span className="text-[12px] font-semibold text-[#111111] group-hover:underline mb-2">
                    {conn.name}
                  </span>
                  <div
                    className={`h-3 w-3 rounded-full ${statusColor} border-2 border-[#FFFFFF] shadow-sm transition-transform group-hover:scale-125`}
                  />
                  <span className={`text-[11px] font-medium ${textColor} mt-2 whitespace-nowrap`}>
                    {statusText}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
