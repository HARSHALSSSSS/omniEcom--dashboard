import { Check } from "lucide-react";
import { errorMessage } from "@/api/errors";

export function QueueSkeleton({ label = "Loading issues..." }: { label?: string }) {
  return (
    <div className="flex flex-col gap-4 w-full animate-pulse" role="status" aria-label={label}>
      <div className="flex flex-col gap-2 w-full">
        <div className="hidden lg:flex flex-row items-center px-4 h-10 gap-3 text-[11px] font-medium leading-[145%] text-[#666666]">
          <div className="w-4 h-4 rounded-[3px] border border-[#BDBDBD] bg-white shrink-0" />
          <span className="w-[66px] shrink-0">Priority</span>
          <span className="flex-1 min-w-[280px]">Issue</span>
          <span className="w-[76px] shrink-0">Area</span>
          <span className="w-[138px] shrink-0">Impact</span>
          <span className="w-[102px] shrink-0">Due</span>
          <span className="w-[142px] shrink-0 text-right">Action</span>
        </div>
        {[0, 1, 2, 3, 4].map((idx) => (
          <div
            key={idx}
            style={{ boxShadow: "0px 3px 10px rgba(36, 50, 75, 0.055)" }}
            className="w-full bg-white border-l-4 border-l-[#7661C8] border-t border-r border-b border-[#EAEAEA] rounded-[12px] grid grid-cols-[auto_auto_1fr_auto] lg:flex lg:flex-row items-center px-4 py-3.5 lg:py-0 lg:h-[80px] gap-x-2.5 sm:gap-x-3 gap-y-2 lg:gap-3"
          >
            <div className="w-4 h-4 rounded-[3px] bg-[#F5F5F5] shrink-0 order-1 lg:order-none" />
            <div className="w-[54px] lg:w-[66px] shrink-0 flex items-center order-2 lg:order-none">
              <div className="w-[54px] h-2.5 rounded-[3px] bg-[#F5F5F5]" />
            </div>
            <div className="order-5 lg:order-none col-span-full lg:col-span-1 flex-1 w-full lg:min-w-[280px] flex flex-col gap-2 pr-4">
              <div className="w-[276px] max-w-full h-2.5 rounded-[3px] bg-[#F5F5F5]" />
              <div className="w-[326px] max-w-full h-2 rounded-[3px] bg-[#F5F5F5]" />
            </div>
            <div className="w-[54px] lg:w-[76px] shrink-0 order-3 lg:order-none">
              <div className="w-[54px] h-2.5 rounded-[3px] bg-[#F5F5F5]" />
            </div>
            <div className="w-auto lg:w-[138px] col-span-2 lg:col-span-1 shrink-0 order-6 lg:order-none">
              <div className="w-[108px] h-2.5 rounded-[3px] bg-[#F5F5F5]" />
            </div>
            <div className="w-auto lg:w-[102px] shrink-0 order-4 lg:order-none justify-self-end text-right">
              <div className="w-[54px] h-2.5 rounded-[3px] bg-[#F5F5F5]" />
            </div>
            <div className="w-auto lg:w-[142px] col-span-2 lg:col-span-1 shrink-0 flex justify-end order-7 lg:order-none">
              <div className="w-[54px] h-2.5 rounded-[3px] bg-[#F5F5F5]" />
            </div>
          </div>
        ))}
      </div>
      <div className="pt-1">
        <span className="text-[12px] font-normal leading-[145%] text-[#666666]">{label}</span>
      </div>
    </div>
  );
}

interface EmptyProps {
  filtered: boolean;
  onClear: () => void;
  onDashboard: () => void;
  onActivity: () => void;
}

/** nothing in the queue: either the filters match nothing, or the business really is caught up */
export function QueueEmpty({ filtered, onClear, onDashboard, onActivity }: EmptyProps) {
  return (
    <div
      style={{ boxShadow: "0px 3px 10px rgba(36, 50, 75, 0.055)" }}
      className="w-full min-h-[400px] sm:h-[480px] py-8 sm:py-0 bg-white border border-[#E4E7EF] rounded-[18px] flex flex-col justify-center items-center gap-3.5 px-6 animate-in fade-in duration-150"
    >
      <div className="w-9 h-9 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0">
        <Check className="w-[18px] h-[18px] text-[#666666] stroke-[2]" />
      </div>
      <h2 className="text-[18px] font-semibold leading-[145%] text-[#000000] text-center max-w-[560px]">{filtered ? "No issues match these filters." : "You’re all caught up."}</h2>
      <p className="text-[13px] font-normal leading-[145%] text-[#666666] text-center max-w-[560px]">
        {filtered ? "Try another tab or clear the filters to see the rest of the queue." : "There are no outstanding issues requiring your attention right now."}
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 w-full sm:w-auto">
        {filtered ? (
          <button
            type="button"
            onClick={onClear}
            className="w-full sm:w-auto h-10 min-h-[44px] sm:min-h-0 px-4 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors flex items-center justify-center shrink-0 min-w-0 sm:min-w-[154px]"
          >
            Clear filters
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onDashboard}
              className="w-full sm:w-auto h-10 min-h-[44px] sm:min-h-0 px-4 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors flex items-center justify-center shrink-0 min-w-0 sm:min-w-[154px]"
            >
              Go to dashboard
            </button>
            <button
              type="button"
              onClick={onActivity}
              className="w-full sm:w-auto h-10 min-h-[44px] sm:min-h-0 px-4 rounded-[8px] bg-[#FFFFFF] border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center justify-center shrink-0 min-w-0 sm:min-w-[126px]"
            >
              View activity
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function QueueError({ error, onRetry, what = "issues" }: { error: unknown; onRetry: () => void; what?: string }) {
  return (
    <div
      role="alert"
      style={{ boxShadow: "0px 3px 10px rgba(36, 50, 75, 0.055)" }}
      className="w-full bg-white border border-[#F2CAD2] rounded-[18px] flex flex-col justify-center items-center gap-3 px-6 py-16"
    >
      <h2 className="text-[18px] font-semibold leading-[145%] text-[#000000] text-center">{`Couldn’t load ${what}`}</h2>
      <p className="text-[13px] font-normal leading-[145%] text-[#666666] text-center max-w-[560px]">{errorMessage(error)}</p>
      <button
        type="button"
        onClick={onRetry}
        className="w-full sm:w-auto h-10 min-h-[44px] sm:min-h-0 px-4 rounded-[8px] bg-[#FFFFFF] border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center justify-center"
      >
        Try again
      </button>
    </div>
  );
}
