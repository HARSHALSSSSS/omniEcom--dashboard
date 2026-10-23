import { MoreHorizontal, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { HubAccountCard } from "@/types/hub";
import { useAccountActions } from "./useAccountActions";
import { WRITE_REASON } from "./hubFormat";

interface HubAccountActionsProps {
  account: HubAccountCard;
  /** called after the account was deleted (the detail page leaves its own route) */
  onDeleted?: () => void;
}

/** Everything a seller can do to one connection, as a button row with a menu. */
export function HubAccountActions({ account, onDeleted }: HubAccountActionsProps) {
  const a = useAccountActions(account, onDeleted);
  const { canWrite, status, hasCredentials } = a;

  return (
    <div className="flex items-center gap-2">
      <span title={a.testReason ?? undefined}>
        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={Boolean(a.testReason) || a.testing} onClick={a.runTest}>
          Test
        </Button>
      </span>
      <span title={a.syncReason ?? undefined}>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={Boolean(a.syncReason) || a.syncing} onClick={a.startSync}>
          <RefreshCw className={`h-3 w-3 ${a.syncing ? "animate-spin" : ""}`} aria-hidden /> Sync Now
        </Button>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${account.name}`}>
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem disabled={!canWrite} onSelect={() => a.openDialog("rename")}>
            Rename
          </DropdownMenuItem>
          {(status === "active" || status === "paused") && (
            <DropdownMenuItem disabled={!canWrite || a.pausing} onSelect={a.togglePause}>
              {status === "paused" ? "Resume syncing" : "Pause syncing"}
            </DropdownMenuItem>
          )}
          {status !== "active" && status !== "paused" && (
            <DropdownMenuItem disabled={!canWrite} onSelect={() => a.openDialog("reconnect")}>
              Reconnect
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {hasCredentials && (
            <DropdownMenuItem disabled={!canWrite} className="text-destructive focus:text-destructive" onSelect={() => a.openDialog("disconnect")}>
              Disconnect
            </DropdownMenuItem>
          )}
          {status !== "active" && (
            <DropdownMenuItem disabled={!canWrite} className="text-destructive focus:text-destructive" onSelect={() => a.openDialog("delete")}>
              Delete account
            </DropdownMenuItem>
          )}
          {!canWrite && <p className="px-2 py-1.5 text-[11px] text-muted-foreground">{WRITE_REASON}</p>}
        </DropdownMenuContent>
      </DropdownMenu>

      {a.dialogs}
    </div>
  );
}
