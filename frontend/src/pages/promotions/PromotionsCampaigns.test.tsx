import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { CampaignsPage, CampaignsQuery, PromotionCampaignRow } from "@/types/promotions";

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
  preview: vi.fn(),
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

const row = (n: number, over: Partial<PromotionCampaignRow> = {}): PromotionCampaignRow => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  name: `Campaign ${n}`,
  code: `CODE${n}`,
  description: null,
  type: "percentage_discount",
  valueBps: 1000,
  valueMinor: null,
  buyQuantity: null,
  getQuantity: null,
  minOrderMinor: 0,
  budgetMinor: 0,
  currency: "INR",
  status: "draft",
  startsAt: "2026-11-01T04:30:00.000Z",
  endsAt: "2026-11-05T16:30:00.000Z",
  accountIds: [],
  channels: [{ accountId: AMAZON, marketplace: "amazon_in", displayName: "Main store", canPushPrices: true }],
  spendMinor: 0,
  revenueMinor: 0,
  unitsMoved: 0,
  ordersCount: 0,
  budgetUsedBps: null,
  statsUpdatedAt: null,
  itemCounts: { total: 6, eligible: 4, pending_sync: 0, live: 0, ineligible: 2, ended: 0 },
  endReason: null,
  horizon: "next",
  endingSoon: false,
  endsInHours: null,
  capability: "supported",
  version: 3,
  createdAt: "2026-10-20T08:00:00.000Z",
  updatedAt: "2026-10-21T08:00:00.000Z",
  avgDiscountBps: 1000,
  contributionMinor: null,
  contributionBps: null,
  contributionBasis: null,
  marginRisk: null,
  ...over,
});

const page = (items: PromotionCampaignRow[], over: Partial<CampaignsPage> = {}): CampaignsPage => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  pages: 1,
  counts: { all: items.length, draft: 1, scheduled: 1, active: 1, ended: 1, cancelled: 0 },
  horizonCounts: { past: 1, now: 3, next: 2 },
  ...over,
});

const MIXED = [
  row(1, { name: "Festive Flash", code: "DIWALI25", status: "draft", marginRisk: { checkedProducts: 6, belowTarget: 2, unknownCost: 1, conflicts: 0 } }),
  row(2, {
    name: "Weekend Luggage Sale",
    code: "WEEKEND",
    status: "active",
    horizon: "now",
    endingSoon: true,
    endsInHours: 30,
    unitsMoved: 88,
    revenueMinor: 21_540_000,
    spendMinor: 4_250_000,
    contributionMinor: 4_742_400,
    contributionBps: 1485,
    contributionBasis: "after_cost_and_fees",
    itemCounts: { total: 4, eligible: 0, pending_sync: 0, live: 4, ineligible: 0, ended: 0 },
    marginRisk: { checkedProducts: 4, belowTarget: 0, unknownCost: 0, conflicts: 1 },
  }),
  row(3, { name: "Shop Sale", code: "SHOP1", status: "scheduled", capability: "not_supported", channels: [{ accountId: SHOP, marketplace: "shopify", displayName: "Web shop", canPushPrices: false }], marginRisk: { checkedProducts: 3, belowTarget: 0, unknownCost: 0, conflicts: 0 } }),
  row(4, { name: "Spring Clearance", code: "SPRING", status: "ended", horizon: "past", endReason: "window_closed", unitsMoved: 10, revenueMinor: 100_000, contributionMinor: null, marginRisk: null }),
  row(5, { name: "Called Off", code: "OFF", status: "cancelled", horizon: "past", endReason: "cancelled", marginRisk: null }),
];

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/promotions?view=campaigns") {
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
const lastQuery = (): CampaignsQuery => api.campaigns.mock.calls.at(-1)![0] as CampaignsQuery;
const rowOf = (text: string) => screen.getByText(text).closest("tr") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  saved.blobs.length = 0;
  useToastStore.setState({ toasts: [] });
  grant("promotions:read", "promotions:write");
  api.overview.mockResolvedValue({ currency: "INR", activeCampaigns: 1, eligibleProducts: 0, opportunities: 0, connectorLimitations: 0, channels: [], pressure: { strongCandidate: null, reviewFirst: null }, recentActivity: [], thresholds: {} });
  api.campaigns.mockResolvedValue(page(MIXED));
  api.products.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, pages: 1, counts: {} });
  api.candidates.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, pages: 1, counts: {}, summary: { recommendedProducts: 0, listedProducts: 0, unlistedVariants: 0, placements: 0 }, thresholds: {} });
  api.accounts.mockResolvedValue([
    { id: AMAZON, marketplace: "amazon_in", displayName: "Main store", status: "active" },
    { id: SHOP, marketplace: "shopify", displayName: "Web shop", status: "active" },
  ]);
  api.categories.mockResolvedValue([]);
  api.variants.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  api.preview.mockResolvedValue({ summary: { products: 0, placements: 0, runnable: 0, notRunnable: 0, notListed: 0, belowMarginTarget: 0, unknownCost: 0, conflicts: 0, connectorCannotPush: 0, avgDiscountBps: null, unknownVariants: 0 }, items: [] });
});

describe("Campaigns tab", () => {
  it("asks the server for exactly what the URL says", async () => {
    renderPage("/promotions?view=campaigns&when=past&ending=true&market=shopify&sort=revenue&q=sale&size=50&page=2");
    await waitFor(() => expect(api.campaigns).toHaveBeenCalled());
    expect(lastQuery()).toMatchObject({ horizon: "past", endingSoon: true, marketplace: "shopify", sort: "revenue", q: "sale", pageSize: 50, page: 2 });
  });

  it("defaults to Now, newest first, and a status filter replaces the horizon", async () => {
    renderPage();
    await screen.findByText("Festive Flash");
    expect(lastQuery()).toMatchObject({ horizon: "now", page: 1, pageSize: 25 });
    expect(lastQuery().sort).toBe("newest");
    expect(lastQuery().endingSoon).toBeUndefined();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Status"), "ended");
    expect(loc()).toContain("status=ended");
    await waitFor(() => expect(lastQuery()).toMatchObject({ status: "ended" }));
    expect(lastQuery().horizon).toBeUndefined();
  });

  it("keeps toggle, pills, filters, sort and search in the URL, with the horizon counts on the toggle", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Festive Flash");
    const toggle = within(screen.getByRole("group", { name: "Time horizon" }));
    expect(toggle.getByRole("button", { name: /Past/ })).toHaveTextContent("1");
    expect(toggle.getByRole("button", { name: /Now/ })).toHaveTextContent("3");
    expect(toggle.getByRole("button", { name: /Next/ })).toHaveTextContent("2");
    expect(toggle.getByRole("button", { name: /Now/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle.getByRole("button", { name: /Next/ }));
    expect(loc()).toContain("when=next");
    await user.click(screen.getByRole("button", { name: "Ending soon" }));
    expect(loc()).toContain("ending=true");
    await waitFor(() => expect(lastQuery()).toMatchObject({ horizon: "next", endingSoon: true }));
    await user.selectOptions(screen.getByLabelText("Marketplace"), "shopify");
    expect(loc()).toContain("market=shopify");
    await user.selectOptions(screen.getByLabelText("Sort by"), "ends_soon");
    expect(loc()).toContain("sort=ends_soon");
    await user.type(screen.getByLabelText("Search campaigns"), "flash");
    await waitFor(() => expect(loc()).toContain("q=flash"));
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: "flash", marketplace: "shopify", sort: "ends_soon", horizon: "next", endingSoon: true }));
    await user.click(screen.getByRole("button", { name: "Past" }));
    expect(loc()).toContain("when=past");
  });

  it("takes the marketplaces from the connected accounts", async () => {
    renderPage();
    await screen.findByText("Festive Flash");
    expect(within(screen.getByLabelText("Marketplace")).getAllByRole("option").map((o) => o.textContent)).toEqual(["All Marketplaces", "Amazon In", "Shopify"]);
  });

  it("shows the real status of each campaign, with dates and countdowns, and no invented numbers", async () => {
    renderPage();
    await screen.findByText("Festive Flash");
    expect(within(rowOf("Festive Flash")).getByText("Draft")).toBeInTheDocument();
    expect(within(rowOf("Weekend Luggage Sale")).getByText("Active")).toBeInTheDocument();
    expect(within(rowOf("Shop Sale")).getByText("Scheduled")).toBeInTheDocument();
    expect(within(rowOf("Spring Clearance")).getByText("Ended")).toBeInTheDocument();
    expect(within(rowOf("Called Off")).getByText("Cancelled")).toBeInTheDocument();
    const active = within(rowOf("Weekend Luggage Sale"));
    expect(active.getByText(/Ending soon · Ends in 30h/)).toBeInTheDocument();
    expect(within(rowOf("Spring Clearance")).getByText("The campaign window closed")).toBeInTheDocument();
    expect(within(rowOf("Called Off")).getByText("Cancelled before it ran")).toBeInTheDocument();
    expect(within(rowOf("Shop Sale")).getByText(/Starts/)).toBeInTheDocument();
    expect(screen.queryByText(/Illustrative/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Seasonal Event/)).not.toBeInTheDocument();
    expect(screen.queryByText(/days indicated/)).not.toBeInTheDocument();
    expect(screen.queryByText(/channel records/)).not.toBeInTheDocument();
  });

  it("shows channels with their capability, the discount, products, performance and the margin check", async () => {
    renderPage();
    await screen.findByText("Festive Flash");
    const draft = within(rowOf("Festive Flash"));
    expect(draft.getByText("Main store")).toBeInTheDocument();
    expect(draft.getByText("Prices can be applied")).toBeInTheDocument();
    expect(draft.getByText("10% off")).toBeInTheDocument();
    expect(draft.getByText(/Percentage off · average 10% off/)).toBeInTheDocument();
    expect(draft.getByText("6 products")).toBeInTheDocument();
    expect(draft.getByText(/4 ready/)).toBeInTheDocument();
    expect(draft.getByText(/2 cannot run/)).toBeInTheDocument();
    expect(draft.getByText("2 below margin target")).toBeInTheDocument();
    expect(draft.getByText("1 without a cost price")).toBeInTheDocument();

    const active = within(rowOf("Weekend Luggage Sale"));
    expect(active.getByText("88 units · ₹2,15,400")).toBeInTheDocument();
    expect(active.getByText("Contribution ₹47,424 (14.9%)")).toBeInTheDocument();
    expect(active.getByText("4 live ·", { exact: false })).toBeInTheDocument();
    expect(active.getByText("1 in conflict")).toBeInTheDocument();

    const shop = within(rowOf("Shop Sale"));
    expect(shop.getByText("Web shop")).toBeInTheDocument();
    expect(shop.getByText("Cannot take price changes")).toBeInTheDocument();
    expect(shop.getByText("Margins OK")).toBeInTheDocument();

    const ended = within(rowOf("Spring Clearance"));
    expect(ended.getByText("Contribution — (needs cost prices)")).toBeInTheDocument();
  });

  it("pages on the server with a real pager", async () => {
    const user = userEvent.setup();
    api.campaigns.mockImplementation(async (q: CampaignsQuery) => page(q.page === 1 ? [row(1), row(2)] : [row(3)], { page: q.page, total: 3, pages: 2, pageSize: q.pageSize }));
    renderPage();
    await screen.findByText("Campaign 1");
    expect(screen.getByText(/Showing 1–2 of 3 campaigns/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(loc()).toContain("page=2");
    expect(await screen.findByText("Campaign 3")).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ page: 2 });
    await user.selectOptions(screen.getByLabelText("Rows per page"), "50");
    expect(loc()).toContain("size=50");
  });

  it("opens the drawer, and runs the row actions through confirmations", async () => {
    const user = userEvent.setup();
    api.lifecycle.mockResolvedValue({ campaign: MIXED[0], changed: true, pushed: [] });
    api.duplicate.mockResolvedValue(row(9, { name: "Festive Flash (copy)" }));
    api.remove.mockResolvedValue({ id: MIXED[0]!.id });
    renderPage();
    await screen.findByText("Festive Flash");
    await user.click(screen.getByRole("button", { name: "Open Festive Flash" }));
    expect(loc()).toContain(`open=${MIXED[0]!.id}`);

    await user.click(screen.getByRole("button", { name: "Actions for Festive Flash" }));
    await user.click(await screen.findByRole("menuitem", { name: "Schedule" }));
    const confirm = (await screen.findByText("Schedule this campaign?")).closest("[role=dialog]") as HTMLElement;
    await user.click(within(confirm).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(api.lifecycle).toHaveBeenCalledWith(MIXED[0]!.id, "schedule", 3));

    await user.click(screen.getByRole("button", { name: "Actions for Festive Flash" }));
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(api.duplicate).toHaveBeenCalledWith(MIXED[0]!.id));

    await user.click(screen.getByRole("button", { name: "Actions for Festive Flash" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete draft" }));
    const del = (await screen.findByText("Delete this draft?")).closest("[role=dialog]") as HTMLElement;
    await user.click(within(del).getByRole("button", { name: "Delete draft" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(MIXED[0]!.id, 3));
  });

  it("edits a draft in the dialog (the Edit action is wired) and offers End only for a running campaign", async () => {
    const user = userEvent.setup();
    api.campaign.mockResolvedValue(MIXED[0]);
    renderPage();
    await screen.findByText("Festive Flash");
    await user.click(screen.getByRole("button", { name: "Actions for Festive Flash" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Edit Campaign")).toBeInTheDocument();
    expect((within(dialog).getByLabelText(/Campaign name/) as HTMLInputElement).value).toBe("Festive Flash");
    expect((within(dialog).getByLabelText(/Campaign code/) as HTMLInputElement).value).toBe("DIWALI25");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Actions for Weekend Luggage Sale" }));
    expect(await screen.findByRole("menuitem", { name: "End now" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("exports the filtered list by paging through the server, in rupees with a BOM", async () => {
    const user = userEvent.setup();
    api.campaigns.mockImplementation(async (q: CampaignsQuery) => {
      const all = Array.from({ length: 150 }, (_, i) => row(i + 1));
      const items = q.pageSize === 100 ? all.slice((q.page - 1) * 100, q.page * 100) : all.slice(0, 25);
      return page(items, { total: 150, pages: Math.ceil(150 / q.pageSize), page: q.page, pageSize: q.pageSize });
    });
    renderPage("/promotions?view=campaigns&when=next");
    await screen.findByText("Campaign 1");
    await user.click(screen.getByRole("button", { name: "Export campaigns" }));
    await waitFor(() => expect(saved.blobs).toHaveLength(1));
    expect(saved.blobs[0]!.name).toMatch(/^promotions-campaigns-\d{4}-\d{2}-\d{2}\.csv$/);
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
      r.readAsArrayBuffer(saved.blobs[0]!.blob);
    });
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes.slice(3)).split("\r\n");
    expect(lines).toHaveLength(151);
    expect(lines[0]).toContain("Campaign,Code,Status,Type,Discount");
    expect(lines[1]).toContain("Campaign 1,CODE1,Draft,Percentage off,10% off,10.00,Main store");
    const exportCalls = api.campaigns.mock.calls.filter((c) => (c[0] as CampaignsQuery).pageSize === 100).map((c) => c[0] as CampaignsQuery);
    expect(exportCalls.map((c) => c.page)).toEqual([1, 2]);
    expect(exportCalls[0]).toMatchObject({ horizon: "next" });
  });

  it("is read-only for a viewer: the list and export work, nothing that writes is enabled", async () => {
    grant("promotions:read");
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Festive Flash");
    expect(screen.getByRole("button", { name: /Create Campaign/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export campaigns" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Actions for Festive Flash" }));
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "View details" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("shows an error with Retry, the empty state with a way to create, and a different one when filters match nothing", async () => {
    const user = userEvent.setup();
    api.campaigns.mockRejectedValueOnce(new Error("Database unavailable"));
    const first = renderPage();
    expect(await screen.findByText("The campaigns could not be loaded.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Festive Flash")).toBeInTheDocument();
    first.unmount();

    api.campaigns.mockResolvedValue(page([], { counts: { all: 0, draft: 0, scheduled: 0, active: 0, ended: 0, cancelled: 0 }, horizonCounts: { past: 0, now: 0, next: 0 } }));
    const second = renderPage();
    expect(await screen.findByText("No campaigns yet.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Create/ }).length).toBeGreaterThan(0);
    second.unmount();

    api.campaigns.mockResolvedValue(page([], { counts: { all: 5, draft: 1, scheduled: 1, active: 1, ended: 1, cancelled: 1 } }));
    renderPage("/promotions?view=campaigns&q=zzz");
    expect(await screen.findByText("No campaigns match these filters.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(loc()).not.toContain("q=zzz"));
  });
});
