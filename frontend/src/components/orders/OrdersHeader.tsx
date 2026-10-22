import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, RotateCw } from "lucide-react";
import { NO_WRITE_REASON } from "./orderFormat";

const BUTTON = "box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60";
const TEXT = "text-[12px] font-normal leading-[145%] text-[#666666]";

interface OrdersHeaderProps {
  refreshing: boolean;
  onRefresh: () => void;
  exporting: boolean;
  onExport: () => void;
  /** a marketplace account is connected, so the order import can be started */
  canSync: boolean;
  canWrite: boolean;
  syncing: boolean;
  onSync: () => void;
}

/** the page title with Refresh, Export (the filtered list as CSV) and the "More" menu (import the latest orders) */
export function OrdersHeader({ refreshing, onRefresh, exporting, onExport, canSync, canWrite, syncing, onSync }: OrdersHeaderProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
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

  return (
    <div className="w-full flex flex-row flex-wrap justify-between items-center gap-3 min-h-[73px]">
      <div className="flex flex-col items-start gap-[2px]">
        <span className="text-[10px] font-medium leading-[12px] uppercase text-[#707070]">ORDER OPERATIONS</span>
        <h1 className="text-[26px] font-semibold leading-[145%] text-[#000000] m-0 p-0">Orders</h1>
        <p className="text-[13px] font-normal leading-[145%] text-[#666666] m-0">All connected orders, unified into one operational workflow.</p>
      </div>

      <div className="flex flex-row items-center gap-3 h-[32px]">
        <button type="button" onClick={onRefresh} className={BUTTON}>
          <RotateCw className={`w-[14px] h-[14px] text-[#666666] stroke-[1.5px] ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          <span className={TEXT}>Refresh</span>
        </button>

        <button type="button" onClick={onExport} disabled={exporting} title="Download the orders in this list as a CSV file" className={BUTTON}>
          <Download className="w-[14px] h-[14px] text-[#666666] stroke-[1.5px]" aria-hidden />
          <span className={TEXT}>{exporting ? "Exporting..." : "Export"}</span>
        </button>

        {canSync && (
          <div className="relative" ref={root}>
            <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={BUTTON}>
              <span className={TEXT}>{syncing ? "Syncing orders..." : "More"}</span>
              <ChevronDown className="w-3 h-3 text-[#666666] stroke-[1.5px]" aria-hidden />
            </button>
            {open && (
              <div role="menu" aria-label="More" className="absolute right-0 top-[36px] z-30 w-[240px] bg-white border border-[#EAEAEA] rounded-lg shadow-[0px_4px_12px_rgba(0,0,0,0.08)] p-1 text-[12px]">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canWrite || syncing}
                  title={canWrite ? "Import the latest orders from every connected marketplace" : NO_WRITE_REASON}
                  onClick={() => {
                    setOpen(false);
                    onSync();
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left font-medium text-[#000000] hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent cursor-pointer"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden />
                  {syncing ? "Syncing..." : "Sync orders"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
