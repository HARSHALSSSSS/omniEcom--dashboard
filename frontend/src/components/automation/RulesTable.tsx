import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatNumber, formatRelativeTime } from "@/utils/format";
import type { AutomationCatalog, AutomationRule } from "@/types/automation";
import { WRITE_REASON, actionLabel, scheduleText, triggerLabel } from "./autoFormat";
import { ModeBadge, RuleBadge } from "./AutoUi";

export interface RuleRowActions {
  onOpen: (r: AutomationRule) => void;
  onEdit: (r: AutomationRule) => void;
  onTest: (r: AutomationRule) => void;
  onToggle: (r: AutomationRule) => void;
  onDelete: (r: AutomationRule) => void;
}

interface Props extends RuleRowActions {
  rows: AutomationRule[];
  catalog: AutomationCatalog | undefined;
  canWrite: boolean;
  refreshing: boolean;
  /** the rule whose action is running */
  busyId: string | null;
}

const COLUMNS = ["Rule", "When", "Then", "Approval", "Runs", "Last run", "Status"];

export function RuleMenu({ r, canWrite, busy, ...a }: { r: AutomationRule; canWrite: boolean; busy: boolean } & RuleRowActions) {
  const off = !canWrite;
  const title = off ? WRITE_REASON : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Actions for ${r.name}`} disabled={busy} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[170px] text-xs">
        <DropdownMenuItem onSelect={() => a.onOpen(r)}>View details and runs</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => a.onTest(r)}>Test (dry run)</DropdownMenuItem>
        <DropdownMenuItem disabled={off} title={title} onSelect={() => a.onEdit(r)}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem disabled={off} title={title} onSelect={() => a.onToggle(r)}>
          {r.status === "active" ? "Disable" : "Enable"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={off} title={title} className="text-destructive focus:text-destructive" onSelect={() => a.onDelete(r)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RulesTable({ rows, catalog, canWrite, refreshing, busyId, ...actions }: Props) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${refreshing ? "opacity-60" : ""}`} aria-busy={refreshing}>
      <table className="w-full min-w-[960px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            {COLUMNS.map((c, i) => (
              <th key={c} scope="col" className={`px-4 py-3 ${i === 4 ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
            <th scope="col" className="py-3 pl-2 pr-4 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const schedule = scheduleText(r);
            return (
              <tr key={r.id} className="transition-colors hover:bg-muted/30">
                <td className="max-w-[260px] px-4 py-3">
                  <button type="button" onClick={() => actions.onOpen(r)} className="flex flex-col text-left" aria-label={`Open ${r.name}`}>
                    <span className="font-semibold text-foreground hover:underline">{r.name}</span>
                    {r.description && <span className="line-clamp-2 text-[11px] text-muted-foreground">{r.description}</span>}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{triggerLabel(r.triggerEvent, catalog)}</div>
                  <div className="text-[11px] text-muted-foreground">{schedule ?? (r.channelFilter ? `Only ${r.channelFilter}` : r.conditions.conditions.length > 0 ? `${r.conditions.conditions.length} condition${r.conditions.conditions.length === 1 ? "" : "s"}` : "Every event")}</div>
                </td>
                <td className="px-4 py-3 font-medium text-foreground">{actionLabel(r.action.type)}</td>
                <td className="px-4 py-3">
                  <ModeBadge mode={r.mode} />
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold">{formatNumber(r.runsCount)}</td>
                <td className="px-4 py-3 text-[11px] text-muted-foreground">{r.lastRunAt ? formatRelativeTime(r.lastRunAt) : "Never"}</td>
                <td className="px-4 py-3">
                  <RuleBadge status={r.status} />
                </td>
                <td className="py-3 pl-2 pr-4 text-right">
                  <RuleMenu r={r} canWrite={canWrite} busy={busyId === r.id} {...actions} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
