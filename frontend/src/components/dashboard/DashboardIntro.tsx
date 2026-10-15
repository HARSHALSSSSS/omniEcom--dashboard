
import { Calendar } from "lucide-react";

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
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[#707070]">
          Business Overview
        </span>
        <h1 className="text-[22px] font-semibold tracking-tight text-[#000000]">
          Good morning, {userName}.
        </h1>
        <p className="text-[13px] text-[#666666]">
          Here&apos;s what needs your attention today.
        </p>
      </div>

      {/* Date Filter button */}
      <div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-[#EAEAEA] bg-white px-3.5 py-2 text-[12px] font-medium text-[#000000] hover:bg-neutral-50 shadow-2xs transition-colors"
        >
          <Calendar className="h-3.5 w-3.5 text-[#666666]" />
          <span>{dateLabel}</span>
        </button>
      </div>
    </div>
  );
};
