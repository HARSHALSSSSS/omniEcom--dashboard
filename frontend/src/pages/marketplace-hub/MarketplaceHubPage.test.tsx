import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { FLIPKART, REVOKED, SHOPIFY, accounts, card, detail, job } from "@/test/hubFixtures";
import type { DirectoryItem } from "@/types/directory";

const api = vi.hoisted(() => ({
  startSync: vi.fn(),
  syncStatus: vi.fn(),
  test: vi.fn(),
  disconnect: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  connector: vi.fn(),
  reconnect: vi.fn(),
}));
const http = vi.hoisted(() => ({ accounts: vi.fn(), directory: vi.fn(), account: vi.fn() }));
const refreshShell = vi.hoisted(() => vi.fn());
vi.mock("@/api/hub.api", () => ({ hubApi: api }));
vi.mock("@/lib/session", () => ({ refreshShell }));
// the Hub screens read through connectors.api -> client.get; the write actions go through hubApi (mocked above)
vi.mock("@/api/client", () => ({
  unwrap: (res: { data: { data: unknown } }) => res.data.data,
  client: {
    get: (url: string) => {
      if (url.endsWith("/marketplace-hub/accounts")) return http.accounts().then((data: unknown) => ({ data: { data } }));
      if (url.endsWith("/marketplace-hub/directory")) return http.directory().then((data: unknown) => ({ data: { data } }));
      return http.account(url.split("/").pop()).then((data: unknown) => ({ data: { data } }));
    },
  },
}));

import MarketplaceHubPage from "./MarketplaceHubPage";

const dirItem = (over: Partial<DirectoryItem>): DirectoryItem => ({
  id: "meesho",
  name: "Meesho",
  category: "marketplace",
  description: "Sell on Meesho.",
  logoKey: "meesho",
  supportedRegions: ["IN"],
  implementation: "beta",
  status: "available",
  statusReason: null,
  accountCount: 0,
  partnerGated: false,
  authFlow: { type: "credentials", mode: "credentials", fields: [], redirectFields: [], partnerGated: false, refreshable: false },
  capabilities: [],
  capabilityTags: ["orders"],
  readiness: { sandbox: true, live: false, notes: "" },
  limits: { requestsPerSecond: 1, burst: 1, maxBatchSize: 1 },
  webhooks: false,
  ...over,
});
const DIRECTORY = {
  items: [dirItem({ id: "meesho", name: "Meesho" }), dirItem({ id: "snapdeal", name: "Snapdeal", status: "unavailable", statusReason: "Not available yet" })],
  summary: { total: 2, connected: 0, needsAttention: 0, available: 1, unavailable: 1 },
};

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

const seen = async (name: string) => {
  expect((await screen.findAllByText(name)).length).toBeGreaterThan(0);
};

const A = card();
const grant = (...permissions: string[]) => useWorkspaceStore.setState({ permissions });
const loc = () => screen.getByTestId("loc").textContent;
const toasts = () => useToastStore.getState().toasts;
const moreActions = (name: string) => screen.getByRole("button", { name: `More actions for ${name}` });

async function openMenu(name: string, item: string | RegExp) {
  await userEvent.click(moreActions(name));
  await userEvent.click(await screen.findByRole("menuitem", { name: item }));
}

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("marketplace_accounts:read", "marketplace_accounts:write", "sync:read", "sync:write");
  refreshShell.mockResolvedValue(undefined);
  http.accounts.mockResolvedValue(accounts([A, FLIPKART, SHOPIFY]));
  http.directory.mockResolvedValue(DIRECTORY);
  http.account.mockImplementation((id: string) => Promise.resolve(detail({ ...[A, FLIPKART, SHOPIFY, REVOKED].find((c) => c.id === id)! })));
});

describe("rows and numbers from the API", () => {
  it("shows the real counts of each account and the directory connectors that are not connected", async () => {
    renderPage();
    await seen("Acme Flipkart");
    expect(screen.getAllByText("120 listings")).toHaveLength(2); // Amazon and the store
    expect(screen.getAllByText("7 open")).toHaveLength(2);
    expect(screen.getAllByText("118 synced")).toHaveLength(2);
    expect(screen.getByText("30 listings")).toBeInTheDocument();
    expect(screen.getAllByText("Meesho").length).toBeGreaterThan(0);
    expect(screen.getByText("5 channels")).toBeInTheDocument();
    expect(screen.getByText("2 healthy")).toBeInTheDocument();
    expect(screen.getByText("1 need attention")).toBeInTheDocument();
    // nothing invented: no placeholder times or marketplaces
    expect(screen.queryByText(/18 min ago|4 min ago|Jan 18, 2026/)).not.toBeInTheDocument();
  });

  it("an unavailable connector cannot be connected and says why", async () => {
    renderPage();
    await seen("Snapdeal");
    expect(screen.getByText("Not available yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Connect" }).some((b) => b.hasAttribute("disabled"))).toBe(true);
  });

  it("the drawer shows friction points, the token warning and the real request allowance", async () => {
    http.accounts.mockResolvedValue(accounts([A, { ...FLIPKART, health: { ...FLIPKART.health, rateLimitRemainingPct: 64 } }]));
    http.account.mockImplementation((id: string) =>
      Promise.resolve(detail({ ...(id === FLIPKART.id ? { ...FLIPKART, health: { ...FLIPKART.health, rateLimitRemainingPct: 64 } } : A) })),
    );
    renderPage();
    await seen("Acme Flipkart");
    await userEvent.click(screen.getAllByRole("button", { name: /Review/ })[0]);
    const drawer = await screen.findByRole("complementary", { name: "Acme Flipkart details" });
    expect(within(drawer).getByText("2 sync runs failed in the last 24 hours")).toBeInTheDocument();
    expect(within(drawer).getByText("Access token expires in 5 days")).toBeInTheDocument();
    expect(within(drawer).getByText("64%")).toBeInTheDocument();
  });

  it("hides the request allowance when the server has none", async () => {
    renderPage();
    await seen("Acme Amazon");
    await userEvent.click(screen.getAllByRole("button", { name: /Manage/ })[0]);
    const drawer = await screen.findByRole("complementary", { name: "Acme Amazon details" });
    expect(within(drawer).queryByText("Request allowance free")).not.toBeInTheDocument();
  });

  it("a disconnected account says so and cannot sync or be tested", async () => {
    http.accounts.mockResolvedValue(accounts([REVOKED]));
    renderPage();
    await seen("Old Amazon");
    expect(screen.getAllByText("Disconnected").length).toBeGreaterThan(0);
    await userEvent.click(moreActions("Old Amazon"));
    expect(await screen.findByRole("menuitem", { name: "Sync now" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Test connection" })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("counts after a disconnect", () => {
  it("counts a disconnected account as not connected, in the header and in the open panel", async () => {
    http.accounts.mockResolvedValue(accounts([A, REVOKED]));
    renderPage();
    await seen("Old Amazon");
    // A is connected; the disconnected one and the two directory connectors are not
    expect(screen.getByText("3 not connected")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: /Manage/ })[0]);
    await screen.findByRole("complementary", { name: /details$/ });
    expect(await screen.findByText(/^1 connected · 3 available/)).toBeInTheDocument();
  });
});

describe("filters and URL", () => {
  it("a tab filters the rows and is kept in the URL", async () => {
    renderPage();
    await seen("Acme Amazon");
    await userEvent.click(screen.getByRole("button", { name: "Not connected" }));
    expect(loc()).toBe("/marketplace-hub?tab=not_connected");
    expect(screen.getAllByText("Meesho").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "More actions for Acme Amazon" })).not.toBeInTheDocument();
  });

  it("restores the tab, search and sort from the URL", async () => {
    renderPage("/marketplace-hub?tab=attention");
    await seen("Acme Flipkart");
    expect(screen.queryAllByText("Acme Amazon")).toHaveLength(0);
    expect(screen.getByText("1 connection need attention", { exact: false })).toBeInTheDocument();
  });

  it("searches by name and keeps the search in the URL", async () => {
    renderPage();
    await seen("Acme Amazon");
    await userEvent.type(screen.getByLabelText("Search channels"), "flip");
    expect(loc()).toContain("q=flip");
    expect(screen.queryByRole("button", { name: "More actions for Acme Amazon" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More actions for Acme Flipkart" })).toBeInTheDocument();
  });

  it("sorts by listing count and keeps it in the URL", async () => {
    renderPage();
    await seen("Acme Amazon");
    await userEvent.click(screen.getByRole("button", { name: /Sort:/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Listing count" }));
    expect(loc()).toContain("sort=products");
  });
});

describe("states", () => {
  it("empty: a call to action to the directory", async () => {
    http.accounts.mockResolvedValue(accounts([]));
    renderPage();
    expect(await screen.findByText("Connect where you sell")).toBeInTheDocument();
    expect(screen.getByText("Meesho · Snapdeal")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Browse connectors" }));
    expect(loc()).toBe("/marketplace-hub/connectors");
  });

  it("error with retry", async () => {
    http.accounts.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await seen("Acme Amazon");
  });

  it("a viewer reads but cannot act, and is told why", async () => {
    grant("marketplace_accounts:read");
    renderPage();
    await seen("Acme Amazon");
    expect(screen.getByRole("status")).toHaveTextContent("read-only");
    await userEvent.click(moreActions("Acme Amazon"));
    expect(await screen.findByRole("menuitem", { name: "Sync now" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Disconnect" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByText(/marketplace_accounts:write/).length).toBeGreaterThan(1);
  });
});

describe("sync now", () => {
  it("queues, shows progress while polling, then the result (never 'complete' from the 202)", async () => {
    api.startSync.mockResolvedValue({ accountId: A.id, jobs: [{ scope: "orders", job: job({ id: "j1" }), created: true }], skipped: [{ scope: "catalog", reason: "Amazon India does not support importing the catalogue" }] });
    api.syncStatus
      .mockResolvedValueOnce({ accountId: A.id, state: "syncing", progress: 40, active: [job({ id: "j1", status: "running", progress: { total: 10, done: 4, failed: 0 } })], latest: [], lastSyncedAt: null, nextSyncAt: null })
      .mockResolvedValue({ accountId: A.id, state: "idle", progress: null, active: [], latest: [job({ id: "j1", status: "succeeded", progress: { total: 10, done: 10, failed: 0 } })], lastSyncedAt: null, nextSyncAt: null });
    renderPage();
    await seen("Acme Amazon");
    await openMenu("Acme Amazon", "Sync now");
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
    await seen("Acme Amazon");
    await openMenu("Acme Amazon", "Sync now");
    expect(await screen.findByText("Already queued, using the existing run.")).toBeInTheDocument();
  });

  it("shows the server's reason when the sync cannot start", async () => {
    api.startSync.mockRejectedValue(new ApiError({ code: "ACCOUNT_NOT_CONNECTED", message: "Marketplace account is not connected", status: 409 }));
    renderPage();
    await seen("Acme Amazon");
    await openMenu("Acme Amazon", "Sync now");
    expect(await screen.findByText("Marketplace account is not connected")).toBeInTheDocument();
  });

  it("a syncing account shows its real progress", async () => {
    http.accounts.mockResolvedValue(accounts([card({ syncState: "syncing", syncProgress: 40 })]));
    renderPage();
    await seen("Acme Amazon");
    expect(screen.getAllByText(/Syncing/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Syncing 40%/)).toBeInTheDocument();
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
    await seen("Acme Amazon");
    await openMenu("Acme Amazon", "Test connection");
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("The connection test failed.")).toBeInTheDocument();
    expect(within(dialog).getByText("Connected")).toBeInTheDocument();
    expect(within(dialog).getByText("Catalogue read refused")).toBeInTheDocument();
    expect(within(dialog).getByText("Not supported by this marketplace")).toBeInTheDocument();
    expect(api.test).toHaveBeenCalledWith(A.id);
  });
});

describe("pause, disconnect, delete, reconnect", () => {
  it("pauses with the account version", async () => {
    api.update.mockResolvedValue({ id: A.id });
    renderPage();
    await seen("Acme Amazon");
    await openMenu("Acme Amazon", "Pause syncing");
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(A.id, { status: "paused", version: 3 }));
    await waitFor(() => expect(toasts().some((t) => t.title === "Acme Amazon paused")).toBe(true));
  });

  it("disconnect needs a confirmation and refreshes the hub and the shell", async () => {
    api.disconnect.mockResolvedValue({ id: A.id });
    renderPage();
    await seen("Acme Amazon");
    await openMenu("Acme Amazon", "Disconnect");
    expect(api.disconnect).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Disconnect Acme Amazon?");
    await userEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(api.disconnect).toHaveBeenCalledWith(A.id));
    await waitFor(() => expect(refreshShell).toHaveBeenCalled());
    await waitFor(() => expect(http.accounts.mock.calls.length).toBeGreaterThan(1));
  });

  it("a connected account cannot be deleted from the menu", async () => {
    renderPage();
    await seen("Acme Amazon");
    await userEvent.click(moreActions("Acme Amazon"));
    await screen.findByRole("menuitem", { name: "Disconnect" });
    expect(screen.queryByRole("menuitem", { name: "Delete account" })).not.toBeInTheDocument();
  });

  it("a disconnected account can be deleted after a confirmation", async () => {
    http.accounts.mockResolvedValue(accounts([REVOKED]));
    api.remove.mockResolvedValue({ message: "deleted" });
    renderPage();
    await seen("Old Amazon");
    await openMenu("Old Amazon", "Delete account");
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(REVOKED.id));
  });

  it("reconnect asks for the connector's credential fields", async () => {
    http.accounts.mockResolvedValue(accounts([REVOKED]));
    api.connector.mockResolvedValue({
      code: "amazon_in",
      displayName: "Amazon India",
      authFlow: { mode: "both", fields: [{ key: "sellerId", label: "Seller ID", type: "text", required: true, secret: false, pattern: null, help: null }], redirectFields: [], partnerGated: false, refreshable: true },
    });
    api.reconnect.mockResolvedValue({ id: REVOKED.id });
    renderPage();
    await seen("Old Amazon");
    await openMenu("Old Amazon", "Reconnect");
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(await within(dialog).findByLabelText(/Seller ID/), "A1SELLER");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(api.reconnect).toHaveBeenCalledWith(REVOKED.id, { sellerId: "A1SELLER" }));
  });

  it("the drawer offers the same actions", async () => {
    renderPage();
    await seen("Acme Amazon");
    await userEvent.click(screen.getAllByRole("button", { name: /Manage/ })[0]);
    const drawer = await screen.findByRole("complementary", { name: "Acme Amazon details" });
    expect(within(drawer).getByRole("button", { name: "Sync now" })).toBeEnabled();
    expect(within(drawer).getByRole("button", { name: "Test connection" })).toBeEnabled();
    expect(within(drawer).getByRole("button", { name: "Pause syncing" })).toBeEnabled();
    expect(within(drawer).getByRole("button", { name: "Disconnect" })).toBeEnabled();
  });
});
