import React, { useState } from "react";
import { ApiError } from "@/api/errors";
import type { AuthField, OnboardingChannel } from "@/api/onboarding.api";
import { useConnectChannel, useConnectorForm } from "@/hooks/useOnboarding";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError, InlineError, Spinner } from "@/components/onboarding/wizard";
import { cn } from "@/utils/cn";

interface Props {
  channel: OnboardingChannel | null;
  onClose: () => void;
  /** the connection was accepted by the marketplace */
  onConnected: (code: string) => void;
}

/** a field value that cannot satisfy the connector's rules, or null when it is fine */
function checkField(field: AuthField, raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return field.required ? `${field.label} is required.` : null;
  if (field.pattern) {
    try {
      if (!new RegExp(field.pattern).test(value)) return `${field.label} does not look right.`;
    } catch {
      // a pattern the browser cannot read is the server's job to enforce
    }
  }
  return null;
}

/**
 * The credential form of a marketplace, built from what the connector itself asks for (GET /marketplaces/{code}).
 * Connecting registers the account, then the server checks the keys with the marketplace before storing them (encrypted).
 */
export const ConnectChannelDialog: React.FC<Props> = ({ channel, onClose, onConnected }) => (
  <Dialog open={!!channel} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-[460px]">
      {channel && <ConnectForm key={channel.code} channel={channel} onClose={onClose} onConnected={onConnected} />}
    </DialogContent>
  </Dialog>
);

const ConnectForm: React.FC<{ channel: OnboardingChannel; onClose: () => void; onConnected: (code: string) => void }> = ({ channel, onClose, onConnected }) => {
  const form = useConnectorForm(channel.code);
  const connect = useConnectChannel();
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const isUpdate = channel.connection === "connected";

  const connector = form.data;
  const fields = connector?.authFlow.fields ?? [];
  const credentialsAccepted = !!connector && connector.authFlow.mode !== "redirect" && fields.length > 0;

  const local: Record<string, string> = {};
  for (const f of fields) {
    const problem = checkField(f, values[f.key]);
    if (problem) local[f.key] = problem;
  }
  const serverFields = connect.error instanceof ApiError ? connect.error.fields : null;
  const fieldError = (key: string) => (touched ? local[key] : undefined) ?? serverFields?.[`credentials.${key}`] ?? serverFields?.[key];
  const generalError = connect.isError && !(serverFields && Object.keys(serverFields).length) ? connect.error : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(local).length || connect.isPending) return;
    const credentials = Object.fromEntries(fields.map((f) => [f.key, (values[f.key] ?? "").trim()]).filter(([, v]) => v !== ""));
    connect.mutate(
      { code: channel.code, credentials },
      {
        onSuccess: () => {
          onConnected(channel.code);
          onClose();
        },
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isUpdate ? `Manage ${channel.name}` : `Connect ${channel.name}`}</DialogTitle>
        <DialogDescription>
          {isUpdate
            ? "Your connection is active. Enter new keys to replace the stored ones."
            : "Enter the keys from your seller account. We check them with the marketplace before saving anything."}
        </DialogDescription>
      </DialogHeader>

      {isUpdate && channel.account && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-[8px] bg-[#F5F5F5] px-3 py-2 text-[12px] text-[#333333]">
          <dt className="text-[#737373]">Account</dt>
          <dd className="font-medium">{channel.account.displayName}</dd>
          <dt className="text-[#737373]">Mode</dt>
          <dd className="capitalize">{channel.account.mode}</dd>
          <dt className="text-[#737373]">Last sync</dt>
          <dd>{channel.account.lastSyncedAt ? new Date(channel.account.lastSyncedAt).toLocaleString() : "Not synced yet"}</dd>
        </dl>
      )}

      {form.isPending && (
        <div role="status" aria-label="Loading the connection form" className="flex justify-center py-8">
          <Spinner className="h-5 w-5" />
        </div>
      )}
      {form.isError && (
        <div className="space-y-3">
          <InlineError error={form.error} />
          <button type="button" onClick={() => void form.refetch()} className="h-[36px] rounded-[8px] border border-[#D6D6D6] px-3 text-[12px] font-semibold">
            Try again
          </button>
        </div>
      )}

      {connector && connector.implementation === "planned" && (
        <p className="text-[13px] text-[#555555]">{channel.name} cannot be connected yet. It is on the way.</p>
      )}

      {connector && connector.implementation !== "planned" && !credentialsAccepted && (
        <p className="text-[13px] text-[#555555]">
          {channel.name} connects by approving access on the marketplace itself. That guided connection is part of the Marketplace Hub, which opens as soon as your setup is finished.
        </p>
      )}

      {connector && connector.implementation !== "planned" && credentialsAccepted && (
        <form onSubmit={submit} noValidate aria-busy={connect.isPending} className="flex flex-col gap-3">
          {connector.authFlow.partnerGated && (
            <p role="note" className="rounded-[8px] bg-[#F5F5F5] px-3 py-2 text-[12px] text-[#555555]">
              {channel.name} gives these keys only to approved partners. If you do not have them yet, you can connect later from the workspace.
            </p>
          )}
          {fields.map((f) => {
            const id = `onb-cred-${f.key}`;
            const err = fieldError(f.key);
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                <label htmlFor={id} className="text-[12px] font-medium text-[#333333]">
                  {f.label}
                  {f.required && <span aria-hidden> *</span>}
                </label>
                {f.type === "select" ? (
                  <select
                    id={id}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    aria-invalid={!!err}
                    className={cn("h-[40px] rounded-[8px] border bg-white px-3 text-[13px]", err ? "border-[#B42318]" : "border-[#666666]")}
                  >
                    <option value="">Select…</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    type={f.secret || f.type === "password" ? "password" : "text"}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!!err}
                    aria-describedby={f.help ? `${id}-help` : undefined}
                    className={cn("h-[40px] rounded-[8px] border bg-white px-3 text-[13px] outline-none focus:border-[#0A0A0A]", err ? "border-[#B42318]" : "border-[#666666]")}
                  />
                )}
                {f.help && (
                  <p id={`${id}-help`} className="text-[11px] text-[#737373]">
                    {f.help}
                  </p>
                )}
                <FieldError message={err} />
              </div>
            );
          })}

          <InlineError error={generalError} />

          <div className="mt-1 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} disabled={connect.isPending} className="h-[40px] rounded-[8px] border border-[#D6D6D6] bg-white px-4 text-[12px] font-semibold disabled:opacity-60">
              Cancel
            </button>
            <button
              type="submit"
              disabled={connect.isPending}
              className="flex h-[40px] min-w-[120px] items-center justify-center gap-1.5 rounded-[8px] bg-[#0A0A0A] px-4 text-[12px] font-semibold text-white hover:bg-[#1F1F1F] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {connect.isPending ? (
                <>
                  <Spinner /> Checking…
                </>
              ) : isUpdate ? (
                "Update connection"
              ) : (
                "Connect"
              )}
            </button>
          </div>
        </form>
      )}
    </>
  );
};
