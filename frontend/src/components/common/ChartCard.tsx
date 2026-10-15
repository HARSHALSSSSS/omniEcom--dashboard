import React from "react";
import { cn } from "@/utils/cn";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  rangeOptions?: { label: string; value: string }[];
  selectedRange?: string;
  onRangeChange?: (range: string) => void;
  legend?: React.ReactNode;
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  dark?: boolean;
  className?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  rangeOptions = [
    { label: "7 days", value: "7d" },
    { label: "30 days", value: "30d" },
    { label: "90 days", value: "90d" },
  ],
  selectedRange = "30d",
  onRangeChange,
  legend,
  children,
  sidebar,
  dark = false,
  className,
}) => {
  return (
    <div
      className={cn(
        "rounded-xl border p-5 transition-all",
        dark
          ? "bg-[#0f172a] text-white border-slate-800 shadow-md"
          : "bg-card text-foreground border-border shadow-2xs",
        className,
      )}
    >
      {/* Header with Title and Range Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border/20">
        <div>
          <h3 className="text-base font-bold tracking-tight">{title}</h3>
          {subtitle && (
            <p
              className={cn(
                "text-xs mt-0.5",
                dark ? "text-slate-400" : "text-muted-foreground",
              )}
            >
              {subtitle}
            </p>
          )}
        </div>

        {rangeOptions && onRangeChange && (
          <div
            className={cn(
              "inline-flex rounded-lg p-1 text-xs",
              dark
                ? "bg-slate-800/80 text-slate-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            {rangeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onRangeChange(opt.value)}
                className={cn(
                  "rounded-md px-3 py-1 font-medium transition-all select-none",
                  selectedRange === opt.value
                    ? dark
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-background text-foreground shadow-xs"
                    : "hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {legend && <div className="py-2 text-xs">{legend}</div>}

      {/* Main Chart content + optional sidebar */}
      <div
        className={cn(
          "pt-3",
          sidebar ? "grid grid-cols-1 lg:grid-cols-4 gap-6" : "w-full",
        )}
      >
        <div
          className={cn(sidebar ? "lg:col-span-3" : "w-full", "min-h-[260px]")}
        >
          {children}
        </div>
        {sidebar && (
          <div
            className={cn(
              "border-t lg:border-t-0 lg:border-l pt-4 lg:pt-0 lg:pl-6 space-y-4",
              dark ? "border-slate-800" : "border-border",
            )}
          >
            {sidebar}
          </div>
        )}
      </div>
    </div>
  );
};
