import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { toast } from "@/hooks/useToast";
import { useAccountSync, useDeleteAccount, useDisconnectAccount, useTestConnection, useUpdateAccount } from "@/hooks/useHub";
import type { HubAccountCard } from "@/types/hub";
import { HubReconnectDialog } from "./HubReconnectDialog";
import { HubSyncDialog } from "./HubSyncDialog";
import { HubTestDialog } from "./HubTestDialog";
import { WRITE_REASON } from "./hubFormat";
import { InlineError } from "./hubUi";

export type Dlg = "sync" | "test" | "disconnect" | "delete" | "reconnect" | "rename" | null;

/**
 * All the state and handlers behind one connection's actions (test, sync, pause / resume, rename, reconnect, disconnect, delete),
 * plus the dialogs they open (`dialogs`: render it once next to the trigger buttons). Controls follow the account state and the
 * write permission and carry the reason when disabled.
 */
export function useAccountActions(account: HubAccountCard, onDeleted?: () => void) {
  const canWrite = useCan("marketplace_accounts:write");
  const sync = useAccountSync(account.id);
  const test = useTestConnection();
  const disconnect = useDisconnectAccount();
  const remove = useDeleteAccount();
  const update = useUpdateAccount();
  const [dialog, setDialog] = useState<Dlg>(null);
  const [name, setName] = useState(account.name);

  const status = account.accountStatus;
  const hasCredentials = status === "active" || status === "paused" || status === "error";
  const syncReason = !canWrite ? WRITE_REASON : status === "paused" ? "Syncing is paused. Resume the account first." : status !== "active" ? "Reconnect the account before syncing." : null;
  const testReason = !canWrite ? WRITE_REASON : !hasCredentials ? "Reconnect the account before testing." : null;
  const syncing = sync.start.isPending || account.syncState === "syncing";

  const startSync = () => {
    sync.reset();
    setDialog("sync");
    sync.start.mutate(undefined);
  };
  const runTest = () => {
    setDialog("test");
    test.mutate(account.id);
  };
  const close = () => setDialog(null);

  const togglePause = () => {
    const next = status === "paused" ? "active" : "paused";
    update.mutate(
      { id: account.id, status: next, version: account.version },
      {
        onSuccess: () => toast({ title: next === "paused" ? `${account.name} paused` : `${account.name} resumed`, variant: "success" }),
        onError: (e) => toast({ title: "Could not change the account", description: errorMessage(e), variant: "destructive" }),
      },
    );
  };

  const rename = (e: FormEvent) => {
    e.preventDefault();
    const displayName = name.trim();
    if (displayName.length < 2 || displayName === account.name) return;
    update.mutate({ id: account.id, displayName, version: account.version }, { onSuccess: () => { toast({ title: "Account renamed", variant: "success" }); close(); } });
  };

  const confirmDisconnect = () =>
    disconnect.mutate(account.id, {
      onSuccess: () => {
        toast({ title: `${account.name} disconnected`, description: "The stored credentials were destroyed. You can reconnect it later.", variant: "success" });
        close();
      },
      onError: (e) => {
        toast({ title: "Could not disconnect", description: errorMessage(e), variant: "destructive" });
        close();
      },
    });

  const confirmDelete = () =>
    remove.mutate(account.id, {
      onSuccess: () => {
        toast({ title: `${account.name} deleted`, variant: "success" });
        close();
        onDeleted?.();
      },
      onError: (e) => {
        toast({ title: "Could not delete the account", description: errorMessage(e), variant: "destructive" });
        close();
      },
    });

  const dialogsNode: ReactNode = (
    <>
      <HubSyncDialog open={dialog === "sync"} onOpenChange={(o) => !o && close()} accountName={account.name} sync={sync} onRetry={startSync} />
      <HubTestDialog open={dialog === "test"} onOpenChange={(o) => !o && close()} accountName={account.name} pending={test.isPending} result={test.data} error={test.error} onRetry={runTest} />
      <HubReconnectDialog account={account} open={dialog === "reconnect"} onOpenChange={(o) => !o && close()} />
      <ConfirmDialog
        open={dialog === "disconnect"}
        onOpenChange={(o) => !o && close()}
        title={`Disconnect ${account.name}?`}
        description="The stored credentials are destroyed and syncing stops. Listings and orders stay in your catalogue, and you can reconnect the account later."
        confirmText="Disconnect"
        variant="destructive"
        loading={disconnect.isPending}
        onConfirm={confirmDisconnect}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && close()}
        title={`Delete ${account.name}?`}
        description="The account is removed from your business. This cannot be undone."
        confirmText="Delete account"
        variant="destructive"
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
      <Dialog open={dialog === "rename"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-sm">
          <form onSubmit={rename} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Rename account</DialogTitle>
              <DialogDescription>The name only appears inside your dashboard.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <label htmlFor={`rename-${account.id}`} className="text-xs font-medium text-foreground">
                Account name
              </label>
              <Input id={`rename-${account.id}`} value={name} minLength={2} maxLength={120} required onChange={(e) => setName(e.target.value)} />
            </div>
            {update.isError && <InlineError message={errorMessage(update.error, "The account could not be renamed.")} />}
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={update.isPending} disabled={name.trim().length < 2 || name.trim() === account.name}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );

  return {
    canWrite, status, hasCredentials, syncReason, testReason, syncing, testing: test.isPending, pausing: update.isPending,
    startSync, runTest, togglePause,
    openDialog: (d: Dlg) => { if (d === "rename") setName(account.name); setDialog(d); }, dialogs: dialogsNode,
  };
}
