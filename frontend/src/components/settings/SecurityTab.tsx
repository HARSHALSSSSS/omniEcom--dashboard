import { useState, type FormEvent } from "react";
import { useGuardedMutation, useSubmitLock } from "@/hooks/useSubmitGuard";
import { Laptop, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { settingsApi } from "@/api/settings.api";
import { errorMessage, isApiError } from "@/api/errors";
import { useSecurityActions, useSessions } from "@/hooks/useSettings";
import { useToastStore } from "@/hooks/useToast";
import { refreshShell } from "@/lib/session";
import { useWorkspaceStore } from "@/store/workspace.store";
import { formatDateTime, formatRelativeTime } from "@/utils/format";
import { Field, InlineError, SectionCard } from "./fields";
import { describeAgent, MIN_PASSWORD } from "./security";
import type { AccountSession } from "@/types/settings";

function ProfileCard() {
  const user = useWorkspaceStore((s) => s.user);
  const setUser = useWorkspaceStore((s) => s.setUser);
  const toast = useToastStore.getState().addToast;
  const [name, setName] = useState(user?.fullName ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useGuardedMutation({ mutationFn: (fullName: string) => settingsApi.updateProfile(fullName) });
  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 120;
  const changed = trimmed !== (user?.fullName ?? "");

  const acquire = useSubmitLock();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !changed || !user) return;
    setError(null);
    const release = acquire();
    if (!release) return;
    try {
      await save.mutateAsync(trimmed);
      setUser({ ...user, fullName: trimmed });
      void refreshShell().catch(() => undefined);
      toast({ title: "Profile updated", variant: "success" });
    } catch (err) {
      setError(errorMessage(err, "Could not update your name."));
    } finally {
      release();
    }
  };

  return (
    <SectionCard title="Your profile" description="The name your team sees next to your activity.">
      <form onSubmit={(e) => void submit(e)} className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field id="profile-name" label="Full name" error={name && !valid ? "Use 2 to 120 characters." : null}>
          <Input id="profile-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="profile-email" label="Email address" hint="Used to sign in. It cannot be changed here.">
          <Input id="profile-email" value={user?.email ?? ""} readOnly className="bg-muted/40" />
        </Field>
        {error && (
          <div className="sm:col-span-2">
            <InlineError>{error}</InlineError>
          </div>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" loading={save.isPending} disabled={!valid || !changed}>
            Save name
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function PasswordCard() {
  const { changePassword } = useSecurityActions();
  const toast = useToastStore.getState().addToast;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== next;
  const sameAsOld = next.length > 0 && next === current;
  const ready = current.length > 0 && next.length >= MIN_PASSWORD && confirm === next && !sameAsOld;

  const acquire = useSubmitLock();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || changePassword.isPending) return;
    setError(null);
    setFields({});
    const release = acquire();
    if (!release) return;
    try {
      await changePassword.mutateAsync({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast({ title: "Password changed", description: "Your other devices were signed out.", variant: "success" });
    } catch (err) {
      if (isApiError(err) && err.fields) setFields(err.fields);
      setError(isApiError(err) && err.code === "INVALID_CREDENTIALS" ? "Your current password is not correct." : errorMessage(err, "Could not change your password."));
    } finally {
      release();
    }
  };

  return (
    <SectionCard title="Password" description={`Use at least ${MIN_PASSWORD} characters. Changing it signs you out of every other device.`}>
      <form onSubmit={(e) => void submit(e)} className="grid max-w-xl grid-cols-1 gap-4" noValidate>
        <Field id="pw-current" label="Current password" error={fields.currentPassword}>
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} maxLength={128} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field id="pw-new" label="New password" error={tooShort ? `Use at least ${MIN_PASSWORD} characters.` : sameAsOld ? "Choose a password you have not used here." : fields.newPassword}>
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} maxLength={128} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field id="pw-confirm" label="Confirm new password" error={mismatch ? "The passwords do not match." : null}>
          <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} maxLength={128} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <InlineError>{error}</InlineError>}
        <div>
          <Button type="submit" size="sm" loading={changePassword.isPending} disabled={!ready}>
            Change password
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function SessionRow({ s, busy, onRevoke }: { s: AccountSession; busy: boolean; onRevoke: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
      <div className="flex items-start gap-3">
        <Laptop className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="font-medium text-foreground">
            {describeAgent(s.userAgent)}
            {s.current && <span className="ml-2 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">This device</span>}
          </p>
          <p className="text-muted-foreground">
            {s.ip ?? "Unknown address"} · active {formatRelativeTime(s.lastActiveAt)} · signed in {formatDateTime(s.startedAt)}
          </p>
        </div>
      </div>
      {!s.current && (
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-destructive hover:text-destructive" loading={busy} aria-label={`Sign out ${describeAgent(s.userAgent)} (${s.ip ?? "unknown address"})`} onClick={onRevoke}>
          {!busy && <LogOut className="h-3 w-3" aria-hidden="true" />} Sign out
        </Button>
      )}
    </li>
  );
}

function SessionsCard() {
  const sessions = useSessions();
  const { revoke, revokeOthers } = useSecurityActions();
  const toast = useToastStore.getState().addToast;
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const others = (sessions.data ?? []).filter((s) => !s.current);

  const acquireSignOut = useSubmitLock();
  const signOut = async (s: AccountSession) => {
    const release = acquireSignOut();
    if (!release) return;
    setError(null);
    setBusyId(s.id);
    try {
      await revoke.mutateAsync(s.id);
      toast({ title: "Device signed out", variant: "success" });
    } catch (e) {
      setError(errorMessage(e, "Could not sign that device out."));
    } finally {
      setBusyId(null);
      release();
    }
  };

  const acquire = useSubmitLock();
  const signOutOthers = async () => {
    setError(null);
    const release = acquire();
    if (!release) return;
    try {
      const res = await revokeOthers.mutateAsync();
      toast({ title: "Other devices signed out", description: `${res.revoked} session${res.revoked === 1 ? "" : "s"} ended.`, variant: "success" });
    } catch (e) {
      setError(errorMessage(e, "Could not sign the other devices out."));
    } finally {
      release();
    }
  };

  return (
    <SectionCard
      title="Active sessions"
      description="Where your account is signed in. Sign out any device you do not recognise."
      aside={
        others.length > 0 ? (
          <Button type="button" variant="outline" size="sm" loading={revokeOthers.isPending} onClick={() => void signOutOthers()}>
            Sign out all other devices
          </Button>
        ) : undefined
      }
    >
      {error && <InlineError>{error}</InlineError>}
      {sessions.isLoading ? (
        <p className="py-4 text-center text-xs text-muted-foreground" aria-busy="true">
          Loading sessions
        </p>
      ) : sessions.isError ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-red-50 p-3 text-xs text-red-900">
          <p>{errorMessage(sessions.error, "Could not load your sessions.")}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void sessions.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border" aria-label="Active sessions">
          {(sessions.data ?? []).map((s) => (
            <SessionRow key={s.id} s={s} busy={busyId === s.id} onRevoke={() => void signOut(s)} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** the signed-in person: name, password and the devices they are signed in on */
export function SecurityTab() {
  return (
    <div className="space-y-6">
      <ProfileCard />
      <PasswordCard />
      <SessionsCard />
    </div>
  );
}
