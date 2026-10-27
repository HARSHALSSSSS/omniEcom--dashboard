import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { Component, ProductProfit, ProductProfitPage, Waterfall } from "@/types/profitability";

const api = vi.hoisted(() => ({
  waterfall: vi.fn(),
  products: vi.fn(),
  spend: vi.fn(),
  spendSummary: vi.fn(),
  createSpend: vi.fn(),
  updateSpend: vi.fn(),
  deleteSpend: vi.fn(),
  importSpend: vi.fn(),
  accounts: vi.fn(),
}));
vi.mock("@/api/profitability.api", () => ({ profitabilityApi: api }));

import ProfitabilityPage from "./ProfitabilityPage";

const comp = (amountMinor: number | null, basis: Component["basis"] = "actual", coverage = 1): Component => ({ amountMinor, basis, coverage });

const WATERFALL = (over: Partial<Waterfall> = {}): Waterfall => ({
  range: { from: "2026-09-28", to: "2026-10-27" },
  ordersAnalysed: 30,
  ordersInRange: 30,
  windows: 1,
  truncated: false,
  grossRevenueMinor: 1_000_000,
  netContributionMinor: 250_000,
  knownPartMinor: 250_000,
  netMarginPercent: 25,
  missing: [],
  completeness: "complete",
  unallocatedAdvertisingMinor: 0,
  channels: [
    { channel: "mock", label: "Sandbox", orders: 30, grossRevenue: comp(1_000_000), cogs: comp(400_000), marketplaceFees: comp(100_000), shippingCosts: comp(150_000), returnsImpact: comp(50_000), advertisingSpend: comp(50_000), netProfitMinor: 250_000, knownPartMinor: 250_000, netMarginPercent: 25, missing: [] },
  ],
  comparison: { range: { from: "2026-08-29", to: "2026-09-27" }, ordersAnalysed: 20, truncated: false, grossRevenue: { changeMinor: 200_000, changePercent: 25 }, netContribution: { changeMinor: 50_000, changePercent: 25 }, netMarginPoints: 0, previousNetContributionMinor: 200_000, previousGrossRevenueMinor: 800_000 },
  steps: [
    { key: "gross_revenue", label: "Gross revenue", type: "positive", amountMinor: 1_000_000, basis: "actual", coverage: 1, shareOfRevenuePercent: 100, tooltip: "Items sold" },
    { key: "returns_refunds", label: "Returns and refunds", type: "negative", amountMinor: -50_000, basis: "actual", coverage: 1, shareOfRevenuePercent: 5, tooltip: "Refunds" },
    { key: "product_cost", label: "Product cost", type: "negative", amountMinor: -400_000, basis: "estimated", coverage: 1, shareOfRevenuePercent: 40, tooltip: "Cost" },
    { key: "marketplace_fees", label: "Marketplace fees", type: "negative", amountMinor: -100_000, basis: "actual", coverage: 1, shareOfRevenuePercent: 10, tooltip: "Fees" },
    { key: "shipping", label: "Shipping", type: "negative", amountMinor: -150_000, basis: "actual", coverage: 1, shareOfRevenuePercent: 15, tooltip: "Courier" },
    { key: "advertising", label: "Advertising", type: "negative", amountMinor: -50_000, basis: "actual", coverage: 1, shareOfRevenuePercent: 5, tooltip: "Spend" },
    { key: "net_contribution", label: "Net contribution", type: "subtotal", amountMinor: 250_000, basis: "estimated", coverage: 1, shareOfRevenuePercent: 25, tooltip: "Net" },
  ],
  ...over,
});

const product = (over: Partial<ProductProfit> = {}): ProductProfit => ({
  key: "v1",
  label: "TRV-1042",
  title: "Travel Bag",
  orders: 12,
  unitsSold: 40,
  revenue: comp(600_000),
  productCost: comp(240_000, "estimated"),
  shipping: comp(60_000),
  marketplaceFees: comp(60_000),
  penalties: comp(0),
  refunds: comp(10_000),
  contributionMinor: 230_000,
  knownPartMinor: 230_000,
  marginPercent: 38.3,
  marginStatus: "healthy",
  missing: [],
  completeness: "estimated",
  channels: [{ marketplace: "mock", orders: 12, units: 40, revenueMinor: 600_000, contributionMinor: 230_000, marginPercent: 38.3 }],
  ...over,
});

const page = (groups: ProductProfit[], over: Partial<ProductProfitPage> = {}): ProductProfitPage => ({
  range: { from: "2026-09-28", to: "2026-10-27" },
  ordersAnalysed: 30,
  ordersInRange: 30,
  truncated: false,
  marginTargetBps: 3000,
  statusCounts: { healthy: 1, belowTarget: 1, low: 0, unknown: 1 },
  groupsTotal: groups.length,
  page: 1,
  pageSize: 10,
  pages: 1,
  groups,
  ...over,
});

const ROWS = [
  product(),
  product({ key: "v2", label: "BKP-01", title: "Classic Backpack", unitsSold: 10, revenue: comp(300_000), marginPercent: 12, marginStatus: "below_target", contributionMinor: 36_000, channels: [{ marketplace: "mock", orders: 5, units: 10, revenueMinor: 300_000, contributionMinor: 36_000, marginPercent: 12 }] }),
  product({ key: "v3", label: "WLT-03", title: "Leather Wallet", unitsSold: 4, revenue: comp(100_000), productCost: comp(null, "missing", 0), contributionMinor: null, marginPercent: null, marginStatus: null, missing: ["productCost"] }),
];

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/profitability") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <ProfitabilityPage />
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const loc = () => screen.getByTestId("loc").textContent ?? "";
/** did any product query ask for this (the page also asks for the best sellers and the worst products for the map and the pressure card) */
const asked = (m: Record<string, unknown>) => api.products.mock.calls.some(([q]) => Object.entries(m).every(([k, v]) => (q as Record<string, unknown>)[k] === v));

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ permissions: ["analytics:read", "pricing:write"], shell: { business: { id: "b1", currency: "INR", timezone: "Asia/Kolkata" } } as never });
  api.waterfall.mockResolvedValue(WATERFALL());
  api.products.mockImplementation(async (q: { status?: string }) => page(q.status ? ROWS.filter((r) => (r.marginStatus ?? "unknown") === q.status) : ROWS));
  api.accounts.mockResolvedValue([]);
  api.spend.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 });
  api.spendSummary.mockResolvedValue({ range: { from: "2026-09-28", to: "2026-10-27" }, rows: 0, totalMinor: 0, byAccount: [], unallocatedMinor: 0 });
});

describe("Profitability overview on real data", () => {
  it("the pulse and the waterfall come from the bridge, with the change against the previous period", async () => {
    renderPage();
    expect(await screen.findByText("FINANCIAL PULSE")).toBeInTheDocument();
    expect((await screen.findAllByText("₹10,000")).length).toBeGreaterThan(0); // revenue
    expect(screen.getAllByText("25.0%").length).toBeGreaterThan(0); // contribution margin
    expect(screen.getAllByText("+25.0% vs previous", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText("Where revenue goes")).toBeInTheDocument();
    expect(screen.queryByText(/18\.4L|42\.8|Illustrative|Reconciliation required|Metric preview|Black T-Shirt|Travel Duffel/)).not.toBeInTheDocument();
  });

  it("says there are no sales instead of showing demo figures, and offers a longer range", async () => {
    api.waterfall.mockResolvedValue(WATERFALL({ ordersAnalysed: 0, ordersInRange: 0, grossRevenueMinor: 0, netContributionMinor: null, netMarginPercent: null, channels: [], comparison: null, steps: [] }));
    api.products.mockResolvedValue(page([], { statusCounts: { healthy: 0, belowTarget: 0, low: 0, unknown: 0 } }));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("No sales in this period")).toBeInTheDocument();
    expect(await screen.findByText("No products sold in this period")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show the last 90 days" }));
    expect(loc()).toContain("range=90d");
  });

  it("lists the real products with dashes where a cost is unknown", async () => {
    renderPage();
    const row = (await screen.findByText("Travel Bag", { selector: "span" })).closest("tr") as HTMLElement;
    expect(within(row).getByText("TRV-1042")).toBeInTheDocument();
    expect(within(row).getByText("₹2,300")).toBeInTheDocument();
    const unknown = screen.getByText("Leather Wallet", { selector: "span" }).closest("tr") as HTMLElement;
    expect(within(unknown).getAllByText("—").length).toBeGreaterThanOrEqual(2); // contribution and margin
    expect(within(unknown).getByText("Cost missing")).toBeInTheDocument();
  });

  it("the Marketplace, Margin and sort controls filter on the server and live in the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Travel Bag", { selector: "span" });
    await user.selectOptions(screen.getByLabelText("Marketplace"), "mock");
    await waitFor(() => expect(asked({ marketplace: "mock", page: 1 })).toBe(true));
    expect(loc()).toContain("mk=mock");
    await user.selectOptions(screen.getByLabelText("Margin"), "below_target");
    await waitFor(() => expect(asked({ status: "below_target" })).toBe(true));
    expect(loc()).toContain("ms=below_target");
    await user.selectOptions(screen.getByLabelText("Contribution sort"), "margin");
    await waitFor(() => expect(asked({ sort: "margin" })).toBe(true));
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(loc()).not.toContain("ms="));
  });

  it("the search is debounced into the query and opens in the state the URL describes", async () => {
    const user = userEvent.setup();
    renderPage("/profitability?pq=wallet&ms=low");
    expect(await screen.findByLabelText("Search product or SKU")).toHaveValue("wallet");
    await waitFor(() => expect(asked({ q: "wallet", status: "low" })).toBe(true));
    await user.clear(screen.getByLabelText("Search product or SKU"));
    await waitFor(() => expect(loc()).not.toContain("pq="), { timeout: 2000 });
  });

  it("margin pressure counts the buckets against the policy target and filters the table", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Margin pressure")).toBeInTheDocument();
    expect(await screen.findByText(/Margin target 30\.0%/)).toBeInTheDocument();
    expect(screen.getAllByText("Below target").length).toBeGreaterThan(0);
    expect(screen.getByText(/1 product has no complete cost picture yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Show them/ }));
    expect(loc()).toContain("ms=unknown");
  });

  it("without a target there are two buckets by sign and the page says so", async () => {
    api.products.mockImplementation(async () => page(ROWS, { marginTargetBps: null, statusCounts: { healthy: 2, belowTarget: 0, low: 0, unknown: 1 } }));
    renderPage();
    expect(await screen.findByText(/No margin target set/)).toBeInTheDocument();
    expect(screen.queryByTitle("Show the products below the target")).not.toBeInTheDocument();
  });

  it("the contribution map places products by margin and demand, and counts those it cannot place", async () => {
    renderPage();
    expect(await screen.findByText("Product contribution map")).toBeInTheDocument();
    expect(await screen.findByText(/1 product is not on the map/)).toBeInTheDocument();
    expect(screen.getByText("Scale opportunity")).toBeInTheDocument();
  });

  it("opens the review drawer for a product with its per-marketplace figures, and no selected product before that", async () => {
    const user = userEvent.setup();
    renderPage();
    const row = (await screen.findByText("Travel Bag", { selector: "span" })).closest("tr") as HTMLElement;
    expect(screen.queryByText("Product Review")).not.toBeInTheDocument();
    await user.click(row);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("By marketplace")).toBeInTheDocument();
    expect(within(dialog).getByText("Sandbox")).toBeInTheDocument();
    expect(within(dialog).getAllByText("38.3%").length).toBeGreaterThan(0);
  });

  it("shows an error with retry when the products cannot be loaded", async () => {
    api.products.mockRejectedValueOnce(new ApiError({ code: "SERVER", message: "Products down", status: 500 }));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Products down")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Retry" })[0]!);
    expect(await screen.findByText("Travel Bag", { selector: "span" })).toBeInTheDocument();
  });
});
