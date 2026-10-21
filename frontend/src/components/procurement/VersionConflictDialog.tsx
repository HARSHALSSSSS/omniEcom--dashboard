import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface VersionConflictDialogProps {
  open: boolean;
  /** "purchase order" or "supplier" */
  noun: string;
  /** the form holds edits the person has not saved */
  hasMyEdits: boolean;
  busy?: boolean;
  /** `keepMine`: take the newest version number but keep what was typed (the next save overwrites the other change) */
  onReload: (keepMine: boolean) => void;
  onClose: () => void;
}

export function VersionConflictDialog({ open, noun, hasMyEdits, busy, onReload, onClose }: VersionConflictDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
            This {noun} was changed by someone else
          </DialogTitle>
          <DialogDescription>
            A newer version was saved while you were working. Reload the latest version{hasMyEdits ? ", or keep your edits and save them over it" : ""}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            Close
          </Button>
          {hasMyEdits && (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onReload(true)}>
              Keep my edits
            </Button>
          )}
          <Button type="button" size="sm" loading={busy} onClick={() => onReload(false)}>
            Reload latest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
