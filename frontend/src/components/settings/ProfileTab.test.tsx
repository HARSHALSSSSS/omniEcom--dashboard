import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { MyProfile } from "@/types/settings";

const api = vi.hoisted(() => ({ profile: vi.fn(), updateProfile: vi.fn(), sessions: vi.fn() }));
const hub = vi.hoisted(() => ({ accounts: vi.fn() }));
const refreshShell = vi.hoisted(() => vi.fn());
vi.mock("@/api/settings.api", () => ({ settingsApi: api }));
vi.mock("@/api/hub.api", () => ({ hubApi: hub }));
vi.mock("@/lib/session", () => ({ refreshShell }));

import { ProfileTab } from "./ProfileTab";

const PROFILE = (over: Partial<MyProfile["user"]> = {}): MyProfile => ({
  user: { id: "u1", email: "asha@novaliving.test", fullName: "Asha Rao", emailVerified: true, lastLoginAt: "2026-10-20T10:00:00.000Z", phone: null, roleTitle: null, roles: ["vendor_admin"], ...over },
  vendor: { id: "v1", displayName: "Nova Living" },
});

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProfileTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  useWorkspaceStore.setState({ permissions: ["settings:read"] });
  refreshShell.mockResolvedValue(undefined);
  api.profile.mockResolvedValue(PROFILE());
  api.sessions.mockResolvedValue([{ id: "s1", current: true, startedAt: "2026-10-20T10:00:00.000Z", lastActiveAt: new Date().toISOString(), userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/124.0 Safari/537.36", ip: "10.0.0.7" }]);
  hub.accounts.mockResolvedValue({ items: [], summary: { total: 0, healthy: 0, warning: 0, error: 0, paused: 0 } });
});
afterEach(() => cleanup());

describe("ProfileTab", () => {
  it("shows the real person and no invented identity", async () => {
    renderTab();
    expect((await screen.findAllByText("Asha Rao")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("asha@novaliving.test").length).toBeGreaterThan(0);
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.queryByText(/Marcus Vance|nexus-retail|YubiKey/)).not.toBeInTheDocument();
    expect(await screen.findByText("Chrome on Windows (this device)")).toBeInTheDocument();
  });

  it("saves the phone and job title for real and refreshes the shell", async () => {
    api.updateProfile.mockResolvedValue(PROFILE({ phone: "+91 98765 43210", roleTitle: "Operations lead" }));
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole("tab", { name: /Personal Information/ }));
    await user.type(screen.getByLabelText("Direct phone"), "+91 98765 43210");
    await user.type(screen.getByLabelText("Job title"), "Operations lead");
    await user.click(screen.getByRole("button", { name: "Save Personal Information" }));
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith("Asha Rao", { phone: "+91 98765 43210", roleTitle: "Operations lead" }));
    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.title)).toContain("Profile saved"));
    expect(refreshShell).toHaveBeenCalled();
  });

  it("shows the real error when the save fails, and never a success", async () => {
    api.updateProfile.mockRejectedValue(new ApiError({ code: "SERVER", message: "The server is unavailable", status: 503 }));
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole("tab", { name: /Personal Information/ }));
    await user.type(screen.getByLabelText("Job title"), "Operations lead");
    await user.click(screen.getByRole("button", { name: "Save Personal Information" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The server is unavailable");
    expect(useToastStore.getState().toasts.map((t) => t.title)).not.toContain("Profile saved");
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ title: "Could not save your profile", variant: "destructive" });
  });

  it("refuses a bad phone number before calling the server, and shows the email read-only", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole("tab", { name: /Personal Information/ }));
    expect(screen.getByLabelText("Sign-in email")).toBeDisabled();
    await user.type(screen.getByLabelText("Direct phone"), "abc");
    await user.click(screen.getByRole("button", { name: "Save Personal Information" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/7 to 20 digits/);
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it("says so when the profile cannot be loaded and offers a retry", async () => {
    api.profile.mockRejectedValueOnce(new ApiError({ code: "SERVER", message: "Boom", status: 500 }));
    const user = userEvent.setup();
    renderTab();
    expect(await screen.findByText("Boom")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect((await screen.findAllByText("Asha Rao")).length).toBeGreaterThan(0);
  });
});
