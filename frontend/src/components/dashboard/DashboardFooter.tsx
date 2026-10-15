

interface DashboardFooterProps {
  lastSyncedText?: string;
  systemStatusText?: string;
}

export const DashboardFooter: React.FC<DashboardFooterProps> = ({
  lastSyncedText = "Last synced 2 minutes ago",
  systemStatusText = "All systems operational",
}) => {
  return (
    <footer className="w-full pt-5 pb-8 border-t border-[#EAEAEA] flex items-center justify-between text-[11px] text-[#666666]">
      <span>{lastSyncedText}</span>
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span>{systemStatusText}</span>
      </div>
    </footer>
  );
};
