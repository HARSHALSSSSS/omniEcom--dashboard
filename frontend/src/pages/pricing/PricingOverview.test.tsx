import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import PricingPage from "./PricingPage";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { PricingOverview, ProposalsPage } from "@/types/pricing";

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  proposals: vi.fn(),
  policies: vi.fn(),
  policyPreview: vi.fn(),
  competitors: vi.fn(),
  history: vi.fn(),
}));

vi.mock("@/api/pricing.api", () => ({ pricingApi: api }));
vi.mock("@/api/listings.api", () => ({
  listingsApi: {
    table: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 }),
  },
}));
vi.mock("@/utils/shell", () => ({ refreshShell: vi.fn() }));

const overviewData = (): PricingOverview => ({
  pendingProposals: 3,
  potentialMarginGainMinor: 4860000,
  proposalsWithoutEstimate: 2,
  autoAppliedLast30Days: 0,
  approvedLast30Days: 0,
  rejectedLast30Days: 0,
  activePolicies: 2,
  pausedPolicies: 1,
  channelsCovered: 2,
  channels: [
    { accountId: "11111111-1111-4111-8111-111111111111", name: "Amazon", marketplace: "amazon" },
    { accountId: "22222222-2222-4222-8222-222222222222", name: "Flipkart", marketplace: "flipkart" },
  ],
  proposalCounts: {},
  basis: "estimated",
});

const emptyProposals = (): ProposalsPage => ({
  items: [],
  page: 1,
  pageSize: 25,
  total: 0,
  pages: 1,
  counts: { pending_review: 0, approved: 0, rejected: 0, auto_applied: 0, failed: 0, expired: 0, superseded: 0, all: 0 },
});

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderOverviewPage(url = "/pricing") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <PricingPage />
                <Probe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ permissions: ["pricing:read", "pricing:write", "pricing:approve"] });
  api.overview.mockResolvedValue(overviewData());
  api.proposals.mockResolvedValue(emptyProposals());
  api.policies.mockResolvedValue([]);
  api.competitors.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 });
  api.history.mockResolvedValue({ items: [], nextBefore: null });
});

describe("PricingOverviewView (Figma Screen 1)", () => {
  it("renders the pricing pulse KPI bar, opportunities card, and intelligence card", async () => {
    renderOverviewPage();

    // 1. Breadcrumbs & Title
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getAllByText("Pricing")[0]).toBeInTheDocument();

    // 2. Pricing pulse KPI metrics
    expect(await screen.findByText("Products in view")).toBeInTheDocument();
    expect(screen.getByText(/product-channel prices/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Avg\. est\. margin/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pricing opportunities").length).toBeGreaterThan(0);
    expect(screen.getByText("Updates applied")).toBeInTheDocument();

    // 3. Pricing opportunities table
    expect(screen.getAllByText("Cotton Oversized T-Shirt").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Home Storage Set").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Canvas Shoes").length).toBeGreaterThan(0);

    // 4. Pricing intelligence card
    expect(screen.getByText(/channel prices fall below the 30% margin target/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review price proposals" })).toBeInTheDocument();
  });

  it("renders the product & channel pricing table with filters and margin context table", async () => {
    const user = userEvent.setup();
    renderOverviewPage();

    // Product & channel pricing table
    expect(await screen.findByText("Product & channel pricing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All prices/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Below target/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /With proposals/i })).toBeInTheDocument();

    // Filter by 'Below target'
    await user.click(screen.getByRole("button", { name: /Below target/i }));
    expect(screen.getAllByText("Cotton Oversized T-Shirt").length).toBeGreaterThan(0);

    // Margin context table & advisory notice
    expect(screen.getByText("Margin context")).toBeInTheDocument();
    expect(screen.getByText(/All prices, costs and recommendations are illustrative/i)).toBeInTheDocument();
  });

  it("navigates to proposals tab when Review button is clicked", async () => {
    const user = userEvent.setup();
    renderOverviewPage();

    expect(await screen.findByText("Products in view")).toBeInTheDocument();
    const reviewButtons = screen.getAllByRole("button", { name: /Review/i });
    expect(reviewButtons.length).toBeGreaterThan(0);
    await user.click(reviewButtons[0]);

    // Navigates to proposals tab
    expect(screen.getByTestId("loc").textContent).toBe("/pricing?view=proposals");
  });
});
