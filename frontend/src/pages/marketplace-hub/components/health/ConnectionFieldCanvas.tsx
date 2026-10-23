import { ArrowRight } from "lucide-react";
import type { ChannelConnection } from "@/types/connection";
import { ago } from "@/components/marketplace-hub/accounts/hubFormat";
import { connState } from "./healthModel";

interface ConnectionFieldCanvasProps {
  connections: ChannelConnection[];
  /** the network's own status word: STABLE, DEGRADED, CRITICAL */
  networkLabel: string;
  onSelectConnection: (connection: ChannelConnection) => void;
}

export function ConnectionFieldCanvas({ connections, networkLabel, onSelectConnection }: ConnectionFieldCanvasProps) {
  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-bold text-[#111111]">Connection field</h3>
          <span className="text-[11px] font-bold tracking-wider text-[#737373] uppercase">{networkLabel}</span>
        </div>
        <div className="text-[12px] text-[#737373]">
          <span className="font-semibold text-[#111111]">
            {connections.length} endpoint{connections.length === 1 ? "" : "s"}
          </span>{" "}
          · one workspace
        </div>
      </div>

      <div className="relative min-h-[220px] rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-6 overflow-hidden">
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {connections.map((conn) => {
            const st = connState(conn);
            const isCritical = st === "critical";
            const isAttention = st === "attention";
            const isPaused = st === "paused";
            const dotColor = isCritical ? "bg-[#DC2626]" : isAttention ? "bg-[#D97706]" : isPaused ? "bg-[#8A8A8A]" : "bg-[#16A34A]";
            const statusText = isCritical ? "Critical · Needs review" : isAttention ? "Needs attention" : isPaused ? "Paused" : "Healthy · Active";
            // the link to the workspace: continuous when healthy, interrupted when degraded, stopped when unavailable
            const link = isCritical ? { glyph: "⊣", cls: "text-[#DC2626]", label: "Stopped" } : isAttention || isPaused ? { glyph: "- - -", cls: "text-[#D97706]", label: "Interrupted" } : { glyph: "———", cls: "text-[#111111]", label: "Continuous" };

            return (
              <div
                key={conn.id}
                onClick={() => onSelectConnection(conn)}
                className={`rounded-xl border p-4 bg-[#FFFFFF] shadow-sm cursor-pointer transition-all hover:shadow-md ${
                  isCritical ? "border-[#DC2626]/40 hover:border-[#DC2626]" : isAttention ? "border-[#D97706]/40 hover:border-[#D97706]" : "border-[#E5E5E5] hover:border-[#D4D4D4]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-bold text-[#111111]">{conn.name}</span>
                  <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                </div>

                <p className="text-[11px] text-[#737373] mt-1">{statusText}</p>
                <p className="text-[11px] text-[#737373]">Last sync {conn.lastSyncAt && conn.lastSyncAt !== "Never" ? ago(conn.lastSyncAt) : "never"}</p>
                <p className={`mt-1 text-[11px] font-bold ${link.cls}`} title={link.label}>
                  Workspace {link.glyph} {conn.name}
                </p>

                {(isCritical || isAttention) && (
                  <div className="mt-3 pt-2 border-t border-[#F0F0F0] flex items-center justify-between text-[11px] font-semibold text-[#111111]">
                    <span>Review impact</span>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-6 text-[11px] text-[#737373]">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-[#111111]">—</span>
          <span>Continuous</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-[#737373]">- -</span>
          <span>Interrupted</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-[#DC2626]">⊣</span>
          <span>Stopped</span>
        </div>
      </div>
    </div>
  );
}
