import { useMemo, useState, type FormEvent } from "react";
import { MailPlus, RotateCw, UserMinus, UserCheck, UserX, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { errorMessage, isApiError } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useInvitations, useMembers, useRoles, useTeamActions } from "@/hooks/useSettings";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { formatDate, formatDateTime } from "@/utils/format";
import { Field, InlineError, ReadOnlyNote, SectionCard, selectClass } from "./fields";
import type { Invitation, Member, MemberStatus, Role, VendorRoleKey } from "@/types/settings";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

const ROLE_FALLBACK: Array<{ key: VendorRoleKey; name: string; hint: string }> = [
  { key: "vendor_admin", name: "Administrator", hint: "Full access, including settings, team and billing." },
  { key: "vendor_staff", name: "Staff", hint: "Works with products, orders, inventory and listings. Cannot change settings or the team." },
  { key: "vendor_viewer", name: "Viewer", hint: "Read-only access." },
];
const ASSIGNABLE: VendorRoleKey[] = ["vendor_admin", "vendor_staff", "vendor_viewer"];

const MEMBER_STATUS: Record<MemberStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  disabled: { label: "Deactivated", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  invited: { label: "Invited", cls: "border-sky-200 bg-sky-50 text-sky-700" },
};
const INVITE_STATUS: Record<Invitation["status"], { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "border-sky-200 bg-sky-50 text-sky-700" },
  accepted: { label: "Accepted", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  revoked: { label: "Revoked", cls: "border-rose-200 bg-rose-50 text-rose-700" },
  expired: { label: "Expired", cls: "border-amber-200 bg-amber-50 text-amber-700" },
};

function roleName(key: string | null, roles: Role[] | undefined): string {
  if (!key) return "No role";
  return roles?.find((r) => r.key === key)?.name ?? ROLE_FALLBACK.find((r) => r.key === key)?.name ?? key;
}

function InviteDialog({ roles, onClose }: { roles: Role[] | undefined; onClose: () => void }) {
  const { invite } = useTeamActions();
  const toast = useToastStore.getState().addToast;
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState<VendorRoleKey>("vendor_staff");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  const acquire = useSubmitLock();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || invite.isPending) return;
    setError(null);
    setFieldError(null);
    const release = acquire();
    if (!release) return;
    try {
      await invite.mutateAsync({ email: email.trim(), roleKey });
      toast({ title: "Invitation sent", description: `${email.trim()} will get an email with a link that works for 7 days.`, variant: "success" });
      onClose();
    } catch (err) {
      if (isApiError(err) && err.fields?.email) setFieldError(err.fields.email);
      setError(isApiError(err) && err.code === "EMAIL_NOT_VERIFIED" ? "Verify your own email address before inviting people." : errorMessage(err, "Could not send the invitation."));
    } finally {
      release();
    }
  };

  const hint = ROLE_FALLBACK.find((r) => r.key === roleKey)?.hint;
  return (
    <Dialog open onOpenChange={(o) => !o && !invite.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>They get an email with a single-use link, valid for 7 days, to create their account.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
          <Field id="invite-email" label="Email address" error={fieldError}>
            <Input id="invite-email" type="email" autoComplete="off" value={email} maxLength={254} error={!!fieldError} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="invite-role" label="Role" hint={hint}>
            <select id="invite-role" className={selectClass} value={roleKey} onChange={(e) => setRoleKey(e.target.value as VendorRoleKey)}>
              {ASSIGNABLE.map((k) => (
                <option key={k} value={k}>
                  {roleName(k, roles)}
                </option>
              ))}
            </select>
          </Field>
          {error && <InlineError>{error}</InlineError>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={invite.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={invite.isPending} disabled={!valid}>
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** members, pending invitations and the roles they can hold; each action is saved immediately */
export function TeamTab() {
  const canWrite = useCan("users:write");
  const canRoles = useCan("roles:read");
  const me = useWorkspaceStore((s) => s.user?.id);
  const toast = useToastStore.getState().addToast;
  const actions = useTeamActions();
  const [filter, setFilter] = useState<MemberStatus | "all">("all");
  const members = useMembers(filter, true);
  const invitations = useInvitations(true);
  const rolesQuery = useRoles(canRoles);
  const roles = rolesQuery.data;
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => members.data?.pages.flatMap((p) => p.items) ?? [], [members.data]);
  const invites = useMemo(() => invitations.data?.pages.flatMap((p) => p.items) ?? [], [invitations.data]);

  const acquire = useSubmitLock();
  const run = async (id: string, work: () => Promise<unknown>, done: { title: string; description?: string }) => {
    const release = acquire();
    if (!release) return;
    setError(null);
    setBusy(id);
    try {
      await work();
      toast({ ...done, variant: "success" });
    } catch (e) {
      setError(errorMessage(e, "That change could not be saved."));
    } finally {
      setBusy(null);
      release();
    }
  };

  return (
    <div className="space-y-6">
      {!canWrite && <ReadOnlyNote>You can see your team but not change it. Ask a business administrator to invite people or change roles.</ReadOnlyNote>}
      {error && <InlineError>{error}</InlineError>}

      <SectionCard
        title="Team members"
        description="People who can sign in to this business."
        aside={
          <div className="flex items-center gap-2">
            <label htmlFor="team-filter" className="sr-only">
              Filter members by status
            </label>
            <select id="team-filter" className={`${selectClass} h-8 w-auto text-xs`} value={filter} onChange={(e) => setFilter(e.target.value as MemberStatus | "all")}>
              <option value="all">All members</option>
              <option value="active">Active</option>
              <option value="disabled">Deactivated</option>
              <option value="invited">Invited</option>
            </select>
            {canWrite && (
              <Button type="button" size="sm" className="gap-1.5" onClick={() => setInviting(true)}>
                <MailPlus className="h-3.5 w-3.5" aria-hidden="true" /> Invite member
              </Button>
            )}
          </div>
        }
      >
        {members.isLoading ? (
          <p className="py-6 text-center text-xs text-muted-foreground" aria-busy="true">
            Loading the team
          </p>
        ) : members.isError ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-red-50 p-3 text-xs text-red-900">
            <p>{errorMessage(members.error, "Could not load the team.")}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void members.refetch()}>
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No members match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <caption className="sr-only">Team members</caption>
              <thead>
                <tr className="border-b border-border text-[11px] font-medium text-muted-foreground">
                  <th scope="col" className="px-3 py-2">Member</th>
                  <th scope="col" className="px-3 py-2">Role</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">Last sign-in</th>
                  {canWrite && (
                    <th scope="col" className="px-3 py-2 text-right">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((m) => {
                  const self = m.id === me;
                  const st = MEMBER_STATUS[m.status];
                  const rowBusy = busy === m.id;
                  const roleOptions = ASSIGNABLE.includes(m.roleKey as VendorRoleKey) ? ASSIGNABLE : [...ASSIGNABLE, m.roleKey as VendorRoleKey];
                  return (
                    <tr key={m.id} className={m.status === "disabled" ? "text-muted-foreground" : ""}>
                      <td className="px-3 py-3">
                        <p className="font-medium text-foreground">
                          {m.fullName}
                          {self && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(you)</span>}
                        </p>
                        <p className="text-muted-foreground">
                          {m.email}
                          {!m.emailVerified && " · email not verified"}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        {canWrite && !self && m.status !== "invited" && m.roleKey ? (
                          <>
                            <label htmlFor={`role-${m.id}`} className="sr-only">
                              Role of {m.fullName}
                            </label>
                            <select
                              id={`role-${m.id}`}
                              className={`${selectClass} h-8 w-40 text-xs`}
                              value={m.roleKey}
                              disabled={rowBusy || !!busy}
                              onChange={(e) => {
                                const next = e.target.value as VendorRoleKey;
                                void run(m.id, () => actions.update.mutateAsync({ id: m.id, body: { roleKey: next } }), { title: "Role changed", description: `${m.fullName} is now ${roleName(next, roles)}.` });
                              }}
                            >
                              {roleOptions.map((k) => (
                                <option key={k} value={k}>
                                  {roleName(k, roles)}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          roleName(m.roleKey, roles)
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-3 py-3">{m.lastLoginAt ? formatDateTime(m.lastLoginAt) : "Never"}</td>
                      {canWrite && (
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {!self && m.status === "active" && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-[11px]"
                                disabled={!!busy}
                                aria-label={`Deactivate ${m.fullName}`}
                                onClick={() => void run(m.id, () => actions.update.mutateAsync({ id: m.id, body: { status: "disabled" } }), { title: "Member deactivated", description: `${m.fullName} is signed out and cannot sign in.` })}
                              >
                                <UserX className="h-3 w-3" aria-hidden="true" /> Deactivate
                              </Button>
                            )}
                            {!self && m.status === "disabled" && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-[11px]"
                                disabled={!!busy}
                                aria-label={`Reactivate ${m.fullName}`}
                                onClick={() => void run(m.id, () => actions.update.mutateAsync({ id: m.id, body: { status: "active" } }), { title: "Member reactivated", description: `${m.fullName} can sign in again.` })}
                              >
                                <UserCheck className="h-3 w-3" aria-hidden="true" /> Reactivate
                              </Button>
                            )}
                            {!self && (
                              <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`Remove ${m.fullName}`} title="Remove from the business" disabled={!!busy} onClick={() => setRemoving(m)}>
                                <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {members.hasNextPage && (
          <div className="mt-3 text-center">
            <Button type="button" variant="outline" size="sm" loading={members.isFetchingNextPage} onClick={() => void members.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Invitations" description="People who were invited and have not joined yet.">
        {invitations.isLoading ? (
          <p className="py-4 text-center text-xs text-muted-foreground" aria-busy="true">
            Loading invitations
          </p>
        ) : invitations.isError ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-red-50 p-3 text-xs text-red-900">
            <p>{errorMessage(invitations.error, "Could not load the invitations.")}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void invitations.refetch()}>
              Retry
            </Button>
          </div>
        ) : invites.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No invitations yet.</p>
        ) : (
          <ul className="divide-y divide-border" aria-label="Invitations">
            {invites.map((i) => {
              const st = INVITE_STATUS[i.status];
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                  <div>
                    <p className="font-medium text-foreground">{i.email}</p>
                    <p className="text-muted-foreground">
                      {roleName(i.roleKey, roles)} · {i.status === "pending" ? `expires ${formatDate(i.expiresAt)}` : i.status === "accepted" && i.acceptedAt ? `joined ${formatDate(i.acceptedAt)}` : `sent ${formatDate(i.createdAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                    {canWrite && (i.status === "pending" || i.status === "expired") && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-[11px]"
                        disabled={!!busy}
                        loading={busy === i.id}
                        aria-label={`Resend the invitation to ${i.email}`}
                        onClick={() => void run(i.id, () => actions.resend.mutateAsync(i.id), { title: "Invitation sent again", description: `${i.email} gets a new link, valid for 7 days.` })}
                      >
                        {busy !== i.id && <RotateCw className="h-3 w-3" aria-hidden="true" />} Resend
                      </Button>
                    )}
                    {canWrite && i.status === "pending" && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-destructive hover:text-destructive" disabled={!!busy} aria-label={`Revoke the invitation to ${i.email}`} onClick={() => setRevoking(i)}>
                        <XCircle className="h-3 w-3" aria-hidden="true" /> Revoke
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {invitations.hasNextPage && (
          <div className="mt-3 text-center">
            <Button type="button" variant="outline" size="sm" loading={invitations.isFetchingNextPage} onClick={() => void invitations.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Roles and access" description="What each role can do. Every member has exactly one role.">
        {canRoles && rolesQuery.isLoading ? (
          <p className="text-xs text-muted-foreground" aria-busy="true">
            Loading roles
          </p>
        ) : roles && roles.length > 0 ? (
          <ul className="space-y-2" aria-label="Roles">
            {roles
              .filter((r) => r.userType === "vendor")
              .map((r) => (
                <li key={r.key} className="rounded-lg border border-border p-3 text-xs">
                  <details>
                    <summary className="cursor-pointer font-medium text-foreground">
                      {r.name} <span className="font-normal text-muted-foreground">· {r.permissions.length} permissions</span>
                    </summary>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {r.permissions.map((p) => (
                        <li key={p} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
          </ul>
        ) : (
          <ul className="space-y-2" aria-label="Roles">
            {ROLE_FALLBACK.map((r) => (
              <li key={r.key} className="rounded-lg border border-border p-3 text-xs">
                <p className="font-medium text-foreground">{r.name}</p>
                <p className="text-muted-foreground">{r.hint}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {inviting && <InviteDialog roles={roles} onClose={() => setInviting(false)} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && !actions.remove.isPending && setRemoving(null)}
        title="Remove this member?"
        description={`${removing?.fullName ?? ""} (${removing?.email ?? ""}) loses access to the business and is signed out everywhere. This cannot be undone from here; invite them again to give access back.`}
        confirmText="Remove member"
        variant="destructive"
        loading={actions.remove.isPending}
        onConfirm={() => {
          const target = removing;
          if (!target) return;
          void run(target.id, () => actions.remove.mutateAsync(target.id), { title: "Member removed", description: target.email }).finally(() => setRemoving(null));
        }}
      />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && !actions.revoke.isPending && setRevoking(null)}
        title="Revoke this invitation?"
        description={`The link sent to ${revoking?.email ?? ""} stops working. You can invite them again later.`}
        confirmText="Revoke invitation"
        variant="destructive"
        loading={actions.revoke.isPending}
        onConfirm={() => {
          const target = revoking;
          if (!target) return;
          void run(target.id, () => actions.revoke.mutateAsync(target.id), { title: "Invitation revoked", description: target.email }).finally(() => setRevoking(null));
        }}
      />
    </div>
  );
}
