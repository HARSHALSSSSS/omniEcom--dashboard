import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Building2, CheckCircle2, Circle, Clock, Key, Pencil, Shield, ShieldCheck, Smartphone, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { toast } from "@/hooks/useToast";
import { errorMessage } from "@/api/errors";
import { hubApi } from "@/api/hub.api";
import { settingsApi } from "@/api/settings.api";
import { refreshShell } from "@/lib/session";
import { ROUTES } from "@/constants/routes";
import { useWorkspaceStore } from "@/store/workspace.store";
import { formatDateTime, formatRelativeTime } from "@/utils/format";
import type { MyProfile, SettingsOverview } from "@/types/settings";

type ProfileSubTab = "overview" | "personal" | "security" | "notifications" | "activity";

const PHONE = /^\+?[0-9][0-9 ()-]{5,18}[0-9]$/;
const PROFILE_KEY = ["settings", "profile"] as const;
const SESSIONS_KEY = ["settings", "sessions", "profile"] as const;

const SUBTABS: Array<{ id: ProfileSubTab; label: string; icon: typeof Shield }> = [
  { id: "overview", label: "Overview", icon: UserCheck },
  { id: "personal", label: "Personal Information", icon: Pencil },
  { id: "security", label: "Security", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "activity", label: "Activity", icon: Clock },
];

const shortDevice = (ua: string | null): string => {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
};

export function ProfileTab({ s }: { s?: SettingsOverview | null } = {}) {
  const [activeSubTab, setActiveSubTab] = useState<ProfileSubTab>("overview");
  const qc = useQueryClient();
  const storeUser = useWorkspaceStore((state) => state.user);
  const shell = useWorkspaceStore((state) => state.shell);
  const permissions = useWorkspaceStore((state) => state.permissions);

  const profile = useQuery({ queryKey: PROFILE_KEY, queryFn: ({ signal }) => settingsApi.profile(signal), staleTime: 30_000 });
  const sessions = useQuery({ queryKey: SESSIONS_KEY, queryFn: () => settingsApi.sessions(), staleTime: 30_000, retry: false });
  const accounts = useQuery({ queryKey: ["hub", "accounts", "profile-tab"], queryFn: () => hubApi.accounts(), staleTime: 60_000, retry: false });

  const me = profile.data?.user;
  const fullNameNow = me?.fullName ?? storeUser?.fullName ?? shell?.user?.name ?? "";
  const emailNow = me?.email ?? storeUser?.email ?? shell?.user?.email ?? "";
  const roleLabel = shell?.user?.roleLabel ?? null;

  const [form, setForm] = useState({ fullName: "", phone: "", roleTitle: "" });
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (me) setForm({ fullName: me.fullName, phone: me.phone ?? "", roleTitle: me.roleTitle ?? "" });
  }, [me?.fullName, me?.phone, me?.roleTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useGuardedMutation({
    mutationFn: (v: { fullName: string; phone: string | null; roleTitle: string | null }) => settingsApi.updateProfile(v.fullName, { phone: v.phone, roleTitle: v.roleTitle }),
    onSuccess: (saved: MyProfile) => {
      qc.setQueryData(PROFILE_KEY, saved);
      const current = useWorkspaceStore.getState().user;
      if (current) useWorkspaceStore.getState().setUser({ ...current, fullName: saved.user.fullName });
      refreshShell().catch(() => undefined);
    },
  });

  const dirty = me !== undefined && (form.fullName.trim() !== me.fullName || form.phone.trim() !== (me.phone ?? "") || form.roleTitle.trim() !== (me.roleTitle ?? ""));

  const submit = () => {
    const fullName = form.fullName.trim();
    const phone = form.phone.trim();
    if (fullName.length < 2) return setProblem("Enter your full name (at least 2 characters).");
    if (phone && !PHONE.test(phone)) return setProblem("Enter a phone number with 7 to 20 digits, for example +91 98765 43210.");
    if (form.roleTitle.trim() && form.roleTitle.trim().length < 2) return setProblem("A job title needs at least 2 characters.");
    setProblem(null);
    save.mutate(
      { fullName, phone: phone || null, roleTitle: form.roleTitle.trim() || null },
      {
        onSuccess: () => toast({ title: "Profile saved", description: "Your details are updated.", variant: "success" }),
        onError: (e) => {
          setProblem(errorMessage(e, "Your profile could not be saved."));
          toast({ title: "Could not save your profile", description: errorMessage(e, "Try again in a moment."), variant: "destructive" });
        },
      },
    );
  };

  const initials =
    fullNameNow
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  const businessName = s?.business?.displayName || shell?.business?.name || profile.data?.vendor?.displayName || "";
  const modules = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of permissions) m.set(p.split(":")[0] ?? p, (m.get(p.split(":")[0] ?? p) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  const checklist = [
    { label: "Email verified", done: me?.emailVerified ?? false },
    { label: "Phone number added", done: Boolean(me?.phone) },
    { label: "Job title added", done: Boolean(me?.roleTitle) },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const sessionList = sessions.data ?? [];

  if (profile.isLoading && !me) {
    return (
      <p role="status" className="py-10 text-center text-xs text-muted-foreground">
        Loading your profile...
      </p>
    );
  }
  if (profile.isError && !me) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-6 text-center text-xs">
        <p className="text-rose-700">{errorMessage(profile.error, "Your profile could not be loaded.")}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void profile.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-20">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Link to={ROUTES.SETTINGS} className="transition-colors hover:text-foreground">
          Settings
        </Link>
        <span>/</span>
        <span className="text-muted-foreground">Account</span>
        <span>/</span>
        <span className="font-semibold text-primary">Profile</span>
      </nav>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Your Profile</h1>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">Your name, job title and phone number, the access your role gives you, and where you are signed in.</p>
        </div>

        <div className="flex min-w-[280px] items-center gap-3 rounded-xl border border-border/80 bg-card p-3 shadow-sm">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-inner">{initials}</div>
          <div className="min-w-0 flex-1 leading-snug">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-bold text-foreground">{fullNameNow}</span>
              {me?.emailVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-3 w-3" />
                  Email verified
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">{emailNow}</p>
            {roleLabel && <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400">{roleLabel}</p>}
          </div>
        </div>
      </div>

      <div role="tablist" aria-label="Profile navigation" className="flex items-center gap-2 overflow-x-auto border-b border-border text-xs font-medium">
        {SUBTABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeSubTab === t.id}
              onClick={() => setActiveSubTab(t.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 transition-colors ${activeSubTab === t.id ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {activeSubTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-lg font-bold text-white shadow-md">{initials}</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-foreground">{fullNameNow}</h2>
                    {roleLabel && <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">{roleLabel}</span>}
                  </div>
                  <p className="text-xs font-medium text-foreground/80">{me?.roleTitle ?? "No job title yet"}</p>
                  <p className="text-[11px] text-muted-foreground">{me?.lastLoginAt ? `Last sign-in ${formatDateTime(me.lastLoginAt)}` : "No sign-in recorded yet"}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/70 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sign-in email</span>
                  <p className="mt-1 text-xs font-semibold text-foreground">{emailNow}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{me?.emailVerified ? "Verified" : "Not verified yet"}</p>
                </div>
                <div className="rounded-lg border border-border/70 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Direct phone</span>
                  <p className="mt-1 text-xs font-semibold text-foreground">{me?.phone ?? "Not set"}</p>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-border/70 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Business and connected channels</span>
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  {businessName || "Your business"}
                </div>
                {accounts.isLoading ? (
                  <p className="text-[11px] text-muted-foreground">Loading channels...</p>
                ) : (accounts.data?.items.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {accounts.data!.items.slice(0, 6).map((acc) => (
                      <span key={acc.id} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground">
                        {acc.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    No channels connected yet.{" "}
                    <Link to={ROUTES.MARKETPLACE_HUB} className="font-semibold text-foreground underline">
                      Open the Marketplace Hub
                    </Link>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border pt-4">
                <span className="text-xs text-muted-foreground">Change your name, job title or phone number.</span>
                <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setActiveSubTab("personal")}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Profile Details
                </Button>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Your access</h3>
                {roleLabel && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-muted-foreground">{roleLabel}</span>}
              </div>
              {modules.length === 0 ? (
                <p className="text-xs text-muted-foreground">Your role has no permissions yet.</p>
              ) : (
                <ul className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  {modules.map(([name, n]) => (
                    <li key={name} className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
                      <span className="capitalize text-foreground">{name.replace(/[-_]/g, " ")}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground">Each number is how many actions your role allows in that area.</p>
            </div>
          </div>

          <div className="space-y-6 lg:col-span-5">
            <div className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Profile completeness</h3>
                <span className="font-mono text-xs font-bold text-foreground">
                  {doneCount} / {checklist.length}
                </span>
              </div>
              <ul className="space-y-2 text-xs">
                {checklist.map((c) => (
                  <li key={c.label} className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {c.done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                      {c.label}
                    </span>
                    <span className="text-muted-foreground">{c.done ? "Done" : "To do"}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Recent sign-ins</h3>
                <button type="button" onClick={() => setActiveSubTab("activity")} className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
                  View all
                </button>
              </div>
              <SessionList sessions={sessionList.slice(0, 3)} loading={sessions.isLoading} error={sessions.isError ? errorMessage(sessions.error) : null} onRetry={() => void sessions.refetch()} />
            </div>
          </div>
        </div>
      )}

      {activeSubTab === "personal" && (
        <div className="max-w-3xl space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h3 className="text-base font-bold text-foreground">Personal Information</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Update your name, job title and direct phone number.</p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="profile-name" className="text-xs font-medium text-foreground">
                Full name
              </label>
              <Input id="profile-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="profile-title" className="text-xs font-medium text-foreground">
                Job title
              </label>
              <Input id="profile-title" value={form.roleTitle} onChange={(e) => setForm({ ...form, roleTitle: e.target.value })} maxLength={80} placeholder="For example Operations lead" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="profile-email" className="text-xs font-medium text-foreground">
                Sign-in email
              </label>
              <Input id="profile-email" type="email" value={emailNow} readOnly disabled />
              <p className="text-[11px] text-muted-foreground">Your sign-in email cannot be changed here. Ask an admin or support to change it.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="profile-phone" className="text-xs font-medium text-foreground">
                Direct phone
              </label>
              <Input id="profile-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" />
            </div>
          </div>

          {problem && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
              {problem}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" size="sm" disabled={!dirty || save.isPending} onClick={() => me && (setProblem(null), setForm({ fullName: me.fullName, phone: me.phone ?? "", roleTitle: me.roleTitle ?? "" }))}>
              Reset
            </Button>
            <Button type="button" size="sm" disabled={!dirty || save.isPending} onClick={submit}>
              {save.isPending ? "Saving..." : "Save Personal Information"}
            </Button>
          </div>
        </div>
      )}

      {activeSubTab === "security" && (
        <div className="max-w-3xl space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h3 className="text-base font-bold text-foreground">Passwords and sessions</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">You are signed in on {sessions.isLoading ? "..." : sessionList.length} device{sessionList.length === 1 ? "" : "s"}.</p>
          </div>
          <SessionList sessions={sessionList} loading={sessions.isLoading} error={sessions.isError ? errorMessage(sessions.error) : null} onRetry={() => void sessions.refetch()} />
          <div className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <Key className="h-4 w-4" />
            <span>
              Change your password or sign out other devices in{" "}
              <Link to={`${ROUTES.SETTINGS}/security`} className="font-semibold text-foreground underline">
                Settings &gt; Security
              </Link>
              .
            </span>
          </div>
        </div>
      )}

      {activeSubTab === "notifications" && (
        <div className="max-w-3xl space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-base font-bold text-foreground">Notifications</h3>
          <p className="text-xs text-muted-foreground">
            Which alerts your business receives, such as dispatch SLA breaches, stockouts, token renewals, sync failures and returns, is set per business in{" "}
            <Link to={`${ROUTES.SETTINGS}/notifications`} className="font-semibold text-foreground underline">
              Settings &gt; Notifications
            </Link>
            .
          </p>
        </div>
      )}

      {activeSubTab === "activity" && (
        <div className="max-w-3xl space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Where you are signed in</h3>
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">{sessionList.length} sessions</span>
          </div>
          <SessionList sessions={sessionList} loading={sessions.isLoading} error={sessions.isError ? errorMessage(sessions.error) : null} onRetry={() => void sessions.refetch()} />
        </div>
      )}
    </div>
  );
}

function SessionList({ sessions, loading, error, onRetry }: { sessions: Array<{ id: string; current: boolean; startedAt: string; lastActiveAt: string; userAgent: string | null; ip: string | null }>; loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) return <p className="text-[11px] text-muted-foreground">Loading sessions...</p>;
  if (error)
    return (
      <p role="alert" className="text-[11px] text-rose-700">
        {error}{" "}
        <button type="button" onClick={onRetry} className="font-semibold underline">
          Retry
        </button>
      </p>
    );
  if (sessions.length === 0) return <p className="text-[11px] text-muted-foreground">No active sessions.</p>;
  return (
    <ul className="space-y-2">
      {sessions.map((x) => (
        <li key={x.id} className="flex items-start justify-between rounded-lg border border-border/70 p-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-400">
              <Smartphone className="h-3.5 w-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">
                {shortDevice(x.userAgent)}
                {x.current ? " (this device)" : ""}
              </h4>
              <p className="text-[11px] text-muted-foreground">
                {x.ip ?? "Unknown address"} · signed in {formatDateTime(x.startedAt)}
              </p>
            </div>
          </div>
          <span className="whitespace-nowrap text-[10px] text-muted-foreground">Active {formatRelativeTime(x.lastActiveAt)}</span>
        </li>
      ))}
    </ul>
  );
}
