import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ConnectionHealthPage from "./ConnectionHealthPage";
import type { ChannelConnection } from "@/types/connection";
import type { HealthOverviewResponse } from "@/api/connectors.api";

// Mock the connector hooks
const mockUseConnectorHealth = vi.fn();
const mockUseRecentSyncJobs = vi.fn();
const mockUseSyncConnection = vi.fn();
const mockUseRetrySyncJob = vi.fn();

vi.mock("@/hooks/useConnectors", () => ({
  useConnectorHealth: () => mockUseConnectorHealth(),
  useRecentSyncJobs: () => mockUseRecentSyncJobs(),
  useSyncConnection: () => mockUseSyncConnection(),
  useRetrySyncJob: () => mockUseRetrySyncJob(),
}));

vi.mock("@/hooks/useListingAudit", () => ({
  useReadinessAudit: () => ({ data: { spectrum: { blocked: 0 } } }),
}));

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname}</div>;
}

function renderPage() {
  return render(
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
    </MemoryRouter>,
  );
}

const mockConnections: ChannelConnection[] = [
  {
    id: "conn-1",
    connectorId: "amazon",
    name: "Amazon India",
    category: "marketplace",
    status: "healthy",
    syncState: "idle",
    authType: "oauth",
    accountIdentifier: "seller-amazon-01",
    connectedAt: "2026-01-01T00:00:00.000Z",
    lastSyncAt: new Date().toISOString(),
    capabilities: ["inventory", "orders"],
    health: {
      pulseScore: 98,
      riskLevel: "low",
      frictionPoints: [],
      rateLimitRemainingPct: 92,
    },
    stats: {
      activeListings: 120,
      pendingOrders: 8,
      syncedInventoryItems: 120,
      errorCount: 0,
    },
  },
  {
    id: "conn-2",
    connectorId: "flipkart",
    name: "Flipkart",
    category: "marketplace",
    status: "healthy",
    syncState: "idle",
    authType: "api_credentials",
    accountIdentifier: "seller-flipkart-01",
    connectedAt: "2026-01-01T00:00:00.000Z",
    lastSyncAt: new Date().toISOString(),
    capabilities: ["inventory", "orders"],
    health: {
      pulseScore: 95,
      riskLevel: "low",
      frictionPoints: [],
      rateLimitRemainingPct: 88,
    },
    stats: {
      activeListings: 85,
      pendingOrders: 4,
      syncedInventoryItems: 85,
      errorCount: 0,
    },
  },
  {
    id: "conn-3",
    connectorId: "meesho",
    name: "Meesho",
    category: "marketplace",
    status: "warning",
    syncState: "idle",
    authType: "api_credentials",
    accountIdentifier: "seller-meesho-01",
    connectedAt: "2026-01-01T00:00:00.000Z",
    lastSyncAt: new Date().toISOString(),
    capabilities: ["inventory", "orders"],
    health: {
      pulseScore: 72,
      riskLevel: "medium",
      frictionPoints: ["Inventory synchronization delayed"],
      rateLimitRemainingPct: 65,
    },
    attentionIssue: {
      issueTitle: "Inventory synchronization delayed",
      issueDescription: "23 products affected by delayed inventory synchronization.",
      affectedAreas: ["inventory"],
      lastSuccessfulSync: "18 min ago",
      actionType: "retry_scheduled",
    },
    stats: {
      activeListings: 45,
      pendingOrders: 2,
      syncedInventoryItems: 22,
      errorCount: 23,
    },
  },
  {
    id: "conn-4",
    connectorId: "shopify",
    name: "Shopify Store",
    category: "storefront",
    status: "healthy",
    syncState: "idle",
    authType: "oauth",
    accountIdentifier: "store.myshopify.com",
    connectedAt: "2026-01-01T00:00:00.000Z",
    lastSyncAt: new Date().toISOString(),
    capabilities: ["inventory", "orders", "product_import"],
    health: {
      pulseScore: 100,
      riskLevel: "low",
      frictionPoints: [],
      rateLimitRemainingPct: 99,
    },
    stats: {
      activeListings: 210,
      pendingOrders: 15,
      syncedInventoryItems: 210,
      errorCount: 0,
    },
  },
];

const mockHealthData: HealthOverviewResponse["data"] = {
  overallPulseScore: 92,
  networkStatus: "degraded",
  connectionsCount: 4,
  totalActiveListings: 460,
  totalPendingOrders: 29,
  dataFlowLanes: [
    { lane: "Products", status: "healthy", throughput: "18 updates / hr", successRate: "99.8%" },
    { lane: "Inventory", status: "warning", throughput: "42 updates / hr", successRate: "94.2%" },
    { lane: "Orders", status: "healthy", throughput: "12 orders / hr", successRate: "100%" },
  ],
  connections: mockConnections,
  syncReliability: {
    windowHours: 24,
    finished: 28,
    failed: 2,
    successRate: 93.3,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRecentSyncJobs.mockReturnValue({ data: [] });
  mockUseSyncConnection.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
  mockUseRetrySyncJob.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
});

describe("ConnectionHealthPage", () => {
  it("renders loading skeleton when fetching connection health", () => {
    mockUseConnectorHealth.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderPage();
    expect(screen.getByText("Checking connections...")).toBeInTheDocument();
    expect(screen.getByText("Reading your network...")).toBeInTheDocument();
  });

  it("renders error state with retry diagnostics button", async () => {
    const refetch = vi.fn();
    mockUseConnectorHealth.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network gateway timeout"),
      refetch,
    });

    renderPage();
    expect(screen.getByText("Failed to load connection health")).toBeInTheDocument();
    expect(screen.getByText("Network gateway timeout")).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: "Retry Diagnostics" });
    await userEvent.click(retryBtn);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders empty state when no marketplace is connected yet", async () => {
    mockUseConnectorHealth.mockReturnValue({
      data: {
        overallPulseScore: 0,
        networkStatus: "optimal",
        connectionsCount: 0,
        totalActiveListings: 0,
        totalPendingOrders: 0,
        dataFlowLanes: [],
        connections: [],
      },
      isLoading: false,
      isError: false,
    });

    renderPage();
    expect(screen.getByText("Connect a marketplace to begin")).toBeInTheDocument();
    expect(screen.getByText("Your workspace stays central.")).toBeInTheDocument();

    const addChannelBtn = screen.getByRole("button", { name: "Add channel" });
    await userEvent.click(addChannelBtn);
    expect(screen.getByTestId("loc")).toHaveTextContent("/marketplace-hub/connectors");
  });

  it("renders overview dashboard with pulse ribbon, friction card, risk bar, and data river", () => {
    mockUseConnectorHealth.mockReturnValue({
      data: mockHealthData,
      isLoading: false,
      isError: false,
    });

    renderPage();
    expect(screen.getByRole("heading", { name: "Connection health" })).toBeInTheDocument();
    expect(screen.getByText("1 connection needs attention")).toBeInTheDocument();
    expect(screen.getByText("3 / 4")).toBeInTheDocument();
    expect(screen.getByText("connections healthy")).toBeInTheDocument();
    expect(screen.getByText("What is at risk")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText(/products with potential inventory mismatch/)).toBeInTheDocument();
    expect(screen.getByText("Sync river · current activity")).toBeInTheDocument();
    expect(screen.getByText("Network health DNA")).toBeInTheDocument();
  });

  it("renders all-healthy state when all connections are healthy", () => {
    const allHealthyConnections = mockConnections.map((c) => ({
      ...c,
      status: "healthy" as const,
      attentionIssue: undefined,
    }));

    mockUseConnectorHealth.mockReturnValue({
      data: {
        ...mockHealthData,
        networkStatus: "optimal",
        connections: allHealthyConnections,
      },
      isLoading: false,
      isError: false,
    });

    renderPage();
    expect(screen.getByText("Everything is flowing.")).toBeInTheDocument();
    expect(screen.getByText("All connected channels are healthy and synchronizing normally.")).toBeInTheDocument();
    expect(screen.getByText("No active friction")).toBeInTheDocument();
    expect(screen.getByText("Connection field")).toBeInTheDocument();
  });

  it("opens recovery drawer when inspecting a friction issue", async () => {
    mockUseConnectorHealth.mockReturnValue({
      data: mockHealthData,
      isLoading: false,
      isError: false,
    });

    renderPage();
    const frictionCard = screen.getByText("23 products affected");
    await userEvent.click(frictionCard);

    // Drawer should open showing recovery pathway
    expect(screen.getByText("Recovery pathway")).toBeInTheDocument();
    expect(screen.getByText("Detected")).toBeInTheDocument();
    expect(screen.getByText("Diagnosed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry sync" })).toBeInTheDocument();

    // Close the drawer
    const closeBtn = screen.getByLabelText("Close drawer");
    await userEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByText("Recovery pathway")).not.toBeInTheDocument();
    });
  });

  it("navigates between overview and connections & recovery table views", async () => {
    mockUseConnectorHealth.mockReturnValue({
      data: mockHealthData,
      isLoading: false,
      isError: false,
    });

    renderPage();

    // Click "Sync activity" to switch to recovery view
    const syncActivityBtn = screen.getByRole("button", { name: "Sync activity" });
    await userEvent.click(syncActivityBtn);

    expect(screen.getByRole("heading", { name: "Connections & recovery" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search connections...")).toBeInTheDocument();
    expect(screen.getByText("Last 24 hours")).toBeInTheDocument();
    expect(screen.getByText("Connection event timeline")).toBeInTheDocument();

    // Switch back to overview
    const backBtn = screen.getByRole("button", { name: "Back to overview" });
    await userEvent.click(backBtn);

    expect(screen.getByRole("heading", { name: "Connection health" })).toBeInTheDocument();
  });
});
