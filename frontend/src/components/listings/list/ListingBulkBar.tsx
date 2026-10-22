import { Check, Loader2 } from "lucide-react";
import type { ListingBulkAction } from "@/types/listing";
import { ListingMenu } from "./ListingMenu";
import { NO_WRITE_REASON } from "./listingFormat";

interface ListingBulkBarProps {
  count: number;
  /** the API takes at most this many listings in one call */
  max: number;
  /** the "Not listed" tab selects variants: its one action creates draft listings */
  mode: "listings" | "variants";
  canWrite: boolean;
  busy: boolean;
  /** the action that is running (shows a spinner on it) */
  running: ListingBulkAction | "create" | null;
  onAction: (action: ListingBulkAction) => void;
  onCreate: () => void;
  onEdit: () => void;
  onExport: () => void;
  onAudit: () => void;
  onFullReview: () => void;
  onToggleAll: () => void;
  onClear: () => void;
}

const GHOST = "h-8 cursor-pointer rounded-lg border border-[#BDBDBD] bg-white px-3 text-[12px] font-medium text-black transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY = "flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-black px-4 text-[12px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50";

/** the bar over the table while rows are selected: edit, publish, unpublish, sync, export and a More menu */
export function ListingBulkBar({ count, max, mode, canWrite, busy, running, onAction, onCreate, onEdit, onExport, onAudit, onFullReview, onToggleAll, onClear }: ListingBulkBarProps) {
  const off = busy || !canWrite;
  const reason = canWrite ? undefined : NO_WRITE_REASON;
  const noun = mode === "variants" ? (count === 1 ? "product" : "products") : count === 1 ? "listing" : "listings";
  const spin = (a: ListingBulkAction | "create") => running === a && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />;

  return (
    <div role="toolbar" aria-label="Bulk actions" className="mb-3 flex min-h-12 w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-[#EAEAEA] bg-white px-4 py-2">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onToggleAll} aria-label="Toggle all selection" title="Toggle all selection" className="flex h-4 w-4 cursor-pointer items-center justify-center rounded bg-black text-white">
          <Check className="h-3 w-3 stroke-[3]" aria-hidden />
        </button>
        <span className="text-[13px] font-semibold tracking-tight text-black" aria-live="polite">
          {count} {noun} selected
        </span>
        <span className="text-[11px] text-[#666666]">Up to {max} at a time</span>
      </div>

      <div className="flex items-center gap-2">
        {mode === "variants" ? (
          <>
            <button type="button" className={PRIMARY} disabled={off} title={reason} onClick={onCreate}>
              {spin("create")}
              {running === "create" ? "Creating…" : "Create listings"}
            </button>
            <button type="button" className={GHOST} onClick={onClear}>
              Deselect all
            </button>
          </>
        ) : (
          <>
            <button type="button" className={GHOST} onClick={onEdit}>
              Edit content
            </button>
            <button type="button" className={PRIMARY} disabled={off} title={reason} onClick={() => onAction("publish")}>
              {spin("publish")}
              {running === "publish" ? "Publishing…" : "Publish"}
            </button>
            <button type="button" className={GHOST} disabled={off} title={reason} onClick={() => onAction("unpublish")}>
              Unpublish
            </button>
            <button type="button" className={GHOST} disabled={off} title={reason} onClick={() => onAction("sync_inventory")}>
              Sync
            </button>
            <button type="button" className={GHOST} onClick={onExport}>
              Export
            </button>
            <ListingMenu
              label="More"
              buttonClassName={`${GHOST} flex items-center gap-1`}
              menuClassName="w-44"
              items={[
                { label: "Validate", onSelect: () => onAction("validate"), disabled: off, title: reason },
                { label: "Retry failed", onSelect: () => onAction("retry"), disabled: off, title: reason },
                { label: "Audit readiness", onSelect: onAudit },
                { label: "Full review screen →", onSelect: onFullReview },
                { label: "Deselect all", onSelect: onClear, danger: true },
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}
