import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCan, useCanAny, useFeature } from "./useCan";
import { useWorkspaceStore, type ShellData } from "@/store/workspace.store";

const user = { id: "u-1", fullName: "Test User", email: "t@test.com", businessName: "Test Co", role: "owner" as const };

const shell = (features: Record<string, boolean>): ShellData => ({
  user: { id: "u-1", name: "Test User", initials: "TU", roleLabel: "Business owner" },
  business: { id: "b-1", name: "Test Co", plan: "free", tier: "starter" },
  badges: { needsAttention: 0, orders: 0, returns: 0, notifications: 0 },
  features,
});

const sessionWith = (permissions: string[], features: Record<string, boolean> = {}) =>
  useWorkspaceStore.getState().setSession({
    user,
    permissions,
    shell: shell(features),
    onboardingStatus: "completed",
    onboardingResumeStep: "ready",
  });

describe("permission hooks", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().clearWorkspace();
  });

  it("denies everything before a session exists", () => {
    const { result } = renderHook(() => useCan("products:read"));
    expect(result.current).toBe(false);
  });

  it("grants exactly the permissions the server sent", () => {
    sessionWith(["products:read", "orders:read"]);
    expect(renderHook(() => useCan("products:read")).result.current).toBe(true);
    expect(renderHook(() => useCan("products:write")).result.current).toBe(false);
  });

  it("useCanAny is true when one of several is held", () => {
    sessionWith(["pricing:read"]);
    expect(renderHook(() => useCanAny("pricing:approve", "pricing:read")).result.current).toBe(true);
    expect(renderHook(() => useCanAny("pricing:approve", "pricing:write")).result.current).toBe(false);
  });

  it("reads feature flags from the shell", () => {
    sessionWith([], { "ai.enabled": true, "automation.enabled": false });
    expect(renderHook(() => useFeature("ai.enabled")).result.current).toBe(true);
    expect(renderHook(() => useFeature("automation.enabled")).result.current).toBe(false);
    expect(renderHook(() => useFeature("unknown.flag")).result.current).toBe(false);
  });

  it("clearing the workspace removes every permission", () => {
    sessionWith(["products:read"]);
    useWorkspaceStore.getState().clearWorkspace();
    expect(renderHook(() => useCan("products:read")).result.current).toBe(false);
  });
});
