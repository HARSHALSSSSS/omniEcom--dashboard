import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ChangeImpact, VersionConflictDetails } from "@/types/productEdit";

/** Category / product type change: the server asked for confirmation (409 confirmation_required) */
export function ConfirmImpactDialog({
  impact,
  saving,
  onReview,
  onCancel,
  onConfirm,
}: {
  impact: ChangeImpact | null;
  saving: boolean;
  onReview: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const c = impact?.confirmation;
  const channelName = (code: string) => impact?.channels.find((x) => x.code === code)?.name ?? code;
  return (
    <Dialog open={!!impact} onOpenChange={(o) => !o && !saving && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            {c?.title ?? "This change may affect connected listings."}
          </DialogTitle>
          <DialogDescription>{c?.message ?? "Some connected listings may need a review after this change."}</DialogDescription>
        </DialogHeader>
        {c?.mapping && (
          <p className="rounded-md bg-muted/60 p-3 text-sm font-medium">
            {c.mapping.from ?? "No category"} &rarr; {c.mapping.to ?? "No category"}
          </p>
        )}
        {c && c.channels.length > 0 && (
          <ul className="space-y-1 text-sm" aria-label="Affected channels">
            {c.channels.map((ch) => (
              <li key={ch.code} className="flex items-center justify-between">
                <span>{channelName(ch.code)}</span>
                <span className="text-amber-700">Category mapping review</span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onReview}>
            Review impact
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" loading={saving} onClick={onConfirm}>
            Save and continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Someone else saved first (409 VERSION_CONFLICT): show what changed and offer to reload */
export function ConflictDialog({
  conflict,
  changedLabels,
  hasMyEdits,
  onReload,
  onClose,
}: {
  conflict: VersionConflictDetails | null;
  changedLabels: string[];
  hasMyEdits: boolean;
  onReload: (keepMine: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!conflict} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            This product was changed by someone else
          </DialogTitle>
          <DialogDescription>
            {conflict?.updatedBy ? `${conflict.updatedBy.name} saved a newer version` : "A newer version was saved"}
            {conflict?.updatedAt ? ` on ${new Date(conflict.updatedAt).toLocaleString()}` : ""}. Reload to continue from the latest version.
          </DialogDescription>
        </DialogHeader>
        {changedLabels.length > 0 ? (
          <div className="text-sm">
            <p className="mb-1 font-medium">Changed in the latest version</p>
            <ul className="list-disc pl-5 text-muted-foreground" aria-label="Fields changed by the other save">
              {changedLabels.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">The visible fields are the same; other details of the product changed.</p>
        )}
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

/** Unsaved navigation protection */
export function LeaveDialog({ open, saving, onKeep, onDiscard, onSave }: { open: boolean; saving: boolean; onKeep: () => void; onDiscard: () => void; onSave: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onKeep()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>You have unsaved changes</DialogTitle>
          <DialogDescription>Your latest edits will be lost if you leave now.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onKeep}>
            Keep editing
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onDiscard}>
            Discard changes
          </Button>
          <Button type="button" size="sm" loading={saving} onClick={onSave}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
