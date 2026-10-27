import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { HubAccountCard } from "@/types/hub";

const hub = vi.hoisted(() => ({ accounts: vi.fn() }));
const shipping = vi.hoisted(() => ({ carriers: vi.fn() }));
vi.mock("@/api/hub.api", () => ({ hubApi: hub }));
vi.mock("@/api/shipping.api", () => ({ shippingApi: shipping }));

import { IntegrationsTab, isConnected } from "./IntegrationsTab";

const account = (over: Partial<HubAccountCard> = {}): HubAccountCard =>
  ({
    id: "a1", marketplace: "mock", name: "Sandbox Marketplace", connectorName: "Mock marketplace", category: "marketplace", logoKey: "mock", accountIdentifier: null, mode: "sandbox", region: "IN",
    status: "healthy", accountStatus: "active", connectionStatus: "connected", authType: "api_key", connectedAt: "2026-10-01T00:00:00.000Z", lastSyncAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), nextSyncAt: null,
    syncState: "idle", syncProgress: null, stats: { activeListings: 3, pendingOrders: 1, syncedInventoryItems: 3, errorCount: 0 },
    health: { pulseScore: 92, riskLevel: "low", frictionPoints: [], rateLimitRemainingPct: null, tokenExpiresInDays: null, tokenExpiresAt: null, syncSuccessRate24h: 100, syncRuns24h: { finished: 4, failed: 0 } },
    ...over,
  }) as HubAccountCard;

const wrap = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <IntegrationsTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ permissions: ["shipping:read"] });
  shipping.carriers.mockResolvedValue({ items: [{ id: "c1", kind: "third_party", name: "Sandbox Express", providerCode: "sandbox", status: "active", isDefault: true, verification: { state: "verified", verifiedAt: null }, shipmentsLast30d: 7, inTransit: 1, lastShipmentAt: null }], activeCount: 1, availableProviders: [] });
});
afterEach(() => cleanup());

describe("IntegrationsTab", () => {
  it("lists the real connections and providers, nothing invented", async () => {
    hub.accounts.mockResolvedValue({ items: [account(), account({ id: "a2", name: "Old shop", accountStatus: "revoked", connectionStatus: "disconnected", status: "error" })], summary: { total: 2, healthy: 1, warning: 0, error: 1, paused: 0 } });
    wrap();
    expect(await screen.findByText("Sandbox Marketplace")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 marketplace accounts connected/)).toBeInTheDocument();
    expect(screen.getByText("Old shop")).toBeInTheDocument();
    expect(screen.getByText("DISCONNECTED")).toBeInTheDocument();
    expect(await screen.findByText("Sandbox Express")).toBeInTheDocument();
    expect(screen.queryByText(/Amazon India|Flipkart Commerce|Shopify Plus|Bluedart/)).not.toBeInTheDocument();
  });

  it("offers to connect when nothing is connected", async () => {
    hub.accounts.mockResolvedValue({ items: [], summary: { total: 0, healthy: 0, warning: 0, error: 0, paused: 0 } });
    shipping.carriers.mockResolvedValue({ items: [], activeCount: 0, availableProviders: [] });
    wrap();
    expect(await screen.findByText("No marketplace is connected yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect a marketplace" })).toBeInTheDocument();
    expect(await screen.findByText("No shipping provider is set up yet.")).toBeInTheDocument();
  });

  it("shows an error with retry when the connections cannot be loaded", async () => {
    hub.accounts.mockRejectedValue(new ApiError({ code: "SERVER", message: "Hub is down", status: 500 }));
    wrap();
    expect(await screen.findByRole("alert")).toHaveTextContent("Hub is down");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("only counts an authorised, answering account as connected", () => {
    expect(isConnected({ accountStatus: "active", connectionStatus: "connected" })).toBe(true);
    expect(isConnected({ accountStatus: "revoked", connectionStatus: "disconnected" })).toBe(false);
    expect(isConnected({ accountStatus: "pending_authorization", connectionStatus: "unknown" })).toBe(false);
    expect(isConnected({ accountStatus: "active", connectionStatus: "error" })).toBe(false);
  });
});
