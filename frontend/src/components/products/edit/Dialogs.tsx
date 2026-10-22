import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ChangeImpact, VersionConflictDetails } from "@/types/productEdit";
import { EFFECT_LABEL } from "./effectLabels";

const SOLID = "flex items-center justify-center h-9 px-4 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white leading-[145%] hover:bg-neutral-800 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const OUTLINE = "flex items-center justify-center h-9 px-4 rounded-[8px] bg-white border border-[#666666] text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const GHOST = "flex items-center justify-center h-9 px-4 rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-100 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const SHELL = "bg-white border border-[#EAEAEA] rounded-[12px] shadow-[0px_12px_40px_rgba(0,0,0,0.094)] text-left font-['Inter',sans-serif]";

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
      <DialogContent className={`max-w-[520px] w-[520px] p-0 gap-0 overflow-hidden ${SHELL}`}>
        <div className="px-6 pt-6 pb-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-[16px] font-semibold text-[#000000] leading-[145%]">{c?.title ?? "This change may affect connected listings."}</DialogTitle>
            <DialogDescription className="text-[13px] font-normal text-[#666666] leading-[145%]">
              {c?.message ?? "Some connected listings may need a review after this change."}
            </DialogDescription>
          </div>
          {c?.mapping && (
            <div className="flex items-center gap-2 text-[12px] leading-[145%]">
              <span className="font-normal text-[#666666]">
                {c.mapping.from ?? "No category"} &rarr; {c.mapping.to ?? "No category"}
              </span>
            </div>
          )}
          {c && c.channels.length > 0 && (
            <ul className="flex flex-col w-full border border-[#EAEAEA] rounded-[8px] overflow-hidden" aria-label="Affected channels">
              {c.channels.map((ch, idx) => (
                <li key={ch.code} className={`flex items-center justify-between px-4 h-11 text-[13px] ${idx < c.channels.length - 1 ? "border-b border-[#EAEAEA]" : ""}`}>
                  <span className="font-normal text-[#000000]">{channelName(ch.code)}</span>
                  <span className="font-normal text-[#666666]">Category mapping review</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#EAEAEA] bg-[#FAFAFA]">
          <button type="button" disabled={saving} onClick={onReview} className="text-[12px] font-semibold text-[#000000] leading-[145%] hover:underline cursor-pointer disabled:opacity-50">
            Review impact
          </button>
          <div className="flex items-center gap-2">
            <button type="button" disabled={saving} onClick={onCancel} className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white border border-[#BDBDBD] text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="button" disabled={saving} onClick={onConfirm} className={SOLID}>
              {saving ? "Saving..." : "Save and continue"}
            </button>
          </div>
        </div>
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
      <DialogContent className={`max-w-[520px] w-[520px] p-6 gap-5 ${SHELL}`}>
        <div className="flex flex-col gap-1">
          <DialogTitle className="text-[18px] font-semibold text-[#000000] leading-[145%]">This product was changed by someone else</DialogTitle>
          <DialogDescription className="text-[13px] font-normal text-[#666666] leading-[145%]">
            {conflict?.updatedBy ? `${conflict.updatedBy.name} saved a newer version` : "A newer version was saved"}
            {conflict?.updatedAt ? ` on ${new Date(conflict.updatedAt).toLocaleString()}` : ""}. Reload to continue from the latest version.
          </DialogDescription>
        </div>
        {changedLabels.length > 0 ? (
          <div className="box-border flex flex-col p-4 gap-1 bg-[#F5F5F5] rounded-[8px] text-[12px] leading-[145%]">
            <p className="font-semibold text-[#000000]">Changed in the latest version</p>
            <ul className="list-disc pl-5 text-[#666666]" aria-label="Fields changed by the other save">
              {changedLabels.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-[12px] text-[#666666] leading-[145%]">The visible fields are the same; other details of the product changed.</p>
        )}
        <div className="flex flex-row flex-wrap items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={GHOST}>
            Keep editing
          </button>
          {hasMyEdits && (
            <button type="button" onClick={() => onReload(true)} className={OUTLINE}>
              Reload and keep my edits
            </button>
          )}
          <button type="button" onClick={() => onReload(false)} className={SOLID}>
            Reload latest
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The design's save-impact dialog: opens on EVERY Save with the real change impact (fetched when the debounced preview has not loaded yet);
 * "Save and continue" posts the save, Cancel returns to the form.
 */
export function SaveImpactDialog({
  open,
  impact,
  loading,
  failed,
  saving,
  mapping,
  onReview,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  impact: ChangeImpact | null;
  loading: boolean;
  failed: boolean;
  saving: boolean;
  mapping: { from: string; to: string } | null;
  onReview: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const rows = (impact?.channels ?? []).filter((c) => c.effect !== "unaffected");
  const potential = impact?.listings.potential ?? 0;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onCancel()}>
      <DialogContent className={`max-w-[520px] w-[520px] p-0 gap-0 overflow-hidden ${SHELL}`}>
        <div className="px-6 pt-6 pb-5 flex flex-col gap-4" aria-busy={loading}>
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-[16px] font-semibold text-[#000000] leading-[145%]">This change may affect connected listings.</DialogTitle>
            <DialogDescription className="text-[13px] font-normal text-[#666666] leading-[145%]">
              {loading
                ? "Checking what this change affects..."
                : failed
                  ? "The impact could not be checked right now. Nothing is sent to listings until you save."
                  : potential > 0
                    ? `${potential} marketplace ${potential === 1 ? "listing" : "listings"} may be affected.`
                    : "No connected listings will be affected."}
            </DialogDescription>
          </div>
          {mapping && (
            <div className="flex items-center gap-2 text-[12px] leading-[145%]">
              <span className="font-normal text-[#666666]">
                {mapping.from} &rarr; {mapping.to}
              </span>
            </div>
          )}
          {!loading && rows.length > 0 && (
            <ul className="flex flex-col w-full border border-[#EAEAEA] rounded-[8px] overflow-hidden" aria-label="Affected channels">
              {rows.map((ch, idx) => (
                <li key={ch.accountId} className={`flex items-center justify-between px-4 h-11 text-[13px] ${idx < rows.length - 1 ? "border-b border-[#EAEAEA]" : ""}`}>
                  <span className="font-normal text-[#000000]">{ch.name}</span>
                  <span className="font-normal text-[#666666]">{ch.mappingState === "needs_review" || ch.effect === "may_need_remapping" ? "Category mapping review" : EFFECT_LABEL[ch.effect]}</span>
                </li>
              ))}
            </ul>
          )}
          {!loading && impact?.notSentNote && <p className="text-[11px] font-normal text-[#666666] leading-[145%]">{impact.notSentNote}</p>}
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#EAEAEA] bg-[#FAFAFA]">
          <button type="button" disabled={saving} onClick={onReview} className="text-[12px] font-semibold text-[#000000] leading-[145%] hover:underline cursor-pointer disabled:opacity-50">
            Review impact
          </button>
          <div className="flex items-center gap-2">
            <button type="button" disabled={saving} onClick={onCancel} className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-white border border-[#BDBDBD] text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="button" disabled={saving || loading} onClick={onConfirm} className={SOLID}>
              {saving ? "Saving..." : "Save and continue"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Unsaved navigation protection */
export function LeaveDialog({ open, saving, onKeep, onDiscard, onSave }: { open: boolean; saving: boolean; onKeep: () => void; onDiscard: () => void; onSave: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onKeep()}>
      <DialogContent className={`max-w-[480px] w-[480px] p-6 gap-5 ${SHELL}`}>
        <DialogTitle className="text-[18px] font-semibold text-[#000000] leading-[145%]">You have unsaved changes</DialogTitle>
        <DialogDescription className="text-[13px] font-normal text-[#000000] leading-[145%] -mt-2">Your latest edits will be lost if you leave now.</DialogDescription>
        <div className="flex flex-row items-center justify-end gap-2 pt-2">
          <button type="button" disabled={saving} onClick={onKeep} className={GHOST}>
            Keep editing
          </button>
          <button type="button" disabled={saving} onClick={onDiscard} className={OUTLINE}>
            Discard changes
          </button>
          <button type="button" disabled={saving} onClick={onSave} className={SOLID}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
