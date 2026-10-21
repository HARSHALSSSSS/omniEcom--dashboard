import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Someone else changed the proposal or policy first (409 VERSION_CONFLICT) */
export function ConflictDialog({ open, what, onReload, onClose }: { open: boolean; what: string; onReload: () => void; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            This {what} was changed by someone else
          </DialogTitle>
          <DialogDescription>A newer version was saved after you opened it. Nothing was changed. Reload to review the latest version before deciding again.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button type="button" size="sm" onClick={onReload}>
            Reload latest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
