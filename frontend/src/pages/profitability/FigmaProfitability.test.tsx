import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useWorkspaceStore } from "@/store/workspace.store";
import ProfitabilityPage from "./ProfitabilityPage";

const api = vi.hoisted(() => ({
  waterfall: vi.fn(),
  spend: vi.fn(),
  spendSummary: vi.fn(),
  createSpend: vi.fn(),
  updateSpend: vi.fn(),
  deleteSpend: vi.fn(),
  importSpend: vi.fn(),
  accounts: vi.fn(),
}));
vi.mock("@/api/profitability.api", () => ({ profitabilityApi: api }));

function renderPage(url = "/profitability") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <ProfitabilityPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ permissions: ["analytics:read", "pricing:write"] });
  api.waterfall.mockResolvedValue({
    range: { from: "2026-09-22", to: "2026-10-21" },
    ordersAnalysed: 204,
    ordersInRange: 204,
    windows: 1,
    truncated: false,
    grossRevenueMinor: 1_840_000_00,
    netContributionMinor: 790_000_00,
    knownPartMinor: 750_000_00,
    netMarginPercent: 42.8,
    missing: [],
    completeness: "complete",
    unallocatedAdvertisingMinor: 0,
    channels: [],
    comparison: null,
    steps: [
      { key: "gross_revenue", label: "Gross revenue", type: "positive", amountMinor: 1_840_000_00, basis: "actual", coverage: 1, shareOfRevenuePercent: 100, tooltip: "Revenue" },
      { key: "net_contribution", label: "Net contribution", type: "subtotal", amountMinor: 790_000_00, basis: "actual", coverage: 1, shareOfRevenuePercent: 42.8, tooltip: "Contribution" },
    ],
  });
  api.accounts.mockResolvedValue([]);
});

describe("Figma Profitability Screen", () => {
  it("renders the Financial Pulse bar with all 7 key metrics", async () => {
    renderPage();
    expect(await screen.findByText("FINANCIAL PULSE")).toBeInTheDocument();
    expect(screen.getAllByText("₹18.4L").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("₹6.2L").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("₹2.1L")).toBeInTheDocument();
    expect(screen.getAllByText("₹1.4L").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("₹0.8L").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("₹7.9L").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("42.8%")).toBeInTheDocument();
  });

  it("renders Where revenue goes waterfall bridge and reconciliation alert", async () => {
    renderPage();
    expect(await screen.findByText("Where revenue goes")).toBeInTheDocument();
    expect(screen.getByText("Revenue – costs = calculated contribution = reported contribution")).toBeInTheDocument();
    expect(screen.getByText("Calculated contribution")).toBeInTheDocument();
    expect(screen.getByText("Reported contribution")).toBeInTheDocument();
    expect(screen.getAllByText(/difference/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Reconciliation required · supplied figures retained")).toBeInTheDocument();
  });

  it("renders Product Profitability table and opens the Product Review Drawer", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Product Profitability")).toBeInTheDocument();
    expect(screen.getAllByText("Black T-Shirt").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("TS-BLK-042")).toBeInTheDocument();
    expect(screen.getAllByText("Running Shoes").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Travel Duffel").length).toBeGreaterThanOrEqual(1);

    // Check footnotes
    expect(screen.getByText(/Travel Duffel reconciles/)).toBeInTheDocument();

    // Click "View" on Black T-Shirt to open Product Review Drawer
    const viewButtons = screen.getAllByRole("button", { name: /^View/i });
    await user.click(viewButtons[0]);

    // Drawer is now open
    expect(await screen.findByRole("dialog", { name: "Product Review" })).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "Product Review" });

    expect(within(dialog).getByText("PRODUCT REVIEW · OPEN")).toBeInTheDocument();
    expect(within(dialog).getByText("Revenue")).toBeInTheDocument();
    expect(within(dialog).getByText("₹1,20,000")).toBeInTheDocument();
    expect(within(dialog).getByText("₹62,000")).toBeInTheDocument();
    expect(within(dialog).getByText("Marketplace commission")).toBeInTheDocument();
    expect(within(dialog).getByText("Payment fees")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Contribution margin").length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).getByText("17.5%")).toBeInTheDocument();
    expect(within(dialog).getByText("Breakdown mismatch · review source")).toBeInTheDocument();
    expect(within(dialog).getByText("Channel comparison")).toBeInTheDocument();
    expect(within(dialog).getByText("• Best contribution: Shopify")).toBeInTheDocument();
    expect(within(dialog).getByText("Profitability Signal")).toBeInTheDocument();
    expect(within(dialog).getByText("Review pricing")).toBeInTheDocument();

    // Close the drawer with X button
    await user.click(within(dialog).getByRole("button", { name: /Close drawer/i }));
    expect(screen.queryByRole("dialog", { name: "Product Review" })).not.toBeInTheDocument();

    // Reopen drawer
    await user.click(viewButtons[0]);
    expect(await screen.findByRole("dialog", { name: "Product Review" })).toBeInTheDocument();

    // Close via Escape key
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Product Review" })).not.toBeInTheDocument();

    // Reopen drawer again
    await user.click(viewButtons[0]);
    expect(await screen.findByRole("dialog", { name: "Product Review" })).toBeInTheDocument();

    // Close via outside backdrop click
    const backdrop = screen.getByRole("dialog", { name: "Product Review" }).parentElement?.parentElement;
    if (backdrop) {
      await user.click(backdrop);
    }
    expect(screen.queryByRole("dialog", { name: "Product Review" })).not.toBeInTheDocument();
  });

  it("renders Which channel contributes best with margin highlighting", async () => {
    renderPage();
    expect(await screen.findByText("Which channel contributes best?")).toBeInTheDocument();
    expect(screen.getByText("+ Highest contribution margin: Shopify 53%")).toBeInTheDocument();
    expect(screen.getByText("Amazon.in")).toBeInTheDocument();
    expect(screen.getByText("Flipkart")).toBeInTheDocument();
    expect(screen.getByText("Meesho")).toBeInTheDocument();
    expect(screen.getByText("Shopify")).toBeInTheDocument();
  });

  it("renders Margin pressure card with counts and status badges", async () => {
    renderPage();
    expect(await screen.findByText("Margin pressure")).toBeInTheDocument();
    expect(screen.getByText("Healthy products")).toBeInTheDocument();
    expect(screen.getByText("Below target products")).toBeInTheDocument();
    expect(screen.getByText("Low contribution products")).toBeInTheDocument();
    expect(screen.getByText("842")).toBeInTheDocument();
    expect(screen.getByText("116")).toBeInTheDocument();
    expect(screen.getByText("34")).toBeInTheDocument();
  });

  it("renders Product contribution map with 4 quadrants and clickable points", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Product contribution map")).toBeInTheDocument();
    expect(screen.getByText("Marketing opportunity")).toBeInTheDocument();
    expect(screen.getByText("Scale opportunity")).toBeInTheDocument();
    expect(screen.getByText("Review candidate")).toBeInTheDocument();
    expect(screen.getByText("Optimize pricing / cost")).toBeInTheDocument();

    // Clicking point on map opens drawer
    const dotBtn = screen.getByRole("button", { name: "Running Shoes" });
    await user.click(dotBtn);

    const dialog = await screen.findByRole("dialog", { name: "Product Review" });
    expect(within(dialog).getByText("Running Shoes")).toBeInTheDocument();
  });
});
