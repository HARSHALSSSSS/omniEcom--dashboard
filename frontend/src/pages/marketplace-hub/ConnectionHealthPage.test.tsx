import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import { FLIPKART, card, health } from "@/test/hubFixtures";

const api = vi.hoisted(() => ({ health: vi.fn(), connector: vi.fn(), reconnect: vi.fn() }));
vi.mock("@/api/hub.api", () => ({ hubApi: api }));
vi.mock("@/lib/session", () => ({ refreshShell: vi.fn().mockResolvedValue(undefined) }));

import ConnectionHealthPage from "./ConnectionHealthPage";

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname}</div>;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/marketplace-hub/health"]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ConnectionHealthPage />
                <Probe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ permissions: ["marketplace_accounts:read", "marketplace_accounts:write"] });
  api.health.mockResolvedValue(health());
});

describe("connection health", () => {
  it("shows the pulse, node count and reliability from the API", async () => {
    renderPage();
    expect(await screen.findByText("83%")).toBeInTheDocument();
    expect(screen.getByText("Degraded", { selector: "span.text-amber-600" })).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("18 of 20 runs, last 24 hours")).toBeInTheDocument();
    expect(screen.queryByText("99.4%")).not.toBeInTheDocument();
    expect(screen.queryByText(/API Quota/)).not.toBeInTheDocument();
  });

  it("draws every lane as a bar with its success rate and items per hour", async () => {
    renderPage();
    await screen.findByText("Order ingestion");
    const bar = screen.getByRole("progressbar", { name: "Inventory sync success rate" });
    expect(bar).toHaveAttribute("aria-valuenow", "93"); // 92.5 rounded for the bar
    const lanes = screen.getByRole("region", { name: "Data Flow Pipelines" });
    expect(within(lanes).getByText("Success: 92.5%")).toBeInTheDocument();
    expect(within(lanes).getByText(/1 run, 1 failed|12 runs, 0 failed/)).toBeInTheDocument();
    expect(within(lanes).getByText("No runs in this period")).toBeInTheDocument();
    expect(within(lanes).getByText("No finished runs")).toBeInTheDocument();
  });

  it("lists every account with a link to its detail", async () => {
    renderPage();
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("link", { name: "Acme Flipkart" })).toHaveAttribute("href", `/marketplace-hub/connectors/${FLIPKART.id}`);
    expect(within(table).getByText("80%")).toBeInTheDocument();
    expect(within(table).getByText("(2 failed)")).toBeInTheDocument();
    expect(within(table).getByText("5 days")).toBeInTheDocument();
  });

  it("warns about expiring credentials and reconnects from the warning", async () => {
    api.health.mockResolvedValue(health({ tokenWarnings: [{ accountId: FLIPKART.id, name: "Acme Flipkart", marketplace: "flipkart", daysLeft: 2, expired: false }] }));
    api.connector.mockResolvedValue({
      code: "flipkart",
      displayName: "Flipkart",
      authFlow: { mode: "credentials", fields: [{ key: "appId", label: "App ID", type: "text", required: true, secret: false, pattern: null, help: null }], redirectFields: [], partnerGated: false, refreshable: false },
    });
    api.reconnect.mockResolvedValue({ id: FLIPKART.id });
    renderPage();
    const warning = await screen.findByRole("region", { name: /Credentials that need attention/ });
    expect(warning).toHaveTextContent("The access token expires in 2 days.");
    await userEvent.click(within(warning).getByRole("button", { name: "Reconnect" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(await within(dialog).findByLabelText(/App ID/), "app-1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(api.reconnect).toHaveBeenCalledWith(FLIPKART.id, { appId: "app-1" }));
  });

  it("an expired authorization says so", async () => {
    api.health.mockResolvedValue(health({ tokenWarnings: [{ accountId: FLIPKART.id, name: "Acme Flipkart", marketplace: "flipkart", daysLeft: -1, expired: true }] }));
    renderPage();
    expect(await screen.findByText("The authorization has expired.")).toBeInTheDocument();
  });

  it("a viewer cannot reconnect", async () => {
    useWorkspaceStore.setState({ permissions: ["marketplace_accounts:read"] });
    api.health.mockResolvedValue(health({ tokenWarnings: [{ accountId: FLIPKART.id, name: "Acme Flipkart", marketplace: "flipkart", daysLeft: 2, expired: false }] }));
    renderPage();
    const warning = await screen.findByRole("region", { name: /Credentials that need attention/ });
    expect(within(warning).getByRole("button", { name: "Reconnect" })).toBeDisabled();
  });

  it("nothing connected: no invented numbers and a way to connect", async () => {
    api.health.mockResolvedValue(
      health({ overallPulseScore: null, networkStatus: "not_connected", connectionsCount: 0, connections: [], dataFlowLanes: [], tokenWarnings: [], summary: { total: 0, healthy: 0, warning: 0, error: 0, paused: 0 }, syncReliability: { windowHours: 24, finished: 0, failed: 0, successRate: null } }),
    );
    renderPage();
    expect(await screen.findByText("No marketplace connected yet")).toBeInTheDocument();
    expect(screen.getAllByText("n/a")).toHaveLength(2);
    expect(screen.getByText("No runs in the last 24 hours")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Connect a marketplace" }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/marketplace-hub/connectors");
  });

  it("error with retry", async () => {
    api.health.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "health down", status: 500 }));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("health down");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Order ingestion")).toBeInTheDocument();
  });

  it("shows a loading skeleton first", () => {
    api.health.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByLabelText("Loading connection health")).toBeInTheDocument();
    expect(card().name).toBe("Acme Amazon");
  });
});
