import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  categories: vi.fn(),
  variants: vi.fn(),
}));
vi.mock("@/api/promotions.api", () => ({ promotionsApi: api }));
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
  budgetUsedBps: 0,
  statsUpdatedAt: null,
  itemCounts: { total: 3, eligible: 2, pending_sync: 0, live: 0, ineligible: 1, ended: 0 },
  endReason: null,
  version: 4,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
  ...over,
});

const ACTIVE = campaign({ id: C2, name: "Weekend Luggage Sale", code: "WEEKENDTRV", status: "active", type: "flat_discount", valueBps: null, valueMinor: 50000, revenueMinor: 21540000, spendMinor: 4250000, budgetMinor: 8000000, budgetUsedBps: 5313, unitsMoved: 88 });

const detail = (c: PromotionCampaign): PromotionCampaignDetail => ({ ...c, velocity: { liftBps: 1840, promoUnits: 88, promoDays: 9, baselineUnits: 60, baselineDays: 14 } });

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
const lastCampaignsQuery = () => api.campaigns.mock.calls.at(-1)?.[0];

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
  api.categories.mockResolvedValue([]);
  api.variants.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
});

describe("PromotionsPage", () => {
  it("shows the overview tiles and the campaign ledger from the API", async () => {
    renderPage();
    expect(await screen.findByText("Festive Flash")).toBeInTheDocument();
    expect(screen.getAllByText("₹2,15,400")).toHaveLength(2);
    expect(screen.getByText(/Velocity lift \+18\.4%/)).toBeInTheDocument();
    expect(screen.getByText("1 scheduled".replace("1", "2") + " · 3 draft")).toBeInTheDocument();

    const draft = screen.getByText("Festive Flash").closest("tr") as HTMLElement;
    expect(within(draft).getByText("20% off")).toBeInTheDocument();
    expect(within(draft).getByText("1 cannot run")).toBeInTheDocument();
    expect(within(draft).getByText("Draft")).toBeInTheDocument();
    expect(within(draft).getByText("Main store")).toBeInTheDocument();

    const active = screen.getByText("Weekend Luggage Sale").closest("tr") as HTMLElement;
    expect(within(active).getByText("₹500 off")).toBeInTheDocument();
    expect(within(active).getByText(/of ₹80,000 · 53\.13%/)).toBeInTheDocument();
    expect(lastCampaignsQuery()).toMatchObject({ page: 1, pageSize: 25 });
  });

  it("puts status, type and search in the URL and sends them to the API", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Festive Flash");

    await user.click(screen.getByRole("tab", { name: /^Active/ }));
    expect(loc()).toBe("/promotions?status=active");
    await waitFor(() => expect(lastCampaignsQuery()).toMatchObject({ status: "active" }));

    await user.selectOptions(screen.getByLabelText("Campaign type"), "bogo");
    await waitFor(() => expect(lastCampaignsQuery()).toMatchObject({ status: "active", type: "bogo" }));

    await user.type(screen.getByLabelText("Search campaigns"), "diwali");
    await waitFor(() => expect(lastCampaignsQuery()).toMatchObject({ q: "diwali" }), { timeout: 2000 });
    expect(loc()).toContain("q=diwali");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(loc()).toBe("/promotions");
  });

  it("restores the filters from the URL and pages through the results", async () => {
    api.campaigns.mockResolvedValue(campaignsPage([campaign()], { page: 2, pages: 3, total: 60, pageSize: 25 }));
    const user = userEvent.setup();
    renderPage("/promotions?status=draft&page=2&size=50");
    await screen.findByText("Festive Flash");
    expect(lastCampaignsQuery()).toMatchObject({ status: "draft", page: 2, pageSize: 50 });
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(loc()).toContain("page=3");
  });

  it("lists promoted SKUs with the reason a product cannot run", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Festive Flash");
    await user.click(screen.getByRole("tab", { name: "Promoted SKUs" }));
    expect(loc()).toBe("/promotions?view=products");
    const row = (await screen.findByText("Cotton Overshirt")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Ineligible")).toBeInTheDocument();
    expect(within(row).getByText("Main store: no active listing on this account")).toBeInTheDocument();
    const live = screen.getByText("Premium Travel Bag").closest("tr") as HTMLElement;
    expect(within(live).getByText("₹1,999")).toBeInTheDocument();
    expect(within(live).getByText("₹2,499")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Campaign"), C1);
    await waitFor(() => expect(api.products.mock.calls.at(-1)?.[0]).toMatchObject({ campaignId: C1 }));
    expect(loc()).toContain(`campaign=${C1}`);
  });

  it("creates a draft with money in integer minor units and percentages in basis points", async () => {
    api.create.mockResolvedValue({ campaign: campaign({ id: "55555555-5555-4555-8555-555555555555", name: "Spring" }), products: null });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Festive Flash");
    await user.click(screen.getByRole("button", { name: "Create campaign" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Save draft" }));
    expect(await within(dialog).findByText("Give the campaign a name")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the discount percentage")).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Campaign name"), "Spring");
    await user.type(within(dialog).getByLabelText("Discount (%)"), "12.5");
    await user.type(within(dialog).getByLabelText(/Discount budget/), "50000.50");
    await user.click(within(dialog).getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0]?.[0]).toMatchObject({
      name: "Spring",
      type: "percentage_discount",
      valueBps: 1250,
      valueMinor: null,
      budgetMinor: 5000050,
      startsAt: null,
      endsAt: null,
      accountIds: [],
    });
    expect(api.create.mock.calls[0]?.[0].selection).toBeUndefined();
    await waitFor(() => expect(loc()).toContain("open=55555555-5555-4555-8555-555555555555"));
  });

  it("saves a double-clicked Save draft once", async () => {
    api.create.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ campaign: campaign({ id: "66666666-6666-4666-8666-666666666666", name: "Once" }), products: null }), 50)));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Festive Flash");
    await user.click(screen.getByRole("button", { name: "Create campaign" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Campaign name"), "Once");
    await user.type(within(dialog).getByLabelText("Discount (%)"), "10");
    const save = within(dialog).getByRole("button", { name: "Save draft" });
    // two clicks inside one task, before the button can re-render as disabled
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });
    await waitFor(() => expect(loc()).toContain("open=66666666-6666-4666-8666-666666666666"));
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it("sends the picked products and shows a duplicate code on the code field", async () => {
    api.variants.mockResolvedValue({
      items: [{ id: "66666666-6666-4666-8666-666666666666", productId: "p1", sku: "KURTA-M", productTitle: "Cotton Kurta", optionValues: { size: "M" }, sellingPriceMinor: 129900, status: "active" }],
      nextCursor: null,
      hasMore: false,
    });
    api.create.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "dup", status: 409, details: { rule: "duplicate_code" } }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Festive Flash");
    await user.click(screen.getByRole("button", { name: "Create campaign" }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText("Campaign name"), "Spring");
    await user.type(within(dialog).getByLabelText("Campaign code (optional)"), "FESTIVE20");
    await user.type(within(dialog).getByLabelText("Discount (%)"), "10");
    await user.click(await within(dialog).findByRole("checkbox", { name: "Select KURTA-M" }));
    await user.click(within(dialog).getByRole("button", { name: "Save draft" }));

    expect(await within(dialog).findByText("This code is already used by another campaign")).toBeInTheDocument();
    expect(api.create.mock.calls[0]?.[0]).toMatchObject({ code: "FESTIVE20", selection: { variantIds: ["66666666-6666-4666-8666-666666666666"] } });
  });

  it("asks before leaving a form with unsaved changes", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Festive Flash");
    await user.click(screen.getByRole("button", { name: "Create campaign" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Campaign name"), "Half done");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Discard your changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Campaign name")).toHaveValue("Half done");
  });

  it("opens a campaign from the URL, shows its results and schedules it after a confirmation", async () => {
    api.lifecycle.mockResolvedValue({ campaign: campaign({ status: "scheduled" }), changed: true, pushed: [] });
    const user = userEvent.setup();
    renderPage(`/promotions?open=${C1}`);
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText("Results")).toBeInTheDocument();
    expect(within(drawer).getByText("+18.4%")).toBeInTheDocument();
    expect(await within(drawer).findByText("TRV-1042-BLK")).toBeInTheDocument();

    await user.click(within(drawer).getByRole("button", { name: "Schedule" }));
    const confirm = await screen.findByText("Schedule this campaign?");
    expect(confirm).toBeInTheDocument();
    expect(api.lifecycle).not.toHaveBeenCalled();
    const confirmDialog = confirm.closest("[role=dialog]") as HTMLElement;
    await user.click(within(confirmDialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(api.lifecycle).toHaveBeenCalledWith(C1, "schedule", 4));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === "Festive Flash scheduled")).toBe(true));
  });

  it("explains a refused action from the server", async () => {
    api.lifecycle.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "No product in this campaign can run yet", status: 409, details: { rule: "no_eligible_items" } }));
    const user = userEvent.setup();
    renderPage(`/promotions?open=${C1}`);
    const drawer = await screen.findByRole("dialog");
    await user.click(await within(drawer).findByRole("button", { name: "Start now" }));
    const confirmDialog = (await screen.findByText("Start this campaign now?")).closest("[role=dialog]") as HTMLElement;
    await user.click(within(confirmDialog).getByRole("button", { name: "Start now" }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === "Could not start the campaign" && /Ineligible tab shows the reason/.test(String(t.description)) && t.variant === "destructive")).toBe(true));
  });

  it("only offers End on a running campaign and never Edit or Delete", async () => {
    renderPage(`/promotions?open=${C2}`);
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByRole("button", { name: "End now" })).toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: "Delete draft" })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: "Schedule" })).not.toBeInTheDocument();
  });

  it("deletes a draft only after a confirmation", async () => {
    api.remove.mockResolvedValue({ id: C1 });
    const user = userEvent.setup();
    renderPage(`/promotions?open=${C1}`);
    const drawer = await screen.findByRole("dialog");
    await user.click(await within(drawer).findByRole("button", { name: "Delete draft" }));
    const confirmDialog = (await screen.findByText("Delete this draft?")).closest("[role=dialog]") as HTMLElement;
    expect(api.remove).not.toHaveBeenCalled();
    await user.click(within(confirmDialog).getByRole("button", { name: "Delete draft" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(C1, 4));
  });

  it("disables every write control without the write permission", async () => {
    grant("promotions:read");
    renderPage(`/promotions?open=${C1}`);
    expect(await screen.findByRole("button", { name: "Create campaign", hidden: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refresh results", hidden: true })).toBeDisabled();
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByRole("button", { name: "Schedule" })).toBeDisabled();
    expect(within(drawer).getByRole("button", { name: "Duplicate" })).toBeDisabled();
    expect(within(drawer).getByRole("button", { name: "Add products" })).toBeDisabled();
  });

  it("duplicates a campaign and opens the copy", async () => {
    api.duplicate.mockResolvedValue(campaign({ id: "77777777-7777-4777-8777-777777777777", name: "Festive Flash (copy)", code: "DIWALI25-COPY" }));
    const user = userEvent.setup();
    renderPage(`/promotions?open=${C1}`);
    const drawer = await screen.findByRole("dialog");
    await user.click(await within(drawer).findByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(api.duplicate).toHaveBeenCalledWith(C1));
    await waitFor(() => expect(loc()).toContain("open=77777777-7777-4777-8777-777777777777"));
  });

  it("adds products to a draft from the drawer", async () => {
    api.variants.mockResolvedValue({
      items: [{ id: "66666666-6666-4666-8666-666666666666", productId: "p1", sku: "KURTA-M", productTitle: "Cotton Kurta", optionValues: {}, sellingPriceMinor: 129900, status: "active" }],
      nextCursor: null,
      hasMore: false,
    });
    api.setProducts.mockResolvedValue({ total: 4, added: 1, removed: 0, skipped: [], droppedNoListing: 0 });
    const user = userEvent.setup();
    renderPage(`/promotions?open=${C1}`);
    const drawer = await screen.findByRole("dialog");
    await user.click(await within(drawer).findByRole("button", { name: "Add products" }));
    const dialogs = await screen.findAllByRole("dialog");
    const add = dialogs.find((d) => within(d).queryByText("Add products", { selector: "h2" })) as HTMLElement;
    await user.click(await within(add).findByRole("checkbox", { name: "Select KURTA-M" }));
    await user.click(within(add).getByRole("button", { name: "Add products" }));
    await waitFor(() => expect(api.setProducts).toHaveBeenCalledWith(C1, { variantIds: ["66666666-6666-4666-8666-666666666666"] }, "add"));
  });

  it("shows an error with a retry when the campaigns cannot load", async () => {
    api.campaigns.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Database unavailable", status: 500 }));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Campaigns could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("Database unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Festive Flash")).toBeInTheDocument();
  });

  it("explains an empty account and offers the first campaign", async () => {
    api.campaigns.mockResolvedValue(campaignsPage([], { counts: { all: 0, draft: 0, scheduled: 0, active: 0, ended: 0, cancelled: 0 } }));
    renderPage();
    expect(await screen.findByText("No campaigns yet.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Create campaign" }).length).toBeGreaterThan(1);
  });
});
