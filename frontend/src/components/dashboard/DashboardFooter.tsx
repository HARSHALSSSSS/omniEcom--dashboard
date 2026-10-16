

interface DashboardFooterProps {
  lastSyncedText?: string;
  systemStatusText?: string;
}

export const DashboardFooter: React.FC<DashboardFooterProps> = ({
  lastSyncedText = "Last synced 2 minutes ago",
  systemStatusText = "All systems operational",
}) => {
  return (
    <footer className="w-full pt-5 pb-6 border-t border-[#EAEAEA] flex items-center justify-between text-[11px] font-normal leading-[145%] text-[#666666]">
      <span>{lastSyncedText}</span>
      <div className="flex items-center gap-1.5">
        <span className="h-1 w-1 rounded-full bg-[#666666]" />
        <span>{systemStatusText}</span>
      </div>
    </footer>
  );
};

