import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage, isApiError } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useConnector, useReconnectAccount } from "@/hooks/useHub";
import type { HubAccountCard } from "@/types/hub";
import { InlineError } from "./hubUi";

interface HubReconnectDialogProps {
  account: Pick<HubAccountCard, "id" | "name" | "marketplace">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Re-enters the credentials of a disconnected or expired account (POST /marketplace-accounts/{id}/reconnect). The form comes from the connector. */
export function HubReconnectDialog({ account, open, onOpenChange }: HubReconnectDialogProps) {
  const connector = useConnector(open ? account.marketplace : null);
  const reconnect = useReconnectAccount();
  const [values, setValues] = useState<Record<string, string>>({});
  const fields = connector.data?.authFlow.fields ?? [];
  const missing = fields.filter((f) => f.required && !values[f.key]?.trim());
  const fieldErrors = isApiError(reconnect.error) ? reconnect.error.fields : null;

  const close = (next: boolean) => {
    if (!next) {
      setValues({});
      reconnect.reset();
    }
    onOpenChange(next);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (missing.length) return;
    reconnect.mutate(
      { id: account.id, credentials: values },
      {
        onSuccess: () => {
          toast({ title: `${account.name} reconnected`, description: "Run a sync to bring it up to date.", variant: "success" });
          close(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Reconnect {account.name}</DialogTitle>
            <DialogDescription>Enter the credentials again. They are validated with the marketplace first and stored encrypted.</DialogDescription>
          </DialogHeader>
          {connector.isPending && <p className="text-xs text-muted-foreground">Loading the connection form...</p>}
          {connector.isError && <InlineError message={errorMessage(connector.error, "The connection form could not be loaded.")} />}
          {connector.data && fields.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {connector.data.displayName} connects through the marketplace.{" "}
              <Link to={`/marketplace-hub/connect/${account.marketplace}`} className="font-medium text-foreground underline" onClick={() => close(false)}>
                Open the connection setup
              </Link>
            </p>
          )}
          {fields.map((f) => {
            const problem = fieldErrors?.[`credentials.${f.key}`];
            return (
              <div key={f.key} className="space-y-1">
                <label htmlFor={`reconnect-${f.key}`} className="text-xs font-medium text-foreground">
                  {f.label}
                  {f.required && <span aria-hidden> *</span>}
                </label>
                <Input
                  id={`reconnect-${f.key}`}
                  type={f.secret || f.type === "password" ? "password" : "text"}
                  autoComplete="off"
                  required={f.required}
                  value={values[f.key] ?? ""}
                  error={Boolean(problem)}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
                {(problem ?? f.help) && <p className={problem ? "text-[11px] text-red-600" : "text-[11px] text-muted-foreground"}>{problem ?? f.help}</p>}
              </div>
            );
          })}
          {reconnect.isError && <InlineError message={errorMessage(reconnect.error, "The account could not be reconnected.")} />}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={reconnect.isPending} disabled={fields.length === 0 || missing.length > 0}>
              Reconnect
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
