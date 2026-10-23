import React from "react";
import { Search, ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ChannelSortOption = "health" | "recent" | "products";

interface MarketplaceHubToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: ChannelSortOption;
  onSortChange: (sort: ChannelSortOption) => void;
}

const SORT_LABELS: Record<ChannelSortOption, string> = {
  health: "Health",
  recent: "Recently updated",
  products: "Product count",
};

export const MarketplaceHubToolbar: React.FC<MarketplaceHubToolbarProps> = ({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
}) => {
  return (
    <div className="w-full flex items-center gap-3">
      {/* Search Input Container */}
      <div className="relative flex-1">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C8C8C]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search channels..."
          className="w-full h-10 pl-9 pr-4 rounded-lg border border-[#E5E5E5] bg-white text-[13px] text-[#121212] placeholder:text-[#8C8C8C] focus:border-[#121212] transition-colors"
        />
      </div>

      {/* Sort Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="shrink-0 h-10 px-3.5 flex items-center gap-1.5 rounded-lg border border-[#E5E5E5] bg-white text-[12px] font-medium text-[#121212] hover:bg-[#F9F9F9] transition-colors cursor-pointer"
          >
            <span>Sort: {SORT_LABELS[sortBy]}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#737373]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48 bg-white border border-[#E5E5E5] rounded-lg shadow-lg p-1 space-y-0.5"
        >
          <DropdownMenuItem
            onClick={() => onSortChange("recent")}
            className="flex items-center justify-between px-3 py-2 text-[12px] text-[#121212] rounded cursor-pointer hover:bg-[#F5F5F5]"
          >
            <span>Recently updated</span>
            {sortBy === "recent" && <Check className="w-3.5 h-3.5 text-[#121212]" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onSortChange("health")}
            className="flex items-center justify-between px-3 py-2 text-[12px] text-[#121212] rounded cursor-pointer hover:bg-[#F5F5F5]"
          >
            <span>Health</span>
            {sortBy === "health" && <Check className="w-3.5 h-3.5 text-[#121212]" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onSortChange("products")}
            className="flex items-center justify-between px-3 py-2 text-[12px] text-[#121212] rounded cursor-pointer hover:bg-[#F5F5F5]"
          >
            <span>Product count</span>
            {sortBy === "products" && <Check className="w-3.5 h-3.5 text-[#121212]" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
