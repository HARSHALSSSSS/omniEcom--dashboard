import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { FLIPKART, REVOKED, SHOPIFY, accounts, card, job } from "@/test/hubFixtures";

const api = vi.hoisted(() => ({
  accounts: vi.fn(),
  startSync: vi.fn(),
  syncStatus: vi.fn(),
  test: vi.fn(),
  disconnect: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  connector: vi.fn(),
  reconnect: vi.fn(),
}));
const refreshShell = vi.hoisted(() => vi.fn());
vi.mock("@/api/hub.api", () => ({ hubApi: api }));
vi.mock("@/lib/session", () => ({ refreshShell }));

import MarketplaceHubPage from "./MarketplaceHubPage";

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/marketplace-hub") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <MarketplaceHubPage />
                <Probe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const A = card();
const grant = (...permissions: string[]) => useWorkspaceStore.setState({ permissions });
const loc = () => screen.getByTestId("loc").textContent;
const toasts = () => useToastStore.getState().toasts;
const tile = (name: string) => screen.getByRole("article", { name: `${name} connection` });

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("marketplace_accounts:read", "marketplace_accounts:write", "sync:read", "sync:write");
  refreshShell.mockResolvedValue(undefined);
  api.accounts.mockResolvedValue(accounts([A, FLIPKART, SHOPIFY]));
});

describe("cards and numbers from the API", () => {
  it("computes the ribbon and the tab counts from the accounts", async () => {
    renderPage();
    expect(await screen.findByText("Acme Amazon")).toBeInTheDocument();
    const ribbon = screen.getByText("Connected Channels").parentElement as HTMLElement;
    expect(ribbon).toHaveTextContent("3");
    expect(ribbon).toHaveTextContent("2 healthy");
    expect(screen.getByText("Multi-Channel Listings").parentElement).toHaveTextContent("Across 3 platforms");
    expect(screen.getByText("Multi-Channel Listings").parentElement).toHaveTextContent("270"); // 120 + 30 + 120
    expect(screen.getByText("Open Orders").parentElement).toHaveTextContent("16");
    expect(screen.getByText("Attention Items").parentElement).toHaveTextContent("0 error, 1 warning");
    expect(screen.getByRole("tab", { name: "All Connections (3)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Marketplaces (2)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Storefronts (1)" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Logistics/ })).not.toBeInTheDocument();
  });

  it("shows friction points, the token warning and hides what the API does not have", async () => {
    renderPage();
    await screen.findByText("Acme Flipkart");
    const fk = within(tile("Acme Flipkart"));
    expect(fk.getByText("2 sync runs failed in the last 24 hours")).toBeInTheDocument();
    expect(fk.getByText("Access token expires in 5 days")).toBeInTheDocument();
    expect(fk.getByText("Attention")).toBeInTheDocument();
    expect(screen.queryByText(/Meesho|SLA within limits|rate limit/i)).not.toBeInTheDocument();
  });

  it("a disconnected account says so and offers reconnect instead of sync", async () => {
    api.accounts.mockResolvedValue(accounts([REVOKED]));
    renderPage();
    const t = within(await screen.findByRole("article", { name: "Old Amazon connection" }));
    expect(t.getByText("Disconnected")).toBeInTheDocument();
    expect(t.getByRole("button", { name: /Sync Now/ })).toBeDisabled();
    expect(t.getByRole("button", { name: "Test" })).toBeDisabled();
  });
});

describe("filters and URL", () => {
  it("a tab filters the cards and is kept in the URL", async () => {
    renderPage();
    await screen.findByText("Acme Amazon");
    await userEvent.click(screen.getByRole("tab", { name: /Storefronts/ }));
    expect(loc()).toBe("/marketplace-hub?tab=storefront");
    expect(screen.getByText("Acme Store")).toBeInTheDocument();
    expect(screen.queryByText("Acme Amazon")).not.toBeInTheDocument();
  });

  it("restores filters from the URL and tab counts respect the other filters", async () => {
    renderPage("/marketplace-hub?status=warning");
    await screen.findByText("Acme Flipkart");
    expect(screen.queryByText("Acme Amazon")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All Connections (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Storefronts (0)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by status")).toHaveValue("warning");
  });

  it("searches and filters by marketplace, then clears", async () => {
    renderPage();
    await screen.findByText("Acme Amazon");
    await userEvent.selectOptions(screen.getByLabelText("Filter by marketplace"), "flipkart");
    expect(loc()).toContain("marketplace=flipkart");
    expect(screen.queryByText("Acme Amazon")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Search connections"), "zzz");
    expect(await screen.findByText("No connections match these filters.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(loc()).toBe("/marketplace-hub");
    expect(await screen.findByText("Acme Amazon")).toBeInTheDocument();
  });
});

describe("states", () => {
  it("empty: a call to action to the directory", async () => {
    api.accounts.mockResolvedValue(accounts([]));
    renderPage();
    expect(await screen.findByText("No marketplace connected yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Connect a marketplace" }));
    expect(loc()).toBe("/marketplace-hub/connectors");
  });

  it("error with retry", async () => {
    api.accounts.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Acme Amazon")).toBeInTheDocument();
  });

  it("a viewer reads but cannot act, and is told why", async () => {
    grant("marketplace_accounts:read");
    renderPage();
    await screen.findByText("Acme Amazon");
    expect(screen.getByRole("status")).toHaveTextContent("read-only");
    const t = within(tile("Acme Amazon"));
    expect(t.getByRole("button", { name: "Test" })).toBeDisabled();
    expect(t.getByRole("button", { name: /Sync Now/ })).toBeDisabled();
    expect(t.getByRole("button", { name: /Sync Now/ }).parentElement).toHaveAttribute("title", expect.stringContaining("marketplace_accounts:write"));
  });
});

describe("sync now", () => {
  it("queues, shows progress while polling, then the result (never 'complete' from the 202)", async () => {
    api.startSync.mockResolvedValue({ accountId: A.id, jobs: [{ scope: "orders", job: job({ id: "j1" }), created: true }], skipped: [{ scope: "catalog", reason: "Amazon India does not support importing the catalogue" }] });
    api.syncStatus
      .mockResolvedValueOnce({ accountId: A.id, state: "syncing", progress: 40, active: [job({ id: "j1", status: "running", progress: { total: 10, done: 4, failed: 0 } })], latest: [], lastSyncedAt: null, nextSyncAt: null })
      .mockResolvedValue({ accountId: A.id, state: "idle", progress: null, active: [], latest: [job({ id: "j1", status: "succeeded", progress: { total: 10, done: 10, failed: 0 } })], lastSyncedAt: null, nextSyncAt: null });
    renderPage();
    await screen.findByText("Acme Amazon");
    await userEvent.click(within(tile("Acme Amazon")).getByRole("button", { name: /Sync Now/ }));
    expect(api.startSync).toHaveBeenCalledWith(A.id, undefined);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Running")).toBeInTheDocument();
    expect(within(dialog).getByText("Syncing...")).toBeInTheDocument();
    expect(within(dialog).getByText(/Product catalogue skipped/)).toBeInTheDocument();
    expect(await within(dialog).findByText("Finished.", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(within(dialog).getByText("Done")).toBeInTheDocument();
    expect(refreshShell).toHaveBeenCalled();
  }, 15000);

  it("tells that a queued job was reused", async () => {
    api.startSync.mockResolvedValue({ accountId: A.id, jobs: [{ scope: "orders", job: job({ id: "j7", status: "running" }), created: false }], skipped: [] });
    api.syncStatus.mockResolvedValue({ accountId: A.id, state: "syncing", progress: null, active: [job({ id: "j7", status: "running" })], latest: [], lastSyncedAt: null, nextSyncAt: null });
    renderPage();
    await screen.findByText("Acme Amazon");
    await userEvent.click(within(tile("Acme Amazon")).getByRole("button", { name: /Sync Now/ }));
    expect(await screen.findByText("Already queued, using the existing run.")).toBeInTheDocument();
  });

  it("shows the server's reason when the sync cannot start", async () => {
    api.startSync.mockRejectedValue(new ApiError({ code: "ACCOUNT_NOT_CONNECTED", message: "Marketplace account is not connected", status: 409 }));
    renderPage();
    await screen.findByText("Acme Amazon");
    await userEvent.click(within(tile("Acme Amazon")).getByRole("button", { name: /Sync Now/ }));
    expect(await screen.findByText("Marketplace account is not connected")).toBeInTheDocument();
  });
});

describe("test connection", () => {
  it("lists every step with its result", async () => {
    api.test.mockResolvedValue({
      ok: false,
      marketplace: "amazon_in",
      mode: "live",
      checkedAt: "2026-10-21T08:00:00.000Z",
      steps: [
        { name: "credentials", ok: true, skipped: false, durationMs: 120, message: "Connected" },
        { name: "catalog", ok: false, skipped: false, durationMs: 80, message: "Catalogue read refused" },
        { name: "orders", ok: true, skipped: true, durationMs: 0, message: null },
      ],
    });
    renderPage();
    await screen.findByText("Acme Amazon");
    await userEvent.click(within(tile("Acme Amazon")).getByRole("button", { name: "Test" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("The connection test failed.")).toBeInTheDocument();
    expect(within(dialog).getByText("Connected")).toBeInTheDocument();
    expect(within(dialog).getByText("Catalogue read refused")).toBeInTheDocument();
    expect(within(dialog).getByText("Not supported by this marketplace")).toBeInTheDocument();
    expect(api.test).toHaveBeenCalledWith(A.id);
  });
});

describe("pause, disconnect, delete", () => {
  it("pauses with the account version", async () => {
    api.update.mockResolvedValue({ id: A.id });
    renderPage();
    await screen.findByText("Acme Amazon");
    await userEvent.click(within(tile("Acme Amazon")).getByRole("button", { name: "More actions for Acme Amazon" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Pause syncing" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(A.id, { status: "paused", version: 3 }));
    await waitFor(() => expect(toasts().some((t) => t.title === "Acme Amazon paused")).toBe(true));
  });

  it("disconnect needs a confirmation and refreshes the hub and the shell", async () => {
    api.disconnect.mockResolvedValue({ id: A.id });
    renderPage();
    await screen.findByText("Acme Amazon");
    await userEvent.click(within(tile("Acme Amazon")).getByRole("button", { name: "More actions for Acme Amazon" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Disconnect" }));
    expect(api.disconnect).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Disconnect Acme Amazon?");
    await userEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(api.disconnect).toHaveBeenCalledWith(A.id));
    await waitFor(() => expect(refreshShell).toHaveBeenCalled());
    await waitFor(() => expect(api.accounts.mock.calls.length).toBeGreaterThan(1));
  });

  it("a connected account cannot be deleted from the menu", async () => {
    renderPage();
    await screen.findByText("Acme Amazon");
    await userEvent.click(within(tile("Acme Amazon")).getByRole("button", { name: "More actions for Acme Amazon" }));
    await screen.findByRole("menuitem", { name: "Disconnect" });
    expect(screen.queryByRole("menuitem", { name: "Delete account" })).not.toBeInTheDocument();
  });

  it("a disconnected account can be deleted after a confirmation", async () => {
    api.accounts.mockResolvedValue(accounts([REVOKED]));
    api.remove.mockResolvedValue({ message: "deleted" });
    renderPage();
    await screen.findByText("Old Amazon");
    await userEvent.click(screen.getByRole("button", { name: "More actions for Old Amazon" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete account" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(REVOKED.id));
  });

  it("reconnect asks for the connector's credential fields", async () => {
    api.accounts.mockResolvedValue(accounts([REVOKED]));
    api.connector.mockResolvedValue({
      code: "amazon_in",
      displayName: "Amazon India",
      authFlow: { mode: "both", fields: [{ key: "sellerId", label: "Seller ID", type: "text", required: true, secret: false, pattern: null, help: null }], redirectFields: [], partnerGated: false, refreshable: true },
    });
    api.reconnect.mockResolvedValue({ id: REVOKED.id });
    renderPage();
    await screen.findByText("Old Amazon");
    await userEvent.click(screen.getByRole("button", { name: "More actions for Old Amazon" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Reconnect" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(await within(dialog).findByLabelText(/Seller ID/), "A1SELLER");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(api.reconnect).toHaveBeenCalledWith(REVOKED.id, { sellerId: "A1SELLER" }));
  });
});
