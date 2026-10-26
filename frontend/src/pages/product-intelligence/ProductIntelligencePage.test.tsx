import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { IntelAction, ProductIntelligenceItem, ProductIntelligencePage as Page } from "@/types/intelligence";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  categories: vi.fn(),
  warehouses: vi.fn(),
  draftPurchaseOrders: vi.fn(),
  generatePriceProposals: vi.fn(),
}));
vi.mock("@/api/productIntelligence.api", () => ({ productIntelligenceApi: api }));

import ProductIntelligencePage from "./ProductIntelligencePage";

const CATEGORY = "33333333-3333-4333-8333-333333333333";
const WAREHOUSE = "44444444-4444-4444-8444-444444444444";
const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";

function item(over: Partial<ProductIntelligenceItem> = {}): ProductIntelligenceItem {
  return {
    id: V1,
    variantId: V1,
    productId: "p-1",
    sku: "TRV-1042",
    productName: "Travel Bag",
    categoryId: CATEGORY,
    category: "Luggage",
    salesVelocity: 4.2,
    unitsSold30d: 126,
    velocityTrend: "accelerating",
    trendChangePercent: 35,
    marginPercent: 41.5,
    sellingPriceMinor: 249900,
    costPriceMinor: 146000,
    inventory: { available: 20, onHand: 24, runwayDays: 5, ageDays: 10, leadTimeDays: 14, suggestedReorderUnits: 90 },
    competitor: { priceMinor: 274900, observedAt: "2026-10-01T00:00:00.000Z", sellerName: "RivalCo", gapPercent: 10 },
    recommendedAction: "reorder",
    confidence: { score: 85, level: "high", factors: [{ key: "sales_history", weight: 40, met: true, text: "126 unit(s) sold in the last 30 days" }] },
    reasons: [{ key: "stockout", text: "Stock runs out in 5 days, before a restock could arrive in 14.", values: {} }],
    ...over,
  };
}

const NO_SUPPLIER = item({
  id: V2,
  variantId: V2,
  sku: "OS-2048",
  productName: "Overshirt",
  recommendedAction: "hold",
  competitor: null,
  marginPercent: null,
  costPriceMinor: null,
  velocityTrend: null,
  trendChangePercent: null,
  inventory: { available: 0, onHand: 0, runwayDays: null, ageDays: null, leadTimeDays: 14, suggestedReorderUnits: null },
  reasons: [],
});

const summary = (over: Partial<Record<IntelAction, number>> = {}): Record<IntelAction, number> => ({ reorder: 3, raise_price: 2, liquidate: 1, promote: 4, hold: 5, ...over });

function page(items: ProductIntelligenceItem[], over: Partial<Page> = {}): Page {
  return { items, page: 1, pageSize: 25, total: items.length, pages: 1, summary: summary(), variantsAnalysed: 15, ...over };
}

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{`${l.pathname}${l.search}`}</div>;
}

function renderPage(url = "/product-intelligence?tab=all") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ProductIntelligencePage />
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
const lastQuery = () => api.list.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("analytics:read", "procurement:write", "pricing:write");
  api.list.mockResolvedValue(page([item(), NO_SUPPLIER]));
  api.categories.mockResolvedValue([{ id: CATEGORY, label: "Luggage" }]);
  api.warehouses.mockResolvedValue([{ id: WAREHOUSE, code: "MAIN", name: "Main warehouse", city: null, isDefault: true }]);
});

describe("ProductIntelligencePage list", () => {
  it("shows the tiles, the pills with counts and a row per variant with facts from the API", async () => {
    renderPage();
    const row = (await screen.findByText("Travel Bag")).closest("tr") as HTMLElement;
    expect(within(row).getByText("TRV-1042")).toBeInTheDocument();
    expect(within(row).getByText("Reorder")).toBeInTheDocument();
    expect(within(row).getByText("Stock runs out in 5 days, before a restock could arrive in 14.")).toBeInTheDocument();
    expect(within(row).getByText("41.5%")).toBeInTheDocument();
    expect(within(row).getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("Variants analysed")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Reorder 3$/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^All 15$/ })).toBeInTheDocument();
  });

  it("does not call a variant without a competitor price an exclusive SKU, and says what is missing", async () => {
    renderPage();
    const row = (await screen.findByText("Overshirt")).closest("tr") as HTMLElement;
    expect(within(row).getByText("No competitor price")).toBeInTheDocument();
    expect(within(row).getByText("No cost price")).toBeInTheDocument();
    expect(within(row).getByText("Out of stock")).toBeInTheDocument();
    expect(screen.queryByText(/exclusive/i)).not.toBeInTheDocument();
  });

  it("keeps the action, filters, sort and page in the URL and sends them as filter[...] params", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Travel Bag");
    expect(lastQuery()).toMatchObject({ action: undefined, sort: "priority", page: 1, pageSize: 25 });

    await user.click(screen.getByRole("tab", { name: /Liquidate/ }));
    expect(loc()).toBe("/product-intelligence?action=liquidate");
    await waitFor(() => expect(lastQuery()).toMatchObject({ action: "liquidate" }));

    await user.selectOptions(screen.getByLabelText("Sort recommendations"), "runway");
    await user.selectOptions(await screen.findByLabelText("Category"), CATEGORY);
    await waitFor(() => expect(screen.getByRole("option", { name: "Main warehouse" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Warehouse"), WAREHOUSE);
    expect(loc()).toBe(`/product-intelligence?action=liquidate&sort=runway&category=${CATEGORY}&warehouse=${WAREHOUSE}`);
    await waitFor(() => expect(lastQuery()).toMatchObject({ action: "liquidate", sort: "runway", categoryId: CATEGORY, warehouseId: WAREHOUSE }));
  });

  it("restores the state from a deep link and ignores invalid values", async () => {
    renderPage(`/product-intelligence?action=reorder&q=bag&sort=nonsense&page=3&size=50&category=not-a-uuid`);
    await screen.findByText("Travel Bag");
    expect(lastQuery()).toEqual({ action: "reorder", categoryId: undefined, warehouseId: undefined, q: "bag", sort: "priority", page: 3, pageSize: 50 });
    expect(screen.getByLabelText("Search products")).toHaveValue("bag");
  });

  it("debounces the search into the URL and goes back to page 1", async () => {
    const user = userEvent.setup();
    renderPage("/product-intelligence?page=2");
    await screen.findByText("Travel Bag");
    await user.type(screen.getByLabelText("Search products"), "bag");
    await waitFor(() => expect(loc()).toBe("/product-intelligence?q=bag"));
  });

  it("pages through numbered results", async () => {
    api.list.mockResolvedValue(page([item()], { total: 60, pages: 3 }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Travel Bag");
    expect(screen.getByText(/Showing 1–1 of 60 variants/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(loc()).toBe("/product-intelligence?page=2");
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));
    await user.selectOptions(screen.getByLabelText("variants per page"), "50");
    expect(loc()).toBe("/product-intelligence?size=50");
  });

  it("tiles open the matching action", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Travel Bag");
    await user.click(screen.getByRole("button", { name: /Pricing upside/ }));
    expect(loc()).toBe("/product-intelligence?action=raise_price");
  });
});

describe("ProductIntelligencePage states", () => {
  it("shows a skeleton while loading", () => {
    api.list.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByRole("status", { name: "Loading recommendations" })).toBeInTheDocument();
  });

  it("shows the server message and retries on an error", async () => {
    api.list.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "The analysis failed.", status: 500 }));
    const user = userEvent.setup();
    renderPage();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(screen.getByText("Product recommendations could not be loaded.")).toBeInTheDocument();
    await user.click(within(alerts.find((a) => a.textContent?.includes("Product recommendations")) as HTMLElement).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Travel Bag")).toBeInTheDocument();
  });

  it("explains an empty catalogue and links to adding a product", async () => {
    api.list.mockResolvedValue(page([], { total: 0, variantsAnalysed: 0, summary: summary({ reorder: 0, raise_price: 0, liquidate: 0, promote: 0, hold: 0 }) }));
    renderPage();
    expect(await screen.findByText("There is nothing to analyse yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a product" })).toHaveAttribute("href", "/products/new");
  });

  it("offers to clear filters when nothing matches", async () => {
    api.list.mockResolvedValue(page([], { total: 0 }));
    const user = userEvent.setup();
    renderPage("/product-intelligence?q=zzz");
    expect(await screen.findByText("No variants match your filters.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0] as HTMLElement);
    expect(loc()).toBe("/product-intelligence");
  });

  it("blocks the screen without analytics:read and does not call the API", () => {
    grant();
    renderPage();
    expect(screen.getByText("You do not have access to product intelligence.")).toBeInTheDocument();
    expect(api.list).not.toHaveBeenCalled();
  });
});

describe("ProductIntelligencePage drawer and actions", () => {
  it("opens the drawer with the facts, the reasons and links to product, listings and pricing", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Open details for Travel Bag/ }));
    expect(loc()).toBe(`/product-intelligence?open=${V1}`);
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("Why this recommendation")).toBeInTheDocument();
    expect(within(drawer).getByText("RivalCo", { exact: false })).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "Open product" })).toHaveAttribute("href", "/products/p-1");
    expect(within(drawer).getByRole("link", { name: "Listings" })).toHaveAttribute("href", "/listings?q=TRV-1042");
    expect(within(drawer).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing?q=TRV-1042");
    expect(within(drawer).getByRole("link", { name: "Procurement" })).toHaveAttribute("href", "/procurement");
  });

  it("opens the drawer from a deep link and closes it back to the list", async () => {
    const user = userEvent.setup();
    renderPage(`/product-intelligence?open=${V1}`);
    const drawer = await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(loc()).toBe("/product-intelligence");
    expect(drawer).not.toBeInTheDocument();
  });

  it("drafts a purchase order for a reorder and says which one", async () => {
    api.draftPurchaseOrders.mockResolvedValue({
      dryRun: false,
      warehouseId: WAREHOUSE,
      orders: [{ id: "po1", poNumber: "PO-0007", supplierId: "s1", supplierName: "Acme Supply", lines: 1, units: 90, totalMinor: 1314000, skus: ["TRV-1042"] }],
      unassigned: [],
    });
    const user = userEvent.setup();
    renderPage(`/product-intelligence?open=${V1}`);
    await user.click(await screen.findByRole("button", { name: /Create draft purchase order \(90 units\)/ }));
    await waitFor(() => expect(api.draftPurchaseOrders).toHaveBeenCalledWith([V1], undefined));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.description).toContain("PO-0007 (Acme Supply)"));
  });

  it("tells the user when the variant has no supplier", async () => {
    api.draftPurchaseOrders.mockResolvedValue({ dryRun: false, warehouseId: WAREHOUSE, orders: [], unassigned: [{ variantId: V1, sku: "TRV-1042", suggestedUnits: 90, reason: "no_supplier" }] });
    const user = userEvent.setup();
    renderPage(`/product-intelligence?open=${V1}`);
    await user.click(await screen.findByRole("button", { name: /Create draft purchase order/ }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("No supplier to order from"));
  });

  it("shows the API error when the purchase order cannot be created", async () => {
    api.draftPurchaseOrders.mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "Not allowed.", status: 403 }));
    const user = userEvent.setup();
    renderPage(`/product-intelligence?open=${V1}`);
    await user.click(await screen.findByRole("button", { name: /Create draft purchase order/ }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.variant).toBe("destructive"));
  });

  it("generates a price proposal for raise_price and liquidate", async () => {
    api.list.mockResolvedValue(page([item({ recommendedAction: "raise_price" })]));
    api.generatePriceProposals.mockResolvedValue({ queued: false, truncated: false, pushed: [], result: { dryRun: false, evaluated: 1, proposed: 1, autoApplied: 0, unchanged: 0, skipped: 0, failed: 0, items: [] } });
    const user = userEvent.setup();
    renderPage(`/product-intelligence?open=${V1}`);
    await user.click(await screen.findByRole("button", { name: "Generate price proposal" }));
    await waitFor(() => expect(api.generatePriceProposals).toHaveBeenCalledWith([V1]));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Price proposal created"));
  });

  it("links promote to Promotions", async () => {
    api.list.mockResolvedValue(page([item({ recommendedAction: "promote" })]));
    renderPage(`/product-intelligence?open=${V1}`);
    expect(await screen.findByRole("link", { name: "Plan a promotion" })).toHaveAttribute("href", "/promotions");
  });

  it("disables the write actions without the permission and says why", async () => {
    grant("analytics:read");
    renderPage(`/product-intelligence?open=${V1}`);
    const button = await screen.findByRole("button", { name: /Create draft purchase order/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("procurement write"));
  });
});
