import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatNumber } from "@/utils/format";
import type { PromotionCampaign, PromotionLifecycleAction } from "@/types/promotions";
import { ACTION_LABELS, WRITE_REASON, allowedActions, describeTerms, formatBps, isDraft, money, TYPE_LABELS, windowOf } from "./promoFormat";
import { CampaignBadge, ChannelChips } from "./PromoUi";

export interface CampaignRowActions {
  onOpen: (c: PromotionCampaign) => void;
  onEdit: (c: PromotionCampaign) => void;
  onLifecycle: (c: PromotionCampaign, action: PromotionLifecycleAction) => void;
  onDuplicate: (c: PromotionCampaign) => void;
  onDelete: (c: PromotionCampaign) => void;
}

interface Props extends CampaignRowActions {
  rows: PromotionCampaign[];
  canWrite: boolean;
  refreshing: boolean;
  /** the campaign whose action is running */
  busyId: string | null;
}

const COLUMNS = ["Campaign", "Discount", "Channels", "Window", "Products", "Revenue", "Spend", "Status"];

function RowMenu({ c, canWrite, busy, ...a }: { c: PromotionCampaign; canWrite: boolean; busy: boolean } & CampaignRowActions) {
  const actions = allowedActions(c.status);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Actions for ${c.name}`} disabled={busy} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[170px] text-xs">
        <DropdownMenuItem onSelect={() => a.onOpen(c)}>View details</DropdownMenuItem>
        {isDraft(c) && (
          <DropdownMenuItem disabled={!canWrite} title={canWrite ? undefined : WRITE_REASON} onSelect={() => a.onEdit(c)}>
            Edit
          </DropdownMenuItem>
        )}
        {actions.map((action) => (
          <DropdownMenuItem key={action} disabled={!canWrite} title={canWrite ? undefined : WRITE_REASON} onSelect={() => a.onLifecycle(c, action)}>
            {ACTION_LABELS[action].verb}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem disabled={!canWrite} title={canWrite ? undefined : WRITE_REASON} onSelect={() => a.onDuplicate(c)}>
          Duplicate
        </DropdownMenuItem>
        {isDraft(c) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canWrite} title={canWrite ? undefined : WRITE_REASON} className="text-destructive focus:text-destructive" onSelect={() => a.onDelete(c)}>
              Delete draft
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CampaignsTable({ rows, canWrite, refreshing, busyId, ...actions }: Props) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${refreshing ? "opacity-60" : ""}`} aria-busy={refreshing}>
      <table className="w-full min-w-[1000px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            {COLUMNS.map((c, i) => (
              <th key={c} scope="col" className={`px-4 py-3 ${i >= 4 && i <= 6 ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
            <th scope="col" className="py-3 pl-2 pr-4 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((c) => (
            <tr key={c.id} className="transition-colors hover:bg-muted/30">
              <td className="px-4 py-3">
                <button type="button" onClick={() => actions.onOpen(c)} className="flex flex-col text-left" aria-label={`Open ${c.name}`}>
                  <span className="font-semibold text-foreground hover:underline">{c.name}</span>
                  <span className="font-mono text-[11px] text-blue-600">{c.code}</span>
                </button>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-foreground">{describeTerms(c)}</div>
                <div className="text-[11px] text-muted-foreground">{TYPE_LABELS[c.type]}</div>
              </td>
              <td className="px-4 py-3">
                <ChannelChips channels={c.channels} />
              </td>
              <td className="px-4 py-3 text-[11px] text-muted-foreground">{windowOf(c)}</td>
              <td className="px-4 py-3 text-right">
                <div className="font-mono font-semibold">{formatNumber(c.itemCounts.total)}</div>
                {c.itemCounts.ineligible > 0 && <div className="text-[11px] text-rose-600">{formatNumber(c.itemCounts.ineligible)} cannot run</div>}
              </td>
              <td className="px-4 py-3 text-right font-semibold">{money(c.revenueMinor, c.currency)}</td>
              <td className="px-4 py-3 text-right">
                <div className="font-medium text-foreground/80">{money(c.spendMinor, c.currency)}</div>
                {c.budgetMinor > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    of {money(c.budgetMinor, c.currency)}
                    {c.budgetUsedBps !== null ? ` · ${formatBps(c.budgetUsedBps)}` : ""}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <CampaignBadge status={c.status} />
              </td>
              <td className="py-3 pl-2 pr-4 text-right">
                <RowMenu c={c} canWrite={canWrite} busy={busyId === c.id} {...actions} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
