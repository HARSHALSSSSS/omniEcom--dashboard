import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { ADMIN, settings, signIn, WAREHOUSE_B } from "@/test/settingsFixtures";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  gstStates: vi.fn(),
  validateGstin: vi.fn(),
  addGstin: vi.fn(),
  updateGstin: vi.fn(),
  setPrimaryGstin: vi.fn(),
  deleteGstin: vi.fn(),
  getAi: vi.fn(),
  setAiEnabled: vi.fn(),
  listMembers: vi.fn(),
  updateMember: vi.fn(),
  removeMember: vi.fn(),
  listInvitations: vi.fn(),
  invite: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  roles: vi.fn(),
  changePassword: vi.fn(),
  sessions: vi.fn(),
  revokeSession: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("@/api/settings.api", () => ({ settingsApi: api }));
const session = vi.hoisted(() => ({ refreshShell: vi.fn() }));
vi.mock("@/lib/session", () => session);

import SettingsPage from "./SettingsPage";

function renderPage(path = "/settings/business") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/settings/:module", element: <SettingsPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/dashboard", element: <p>Dashboard page</p> },
    ],
    { initialEntries: [path] },
  );
  const view = render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router };
}

const saveBtn = () => screen.getByRole("button", { name: "Save changes" });
const tab = (name: string | RegExp) => screen.getByRole("tab", { name });

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  session.refreshShell.mockReset();
  session.refreshShell.mockResolvedValue(undefined);
  api.get.mockResolvedValue(settings());
  api.listMembers.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  api.listInvitations.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  api.roles.mockResolvedValue([]);
  api.sessions.mockResolvedValue([]);
  api.gstStates.mockResolvedValue([]);
  signIn(ADMIN);
});

describe("SettingsPage loading and routing", () => {
  it("loads everything with one read and shows the business profile", async () => {
    renderPage();
    expect(await screen.findByLabelText("Legal entity name")).toHaveValue("Nova Living Brands Pvt Ltd");
    expect(screen.getByLabelText("Brand name")).toHaveValue("Nova Living");
    expect(screen.getByLabelText(/^CIN/)).toHaveValue("U74999MH2021PTC368942");
    expect(screen.getByLabelText("PAN")).toHaveValue("AABCN8412P");
    expect(screen.getByLabelText("Support email")).toHaveValue("care@novaliving.test");
    expect(screen.getByLabelText("City")).toHaveValue("Mumbai");
    expect(screen.getByLabelText("PIN code")).toHaveValue("400013");
    expect(screen.getByLabelText("Business type")).toHaveValue("Direct-to-consumer brand");
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
  });

  it("shows a skeleton while loading", async () => {
    api.get.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(await screen.findByLabelText("Loading settings")).toBeInTheDocument();
  });

  it("shows an error with retry", async () => {
    const user = userEvent.setup();
    api.get.mockRejectedValue(new ApiError({ code: "INTERNAL", message: "Boom", status: 500 }));
    renderPage();
    await screen.findByText("Could not load your settings");
    api.get.mockResolvedValue(settings());
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Brand name")).toBeInTheDocument();
  });

  it("opens the business tab for /settings and for an unknown module", async () => {
    const { router, unmount } = renderPage("/settings");
    await screen.findByLabelText("Brand name");
    expect(router.state.location.pathname).toBe("/settings/business");
    unmount();
    const second = renderPage("/settings/nonsense");
    await screen.findByLabelText("Brand name");
    expect(second.router.state.location.pathname).toBe("/settings/business");
  });

  it("selects the tab from the URL and changes the URL with the tab", async () => {
    const user = userEvent.setup();
    const { router } = renderPage("/settings/operations");
    expect(await screen.findByLabelText("Marketplace stock reserve (%)")).toHaveValue(10);
    expect(tab("Operations")).toHaveAttribute("aria-selected", "true");
    await user.click(tab("Notifications"));
    expect(router.state.location.pathname).toBe("/settings/notifications");
    expect(await screen.findByRole("switch", { name: "Channel API token renewals" })).toBeChecked();
  });

  it("hides the team tab without users:read and redirects there", async () => {
    signIn(["vendors:read", "vendors:write"]);
    const { router } = renderPage("/settings/team");
    await screen.findByLabelText("Brand name");
    expect(router.state.location.pathname).toBe("/settings/business");
    expect(screen.queryByRole("tab", { name: /Team/ })).not.toBeInTheDocument();
  });
});

describe("editing and saving", () => {
  it("tracks real dirty state and saves only the changed group with the version", async () => {
    const user = userEvent.setup();
    renderPage();
    const brand = await screen.findByLabelText("Brand name");
    expect(saveBtn()).toBeDisabled();
    await user.clear(brand);
    await user.type(brand, "Nova Home");
    expect(screen.getByText(/Unsaved changes in Business profile/)).toBeInTheDocument();
    expect(saveBtn()).toBeEnabled();
    api.save.mockResolvedValue(settings({ business: { ...settings().business, displayName: "Nova Home" }, version: 8 }));
    await user.click(saveBtn());
    await waitFor(() => expect(api.save).toHaveBeenCalledWith({ business: { displayName: "Nova Home" }, version: 7 }));
    await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
    expect(screen.getByLabelText("Brand name")).toHaveValue("Nova Home");
    expect(session.refreshShell).toHaveBeenCalled();
  });

  it("keeps edits across tabs and saves every changed group in one call", async () => {
    const user = userEvent.setup();
    renderPage();
    const brand = await screen.findByLabelText("Brand name");
    await user.clear(brand);
    await user.type(brand, "Nova Home");
    await user.click(tab(/^Regional/));
    await user.selectOptions(screen.getByLabelText("Number format"), "international");
    await user.click(tab(/^Operations/));
    const buffer = screen.getByLabelText("Marketplace stock reserve (%)");
    await user.clear(buffer);
    await user.type(buffer, "25");
    await user.click(screen.getByRole("switch", { name: "Round prices to 9" }));
    await user.selectOptions(screen.getByLabelText("Default warehouse"), WAREHOUSE_B);
    await user.click(tab(/^Business profile/));
    expect(screen.getByLabelText("Brand name")).toHaveValue("Nova Home");
    api.save.mockResolvedValue(settings({ version: 8 }));
    await user.click(saveBtn());
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith({
        business: { displayName: "Nova Home" },
        regional: { numberFormat: "international" },
        operations: { defaultInventoryBufferPercent: 25, roundPriceToNine: true, defaultWarehouseId: WAREHOUSE_B },
        version: 7,
      }),
    );
  });

  it("wires each alert to its own flag and the dispatch window", async () => {
    const user = userEvent.setup();
    renderPage("/settings/notifications");
    await user.click(await screen.findByRole("switch", { name: "Channel API token renewals" }));
    expect(screen.getByRole("switch", { name: "Marketplace sync failures" })).toBeChecked();
    const minutes = screen.getByLabelText("Alert window (minutes)");
    await user.clear(minutes);
    await user.type(minutes, "90");
    api.save.mockResolvedValue(settings({ version: 8 }));
    await user.click(saveBtn());
    await waitFor(() => expect(api.save).toHaveBeenCalledWith({ alerts: { tokenRenewals: false, dispatchSlaBreach: { thresholdMinutes: 90 } }, version: 7 }));
  });

  it("blocks the save and shows the problem when a value is invalid", async () => {
    const user = userEvent.setup();
    renderPage();
    const cin = await screen.findByLabelText(/^CIN/);
    await user.clear(cin);
    await user.type(cin, "NOT-A-CIN");
    await user.click(saveBtn());
    expect(await screen.findByText(/Enter a valid 21 character CIN/)).toBeInTheDocument();
    expect(screen.getByText(/Fix the highlighted fields before saving/)).toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
  });

  it("jumps to the tab of an invalid field", async () => {
    const user = userEvent.setup();
    const { router } = renderPage("/settings/operations");
    const buffer = await screen.findByLabelText("Marketplace stock reserve (%)");
    await user.clear(buffer);
    await user.type(buffer, "150");
    await user.click(tab(/^Business profile/));
    await user.clear(screen.getByLabelText("Support phone"));
    await user.type(screen.getByLabelText("Support phone"), "12");
    await user.click(saveBtn());
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/business"));
    expect(await screen.findByText("Phone number must be 7 to 20 characters.")).toBeInTheDocument();
  });

  it("puts a 400 field error next to its input", async () => {
    const user = userEvent.setup();
    renderPage();
    const pan = await screen.findByLabelText("PAN");
    await user.clear(pan);
    await user.type(pan, "ZZZZZ9999Z");
    api.save.mockRejectedValue(new ApiError({ code: "VALIDATION_FAILED", message: "Invalid", status: 400, details: { issues: [{ path: "business.pan", message: "The PAN does not match the registered GSTIN 27AABCN8412P1Z1" }] } }));
    await user.click(saveBtn());
    expect(await screen.findByText("The PAN does not match the registered GSTIN 27AABCN8412P1Z1")).toBeInTheDocument();
    expect(screen.getByLabelText("PAN")).toHaveAttribute("aria-invalid", "true");
    expect(saveBtn()).toBeEnabled();
  });

  it("offers to reload or keep my edits on a version conflict", async () => {
    const user = userEvent.setup();
    renderPage();
    const brand = await screen.findByLabelText("Brand name");
    await user.clear(brand);
    await user.type(brand, "Mine");
    api.save.mockRejectedValue(new ApiError({ code: "VERSION_CONFLICT", message: "Conflict", status: 409, details: { currentVersion: 9 } }));
    await user.click(saveBtn());
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("These settings were changed by someone else")).toBeInTheDocument();
    api.get.mockResolvedValue(settings({ version: 9, business: { ...settings().business, displayName: "Theirs" } }));
    await user.click(within(dialog).getByRole("button", { name: "Reload and keep my edits" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Brand name")).toHaveValue("Mine");
    api.save.mockResolvedValue(settings({ version: 10 }));
    await user.click(saveBtn());
    await waitFor(() => expect(api.save).toHaveBeenLastCalledWith({ business: { displayName: "Mine" }, version: 9 }));
  });

  it("reloads the latest version from the conflict dialog", async () => {
    const user = userEvent.setup();
    renderPage();
    const brand = await screen.findByLabelText("Brand name");
    await user.clear(brand);
    await user.type(brand, "Mine");
    api.save.mockRejectedValue(new ApiError({ code: "VERSION_CONFLICT", message: "Conflict", status: 409 }));
    await user.click(saveBtn());
    const dialog = await screen.findByRole("dialog");
    api.get.mockResolvedValue(settings({ version: 9, business: { ...settings().business, displayName: "Theirs" } }));
    await user.click(within(dialog).getByRole("button", { name: "Reload latest" }));
    await waitFor(() => expect(screen.getByLabelText("Brand name")).toHaveValue("Theirs"));
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
  });

  it("Reset refetches and drops the edits", async () => {
    const user = userEvent.setup();
    renderPage();
    const brand = await screen.findByLabelText("Brand name");
    await user.clear(brand);
    await user.type(brand, "Scratch");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText("Brand name")).toHaveValue("Nova Living"));
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
  });

  it("asks before leaving with unsaved edits", async () => {
    const user = userEvent.setup();
    const { router } = renderPage();
    const brand = await screen.findByLabelText("Brand name");
    await user.clear(brand);
    await user.type(brand, "Scratch");
    await act(async () => {
      void router.navigate("/dashboard");
    });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("You have unsaved changes")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(router.state.location.pathname).toBe("/settings/business");
    await act(async () => {
      void router.navigate("/dashboard");
    });
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
  });

  it("saves from the leave dialog and then leaves", async () => {
    const user = userEvent.setup();
    const { router } = renderPage();
    const brand = await screen.findByLabelText("Brand name");
    await user.clear(brand);
    await user.type(brand, "Nova Home");
    api.save.mockResolvedValue(settings({ version: 8 }));
    await act(async () => {
      void router.navigate("/dashboard");
    });
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
    expect(api.save).toHaveBeenCalledWith({ business: { displayName: "Nova Home" }, version: 7 });
  });
});

describe("regional and operations", () => {
  it("shows locked fields disabled with the reason", async () => {
    renderPage("/settings/regional");
    const currency = await screen.findByLabelText("Operating currency");
    expect(currency).toBeDisabled();
    expect(currency).toHaveValue("INR (₹)");
    expect(screen.getByLabelText("Time zone")).toHaveValue("Asia/Kolkata (UTC+05:30)");
    expect(screen.getAllByText(/Fixed after sign-up/).length).toBe(2);
    expect(screen.getByLabelText("Number format")).toHaveValue("indian");
  });

  it("saves the advisory AI switch through /ai/settings only", async () => {
    const user = userEvent.setup();
    renderPage("/settings/operations");
    await user.click(await screen.findByRole("switch", { name: "Advisory AI features" }));
    api.setAiEnabled.mockResolvedValue({ enabled: false, mode: "recommend", automatedActions: [], isDefault: false });
    await user.click(saveBtn());
    await waitFor(() => expect(api.setAiEnabled).toHaveBeenCalledWith(false));
    expect(api.save).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
  });

  it("locks the AI switch without ai:use or without the platform feature", async () => {
    signIn(["vendors:read", "vendors:write"]);
    const first = renderPage("/settings/operations");
    expect(await screen.findByRole("switch", { name: "Advisory AI features" })).toBeDisabled();
    expect(screen.getByText(/Only a business administrator can change the AI setting/)).toBeInTheDocument();
    first.unmount();
    signIn(ADMIN, {});
    renderPage("/settings/operations");
    expect(await screen.findByRole("switch", { name: "Advisory AI features" })).toBeDisabled();
    expect(screen.getByText(/not enabled for your business plan/)).toBeInTheDocument();
  });

  it("offers the automatic default and the warehouses of the business", async () => {
    renderPage("/settings/operations");
    const select = await screen.findByLabelText("Default warehouse");
    expect(within(select).getByRole("option", { name: "Automatic (Mumbai Hub)" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Bengaluru Hub, Bengaluru" })).toBeInTheDocument();
  });
});

describe("permissions", () => {
  it("is read-only without vendors:write: no Save, readonly inputs and an explanation", async () => {
    signIn(["vendors:read"]);
    renderPage();
    const brand = await screen.findByLabelText("Brand name");
    expect(brand).toHaveAttribute("readonly");
    expect(screen.getByText(/read-only access to settings/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("disables the switches and selects for a viewer", async () => {
    signIn(["vendors:read"]);
    renderPage("/settings/operations");
    expect(await screen.findByRole("switch", { name: "Acknowledge new orders automatically" })).toBeDisabled();
    expect(screen.getByLabelText("Default warehouse")).toBeDisabled();
  });
});
