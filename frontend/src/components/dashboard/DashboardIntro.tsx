import { formatDay, greetingFor } from "./format";

interface DashboardIntroProps {
  firstName: string | null;
  timeZone?: string;
  /** today in the business time zone, YYYY-MM-DD */
  asOf: string;
}

export const DashboardIntro: React.FC<DashboardIntroProps> = ({ firstName, timeZone, asOf }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6 w-full">
    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
      <span className="text-[10px] font-medium leading-[12px] uppercase tracking-normal text-[#707070]">
        Business overview
      </span>
      <h1 className="text-[22px] sm:text-[26px] font-semibold leading-[130%] sm:leading-[145%] text-[#000000] break-words">
        {greetingFor(firstName, timeZone)}
      </h1>
      <p className="text-[13px] font-normal leading-[145%] text-[#666666]">
        Here&apos;s what needs your attention today.
      </p>
    </div>

    <div className="inline-flex shrink-0 items-center justify-center px-3.5 sm:px-4 h-9 sm:h-10 gap-2 rounded-lg border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] self-start sm:self-auto">
      <span>Today · {formatDay(asOf)}</span>
    </div>
  </div>
);
