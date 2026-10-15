import React from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface FilterOption {
  label: string;
  value: string;
}

interface FilterDropdownProps {
  label: string;
  value?: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

export const FilterPill: React.FC<FilterDropdownProps> = ({
  label,
  value,
  options,
  onChange,
}) => {
  return (
    <div className="relative inline-block text-xs">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
      >
        <option value="">{label}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

interface FilterBarProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  savedViews?: React.ReactNode;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery = "",
  onSearchChange,
  searchPlaceholder = "Search by name, SKU or barcode...",
  filters,
  savedViews,
  onClearFilters,
  hasActiveFilters = false,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2.5 py-2",
        className,
      )}
    >
      <div className="flex flex-1 items-center gap-2 flex-wrap min-w-[280px]">
        {/* Search input */}
        {onSearchChange && (
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-8 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Filter dropdowns */}
        {filters}

        {/* Reset button */}
        {hasActiveFilters && onClearFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="mr-1 h-3 w-3" />
            Reset filters
          </Button>
        )}
      </div>

      {savedViews && (
        <div className="flex items-center gap-2">{savedViews}</div>
      )}
    </div>
  );
};

interface FilterRailProps {
  title?: string;
  open?: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const FilterRail: React.FC<FilterRailProps> = ({
  title = "Filters",
  children,
  className,
}) => {
  return (
    <aside
      className={cn(
        "w-[240px] shrink-0 border-r border-border bg-card p-4 space-y-5 text-xs",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border pb-2.5">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>{title}</span>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </aside>
  );
};
