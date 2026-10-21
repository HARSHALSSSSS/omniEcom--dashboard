import { describe, it, expect, beforeEach, vi } from "vitest";

const onboarding = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/api/onboarding.api", () => ({ onboardingApi: onboarding }));
vi.mock("@/api/auth.api", () => ({ authApi: {} }));
vi.mock("@/api/workspace.api", () => ({ workspaceApi: {} }));
vi.mock("@/api/client", () => ({ refreshSession: vi.fn(), onSessionEvent: vi.fn() }));

import { refreshOnboarding } from "./session";
import { useWorkspaceStore } from "@/store/workspace.store";

describe("refreshOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().clearWorkspace();
    useWorkspaceStore.getState().setSession({
      user: { id: "u1", fullName: "Asha", email: "a@nova.test", businessName: "Old name", role: "owner" },
      permissions: [],
      shell: null,
      onboardingStatus: "in_progress",
      onboardingResumeStep: "business",
    });
  });

  it("lets the route guards see a finished onboarding and keeps the business name current", async () => {
    onboarding.get.mockResolvedValue({ status: "completed", resumeStep: "ready", business: { businessName: "New name" } });
    await refreshOnboarding();
    const s = useWorkspaceStore.getState();
    expect(s.onboardingComplete).toBe(true);
    expect(s.onboardingStatus).toBe("completed");
    expect(s.user?.businessName).toBe("New name");
  });

  it("follows the server to the step to resume on", async () => {
    onboarding.get.mockResolvedValue({ status: "in_progress", resumeStep: "inventory", business: { businessName: "Old name" } });
    await refreshOnboarding();
    expect(useWorkspaceStore.getState().onboardingResumeStep).toBe("inventory");
    expect(useWorkspaceStore.getState().onboardingComplete).toBe(false);
  });
});
