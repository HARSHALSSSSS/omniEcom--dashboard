import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import InventoryPage from "./InventoryPage";
import { inventoryApi } from "@/api/inventory.api";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import { useToastStore } from "@/hooks/useToast";
import { saveBlob } from "@/components/products/list/saveBlob";
import type { InventoryKpis, LedgerPage, LedgerRow, SyncJob, VariantPanel, Warehouse } from "@/types/inventory";

vi.mock("@/api/inventory.api", () => ({
  inventoryApi: {
    kpis: vi.fn(),
    ledger: vi.fn(),
    exportCsv: vi.fn(),
    panel: vi.fn(),
    variantStock: vi.fn(),
    allocations: vi.fn(),
    movementsFeed: vi.fn(),
    warehouses: vi.fn(),
    quickAdjust: vi.fn(),
    transfer: vi.fn(),
    setReorderLevel: vi.fn(),
    startChannelSync: vi.fn(),
    syncJob: vi.fn(),
  },
}));
vi.mock("@/api/products", () => ({ catalogApi: { channels: vi.fn() }, productsApi: {} }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob: vi.fn() }));

import { catalogApi } from "@/api/products";

const api = vi.mocked(inventoryApi);

const ID = { tee: "11111111-1111-4111-8111-111111111111", bag: "22222222-2222-4222-8222-222222222222" };
const WH = { delhi: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", mumbai: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
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

const ROWS: LedgerRow[] = [row(ID.tee), row(ID.bag, { title: "Canvas Pack", sku: "BAG-1", available: 0, onHand: 0, reserved: 0, incoming: 0, damaged: 0, coverDays: 0, health: "stockout", stockStatus: "out_of_stock", channelSync: "not_listed", category: null })];

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
const WRITER = ["inventory:read", "inventory:write", "listings:write"];

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  useWorkspaceStore.setState({ permissions: WRITER });
  api.kpis.mockResolvedValue(KPIS);
  api.ledger.mockResolvedValue(ledgerPage(ROWS));
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
  vi.mocked(catalogApi.channels).mockResolvedValue([{ code: "amazon_in", name: "Amazon" }]);
});

afterEach(() => {
  useWorkspaceStore.setState({ permissions: [] });
});

describe("InventoryPage numbers", () => {
  it("shows the KPI tiles, the valuation, the sync freshness and the reorder banner from the server", async () => {
    renderPage();
    expect(await screen.findByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("Across 52 Active SKUs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Healthy Stock/ })).toHaveTextContent("40");
    expect(screen.getByRole("button", { name: /Low Stock Threshold/ })).toHaveTextContent("7");
    expect(screen.getByRole("button", { name: /Out of Stock/ })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /Excess.*Slow/ })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /Stockout Risk/ })).toHaveTextContent("5");
    expect(screen.getByText("₹1.25L")).toBeInTheDocument();
    expect(screen.getByText("2 SKUs without a cost price are not counted")).toBeInTheDocument();
    expect(screen.getByText("Last synced 2 hours ago")).toBeInTheDocument();
    expect(screen.getByText("7 products are below their reorder level")).toBeInTheDocument();
    expect(screen.getByText("Linen Tee and Canvas Pack run out within their lead time.")).toBeInTheDocument();
  });

  it("hides the banner when the server has nothing to recommend", async () => {
    api.kpis.mockResolvedValue({ ...KPIS, reorder: { ...KPIS.reorder, show: false } });
    renderPage();
    await screen.findByText("1,234");
    expect(screen.queryByText("7 products are below their reorder level")).not.toBeInTheDocument();
  });

  it("filters by the stock tiles and the stockout-risk tile, in the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("1,234");

    await user.click(screen.getByRole("button", { name: /Low Stock Threshold/ }));
    expect(where()).toBe("/inventory?status=low_stock");
    await waitFor(() => expect(lastLedger()).toMatchObject({ stockStatus: "low_stock", page: 1, pageSize: 25 }));

    await user.click(screen.getByRole("button", { name: /Stockout Risk/ }));
    expect(where()).toBe("/inventory?signal=stockout_risk");
    await waitFor(() => expect(lastLedger()).toMatchObject({ signal: "stockout_risk", stockStatus: undefined }));

    await user.click(screen.getByRole("button", { name: /Total Inventory Units/ }));
    expect(where()).toBe("/inventory");
  });

  it("the reorder banner button opens the low stock tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Review Low Stock Items" }));
    expect(where()).toBe("/inventory?status=low_stock");
  });
});

describe("InventoryPage ledger", () => {
  it("renders the rows with real values, cover days only where there are sales and the channel allocation", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "Linen Tee" })).toBeInTheDocument();
    expect(screen.getByText(/TEE-M · Barcode: —/)).toBeInTheDocument();
    expect(screen.getByText("Apparel")).toBeInTheDocument();
    expect(screen.getByText("2 damaged")).toBeInTheDocument();
    expect(screen.getByText("—", { selector: "span" })).toHaveAttribute("title", "No sales data yet");
    expect(screen.getByText("Depleted")).toBeInTheDocument();
    expect(await screen.findByText("Amazon: 30")).toBeInTheDocument();
    expect(screen.getByText("Buffer: 4")).toBeInTheDocument();
    expect(screen.getAllByText("Delhi DC").length).toBeGreaterThan(0);
    expect(screen.getByText("Not listed")).toBeInTheDocument();
    expect(api.allocations).toHaveBeenCalledWith([ID.tee, ID.bag], expect.anything());
  });

  it("reads the whole state from the URL and sends it as ledger filters", async () => {
    renderPage(`/inventory?status=excess&q=tee&warehouse=${WH.delhi}&channel=amazon_in&health=critical&signal=slow_moving&movement=adjusted&min=1&max=50&sort=-available&page=2&size=10`);
    await waitFor(() =>
      expect(lastLedger()).toEqual({ q: "tee", stockStatus: "excess", warehouse: WH.delhi, channel: "amazon_in", health: "critical", signal: "slow_moving", movement: "adjusted", stockMin: 1, stockMax: 50, page: 2, pageSize: 10, sort: "-available" }),
    );
    expect(api.kpis).toHaveBeenCalledWith(WH.delhi, expect.anything());
  });

  it("sorts from a column header, pages and changes the page size", async () => {
    api.ledger.mockImplementation(async (q) => ledgerPage(ROWS, { total: 60, pages: 3, page: q.page ?? 1 }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("button", { name: "Linen Tee" });

    await user.click(screen.getByRole("button", { name: /^Available/ }));
    expect(where()).toBe("/inventory?sort=available");
    await user.click(screen.getByRole("button", { name: /^Available/ }));
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
    await screen.findByRole("button", { name: "Linen Tee" });
    await user.type(screen.getByRole("searchbox", { name: "Search stock" }), "tee");
    await waitFor(() => expect(where()).toBe("/inventory?q=tee"));
    await waitFor(() => expect(lastLedger()).toMatchObject({ q: "tee" }));
  });

  it("filters by warehouse (only with several) and channel", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("button", { name: "Linen Tee" });
    await user.selectOptions(await screen.findByLabelText("Warehouse"), WH.mumbai);
    expect(where()).toBe(`/inventory?warehouse=${WH.mumbai}`);
    await user.selectOptions(screen.getByLabelText("Channel"), "amazon_in");
    expect(where()).toContain("channel=amazon_in");
  });

  it("has no warehouse filter with a single warehouse", async () => {
    api.warehouses.mockResolvedValue(WAREHOUSES.slice(0, 1));
    renderPage();
    await screen.findByRole("button", { name: "Linen Tee" });
    await waitFor(() => expect(api.warehouses).toHaveBeenCalled());
    expect(screen.queryByLabelText("Warehouse")).not.toBeInTheDocument();
  });

  it("exports the filtered ledger and saves the file", async () => {
    const blob = new Blob(["csv"]);
    api.exportCsv.mockResolvedValue({ blob, fileName: "inventory.csv" });
    const user = userEvent.setup();
    renderPage("/inventory?status=low_stock&q=tee");
    await screen.findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, "inventory.csv"));
    expect(api.exportCsv).toHaveBeenCalledWith({ q: "tee", stockStatus: "low_stock" });
  });

  it("tells when an export is too large", async () => {
    api.exportCsv.mockRejectedValue(new ApiError({ code: "PAYLOAD_TOO_LARGE", message: "More than 50000 rows match. Narrow the filters.", status: 413 }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.description).toContain("Narrow the filters"));
  });
});

describe("InventoryPage states", () => {
  it("shows the empty state when there is no stock at all", async () => {
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

  it("shows an error with retry for the ledger and for the tiles", async () => {
    api.ledger.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Ledger exploded", status: 500 })).mockResolvedValue(ledgerPage(ROWS));
    api.kpis.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "KPI exploded", status: 500 })).mockResolvedValue(KPIS);
    const user = userEvent.setup();
    renderPage();
    const alert = await screen.findByText("Ledger exploded");
    expect(await screen.findByText(/KPI exploded/)).toBeInTheDocument();
    const retries = screen.getAllByRole("button", { name: "Retry" });
    for (const r of retries) await user.click(r);
    expect(await screen.findByRole("button", { name: "Linen Tee" })).toBeInTheDocument();
    expect(await screen.findByText("1,234")).toBeInTheDocument();
    expect(alert).not.toBeInTheDocument();
  });

  it("is read-only for a viewer, with the reason on every disabled control", async () => {
    useWorkspaceStore.setState({ permissions: ["inventory:read"] });
    renderPage();
    await screen.findByRole("button", { name: "Linen Tee" });
    expect(screen.getByRole("note")).toHaveTextContent("inventory:write");
    for (const b of screen.getAllByRole("button", { name: /Adjust stock of/ })) {
      expect(b).toBeDisabled();
      expect(b.parentElement).toHaveAttribute("title", expect.stringContaining("inventory:write"));
    }
    const sync = screen.getByRole("button", { name: /Sync All Channels/ });
    expect(sync).toBeDisabled();
    expect(sync.parentElement).toHaveAttribute("title", expect.stringContaining("listings write"));
  });

  it("needs listings:write too for the channel sync", async () => {
    useWorkspaceStore.setState({ permissions: ["inventory:read", "inventory:write"] });
    renderPage();
    await screen.findByRole("button", { name: "Linen Tee" });
    expect(screen.getByRole("button", { name: /Sync All Channels/ })).toBeDisabled();
  });
});

describe("InventoryPage adjust stock", () => {
  async function openAdjust(user: ReturnType<typeof userEvent.setup>) {
    renderPage();
    await screen.findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: "Adjust stock of TEE-M" }));
    return await screen.findByRole("dialog");
  }

  it("posts the real warehouse, reason and delta with an idempotency key, then shows the new available", async () => {
    api.quickAdjust.mockResolvedValue({ duplicate: false, variant: { id: ID.tee, sku: "TEE-M", title: "Linen Tee" }, warehouse: { id: WH.delhi, name: "Delhi DC" }, result: { currentAvailable: 25, adjustment: 5, newAvailable: 30 } });
    const user = userEvent.setup();
    const dialog = await openAdjust(user);
    expect(within(dialog).getByLabelText("Warehouse")).toHaveValue(WH.delhi);
    await user.type(within(dialog).getByLabelText("Units"), "5");
    expect(within(dialog).getByText("Available here after: 30")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Note (optional)"), "cycle count");
    await user.click(within(dialog).getByRole("button", { name: "Apply Adjustment" }));

    await waitFor(() => expect(api.quickAdjust).toHaveBeenCalledTimes(1));
    expect(api.quickAdjust.mock.calls[0]?.[0]).toEqual({ variantId: ID.tee, warehouseId: WH.delhi, reason: "audit_correction", quantityDelta: 5, notes: "cycle count", idempotencyKey: expect.stringMatching(/^inventory-ui-/) });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useToastStore.getState().toasts[0]?.description).toBe("TEE-M: 30 available in Delhi DC.");
    // the numbers are refreshed
    await waitFor(() => expect(api.ledger.mock.calls.length).toBeGreaterThan(1));
  });

  it("signs the delta by reason and picks another warehouse", async () => {
    api.quickAdjust.mockResolvedValue({ duplicate: false, variant: { id: ID.tee, sku: "TEE-M", title: "Linen Tee" }, warehouse: { id: WH.mumbai, name: "Mumbai DC" }, result: { currentAvailable: 15, adjustment: -3, newAvailable: 12 } });
    const user = userEvent.setup();
    const dialog = await openAdjust(user);
    await user.selectOptions(within(dialog).getByLabelText("Warehouse"), WH.mumbai);
    await user.selectOptions(within(dialog).getByLabelText("Reason for adjustment"), "damaged");
    expect(within(dialog).queryByText("Direction")).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Units"), "3");
    await user.click(within(dialog).getByRole("button", { name: "Apply Adjustment" }));
    await waitFor(() => expect(api.quickAdjust).toHaveBeenCalled());
    expect(api.quickAdjust.mock.calls[0]?.[0]).toMatchObject({ warehouseId: WH.mumbai, reason: "damaged", quantityDelta: -3 });
  });

  it("refuses to remove more than is available in the warehouse before calling the server", async () => {
    const user = userEvent.setup();
    const dialog = await openAdjust(user);
    await user.click(within(dialog).getByLabelText("Remove units"));
    await user.type(within(dialog).getByLabelText("Units"), "26");
    expect(within(dialog).getByText("Only 25 units are available to remove in this warehouse")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Apply Adjustment" })).toBeDisabled();
    expect(api.quickAdjust).not.toHaveBeenCalled();
  });

  it("shows a 409 inline, keeps the dialog open and retries with the same idempotency key", async () => {
    api.quickAdjust
      .mockRejectedValueOnce(new ApiError({ code: "INSUFFICIENT_STOCK", message: "The change would make stock negative", status: 409 }))
      .mockResolvedValueOnce({ duplicate: false, variant: { id: ID.tee, sku: "TEE-M", title: "Linen Tee" }, warehouse: { id: WH.delhi, name: "Delhi DC" }, result: { currentAvailable: 25, adjustment: -1, newAvailable: 24 } });
    const user = userEvent.setup();
    const dialog = await openAdjust(user);
    await user.click(within(dialog).getByLabelText("Remove units"));
    await user.type(within(dialog).getByLabelText("Units"), "1");
    await user.click(within(dialog).getByRole("button", { name: "Apply Adjustment" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The change would make stock negative");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Apply Adjustment" }));
    await waitFor(() => expect(api.quickAdjust).toHaveBeenCalledTimes(2));
    expect(api.quickAdjust.mock.calls[1]?.[0].idempotencyKey).toBe(api.quickAdjust.mock.calls[0]?.[0].idempotencyKey);
  });
});

describe("InventoryPage drawer", () => {
  it("opens from the row and writes ?drawer=variant:<id>", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Open details of TEE-M" }));
    expect(decodeURIComponent(where())).toBe(`/inventory?drawer=variant:${ID.tee}`);
    expect(await screen.findByText("Plenty of stock for the lead time.")).toBeInTheDocument();
  });

  it("opens from a deep link and shows the panel: snapshot, warehouses, channels, metrics, movements", async () => {
    renderPage(`/inventory?drawer=variant:${ID.tee}`);
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText("Plenty of stock for the lead time.")).toBeInTheDocument();
    expect(api.panel).toHaveBeenCalledWith(ID.tee, expect.anything());
    expect(within(drawer).getByText("Total Available").nextSibling).toHaveTextContent("40 units");
    expect(within(drawer).getByText("26.6 days")).toBeInTheDocument();
    expect(within(drawer).getByText("Delhi DC")).toBeInTheDocument();
    expect(within(drawer).getByText("Mumbai DC")).toBeInTheDocument();
    expect(within(drawer).getByText("Quantity rejected")).toBeInTheDocument();
    expect(await within(drawer).findByText("30")).toBeInTheDocument();
    expect(within(drawer).getByText("Received 20 units")).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "View product" })).toHaveAttribute("href", "/products/p-1111");
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
    await user.click(await screen.findByRole("button", { name: "Transfer Between Warehouses" }));
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

  it("offers no transfer with a single warehouse", async () => {
    api.warehouses.mockResolvedValue(WAREHOUSES.slice(0, 1));
    renderPage(`/inventory?drawer=variant:${ID.tee}`);
    await screen.findByRole("button", { name: "Adjust Available Stock" });
    await waitFor(() => expect(api.warehouses).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Transfer Between Warehouses" })).not.toBeInTheDocument();
  });

  it("disables the drawer actions for a viewer with the server reason", async () => {
    useWorkspaceStore.setState({ permissions: ["inventory:read"] });
    renderPage(`/inventory?drawer=variant:${ID.tee}`);
    const adjust = await screen.findByRole("button", { name: "Adjust Available Stock" });
    expect(adjust).toBeDisabled();
    expect(adjust.parentElement).toHaveAttribute("title", expect.stringContaining("inventory:write"));
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});

describe("InventoryPage movements feed", () => {
  it("lists the human feed and loads more with the cursor and the type filter", async () => {
    api.movementsFeed
      .mockResolvedValueOnce({ items: [{ id: 2, at: "2026-10-19T11:00:00.000Z", variantId: ID.tee, sku: "TEE-M", productTitle: "Linen Tee", warehouse: { id: WH.delhi, name: "Delhi DC" }, type: "inward", typeLabel: "Inward", quantityDelta: 20, resultingAvailable: 60, resultingOnHand: 65, reference: { type: "po", id: "x", label: "PO-1" }, reason: null, operator: { type: "user", id: "u1", name: "Asha" } }], nextCursor: "c2", hasMore: true })
      .mockResolvedValue({ items: [{ id: 1, at: "2026-10-18T11:00:00.000Z", variantId: ID.bag, sku: "BAG-1", productTitle: "Canvas Pack", warehouse: { id: WH.delhi, name: "Delhi DC" }, type: "damage", typeLabel: "Damage", quantityDelta: -2, resultingAvailable: 0, resultingOnHand: 0, reference: null, reason: "water", operator: { type: "system", id: null, name: "System" } }], nextCursor: null, hasMore: false });
    const user = userEvent.setup();
    renderPage();
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
    renderPage();
    expect(await screen.findByText(/Feed down/)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Retry" }).at(-1) as HTMLElement);
    expect(await screen.findByText(/No stock movements/)).toBeInTheDocument();
  });
});

describe("InventoryPage channel sync", () => {
  const job = (id: string, over: Partial<SyncJob>): SyncJob => ({ id, status: "queued", marketplaceAccountId: null, progress: null, error: null, failureDetails: [], ...over });
  const CH = (code: string, name: string) => ({ code, name, accountId: null, availability: "live" as const });

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
    await screen.findByRole("button", { name: "Linen Tee" });
    const ledgerCalls = api.ledger.mock.calls.length;

    await user.click(screen.getByRole("button", { name: /Sync All Channels/ }));
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
    await screen.findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: /Sync All Channels/ }));
    expect(await screen.findByText(/No marketplace is connected yet/)).toBeInTheDocument();
  });

  it("shows a refused start and lets the user try again", async () => {
    api.startChannelSync.mockRejectedValueOnce(new ApiError({ code: "FORBIDDEN", message: "no", status: 403 })).mockResolvedValue({ requested: 0, queued: 0, results: [] });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: /Sync All Channels/ }));
    expect(await screen.findByText("You do not have permission to do that.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/No marketplace is connected yet/)).toBeInTheDocument();
  });

  it("falls back to 'queued' when the job status is not readable by the role", async () => {
    api.startChannelSync.mockResolvedValue({ requested: 1, queued: 1, results: [{ accountId: "a1", channel: CH("amazon_in", "Amazon"), jobId: "j1", status: "queued", error: null }] });
    api.syncJob.mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "no", status: 403 }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("button", { name: "Linen Tee" });
    await user.click(screen.getByRole("button", { name: /Sync All Channels/ }));
    expect(await screen.findByText(/not available to your role/)).toBeInTheDocument();
    expect(await screen.findByText(/1 of 1 channel queued, all finished/)).toBeInTheDocument();
  });
});
