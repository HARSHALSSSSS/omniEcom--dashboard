import { useState } from "react";
import { Shield } from "lucide-react";
import { cn } from "@/utils/cn";

export interface FilterRailCounts {
  executionMode: Record<string, number>;
  status: Record<string, number>;
  channelScope: Record<string, number>;
  triggerType: Record<string, number>;
}

const DEFAULT_COUNTS: FilterRailCounts = {
  executionMode: {
    "All Modes": 28,
    Automatic: 11,
    "Approval Required": 5,
    Assisted: 8,
    Manual: 4,
  },
  status: {
    Active: 19,
    "Approval Needed": 5,
    "Paused / Draft": 2,
    Error: 2,
  },
  channelScope: {
    "Amazon SP-API": 14,
    Flipkart: 12,
    Meesho: 8,
    "Shopify D2C": 16,
    "Multi-channel": 20,
  },
  triggerType: {
    "Inventory & Stock": 9,
    "Orders & Dispatch": 8,
    "Pricing & Margins": 5,
    "Listing Suppressions": 4,
    "Returns & Disputes": 2,
  },
};

const CHANNEL_BADGES: Record<string, { label: string; tone: string }> = {
  "Amazon SP-API": { label: "AZ", tone: "text-amber-800 bg-amber-100" },
  Flipkart: { label: "FK", tone: "text-blue-800 bg-blue-100" },
  Meesho: { label: "ME", tone: "text-rose-800 bg-rose-100" },
  "Shopify D2C": { label: "SP", tone: "text-emerald-800 bg-emerald-100" },
  "Multi-channel": { label: "MC", tone: "text-purple-800 bg-purple-100" },
};

interface RuleFilterRailProps {
  counts?: FilterRailCounts;
  selectedMode?: string;
  onSelectMode?: (mode: string) => void;
  className?: string;
}

export function RuleFilterRail({
  counts = DEFAULT_COUNTS,
  selectedMode = "All Modes",
  onSelectMode,
  className,
}: RuleFilterRailProps) {
  const [currentMode, setCurrentMode] = useState(selectedMode);
  const [selectedStatus, setSelectedStatus] = useState<string[]>(["Active", "Approval Needed", "Error"]);

  const toggleStatus = (s: string) => {
    setSelectedStatus((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const handleMode = (m: string) => {
    setCurrentMode(m);
    onSelectMode?.(m);
  };

  const resetAll = () => {
    setCurrentMode("All Modes");
    setSelectedStatus(["Active"]);
    onSelectMode?.("All Modes");
  };

  return (
    <aside
      className={cn(
        "flex w-[240px] shrink-0 flex-col gap-5 rounded-xl border border-border bg-card p-4 text-xs",
        className
      )}
    >
      {/* 1. Execution Mode */}
      <div className="space-y-2">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <span className="font-bold uppercase tracking-wider text-muted-foreground">Execution Mode</span>
          <button
            type="button"
            onClick={resetAll}
            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        </div>

        <div className="space-y-1">
          {Object.entries(counts.executionMode).map(([mode, count]) => {
            const active = currentMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => handleMode(mode)}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1.5 text-left font-medium transition-colors",
                  active ? "bg-muted font-bold text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-2">
                  {mode === "Automatic" && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                  {mode === "Approval Required" && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                  {mode === "Assisted" && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                  {mode === "Manual" && <span className="h-2 w-2 rounded-full bg-neutral-400" />}
                  <span>{mode}</span>
                </div>
                <span className="font-mono text-[11px] opacity-80">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Status */}
      <div className="space-y-2 border-t border-border pt-3">
        <span className="font-bold uppercase tracking-wider text-muted-foreground">Status</span>
        <div className="space-y-1">
          {Object.entries(counts.status).map(([st, count]) => {
            const checked = selectedStatus.includes(st);
            return (
              <label
                key={st}
                className="flex cursor-pointer items-center justify-between rounded px-2 py-1 hover:bg-muted/30"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleStatus(st)}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  <span className={cn(st === "Error" && "font-semibold text-red-700")}>{st}</span>
                </div>
                <span className={cn("font-mono text-[11px]", st === "Error" ? "font-bold text-red-700" : "text-muted-foreground")}>
                  {count}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 3. Channel Scope */}
      <div className="space-y-2 border-t border-border pt-3">
        <span className="font-bold uppercase tracking-wider text-muted-foreground">Channel Scope</span>
        <div className="space-y-1">
          {Object.entries(counts.channelScope).map(([ch, count]) => {
            const badge = CHANNEL_BADGES[ch];
            return (
              <div key={ch} className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/30">
                <div className="flex items-center gap-2">
                  {badge && (
                    <span className={cn("rounded px-1 text-[10px] font-bold", badge.tone)}>
                      {badge.label}
                    </span>
                  )}
                  <span>{ch}</span>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Trigger Type */}
      <div className="space-y-2 border-t border-border pt-3">
        <span className="font-bold uppercase tracking-wider text-muted-foreground">Trigger Type</span>
        <div className="space-y-1">
          {Object.entries(counts.triggerType).map(([tg, count]) => (
            <div key={tg} className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/30">
              <span>{tg}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Safeguard Policy callout banner */}
      <div className="mt-auto rounded-lg border border-border bg-muted/30 p-3 text-[11px]">
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <Shield className="h-3.5 w-3.5" />
          SAFEGUARD POLICY
        </div>
        <p className="mt-1 text-muted-foreground leading-relaxed">
          Tier-0 Commercial Safeguards mandate merchant approval on price mutations &gt;15% and stock freezes.
        </p>
      </div>
    </aside>
  );
}
