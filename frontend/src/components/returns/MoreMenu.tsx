import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { ROUTES } from "@/constants/routes";

export interface MoreMenuProps {
  onExportAttention: () => void;
  exportingAttention: boolean;
  onRefresh: () => void;
  /** reopens the report of the last sync; null when there is none yet */
  onShowSyncReport: (() => void) | null;
}

const ITEM = "flex w-full cursor-pointer items-center px-3 py-2 text-left text-[12px] text-black hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";

/** the "..." of the header: the attention list as a CSV, a refresh of every number, the last sync report and the marketplace connections */
export function MoreMenu({ onExportAttention, exportingAttention, onRefresh, onShowSyncReport }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-[34px] w-9 cursor-pointer items-center justify-center rounded-lg border border-[#EAEAEA] bg-white text-[12px] text-[#000000] shadow-2xs transition-colors hover:bg-neutral-50"
      >
        <MoreHorizontal className="h-4 w-4 text-[#666666]" />
      </button>
      {open && (
        <div role="menu" aria-label="More actions" className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-[#EAEAEA] bg-white py-1 shadow-lg">
          <button type="button" role="menuitem" disabled={exportingAttention} onClick={run(onExportAttention)} className={ITEM}>
            {exportingAttention ? "Exporting..." : "Export attention list (CSV)"}
          </button>
          <button type="button" role="menuitem" onClick={run(onRefresh)} className={ITEM}>
            Refresh numbers
          </button>
          <button type="button" role="menuitem" disabled={!onShowSyncReport} onClick={onShowSyncReport ? run(onShowSyncReport) : undefined} className={ITEM}>
            Last sync report
          </button>
          <Link role="menuitem" to={ROUTES.MARKETPLACE_HUB} onClick={() => setOpen(false)} className={ITEM}>
            Marketplace connections
          </Link>
        </div>
      )}
    </div>
  );
}
