import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import PricingPage from "./PricingPage";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { MarginOverview, PriceProposal, PriceTablePage, PriceTableRow, PricingOverview, ProposalsPage } from "@/types/pricing";

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  marginOverview: vi.fn(),
  priceTable: vi.fn(),
  proposals: vi.fn(),
  policies: vi.fn(),
  policyPreview: vi.fn(),
  competitors: vi.fn(),
  history: vi.fn(),
}));

vi.mock("@/api/pricing.api", () => ({ pricingApi: api, HISTORY_PAGE: 50 }));
vi.mock("@/utils/shell", () => ({ refreshShell: vi.fn() }));

const AMAZON = "11111111-1111-4111-8111-111111111111";
const FLIPKART = "22222222-2222-4222-8222-222222222222";

const overviewData = (): PricingOverview => ({
  pendingProposals: 3,
  potentialMarginGainMinor: 4860000,
  proposalsWithoutEstimate: 2,
  autoAppliedLast30Days: 1,
  appliedLast30Days: 4,
  opportunitiesCount: 2,
  approvedLast30Days: 3,
  rejectedLast30Days: 0,
  activePolicies: 2,
  pausedPolicies: 1,
  channelsCovered: 2,
  channels: [
    { accountId: AMAZON, name: "Amazon", marketplace: "amazon" },
    { accountId: FLIPKART, name: "Flipkart", marketplace: "flipkart" },
  ],
  proposalCounts: {},
  basis: "estimated",
});

const marginData = (): MarginOverview => ({
  channels: [
    {
      accountId: AMAZON, channel: "Amazon", marketplace: "amazon", priceCount: 3, pricedWithCostCount: 3, avgMarginBps: 2988, belowTargetCount: 2, targetMarginBps: 3500,
      feeTermsSummary: "10% commission", feesConfigured: true, unknownCostCount: 0, nextAction: "proposals",
    },
    {
      accountId: FLIPKART, channel: "Flipkart", marketplace: "flipkart", priceCount: 2, pricedWithCostCount: 0, avgMarginBps: null, belowTargetCount: 0, targetMarginBps: 3500,
      feeTermsSummary: "fees not configured", feesConfigured: false, unknownCostCount: 2, nextAction: "costs",
    },
  ],
  totals: { productsInView: 4, productChannelPrices: 5, avgMarginBps: 2988, belowTargetCount: 2, unknownCostCount: 2, withProposalCount: 1, targetMarginBps: 3500 },
});

const row = (over: Partial<PriceTableRow> = {}): PriceTableRow => ({
  listingId: "l1", variantId: "v1", productId: "prod1", productTitle: "Cotton Kurta", sku: "KURTA-M", accountId: AMAZON, channel: "Amazon", marketplace: "amazon",
  currentPriceMinor: 49900, unitCostMinor: 30000, feesMinor: 4990, marginBps: 2988, targetMarginBps: 3500, belowTarget: true, proposalState: "proposed", proposalId: "p1", proposedPriceMinor: 54600,
  ...over,
});

const tablePage = (items: PriceTableRow[], over: Partial<PriceTablePage> = {}): PriceTablePage => ({ items, page: 1, pageSize: 10, total: items.length, pages: 1, ...over });

const proposal = (over: Partial<PriceProposal> = {}): PriceProposal => ({
  id: "p1", status: "pending_review", strategy: "margin_floor", variantId: "v1", sku: "KURTA-M", productTitle: "Cotton Kurta", accountId: AMAZON, channelName: "Amazon", marketplace: "amazon",
  policyId: "pol", policyName: "Floor", currentPriceMinor: 49900, proposedPriceMinor: 54600, currency: "INR", priceChangeBps: 942, competitorPriceMinor: null, estMarginDeltaBps: 512,
  projectedSalesDeltaBps: null, reasoning: "Floor", unitCostMinor: 30000, feesMinor: 4990, proposedFeesMinor: 5460, currentMarginBps: 2988, proposedMarginBps: 3500, targetMarginBps: 3500, reasonCode: "below_margin_target",
  reasonText: "Current margin is 29.88%, below the 35% target.", expiresAt: null, createdAt: "2026-10-01T00:00:00.000Z", decidedBy: null, decidedByName: null, decidedAt: null, decisionNote: null,
  appliedAt: null, failureMessage: null, pushSkipped: false, version: 1, ...over,
});

const proposalsPage = (items: PriceProposal[]): ProposalsPage => ({
  items, page: 1, pageSize: 25, total: items.length, pages: 1,
  counts: { pending_review: items.length, approved: 0, rejected: 0, auto_applied: 0, failed: 0, expired: 0, superseded: 0, all: items.length },
});

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderOverviewPage(url = "/pricing") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="*" element={<><PricingPage /><Probe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const loc = () => new URL(screen.getByTestId("loc").textContent ?? "", "http://x");

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ permissions: ["pricing:read", "pricing:write", "pricing:approve"] });
  api.overview.mockResolvedValue(overviewData());
  api.marginOverview.mockResolvedValue(marginData());
  api.priceTable.mockResolvedValue(tablePage([
    row(),
    row({ listingId: "l2", variantId: "v2", productId: "prod2", productTitle: "Canvas Shoes", sku: "SHOE-9", accountId: FLIPKART, channel: "Flipkart", marketplace: "flipkart", currentPriceMinor: 159900, unitCostMinor: null, feesMinor: null, marginBps: null, belowTarget: null, proposalState: "none", proposalId: null, proposedPriceMinor: null }),
  ]));
  api.proposals.mockResolvedValue(proposalsPage([proposal()]));
  api.policies.mockResolvedValue([]);
  api.competitors.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 });
  api.history.mockResolvedValue({ items: [], nextBefore: null });
});

describe("Pricing overview tab (real data)", () => {
  it("shows the pulse bar from the real margin totals and the overview counts", async () => {
    renderOverviewPage();
    expect(await screen.findByText("Products in view")).toBeInTheDocument();
    expect(screen.getByText("5 product-channel prices")).toBeInTheDocument();
    expect(screen.getAllByText("29.88%").length).toBeGreaterThan(0);
    expect(screen.getByText(/2 without a cost price left out/)).toBeInTheDocument();
    expect(screen.getAllByText(/Target ≥ 35%/).length).toBeGreaterThan(0);
    expect(screen.getByText("Updates applied").parentElement).toHaveTextContent("4");
    expect(screen.getByText("Pricing opportunities", { selector: "span" }).parentElement).toHaveTextContent("2");
    // nothing invented
    expect(screen.queryByText(/Illustrative/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Home Storage Set")).not.toBeInTheDocument();
    expect(screen.getByText(/Based on your costs and channel fees/)).toBeInTheDocument();
  });

  it("lists the pending proposals as opportunities with real margins and the reason", async () => {
    renderOverviewPage();
    const card = (await screen.findByRole("heading", { name: "Pricing opportunities" })).closest("div.rounded-xl") as HTMLElement;
    expect(await within(card).findByText("Cotton Kurta")).toBeInTheDocument();
    expect(within(card).getByText("₹499 → ₹546")).toBeInTheDocument();
    expect(within(card).getByText("29.88% → 35%")).toBeInTheDocument();
    expect(within(card).getByText("Current margin is 29.88%, below the 35% target.")).toBeInTheDocument();
    expect(api.proposals.mock.calls[0][0]).toMatchObject({ tab: "pending_review", sort: "impact" });
  });

  it("shows a dash when a proposal has no known margin", async () => {
    api.proposals.mockResolvedValue(proposalsPage([proposal({ currentMarginBps: null, proposedMarginBps: null, reasonText: "A competitor sells at Rs 450.00." })]));
    renderOverviewPage();
    expect(await screen.findByText("— → —")).toBeInTheDocument();
  });

  it("says what is true in the intelligence card", async () => {
    renderOverviewPage();
    expect(await screen.findByText("2 channel prices fall below the 35% margin target.")).toBeInTheDocument();
    expect(screen.getByText(/2 prices have no cost price/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review price proposals" })).toBeInTheDocument();
  });

  it("renders the price table from the server with dashes for unknown cost, and filters on the server", async () => {
    const user = userEvent.setup();
    renderOverviewPage();
    expect(await screen.findByText("Product & channel pricing")).toBeInTheDocument();
    const kurta = (await screen.findAllByText("KURTA-M")).map((e) => e.closest("tr")).find(Boolean) as HTMLElement;
    expect(within(kurta).getByText("₹300")).toBeInTheDocument();
    expect(within(kurta).getByText("₹49.90")).toBeInTheDocument();
    expect(within(kurta).getByText("29.88%")).toHaveClass("text-amber-600");
    expect(within(kurta).getByText(/Proposed · ₹546/)).toBeInTheDocument();
    const shoes = screen.getByText("SHOE-9").closest("tr") as HTMLElement;
    expect(within(shoes).getAllByText("—")).toHaveLength(2);
    expect(within(shoes).getByRole("link", { name: "Set cost" })).toBeInTheDocument();
    expect(within(shoes).getByText("No proposal")).toBeInTheDocument();
    expect(api.priceTable.mock.calls[0][0]).toMatchObject({ sort: "product", page: 1, pageSize: 10 });

    await user.click(screen.getByRole("button", { name: /Below target/ }));
    await waitFor(() => expect(api.priceTable.mock.calls.at(-1)?.[0]).toMatchObject({ state: "below_target", page: 1 }));
    await user.click(screen.getByRole("button", { name: /With proposals/ }));
    await waitFor(() => expect(api.priceTable.mock.calls.at(-1)?.[0]).toMatchObject({ state: "proposed" }));

    await user.type(screen.getByLabelText("Search product or SKU"), "shoe");
    await waitFor(() => expect(api.priceTable.mock.calls.at(-1)?.[0]).toMatchObject({ q: "shoe" }));
    await user.selectOptions(screen.getByLabelText("Channel"), FLIPKART);
    await waitFor(() => expect(api.priceTable.mock.calls.at(-1)?.[0]).toMatchObject({ accountId: FLIPKART }));
    await user.click(screen.getByRole("button", { name: "Sort by margin" }));
    await waitFor(() => expect(api.priceTable.mock.calls.at(-1)?.[0]).toMatchObject({ sort: "margin_asc" }));
  });

  it("opens the proposals tab for a proposed price and for a channel's margin row", async () => {
    const user = userEvent.setup();
    renderOverviewPage();
    const kurta = (await screen.findAllByText("KURTA-M")).map((e) => e.closest("tr")).find(Boolean) as HTMLElement;
    await user.click(kurta);
    await waitFor(() => expect(loc().searchParams.get("view")).toBe("proposals"));
    expect(loc().searchParams.get("q")).toBe("KURTA-M");
    expect(loc().searchParams.get("account")).toBe(AMAZON);
  });

  it("shows the real fee terms and sends a channel with missing costs to the products", async () => {
    const user = userEvent.setup();
    renderOverviewPage();
    expect(await screen.findByText("Margin context")).toBeInTheDocument();
    expect(screen.getByText("10% commission")).toBeInTheDocument();
    expect(screen.getByText("fees not configured")).toBeInTheDocument();
    expect(screen.getByText("2 prices · 2 without a cost price")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Review proposals/ }));
    await waitFor(() => expect(loc().searchParams.get("view")).toBe("proposals"));
    expect(loc().searchParams.get("account")).toBe(AMAZON);
  });

  it("sends a channel without costs to the first product missing a cost price", async () => {
    const user = userEvent.setup();
    api.priceTable.mockImplementation(async (q: { state?: string }) =>
      q.state === "unknown_cost" ? tablePage([row({ productId: "prod2", unitCostMinor: null })]) : tablePage([row()])
    );
    renderOverviewPage();
    await user.click(await screen.findByRole("button", { name: /Review costs/ }));
    await waitFor(() => expect(loc().pathname).toBe("/products/prod2/variants"));
    expect(api.priceTable.mock.calls.some((c) => c[0].state === "unknown_cost" && c[0].accountId === FLIPKART)).toBe(true);
  });

  it("links the cost cell to the product's variants, and a channel without fees to the Marketplace hub", async () => {
    const user = userEvent.setup();
    const m = marginData();
    m.channels[1] = { ...m.channels[1], unknownCostCount: 0, pricedWithCostCount: 2, avgMarginBps: 3000, nextAction: "fees" };
    api.marginOverview.mockResolvedValue(m);
    renderOverviewPage();
    const shoes = (await screen.findByText("SHOE-9")).closest("tr") as HTMLElement;
    expect(within(shoes).getByRole("link", { name: "Set cost" })).toHaveAttribute("href", "/products/prod2/variants");
    await user.click(screen.getByRole("button", { name: /Set channel fees/ }));
    await waitFor(() => expect(loc().pathname).toBe("/marketplace-hub"));
  });

  it("offers the Marketplace hub when no channel is connected", async () => {
    api.marginOverview.mockResolvedValue({ channels: [], totals: { productsInView: 0, productChannelPrices: 0, avgMarginBps: null, belowTargetCount: 0, unknownCostCount: 0, withProposalCount: 0, targetMarginBps: null } });
    renderOverviewPage();
    expect(await screen.findByText("No sales channels connected yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Marketplace hub" })).toHaveAttribute("href", "/marketplace-hub");
  });

  it("shows an error with a retry that reloads", async () => {
    const user = userEvent.setup();
    api.marginOverview.mockRejectedValueOnce(new Error("boom"));
    renderOverviewPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be loaded/i);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Products in view")).toBeInTheDocument();
    expect(api.marginOverview).toHaveBeenCalledTimes(2);
  });

  it("shows empty states for no proposals and no priced listings", async () => {
    api.proposals.mockResolvedValue(proposalsPage([]));
    api.priceTable.mockResolvedValue(tablePage([]));
    renderOverviewPage();
    expect(await screen.findByText(/No price proposals are waiting for review/)).toBeInTheDocument();
    expect(await screen.findByText(/No listings with a price yet/)).toBeInTheDocument();
  });

  it("lets a viewer read the overview", async () => {
    useWorkspaceStore.setState({ permissions: ["pricing:read"] });
    renderOverviewPage();
    expect(await screen.findByText("Products in view")).toBeInTheDocument();
    expect(screen.getByText("Product & channel pricing")).toBeInTheDocument();
  });
});
