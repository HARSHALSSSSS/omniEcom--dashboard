import { authApi, type AuthUser, type LoginResult, type RegisterInput } from "@/api/auth.api";
import { workspaceApi } from "@/api/workspace.api";
import { onboardingApi, type OnboardingProgress } from "@/api/onboarding.api";
import { onSessionEvent, refreshSession } from "@/api/client";
import { clearTokens, getRefreshToken, purgeLegacyStorage, setAccessToken, setRefreshToken } from "@/lib/tokens";
import { queryClient } from "@/lib/queryClient";
import { useWorkspaceStore, type ShellData, type WorkspaceUser } from "@/store/workspace.store";
import { setFormatPreferences } from "@/utils/format";

/** server role keys -> the role label the UI uses */
const ROLE_LABEL: Record<string, WorkspaceUser["role"]> = {
  vendor_admin: "owner",
  vendor_staff: "seller",
  vendor_viewer: "viewer",
};

const displayRole = (roles: string[]): WorkspaceUser["role"] => ROLE_LABEL[roles[0] ?? ""] ?? "viewer";

function toWorkspaceUser(user: AuthUser, businessName: string): WorkspaceUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    businessName,
    role: displayRole(user.roles),
    emailVerified: user.emailVerified,
  };
}

/**
 * Loads everything the app needs to render after a token exists: who I am and what I may do (/me), the shell
 * (/workspace/shell: business, badges, feature flags) and where onboarding stands (/onboarding).
 */
export async function loadWorkspace(user?: AuthUser): Promise<void> {
  const [me, shell, onboarding] = await Promise.all([authApi.me(), workspaceApi.shell(), authApi.onboarding()]);
  const businessName = shell.business.name;
  applyFormatPreferences(shell);
  const base: WorkspaceUser = user
    ? toWorkspaceUser(user, businessName)
    : {
        id: shell.user.id,
        fullName: shell.user.name,
        email: shell.user.email ?? "",
        businessName,
        role: displayRole(me.roles),
      };
  useWorkspaceStore.getState().setSession({
    user: { ...base, businessName },
    permissions: me.permissions,
    shell,
    onboardingStatus: onboarding.status,
    onboardingResumeStep: onboarding.resumeStep,
  });
}

let booting: Promise<void> | null = null;

/** Runs once at start-up: a stored refresh token becomes a live session, otherwise the visitor is anonymous. */
export function bootstrapSession(): Promise<void> {
  booting ??= (async () => {
    const store = useWorkspaceStore.getState();
    store.setBootstrapStatus("loading");
    purgeLegacyStorage();
    try {
      if (getRefreshToken()) {
        const data = (await refreshSession()) as LoginResult;
        await loadWorkspace(data.user);
      } else {
        store.clearWorkspace();
      }
    } catch {
      // a refused token is already cleared by the client; a network failure leaves the visitor at the sign-in screen
      useWorkspaceStore.getState().clearWorkspace();
    } finally {
      useWorkspaceStore.getState().setBootstrapStatus("ready");
    }
  })();
  return booting;
}

/** Test seam: forget that bootstrap ran. */
export function resetBootstrap(): void {
  booting = null;
}

export async function signIn(email: string, password: string, remember: boolean): Promise<void> {
  const data = await authApi.login(email, password);
  setAccessToken(data.accessToken);
  setRefreshToken(data.refreshToken, remember);
  queryClient.clear();
  await loadWorkspace(data.user);
}

/** Creates the business and the owner account, then signs in (the API returns no tokens from /auth/register). */
export async function signUp(input: RegisterInput): Promise<{ emailVerificationRequired: boolean }> {
  const created = await authApi.register(input);
  await signIn(input.email, input.password, true);
  const store = useWorkspaceStore.getState();
  store.updateOnboardingData({
    business: { ...store.onboardingData.business, name: input.businessName },
  });
  return { emailVerificationRequired: created.emailVerificationRequired };
}

export async function signOut(): Promise<void> {
  try {
    await authApi.logout();
  } catch {
    // the token may already be dead; the local session ends either way
  }
  endSession();
}

/** Drops the local session (also used when the server says the session is gone). */
export function endSession(): void {
  clearTokens();
  queryClient.clear();
  useWorkspaceStore.getState().clearWorkspace();
}

/** Re-reads the shell (badges, counters) after something changed. */
export async function refreshShell(): Promise<void> {
  const shell = await workspaceApi.shell();
  applyFormatPreferences(shell);
  useWorkspaceStore.getState().setShell(shell);
  syncBusinessName(shell.business.name);
}

/** the business currency, number format and time zone of the settings drive utils/format */
function applyFormatPreferences(shell: ShellData): void {
  setFormatPreferences({ currency: shell.business.currency, numberFormat: shell.business.numberFormat === "international" ? "international" : "indian", timezone: shell.business.timezone });
}

/** a renamed business shows its new name in the top bar without a reload */
function syncBusinessName(name: string): void {
  const store = useWorkspaceStore.getState();
  if (store.user && name && store.user.businessName !== name) store.setUser({ ...store.user, businessName: name });
}

/**
 * Re-reads where onboarding stands (GET /onboarding) into the session, so the route guards see a finished wizard
 * (or the step to resume on) without a page reload. Also keeps the business name of the signed-in user current.
 */
export async function refreshOnboarding(): Promise<OnboardingProgress> {
  const progress = await onboardingApi.get();
  const store = useWorkspaceStore.getState();
  store.setOnboardingProgress({ status: progress.status, resumeStep: progress.resumeStep });
  const name = progress.business.businessName;
  if (store.user && name && store.user.businessName !== name) {
    store.setUser({ ...store.user, businessName: name });
  }
  return progress;
}

// when the client cannot renew the session any more, leave the workspace; a renewed pair needs no UI change
onSessionEvent((event) => {
  if (event.type === "expired") endSession();
});
