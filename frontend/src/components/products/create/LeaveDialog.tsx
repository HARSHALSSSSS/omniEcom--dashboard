import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { errorClass, ghostButton, outlineButton, solidButton } from "./fieldStyles";

interface Props {
  open: boolean;
  productName: string;
  /** a draft exists on the server (so "discard" removes it) */
  hasDraft: boolean;
  /** there are changes the server does not have yet */
  unsaved: boolean;
  busy: boolean;
  error: string | null;
  onStay: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

/** "Save changes before leaving?" (Figma: leave confirmation) with real Save draft / Discard */
export function LeaveDialog({ open, productName, hasDraft, unsaved, busy, error, onStay, onSave, onDiscard }: Props) {
  const name = productName.trim() || "this product";
  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !busy ? onStay() : undefined)}>
      <DialogContent className="max-w-[480px] w-full sm:w-[480px] p-6 bg-white border border-[#EAEAEA] rounded-[12px] shadow-[0px_12px_40px_rgba(0,0,0,0.094)] gap-5 text-left overflow-hidden">
        <DialogTitle className="text-[18px] font-semibold text-[#000000] leading-[145%] break-words [overflow-wrap:anywhere]">Save changes before leaving?</DialogTitle>
        <DialogDescription className="text-[13px] font-normal text-[#000000] leading-[145%] -mt-1 break-words [overflow-wrap:anywhere] [word-break:break-word]">
          {unsaved
            ? `You have unsaved changes to ${name}. Save a draft to keep your work, or discard ${hasDraft ? "this draft" : "the changes"} and leave.`
            : `${name} is saved as a draft. Keep it to continue later, or discard the draft and leave.`}
        </DialogDescription>
        <p className="text-[11px] font-normal text-[#666666] leading-[145%] -mt-2">Draft saving is available even when this step needs a correction. Nothing is published.</p>
        {error ? (
          <p role="alert" className={`${errorClass} break-words [overflow-wrap:anywhere]`}>
            {error}
          </p>
        ) : null}
        <div className="flex flex-row items-center justify-end gap-2 pt-2">
          <button type="button" className={ghostButton} onClick={onStay} disabled={busy}>
            Stay
          </button>
          <button type="button" className={outlineButton} onClick={onDiscard} disabled={busy}>
            {hasDraft ? "Discard draft" : "Discard changes"}
          </button>
          <button type="button" className={solidButton} onClick={onSave} disabled={busy}>
            {unsaved ? "Save draft" : "Keep draft"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
