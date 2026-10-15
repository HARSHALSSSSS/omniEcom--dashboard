import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCan } from "./useCan";
import { useWorkspaceStore } from "@/store/workspace.store";

describe("useCan permission hook", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().clearWorkspace();
  });

  it("grants owner all permissions", () => {
    useWorkspaceStore.getState().setUser({
      id: "u-1",
      fullName: "Owner User",
      email: "owner@test.com",
      businessName: "Test Co",
      role: "owner",
    });

    const { result } = renderHook(() => useCan("manage:workspace"));
    expect(result.current).toBe(true);

    const { result: financeResult } = renderHook(() =>
      useCan("manage:finance"),
    );
    expect(financeResult.current).toBe(true);
  });

  it("restricts viewer to analytics only", () => {
    useWorkspaceStore.getState().setUser({
      id: "u-2",
      fullName: "Viewer User",
      email: "viewer@test.com",
      businessName: "Test Co",
      role: "viewer",
    });

    const { result: analyticsResult } = renderHook(() =>
      useCan("view:analytics"),
    );
    expect(analyticsResult.current).toBe(true);

    const { result: workspaceResult } = renderHook(() =>
      useCan("manage:workspace"),
    );
    expect(workspaceResult.current).toBe(false);
  });
});
