import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/api/errors";
import { ADMIN, signIn } from "@/test/settingsFixtures";
import type { Invitation, Member } from "@/types/settings";

const api = vi.hoisted(() => ({
  listMembers: vi.fn(),
  updateMember: vi.fn(),
  removeMember: vi.fn(),
  listInvitations: vi.fn(),
  invite: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  roles: vi.fn(),
}));
vi.mock("@/api/settings.api", () => ({ settingsApi: api }));

import { TeamTab } from "./TeamTab";

const member = (over: Partial<Member> = {}): Member => ({ id: "m1", email: "ravi@novaliving.test", fullName: "Ravi Menon", status: "active", roleKey: "vendor_staff", emailVerified: true, lastLoginAt: "2026-10-19T08:00:00.000Z", createdAt: "2026-10-01T08:00:00.000Z", ...over });
const me = member({ id: "u1", email: "asha@novaliving.test", fullName: "Asha Admin", roleKey: "vendor_admin" });
const invitation = (over: Partial<Invitation> = {}): Invitation => ({ id: "i1", email: "new@novaliving.test", roleKey: "vendor_viewer", status: "pending", expiresAt: "2026-10-28T08:00:00.000Z", acceptedAt: null, invitedBy: "Asha Admin", createdAt: "2026-10-21T08:00:00.000Z", ...over });
const page = <T,>(items: T[]) => ({ items, nextCursor: null, hasMore: false });

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TeamTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  signIn(ADMIN);
  api.listMembers.mockResolvedValue(page([me, member(), member({ id: "m2", fullName: "Dev Rao", email: "dev@novaliving.test", status: "disabled", roleKey: "vendor_viewer" })]));
  api.listInvitations.mockResolvedValue(page([invitation()]));
  api.roles.mockResolvedValue([
    { key: "vendor_admin", name: "Vendor Admin", userType: "vendor", permissions: ["vendors:write", "users:write"] },
    { key: "vendor_staff", name: "Vendor Staff", userType: "vendor", permissions: ["products:read"] },
    { key: "vendor_viewer", name: "Vendor Viewer", userType: "vendor", permissions: ["products:read"] },
  ]);
});

describe("TeamTab", () => {
  it("lists members, invitations and roles", async () => {
    renderTab();
    expect(await screen.findByText("Ravi Menon")).toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Deactivated")).toBeInTheDocument();
    expect(await screen.findByText("new@novaliving.test")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    const roles = await screen.findByRole("list", { name: "Roles" });
    expect(within(roles).getByText(/Vendor Admin/)).toBeInTheDocument();
    expect(within(roles).getAllByText(/permissions/).length).toBeGreaterThan(0);
  });

  it("does not let me change my own role or status", async () => {
    renderTab();
    await screen.findByText("Ravi Menon");
    expect(screen.queryByLabelText("Role of Asha Admin")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate Asha Admin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Asha Admin" })).not.toBeInTheDocument();
  });

  it("invites by email with a role", async () => {
    const user = userEvent.setup();
    api.invite.mockResolvedValue(invitation({ email: "priya@novaliving.test", roleKey: "vendor_admin" }));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Send invitation" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Email address"), "priya@novaliving.test");
    await user.selectOptions(within(dialog).getByLabelText("Role"), "vendor_admin");
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(api.invite).toHaveBeenCalledWith({ email: "priya@novaliving.test", roleKey: "vendor_admin" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.listMembers).toHaveBeenCalledTimes(2);
  });

  it("explains a refused invitation", async () => {
    const user = userEvent.setup();
    api.invite.mockRejectedValue(new ApiError({ code: "EMAIL_NOT_VERIFIED", message: "no", status: 403 }));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Email address"), "priya@novaliving.test");
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(await within(dialog).findByText(/Verify your own email address/)).toBeInTheDocument();
  });

  it("changes a role", async () => {
    const user = userEvent.setup();
    api.updateMember.mockResolvedValue(member({ roleKey: "vendor_admin" }));
    renderTab();
    await user.selectOptions(await screen.findByLabelText("Role of Ravi Menon"), "vendor_admin");
    await waitFor(() => expect(api.updateMember).toHaveBeenCalledWith("m1", { roleKey: "vendor_admin" }));
  });

  it("deactivates and reactivates a member", async () => {
    const user = userEvent.setup();
    api.updateMember.mockResolvedValue(member());
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Deactivate Ravi Menon" }));
    await waitFor(() => expect(api.updateMember).toHaveBeenCalledWith("m1", { status: "disabled" }));
    await user.click(screen.getByRole("button", { name: "Reactivate Dev Rao" }));
    await waitFor(() => expect(api.updateMember).toHaveBeenCalledWith("m2", { status: "active" }));
  });

  it("shows the server's reason when a change is refused", async () => {
    const user = userEvent.setup();
    api.updateMember.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "A vendor must keep at least one active administrator", status: 409 }));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Deactivate Ravi Menon" }));
    expect(await screen.findByText("A vendor must keep at least one active administrator")).toBeInTheDocument();
  });

  it("removes a member after confirming", async () => {
    const user = userEvent.setup();
    api.removeMember.mockResolvedValue({ message: "Member removed" });
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Remove Ravi Menon" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.removeMember).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Remove member" }));
    await waitFor(() => expect(api.removeMember).toHaveBeenCalledWith("m1"));
  });

  it("resends and revokes a pending invitation", async () => {
    const user = userEvent.setup();
    api.resendInvitation.mockResolvedValue(invitation());
    api.revokeInvitation.mockResolvedValue(invitation({ status: "revoked" }));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Resend the invitation to new@novaliving.test" }));
    await waitFor(() => expect(api.resendInvitation).toHaveBeenCalledWith("i1"));
    await user.click(screen.getByRole("button", { name: "Revoke the invitation to new@novaliving.test" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Revoke invitation" }));
    await waitFor(() => expect(api.revokeInvitation).toHaveBeenCalledWith("i1"));
  });

  it("is read-only without users:write", async () => {
    signIn(["users:read"]);
    renderTab();
    await screen.findByText("Ravi Menon");
    expect(screen.queryByRole("button", { name: "Invite member" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Role of Ravi Menon")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Deactivate|Remove|Resend|Revoke/ })).not.toBeInTheDocument();
    expect(screen.getByText(/can see your team but not change it/)).toBeInTheDocument();
    // roles:read is missing: the built-in role descriptions are shown instead
    expect(api.roles).not.toHaveBeenCalled();
    expect(screen.getByText(/Full access, including settings/)).toBeInTheDocument();
  });

  it("shows a retry when the team cannot be loaded", async () => {
    const user = userEvent.setup();
    api.listMembers.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Boom", status: 500 }));
    renderTab();
    expect(await screen.findByText("Boom")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Retry" }).at(0) as HTMLElement);
    expect(await screen.findByText("Ravi Menon")).toBeInTheDocument();
  });
});
