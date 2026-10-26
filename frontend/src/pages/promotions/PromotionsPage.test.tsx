import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { CampaignsPage, CandidatesPage, ProductsPage, PromotionCampaignDetail, PromotionCampaignRow, PromotionCandidate, PromotionOverview, PromotionProduct } from "@/types/promotions";

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


vi.mock("@/lib/session", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/session")>()), refreshShell: vi.fn(() => Promise.resolve()) }));

const saved = vi.hoisted(() => ({ blobs: [] as Array<{ blob: Blob; name: string }> }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob: (blob: Blob, name: string) => saved.blobs.push({ blob, name }) }));

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

import PromotionsPage from "./PromotionsPage";

const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const C1 = "33333333-3333-4333-8333-333333333333";
const C2 = "44444444-4444-4444-8444-444444444444";

const campaign = (over: Partial<PromotionCampaignRow> = {}): PromotionCampaignRow => ({
  id: C1,
  name: "Festive Flash",
  code: "DIWALI25",
  description: null,
  type: "percentage_discount",
  valueBps: 2000,
  valueMinor: null,
  buyQuantity: null,
  getQuantity: null,
  minOrderMinor: 0,
  budgetMinor: 15000000,
  currency: "INR",
  status: "draft",
  startsAt: "2026-10-25T04:30:00.000Z",
  endsAt: "2026-11-05T16:30:00.000Z",
  accountIds: [],
  channels: [{ accountId: ACCOUNT, marketplace: "amazon_in", displayName: "Main store", canPushPrices: true }],
  spendMinor: 0,
  revenueMinor: 0,
  unitsMoved: 0,
  ordersCount: 0,
  budgetUsedBps: null,
  statsUpdatedAt: null,
  itemCounts: { total: 2, eligible: 1, pending_sync: 0, live: 0, ineligible: 1, ended: 0 },
  endReason: null,
  horizon: "next",
  endingSoon: false,
  endsInHours: null,
  capability: "supported",
  avgDiscountBps: 2000,
  contributionMinor: null,
  contributionBps: null,
  contributionBasis: null,
  marginRisk: null,
  version: 4,
  createdAt: "2026-10-20T08:00:00.000Z",
  updatedAt: "2026-10-21T08:00:00.000Z",
  ...over,
});

const ACTIVE = campaign({
  id: C2,
  name: "Weekend Luggage Sale",
  code: "WEEKENDTRV",
  type: "flat_discount",
  valueBps: null,
  valueMinor: 50000,
  status: "active",
  budgetMinor: 8000000,
  spendMinor: 4250000,
  revenueMinor: 21540000,
  unitsMoved: 88,
  ordersCount: 76,
  budgetUsedBps: 5313,
  itemCounts: { total: 1, eligible: 0, pending_sync: 0, live: 1, ineligible: 0, ended: 0 },
  version: 2,
});

const detail = (c: PromotionCampaignRow): PromotionCampaignDetail => ({
  ...c,
  velocity: { liftBps: 1840, promoUnits: 88, promoDays: 3, baselineUnits: 20, baselineDays: 14 },
});

const overview = (over: Partial<PromotionOverview> = {}): PromotionOverview => ({
  currency: "INR",
  activeCampaigns: 1,
  scheduledCampaigns: 2,
  draftCampaigns: 3,
  endedCampaigns: 4,
  revenueMinor: 21540000,
  spendMinor: 4250000,
  budgetMinor: 23000000,
  budgetUsedBps: 1848,
  unitsMoved: 88,
  velocityLiftBps: 1840,
  velocityCampaigns: 1,
  statsUpdatedAt: "2026-10-20T10:00:00.000Z",
  productsOnPromotion: 7,
  liveProducts: 5,
  eligibleProducts: 9,
  conflictItems: 2,
  belowMarginTargetItems: 3,
  endingSoonCampaigns: 1,
  nextEndsAt: "2026-10-27T10:00:00.000Z",
  resultsCampaigns: 4,
  opportunities: 6,
  listedProducts: 40,
  unlistedVariants: 5,
  connectorLimitations: 1,
  contributionMinor: 4742400,
  contributionBps: 1485,
  contributionBasis: "after_cost_and_fees",
  channels: [
    { accountId: ACCOUNT, marketplace: "amazon_in", displayName: "Main store", status: "active", canPushPrices: true, capability: "supported", activeCampaigns: 1, scheduledCampaigns: 0, liveProducts: 5, listedProducts: 30, opportunities: 4 },
    { accountId: "55555555-5555-4555-8555-555555555555", marketplace: "shopify", displayName: "Web shop", status: "active", canPushPrices: false, capability: "not_supported", activeCampaigns: 0, scheduledCampaigns: 0, liveProducts: 0, listedProducts: 10, opportunities: 2 },
  ],
  pressure: {
    strongCandidate: { variantId: "v1", productName: "Premium Travel Bag", sku: "TRV-1042-BLK", accountId: ACCOUNT, channel: "Main store", availableStock: 80, marginBps: 4992, unitsSold30d: 60, eligibility: "eligible", reasons: [] },
    reviewFirst: { variantId: "v2", productName: "Canvas Duffel", sku: "CD-1", accountId: ACCOUNT, channel: "Main store", availableStock: 2, marginBps: 3990, unitsSold30d: 10, eligibility: "low_inventory", reasons: [] },
  },
  recentActivity: [
    { id: 2, action: "promotion.activated", createdAt: "2026-10-23T11:00:00.000Z", campaignId: C2, campaignName: "Weekend Luggage Sale" },
    { id: 1, action: "promotion.created", createdAt: "2026-10-23T10:00:00.000Z", campaignId: C2, campaignName: "Weekend Luggage Sale" },
  ],
  thresholds: { highMarginBps: 3000, strongSellerUnits30d: 50, highInventoryUnits: 30, minHealthyMarginBps: 1500, endingSoonHours: 72 },
  ...over,
});

const candidate = (over: Partial<PromotionCandidate> = {}): PromotionCandidate => ({
  variantId: "v1",
  productId: "p1",
  productName: "Premium Travel Bag",
  sku: "TRV-1042-BLK",
  accountId: ACCOUNT,
  marketplace: "amazon_in",
  channel: "Main store",
  canPushPrices: true,
  regularPriceMinor: 249900,
  unitCostMinor: 150000,
  feesMinor: 24990,
  marginBps: 2500,
  targetMarginBps: null,
  minPromoPriceMinor: null,
  maxDiscountBps: null,
  availableStock: 30,
  lowStock: false,
  unitsSold30d: 2,
  salesVelocity: 0.07,
  recommendedAction: "promote",
  recommendationReasons: [{ key: "slow_sales", text: "Only 0.07 units a day with 30 in stock." }],
  existingCampaign: null,
  conflicts: [],
  pendingProposal: null,
  eligibility: "eligible",
  eligibilityReason: null,
  promotionStatus: "recommended",
  ...over,
});

const candidatesPage = (items: PromotionCandidate[]): CandidatesPage => ({
  items,
  page: 1,
  pageSize: 5,
  total: items.length,
  pages: 1,
  counts: { all: items.length, recommended: items.length, review: 0, not_selected: 0, connector_unavailable: 0 },
  summary: { recommendedProducts: items.length, listedProducts: 40, unlistedVariants: 5, placements: items.length },
  thresholds: overview().thresholds,
});

const campaignsPage = (items: PromotionCampaignRow[], over: Partial<CampaignsPage> = {}): CampaignsPage => ({
  items,
  horizonCounts: { past: 0, now: items.length, next: 0 },
  page: 1,
  pageSize: 25,
  total: items.length,
  pages: 1,
  counts: { all: items.length, draft: 1, scheduled: 0, active: 1, ended: 0, cancelled: 0 },
  ...over,
});

const product = (over: Partial<PromotionProduct> = {}): PromotionProduct => ({
  id: "i1",
  campaignId: C2,
  campaignName: "Weekend Luggage Sale",
  campaignCode: "WEEKENDTRV",
  campaignStatus: "active",
  variantId: "v1",
  productId: "p1",
  productName: "Premium Travel Bag",
  sku: "TRV-1042-BLK",
  originalPriceMinor: 249900,
  promoPriceMinor: 199900,
  discountBps: 2001,
  status: "live",
  reason: null,
  lastSyncedAt: null,
  channels: [{ accountId: ACCOUNT, marketplace: "amazon_in", displayName: "Main store", canPushPrices: true }],
  ...over,
});

const productsPage = (items: PromotionProduct[]): ProductsPage => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  pages: 1,
  counts: { all: items.length, eligible: 0, pending_sync: 0, live: 1, ineligible: 1, ended: 0 },
});

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/promotions") {
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

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("promotions:read", "promotions:write");
  api.overview.mockResolvedValue(overview());
  api.campaigns.mockResolvedValue(campaignsPage([campaign(), ACTIVE]));
  api.products.mockResolvedValue(productsPage([product(), product({ id: "i2", variantId: "v2", sku: "OS-2048", productName: "Cotton Overshirt", status: "ineligible", reason: "Main store: no active listing on this account", campaignStatus: "draft" })]));
  api.campaign.mockImplementation(async (id: string) => detail(id === C2 ? ACTIVE : campaign()));
  api.campaignProducts.mockResolvedValue(productsPage([product({ campaignId: C1, status: "eligible" })]));
  api.accounts.mockResolvedValue([{ id: ACCOUNT, marketplace: "amazon_in", displayName: "Main store", status: "active" }]);
  api.candidates.mockResolvedValue(candidatesPage([candidate(), candidate({ variantId: "v3", productName: "Linen Shirt", sku: "LS-9", marketplace: "shopify", channel: "Web shop", canPushPrices: false, promotionStatus: "connector_unavailable", eligibility: "not_provided", recommendationReasons: [], eligibilityReason: "This marketplace connection cannot take price changes" })]));
  api.categories.mockResolvedValue([]);
  api.variants.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
});

describe("PromotionsPage - Connected Screens", () => {
  it("shows the real numbers in the header and the Overview, and nothing invented", async () => {
    renderPage("/promotions");
    expect(await screen.findByText("Promotion pulse")).toBeInTheDocument();
    expect(screen.getByText("1 active campaign · 9 eligible products · 6 opportunities · 1 connector limitation")).toBeInTheDocument();
    const pulse = within(screen.getByLabelText("Promotion pulse"));
    expect(pulse.getByText("Opportunities").previousSibling).toHaveTextContent("6");
    expect(pulse.getByText("Eligible products").previousSibling).toHaveTextContent("9");
    expect(pulse.getByText("Results").previousSibling).toHaveTextContent("4");
    expect(pulse.getByText("Channel ready").previousSibling).toHaveTextContent("1");

    const results = within(screen.getByLabelText("Promotion results"));
    expect(results.getByText("₹2,15,400")).toBeInTheDocument();
    expect(results.getByText("₹47,424")).toBeInTheDocument();
    expect(results.getByText(/14\.9% of revenue · After cost and marketplace fees/)).toBeInTheDocument();
    expect(results.getByText("+18% sales rate vs before")).toBeInTheDocument();
    const watch = within(screen.getByLabelText("Needs a look"));
    expect(watch.getByText(/1 campaign ends within 72 hours/)).toBeInTheDocument();
    expect(watch.getByText(/2 campaign products are blocked/)).toBeInTheDocument();
    expect(watch.getByText(/3 products in scheduled or running campaigns are below the margin target after marketplace fees/)).toBeInTheDocument();
    expect(watch.getByText(/5 active variants have no active listing/)).toBeInTheDocument();

    const opps = within(screen.getByLabelText("Promotion opportunities"));
    expect(opps.getByText("Premium Travel Bag")).toBeInTheDocument();
    expect(opps.getByText("Only 0.07 units a day with 30 in stock.")).toBeInTheDocument();
    expect(opps.getAllByText("30 units available · 25.0% margin")).toHaveLength(2);
    expect(opps.getByText("Amazon In")).toBeInTheDocument();
    expect(opps.getByText("Cannot take prices")).toBeInTheDocument();
    expect(opps.getByText("This marketplace connection cannot take price changes")).toBeInTheDocument();
    expect(screen.getByText("6 products have healthy stock and margin room, and sales that could use a push.")).toBeInTheDocument();
    expect(api.candidates).toHaveBeenCalledWith({ segment: "recommended", page: 1, pageSize: 5 }, expect.anything());

    const pressure = within(screen.getByLabelText("Promotion pressure"));
    expect(pressure.getByText("Premium Travel Bag")).toBeInTheDocument();
    expect(pressure.getByText("High demand / Low stock")).toBeInTheDocument();
    expect(pressure.getByText(/Stock: 2 · Current margin: 39\.9% · 10 sold in 30 days/)).toBeInTheDocument();

    expect(within(screen.getByLabelText("Recent promotion activity")).getByText("Weekend Luggage Sale started")).toBeInTheDocument();
    const landscape = within(screen.getByLabelText("Marketplace Promotion Landscape"));
    expect(landscape.getByText("Main store").closest("tr")).toHaveTextContent("Supported");
    expect(landscape.getByText("Web shop").closest("tr")).toHaveTextContent("Not supported");
    expect(landscape.getByText("Web shop").closest("tr")).toHaveTextContent("Prices cannot be applied automatically");
    expect(screen.queryByText(/illustrative/i)).not.toBeInTheDocument();
  });

  it("hides what the server could not compute instead of inventing it", async () => {
    api.overview.mockResolvedValue(
      overview({ pressure: { strongCandidate: null, reviewFirst: null }, contributionMinor: null, contributionBps: null, contributionBasis: null, belowMarginTargetItems: null, velocityLiftBps: null, budgetUsedBps: null, conflictItems: 0, endingSoonCampaigns: 0, nextEndsAt: null, unlistedVariants: 0, opportunities: 0, eligibleProducts: 0, connectorLimitations: 0, activeCampaigns: 0, recentActivity: [], channels: [] }),
    );
    api.candidates.mockResolvedValue(candidatesPage([]));
    renderPage("/promotions");
    expect(await screen.findByText("Promotion pulse")).toBeInTheDocument();
    expect(screen.getByText("0 active campaigns · 0 eligible products · 0 opportunities · 0 connector limitations")).toBeInTheDocument();
    expect(screen.queryByText("Promotion pressure")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Needs a look")).not.toBeInTheDocument();
    const results = within(screen.getByLabelText("Promotion results"));
    expect(results.getByText("—")).toBeInTheDocument();
    expect(results.getByText("Needs a cost price on every promoted product")).toBeInTheDocument();
    expect(screen.getAllByText("No product needs a promotion push right now.").length).toBe(2);
    expect(screen.getByText("No promotion activity yet.")).toBeInTheDocument();
    expect(screen.getByText("No marketplace accounts connected.")).toBeInTheDocument();
    for (const fake of [/Cotton Oversized/, /Leather Wallet/, /Strong recent demand/, /Illustrative/i, /Seasonal Event/, /8 products/, /Campaign reviewed on connected channels/]) expect(screen.queryByText(fake)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Review Products/ })).not.toBeInTheDocument();
  });

  it("says why a figure is missing: no cost prices, and fees counted as zero", async () => {
    api.overview.mockResolvedValue(overview({ contributionMinor: null, contributionBps: null, contributionBasis: null }));
    const first = renderPage("/promotions");
    expect(await screen.findByText("Needs a cost price on every promoted product")).toBeInTheDocument();
    first.unmount();
    api.overview.mockResolvedValue(overview({ contributionBasis: "after_cost_only" }));
    renderPage("/promotions");
    expect(await screen.findByText(/After cost; a channel has no fee profile, so its fees count as zero/)).toBeInTheDocument();
  });

  it("shows a loading state, then an error with Retry for the overview and for the opportunities", async () => {
    api.overview.mockRejectedValueOnce(new Error("Database unavailable"));
    api.candidates.mockRejectedValueOnce(new Error("Candidates unavailable"));
    const user = userEvent.setup();
    renderPage("/promotions");
    expect(screen.getByText("Loading counts…")).toBeInTheDocument();
    expect(await screen.findByText("The overview could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("Counts unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Promotion pulse")).toBeInTheDocument();
    expect(await screen.findByText(/The opportunities could not be loaded/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Linen Shirt")).toBeInTheDocument();
  });

  it("is read-only for a viewer: nothing that writes is enabled, the export still works", async () => {
    grant("promotions:read");
    renderPage("/promotions");
    expect(await screen.findByText("Promotion pulse")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Campaign/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Sync Promotions/i })).toBeDisabled();
    const row = within(screen.getByLabelText("Promotion opportunities")).getByText("Premium Travel Bag").closest("div.flex.flex-col") as HTMLElement;
    expect(within(row).getByRole("button", { name: /Review/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Export/i })).toBeEnabled();
  });

  it("exports the overview figures and the channel table as a UTF-8 CSV in rupees", async () => {
    saved.blobs.length = 0;
    const user = userEvent.setup();
    renderPage("/promotions");
    await screen.findByText("Promotion pulse");
    await user.click(screen.getByRole("button", { name: /Export/i }));
    expect(saved.blobs).toHaveLength(1);
    expect(saved.blobs[0]!.name).toMatch(/^promotions-overview-\d{4}-\d{2}-\d{2}\.csv$/);
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
      r.readAsArrayBuffer(saved.blobs[0]!.blob);
    });
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 byte-order mark
    const text = new TextDecoder().decode(bytes.slice(3));
    const lines = text.split("\r\n");
    expect(lines).toContain("Revenue (INR),215400.00");
    expect(lines).toContain("Contribution (INR),47424.00");
    expect(lines).toContain("Contribution margin %,14.85");
    expect(lines).toContain("Contribution basis,After cost and marketplace fees");
    expect(lines).toContain("Products below the margin target,3");
    expect(lines).toContain("Marketplace,Account,Account status,Promotion capability,Active campaigns,Scheduled campaigns,Live products,Listed products,Opportunities");
    expect(lines).toContain("Amazon In,Main store,active,Supported,1,0,5,30,4");
    expect(lines).toContain("Shopify,Web shop,active,Not supported,0,0,0,10,2");
  });

  it("the More options menu reloads the numbers", async () => {
    const user = userEvent.setup();
    renderPage("/promotions");
    await screen.findByText("Promotion pulse");
    const before = api.overview.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Reload the numbers" }));
    await waitFor(() => expect(api.overview.mock.calls.length).toBeGreaterThan(before));
    expect(await screen.findByRole("button", { name: "More options" })).toBeInTheDocument();
  });

  it("Review on an opportunity opens the Create Campaign dialog", async () => {
    const user = userEvent.setup();
    renderPage("/promotions");
    await screen.findByText("Promotion pulse");
    const row = within(screen.getByLabelText("Promotion opportunities")).getByText("Premium Travel Bag").closest("div.flex.flex-col") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /Review/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("opens Create Campaign Modal (Screen 4) and submits draft to backend", async () => {
    api.create.mockResolvedValue({ campaign: campaign({ id: "99999999-9999-4999-8999-999999999999", name: "Festive Home Sale" }), products: null });
    const user = userEvent.setup();
    renderPage("/promotions");

    const createBtn = screen.getByRole("button", { name: /Create Campaign/i });
    await user.click(createBtn);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Campaign basics")).toBeInTheDocument();
    expect(within(dialog).getByText("Sales channels")).toBeInTheDocument();
    expect(within(dialog).getByText("Promotion details")).toBeInTheDocument();
    expect(within(dialog).getByText("Schedule")).toBeInTheDocument();
    expect(within(dialog).getByText("Creating saves a draft, not a live promotion.")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Campaign name/i), "Festive Home Sale");
    await user.type(within(dialog).getByLabelText(/Proposed discount/i), "15");

    const submitBtn = within(dialog).getByRole("button", { name: "Create Campaign" });
    await user.click(submitBtn);

    await waitFor(() => expect(api.create).toHaveBeenCalled());
  });

  it("opens a campaign drawer and schedules it after confirmation", async () => {
    api.lifecycle.mockResolvedValue({ campaign: campaign({ status: "scheduled" }), changed: true, pushed: [] });
    const user = userEvent.setup();
    renderPage(`/promotions?open=${C1}`);
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText("Results")).toBeInTheDocument();
    expect(within(drawer).getByText("+18.4%")).toBeInTheDocument();

    await user.click(within(drawer).getByRole("button", { name: "Schedule" }));
    const confirm = await screen.findByText("Schedule this campaign?");
    expect(confirm).toBeInTheDocument();
    const confirmDialog = confirm.closest("[role=dialog]") as HTMLElement;
    await user.click(within(confirmDialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(api.lifecycle).toHaveBeenCalledWith(C1, "schedule", 4));
  });

  it("synchronizes promotions with backend scheduler tick", async () => {
    api.process.mockResolvedValue({ activated: 1, ended: 0, refreshed: 2 });
    const user = userEvent.setup();
    renderPage("/promotions");
    const syncBtn = screen.getByRole("button", { name: /Sync Promotions/i });
    const before = api.overview.mock.calls.length;
    await user.click(syncBtn);
    await waitFor(() => expect(api.process).toHaveBeenCalled());
    // the numbers are read again once the tick has run
    await waitFor(() => expect(api.overview.mock.calls.length).toBeGreaterThan(before));
  });
});
