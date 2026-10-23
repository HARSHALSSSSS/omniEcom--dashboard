import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import { FLIPKART, REVOKED, accounts, card, detail, job } from "@/test/hubFixtures";

const api = vi.hoisted(() => ({ account: vi.fn(), accounts: vi.fn(), connector: vi.fn(), jobLogs: vi.fn(), retryJob: vi.fn(), cancelJob: vi.fn() }));
vi.mock("@/api/hub.api", () => ({ hubApi: api }));
const dirApi = vi.hoisted(() => ({ readiness: vi.fn() }));
vi.mock("@/api/directory.api", () => ({ directoryApi: dirApi }));
vi.mock("@/hooks/useProducts", () => ({ useCatalogStats: () => ({ data: { products: 12, variants: 34, activeProducts: 10, activeVariants: 30 } }) }));
vi.mock("@/lib/session", () => ({ refreshShell: vi.fn().mockResolvedValue(undefined) }));

import ConnectorDetailPage from "./ConnectorDetailPage";

const Where = () => {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
};

function renderAt(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/marketplace-hub/connectors/${id}`]}>
        <Routes>
          <Route path="/marketplace-hub/connectors/:id" element={<ConnectorDetailPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const CONNECTOR = {
  code: "flipkart",
  displayName: "Flipkart",
  implementation: "ga",
  authType: "api_key",
  redirectFlow: false,
  refreshableTokens: false,
  enabledCapabilities: ["orders.fetch", "inventory.push", "listings.update"],
  capabilities: { orders: { fetch: true, webhook: true }, inventory: { push: true, pull: false }, limits: { requestsPerSecond: 2, burst: 4, maxBatchSize: 20 } },
  category: "marketplace",
  description: "India's marketplace.",
  logoKey: "flipkart",
  supportedRegions: ["IN"],
  authFlow: { type: "api_key", mode: "credentials", fields: [{ key: "appId", label: "App ID", type: "text", required: true, secret: false, pattern: null, help: null }], redirectFields: [], partnerGated: false, refreshable: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ permissions: ["marketplace_accounts:read", "marketplace_accounts:write", "sync:read", "sync:write", "connectors:read"] });
  api.accounts.mockResolvedValue(accounts([card(), FLIPKART]));
  api.connector.mockResolvedValue(CONNECTOR);
  api.account.mockResolvedValue(detail());
  dirApi.readiness.mockResolvedValue({ sandbox: true, live: false, notes: "Sandbox verified only." });
  window.localStorage.clear();
});

describe("connector page (a marketplace code)", () => {
  const FK_ID = FLIPKART.id;

  it("not connected: real capabilities, access, limits and fee, with nothing invented", async () => {
    api.accounts.mockResolvedValue(accounts([card()]));
    renderAt("flipkart");
    expect(await screen.findByRole("heading", { name: "Flipkart", level: 2 })).toBeInTheDocument();
    expect(api.connector).toHaveBeenCalledWith("flipkart", expect.anything());
    expect(screen.getByText("India's marketplace.")).toBeInTheDocument();
    expect(screen.getByText("Paste API credentials")).toBeInTheDocument();
    expect(screen.getByText("App ID")).toBeInTheDocument();
    // coverage comes from the enabled capabilities: orders, inventory and listings yes, shipping and reviews no
    const coverage = screen.getByText("Capability coverage").parentElement as HTMLElement;
    const row = (name: string) => within(coverage).getByText(name).parentElement as HTMLElement;
    expect(row("Orders")).toHaveTextContent("✓ Supported");
    expect(row("Inventory sync")).toHaveTextContent("✓ Supported");
    expect(row("Shipping")).toHaveTextContent("— Not available");
    expect(row("Reviews")).toHaveTextContent("— Not available");
    expect(screen.getAllByText("2 requests/s, burst 4").length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Sandbox only")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Included in your workspace").length).toBeGreaterThan(0);
    expect(screen.getByText("Reconciles with 12 master products in your workspace.")).toBeInTheDocument();
    // the "today" column lists the business's real other channels, not invented ones
    expect(screen.getByText("Acme Amazon")).toBeInTheDocument();
    expect(screen.queryByText(/₹|Demo pricing|Meesho|Base SaaS|Not provided|Urban Carry/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your accounts" })).not.toBeInTheDocument();
    expect(screen.getByText("1 of 5 steps complete")).toBeInTheDocument();
  });

  it("Connect opens the confirmation with the real capabilities and continues to the connect flow", async () => {
    api.accounts.mockResolvedValue(accounts([]));
    renderAt("flipkart");
    await screen.findByRole("heading", { name: "Flipkart", level: 2 });
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Connect Flipkart?")).toBeInTheDocument();
    expect(within(dialog).getByText("Inventory")).toBeInTheDocument();
    expect(within(dialog).queryByText("Returns")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/₹|Demo/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue to authorization" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/marketplace-hub/connect/flipkart");
  });

  it("connected account: live health, stream states from its recent jobs, accounts with their actions", async () => {
    api.accounts.mockResolvedValue(accounts([card(), FLIPKART]));
    api.account.mockResolvedValue(
      detail({
        ...FLIPKART,
        recentJobs: [
          job({ id: "j1", type: "orders", status: "failed", error: { code: "UPSTREAM", message: "boom" } }),
          job({ id: "j2", type: "inventory", status: "succeeded", finishedAt: new Date().toISOString() }),
        ],
      }),
    );
    renderAt("flipkart");
    await screen.findByRole("heading", { name: "Flipkart", level: 2 });
    expect(screen.getByText("! Needs attention")).toBeInTheDocument();
    expect(screen.getAllByText("2 sync runs failed in the last 24 hours").length).toBeGreaterThan(0);
    expect(screen.getByText("Access token expires in 5 days")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Failed")).toBeInTheDocument());
    expect(screen.getByText("Active")).toBeInTheDocument(); // inventory
    const mine = screen.getByRole("region", { name: "Your accounts" });
    expect(within(mine).getByRole("link", { name: "Acme Flipkart" })).toHaveAttribute("href", `/marketplace-hub/connectors/${FK_ID}`);
    expect(within(mine).queryByText("Acme Amazon")).not.toBeInTheDocument();
    expect(within(mine).getByRole("button", { name: /Sync Now/ })).toBeEnabled();
    expect(within(mine).getByRole("button", { name: "Test" })).toBeEnabled();
    await userEvent.click(screen.getAllByRole("button", { name: "Manage" })[0]);
    expect(screen.getByTestId("where")).toHaveTextContent("/marketplace-hub?q=Acme%20Flipkart");
  });

  it("a disconnected account can be reconnected from here with the connector's credential fields", async () => {
    const old = { ...REVOKED, marketplace: "flipkart", name: "Old Flipkart" };
    api.accounts.mockResolvedValue(accounts([old]));
    api.account.mockResolvedValue(detail(old));
    api.connector.mockResolvedValue({ ...CONNECTOR, authFlow: { ...CONNECTOR.authFlow, mode: "both" } });
    renderAt("flipkart");
    await screen.findByRole("heading", { name: "Flipkart", level: 2 });
    await userEvent.click(screen.getAllByRole("button", { name: "Reconnect" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByLabelText(/App ID/)).toBeInTheDocument();
  });

  it("a connector that needs partner approval says every capability depends on it", async () => {
    api.accounts.mockResolvedValue(accounts([]));
    api.connector.mockResolvedValue({ ...CONNECTOR, authFlow: { ...CONNECTOR.authFlow, partnerGated: true } });
    renderAt("flipkart");
    await screen.findByRole("heading", { name: "Flipkart", level: 2 });
    const coverage = screen.getByText("Capability coverage").parentElement as HTMLElement;
    expect(within(coverage).getByText("Orders").parentElement).toHaveTextContent("◑ Depends");
    expect(screen.getByText(/only gives API access to approved partners/)).toBeInTheDocument();
  });

  it("Save connector is kept on this device", async () => {
    api.accounts.mockResolvedValue(accounts([]));
    renderAt("flipkart");
    await screen.findByRole("heading", { name: "Flipkart", level: 2 });
    await userEvent.click(screen.getByRole("button", { name: "Save connector" }));
    expect(JSON.parse(window.localStorage.getItem("connector-bookmarks") ?? "[]")).toEqual(["flipkart"]);
    expect(screen.getAllByRole("button", { name: "Saved" }).length).toBeGreaterThan(0);
  });

  it("a connector that is not available yet cannot be connected", async () => {
    api.accounts.mockResolvedValue(accounts([]));
    api.connector.mockResolvedValue({ ...CONNECTOR, implementation: "planned" });
    renderAt("flipkart");
    await screen.findByText("Coming soon");
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("a viewer can read but not start a connection, and is told why", async () => {
    useWorkspaceStore.setState({ permissions: ["marketplace_accounts:read", "connectors:read"] });
    api.accounts.mockResolvedValue(accounts([]));
    renderAt("flipkart");
    await screen.findByText("Paste API credentials");
    expect(screen.getByRole("status")).toHaveTextContent("read-only");
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("unknown connector: not found", async () => {
    api.connector.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "No such connector", status: 404 }));
    renderAt("nope");
    expect(await screen.findByText("Connector not found")).toBeInTheDocument();
  });

  it("server error: retry", async () => {
    api.connector.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "down", status: 500 }));
    renderAt("flipkart");
    expect(await screen.findByRole("alert")).toHaveTextContent("down");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Paste API credentials")).toBeInTheDocument();
  });

  it("accounts that fail to load: error", async () => {
    api.accounts.mockRejectedValue(new ApiError({ code: "INTERNAL", message: "accounts down", status: 500 }));
    renderAt("flipkart");
    expect(await screen.findByText("Your accounts could not be loaded.")).toBeInTheDocument();
  });
});

describe("account page (an account id)", () => {
  const ID = card().id;

  it("shows the account in depth from the detail endpoint", async () => {
    renderAt(ID);
    expect(await screen.findByRole("heading", { name: "Acme Amazon", level: 2 })).toBeInTheDocument();
    expect(api.account).toHaveBeenCalledWith(ID, expect.anything());
    expect(api.connector).not.toHaveBeenCalled();
    expect(screen.getByText("Sandbox verified.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("2 units")).toBeInTheDocument(); // safety buffer
    expect(screen.getByText("80%")).toBeInTheDocument(); // allocation
    expect(screen.getByText("Signing secret set")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Inventory sync success rate" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Inventory capabilities" })).toBeInTheDocument();
    expect(screen.getByLabelText("Listings by status")).toHaveTextContent("rejected: 2");
  });

  it("shows recent runs with their error, loads the log and retries a failed run", async () => {
    api.jobLogs.mockResolvedValue({ items: [{ id: 1, level: "error", message: "refused by marketplace", createdAt: "2026-10-21T08:00:00.000Z" }], nextAfter: null });
    api.retryJob.mockResolvedValue(job({ id: "j9" }));
    renderAt(ID);
    const runs = await screen.findByRole("region", { name: "Recent sync runs" });
    expect(runs).toHaveTextContent("Marketplace refused the request");
    await userEvent.click(within(runs).getByRole("button", { name: "Log" }));
    expect(await within(runs).findByText(/refused by marketplace/)).toBeInTheDocument();
    await userEvent.click(within(runs).getByRole("button", { name: "Retry" }));
    expect(api.retryJob).toHaveBeenCalledWith("j9");
  });

  it("a viewer cannot retry a run", async () => {
    useWorkspaceStore.setState({ permissions: ["marketplace_accounts:read"] });
    renderAt(ID);
    const runs = await screen.findByRole("region", { name: "Recent sync runs" });
    expect(within(runs).getByRole("button", { name: "Retry" })).toBeDisabled();
    expect(within(runs).queryByRole("button", { name: "Log" })).not.toBeInTheDocument();
  });

  it("unknown account: not found", async () => {
    api.account.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "Marketplace account not found", status: 404 }));
    renderAt(ID);
    expect(await screen.findByText("Connection not found")).toBeInTheDocument();
  });

  it("server error: retry", async () => {
    api.account.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "detail down", status: 500 }));
    renderAt(ID);
    expect(await screen.findByRole("alert")).toHaveTextContent("detail down");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Acme Amazon", level: 2 })).toBeInTheDocument();
  });
});
