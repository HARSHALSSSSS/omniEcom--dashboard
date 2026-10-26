import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { PromotionCampaign, PromotionLifecycleAction } from "@/types/promotions";
import { ACTION_LABELS, WRITE_REASON, allowedActions, isDraft } from "./promoFormat";

export interface CampaignRowActions {
  onOpen: (c: PromotionCampaign) => void;
  onEdit: (c: PromotionCampaign) => void;
  onLifecycle: (c: PromotionCampaign, action: PromotionLifecycleAction) => void;
  onDuplicate: (c: PromotionCampaign) => void;
  onDelete: (c: PromotionCampaign) => void;
}

/** the actions a campaign allows in its state (the server's state machine): view, edit a draft, schedule / start / end / cancel, copy, delete a draft */
export function CampaignRowMenu({ c, canWrite, busy, ...a }: { c: PromotionCampaign; canWrite: boolean; busy: boolean } & CampaignRowActions) {
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

