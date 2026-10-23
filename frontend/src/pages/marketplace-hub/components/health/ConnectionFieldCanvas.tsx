import { ArrowRight } from "lucide-react";
import type { ChannelConnection } from "@/types/connection";

interface ConnectionFieldCanvasProps {
  connections: ChannelConnection[];
  onSelectConnection: (connection: ChannelConnection) => void;
}

export function ConnectionFieldCanvas({
  connections,
  onSelectConnection,
}: ConnectionFieldCanvasProps) {
  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm space-y-4">
      {/* Canvas Top Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-bold text-[#111111]">
            Connection field
          </h3>
          <span className="text-[11px] font-bold tracking-wider text-[#737373] uppercase">
            STABLE
          </span>
        </div>
        <div className="text-[12px] text-[#737373]">
          <span className="font-semibold text-[#111111]">{connections.length} endpoints</span> · one workspace
        </div>
      </div>

      {/* 2D Canvas Diagram Area */}
      <div className="relative min-h-[220px] rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-6 overflow-hidden">
        {/* Subtle connecting lines */}
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none stroke-[#D4D4D4]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M 120 50 L 300 50 L 300 120 L 450 120" fill="none" strokeWidth="1.5" />
          <path d="M 160 140 L 300 140" fill="none" strokeWidth="1.5" strokeDasharray="3 3" />
          <path d="M 300 120 L 300 180 L 450 180" fill="none" strokeWidth="1.5" />
        </svg>

        {/* Nodes Grid */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {connections.map((conn) => {
            const isCritical = conn.status === "error";
            const isAttention = conn.status === "warning";

            const dotColor = isCritical
              ? "bg-[#DC2626]"
              : isAttention
              ? "bg-[#D97706]"
              : "bg-[#16A34A]";

            const statusText = isCritical
              ? "Critical · Needs review"
              : isAttention
              ? "Needs attention"
              : "Healthy · Active";

            return (
              <div
                key={conn.id}
                onClick={() => onSelectConnection(conn)}
                className={`rounded-xl border p-4 bg-[#FFFFFF] shadow-sm cursor-pointer transition-all hover:shadow-md ${
                  isCritical
                    ? "border-[#DC2626]/40 hover:border-[#DC2626]"
                    : isAttention
                    ? "border-[#D97706]/40 hover:border-[#D97706]"
                    : "border-[#E5E5E5] hover:border-[#D4D4D4]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-bold text-[#111111]">
                    {conn.name}
                  </span>
                  <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                </div>

                <p className="text-[11px] text-[#737373] mt-1">
                  {statusText}
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

      {/* Legend Footer */}
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
