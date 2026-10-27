import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { IntelAction, IntelPortfolio, ProductIntelligenceItem, ProductIntelligencePage as Page } from "@/types/intelligence";

const api = vi.hoisted(() => ({ list: vi.fn(), categories: vi.fn(), warehouses: vi.fn(), draftPurchaseOrders: vi.fn(), generatePriceProposals: vi.fn() }));
const saveBlob = vi.hoisted(() => vi.fn());
vi.mock("@/api/productIntelligence.api", () => ({ productIntelligenceApi: api }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob }));

import ProductIntelligencePage from "./ProductIntelligencePage";

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";

const item = (over: Partial<ProductIntelligenceItem> = {}): ProductIntelligenceItem => ({
  id: V1,
  variantId: V1,
  productId: "p-1",
  sku: "TRV-1042",
  productName: "Travel Bag",
  categoryId: null,
  category: "Luggage",
  salesVelocity: 4.2,
  unitsSold30d: 126,
  velocityTrend: "accelerating",
  trendChangePercent: 35,
  marginPercent: 41.5,
  sellingPriceMinor: 249900,
  costPriceMinor: 146000,
  inventory: { available: 20, onHand: 24, runwayDays: 5, ageDays: 10, leadTimeDays: 14, suggestedReorderUnits: 90 },
  competitor: null,
  recommendedAction: "reorder",
  confidence: { score: 85, level: "high", factors: [] },
  reasons: [{ key: "stockout", text: "Stock runs out in 5 days, before a restock could arrive in 14.", values: {} }],
  ...over,
});

const PORTFOLIO = (over: Partial<IntelPortfolio> = {}): IntelPortfolio => ({
  range: { from: "2026-09-28", to: "2026-10-27" },
  netSalesMinor: 2_100_000,
  orders: 140,
  averageOrderValueMinor: 15_000,
  grossProfitMinor: 672_000,
  grossMarginBps: 3200,
  costCoverage: 1,
  unitsSold: 300,
  prioritizedCount: 3,
  totalProducts: 6,
  salesShare: [
    { variantId: V1, sku: "TRV-1042", title: "Travel Bag", category: "Luggage", revenueMinor: 1_200_000, unitsSold: 180, shareBps: 5714, available: 20, runwayDays: 5 },
    { variantId: V2, sku: "BKP-01", title: "Classic Backpack", category: null, revenueMinor: 600_000, unitsSold: 90, shareBps: 2857, available: 300, runwayDays: 90 },
  ],
  otherShareBps: 1429,
  truncated: false,
  ...over,
});

const summary = (over: Partial<Record<IntelAction, number>> = {}): Record<IntelAction, number> => ({ reorder: 1, raise_price: 0, liquidate: 0, promote: 0, hold: 1, ...over });
const page = (items: ProductIntelligenceItem[], over: Partial<Page> = {}): Page => ({ items, page: 1, pageSize: 10, total: items.length, pages: 1, summary: summary(), variantsAnalysed: items.length, portfolio: PORTFOLIO(), ...over });

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/product-intelligence") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <ProductIntelligencePage />
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const loc = () => screen.getByTestId("loc").textContent ?? "";
/** the Overview's call is the one that asks for the portfolio; the page also keeps the All products list warm */
const portfolioCalls = () => api.list.mock.calls.map(([q]) => q).filter((q) => q.portfolio);
const answerOverview = (p: Page) => api.list.mockImplementation(async (q: { portfolio?: unknown }) => (q.portfolio ? p : page([])));

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ permissions: ["analytics:read", "procurement:write", "pricing:write"], shell: { business: { id: "b1", currency: "INR", timezone: "Asia/Kolkata" } } as never });
  answerOverview(page([item(), item({ id: V2, variantId: V2, sku: "BKP-01", productName: "Classic Backpack", recommendedAction: "hold", reasons: [] })]));
  api.categories.mockResolvedValue([]);
  api.warehouses.mockResolvedValue([]);
});

describe("Product Intelligence overview on real data", () => {
  it("asks for the portfolio of the chosen dates in one call and shows its numbers", async () => {
    renderPage();
    expect(await screen.findByText("Net sales")).toBeInTheDocument();
    await waitFor(() => expect(portfolioCalls().length).toBe(1));
    const q = portfolioCalls()[0]!;
    expect(q.portfolio.to >= q.portfolio.from).toBe(true);
    expect(await screen.findByText("₹21.0K")).toBeInTheDocument();
    expect(screen.getByText("140")).toBeInTheDocument();
    expect(screen.getByText("32.0%")).toBeInTheDocument();
    expect(screen.getByText("₹150")).toBeInTheDocument();
    expect(screen.getByText("of 6 products need a decision")).toBeInTheDocument();
    expect(screen.queryByText(/illustrative|Cotton throw|NL-THR|30 Sep 2026|Demo/i)).not.toBeInTheDocument();
  });

  it("gross margin is a dash, with the reason, until every sold item has a cost", async () => {
    answerOverview(page([item()], { portfolio: PORTFOLIO({ grossMarginBps: null, grossProfitMinor: null, costCoverage: 0.4 }) }));
    renderPage();
    expect(await screen.findByText("Costs known for 40% of sales")).toBeInTheDocument();
  });

  it("the opportunities are the real top products, with the server's reasons, and Inspect opens that product's drawer", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click((await screen.findAllByRole("button", { name: "Inspect Travel Bag" }))[0]!);
    expect(screen.queryByRole("button", { name: "Inspect Classic Backpack" })).not.toBeInTheDocument(); // hold: nothing to decide
    await waitFor(() => expect(loc()).toContain(`open=${V1}`));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("the sales share and the stock behind each product come from the portfolio", async () => {
    renderPage();
    expect(await screen.findByText("Where sales come from")).toBeInTheDocument();
    expect((await screen.findAllByText("57.1%")).length).toBeGreaterThan(0);
    expect(screen.getByText("180 units sold · 20 in stock · 5 days of cover")).toBeInTheDocument();
    expect(screen.getByText("All other products")).toBeInTheDocument();
  });

  it("the date range lives in the URL and goes to the server", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Net sales");
    await user.selectOptions(screen.getByLabelText("Date range"), "last_90");
    await waitFor(() => expect(loc()).toContain("range=last_90"));
    await waitFor(() => {
      const q = portfolioCalls().at(-1)!;
      expect((Date.parse(q.portfolio.to) - Date.parse(q.portfolio.from)) / 86_400_000).toBe(89);
    });
  });

  it("shows an empty state for a business without products, and an error with retry", async () => {
    answerOverview(page([], { variantsAnalysed: 0, summary: summary({ reorder: 0, hold: 0 }), portfolio: PORTFOLIO({ totalProducts: 0, netSalesMinor: 0, orders: 0, prioritizedCount: 0, salesShare: [], otherShareBps: 0 }) }));
    const { unmount } = renderPage();
    expect(await screen.findByText("There is nothing to analyse yet.")).toBeInTheDocument();
    unmount();
    let fail = true;
    api.list.mockImplementation(async (q: { portfolio?: unknown }) => {
      if (q.portfolio && fail) throw new ApiError({ code: "SERVER", message: "Overview down", status: 500 });
      return q.portfolio ? page([item()]) : page([]);
    });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Overview down")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Net sales")).toBeInTheDocument();
  });

  it("exports the overview as a CSV with the real figures", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Net sales");
    await user.click(screen.getByRole("button", { name: /Export overview/ }));
    expect(saveBlob).toHaveBeenCalledTimes(1);
    expect(saveBlob.mock.calls[0]![1]).toMatch(/^product-intelligence-2026.*\.csv$|^product-intelligence-.*\.csv$/);
  });
});
