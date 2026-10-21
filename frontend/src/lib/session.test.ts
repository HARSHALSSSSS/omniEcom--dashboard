import { describe, it, expect, beforeEach, vi } from "vitest";

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
  onboarding: vi.fn(),
}));
const workspace = vi.hoisted(() => ({ shell: vi.fn() }));
const refreshSession = vi.hoisted(() => vi.fn());

vi.mock("@/api/auth.api", () => ({ authApi: auth }));
vi.mock("@/api/workspace.api", () => ({ workspaceApi: workspace }));
vi.mock("@/api/client", () => ({ refreshSession, onSessionEvent: vi.fn() }));

import { bootstrapSession, resetBootstrap, signIn, signOut, signUp } from "./session";
import { getAccessToken, getRefreshToken, setRefreshToken, clearTokens } from "./tokens";
import { useWorkspaceStore } from "@/store/workspace.store";

const authUser = { id: "u1", email: "a@nova.test", fullName: "Aayush Kumar", userType: "vendor", vendorId: "v1", roles: ["vendor_admin"], emailVerified: true, status: "active", lastLoginAt: null };
const shell = {
  user: { id: "u1", name: "Aayush Kumar", initials: "AK", roleLabel: "Business owner", email: "a@nova.test" },
  business: { id: "v1", name: "Nova Living", plan: "free", tier: "starter" },
  badges: { needsAttention: 3, orders: 2, returns: 0, notifications: 1 },
  features: { "ai.enabled": true },
};
const login = { accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 900, sessionId: "s1", tokenType: "Bearer", user: authUser, vendor: null };

function serverIsHappy(onboarding = { status: "completed", resumeStep: "ready", currentStep: "ready", percentComplete: 100 }) {
  auth.me.mockResolvedValue({ userId: "u1", userType: "vendor", vendorId: "v1", roles: ["vendor_admin"], permissions: ["products:read", "products:write"] });
  workspace.shell.mockResolvedValue(shell);
  auth.onboarding.mockResolvedValue(onboarding);
}

describe("session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTokens();
    resetBootstrap();
    useWorkspaceStore.getState().clearWorkspace();
    useWorkspaceStore.getState().setBootstrapStatus("idle");
  });

  describe("bootstrap", () => {
    it("is anonymous and ready when there is no stored session", async () => {
      await bootstrapSession();
      const s = useWorkspaceStore.getState();
      expect(s.bootstrapStatus).toBe("ready");
      expect(s.isAuthenticated).toBe(false);
      expect(refreshSession).not.toHaveBeenCalled();
    });

    it("turns a stored refresh token into a full session", async () => {
      setRefreshToken("refresh-0", true);
      refreshSession.mockResolvedValue(login);
      serverIsHappy();
      await bootstrapSession();
      const s = useWorkspaceStore.getState();
      expect(s.bootstrapStatus).toBe("ready");
      expect(s.isAuthenticated).toBe(true);
      expect(s.user).toMatchObject({ fullName: "Aayush Kumar", businessName: "Nova Living", role: "owner", emailVerified: true });
      expect(s.permissions).toEqual(["products:read", "products:write"]);
      expect(s.onboardingComplete).toBe(true);
      expect(s.needsAttentionCount).toBe(3);
      expect(s.shell?.features["ai.enabled"]).toBe(true);
    });

    it("sends a business that is still onboarding to the step it stopped at", async () => {
      setRefreshToken("refresh-0", true);
      refreshSession.mockResolvedValue(login);
      serverIsHappy({ status: "in_progress", resumeStep: "channels", currentStep: "channels", percentComplete: 20 });
      await bootstrapSession();
      const s = useWorkspaceStore.getState();
      expect(s.onboardingComplete).toBe(false);
      expect(s.onboardingResumeStep).toBe("channels");
    });

    it("falls back to signed out when the session cannot be restored", async () => {
      setRefreshToken("refresh-0", true);
      refreshSession.mockRejectedValue(new Error("refused"));
      await bootstrapSession();
      const s = useWorkspaceStore.getState();
      expect(s.bootstrapStatus).toBe("ready");
      expect(s.isAuthenticated).toBe(false);
    });

    it("runs only once however many times it is called", async () => {
      await Promise.all([bootstrapSession(), bootstrapSession()]);
      await bootstrapSession();
      expect(useWorkspaceStore.getState().bootstrapStatus).toBe("ready");
    });
  });

  describe("sign in", () => {
    it("keeps the access token in memory and the refresh token on the device", async () => {
      auth.login.mockResolvedValue(login);
      serverIsHappy();
      await signIn("a@nova.test", "pw", true);
      expect(getAccessToken()).toBe("access-1");
      expect(getRefreshToken()).toBe("refresh-1");
      expect(window.localStorage.getItem("omni.refresh-token")).toBe("refresh-1");
      expect(useWorkspaceStore.getState().isAuthenticated).toBe(true);
    });

    it("without 'remember' the refresh token lives for this tab only", async () => {
      auth.login.mockResolvedValue(login);
      serverIsHappy();
      await signIn("a@nova.test", "pw", false);
      expect(window.localStorage.getItem("omni.refresh-token")).toBeNull();
      expect(window.sessionStorage.getItem("omni.refresh-token")).toBe("refresh-1");
    });

    it("leaves nothing behind when the credentials are refused", async () => {
      auth.login.mockRejectedValue(new Error("INVALID_CREDENTIALS"));
      await expect(signIn("a@nova.test", "bad", true)).rejects.toThrow();
      expect(getAccessToken()).toBeNull();
      expect(useWorkspaceStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe("sign up", () => {
    it("registers, signs in (the API returns no tokens) and keeps the business name for the wizard", async () => {
      auth.register.mockResolvedValue({ user: authUser, vendor: { id: "v1", displayName: "Riya Crafts", slug: "riya", status: "active" }, emailVerificationRequired: true });
      auth.login.mockResolvedValue(login);
      serverIsHappy({ status: "in_progress", resumeStep: "business", currentStep: "business", percentComplete: 0 });
      const result = await signUp({ businessName: "Riya Crafts", fullName: "Riya", email: "riya@crafts.test", password: "river-stone-lantern-42" });
      expect(result.emailVerificationRequired).toBe(true);
      expect(auth.login).toHaveBeenCalledWith("riya@crafts.test", "river-stone-lantern-42");
      const s = useWorkspaceStore.getState();
      expect(s.isAuthenticated).toBe(true);
      expect(s.onboardingResumeStep).toBe("business");
      expect(s.onboardingData.business.name).toBe("Riya Crafts");
    });

    it("does not sign in when registration is refused", async () => {
      auth.register.mockRejectedValue(new Error("CONFLICT"));
      await expect(signUp({ businessName: "X Co", fullName: "X Y", email: "x@y.test", password: "river-stone-lantern-42" })).rejects.toThrow();
      expect(auth.login).not.toHaveBeenCalled();
    });
  });

  describe("sign out", () => {
    it("clears the session even when the server cannot be reached", async () => {
      auth.login.mockResolvedValue(login);
      serverIsHappy();
      await signIn("a@nova.test", "pw", true);
      auth.logout.mockRejectedValue(new Error("network"));
      await signOut();
      expect(getAccessToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
      const s = useWorkspaceStore.getState();
      expect(s.isAuthenticated).toBe(false);
      expect(s.permissions).toEqual([]);
    });
  });
});
