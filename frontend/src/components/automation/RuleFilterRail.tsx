import { Shield } from "lucide-react";
import { cn } from "@/utils/cn";
import { STATUS_LABELS, triggerLabel } from "./autoFormat";
import type { AutomationCatalog, AutomationRule, RuleStatus } from "@/types/automation";

export const MODE_ALL = "All Modes";
export const MODE_AUTO = "Automatic";
export const MODE_APPROVAL = "Approval Required";

interface RuleFilterRailProps {
  /** the whole rules list: every count below is taken from it */
  rules: AutomationRule[];
  catalog: AutomationCatalog | undefined;
  selectedMode: string;
  selectedStatus: RuleStatus | undefined;
  selectedTrigger: string | undefined;
  onSelectMode: (mode: string) => void;
  onSelectStatus: (status: RuleStatus | null) => void;
  onSelectTrigger: (trigger: string | null) => void;
  onReset: () => void;
  className?: string;
}

const tally = <T extends string>(rules: AutomationRule[], key: (r: AutomationRule) => T): Array<[T, number]> => {
  const m = new Map<T, number>();
  for (const r of rules) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export function RuleFilterRail({ rules, catalog, selectedMode, selectedStatus, selectedTrigger, onSelectMode, onSelectStatus, onSelectTrigger, onReset, className }: RuleFilterRailProps) {
  const modes: Array<[string, number]> = [
    [MODE_ALL, rules.length],
    [MODE_AUTO, rules.filter((r) => r.mode === "auto").length],
    [MODE_APPROVAL, rules.filter((r) => r.mode === "approval").length],
  ];
  const statuses: Array<[RuleStatus, number]> = (["active", "draft", "disabled"] as const).map((s) => [s, rules.filter((r) => r.status === s).length]);
  const channels = tally(rules, (r) => r.channelFilter ?? "All channels");
  const triggers = tally(rules, (r) => r.triggerEvent);

  return (
    <aside className={cn("flex w-full lg:w-[240px] shrink-0 flex-col gap-5 rounded-xl border border-border bg-card p-4 text-xs", className)}>
      <div className="space-y-2">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <span className="font-bold uppercase tracking-wider text-muted-foreground">Execution Mode</span>
          <button type="button" onClick={onReset} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer">
            Reset
          </button>
        </div>
        <div className="space-y-1">
          {modes.map(([mode, n]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSelectMode(mode)}
              className={cn("flex w-full min-h-[36px] sm:min-h-0 items-center justify-between rounded px-2 py-2 sm:py-1.5 text-left font-medium transition-colors cursor-pointer", selectedMode === mode ? "bg-muted font-bold text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}
            >
              <div className="flex items-center gap-2">
                {mode === MODE_AUTO && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                {mode === MODE_APPROVAL && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                <span>{mode}</span>
              </div>
              <span className="font-mono text-[11px] opacity-80">{n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <span className="font-bold uppercase tracking-wider text-muted-foreground">Status</span>
        <div className="space-y-1">
          {statuses.map(([st, n]) => (
            <label key={st} className="flex min-h-[36px] sm:min-h-0 cursor-pointer items-center justify-between rounded px-2 py-1.5 sm:py-1 hover:bg-muted/30">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={selectedStatus === st} onChange={() => onSelectStatus(selectedStatus === st ? null : st)} className="h-3.5 w-3.5 rounded border-border" />
                <span>{STATUS_LABELS[st]}</span>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <span className="font-bold uppercase tracking-wider text-muted-foreground">Channel Scope</span>
        {channels.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No rules yet.</p>
        ) : (
          <div className="space-y-1">
            {channels.map(([ch, n]) => (
              <div key={ch} className="flex min-h-[32px] sm:min-h-0 items-center justify-between rounded px-2 py-1">
                <span>{ch}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <span className="font-bold uppercase tracking-wider text-muted-foreground">Trigger Type</span>
        {triggers.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No rules yet.</p>
        ) : (
          <div className="space-y-1">
            {triggers.map(([tg, n]) => (
              <button
                key={tg}
                type="button"
                onClick={() => onSelectTrigger(selectedTrigger === tg ? null : tg)}
                className={cn("flex w-full min-h-[36px] sm:min-h-0 items-center justify-between rounded px-2 py-2 sm:py-1 text-left hover:bg-muted/30 cursor-pointer", selectedTrigger === tg && "bg-muted font-bold")}
              >
                <span>{triggerLabel(tg, catalog)}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-auto rounded-lg border border-border bg-muted/30 p-3 text-[11px]">
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <Shield className="h-3.5 w-3.5" />
          SAFEGUARD POLICY
        </div>
        <p className="mt-1 leading-relaxed text-muted-foreground">Price actions only create a proposal. Rules in approval mode wait for your decision before anything runs.</p>
      </div>
    </aside>
  );
}
