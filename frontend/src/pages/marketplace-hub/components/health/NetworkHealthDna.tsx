import type { Level } from "./healthModel";

export interface DnaDimension {
  label: string;
  status: Level;
  /** how full the bar is (0-100): the success rate of the dimension; omit when the dimension has no rate */
  value?: number | null;
  /** one line of the facts behind the status, e.g. "92% of 12 runs" */
  detail?: string;
}

interface NetworkHealthDnaProps {
  dimensions: DnaDimension[];
}

export function NetworkHealthDna({ dimensions }: NetworkHealthDnaProps) {
  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-[#111111]">Network health DNA</h3>
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A8A8A]">DIAGNOSTIC HEALTH · ACROSS ALL CONNECTIONS</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-6 pt-2">
        {dimensions.map((dim) => {
          const isError = dim.status === "error";
          const isAttention = dim.status === "warning";
          const isIdle = dim.status === "idle";
          const statusText = isError ? "Critical" : isAttention ? "Attention" : isIdle ? "No data" : "Healthy";
          const textColor = isError ? "text-[#DC2626]" : isAttention ? "text-[#D97706]" : isIdle ? "text-[#8A8A8A]" : "text-[#16A34A]";
          const barColor = isError ? "bg-[#DC2626]" : isAttention ? "bg-[#D97706]" : isIdle ? "bg-[#D4D4D4]" : "bg-[#16A34A]";
          const width = isIdle ? 0 : Math.max(4, Math.min(100, dim.value ?? 100));

          return (
            <div key={dim.label} className="space-y-2" data-status={dim.status}>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[#525252] font-medium">{dim.label}</span>
                <span className={`font-semibold ${textColor}`}>{statusText}</span>
              </div>
              <div className="h-1.5 w-full bg-[#F0F0F0] rounded-full overflow-hidden">
                <div className={`h-full ${barColor} rounded-full`} style={{ width: `${width}%` }} />
              </div>
              {dim.detail && <p className="text-[11px] text-[#737373]">{dim.detail}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
