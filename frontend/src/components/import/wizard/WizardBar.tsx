import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** the sticky bar under every step: what is going on, Cancel, Save as draft and the step's own primary action (children) */
export function WizardBar({ status, onCancel, onSaveDraft, children }: { status: ReactNode; onCancel: () => void; onSaveDraft: () => void; children?: ReactNode }) {
  return (
    <div className="fixed bottom-0 left-0 lg:left-[224px] right-0 h-[72px] border-t border-[#E3E3E3] dark:border-border bg-white dark:bg-background px-10 z-40 flex items-center justify-between">
      <div className="text-[12px] leading-[18px] font-normal text-[#666666]">{status}</div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={onCancel}
          className="w-[72px] h-[36px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 bg-white dark:bg-card rounded-[5px] text-[12px] leading-[18px] font-medium px-0"
        >
          Cancel
        </Button>
        <Button
          variant="outline"
          onClick={onSaveDraft}
          className="w-[116px] h-[36px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 bg-white dark:bg-card rounded-[5px] text-[12px] leading-[18px] font-medium px-0"
        >
          Save as draft
        </Button>
        {children}
      </div>
    </div>
  );
}
