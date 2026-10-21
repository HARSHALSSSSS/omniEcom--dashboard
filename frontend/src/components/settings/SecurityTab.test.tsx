import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/api/errors";
import { ADMIN, signIn } from "@/test/settingsFixtures";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { AccountSession } from "@/types/settings";

const api = vi.hoisted(() => ({ changePassword: vi.fn(), sessions: vi.fn(), revokeSession: vi.fn(), revokeOtherSessions: vi.fn(), updateProfile: vi.fn() }));
vi.mock("@/api/settings.api", () => ({ settingsApi: api }));
const session = vi.hoisted(() => ({ refreshShell: vi.fn() }));
vi.mock("@/lib/session", () => session);

import { SecurityTab } from "./SecurityTab";
import { describeAgent } from "./security";

const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const sess = (over: Partial<AccountSession> = {}): AccountSession => ({ id: "s1", current: true, startedAt: "2026-10-21T05:00:00.000Z", lastActiveAt: new Date().toISOString(), userAgent: CHROME_WIN, ip: "203.0.113.5", ...over });

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SecurityTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  session.refreshShell.mockReset();
  session.refreshShell.mockResolvedValue(undefined);
  signIn(ADMIN);
  api.sessions.mockResolvedValue([sess(), sess({ id: "s2", current: false, userAgent: SAFARI_IOS, ip: "198.51.100.9" }), sess({ id: "s3", current: false, userAgent: null, ip: null })]);
});

describe("describeAgent", () => {
  it("names the browser and system", () => {
    expect(describeAgent(CHROME_WIN)).toBe("Chrome on Windows");
    expect(describeAgent(SAFARI_IOS)).toBe("Safari on iOS");
    expect(describeAgent(null)).toBe("Unknown device");
  });
});

describe("SecurityTab", () => {
  it("renames the signed-in person", async () => {
    const user = userEvent.setup();
    api.updateProfile.mockResolvedValue({ user: { id: "u1", fullName: "Asha Rao", email: "asha@novaliving.test" } });
    renderTab();
    const save = screen.getByRole("button", { name: "Save name" });
    expect(save).toBeDisabled();
    const name = screen.getByLabelText("Full name");
    expect(name).toHaveValue("Asha Admin");
    await user.clear(name);
    await user.type(name, "Asha Rao");
    await user.click(save);
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith("Asha Rao"));
    await waitFor(() => expect(useWorkspaceStore.getState().user?.fullName).toBe("Asha Rao"));
    expect(session.refreshShell).toHaveBeenCalled();
  });

  it("changes the password after checking the confirmation", async () => {
    const user = userEvent.setup();
    api.changePassword.mockResolvedValue({ message: "Password changed" });
    renderTab();
    const submit = screen.getByRole("button", { name: "Change password" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Current password"), "old-password-1");
    await user.type(screen.getByLabelText("New password"), "short");
    expect(screen.getByText("Use at least 10 characters.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("New password"));
    await user.type(screen.getByLabelText("New password"), "river-stone-lantern-42");
    await user.type(screen.getByLabelText("Confirm new password"), "river-stone-lantern-4");
    expect(screen.getByText("The passwords do not match.")).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Confirm new password"), "2");
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith({ currentPassword: "old-password-1", newPassword: "river-stone-lantern-42" }));
    await waitFor(() => expect(screen.getByLabelText("Current password")).toHaveValue(""));
  });

  it("tells the seller the current password is wrong", async () => {
    const user = userEvent.setup();
    api.changePassword.mockRejectedValue(new ApiError({ code: "INVALID_CREDENTIALS", message: "Invalid", status: 401 }));
    renderTab();
    await user.type(screen.getByLabelText("Current password"), "wrong-password");
    await user.type(screen.getByLabelText("New password"), "river-stone-lantern-42");
    await user.type(screen.getByLabelText("Confirm new password"), "river-stone-lantern-42");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Your current password is not correct.")).toBeInTheDocument();
  });

  it("lists the sessions and signs one device out", async () => {
    const user = userEvent.setup();
    api.revokeSession.mockResolvedValue({ message: "Session revoked" });
    renderTab();
    expect(await screen.findByText("Chrome on Windows")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign out Chrome on Windows/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign out Safari on iOS (198.51.100.9)" }));
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledWith("s2"));
  });

  it("signs out every other device", async () => {
    const user = userEvent.setup();
    api.revokeOtherSessions.mockResolvedValue({ revoked: 2 });
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Sign out all other devices" }));
    await waitFor(() => expect(api.revokeOtherSessions).toHaveBeenCalledTimes(1));
    expect(api.revokeSession).not.toHaveBeenCalled(); // one call, not one per device
  });

  it("says so when the other devices could not be signed out", async () => {
    const user = userEvent.setup();
    api.revokeOtherSessions.mockRejectedValue(new ApiError({ code: "INTERNAL", message: "Boom", status: 500 }));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Sign out all other devices" }));
    expect(await screen.findByText("Boom")).toBeInTheDocument();
  });
});
