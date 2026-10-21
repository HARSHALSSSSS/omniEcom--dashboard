import { HelpCircle, X } from "lucide-react";

export interface Notice {
  tone: "resolved" | "snoozed" | "info" | "error";
  heading: string;
  description: string;
  /** failed ids of a bulk action: "title: reason" lines */
  details?: string[];
  historyLink?: boolean;
}

const TONE = {
  resolved: "bg-[#EDF9F5] border-[#16816A]",
  snoozed: "bg-[#F0EDFC] border-[#7661C8]",
  info: "bg-[#F0EDFC] border-[#7661C8]",
  error: "bg-[#FFF1F3] border-[#D74B61]",
} as const;

/** a banner above the list: what an action just did (taken from the server's answer), or why it failed */
export function QueueNotice({ notice, onHistory, onDismiss }: { notice: Notice; onHistory: () => void; onDismiss?: () => void }) {
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      style={{ boxShadow: "0px 3px 10px rgba(36, 50, 75, 0.055)" }}
      className={`flex flex-row items-center p-4 gap-3 w-full border rounded-[12px] animate-in fade-in duration-150 ${TONE[notice.tone]}`}
    >
      <HelpCircle className="w-4 h-4 text-[#666666] shrink-0" />
      <div className="flex flex-col gap-[3px] flex-1">
        <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">{notice.heading}</span>
        <span className="text-[12px] font-normal text-[#666666] leading-[145%]">{notice.description}</span>
        {notice.details && notice.details.length > 0 && (
          <ul className="text-[12px] font-normal text-[#666666] leading-[145%] list-disc pl-4">
            {notice.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </div>
      {notice.historyLink && (
        <button
          type="button"
          onClick={onHistory}
          className="h-9 px-4 rounded-[8px] bg-[#FFFFFF] border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center justify-center shrink-0 min-w-[124px] cursor-pointer"
        >
          View history
        </button>
      )}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="w-5 h-5 flex items-center justify-center text-[#666666] hover:text-[#000000]">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
