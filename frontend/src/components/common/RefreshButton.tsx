import React from "react";
import { RotateCw } from "lucide-react";

interface RefreshButtonProps {
  onRefresh: () => void;
  spinning?: boolean;
  label?: string;
}

/** The thin "Refresh" control the page headers share: re-reads the page's data, nothing else */
export const RefreshButton: React.FC<RefreshButtonProps> = ({ onRefresh, spinning = false, label = "Refresh" }) => (
  <button
    type="button"
    onClick={onRefresh}
    className="box-border flex h-[34px] cursor-pointer flex-row items-center gap-[6px] rounded-lg border border-[#EAEAEA] bg-white px-[10px] transition-colors hover:bg-neutral-50"
  >
    <RotateCw className={`h-[14px] w-[14px] stroke-[1.5px] text-[#666666] ${spinning ? "animate-spin" : ""}`} aria-hidden />
    <span className="text-[12px] font-normal leading-[145%] text-[#666666]">{label}</span>
  </button>
);
