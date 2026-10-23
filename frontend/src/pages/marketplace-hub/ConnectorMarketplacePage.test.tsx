import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { ConnectorDirectoryItem } from "@/types/connection";

const mockConnectors: ConnectorDirectoryItem[] = [
  {
    id: "amazon_in",
    name: "Amazon",
    category: "marketplace",
    authType: "oauth",
    description: "Manage your Amazon catalog and orders.",
    rating: 4.9,
    reviewsCount: 150,
    status: "connected",
    pricing: { freeTrialDays: 0, monthlyFeeINR: 799, planName: "Pro" },
    capabilities: ["product_import", "listings", "inventory", "orders"],
    supportedRegions: ["IN"],
    fields: [],
    authFlow: { type: "oauth", mode: "redirect", fields: [], redirectFields: [], partnerGated: false, refreshable: true },
  },
  {
    id: "flipkart",
    name: "Flipkart",
    category: "marketplace",
    authType: "oauth",
    description: "Bring your Flipkart operations into one workspace.",
    rating: 4.8,
    reviewsCount: 120,
    status: "available",
    pricing: { freeTrialDays: 0, monthlyFeeINR: 499, planName: "Plus" },
    capabilities: ["product_import", "listings", "inventory", "orders"],
    supportedRegions: ["IN"],
    fields: [],
    authFlow: { type: "oauth", mode: "redirect", fields: [], redirectFields: [], partnerGated: false, refreshable: true },
  },
  {
    id: "shopify",
    name: "Shopify",
    category: "storefront",
    authType: "oauth",
    description: "Connect your storefront catalog and orders.",
    rating: 4.9,
    reviewsCount: 200,
    status: "connected",
    pricing: { freeTrialDays: 0, monthlyFeeINR: 599, planName: "Store" },
    capabilities: ["product_import", "listings", "inventory", "orders"],
    supportedRegions: ["IN", "GLOBAL"],
    fields: [],
    authFlow: { type: "oauth", mode: "redirect", fields: [], redirectFields: [], partnerGated: false, refreshable: true },
  },
  {
    id: "snapdeal",
    name: "Snapdeal",
    category: "marketplace",
    authType: "api_credentials",
    description: "Snapdeal seller operations: products, stock and order updates.",
    rating: 4.5,
    reviewsCount: 80,
    status: "unavailable",
    pricing: { freeTrialDays: 0, monthlyFeeINR: 399, planName: "Add-on" },
    capabilities: ["product_import", "orders"],
    supportedRegions: ["IN"],
    fields: [],
    authFlow: { type: "credentials", mode: "credentials", fields: [], redirectFields: [], partnerGated: false, refreshable: false },
  },
];

vi.mock("@/hooks/useConnectors", () => ({
  useConnectorDirectory: () => ({ data: mockConnectors, isLoading: false }),
  useConnections: () => ({ data: { data: [], meta: { total: 4, healthy: 4, warning: 0, error: 0 } } }),
  useConnection: () => ({ data: null }),
}));

vi.mock("@/hooks/useProducts", () => ({
  useCatalogStats: () => ({
    data: { products: 427, variants: 1286, activeProducts: 400, activeVariants: 1200 },
  }),
}));

import ConnectorMarketplacePage from "./ConnectorMarketplacePage";

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/marketplace-hub/connectors"]}>
        <Routes>
          <Route
            path="/marketplace-hub/connectors"
            element={<ConnectorMarketplacePage />}
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({
    permissions: ["marketplace_accounts:read", "marketplace_accounts:write"],
  });
});

describe("ConnectorMarketplacePage", () => {
  it("renders the directory with Figma screen header, recommendation banner, and connector cards", () => {
    renderPage();
    expect(screen.getByText("Expand your commerce network")).toBeInTheDocument();
    expect(screen.getAllByText("Flipkart").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Manage your Amazon catalog and orders.")).toBeInTheDocument();
    expect(screen.getByText("Demo pricing only. Connector add-ons are separate from the workspace plan. Capabilities depend on supported APIs and permissions.")).toBeInTheDocument();
  });

  it("searches connectors by keyword", async () => {
    const user = userEvent.setup();
    renderPage();
    const searchInput = screen.getByPlaceholderText(/search marketplaces/i);
    await user.type(searchInput, "flipkart");
    expect(screen.getByText("Bring your Flipkart operations into one workspace.")).toBeInTheDocument();
    expect(screen.queryByText("Manage your Amazon catalog and orders.")).not.toBeInTheDocument();
  });

  it("shows empty state when no connector matches search and allows clearing", async () => {
    const user = userEvent.setup();
    renderPage();
    const searchInput = screen.getByPlaceholderText(/search marketplaces/i);
    await user.type(searchInput, "warehouse analytics");
    expect(screen.getByText("No connectors match your search.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(screen.getByText("Manage your Amazon catalog and orders.")).toBeInTheDocument();
  });

  it("opens Flipkart preview drawer when clicking Connect on available connector and enforces acknowledgment checkbox", async () => {
    const user = userEvent.setup();
    renderPage();
    const connectButtons = screen.getAllByRole("button", { name: "Connect" });
    await user.click(connectButtons[0]);
    expect(screen.getAllByText("Available to connect").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("427 master products · 1286 variants")).toBeInTheDocument();
    
    const continueBtn = screen.getByRole("button", { name: "Continue" });
    expect(continueBtn).toBeDisabled();

    const ackCheckbox = screen.getByRole("checkbox", { name: /connecting does not publish products automatically/i });
    expect(ackCheckbox).not.toBeChecked();

    await user.click(ackCheckbox);
    expect(ackCheckbox).toBeChecked();
    expect(continueBtn).toBeEnabled();
  });

  it("compares up to 3 selected connectors in comparison modal", async () => {
    const user = userEvent.setup();
    renderPage();
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);
    expect(screen.getByRole("button", { name: /compare \(2\)/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /compare \(2\)/i }));
    expect(screen.getByText("Compare connectors")).toBeInTheDocument();
    expect(screen.getByText("Review supported capabilities before choosing a connector.")).toBeInTheDocument();
  });
});
