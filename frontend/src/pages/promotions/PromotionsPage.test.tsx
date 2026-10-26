import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { CampaignsPage, ProductsPage, PromotionCampaign, PromotionCampaignDetail, PromotionOverview, PromotionProduct } from "@/types/promotions";

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
  recentActivity: vi.fn(),
  categories: vi.fn(),
  variants: vi.fn(),
}));
vi.mock("@/api/promotions.api", () => ({ promotionsApi: api }));

const intelApi = vi.hoisted(() => ({
  list: vi.fn(),
  categories: vi.fn(),
  warehouses: vi.fn(),
  draftPurchaseOrders: vi.fn(),
  generatePriceProposals: vi.fn(),
}));
vi.mock("@/api/productIntelligence.api", () => ({ productIntelligenceApi: intelApi }));

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

import PromotionsPage from "./PromotionsPage";

const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const C1 = "33333333-3333-4333-8333-333333333333";
const C2 = "44444444-4444-4444-8444-444444444444";

const campaign = (over: Partial<PromotionCampaign> = {}): PromotionCampaign => ({
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
  channels: [{ accountId: ACCOUNT, marketplace: "amazon_in", displayName: "Main store" }],
  spendMinor: 0,
  revenueMinor: 0,
  unitsMoved: 0,
  ordersCount: 0,
  budgetUsedBps: null,
  statsUpdatedAt: null,
  itemCounts: { total: 2, eligible: 1, pending_sync: 0, live: 0, ineligible: 1, ended: 0 },
  endReason: null,
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

const detail = (c: PromotionCampaign): PromotionCampaignDetail => ({
  ...c,
  velocity: { liftBps: 1840, promoUnits: 88, promoDays: 3, baselineUnits: 20, baselineDays: 14 },
});

const overview = (): PromotionOverview => ({
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
});

const campaignsPage = (items: PromotionCampaign[], over: Partial<CampaignsPage> = {}): CampaignsPage => ({
  items,
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
  channels: [{ accountId: ACCOUNT, marketplace: "amazon_in", displayName: "Main store" }],
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
const loc = () => screen.getByTestId("loc").textContent;

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
  api.recentActivity.mockResolvedValue([
    { id: 1, action: "promotion.created", createdAt: "2026-10-23T12:00:00.000Z" },
    { id: 2, action: "promotion.activated", createdAt: "2026-10-23T11:00:00.000Z" },
  ]);
  api.categories.mockResolvedValue([]);
  api.variants.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });

  intelApi.list.mockResolvedValue({
    items: [
      {
        id: "intel-1",
        variantId: "v1",
        productId: "p1",
        sku: "TRV-1042-BLK",
        productName: "Premium Travel Bag",
        salesVelocity: 1.2,
        unitsSold30d: 36,
        marginPercent: 32,
        inventory: { available: 42, onHand: 50 },
        recommendedAction: "promote",
        reasons: [{ key: "margin_room", text: "Healthy contribution margin", values: {} }],
        confidence: { score: 85, level: "high" },
      },
      {
        id: "intel-2",
        variantId: "v2",
        productId: "p2",
        sku: "LW-BRN-018",
        productName: "Leather Wallet",
        salesVelocity: 0.8,
        unitsSold30d: 24,
        marginPercent: 16,
        inventory: { available: 8, onHand: 10 },
        recommendedAction: "hold",
        reasons: [{ key: "low_stock", text: "Low stock", values: {} }],
        confidence: { score: 70, level: "medium" },
      },
    ],
    summary: { promote: 12, reorder: 4, raise_price: 2, liquidate: 1, hold: 30 },
    variantsAnalysed: 1248,
    total: 2,
    page: 1,
    pageSize: 50,
    pages: 1,
  });
});

describe("PromotionsPage - Connected Screens", () => {
  it("renders Overview Tab (Screen 1) with real pulse, opportunities, and landscape", async () => {
    renderPage("/promotions");
    expect(await screen.findByText("Promotion pulse")).toBeInTheDocument();
    expect(screen.getByText("Promotion opportunities")).toBeInTheDocument();
    expect(screen.getByText("Promotion Intelligence")).toBeInTheDocument();
    expect(screen.getByText("Promotion pressure")).toBeInTheDocument();
    expect(screen.getByText("Marketplace Promotion Landscape")).toBeInTheDocument();
    expect(screen.getAllByText("Opportunities").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Eligible products")).toBeInTheDocument();
  });

  it("navigates to Products Tab (Screen 2) and renders candidate products with real intelligence", async () => {
    const user = userEvent.setup();
    renderPage("/promotions");
    const productsTab = screen.getByRole("tab", { name: "products" });
    await user.click(productsTab);
    expect(loc()).toContain("view=products");

    expect(await screen.findByText("Promotion Products")).toBeInTheDocument();
    expect(screen.getByText("recommended products")).toBeInTheDocument();
    expect(screen.getByText("total products")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search product, SKU or barcode")).toBeInTheDocument();
    expect(screen.getByText("High Margin Products")).toBeInTheDocument();
    expect(await screen.findByText("Premium Travel Bag")).toBeInTheDocument();
    expect(screen.getByText("TRV-1042-BLK")).toBeInTheDocument();
  });

  it("navigates to Campaigns Tab (Screen 3) and renders connected channel records and educational guidance", async () => {
    const user = userEvent.setup();
    renderPage("/promotions");
    const campaignsTab = screen.getByRole("tab", { name: "campaigns" });
    await user.click(campaignsTab);
    expect(loc()).toContain("view=campaigns");

    expect(await screen.findByText("Verification required before relying on any campaign schedule or type. Marketplace capabilities are unverified.")).toBeInTheDocument();
    expect(screen.getByText("Before you manage a campaign")).toBeInTheDocument();
    expect(screen.getByText("Availability is not participation")).toBeInTheDocument();
    expect(screen.getByText("Connector-dependent capabilities")).toBeInTheDocument();
  });

  it("opens Create Campaign Modal (Screen 4) and submits draft to backend", async () => {
    api.create.mockResolvedValue({ campaign: campaign({ id: "99999999-9999-4999-8999-999999999999", name: "Festive Home Sale" }), products: null });
    const user = userEvent.setup();
    renderPage("/promotions");

    const createBtn = screen.getByRole("button", { name: /Create Campaign/i });
    await user.click(createBtn);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Campaign basics")).toBeInTheDocument();
    expect(within(dialog).getByText("Sales channel")).toBeInTheDocument();
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
    await user.click(syncBtn);
    await waitFor(() => expect(api.process).toHaveBeenCalled());
  });
});
