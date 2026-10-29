import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { savedLabel, type SaveStatus } from "@/hooks/useProductCreation";
import { ghostButton, outlineButton, solidButton } from "./fieldStyles";

interface Props {
  sidebarCollapsed: boolean;
  canWrite: boolean;
  status: SaveStatus;
  savedAt: string | null;
  saveError: string | null;
  hasDraft: boolean;
  unsaved: boolean;
  savingDraft: boolean;
  continuing: boolean;
  onSaveDraft: () => void;
  onRetry: () => void;
  onBack: () => void;
  onContinue: () => void;
}

/** the persistent bottom bar: Save as draft, the real "Last saved" text, Back and Continue (checks this step only) */
export function ActionBar({ sidebarCollapsed, canWrite, status, savedAt, saveError, hasDraft, unsaved, savingDraft, continuing, onSaveDraft, onRetry, onBack, onContinue }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  let text: string;
  if (status === "saving") text = "Saving...";
  else if (status === "conflict") text = "This draft changed elsewhere";
  else if (status === "error") text = "Could not save";
  else if (hasDraft && savedAt) text = unsaved ? "Unsaved changes" : savedLabel(savedAt, now);
  else text = unsaved ? "Not saved yet" : "Draft starts when you add a product name";

  return (
    <div
      className={`fixed bottom-0 right-0 z-20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between min-h-[72px] py-3 sm:py-0 px-4 sm:px-6 md:px-12 bg-white border-t border-[#EAEAEA] transition-all duration-300 left-0 ${sidebarCollapsed ? "md:left-14" : "md:left-[224px]"}`}
    >
      <div className="flex flex-row flex-wrap items-center gap-2 sm:gap-4">
        <button type="button" onClick={onSaveDraft} disabled={!canWrite || savingDraft || continuing} className={outlineButton}>
          {savingDraft ? "Saving..." : "Save as draft"}
        </button>
        <span className="text-[11px] text-[#666666] leading-[145%]" role="status" aria-live="polite">
          {text}
        </span>
        {status === "error" ? (
          <>
            <span className="text-[11px] text-[#B42318]" title={saveError ?? undefined}>
              {saveError}
            </span>
            <button type="button" className="text-[11px] font-semibold underline cursor-pointer" onClick={onRetry}>
              Retry
            </button>
          </>
        ) : null}
      </div>

      <div className="flex flex-row flex-wrap items-center justify-end gap-2 mt-2 sm:mt-0">
        <span className="hidden sm:inline text-[11px] text-[#666666] leading-[145%] mr-2">Continue checks this step only</span>
        <button type="button" onClick={onBack} className={ghostButton}>
          Back
        </button>
        <button type="button" onClick={onContinue} disabled={!canWrite || continuing || savingDraft} aria-busy={continuing} className={solidButton}>
          <span>{continuing ? "Checking..." : "Continue"}</span>
          <ArrowRight className="w-3.5 h-3.5 text-white" aria-hidden />
        </button>
      </div>
    </div>
  );
}
