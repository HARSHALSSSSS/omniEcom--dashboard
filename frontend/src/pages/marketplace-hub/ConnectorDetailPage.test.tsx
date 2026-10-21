import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import { FLIPKART, accounts, card, detail, job } from "@/test/hubFixtures";

const api = vi.hoisted(() => ({ account: vi.fn(), accounts: vi.fn(), connector: vi.fn(), jobLogs: vi.fn(), retryJob: vi.fn(), cancelJob: vi.fn() }));
vi.mock("@/api/hub.api", () => ({ hubApi: api }));
vi.mock("@/lib/session", () => ({ refreshShell: vi.fn().mockResolvedValue(undefined) }));

import ConnectorDetailPage from "./ConnectorDetailPage";

function renderAt(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/marketplace-hub/connectors/${id}`]}>
        <Routes>
          <Route path="/marketplace-hub/connectors/:id" element={<ConnectorDetailPage />} />
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
  enabledCapabilities: ["orders.fetch"],
  capabilities: { orders: { fetch: true, webhook: false }, inventory: { push: true, pull: false } },
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
});

describe("connector page (a marketplace code)", () => {
  it("shows what the connector supports, how it connects and the seller's accounts on it", async () => {
    renderAt("flipkart");
    expect(await screen.findByRole("heading", { name: "Flipkart", level: 2 })).toBeInTheDocument();
    expect(api.connector).toHaveBeenCalledWith("flipkart", expect.anything());
    expect(screen.getByText("Paste API credentials")).toBeInTheDocument();
    expect(screen.getByText("App ID")).toBeInTheDocument();
    const mine = screen.getByRole("region", { name: "Your accounts" });
    expect(within(mine).getByRole("link", { name: "Acme Flipkart" })).toHaveAttribute("href", `/marketplace-hub/connectors/${FLIPKART.id}`);
    expect(within(mine).queryByText("Acme Amazon")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Orders capabilities" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect" })).toHaveAttribute("href", "/marketplace-hub/connect/flipkart");
  });

  it("a connector that is not available yet cannot be connected", async () => {
    api.connector.mockResolvedValue({ ...CONNECTOR, implementation: "planned" });
    renderAt("flipkart");
    await screen.findByText("Coming soon");
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("a viewer cannot start a connection", async () => {
    useWorkspaceStore.setState({ permissions: ["marketplace_accounts:read", "connectors:read"] });
    renderAt("flipkart");
    await screen.findByText("Paste API credentials");
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
