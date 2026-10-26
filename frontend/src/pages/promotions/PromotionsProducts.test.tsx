import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { CandidatesPage, CandidatesQuery, PromotionCandidate } from "@/types/promotions";

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  campaigns: vi.fn(),
  products: vi.fn(),
  campaign: vi.fn(),
  campaignProducts: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  lifecycle: vi.fn(),
  duplicate: vi.fn(),
  evaluate: vi.fn(),
  setProducts: vi.fn(),
  removeProducts: vi.fn(),
  process: vi.fn(),
  accounts: vi.fn(),
  candidates: vi.fn(),
  categories: vi.fn(),
  variants: vi.fn(),
}));
vi.mock("@/api/promotions.api", () => ({ promotionsApi: api }));
vi.mock("@/components/promotions/CampaignDrawer", () => ({ CampaignDrawer: () => null }));
vi.mock("@/lib/session", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/session")>()), refreshShell: vi.fn(() => Promise.resolve()) }));
const saved = vi.hoisted(() => ({ blobs: [] as Array<{ blob: Blob; name: string }> }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob: (blob: Blob, name: string) => saved.blobs.push({ blob, name }) }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

import PromotionsPage from "./PromotionsPage";

const AMAZON = "22222222-2222-4222-8222-222222222222";
const SHOP = "55555555-5555-4555-8555-555555555555";
const C1 = "33333333-3333-4333-8333-333333333333";
const THRESHOLDS = { highMarginBps: 3000, strongSellerUnits30d: 50, highInventoryUnits: 30, minHealthyMarginBps: 1500, endingSoonHours: 72 };

const cand = (n: number, over: Partial<PromotionCandidate> = {}): PromotionCandidate => ({
  variantId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  productId: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  productName: `Product ${n}`,
  sku: `SKU-${n}`,
  accountId: AMAZON,
  marketplace: "amazon_in",
  channel: "Main store",
  canPushPrices: true,
  regularPriceMinor: 49_900,
  unitCostMinor: 30_000,
  feesMinor: 4_990,
  marginBps: 2988,
  targetMarginBps: null,
  minPromoPriceMinor: null,
  maxDiscountBps: null,
  availableStock: 40,
  lowStock: false,
  unitsSold30d: 3,
  salesVelocity: 0.1,
  recommendedAction: "hold",
  recommendationReasons: [],
  existingCampaign: null,
  conflicts: [],
  pendingProposal: null,
  eligibility: "eligible",
  eligibilityReason: null,
  promotionStatus: "not_selected",
  ...over,
});

const page = (items: PromotionCandidate[], over: Partial<CandidatesPage> = {}): CandidatesPage => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  pages: 1,
  counts: { all: items.length, recommended: 1, review: 1, not_selected: Math.max(0, items.length - 2), connector_unavailable: 0 },
  summary: { recommendedProducts: 6, listedProducts: 40, unlistedVariants: 3, placements: items.length },
  thresholds: THRESHOLDS,
  ...over,
});

const overview = () => ({
  currency: "INR", activeCampaigns: 0, scheduledCampaigns: 0, draftCampaigns: 0, endedCampaigns: 0, revenueMinor: 0, spendMinor: 0, budgetMinor: 0, budgetUsedBps: null, unitsMoved: 0, velocityLiftBps: null, velocityCampaigns: 0,
  statsUpdatedAt: null, productsOnPromotion: 0, liveProducts: 0, eligibleProducts: 0, conflictItems: 0, belowMarginTargetItems: null, endingSoonCampaigns: 0, nextEndsAt: null, resultsCampaigns: 0, opportunities: 0, listedProducts: 0,
  unlistedVariants: 0, connectorLimitations: 0, contributionMinor: null, contributionBps: null, contributionBasis: null, channels: [], pressure: { strongCandidate: null, reviewFirst: null }, recentActivity: [], thresholds: THRESHOLDS,
});

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/promotions?view=products") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <PromotionsPage />
                <Probe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const grant = (...permissions: string[]) => useWorkspaceStore.setState({ permissions });
const loc = () => screen.getByTestId("loc").textContent ?? "";
const lastQuery = (): CandidatesQuery => api.candidates.mock.calls.at(-1)![0] as CandidatesQuery;
const rowOf = (text: string) => screen.getByText(text).closest("tr") as HTMLElement;

const MIXED = [
  cand(1, { promotionStatus: "recommended", recommendedAction: "promote", recommendationReasons: [{ key: "slow_sales", text: "Only 0.1 units a day with 40 in stock." }], marginBps: 2500, targetMarginBps: 3000, maxDiscountBps: 650, unitsSold30d: 2 }),
  cand(2, { unitCostMinor: null, marginBps: null, feesMinor: null, eligibility: "verification_required", eligibilityReason: "No cost price: the margin under a promotion cannot be checked", promotionStatus: "review" }),
  cand(3, { availableStock: 2, lowStock: true, eligibility: "low_inventory", eligibilityReason: "Stock is low or the product is sold out: a promotion would raise the stock-out risk", promotionStatus: "review" }),
  cand(4, {
    existingCampaign: { id: C1, name: "Festive Flash", status: "active", endsAt: null },
    conflicts: [{ kind: "other_campaign", message: "Festive Flash (active) already covers it on this channel" }, { kind: "pending_price_proposal", message: "A price change is waiting for review in Pricing" }],
    pendingProposal: { id: "p1", proposedPriceMinor: 45_000 },
    eligibility: "conflict",
    eligibilityReason: "Festive Flash (active) already covers it on this channel",
    promotionStatus: "review",
  }),
  cand(5, { accountId: SHOP, marketplace: "shopify", channel: "Web shop", canPushPrices: false, eligibility: "not_provided", eligibilityReason: "This marketplace connection cannot take price changes, so a promotion cannot be applied automatically", promotionStatus: "connector_unavailable" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  saved.blobs.length = 0;
  useToastStore.setState({ toasts: [] });
  grant("promotions:read", "promotions:write");
  api.overview.mockResolvedValue(overview());
  api.campaigns.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, pages: 1, counts: { all: 0, draft: 0, scheduled: 0, active: 0, ended: 0, cancelled: 0 } });
  api.products.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, pages: 1, counts: { all: 0, eligible: 0, pending_sync: 0, live: 0, ineligible: 0, ended: 0 } });
  api.campaign.mockResolvedValue({});
  api.accounts.mockResolvedValue([
    { id: AMAZON, marketplace: "amazon_in", displayName: "Main store", status: "active" },
    { id: SHOP, marketplace: "shopify", displayName: "Web shop", status: "active" },
  ]);
  api.categories.mockResolvedValue([]);
  api.variants.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  api.candidates.mockResolvedValue(page(MIXED));
});

describe("Products tab", () => {
  it("asks the server for exactly what the URL says", async () => {
    renderPage("/promotions?view=products&seg=all&quick=high_margin&market=amazon_in&sort=margin&q=bag&size=50&page=2&status=review");
    await waitFor(() => expect(api.candidates).toHaveBeenCalled());
    expect(lastQuery()).toMatchObject({ segment: "all", quick: "high_margin", marketplace: "amazon_in", sort: "margin", q: "bag", pageSize: 50, page: 2, status: "review" });
  });

  it("defaults to the recommended segment, and the custom segment asks the server for nothing", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Product 1");
    expect(lastQuery()).toMatchObject({ segment: "recommended", page: 1, pageSize: 25 });
    expect(lastQuery().quick).toBeUndefined();
    await user.click(screen.getByRole("button", { name: /^Custom/ }));
    expect(loc()).toContain("seg=custom");
    expect(screen.getByText(/No products selected yet/)).toBeInTheDocument();
  });

  it("keeps filters, sort, segment and search in the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Product 1");
    await user.click(screen.getByRole("button", { name: /High margin/ }));
    expect(loc()).toContain("quick=high_margin");
    await waitFor(() => expect(lastQuery()).toMatchObject({ quick: "high_margin" }));
    await user.click(screen.getByRole("button", { name: /^All Matching/ }));
    expect(loc()).toContain("seg=all");
    await user.selectOptions(screen.getByLabelText("Marketplace"), "shopify");
    expect(loc()).toContain("market=shopify");
    await user.selectOptions(screen.getByLabelText("Sort by"), "margin");
    expect(loc()).toContain("sort=margin");
    await user.selectOptions(screen.getByLabelText("Status"), "review");
    expect(loc()).toContain("status=review");
    await user.type(screen.getByLabelText("Search products"), "SKU-2");
    await waitFor(() => expect(loc()).toContain("q=SKU-2"));
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: "SKU-2", segment: "all", marketplace: "shopify", sort: "margin", status: "review", quick: "high_margin" }));
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    await waitFor(() => expect(loc()).not.toContain("q=SKU-2"));
    expect(loc()).not.toContain("quick=");
  });

  it("takes the marketplaces from the connected accounts and the thresholds from the server", async () => {
    renderPage();
    await screen.findByText("Product 1");
    const options = within(screen.getByLabelText("Marketplace")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["All Marketplaces", "Amazon In", "Shopify"]);
    expect(screen.getByRole("button", { name: "High margin (30% or more)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Strong sellers (50+ in 30 days)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "High inventory (30+ available)" })).toBeInTheDocument();
  });

  it("shows the real counts: KPI strip, segment counts and banner", async () => {
    renderPage();
    await screen.findByText("Product 1");
    expect(screen.getByText("recommended products").previousSibling).toHaveTextContent("6");
    expect(screen.getByText("total products").previousSibling).toHaveTextContent("40");
    expect(screen.getByText("products selected").previousSibling).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: /Recommended/ })).toHaveTextContent("2"); // recommended + review
    expect(screen.getByRole("button", { name: /^All Matching/ })).toHaveTextContent("5");
    expect(screen.getByText(/6 products are recommended/)).toBeInTheDocument();
    expect(screen.getByText(/3 active variants have no active listing and are not shown/)).toBeInTheDocument();
    expect(screen.queryByText(/illustrative/i)).not.toBeInTheDocument();
    expect(screen.queryByText("1,248")).not.toBeInTheDocument();
  });

  it("shows each row's real numbers and says what is unknown", async () => {
    renderPage();
    await screen.findByText("Product 1");
    const r1 = within(rowOf("Product 1"));
    expect(r1.getByText("₹499")).toBeInTheDocument();
    expect(r1.getByText("Only 0.1 units a day with 40 in stock.")).toBeInTheDocument();
    expect(r1.getByText("2 units")).toBeInTheDocument();
    expect(r1.getByText("25%")).toBeInTheDocument();
    expect(r1.getByText(/Target 30%/)).toBeInTheDocument();
    expect(r1.getByText(/below target/)).toBeInTheDocument();
    expect(r1.getByText("Up to 6.5% off keeps the target")).toBeInTheDocument();
    expect(r1.getByText("● Recommended")).toBeInTheDocument();
    expect(r1.getByText("● Eligible")).toBeInTheDocument();

    const r2 = within(rowOf("Product 2"));
    expect(r2.getByText("cost not set").previousSibling).toHaveTextContent("—");
    expect(r2.getByText("fees not configured")).toBeInTheDocument();
    expect(r2.getByText("● Cost price needed")).toBeInTheDocument();
    expect(r2.getByText("No cost price: the margin under a promotion cannot be checked")).toBeInTheDocument();

    const r3 = within(rowOf("Product 3"));
    expect(r3.getByText("Low stock")).toBeInTheDocument();
    expect(r3.getByText("● Low inventory")).toBeInTheDocument();

    const r5 = within(rowOf("Product 5"));
    expect(r5.getByText("Cannot take price changes")).toBeInTheDocument();
    expect(r5.getByText("● Not provided")).toBeInTheDocument();
    expect(r5.getByText("● Connector unavail.")).toBeInTheDocument();
    expect(r5.queryByRole("button", { name: /Review/ })).not.toBeInTheDocument();
    expect(r5.getByText("Shopify")).toBeInTheDocument();
  });

  it("links an existing campaign to its drawer and a pending price change to Pricing", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Product 4");
    const r4 = within(rowOf("Product 4"));
    expect(r4.getByText("Festive Flash (active) already covers it on this channel")).toBeInTheDocument();
    const link = r4.getByRole("link", { name: "Price change waiting in Pricing" });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("/pricing?view=proposals");
    expect(href).toContain("q=SKU-4");
    expect(href).toContain(`account=${AMAZON}`);
    await user.click(r4.getByRole("button", { name: /Festive Flash/ }));
    expect(loc()).toContain(`open=${C1}`);
  });

  it("pages on the server and shows a real pager", async () => {
    const user = userEvent.setup();
    api.candidates.mockImplementation(async (q: CandidatesQuery) => page(q.page === 1 ? [cand(1), cand(2)] : [cand(3)], { page: q.page, total: 3, pages: 2, pageSize: q.pageSize }));
    renderPage();
    await screen.findByText("Product 1");
    expect(screen.getByText(/Showing 1–2 of 3 products/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(loc()).toContain("page=2");
    expect(await screen.findByText("Product 3")).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ page: 2 });
    await user.selectOptions(screen.getByLabelText("Rows per page"), "50");
    expect(loc()).toContain("size=50");
    expect(loc()).not.toContain("page=2");
  });

  it("keeps the selection across pages, with select-all on the page and the Custom segment showing it", async () => {
    const user = userEvent.setup();
    api.candidates.mockImplementation(async (q: CandidatesQuery) => page(q.page === 1 ? [cand(1), cand(2)] : [cand(3)], { page: q.page, total: 3, pages: 2, pageSize: q.pageSize }));
    renderPage();
    await screen.findByText("Product 1");
    await user.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    expect(screen.getByText("products selected").previousSibling).toHaveTextContent("2");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Product 3");
    expect(screen.getByRole("checkbox", { name: "Select all on this page" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Select Product 3 on Main store" }));
    expect(screen.getByText("products selected").previousSibling).toHaveTextContent("3");
    await user.click(screen.getByRole("button", { name: /^Custom/ }));
    for (const n of ["Product 1", "Product 2", "Product 3"]) expect(await screen.findByText(n)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Select Product 2 on Main store" }));
    expect(screen.getByText("products selected").previousSibling).toHaveTextContent("2");
    expect(screen.queryByText("Product 2")).not.toBeInTheDocument();
  });

  it("opens the Create Campaign dialog with the real products, prices, channel and a margin-safe discount", async () => {
    const user = userEvent.setup();
    api.candidates.mockResolvedValue(page([cand(1, { maxDiscountBps: 1411, regularPriceMinor: 49_900 }), cand(2, { maxDiscountBps: 650, regularPriceMinor: 19_900 })]));
    renderPage();
    await screen.findByText("Product 1");
    await user.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    await user.click(screen.getByRole("button", { name: /Create Campaign \(2\)/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("SKU-1 · ₹499")).toBeInTheDocument();
    expect(within(dialog).getByText("SKU-2 · ₹199")).toBeInTheDocument();
    expect((within(dialog).getByLabelText(/Sales channel/) as HTMLSelectElement).value).toBe(AMAZON);
    // 10% is the starting point; the thinnest product allows 6.5%, so 6% (whole percent, rounded down)
    expect((within(dialog).getByLabelText(/Proposed discount/) as HTMLInputElement).value).toBe("6");
  });

  it("asks which marketplace when the selection spans several, then prefills that one", async () => {
    const user = userEvent.setup();
    api.candidates.mockResolvedValue(page([cand(1), cand(2), cand(3, { accountId: SHOP, marketplace: "shopify", channel: "Web shop" })]));
    renderPage();
    await screen.findByText("Product 1");
    await user.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    await user.click(screen.getByRole("button", { name: /Create Campaign \(3\)/ }));
    const chooser = await screen.findByRole("dialog");
    expect(within(chooser).getByText("Which marketplace is this campaign for?")).toBeInTheDocument();
    await user.click(within(chooser).getByRole("button", { name: /Web shop/ }));
    const dialog = await screen.findByText("Create Campaign", { selector: "h2" }).then(() => screen.getByRole("dialog"));
    expect(within(dialog).getByText("SKU-3 · ₹499")).toBeInTheDocument();
    expect(within(dialog).queryByText(/SKU-1/)).not.toBeInTheDocument();
    expect((within(dialog).getByLabelText(/Sales channel/) as HTMLSelectElement).value).toBe(SHOP);
    expect(screen.getByText("products selected").previousSibling).toHaveTextContent("3");
  });

  it("a row's Review opens the dialog for that product only", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Product 1");
    await user.click(within(rowOf("Product 1")).getByRole("button", { name: /Review/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("SKU-1 · ₹499")).toBeInTheDocument();
    expect(within(dialog).queryByText(/SKU-2/)).not.toBeInTheDocument();
    // 6.5% allowed: 6%
    expect((within(dialog).getByLabelText(/Proposed discount/) as HTMLInputElement).value).toBe("6");
  });

  it("exports the filtered result by paging through the server, in rupees with a BOM", async () => {
    const user = userEvent.setup();
    api.candidates.mockImplementation(async (q: CandidatesQuery) => {
      const all = Array.from({ length: 150 }, (_, i) => cand(i + 1));
      const items = q.pageSize === 100 ? all.slice((q.page - 1) * 100, q.page * 100) : all.slice(0, 25);
      return page(items, { total: 150, pages: Math.ceil(150 / q.pageSize), page: q.page, pageSize: q.pageSize });
    });
    renderPage("/promotions?view=products&seg=all&quick=eligible");
    await screen.findByText("Product 1");
    await user.click(screen.getByRole("button", { name: "Export products" }));
    await waitFor(() => expect(saved.blobs).toHaveLength(1));
    expect(saved.blobs[0]!.name).toMatch(/^promotions-products-\d{4}-\d{2}-\d{2}\.csv$/);
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
      r.readAsArrayBuffer(saved.blobs[0]!.blob);
    });
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes.slice(3)).split("\r\n");
    expect(lines).toHaveLength(151);
    expect(lines[0]).toContain("Product,SKU,Marketplace,Channel,Regular price,Cost price");
    expect(lines[1]).toBe("Product 1,SKU-1,Amazon In,Main store,499.00,300.00,49.90,29.88,,,40,no,3,,,Not selected,Eligible,");
    const exportCalls = api.candidates.mock.calls.filter((c) => (c[0] as CandidatesQuery).pageSize === 100).map((c) => c[0] as CandidatesQuery);
    expect(exportCalls.map((c) => c.page)).toEqual([1, 2]);
    expect(exportCalls[0]).toMatchObject({ segment: "all", quick: "eligible" });
  });

  it("stops an export at 10,000 rows and says so", async () => {
    const user = userEvent.setup();
    api.candidates.mockImplementation(async (q: CandidatesQuery) => page(Array.from({ length: Math.min(q.pageSize, 100) }, (_, i) => cand(i + 1 + (q.page - 1) * 100)), { total: 25_000, pages: 250, page: q.page, pageSize: q.pageSize }));
    renderPage();
    await screen.findByText("Product 1");
    await user.click(screen.getByRole("button", { name: "Export products" }));
    await waitFor(() => expect(saved.blobs).toHaveLength(1), { timeout: 8000 });
    expect(useToastStore.getState().toasts.some((t) => t.title?.includes("first 10,000 rows"))).toBe(true);
    expect(api.candidates.mock.calls.filter((c) => (c[0] as CandidatesQuery).pageSize === 100).length).toBe(100);
  });

  it("is read-only for a viewer: the list and the export work, creating does not", async () => {
    grant("promotions:read");
    renderPage();
    await screen.findByText("Product 1");
    expect(screen.getByRole("button", { name: /Create Campaign/ })).toBeDisabled();
    expect(within(rowOf("Product 1")).getByRole("button", { name: /Review/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export products" })).toBeEnabled();
  });

  it("shows a loading state, an error with Retry, and the empty states", async () => {
    const user = userEvent.setup();
    api.candidates.mockRejectedValueOnce(new Error("Database unavailable"));
    const first = renderPage();
    expect(await screen.findByText("The products could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("Database unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Product 1")).toBeInTheDocument();
    first.unmount();

    api.candidates.mockResolvedValue(page([], { summary: { recommendedProducts: 0, listedProducts: 0, unlistedVariants: 4, placements: 0 } }));
    const second = renderPage();
    expect(await screen.findByText("No product is listed on a connected marketplace yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Listings" })).toHaveAttribute("href", "/listings");
    expect(screen.getByRole("link", { name: "Open Marketplace Hub" })).toHaveAttribute("href", "/marketplace-hub");
    second.unmount();

    api.candidates.mockResolvedValue(page([], { summary: { recommendedProducts: 0, listedProducts: 5, unlistedVariants: 0, placements: 5 } }));
    renderPage("/promotions?view=products&q=nothing");
    expect(await screen.findByText("No products matched the current filters.")).toBeInTheDocument();
  });
});
