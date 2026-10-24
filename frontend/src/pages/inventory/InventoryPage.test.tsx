import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import InventoryPage from "./InventoryPage";
import { inventoryApi } from "@/api/inventory.api";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import { useToastStore } from "@/hooks/useToast";
import { saveBlob } from "@/components/products/list/saveBlob";
import { sparkPath } from "@/components/inventory/inventoryLabels";
import type { ChannelSyncState, InventoryKpis, InventoryOverview, InventoryPreset, LedgerPage, LedgerRow, StockTransfer, SyncJob, VariantPanel, Warehouse } from "@/types/inventory";

vi.mock("@/api/inventory.api", () => ({
  inventoryApi: {
    kpis: vi.fn(),
    overview: vi.fn(),
    ledger: vi.fn(),
    catalogVariants: vi.fn(),
    exportCsv: vi.fn(),
    panel: vi.fn(),
    variantStock: vi.fn(),
    allocations: vi.fn(),
    movementsFeed: vi.fn(),
    warehouses: vi.fn(),
    adjust: vi.fn(),
    previewAdjustment: vi.fn(),
    transfer: vi.fn(),
    transfers: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    submitDraft: vi.fn(),
    discardDraft: vi.fn(),
    presets: vi.fn(),
    createPreset: vi.fn(),
    deletePreset: vi.fn(),
    setReorderLevel: vi.fn(),
    startChannelSync: vi.fn(),
    syncJob: vi.fn(),
    channelSyncState: vi.fn(),
    affectedListings: vi.fn(),
    bulk: vi.fn(),
    selectionCount: vi.fn(),
    groups: vi.fn(),
    createGroup: vi.fn(),
    deleteGroup: vi.fn(),
  },
}));
vi.mock("@/api/products", () => ({ catalogApi: { channels: vi.fn() }, productsApi: {} }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob: vi.fn() }));

import { catalogApi } from "@/api/products";

const api = vi.mocked(inventoryApi);

const ID = { tee: "11111111-1111-4111-8111-111111111111", bag: "22222222-2222-4222-8222-222222222222" };
const WH = { delhi: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", mumbai: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const WAREHOUSES: Warehouse[] = [
  { id: WH.delhi, code: "DEL", name: "Delhi DC", city: "Delhi", isDefault: true },
  { id: WH.mumbai, code: "BOM", name: "Mumbai DC", city: "Mumbai", isDefault: false },
];

const KPIS: InventoryKpis = {
  asOf: "2026-10-20T08:00:00.000Z",
  mode: "warehouse",
  warehouseId: null,
  totals: { skus: 52, unitsAvailable: 1234, unitsOnHand: 1300, unitsReserved: 66, unitsIncoming: 20, untrackedSkus: 0 },
  health: { healthy: 40, lowStock: 7, outOfStock: 3, excess: 2 },
  stockoutRiskCount: 5,
  valuation: { amountMinor: 12_500_000, currency: "INR", basis: "cost", skusCosted: 50, skusWithoutCost: 2 },
  channelSync: { state: "stale", lastSuccessAt: "2026-10-20T06:00:00.000Z", minutesSinceLastSuccess: 120, label: "Last synced 2 hours ago", connectedChannels: 2, syncingChannels: 0, failedChannels: 1, skusNeedingReview: 4 },
  reorder: { show: true, recommendationOnly: true, title: "7 products are below their reorder level", text: "Linen Tee and Canvas Pack run out within their lead time.", lowStockCount: 7, stockoutRiskCount: 5, href: "/inventory?filter[stockStatus]=low_stock", items: [] },
};

const OVERVIEW: InventoryOverview = {
  asOf: "2026-10-20T08:00:00.000Z",
  live: true,
  mode: "warehouse",
  pulse: { available: 8462, reserved: 1184, incoming: 2540, returned: 184, damaged: 76, quarantined: 32, flow: { incomingToday: 0 } },
  horizon: {
    leadTimeBasis: "variant",
    defaultLeadTimeDays: 7,
    windowDays: 14,
    scaleMaxDays: 20,
    items: [
      { variantId: ID.tee, productId: "p-1111", title: "Linen Tee", sku: "TEE-M", thumbnailUrl: null, stock: 40, unitsPerDay: 6, coverDays: 7, leadTimeDays: 10, leadTimeSource: "variant", health: "attention", action: { key: "review_reorder", label: "Reorder attention required", href: "/inventory" } },
      { variantId: ID.bag, productId: "p-2222", title: "Canvas Pack", sku: "BAG-1", thumbnailUrl: null, stock: 0, unitsPerDay: 0, coverDays: null, leadTimeDays: 7, leadTimeSource: "default", health: "stockout", action: { key: "review_stock", label: "Review stock", href: "/inventory" } },
    ],
  },
  signals: [
    { key: "low_stock", count: 12, trend: [1, 2, 3, 2, 4, 3, 5], tone: "warn", href: "/inventory?signal=low_stock" },
    { key: "stockout_risk", count: 4, trend: null, tone: "bad", href: "/inventory?signal=stockout_risk" },
  ],
  advisory: {
    title: "Reorder attention",
    text: "2 products may stock out before their expected replenishment lead time.",
    recommendationOnly: true,
    recommendationId: null,
    items: [{ variantId: ID.tee, title: "Linen Tee", sku: "TEE-M", units: 40, coverDays: 7, leadTimeDays: 10 }],
  },
  distribution: {
    byWarehouse: [
      { warehouseId: WH.delhi, name: "Delhi DC", units: 600, sharePct: 60, demandSharePct: 40 },
      { warehouseId: WH.mumbai, name: "Mumbai DC", units: 400, sharePct: 40, demandSharePct: 60 },
    ],
    insight: { text: "Delhi DC currently holds 20% more inventory than demand patterns suggest.", warehouseId: WH.delhi, advisoryOnly: true },
  },
  recentMovements: [{ at: "2026-10-20T06:28:00.000Z", type: "adjusted", text: "Manual stock adjustment", detail: "Linen Tee +12", ref: null }],
  ledger: { total: 52 },
};

const CH = (code: string, name: string, accountId: string | null = null) => ({ code, name, accountId, availability: "live" as const });

const CHANNEL_STATE: ChannelSyncState = {
  master: { available: 1234, lastUpdateAt: "2026-10-20T07:12:18.000Z" },
  channels: [
    { channel: CH("amazon_in", "Amazon", "acc1"), accountName: "Amazon IN", state: "failed", lastSyncAt: null, lastSyncLabel: "not_reported", sentUnits: 30, listings: 3, affectedSkus: 7, affectedProducts: 7 },
    { channel: CH("flipkart", "Flipkart", "acc2"), accountName: "Flipkart", state: "healthy", lastSyncAt: "2026-10-20T07:58:00.000Z", lastSyncLabel: "reported", sentUnits: 25, listings: 2, affectedSkus: 0, affectedProducts: 0 },
  ],
  incidents: [
    {
      id: "i1",
      channel: CH("amazon_in", "Amazon", "acc1"),
      title: "Amazon inventory sync needs attention",
      reason: "Marketplace API returned inventory update rejection",
      affected: { skus: 7, variants: 14, products: 7 },
      lastFailedAt: "2026-10-20T07:31:00.000Z",
      actions: [],
    },
  ],
  operations: { syncing: { channels: 0, skus: 0, progress: null }, lastSuccessAt: "2026-10-20T07:58:00.000Z", requireReview: { skus: 7, channels: 1 }, failed: { channels: 1 } },
};

const row = (variantId: string, over: Partial<LedgerRow> = {}): LedgerRow => ({
  variantId,
  productId: "p-" + variantId.slice(0, 4),
  thumbnailUrl: null,
  title: "Linen Tee",
  sku: "TEE-M",
  barcode: null,
  available: 40,
  reserved: 5,
  incoming: 10,
  returned: 0,
  damaged: 2,
  quarantined: 0,
  onHand: 45,
  unitsPerDay: 0,
  coverDays: null,
  leadTimeDays: 7,
  warehouse: null,
  channelSync: "healthy",
  health: "healthy",
  lastMovementAt: "2026-10-19T10:00:00.000Z",
  borderTone: "good",
  stockStatus: "healthy",
  category: { id: "c1", name: "Apparel" },
  warehouses: [
    { warehouseId: WH.delhi, warehouseName: "Delhi DC", city: "Delhi", onHand: 30, reserved: 5, available: 25, safetyStock: 10 },
    { warehouseId: WH.mumbai, warehouseName: "Mumbai DC", city: "Mumbai", onHand: 15, reserved: 0, available: 15, safetyStock: null },
  ],
  ...over,
});

const ROWS: LedgerRow[] = [row(ID.tee), row(ID.bag, { title: "Canvas Pack", sku: "BAG-1", available: 0, onHand: 0, reserved: 0, incoming: 0, damaged: 0, coverDays: 0, health: "stockout", borderTone: "bad", stockStatus: "out_of_stock", channelSync: "not_listed", category: null })];

const ledgerPage = (items: LedgerRow[], over: Partial<LedgerPage> = {}): LedgerPage => ({ items, page: 1, pageSize: 25, total: items.length, pages: 1, ...over });

const PANEL: VariantPanel = {
  product: { productId: "p-1111", variantId: ID.tee, title: "Linen Tee", sku: "TEE-M", thumbnailUrl: null },
  snapshot: { available: 40, reserved: 5, incoming: 10, onHand: 45, returned: 1, damaged: 2, quarantined: 0 },
  byLocation: [
    { warehouseId: WH.delhi, name: "Delhi DC", code: "DEL", available: 25, onHand: 30, reserved: 5, incoming: 10, returned: 0, damaged: 2, quarantined: 0 },
    { warehouseId: WH.mumbai, name: "Mumbai DC", code: "BOM", available: 15, onHand: 15, reserved: 0, incoming: 0, returned: 1, damaged: 0, quarantined: 0 },
  ],
  channelAvailability: [{ channel: { code: "amazon_in", name: "Amazon", accountId: "acc1", availability: "live" }, listingId: "l1", quantity: 30, status: "failed", lastError: "Quantity rejected", lastTriedAt: "2026-10-19T10:00:00.000Z" }],
  health: { state: "healthy", tone: "good", text: "Plenty of stock for the lead time." },
  metrics: { unitsPerDay: 1.5, coverDays: 26.6, leadTimeDays: 7, windowDays: 30, lowStockThreshold: 10 },
  recentMovements: [{ at: "2026-10-19T10:00:00.000Z", type: "inward", text: "Received 20 units", detail: "PO-1", ref: null }],
  actions: [
    { key: "adjust_stock", label: "Adjust stock", method: "POST", href: "/api/v1/inventory/adjustments", enabled: true, disabledReason: null },
    { key: "transfer", label: "Transfer", method: "POST", href: "/api/v1/inventory/transfers", enabled: true, disabledReason: null },
  ],
};

const DRAFT: StockTransfer = {
  id: "t1",
  number: "TR-7",
  fromWarehouseId: WH.delhi,
  toWarehouseId: WH.mumbai,
  status: "draft",
  notes: "weekend top-up",
  version: 1,
  createdAt: "2026-10-20T06:00:00.000Z",
  updatedAt: "2026-10-20T06:00:00.000Z",
  shippedAt: null,
  receivedAt: null,
  items: [
    { variantId: ID.tee, sku: "TEE-M", title: "Linen Tee", quantity: 4, receivedQuantity: 0, availableAtSource: 25 },
    { variantId: ID.bag, sku: "BAG-1", title: "Canvas Pack", quantity: 9, receivedQuantity: 0, availableAtSource: 3 },
  ],
};

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{`${loc.pathname}${loc.search}`}</div>;
}

function renderPage(path = "/inventory") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <InventoryPage />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const where = () => screen.getByTestId("where").textContent ?? "";
const lastLedger = () => api.ledger.mock.calls.at(-1)?.[0];
const WRITER = ["inventory:read", "inventory:write", "listings:write", "views:read", "views:write"];
const ledgerTable = async () => await screen.findByRole("table", { name: /Stock ledger/ });
const withTable = async () => within(await ledgerTable());
type User = ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  useWorkspaceStore.setState({ permissions: WRITER });
  api.kpis.mockResolvedValue(KPIS);
  api.overview.mockResolvedValue(OVERVIEW);
  api.channelSyncState.mockResolvedValue(CHANNEL_STATE);
  api.ledger.mockResolvedValue(ledgerPage(ROWS));
  api.catalogVariants.mockResolvedValue([]);
  api.allocations.mockResolvedValue([
    { variantId: ID.tee, available: 40, buffer: 4, channels: [{ channel: { code: "amazon_in", name: "Amazon", accountId: "acc1", accountName: "Amazon IN" }, listingId: "l1", allocated: 30, pushed: 30, dirty: false, mode: "sync", allocationPercent: 100, safetyBuffer: 4, maxQuantity: null }] },
  ]);
  api.movementsFeed.mockResolvedValue({
    items: [{ id: 1, at: "2026-10-19T10:00:00.000Z", variantId: ID.tee, sku: "TEE-M", productTitle: "Linen Tee", warehouse: { id: WH.delhi, name: "Delhi DC" }, type: "inward", typeLabel: "Inward", quantityDelta: 20, resultingAvailable: 60, resultingOnHand: 65, reference: { type: "po", id: "x", label: "PO-1" }, reason: null, operator: { type: "user", id: "u1", name: "Asha" } }],
    nextCursor: null,
    hasMore: false,
  });
  api.warehouses.mockResolvedValue(WAREHOUSES);
  api.panel.mockResolvedValue(PANEL);
  api.variantStock.mockResolvedValue({ variantId: ID.tee, sku: "TEE-M", warehouses: [{ warehouseId: WH.delhi, reorderLevel: 10, version: 1 }, { warehouseId: WH.mumbai, reorderLevel: null, version: 1 }] });
  api.groups.mockResolvedValue([{ id: GROUP_ID, name: "Winter restock", itemCount: 3, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }]);
  api.selectionCount.mockResolvedValue({ total: 52 });
  api.transfers.mockResolvedValue([]);
  api.presets.mockResolvedValue([]);
  api.previewAdjustment.mockResolvedValue({ currentAvailable: 25, adjustment: -5, newAvailable: 20, warnings: [], buckets: { onHand: 25, reserved: 5, incoming: 10, returned: 0, damaged: 7, quarantined: 0 } });
  vi.mocked(catalogApi.channels).mockResolvedValue([{ code: "amazon_in", name: "Amazon" }]);
});

afterEach(() => {
  useWorkspaceStore.setState({ permissions: [] });
});

describe("InventoryPage design sections, all from the server", () => {
  it("shows the stock pulse: the six buckets, master stock and the valuation", async () => {
    renderPage();
    expect(await screen.findByText(/Master stock: 9,646/)).toBeInTheDocument();
    expect(screen.getByText(/Valued at ₹1.25L \(cost\)/)).toBeInTheDocument();
    const pulse = screen.getByRole("region", { name: "The stock pulse" });
    for (const v of ["8,462", "1,184", "2,540", "184", "76", "32"]) expect(within(pulse).getByText(v)).toBeInTheDocument();
    expect(within(pulse).getByTitle("Reserved: 1,184")).toBeInTheDocument();
    expect(api.overview).toHaveBeenCalledWith(undefined, expect.anything());
  });

  it("shows the stock horizon with coverage against the lead time and the action of each row", async () => {
    const user = userEvent.setup();
    renderPage();
    const horizon = await screen.findByRole("region", { name: "Stock Horizon" });
    expect(await within(horizon).findByText("7 days")).toBeInTheDocument();
    expect(within(horizon).getByText("0 days")).toBeInTheDocument();
    expect(within(horizon).getAllByText("10d lead").length).toBeGreaterThan(0);
    expect(within(horizon).getByText("Attention")).toBeInTheDocument();
    expect(within(horizon).getByText("Stockout")).toBeInTheDocument();
    // the design puts an arrow after every action except the amber "Reorder attention required"
    expect(within(horizon).getByRole("button", { name: "Review stock →" })).toBeInTheDocument();
    await user.click(within(horizon).getByRole("button", { name: "Reorder attention required" }));
    expect(decodeURIComponent(where())).toBe(`/inventory?drawer=variant:${ID.tee}`);
  });

  it("lists the signals with their counts and filters the ledger by one", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("region", { name: "Inventory signals" });
    const low = await screen.findByRole("button", { name: "Low stock: 12" });
    expect(screen.getByRole("button", { name: "Stockout risk: 4" })).toBeInTheDocument();
    await user.click(low);
    expect(where()).toBe("/inventory?signal=low_stock");
    await waitFor(() => expect(lastLedger()).toMatchObject({ signal: "low_stock" }));
    expect(screen.getByRole("button", { name: "Low stock: 12" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Low stock: 12" }));
    expect(where()).toBe("/inventory");
  });

  it("draws a waveform only where the server has a trend", () => {
    expect(sparkPath([1, 2, 3, 2, 4, 3, 5])).toMatch(/^M0,/);
    expect(sparkPath([4, 4, 4])).toBe("M0,7 L14,7 L28,7");
    expect(sparkPath([1])).toBe("");
  });

  it("shows the advisory and its three entry points", async () => {
    const user = userEvent.setup();
    renderPage();
    const banner = await screen.findByRole("region", { name: "Inventory intelligence" });
    expect(await within(banner).findByText("Reorder attention")).toBeInTheDocument();
    expect(within(banner).getByText("2 products may stock out before their expected replenishment lead time.")).toBeInTheDocument();
    expect(within(banner).getByText("40 units · 7 days coverage · 10-day lead time")).toBeInTheDocument();
    expect(await within(banner).findByText("7 products are below their reorder level")).toBeInTheDocument();

    await user.click(within(banner).getByRole("button", { name: "Review Low Stock Items" }));
    expect(where()).toBe("/inventory?status=low_stock");
    await user.click(within(banner).getByRole("button", { name: "Review recommendations →" }));
    expect(where()).toBe("/inventory?signal=stockout_risk");
    await user.click(within(banner).getByRole("button", { name: /Linen Tee/ }));
    expect(decodeURIComponent(where())).toContain(`drawer=variant:${ID.tee}`);
  });

  it("hides the low stock recommendation when the server has nothing to recommend", async () => {
    api.kpis.mockResolvedValue({ ...KPIS, reorder: { ...KPIS.reorder, show: false } });
    renderPage();
    await screen.findByText(/Master stock/);
    await waitFor(() => expect(api.kpis).toHaveBeenCalled());
    expect(screen.queryByText("7 products are below their reorder level")).not.toBeInTheDocument();
  });

  it("shows the distribution per warehouse (not in simple mode)", async () => {
    renderPage();
    const dist = await screen.findByRole("region", { name: "Stock distribution" });
    expect(await within(dist).findByText("60%")).toBeInTheDocument();
    expect(within(dist).getByText("600 units")).toBeInTheDocument();
    expect(within(dist).getByText("Delhi DC currently holds 20% more inventory than demand patterns suggest.")).toBeInTheDocument();
    expect(within(dist).getByText("Advisory: verify Mumbai DC replenishments.")).toBeInTheDocument();
  });

  it("shows the one location at 100% in simple mode (the design section stays)", async () => {
    api.overview.mockResolvedValue({ ...OVERVIEW, mode: "simple", distribution: undefined, location: { id: WH.delhi, name: "Home Inventory" } });
    renderPage();
    await screen.findByText(/Master stock/);
    const dist = await screen.findByRole("region", { name: "Stock distribution" });
    expect(within(dist).getByText("100%")).toBeInTheDocument();
    expect(within(dist).getByText("Home Inventory")).toBeInTheDocument();
    expect(within(dist).getByText("8,462 units")).toBeInTheDocument();
  });

  it("shows the recent movements timeline and opens the full audit trail on demand", async () => {
    const user = userEvent.setup();
    renderPage();
    const timeline = await screen.findByRole("region", { name: "Recent movements" });
    expect(await within(timeline).findByText("Manual stock adjustment")).toBeInTheDocument();
    expect(within(timeline).getByText("Linen Tee +12")).toBeInTheDocument();
    expect(api.movementsFeed).not.toHaveBeenCalled();
    await user.click(within(timeline).getByRole("button", { name: "Inventory audit trail →" }));
    expect(await screen.findByText(/Ref: PO-1/)).toBeInTheDocument();
  });

  it("shows the onboarding when the business has no stock at all", async () => {
    api.overview.mockResolvedValue({ ...OVERVIEW, mode: "simple", distribution: undefined, location: { id: WH.delhi, name: "Home Inventory" }, ledger: { total: 0 } });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Your inventory starts here" })).toBeInTheDocument();
    expect(screen.getByText("All stock is managed from one location.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import products" })).toHaveAttribute("href", "/products/import");
    expect(screen.getByRole("link", { name: "Add product" })).toHaveAttribute("href", "/products/new");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an error with retry when the overview cannot be loaded", async () => {
    api.overview.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Overview exploded", status: 500 })).mockResolvedValue(OVERVIEW);
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(/Overview exploded/)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Retry" })[0] as HTMLElement);
    expect(await screen.findByText(/Master stock: 9,646/)).toBeInTheDocument();
  });
});

describe("InventoryPage ledger", () => {
  it("renders the rows with real values, cover days only where there are sales and the channel allocation", async () => {
    renderPage();
    const table = await withTable();
    expect(await table.findByRole("button", { name: "Linen Tee" })).toBeInTheDocument();
    expect(table.getByText("TEE-M")).toBeInTheDocument();
    expect(table.getByText("Apparel")).toBeInTheDocument();
    expect(table.getByText("45 on hand")).toBeInTheDocument();
    expect(table.getByText("—", { selector: "span" })).toHaveAttribute("title", "No sales data yet");
    expect(table.getByText("0d")).toBeInTheDocument();
    expect(await table.findByText("Amazon: 30 · Buffer: 4")).toBeInTheDocument();
    expect(table.getAllByText("Delhi DC").length).toBeGreaterThan(0);
    expect(table.getAllByText("+1 more").length).toBeGreaterThan(0);
    expect(table.getByText("Not listed")).toBeInTheDocument();
    expect(table.getByText("Stockout")).toBeInTheDocument();
    expect(api.allocations).toHaveBeenCalledWith([ID.tee, ID.bag], expect.anything());
    expect(screen.getByText("2 products")).toBeInTheDocument();
    expect(screen.getByText("All products · All warehouses · All channels · Any health")).toBeInTheDocument();
  });

  it("reads the whole state from the URL and sends it as ledger filters", async () => {
    renderPage(`/inventory?status=excess&q=tee&warehouse=${WH.delhi}&channel=amazon_in&health=critical&signal=slow_moving&movement=adjusted&min=1&max=50&group=${GROUP_ID}&sort=-available&page=2&size=10`);
    await waitFor(() =>
      expect(lastLedger()).toEqual({ q: "tee", stockStatus: "excess", warehouse: WH.delhi, channel: "amazon_in", health: "critical", signal: "slow_moving", movement: "adjusted", stockMin: 1, stockMax: 50, group: GROUP_ID, page: 2, pageSize: 10, sort: "-available" }),
    );
    expect(api.kpis).toHaveBeenCalledWith(WH.delhi, expect.anything());
    expect(api.overview).toHaveBeenCalledWith(WH.delhi, expect.anything());
  });

  it("maps the shell's ?health=low deep link to the low-stock tab", async () => {
    renderPage("/inventory?health=low");
    await waitFor(() => expect(lastLedger()?.stockStatus).toBe("low_stock"));
    expect(lastLedger()?.health).toBeUndefined();
  });

  it("sorts from a column header, pages and changes the page size", async () => {
    api.ledger.mockImplementation(async (q) => ledgerPage(ROWS, { total: 60, pages: 3, page: q.page ?? 1 }));
    const user = userEvent.setup();
    renderPage();
    const table = await withTable();
    await table.findByRole("button", { name: "Linen Tee" });

    await user.click(table.getByRole("button", { name: /^Available/ }));
    expect(where()).toBe("/inventory?sort=available");
    await user.click(table.getByRole("button", { name: /^Available/ }));
    expect(where()).toBe("/inventory?sort=-available");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(where()).toBe("/inventory?sort=-available&page=2");
    expect(screen.getByText("Showing 26–27 of 60 SKUs")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("SKUs per page"), "50");
    expect(where()).toBe("/inventory?sort=-available&size=50");
  });

  it("debounces the search into the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.type(screen.getByRole("searchbox", { name: "Search stock" }), "tee");
    await waitFor(() => expect(where()).toBe("/inventory?q=tee"));
    await waitFor(() => expect(lastLedger()).toMatchObject({ q: "tee" }));
  });

  it("filters by warehouse (only with several), channel, health, status (with counts), movement and signal", async () => {
    const user = userEvent.setup();
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.selectOptions(await screen.findByLabelText("Warehouse"), WH.mumbai);
    expect(where()).toBe(`/inventory?warehouse=${WH.mumbai}`);
    await user.selectOptions(screen.getByLabelText("Channel"), "amazon_in");
    expect(where()).toContain("channel=amazon_in");
    await user.selectOptions(screen.getByLabelText("Health"), "critical");
    expect(where()).toContain("health=critical");
    expect(await screen.findByRole("option", { name: "Low stock (7)" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Stock status"), "low_stock");
    expect(where()).toContain("status=low_stock");
    await user.selectOptions(screen.getByLabelText("Last movement"), "adjusted");
    expect(where()).toContain("movement=adjusted");
    await user.selectOptions(screen.getByLabelText("Signal"), "slow_moving");
    expect(where()).toContain("signal=slow_moving");
  });

  it("sets the stock range from the Stock range menu", async () => {
    const user = userEvent.setup();
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: "Stock range" }));
    await user.type(screen.getByLabelText("Min stock"), "5");
    await user.type(screen.getByLabelText("Max stock"), "20{Enter}");
    await waitFor(() => expect(where()).toBe("/inventory?min=5&max=20"));
    await waitFor(() => expect(lastLedger()).toMatchObject({ stockMin: 5, stockMax: 20 }));
  });

  it("keeps the warehouse filter of the design with a single warehouse", async () => {
    api.warehouses.mockResolvedValue(WAREHOUSES.slice(0, 1));
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await waitFor(() => expect(api.warehouses).toHaveBeenCalled());
    const filter = await screen.findByLabelText("Warehouse");
    expect(within(filter).getAllByRole("option").map((o) => o.textContent)).toEqual(["Warehouse", "Delhi DC"]);
  });

  it("exports the filtered ledger and saves the file", async () => {
    const blob = new Blob(["csv"]);
    api.exportCsv.mockResolvedValue({ blob, fileName: "inventory.csv" });
    const user = userEvent.setup();
    renderPage("/inventory?status=low_stock&q=tee");
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, "inventory.csv"));
    expect(api.exportCsv).toHaveBeenCalledWith({ q: "tee", stockStatus: "low_stock" });
  });

  it("tells when an export is too large", async () => {
    api.exportCsv.mockRejectedValue(new ApiError({ code: "PAYLOAD_TOO_LARGE", message: "More than 50000 rows match. Narrow the filters.", status: 413 }));
    const user = userEvent.setup();
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.description).toContain("Narrow the filters"));
  });
});

describe("InventoryPage states", () => {
  it("shows the empty state when the ledger is empty", async () => {
    api.ledger.mockResolvedValue(ledgerPage([]));
    renderPage();
    expect(await screen.findByRole("heading", { name: "No stock yet." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to products" })).toHaveAttribute("href", "/products");
  });

  it("shows no-match with a way back when filters hide everything", async () => {
    api.ledger.mockResolvedValue(ledgerPage([]));
    const user = userEvent.setup();
    renderPage("/inventory?status=excess");
    expect(await screen.findByRole("heading", { name: "No stock matches these filters." })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0] as HTMLElement);
    expect(where()).toBe("/inventory");
  });

  it("shows an error with retry for the ledger", async () => {
    api.ledger.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Ledger exploded", status: 500 })).mockResolvedValue(ledgerPage(ROWS));
    const user = userEvent.setup();
    renderPage();
    const alert = await screen.findByText("Ledger exploded");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await (await withTable()).findByRole("button", { name: "Linen Tee" })).toBeInTheDocument();
    expect(alert).not.toBeInTheDocument();
  });

  it("is read-only for a viewer, with the reason on every disabled control", async () => {
    useWorkspaceStore.setState({ permissions: ["inventory:read"] });
    const user = userEvent.setup();
    renderPage();
    const table = await withTable();
    await table.findByRole("button", { name: "Linen Tee" });
    expect(screen.getByRole("note")).toHaveTextContent("inventory:write");

    const headerAdjust = screen.getAllByRole("button", { name: "Adjust stock" })[0] as HTMLElement;
    expect(headerAdjust).toBeDisabled();
    expect(headerAdjust.parentElement).toHaveAttribute("title", expect.stringContaining("inventory:write"));

    await user.click(table.getByRole("button", { name: "More actions for TEE-M" }));
    const item = screen.getByRole("menuitem", { name: "Adjust stock" });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute("title", expect.stringContaining("inventory:write"));

    const sync = screen.getByRole("button", { name: "Sync all" });
    expect(sync).toBeDisabled();
    expect(sync.parentElement).toHaveAttribute("title", expect.stringContaining("listings write"));
    expect(screen.getByRole("button", { name: "Save view" })).toBeDisabled();
  });

  it("needs listings:write too for the channel sync", async () => {
    useWorkspaceStore.setState({ permissions: ["inventory:read", "inventory:write"] });
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    expect(screen.getByRole("button", { name: "Sync all" })).toBeDisabled();
  });
});

describe("InventoryPage adjust stock", () => {
  async function openAdjust(user: User) {
    renderPage();
    const table = await withTable();
    await user.click(await table.findByRole("button", { name: "More actions for TEE-M" }));
    await user.click(screen.getByRole("menuitem", { name: "Adjust stock" }));
    return await screen.findByRole("dialog", { name: "Adjust stock" });
  }
  const RESULT = { duplicate: false, movement: { id: 9 }, type: "damage" as const, result: { currentAvailable: 25, adjustment: -5, newAvailable: 20, warnings: [] }, stock: { warehouseId: WH.delhi, onHand: 25, reserved: 5, available: 20, incoming: 10, damaged: 7, returned: 0, quarantined: 0 } };

  it("previews the numbers, posts the real warehouse, type and delta with an idempotency key, then closes", async () => {
    api.adjust.mockResolvedValue(RESULT);
    const user = userEvent.setup();
    const drawer = await openAdjust(user);
    expect(within(drawer).getByText("INVENTORY / STOCK ADJUSTMENT")).toBeInTheDocument();
    expect(within(drawer).getByLabelText("SKU")).toHaveValue("TEE-M");
    expect(within(drawer).getByLabelText("Location")).toHaveValue(WH.delhi);
    await user.type(within(drawer).getByLabelText("Quantity"), "5");
    await user.type(within(drawer).getByLabelText("Optional note"), "cycle count");

    await waitFor(() => expect(api.previewAdjustment).toHaveBeenCalled());
    expect(api.previewAdjustment.mock.calls.at(-1)?.[0]).toEqual({ variantId: ID.tee, warehouseId: WH.delhi, type: "damage", quantity: 5, direction: "decrease", reason: "Damaged units", note: "cycle count" });
    expect(await within(drawer).findByText("20")).toBeInTheDocument();
    expect(within(drawer).getByText("-5")).toBeInTheDocument();

    await user.click(within(drawer).getByRole("button", { name: "Confirm adjustment" }));
    await waitFor(() => expect(api.adjust).toHaveBeenCalledTimes(1));
    expect(api.adjust.mock.calls[0]?.[0]).toEqual({ variantId: ID.tee, warehouseId: WH.delhi, type: "damage", quantity: 5, direction: "decrease", reason: "Damaged units", note: "cycle count", idempotencyKey: expect.stringMatching(/^inventory-ui-/) });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useToastStore.getState().toasts[0]?.description).toBe("TEE-M: 20 available in Delhi DC.");
    // the numbers are refreshed
    await waitFor(() => expect(api.ledger.mock.calls.length).toBeGreaterThan(1));
  });

  it("changes the type, the direction and the warehouse", async () => {
    api.adjust.mockResolvedValue({ ...RESULT, type: "correction" });
    const user = userEvent.setup();
    const drawer = await openAdjust(user);
    await user.selectOptions(within(drawer).getByLabelText("Location"), WH.mumbai);
    await user.click(within(drawer).getByRole("button", { name: "Correction" }));
    expect(within(drawer).getByLabelText("Reason")).toHaveValue("Cycle count correction");
    await user.click(within(drawer).getByLabelText("Add units"));
    await user.type(within(drawer).getByLabelText("Quantity"), "3");
    await user.click(within(drawer).getByRole("button", { name: "Confirm adjustment" }));
    await waitFor(() => expect(api.adjust).toHaveBeenCalled());
    expect(api.adjust.mock.calls[0]?.[0]).toMatchObject({ warehouseId: WH.mumbai, type: "correction", direction: "increase", quantity: 3, reason: "Cycle count correction" });
  });

  it("sends a return without a direction, restocked when asked", async () => {
    api.adjust.mockResolvedValue({ ...RESULT, type: "return" });
    const user = userEvent.setup();
    const drawer = await openAdjust(user);
    await user.click(within(drawer).getByRole("button", { name: "Return" }));
    expect(within(drawer).queryByText("Direction")).not.toBeInTheDocument();
    await user.click(within(drawer).getByLabelText(/Restock immediately/));
    await user.type(within(drawer).getByLabelText("Quantity"), "2");
    await user.click(within(drawer).getByRole("button", { name: "Confirm adjustment" }));
    await waitFor(() => expect(api.adjust).toHaveBeenCalled());
    const body = api.adjust.mock.calls[0]?.[0];
    expect(body).toMatchObject({ type: "return", quantity: 2, disposition: "restock", reason: "Customer return" });
    expect(body).not.toHaveProperty("direction");
  });

  it("offers Shrinkage as its own type: always a loss, so no direction, with its own reason", async () => {
    api.adjust.mockResolvedValue({ ...RESULT, type: "shrinkage" });
    const user = userEvent.setup();
    const drawer = await openAdjust(user);
    // the design's pills, in order, with Shrinkage before Other
    expect(within(within(drawer).getByRole("group", { name: "Adjustment type" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Damage", "Return", "Correction", "Manual adjustment", "Shrinkage", "Other"]);
    await user.click(within(drawer).getByRole("button", { name: "Shrinkage" }));
    expect(within(drawer).getByLabelText("Reason")).toHaveValue("Inventory shrinkage");
    expect(within(drawer).queryByText("Direction")).not.toBeInTheDocument();
    await user.type(within(drawer).getByLabelText("Quantity"), "26");
    expect(within(drawer).getByText("Only 25 units are available to remove in this warehouse")).toBeInTheDocument();
    await user.clear(within(drawer).getByLabelText("Quantity"));
    await user.type(within(drawer).getByLabelText("Quantity"), "3");
    await waitFor(() => expect(within(drawer).getByRole("button", { name: "Confirm adjustment" })).toBeEnabled());
    await user.click(within(drawer).getByRole("button", { name: "Confirm adjustment" }));
    await waitFor(() => expect(api.adjust).toHaveBeenCalled());
    const body = api.adjust.mock.calls[0]?.[0];
    expect(body).toMatchObject({ variantId: ID.tee, warehouseId: WH.delhi, type: "shrinkage", quantity: 3, reason: "Inventory shrinkage" });
    expect(body).not.toHaveProperty("direction");
  });

  it("needs a note for type Other", async () => {
    const user = userEvent.setup();
    const drawer = await openAdjust(user);
    await user.click(within(drawer).getByRole("button", { name: "Other" }));
    await user.type(within(drawer).getByLabelText("Reason"), "Found a box");
    await user.type(within(drawer).getByLabelText("Quantity"), "2");
    expect(within(drawer).getByRole("button", { name: "Confirm adjustment" })).toBeDisabled();
    await user.type(within(drawer).getByLabelText("Note"), "behind the shelf");
    expect(within(drawer).getByRole("button", { name: "Confirm adjustment" })).toBeEnabled();
  });

  it("refuses to remove more than is available in the warehouse before calling the server", async () => {
    const user = userEvent.setup();
    const drawer = await openAdjust(user);
    await user.type(within(drawer).getByLabelText("Quantity"), "26");
    expect(within(drawer).getByText("Only 25 units are available to remove in this warehouse")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Confirm adjustment" })).toBeDisabled();
    expect(api.adjust).not.toHaveBeenCalled();
    expect(api.previewAdjustment).not.toHaveBeenCalled();
  });

  it("shows what the dry run refuses and blocks the confirmation", async () => {
    api.previewAdjustment.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "That would go below what is reserved", status: 409 }));
    const user = userEvent.setup();
    const drawer = await openAdjust(user);
    await user.type(within(drawer).getByLabelText("Quantity"), "2");
    expect(await within(drawer).findByText("That would go below what is reserved")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Confirm adjustment" })).toBeDisabled();
  });

  it("shows a 409 inline, keeps the drawer open and retries with the same idempotency key", async () => {
    api.adjust.mockRejectedValueOnce(new ApiError({ code: "INSUFFICIENT_STOCK", message: "The change would make stock negative", status: 409 })).mockResolvedValueOnce(RESULT);
    const user = userEvent.setup();
    const drawer = await openAdjust(user);
    await user.type(within(drawer).getByLabelText("Quantity"), "1");
    await waitFor(() => expect(within(drawer).getByRole("button", { name: "Confirm adjustment" })).toBeEnabled());
    await user.click(within(drawer).getByRole("button", { name: "Confirm adjustment" }));
    expect(await within(drawer).findByText("The change would make stock negative")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Adjust stock" })).toBeInTheDocument();

    await user.click(within(drawer).getByRole("button", { name: "Confirm adjustment" }));
    await waitFor(() => expect(api.adjust).toHaveBeenCalledTimes(2));
    expect(api.adjust.mock.calls[1]?.[0].idempotencyKey).toBe(api.adjust.mock.calls[0]?.[0].idempotencyKey);
  });

  it("opens from the header and searches for the product to adjust", async () => {
    const user = userEvent.setup();
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getAllByRole("button", { name: "Adjust stock" })[0] as HTMLElement);
    const drawer = await screen.findByRole("dialog", { name: "Adjust stock" });
    expect(within(drawer).getByLabelText("SKU")).toHaveValue("");
    expect(within(drawer).getByRole("button", { name: "Confirm adjustment" })).toBeDisabled();

    await user.type(within(drawer).getByLabelText("Search for a product"), "linen");
    await waitFor(() => expect(api.ledger.mock.calls.some(([q]) => q.q === "linen" && q.pageSize === 8)).toBe(true));
    await user.click(await within(drawer).findByRole("button", { name: /Linen Tee.*TEE-M · 40 available/ }));
    expect(within(drawer).getByLabelText("SKU")).toHaveValue("TEE-M");
    expect(within(drawer).getByText("25 available here")).toBeInTheDocument();
  });

  it("finds a variant without stock rows and gives it opening stock in a chosen warehouse", async () => {
    api.catalogVariants.mockResolvedValue([{ variantId: ID.bag, productId: "p-2222", sku: "NEW-HOODIE-M", title: "Fresh Hoodie", variantName: "Black / M", barcode: null, stocked: false }]);
    api.adjust.mockResolvedValue({ ...RESULT, type: "opening_stock" });
    const user = userEvent.setup();
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getAllByRole("button", { name: "Adjust stock" })[0] as HTMLElement);
    const drawer = await screen.findByRole("dialog", { name: "Adjust stock" });
    await user.type(within(drawer).getByLabelText("Search for a product"), "hoodie");
    await waitFor(() => expect(api.catalogVariants.mock.calls.some(([q]) => q.q === "hoodie" && q.unstocked === true)).toBe(true));
    await user.click(await within(drawer).findByRole("button", { name: /Fresh Hoodie \(Black \/ M\).*NEW-HOODIE-M · no stock yet/ }));
    expect(within(drawer).getByLabelText("SKU")).toHaveValue("NEW-HOODIE-M");
    // starts on Opening stock: no direction to pick, only adds units
    expect(within(drawer).getByRole("button", { name: "Opening stock" })).toHaveAttribute("aria-pressed", "true");
    expect(within(drawer).queryByText("Direction")).not.toBeInTheDocument();
    expect(within(drawer).getByLabelText("Reason")).toHaveValue("Opening stock");
    await user.selectOptions(within(drawer).getByLabelText("Location"), WH.mumbai);
    await user.type(within(drawer).getByLabelText("Quantity"), "12");
    await waitFor(() => expect(within(drawer).getByRole("button", { name: "Confirm adjustment" })).toBeEnabled());
    await user.click(within(drawer).getByRole("button", { name: "Confirm adjustment" }));
    await waitFor(() => expect(api.adjust).toHaveBeenCalledTimes(1));
    const body = api.adjust.mock.calls[0]?.[0];
    expect(body).toMatchObject({ variantId: ID.bag, warehouseId: WH.mumbai, type: "opening_stock", quantity: 12, reason: "Opening stock" });
    expect(body).not.toHaveProperty("direction");
  });

  it("offers Opening stock only for a variant that has no stock yet", async () => {
    const user = userEvent.setup();
    const drawer = await openAdjust(user);
    expect(within(drawer).queryByRole("button", { name: "Opening stock" })).not.toBeInTheDocument();
  });

  it("cancel goes back to the product context when opened from the drawer", async () => {
    const user = userEvent.setup();
    renderPage(`/inventory?drawer=variant:${ID.tee}`);
    const drawer = await screen.findByRole("dialog");
    await user.click(await within(drawer).findByRole("button", { name: "Adjust stock" }));
    expect(await screen.findByText("INVENTORY / STOCK ADJUSTMENT")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("INVENTORY / PRODUCT CONTEXT")).toBeInTheDocument();
  });
});

describe("InventoryPage drawer", () => {
  it("opens from the row and writes ?drawer=variant:<id>", async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await withTable();
    await user.click(await table.findByRole("button", { name: "More actions for TEE-M" }));
    await user.click(screen.getByRole("menuitem", { name: "View details" }));
    expect(decodeURIComponent(where())).toBe(`/inventory?drawer=variant:${ID.tee}`);
    expect(await screen.findByText("Plenty of stock for the lead time.")).toBeInTheDocument();
  });

  it("opens from the product name", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await (await withTable()).findByRole("button", { name: "Linen Tee" }));
    expect(decodeURIComponent(where())).toBe(`/inventory?drawer=variant:${ID.tee}`);
  });

  it("opens from a deep link and shows the panel: snapshot, warehouses, channels, health, movements", async () => {
    renderPage(`/inventory?drawer=variant:${ID.tee}`);
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText("Plenty of stock for the lead time.")).toBeInTheDocument();
    expect(within(drawer).getByText("INVENTORY / PRODUCT CONTEXT")).toBeInTheDocument();
    expect(api.panel).toHaveBeenCalledWith(ID.tee, expect.anything());
    expect(within(drawer).getByText("Stock snapshot")).toBeInTheDocument();
    expect(within(drawer).getByText("Available").nextSibling).toHaveTextContent("40");
    expect(within(drawer).getByText("26.6 days")).toBeInTheDocument();
    expect(within(drawer).getByText(/Delhi DC/, { selector: "span" })).toBeInTheDocument();
    expect(within(drawer).getByText(/Mumbai DC/, { selector: "span" })).toBeInTheDocument();
    expect(within(drawer).getByText("Quantity rejected")).toBeInTheDocument();
    expect(await within(drawer).findByText("30")).toBeInTheDocument();
    expect(within(drawer).getByText("Received 20 units")).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "View product" })).toHaveAttribute("href", "/products/p-1111");
    expect(within(drawer).getByRole("link", { name: "View sync history" })).toHaveAttribute("href", "/marketplace-hub/health");
  });

  it("says so when the item does not exist", async () => {
    api.panel.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "Variant not found", status: 404 }));
    renderPage(`/inventory?drawer=variant:${ID.tee}`);
    expect(await screen.findByText(/could not be found/)).toBeInTheDocument();
  });

  it("closes and drops the param", async () => {
    const user = userEvent.setup();
    renderPage(`/inventory?drawer=variant:${ID.tee}`);
    const drawer = await screen.findByRole("dialog");
    await within(drawer).findByText("Plenty of stock for the lead time.");
    await user.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(where()).toBe("/inventory"));
  });

  it("saves a reorder level per warehouse", async () => {
    api.setReorderLevel.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage(`/inventory?drawer=variant:${ID.tee}`);
    const drawer = await screen.findByRole("dialog");
    const inputs = await within(drawer).findAllByLabelText("Reorder level");
    expect(inputs[0]).toHaveValue("10");
    expect(inputs[1]).toHaveValue("");
    await user.type(inputs[1] as HTMLElement, "8");
    await user.click(within(drawer).getAllByRole("button", { name: "Save" })[1] as HTMLElement);
    await waitFor(() => expect(api.setReorderLevel).toHaveBeenCalledWith({ variantId: ID.tee, warehouseId: WH.mumbai, reorderLevel: 8 }));
  });

  it("transfers stock between warehouses from the drawer", async () => {
    api.transfer.mockResolvedValue({ transfer: { id: "t1", number: "TR-1", status: "received" }, variant: { id: ID.tee, sku: "TEE-M", title: "Linen Tee" } });
    const user = userEvent.setup();
    renderPage(`/inventory?drawer=variant:${ID.tee}`);
    const drawer = await screen.findByRole("dialog");
    await user.click(await within(drawer).findByRole("button", { name: "Transfer" }));
    const dialogs = await screen.findAllByRole("dialog");
    const dialog = dialogs.find((d) => within(d).queryByText(/Transfer Stock: TEE-M/)) as HTMLElement;
    expect(within(dialog).getByLabelText("From warehouse")).toHaveValue(WH.delhi);
    expect(within(dialog).getByLabelText("To warehouse")).toHaveValue(WH.mumbai);
    await user.type(within(dialog).getByLabelText("Units"), "30");
    expect(within(dialog).getByText("Only 25 units are available in the source warehouse")).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Units"));
    await user.type(within(dialog).getByLabelText("Units"), "10");
    await user.click(within(dialog).getByRole("button", { name: "Transfer Stock" }));
    await waitFor(() => expect(api.transfer).toHaveBeenCalledWith({ variantId: ID.tee, fromWarehouseId: WH.delhi, toWarehouseId: WH.mumbai, quantity: 10 }));
    expect(useToastStore.getState().toasts[0]?.description).toContain("TR-1");
  });

  it("sends a double-clicked Transfer Stock once", async () => {
    api.transfer.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ transfer: { id: "t1", number: "TR-1", status: "received" }, variant: { id: ID.tee, sku: "TEE-M", title: "Linen Tee" } }), 50)));
    const user = userEvent.setup();
    renderPage(`/inventory?drawer=variant:${ID.tee}`);
    const drawer = await screen.findByRole("dialog");
    await user.click(await within(drawer).findByRole("button", { name: "Transfer" }));
    const dialogs = await screen.findAllByRole("dialog");
    const dialog = dialogs.find((d) => within(d).queryByText(/Transfer Stock: TEE-M/)) as HTMLElement;
    await user.type(within(dialog).getByLabelText("Units"), "10");
    const go = within(dialog).getByRole("button", { name: "Transfer Stock" });
    // two clicks inside one task, before the button can re-render as disabled
    act(() => {
      fireEvent.click(go);
      fireEvent.click(go);
    });
    await waitFor(() => expect(api.transfer).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.description).toContain("TR-1"));
    expect(api.transfer).toHaveBeenCalledTimes(1);
  });

  it("opens the transfer from the header and picks the product in the dialog", async () => {
    const user = userEvent.setup();
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.click(await screen.findByRole("button", { name: "Transfer stock" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Search for a product"), "linen");
    await user.click(await within(dialog).findByRole("button", { name: /Linen Tee.*TEE-M/ }));
    expect(await within(dialog).findByLabelText("From warehouse")).toHaveValue(WH.delhi);
  });

  it("keeps the transfer buttons with a single warehouse but disables them and says why", async () => {
    api.warehouses.mockResolvedValue(WAREHOUSES.slice(0, 1));
    renderPage(`/inventory?drawer=variant:${ID.tee}`);
    const drawer = await screen.findByRole("dialog");
    await within(drawer).findByRole("button", { name: "Adjust stock" });
    await waitFor(() => expect(api.warehouses).toHaveBeenCalled());
    const transfer = within(drawer).getByRole("button", { name: "Transfer" });
    await waitFor(() => expect(transfer).toBeDisabled());
    expect(transfer.parentElement).toHaveAttribute("title", "Transfers need two or more warehouses.");
    expect(screen.getAllByRole("button", { name: "Transfer stock", hidden: true })[0]).toBeDisabled();
  });

  it("disables the drawer actions for a viewer with the server reason", async () => {
    useWorkspaceStore.setState({ permissions: ["inventory:read"] });
    renderPage(`/inventory?drawer=variant:${ID.tee}`);
    const drawer = await screen.findByRole("dialog");
    const adjust = await within(drawer).findByRole("button", { name: "Adjust stock" });
    expect(adjust).toBeDisabled();
    expect(adjust.parentElement).toHaveAttribute("title", expect.stringContaining("inventory:write"));
    expect(within(drawer).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});

describe("InventoryPage selection and bulk actions", () => {
  const BULK_OK = { action: "adjust", total: 1, succeeded: 1, failed: 0, results: [{ variantId: ID.tee, sku: "TEE-M", ok: true }] };

  it("selects rows, shows the count bar and clears it", async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await withTable();
    await user.click(await table.findByLabelText("Select TEE-M"));
    const bar = screen.getByRole("toolbar", { name: "Bulk stock operations" });
    expect(within(bar).getByText("1 product selected")).toBeInTheDocument();
    await user.click(table.getByLabelText("Select all products on this page"));
    expect(within(bar).getByText("2 products selected")).toBeInTheDocument();
    await user.click(within(bar).getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("'Recommended' picks the products that need attention", async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await withTable();
    await table.findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: "Recommended" }));
    expect(within(screen.getByRole("toolbar")).getByText("1 product selected")).toBeInTheDocument();
    expect(table.getByLabelText("Select BAG-1")).toBeChecked();
    expect(table.getByLabelText("Select TEE-M")).not.toBeChecked();
  });

  it("'All matching' counts the whole filter on the server and sends the filters, not ids", async () => {
    api.bulk.mockResolvedValue({ action: "export", total: 52, succeeded: 52, failed: 0, results: [], export: { filename: "inventory-2026-10-20.csv", contentType: "text/csv", rows: 52, csv: "sku\nTEE-M" } });
    const user = userEvent.setup();
    renderPage("/inventory?status=low_stock");
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: "All matching" }));
    const bar = await screen.findByRole("toolbar");
    expect(await within(bar).findByText("52 products selected")).toBeInTheDocument();
    expect(api.selectionCount).toHaveBeenCalledWith({ stockStatus: "low_stock" }, expect.anything());

    await user.click(within(bar).getByRole("button", { name: "Export" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith({ selection: { mode: "all_matching", filters: { stockStatus: "low_stock" } }, action: "export", params: {} }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "inventory-2026-10-20.csv"));
  });

  it("adjusts the selection in bulk and tells what failed", async () => {
    api.bulk.mockResolvedValue({ action: "adjust", total: 2, succeeded: 1, failed: 1, results: [{ variantId: ID.tee, sku: "TEE-M", ok: true }, { variantId: ID.bag, sku: "BAG-1", ok: false, error: { code: "CONFLICT", message: "Only 0 units are available to remove" } }] });
    const user = userEvent.setup();
    renderPage();
    const table = await withTable();
    await user.click(await table.findByLabelText("Select all products on this page"));
    await user.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Adjust stock" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Quantity"), "3");
    await user.click(within(dialog).getByRole("button", { name: "Apply to 2 products" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith({ selection: { mode: "ids", ids: [ID.tee, ID.bag] }, action: "adjust", params: { type: "damage", quantity: 3, reason: "Damaged units", direction: "decrease" } }));
    expect(await screen.findByText("Only 0 units are available to remove")).toBeInTheDocument();
    expect(screen.getAllByText("BAG-1").length).toBeGreaterThan(1);
  });

  const BULK_TRANSFER = { action: "transfer", total: 1, succeeded: 1, failed: 0, results: [{ variantId: ID.tee, sku: "TEE-M", ok: true }], transfer: { id: "t1", number: "TR-7", status: "draft", items: 1 } };
  const BULK_TRANSFER_CALL = { selection: { mode: "ids", ids: [ID.tee] }, action: "transfer", params: { fromWarehouseId: WH.delhi, toWarehouseId: WH.mumbai, quantity: 4 } };

  it("saves the selection's transfer as a draft: nothing is submitted", async () => {
    api.bulk.mockResolvedValue(BULK_TRANSFER);
    const user = userEvent.setup();
    renderPage();
    await user.click(await (await withTable()).findByLabelText("Select TEE-M"));
    await user.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Transfer" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Units per product"), "4");
    await user.click(within(dialog).getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith(BULK_TRANSFER_CALL));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Draft saved"));
    expect(useToastStore.getState().toasts[0]?.description).toContain("TR-7");
    expect(api.submitDraft).not.toHaveBeenCalled();
  });

  it("'Transfer now' saves the draft and submits it", async () => {
    api.bulk.mockResolvedValue(BULK_TRANSFER);
    api.submitDraft.mockResolvedValue({ duplicate: false, transfer: { ...DRAFT, status: "received" } });
    const user = userEvent.setup();
    renderPage();
    await user.click(await (await withTable()).findByLabelText("Select TEE-M"));
    await user.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Transfer" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Units per product"), "4");
    await user.click(within(dialog).getByRole("button", { name: "Transfer now" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith(BULK_TRANSFER_CALL));
    await waitFor(() => expect(api.submitDraft).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Transfer submitted"));
  });

  it("keeps the draft and says why when it cannot be submitted", async () => {
    api.bulk.mockResolvedValue(BULK_TRANSFER);
    api.submitDraft.mockRejectedValue(new ApiError({ code: "INSUFFICIENT_STOCK", message: "Not enough available stock in the source warehouse: TEE-M has 1, needs 4", status: 409 }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await (await withTable()).findByLabelText("Select TEE-M"));
    await user.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Transfer" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Units per product"), "4");
    await user.click(within(dialog).getByRole("button", { name: "Transfer now" }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Draft saved, not submitted"));
    expect(useToastStore.getState().toasts[0]?.description).toContain("TR-7");
  });

  it("keeps the Transfer button with a single warehouse, disabled with the reason", async () => {
    api.warehouses.mockResolvedValue(WAREHOUSES.slice(0, 1));
    const user = userEvent.setup();
    renderPage();
    await user.click(await (await withTable()).findByLabelText("Select TEE-M"));
    await waitFor(() => expect(within(screen.getByRole("toolbar")).getByRole("button", { name: "Transfer" })).toBeDisabled());
    expect(within(screen.getByRole("toolbar")).getByRole("button", { name: "Transfer" }).parentElement).toHaveAttribute("title", "Transfers need two or more warehouses.");
  });

  it("queues a channel sync for the selection", async () => {
    api.bulk.mockResolvedValue({ action: "sync", total: 1, succeeded: 1, failed: 0, results: [], jobs: [{ accountId: "acc1", jobId: "j1", status: "queued", error: null }] });
    const user = userEvent.setup();
    renderPage();
    await user.click(await (await withTable()).findByLabelText("Select TEE-M"));
    await user.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Sync" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith({ selection: { mode: "ids", ids: [ID.tee] }, action: "sync", params: {} }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Sync queued"));
  });

  it("adds the selection to a new saved group", async () => {
    api.bulk.mockResolvedValue({ ...BULK_OK, action: "group", group: { id: "g2", name: "Spring", itemCount: 1, createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z" } });
    const user = userEvent.setup();
    renderPage();
    await user.click(await (await withTable()).findByLabelText("Select TEE-M"));
    await user.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Add to saved group" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Group"), "__new__");
    await user.type(within(dialog).getByLabelText("Group name"), "Spring");
    await user.click(within(dialog).getByRole("button", { name: "Add to group" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith({ selection: { mode: "ids", ids: [ID.tee] }, action: "group", params: { groupName: "Spring" } }));
  });

  it("disables the bulk actions for a viewer", async () => {
    useWorkspaceStore.setState({ permissions: ["inventory:read"] });
    const user = userEvent.setup();
    renderPage();
    await user.click(await (await withTable()).findByLabelText("Select TEE-M"));
    const bar = screen.getByRole("toolbar");
    for (const name of ["Adjust stock", "Transfer", "Export", "Sync", "Add to saved group"]) expect(within(bar).getByRole("button", { name })).toBeDisabled();
  });

  it("starts a new selection when the filters change", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await (await withTable()).findByLabelText("Select TEE-M"));
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Channel"), "amazon_in");
    await waitFor(() => expect(screen.queryByRole("toolbar")).not.toBeInTheDocument());
  });

  it("filters by a saved group and deletes it", async () => {
    api.deleteGroup.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.selectOptions(await screen.findByLabelText("Saved group"), GROUP_ID);
    expect(where()).toBe(`/inventory?group=${GROUP_ID}`);
    await waitFor(() => expect(lastLedger()).toMatchObject({ group: GROUP_ID }));
    await user.click(screen.getByRole("button", { name: "Delete group" }));
    await waitFor(() => expect(api.deleteGroup).toHaveBeenCalledWith(GROUP_ID));
    await waitFor(() => expect(where()).toBe("/inventory"));
  });
});

describe("InventoryPage movements feed", () => {
  const openTrail = async (user: User) => {
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Inventory audit trail →" }));
  };

  it("lists the human feed and loads more with the cursor and the type filter", async () => {
    api.movementsFeed
      .mockResolvedValueOnce({ items: [{ id: 2, at: "2026-10-19T11:00:00.000Z", variantId: ID.tee, sku: "TEE-M", productTitle: "Linen Tee", warehouse: { id: WH.delhi, name: "Delhi DC" }, type: "inward", typeLabel: "Inward", quantityDelta: 20, resultingAvailable: 60, resultingOnHand: 65, reference: { type: "po", id: "x", label: "PO-1" }, reason: null, operator: { type: "user", id: "u1", name: "Asha" } }], nextCursor: "c2", hasMore: true })
      .mockResolvedValue({ items: [{ id: 1, at: "2026-10-18T11:00:00.000Z", variantId: ID.bag, sku: "BAG-1", productTitle: "Canvas Pack", warehouse: { id: WH.delhi, name: "Delhi DC" }, type: "damage", typeLabel: "Damage", quantityDelta: -2, resultingAvailable: 0, resultingOnHand: 0, reference: null, reason: "water", operator: { type: "system", id: null, name: "System" } }], nextCursor: null, hasMore: false });
    const user = userEvent.setup();
    await openTrail(user);
    expect(await screen.findByText(/Ref: PO-1/)).toBeInTheDocument();
    expect(screen.getByText("+20 units")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("-2 units")).toBeInTheDocument();
    expect(api.movementsFeed.mock.calls[1]?.[1]).toBe("c2");
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Movement type"), "inward");
    await waitFor(() => expect(api.movementsFeed.mock.calls.at(-1)?.[0]).toEqual({ type: "inward", warehouseId: undefined }));
  });

  it("has an empty state and an error with retry", async () => {
    api.movementsFeed.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Feed down", status: 500 })).mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    const user = userEvent.setup();
    await openTrail(user);
    expect(await screen.findByText(/Feed down/)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Retry" }).at(-1) as HTMLElement);
    expect(await screen.findByText(/No stock movements of this type|No stock movements yet\./)).toBeInTheDocument();
  });
});

describe("InventoryPage channel synchronization", () => {
  it("shows master stock, one node per account and the operational counters", async () => {
    renderPage();
    const sync = await screen.findByRole("region", { name: "Inventory synchronization" });
    expect(await within(sync).findByText("Master Inventory")).toBeInTheDocument();
    expect(within(sync).getByText("1,234")).toBeInTheDocument();
    expect(within(sync).getByText("One master, 2 connected channels")).toBeInTheDocument();
    expect(within(sync).getByRole("button", { name: "Amazon IN: failed" })).toBeInTheDocument();
    expect(within(sync).getByRole("button", { name: "Flipkart: healthy" })).toBeInTheDocument();
    expect(within(sync).getByText("7 SKUs affected")).toBeInTheDocument();
    expect(within(sync).getByText("Last sync: Not reported")).toBeInTheDocument();
    expect(within(sync).getByText(/Last master inventory update:/)).toBeInTheDocument();
    expect(within(sync).getByText("7 SKUs require review")).toBeInTheDocument();
    expect(within(sync).getByText("1 channel failed to sync")).toBeInTheDocument();
    expect(within(sync).getByText("No sync running")).toBeInTheDocument();
  });

  it("opens the incident of a node, lists the affected items and retries that account only", async () => {
    api.affectedListings.mockResolvedValue({
      items: [{ variantId: ID.tee, listingId: "l1", sku: "TEE-M", title: "Linen Tee", masterAvailable: 40, channelQuantity: 38, requestedQuantity: 40, lastError: { code: "REJECTED", message: "Quantity rejected by Amazon" }, lastTriedAt: "2026-10-20T07:31:00.000Z" }],
      page: 1,
      pageSize: 10,
      total: 1,
      pages: 1,
    });
    api.startChannelSync.mockResolvedValue({ requested: 1, queued: 1, results: [{ accountId: "acc1", channel: CH("amazon_in", "Amazon", "acc1"), jobId: "j1", status: "queued", error: null }] });
    api.syncJob.mockResolvedValue({ id: "j1", status: "succeeded", marketplaceAccountId: "acc1", progress: { total: 3, done: 3, failed: 0 }, error: null, failureDetails: [] });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Amazon IN: failed" }));
    expect(await screen.findByText("Amazon inventory sync needs attention")).toBeInTheDocument();
    expect(screen.getByText("Marketplace API returned inventory update rejection")).toBeInTheDocument();
    expect(screen.getByText("7 SKUs / 14 variants")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View affected items" }));
    const dialog = await screen.findByRole("dialog", { name: /Affected items/ });
    expect(await within(dialog).findByText("Quantity rejected by Amazon")).toBeInTheDocument();
    expect(api.affectedListings).toHaveBeenCalledWith("acc1", 1, expect.anything());
    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Retry sync" }));
    await waitFor(() => expect(api.startChannelSync).toHaveBeenCalledWith("acc1"));
    expect(await screen.findByText(/The retry finished/)).toBeInTheDocument();
  }, 30_000);

  it("disables 'Retry sync' without listings:write", async () => {
    useWorkspaceStore.setState({ permissions: ["inventory:read", "inventory:write"] });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Amazon IN: failed" }));
    expect(await screen.findByRole("button", { name: "Retry sync" })).toBeDisabled();
  });

  it("shows an error with retry when the channel state cannot be loaded", async () => {
    api.channelSyncState.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "State exploded", status: 500 })).mockResolvedValue(CHANNEL_STATE);
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(/State exploded/)).toBeInTheDocument();
    const region = screen.getByRole("region", { name: "Inventory synchronization" });
    await user.click(within(region).getByRole("button", { name: "Retry" }));
    expect(await within(region).findByText("Master Inventory")).toBeInTheDocument();
  });

  it("says so when no marketplace is connected", async () => {
    api.channelSyncState.mockResolvedValue({ ...CHANNEL_STATE, channels: [], incidents: [], operations: { syncing: { channels: 0, skus: 0, progress: null }, lastSuccessAt: null, requireReview: { skus: 0, channels: 0 }, failed: { channels: 0 } } });
    renderPage();
    const sync = await screen.findByRole("region", { name: "Inventory synchronization" });
    expect(await within(sync).findByText(/No marketplace is connected yet/)).toBeInTheDocument();
    expect(within(sync).getByRole("link", { name: "Connect one" })).toHaveAttribute("href", "/marketplace-hub");
    expect(within(sync).getByText("No successful sync yet")).toBeInTheDocument();
  });
});

describe("InventoryPage 'Sync all'", () => {
  const job = (id: string, over: Partial<SyncJob>): SyncJob => ({ id, status: "queued", marketplaceAccountId: null, progress: null, error: null, failureDetails: [], ...over });

  it("queues the jobs (202), polls them to the end and shows each account result", async () => {
    api.startChannelSync.mockResolvedValue({
      requested: 3,
      queued: 2,
      results: [
        { accountId: "a1", channel: CH("amazon_in", "Amazon"), jobId: "j1", status: "queued", error: null },
        { accountId: "a2", channel: CH("flipkart", "Flipkart"), jobId: "j2", status: "queued", error: null },
        { accountId: "a3", channel: CH("shopify", "Shopify"), jobId: null, status: "failed", error: { code: "AUTH", message: "The Shopify connection expired" } },
      ],
    });
    api.syncJob.mockImplementation(async (id: string) => {
      if (id === "j1") return api.syncJob.mock.calls.filter((c) => c[0] === "j1").length < 2 ? job("j1", { status: "running", progress: { total: 10, done: 4, failed: 0 } }) : job("j1", { status: "succeeded", progress: { total: 10, done: 10, failed: 0 } });
      return job("j2", { status: "partially_failed", progress: { total: 10, done: 8, failed: 2 }, failureDetails: [{ ref: "SKU-1", message: "Quantity rejected by Flipkart" }] });
    });
    const user = userEvent.setup();
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    const ledgerCalls = api.ledger.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Sync all" }));
    const dialog = await screen.findByRole("dialog", { name: "Channel sync" });
    expect(api.startChannelSync).toHaveBeenCalledWith(undefined);
    expect(await within(dialog).findByText("The Shopify connection expired")).toBeInTheDocument();
    expect(await within(dialog).findByText("Syncing")).toBeInTheDocument();
    expect(await within(dialog).findByText("Synced", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(within(dialog).getByText("Synced with errors")).toBeInTheDocument();
    expect(within(dialog).getByText(/Quantity rejected by Flipkart/)).toBeInTheDocument();
    expect(within(dialog).getByText("Could not queue")).toBeInTheDocument();
    expect(within(dialog).getByText(/2 of 3 channels queued, all finished/)).toBeInTheDocument();
    // the screen's numbers are refreshed once the jobs finished
    await waitFor(() => expect(api.ledger.mock.calls.length).toBeGreaterThan(ledgerCalls));
  });

  it("says so when no marketplace is connected", async () => {
    api.startChannelSync.mockResolvedValue({ requested: 0, queued: 0, results: [] });
    const user = userEvent.setup();
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: "Sync all" }));
    const dialog = await screen.findByRole("dialog", { name: "Channel sync" });
    expect(await within(dialog).findByText(/No marketplace is connected yet/)).toBeInTheDocument();
  });

  it("shows a refused start and lets the user try again", async () => {
    api.startChannelSync.mockRejectedValueOnce(new ApiError({ code: "FORBIDDEN", message: "no", status: 403 })).mockResolvedValue({ requested: 0, queued: 0, results: [] });
    const user = userEvent.setup();
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: "Sync all" }));
    expect(await screen.findByText("You do not have permission to do that.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    const dialog = await screen.findByRole("dialog", { name: "Channel sync" });
    expect(await within(dialog).findByText(/No marketplace is connected yet/)).toBeInTheDocument();
  });

  it("falls back to 'queued' when the job status is not readable by the role", async () => {
    api.startChannelSync.mockResolvedValue({ requested: 1, queued: 1, results: [{ accountId: "a1", channel: CH("amazon_in", "Amazon"), jobId: "j1", status: "queued", error: null }] });
    api.syncJob.mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "no", status: 403 }));
    const user = userEvent.setup();
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: "Sync all" }));
    expect(await screen.findByText(/not available to your role/)).toBeInTheDocument();
    expect(await screen.findByText(/1 of 1 channel queued, all finished/)).toBeInTheDocument();
  });
});

describe("InventoryPage design details that have no data of their own", () => {
  it("keeps the review and failure links of the sync states even when nothing is wrong", async () => {
    api.channelSyncState.mockResolvedValue({
      ...CHANNEL_STATE,
      channels: [CHANNEL_STATE.channels[1] as ChannelSyncState["channels"][number]],
      incidents: [],
      operations: { syncing: { channels: 0, skus: 0, progress: null }, lastSuccessAt: null, requireReview: { skus: 0, channels: 0 }, failed: { channels: 0 } },
    });
    renderPage();
    const section = await screen.findByRole("region", { name: "Inventory synchronization" });
    expect(await within(section).findByText("No SKUs need review")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Review SKUs →" })).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "View failures →" })).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "View progress →" })).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "View sync history →" })).toBeInTheDocument();
  });

  it("shows the check box next to the selected count in the bulk bar", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await (await withTable()).findByLabelText("Select TEE-M"));
    const bar = screen.getByRole("toolbar");
    expect(within(bar).getByText("1 product selected")).toBeInTheDocument();
    expect(bar.querySelector(".lucide-circle-check, .lucide-check-circle-2, .lucide-circle-check-big")).not.toBeNull();
  });
});

const PRESET: InventoryPreset = {
  id: "v1",
  name: "Low in Mumbai",
  filters: { warehouse: WH.mumbai, stockStatus: "low_stock", stockMin: 5, q: "tee" },
  sort: "-available",
  shared: false,
  mine: true,
  canEdit: true,
};

describe("InventoryPage saved filters (presets)", () => {
  const openMenu = async (user: User) => {
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: /^Saved filters/ }));
    return await screen.findByRole("menu", { name: "Saved filters" });
  };

  it("lists the saved filters and applies the whole filter state and sort of one, clearing what it does not hold", async () => {
    api.presets.mockResolvedValue([PRESET]);
    const user = userEvent.setup();
    renderPage("/inventory?channel=amazon_in&health=critical");
    const menu = await openMenu(user);
    expect(await within(menu).findByText("Low in Mumbai")).toBeInTheDocument();
    expect(within(menu).getByText(/Matching "tee" · Warehouse: Mumbai DC · Low stock · Stock 5–any/)).toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: /Low in Mumbai/ }));
    await waitFor(() => expect(lastLedger()).toMatchObject({ q: "tee", stockStatus: "low_stock", warehouse: WH.mumbai, stockMin: 5, sort: "-available" }));
    expect(lastLedger()?.channel).toBeUndefined();
    expect(lastLedger()?.health).toBeUndefined();
    expect(where()).toContain("sort=-available");
    expect(where()).not.toContain("channel=");
    // the menu shows which saved filter is on
    expect(await screen.findByRole("button", { name: "Saved filters: Low in Mumbai" })).toBeInTheDocument();
  });

  it("saves the current filters and sort under a name, optionally shared", async () => {
    api.createPreset.mockResolvedValue({ ...PRESET, id: "v2", name: "Mumbai lows" });
    const user = userEvent.setup();
    renderPage(`/inventory?status=low_stock&warehouse=${WH.mumbai}&min=5&sort=sku`);
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: "Save view" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Warehouse: Mumbai DC, Low stock, Stock 5–any/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("View name"), "Mumbai lows");
    await user.click(within(dialog).getByLabelText(/Share with everyone/));
    await user.click(within(dialog).getByRole("button", { name: "Save view" }));
    await waitFor(() => expect(api.createPreset).toHaveBeenCalledWith({ name: "Mumbai lows", filters: { stockStatus: "low_stock", warehouse: WH.mumbai, stockMin: 5 }, sort: "sku", shared: true }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("View saved"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("also saves from the menu and says when the name is already taken", async () => {
    api.createPreset.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "taken", status: 409, details: { rule: "saved_view_name_taken" } }));
    const user = userEvent.setup();
    renderPage();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Save current filters..." }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save view" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("View name"), "Low in Mumbai");
    await user.click(within(dialog).getByRole("button", { name: "Save view" }));
    expect(await within(dialog).findByText("You already have a saved filter with this name. Choose another name.")).toBeInTheDocument();
    expect(api.createPreset).toHaveBeenCalledWith({ name: "Low in Mumbai", filters: {}, sort: null, shared: false });
  });

  it("deletes a saved filter", async () => {
    api.presets.mockResolvedValue([PRESET]);
    api.deletePreset.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    const menu = await openMenu(user);
    await user.click(await within(menu).findByRole("button", { name: "Delete saved filter Low in Mumbai" }));
    await waitFor(() => expect(api.deletePreset).toHaveBeenCalledWith("v1"));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Saved filter deleted"));
  });

  it("does not let a shared filter of somebody else be deleted, and saving needs views:write", async () => {
    useWorkspaceStore.setState({ permissions: ["inventory:read", "views:read"] });
    api.presets.mockResolvedValue([{ ...PRESET, shared: true, mine: false, canEdit: false }]);
    const user = userEvent.setup();
    renderPage();
    const menu = await openMenu(user);
    expect(await within(menu).findByText(/Shared/)).toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: /Delete saved filter/ })).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Save current filters..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save view" })).toBeDisabled();
  });

  it("keeps the saved product groups as their own menu", async () => {
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    const groups = await screen.findByLabelText("Saved group");
    expect(within(groups).getAllByRole("option").map((o) => o.textContent)).toEqual(["Saved groups", "Winter restock (3)"]);
  });
});

describe("InventoryPage draft transfers", () => {
  it("lists the drafts with their route, products, units and what the source cannot cover", async () => {
    api.transfers.mockResolvedValue([DRAFT]);
    renderPage();
    const section = await screen.findByRole("region", { name: "Draft transfers" });
    expect(within(section).getByText("TR-7")).toBeInTheDocument();
    expect(within(section).getByText("Draft")).toBeInTheDocument();
    expect(within(section).getByText(/Delhi DC/)).toBeInTheDocument();
    expect(within(section).getByText(/Mumbai DC/)).toBeInTheDocument();
    expect(within(section).getByText(/2 products · 13 units · TEE-M × 4, BAG-1 × 9/)).toBeInTheDocument();
    expect(within(section).getByText(/weekend top-up/)).toBeInTheDocument();
    expect(within(section).getByText(/1 line asks for more than the source holds today/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drafts (1)" })).toBeInTheDocument();
    expect(api.transfers).toHaveBeenCalledWith("draft", expect.anything());
  });

  it("shows no section (and no Drafts button) when there are no drafts", async () => {
    renderPage();
    await (await withTable()).findByRole("button", { name: "Linen Tee" });
    await waitFor(() => expect(api.transfers).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Draft transfers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Drafts/ })).not.toBeInTheDocument();
  });

  it("submits a draft from the list: the stock moves and the numbers refresh", async () => {
    api.transfers.mockResolvedValue([DRAFT]);
    api.submitDraft.mockResolvedValue({ duplicate: false, transfer: { ...DRAFT, status: "received" } });
    const user = userEvent.setup();
    renderPage();
    const section = await screen.findByRole("region", { name: "Draft transfers" });
    const ledgerCalls = api.ledger.mock.calls.length;
    await user.click(within(section).getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(api.submitDraft).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Transfer submitted"));
    expect(useToastStore.getState().toasts[0]?.description).toContain("TR-7");
    await waitFor(() => expect(api.ledger.mock.calls.length).toBeGreaterThan(ledgerCalls));
  });

  it("tells why a submit was refused and keeps the draft", async () => {
    api.transfers.mockResolvedValue([DRAFT]);
    api.submitDraft.mockRejectedValue(new ApiError({ code: "INSUFFICIENT_STOCK", message: "Not enough available stock in the source warehouse: BAG-1 has 3, needs 9", status: 409 }));
    const user = userEvent.setup();
    renderPage();
    const section = await screen.findByRole("region", { name: "Draft transfers" });
    await user.click(within(section).getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Could not submit TR-7"));
    expect(useToastStore.getState().toasts[0]?.description).toContain("BAG-1 has 3, needs 9");
    expect(within(section).getByText("TR-7")).toBeInTheDocument();
  });

  it("discards a draft after a confirmation", async () => {
    api.transfers.mockResolvedValue([DRAFT]);
    api.discardDraft.mockResolvedValue({ ...DRAFT, status: "cancelled" });
    const user = userEvent.setup();
    renderPage();
    const section = await screen.findByRole("region", { name: "Draft transfers" });
    await user.click(within(section).getByRole("button", { name: "Discard TR-7" }));
    const confirm = await screen.findByRole("dialog", { name: /Discard TR-7\?/ });
    expect(api.discardDraft).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: "Discard draft" }));
    await waitFor(() => expect(api.discardDraft).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Draft discarded"));
  });

  it("keeps a draft when the discard is cancelled", async () => {
    api.transfers.mockResolvedValue([DRAFT]);
    const user = userEvent.setup();
    renderPage();
    const section = await screen.findByRole("region", { name: "Draft transfers" });
    await user.click(within(section).getByRole("button", { name: "Discard TR-7" }));
    const confirm = await screen.findByRole("dialog", { name: /Discard TR-7\?/ });
    await user.click(within(confirm).getByRole("button", { name: "Keep draft" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.discardDraft).not.toHaveBeenCalled();
  });

  it("edits a draft: units, a removed product, the note; the save sends the version", async () => {
    api.transfers.mockResolvedValue([DRAFT]);
    api.updateDraft.mockResolvedValue({ ...DRAFT, version: 2 });
    const user = userEvent.setup();
    renderPage();
    const section = await screen.findByRole("region", { name: "Draft transfers" });
    await user.click(within(section).getByRole("button", { name: "Review and edit" }));
    const dialog = await screen.findByRole("dialog", { name: /Draft transfer TR-7/ });
    expect(within(dialog).getByLabelText("From warehouse")).toHaveValue(WH.delhi);
    expect(within(dialog).getByLabelText("To warehouse")).toHaveValue(WH.mumbai);
    expect(within(dialog).getByText(/3 available in the source/)).toBeInTheDocument();
    expect(within(dialog).getByText("More than the source holds today: submitting would be refused.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeDisabled();

    await user.clear(within(dialog).getByLabelText("Units of TEE-M"));
    await user.type(within(dialog).getByLabelText("Units of TEE-M"), "6");
    await user.click(within(dialog).getByRole("button", { name: "Remove BAG-1" }));
    expect(within(dialog).getByRole("button", { name: "Remove TEE-M" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateDraft).toHaveBeenCalledWith("t1", { fromWarehouseId: WH.delhi, toWarehouseId: WH.mumbai, items: [{ variantId: ID.tee, quantity: 6 }], notes: "weekend top-up", version: 1 }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Draft saved"));
    expect(api.submitDraft).not.toHaveBeenCalled();
  });

  it("adds a product to a draft by searching the stock", async () => {
    api.transfers.mockResolvedValue([DRAFT]);
    api.updateDraft.mockResolvedValue({ ...DRAFT, version: 2 });
    api.ledger.mockResolvedValue(ledgerPage([row("44444444-4444-4444-8444-444444444444", { title: "Wool Hat", sku: "HAT-1" })]));
    const user = userEvent.setup();
    renderPage();
    const section = await screen.findByRole("region", { name: "Draft transfers" });
    await user.click(within(section).getByRole("button", { name: "Review and edit" }));
    const dialog = await screen.findByRole("dialog", { name: /Draft transfer TR-7/ });
    await user.type(within(dialog).getByLabelText("Search for a product"), "hat");
    await user.click(await within(dialog).findByRole("button", { name: /Wool Hat.*HAT-1/ }));
    expect(await within(dialog).findByLabelText("Units of HAT-1")).toHaveValue("1");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateDraft).toHaveBeenCalled());
    expect(api.updateDraft.mock.calls[0]?.[1].items).toEqual([
      { variantId: ID.tee, quantity: 4 },
      { variantId: ID.bag, quantity: 9 },
      { variantId: "44444444-4444-4444-8444-444444444444", quantity: 1 },
    ]);
  });

  it("refuses a bad unit count before calling the server", async () => {
    api.transfers.mockResolvedValue([DRAFT]);
    const user = userEvent.setup();
    renderPage();
    const section = await screen.findByRole("region", { name: "Draft transfers" });
    await user.click(within(section).getByRole("button", { name: "Review and edit" }));
    const dialog = await screen.findByRole("dialog", { name: /Draft transfer TR-7/ });
    await user.clear(within(dialog).getByLabelText("Units of TEE-M"));
    await user.type(within(dialog).getByLabelText("Units of TEE-M"), "0");
    expect(within(dialog).getByText("Enter a whole number of units, 1 or more, for every product.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Submit transfer" })).toBeDisabled();
  });

  it("saves pending changes and then submits from the review dialog", async () => {
    api.transfers.mockResolvedValue([DRAFT]);
    api.updateDraft.mockResolvedValue({ ...DRAFT, version: 2 });
    api.submitDraft.mockResolvedValue({ duplicate: false, transfer: { ...DRAFT, status: "received" } });
    const user = userEvent.setup();
    renderPage();
    const section = await screen.findByRole("region", { name: "Draft transfers" });
    await user.click(within(section).getByRole("button", { name: "Review and edit" }));
    const dialog = await screen.findByRole("dialog", { name: /Draft transfer TR-7/ });
    await user.clear(within(dialog).getByLabelText("Units of BAG-1"));
    await user.type(within(dialog).getByLabelText("Units of BAG-1"), "3");
    await user.click(within(dialog).getByRole("button", { name: "Submit transfer" }));
    await waitFor(() => expect(api.updateDraft).toHaveBeenCalled());
    expect(api.updateDraft.mock.calls[0]?.[1].items).toEqual([{ variantId: ID.tee, quantity: 4 }, { variantId: ID.bag, quantity: 3 }]);
    await waitFor(() => expect(api.submitDraft).toHaveBeenCalledWith("t1"));
    expect(api.updateDraft.mock.invocationCallOrder[0]).toBeLessThan(api.submitDraft.mock.invocationCallOrder[0] as number);
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Transfer submitted"));
  });

  it("shows a stale draft refusal inside the dialog", async () => {
    api.transfers.mockResolvedValue([DRAFT]);
    api.updateDraft.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "This draft was changed by someone else. Reload it and try again.", status: 409, details: { rule: "stale_draft" } }));
    const user = userEvent.setup();
    renderPage();
    const section = await screen.findByRole("region", { name: "Draft transfers" });
    await user.click(within(section).getByRole("button", { name: "Review and edit" }));
    const dialog = await screen.findByRole("dialog", { name: /Draft transfer TR-7/ });
    await user.type(within(dialog).getByLabelText("Note"), "!");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText(/changed by someone else/)).toBeInTheDocument();
  });

  it("is read-only for a viewer: they can look, not submit, edit or discard", async () => {
    useWorkspaceStore.setState({ permissions: ["inventory:read"] });
    api.transfers.mockResolvedValue([DRAFT]);
    const user = userEvent.setup();
    renderPage();
    const section = await screen.findByRole("region", { name: "Draft transfers" });
    expect(within(section).getByRole("button", { name: "Submit" })).toBeDisabled();
    expect(within(section).getByRole("button", { name: "Discard TR-7" })).toBeDisabled();
    await user.click(within(section).getByRole("button", { name: "Review" }));
    const dialog = await screen.findByRole("dialog", { name: /Draft transfer TR-7/ });
    expect(within(dialog).getByLabelText("Units of TEE-M")).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Submit transfer" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Discard draft" })).toBeDisabled();
    expect(within(dialog).queryByLabelText("Search for a product")).not.toBeInTheDocument();
  });

  it("saves a single product's transfer as a draft from the transfer dialog", async () => {
    api.createDraft.mockResolvedValue(DRAFT);
    const user = userEvent.setup();
    renderPage(`/inventory?drawer=variant:${ID.tee}`);
    const drawer = await screen.findByRole("dialog");
    await user.click(await within(drawer).findByRole("button", { name: "Transfer" }));
    const dialogs = await screen.findAllByRole("dialog");
    const dialog = dialogs.find((d) => within(d).queryByText(/Transfer Stock: TEE-M/)) as HTMLElement;
    expect(within(dialog).getByRole("button", { name: "Save as draft" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Units"), "10");
    await user.click(within(dialog).getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(api.createDraft).toHaveBeenCalledWith({ fromWarehouseId: WH.delhi, toWarehouseId: WH.mumbai, items: [{ variantId: ID.tee, quantity: 10 }] }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Draft saved"));
    expect(api.transfer).not.toHaveBeenCalled();
  });
});
