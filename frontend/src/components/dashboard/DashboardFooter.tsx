import type { Dashboard } from "@/types/dashboard";
import { relativeTime } from "./format";

interface DashboardFooterProps {
  sync: NonNullable<Dashboard["sync"]>;
}

export const DashboardFooter: React.FC<DashboardFooterProps> = ({ sync }) => {
  const ok = sync.systemStatus === "operational";
  return (
    <footer className="w-full pt-5 pb-6 border-t border-[#EAEAEA] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-normal leading-[145%] text-[#666666]">
      <span>{sync.lastSyncedAt ? `Last synced ${relativeTime(sync.lastSyncedAt)}` : "No channel has synced yet"}</span>
      <div className="flex items-center gap-1.5">
        <span className={`h-1 w-1 rounded-full ${ok ? "bg-[#666666]" : "bg-[#D97706]"}`} />
        <span>{ok ? "All systems operational" : "Some connections need attention"}</span>
      </div>
    </footer>
  );
};
