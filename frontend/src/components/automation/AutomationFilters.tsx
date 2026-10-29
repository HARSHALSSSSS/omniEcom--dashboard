import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { RULE_STATUSES, RUN_STATUSES, type AutomationCatalog, type AutomationRule } from "@/types/automation";
import { RUN_LABELS, STATUS_LABELS, triggerLabel } from "./autoFormat";
import type { AutomationUrlState } from "./autoParams";

const SELECT = "h-10 sm:h-9 w-full sm:w-auto sm:max-w-[260px] rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground disabled:opacity-50";

interface Props {
  state: AutomationUrlState;
  /** every rule, unfiltered: gives the status counts and the rule picker of the runs tab */
  rules: AutomationRule[];
  catalog: AutomationCatalog | undefined;
  filtered: boolean;
  onSearch: (q: string) => void;
  onStatus: (status: string | null) => void;
  onTrigger: (trigger: string | null) => void;
  onRule: (ruleId: string | null) => void;
  onClear: () => void;
}

/** status tabs, search and selects of the rules and runs tabs; every change goes to the URL */
export function AutomationFilters({ state, rules, catalog, filtered, onSearch, onStatus, onTrigger, onRule, onClear }: Props) {
  const rulesTab = state.tab === "rules";
  const q = state.q ?? "";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (!rulesTab || text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, rulesTab, onSearch]);

  const statuses: ReadonlyArray<string> = rulesTab ? RULE_STATUSES : RUN_STATUSES;
  const label = (s: string) => (rulesTab ? STATUS_LABELS[s as keyof typeof STATUS_LABELS] : RUN_LABELS[s as keyof typeof RUN_LABELS]);
  const count = (s: string): number | undefined => (!rulesTab ? undefined : s === "" ? rules.length : rules.filter((r) => r.status === s).length);
  const active = state.status ?? "";
  const triggers = [...new Set(rules.map((r) => r.triggerEvent))].sort();
  const ruleOptions = state.ruleId && !rules.some((r) => r.id === state.ruleId) ? [...rules, { id: state.ruleId, name: "Selected rule" } as AutomationRule] : rules;

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label={rulesTab ? "Rule status" : "Run status"} className="flex flex-wrap gap-1.5 sm:gap-2">
        {["", ...statuses].map((s) => {
          const selected = s === active;
          const n = count(s);
          return (
            <button
              key={s || "all"}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onStatus(s || null)}
              className={cn("min-h-[36px] sm:min-h-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer", selected ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-muted")}
            >
              {s === "" ? "All" : label(s)}
              {n !== undefined && <span className="ml-1.5 font-mono opacity-80">{formatNumber(n)}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {rulesTab ? (
          <>
            <div className="relative w-full sm:max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input type="search" aria-label="Search rules" placeholder="Search by rule name or description..." value={text} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)} className="h-10 sm:h-9 pl-9 text-xs w-full" />
            </div>
            <select aria-label="Trigger" className={SELECT} value={state.trigger ?? ""} onChange={(e) => onTrigger(e.target.value || null)}>
              <option value="">Any trigger</option>
              {state.trigger && !triggers.includes(state.trigger) && <option value={state.trigger}>{triggerLabel(state.trigger, catalog)}</option>}
              {triggers.map((t) => (
                <option key={t} value={t}>
                  {triggerLabel(t, catalog)}
                </option>
              ))}
            </select>
          </>
        ) : (
          <select aria-label="Rule" className={SELECT} value={state.ruleId ?? ""} onChange={(e) => onRule(e.target.value || null)}>
            <option value="">All rules</option>
            {ruleOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}

        {filtered && (
          <button type="button" onClick={onClear} className="h-10 sm:h-9 rounded-lg px-2.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline self-start sm:self-auto cursor-pointer">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
