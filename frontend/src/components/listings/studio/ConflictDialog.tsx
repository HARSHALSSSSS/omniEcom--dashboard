import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Someone else saved this listing first (409 VERSION_CONFLICT) */
export function ConflictDialog({ open, hasMyEdits, onReload, onClose }: { open: boolean; hasMyEdits: boolean; onReload: (keepMine: boolean) => void; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            This listing was changed by someone else
          </DialogTitle>
          <DialogDescription>A newer version was saved while you were editing. Reload to continue from the latest version.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Keep editing
          </Button>
          {hasMyEdits && (
            <Button type="button" variant="outline" size="sm" onClick={() => onReload(true)}>
              Reload and keep my edits
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => onReload(false)}>
            Reload latest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
