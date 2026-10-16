
interface DashboardIntroProps {
  userName?: string;
  dateLabel?: string;
}

export const DashboardIntro: React.FC<DashboardIntroProps> = ({
  userName = "Abhishek",
  dateLabel = "Today · Oct 5, 2026",
}) => {
  return (
    <div className="flex flex-row items-center justify-between gap-6 w-full">
      {/* Greeting info */}
      <div className="flex flex-col gap-1.5 flex-1">
        <span className="text-[10px] font-medium leading-[12px] uppercase tracking-normal text-[#707070]">
          Business overview
        </span>
        <h1 className="text-[26px] font-semibold leading-[145%] text-[#000000]">
          Good morning, {userName}.
        </h1>
        <p className="text-[13px] font-normal leading-[145%] text-[#666666]">
          Here&apos;s what needs your attention today.
        </p>
      </div>

      {/* Date Filter button */}
      <div>
        <button
          type="button"
          className="inline-flex items-center justify-center px-4 h-10 gap-2 rounded-lg border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors"
        >
          <span>{dateLabel}</span>
        </button>
      </div>
    </div>
  );
};

