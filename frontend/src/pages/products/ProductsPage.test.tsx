import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import ProductsPage from "./ProductsPage";
import { catalogApi } from "@/api/products";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import { useToastStore } from "@/hooks/useToast";
import { saveBlob } from "@/components/products/list/saveBlob";
import type { BulkResponse, CatalogPage, CatalogProduct, CatalogStats, SavedView } from "@/types/product";

vi.mock("@/api/products", () => ({
  catalogApi: {
    stats: vi.fn(),
    list: vi.fn(),
    bulk: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    exportCsv: vi.fn(),
    queueExport: vi.fn(),
    dataJob: vi.fn(),
    downloadDataJob: vi.fn(),
    views: vi.fn(),
    createView: vi.fn(),
    deleteView: vi.fn(),
    categoryTree: vi.fn(),
    channels: vi.fn(),
  },
  productsApi: {},
}));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob: vi.fn() }));

const api = vi.mocked(catalogApi);

const CATEGORY_ID = "3f1a2b4c-1111-4a22-8b33-444455556666";
const ID = {
  bag: "11111111-1111-4111-8111-111111111111",
  pack: "22222222-2222-4222-8222-222222222222",
  shirt: "33333333-3333-4333-8333-333333333333",
  organizer: "44444444-4444-4444-8444-444444444444",
};

const product = (id: string, over: Omit<Partial<CatalogProduct>, "summary"> & { summary?: Partial<CatalogProduct["summary"]> } = {}): CatalogProduct => {
  const { summary, ...core } = over;
  return {
    id,
    productCode: "TRV-1042",
    title: "Premium Travel Bag",
    categoryId: CATEGORY_ID,
    productType: "physical",
    status: "active",
    variantCount: 4,
    version: 1,
    updatedAt: "2026-10-19T10:00:00.000Z",
    ...core,
    summary: {
      thumbnailUrl: null,
      skuFamily: "TRV-1042",
      variantCount: 4,
      availableUnits: 124,
      inventoryStatus: "healthy",
      channels: [
        { code: "amazon_in", name: "Amazon", listingStatus: "attention" },
        { code: "shopify", name: "Shopify", listingStatus: "active" },
      ],
      publishReadinessPct: 100,
      hint: { key: "listing_attention", text: "1 listing needs attention" },
      primaryAction: { key: "open", href: `/products/${id}` },
      ...summary,
    },
  };
};

const FIXTURE: CatalogProduct[] = [
  product(ID.bag),
  product(ID.pack, {
    title: "Classic Backpack",
    summary: { skuFamily: "BP-1021", variantCount: 6, availableUnits: 8, inventoryStatus: "low", channels: [{ code: "amazon_in", name: "Amazon", listingStatus: "active" }], hint: { key: "coverage", text: "Stock coverage: 2 days" }, primaryAction: { key: "review_inventory", href: "/inventory?health=low" } },
  }),
  product(ID.shirt, {
    title: "Cotton Overshirt",
    summary: { skuFamily: "OS-2048", availableUnits: 0, inventoryStatus: "out", hint: { key: "lost", text: "Potential lost sales" }, primaryAction: { key: "update_inventory", href: "/inventory?health=out" } },
  }),
  product(ID.organizer, {
    title: "Travel Organizer Set",
    status: "draft",
    summary: { skuFamily: "ORG-3102", channels: [], publishReadinessPct: 68, availableUnits: 0, hint: { key: "draft", text: "Images and description missing" }, primaryAction: { key: "continue_editing", href: `/products/${ID.organizer}/edit` } },
  }),
];

const page = (items: CatalogProduct[], over: Partial<CatalogPage> = {}): CatalogPage => ({ items, page: 1, pageSize: 24, total: items.length, pages: 1, ...over });

const STATS: CatalogStats = {
  products: 427,
  variants: 1286,
  activeProducts: 300,
  activeVariants: 1042,
  draft: 18,
  archived: 5,
  needsAttention: 7,
  tabs: { all: 427, active: 300, draft: 18, archived: 5, needsAttention: 7 },
};

const VIEW = (over: Partial<SavedView> = {}): SavedView => ({
  id: "v1",
  screen: "products",
  name: "Low stock drafts",
  filters: { status: "draft", inventory: "low" },
  sort: "-inventory",
  shared: false,
  createdBy: "u1",
  mine: true,
  canEdit: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  version: 1,
  ...over,
});

const bulkResponse = (over: Partial<BulkResponse>): BulkResponse => ({
  action: "archive",
  summary: { total: 2, succeeded: 1, failed: 1 },
  results: [],
  ...over,
});

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{`${loc.pathname}${loc.search}`}</div>;
}

function renderPage(path = "/products") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <ProductsPage />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const lastList = () => api.list.mock.calls.at(-1)?.[0];
const where = () => screen.getByTestId("where").textContent ?? "";
const WRITER = ["products:read", "products:write", "views:write", "imports:write"];

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  useWorkspaceStore.setState({ permissions: [...WRITER, "products:delete"] });
  api.stats.mockResolvedValue(STATS);
  api.list.mockResolvedValue(page(FIXTURE));
  api.views.mockResolvedValue([]);
  api.categoryTree.mockResolvedValue([
    { id: CATEGORY_ID, parentId: null, name: "Bags", slug: "bags", path: "bags", children: [{ id: "5a1a2b4c-1111-4a22-8b33-444455556666", parentId: CATEGORY_ID, name: "Backpacks", slug: "backpacks", path: "bags/backpacks", children: [] }] },
  ]);
  api.channels.mockResolvedValue([
    { code: "amazon_in", name: "Amazon" },
    { code: "shopify", name: "Shopify" },
  ]);
});

afterEach(() => {
  useWorkspaceStore.setState({ permissions: [] });
});

const cardOf = (title: string) => screen.getByText(title).closest("[data-testid='product-card']") as HTMLElement;

describe("ProductsPage list", () => {
  it("renders the cards from the API summary block", async () => {
    renderPage();
    await screen.findByText("Premium Travel Bag");

    const bag = within(cardOf("Premium Travel Bag"));
    expect(bag.getByText("TRV-1042 · 4 variants")).toBeInTheDocument();
    expect(bag.getByText("Active")).toBeInTheDocument();
    expect(bag.getByText("124")).toBeInTheDocument();
    expect(bag.getByText("Available units")).toBeInTheDocument();
    expect(bag.getByText("Amazon / Shopify")).toBeInTheDocument();
    expect(bag.getByText("1 listing needs attention")).toBeInTheDocument();
    expect(bag.getByRole("button", { name: /open product/i })).toBeInTheDocument();

    const pack = within(cardOf("Classic Backpack"));
    expect(pack.getByText("Low stock")).toBeInTheDocument();
    expect(pack.getByText("Stock coverage: 2 days")).toBeInTheDocument();
    expect(pack.getByRole("button", { name: /review inventory/i })).toBeInTheDocument();

    expect(within(cardOf("Cotton Overshirt")).getByText("Out of stock")).toBeInTheDocument();
    expect(within(cardOf("Cotton Overshirt")).getByRole("button", { name: /update inventory/i })).toBeInTheDocument();

    const draft = within(cardOf("Travel Organizer Set"));
    expect(draft.getByText("Draft")).toBeInTheDocument();
    expect(draft.getByText("68%")).toBeInTheDocument();
    expect(draft.getByText("Publish readiness")).toBeInTheDocument();
    expect(draft.getByText("Not published")).toBeInTheDocument();
    expect(draft.getByRole("button", { name: /continue editing/i })).toBeInTheDocument();
  });

  it("shows the KPI strip and the tab counts from /products/stats, and no literal demo numbers", async () => {
    renderPage();
    await screen.findByText("Premium Travel Bag");

    const totals = within(screen.getByLabelText("Catalog totals"));
    expect(totals.getByText("427")).toBeInTheDocument();
    expect(totals.getByText("1,286")).toBeInTheDocument();
    expect(totals.getByText("1,042")).toBeInTheDocument();
    expect(totals.getByText("18")).toBeInTheDocument();
    expect(totals.getByText("7")).toBeInTheDocument();

    const tabs = within(screen.getByRole("tablist"));
    expect(tabs.getByRole("tab", { name: /^All products\s*427/ })).toBeInTheDocument();
    expect(tabs.getByRole("tab", { name: /^Active\s*300/ })).toBeInTheDocument();
    expect(tabs.getByRole("tab", { name: /^Draft\s*18/ })).toBeInTheDocument();
    expect(tabs.getByRole("tab", { name: /^Archived\s*5/ })).toBeInTheDocument();
    expect(tabs.getByRole("tab", { name: /^Needs attention\s*7/ })).toBeInTheDocument();
  });

  it("sends filter[...] params for the tab and keeps status out of the stats call", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Premium Travel Bag");
    expect(lastList()).toEqual({ page: 1, pageSize: 24 });

    await user.click(screen.getByRole("tab", { name: /^Draft/ }));
    await waitFor(() => expect(lastList()).toMatchObject({ status: "draft" }));
    expect(where()).toBe("/products?tab=draft");
    expect(api.stats.mock.calls.every(([f]) => !("status" in f) || f.status === undefined)).toBe(true);

    await user.click(screen.getByRole("tab", { name: /^Needs attention/ }));
    await waitFor(() => expect(lastList()).toMatchObject({ needsAttention: true }));
    expect(lastList()?.status).toBeUndefined();
    expect(where()).toBe("/products?tab=attention");

    await user.click(screen.getByRole("tab", { name: /^All products/ }));
    await waitFor(() => expect(where()).toBe("/products"));
  });

  it("restores tab, search, filters, sort and page from the URL", async () => {
    renderPage(`/products?tab=draft&q=bag&inventory=low&type=physical&channel=amazon_in&category=${CATEGORY_ID}&sort=-title&page=3&size=12`);
    await screen.findByText("Premium Travel Bag");
    expect(lastList()).toEqual({
      q: "bag",
      status: "draft",
      inventory: "low",
      productType: "physical",
      channel: "amazon_in",
      categoryId: CATEGORY_ID,
      sort: "-title",
      page: 3,
      pageSize: 12,
    });
    expect(screen.getByLabelText("Search products")).toHaveValue("bag");
    expect(screen.getByText("Inventory: Low stock")).toBeInTheDocument();
    expect(screen.getByText("Type: Physical")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Draft/ })).toHaveAttribute("aria-selected", "true");
    // narrowed stats: the same filters, never the tab's status
    expect(api.stats).toHaveBeenCalledWith({ q: "bag", inventory: "low", productType: "physical", channel: "amazon_in", categoryId: CATEGORY_ID }, expect.anything());
  });

  it("ignores values the API would reject", async () => {
    renderPage("/products?tab=bogus&inventory=lots&type=kit&category=not-a-uuid&sort=price&page=-4&size=7");
    await screen.findByText("Premium Travel Bag");
    expect(lastList()).toEqual({ page: 1, pageSize: 24 });
  });

  it("searches after a pause and writes q to the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.type(screen.getByLabelText("Search products"), "TRV-10");
    await waitFor(() => expect(lastList()).toMatchObject({ q: "TRV-10" }));
    expect(where()).toBe("/products?q=TRV-10");

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(where()).toBe("/products"));
    expect(screen.getByLabelText("Search products")).toHaveValue("");
  });

  it("filters by category, channel, inventory and type with chips that can be removed", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Premium Travel Bag");

    await user.click(screen.getByRole("button", { name: "Category" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Bags > Backpacks" }));
    await waitFor(() => expect(lastList()).toMatchObject({ categoryId: "5a1a2b4c-1111-4a22-8b33-444455556666" }));
    expect(screen.getByText("Category: Bags > Backpacks")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Channel" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Amazon" }));
    await waitFor(() => expect(lastList()).toMatchObject({ channel: "amazon_in" }));

    await user.click(screen.getByRole("button", { name: "Inventory" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Out of stock" }));
    await waitFor(() => expect(lastList()).toMatchObject({ inventory: "out" }));

    await user.click(screen.getByRole("button", { name: "Product type" }));
    expect(screen.getByRole("menuitemradio", { name: "Bundle / Kit" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: /simple|variable/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitemradio", { name: "Digital" }));
    await waitFor(() => expect(lastList()).toMatchObject({ productType: "digital" }));

    await user.click(screen.getByRole("button", { name: "Remove filter Inventory: Out of stock" }));
    await waitFor(() => expect(lastList()?.inventory).toBeUndefined());

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(where()).toBe("/products"));
  });

  it("sorts with the API's sort values", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: /last updated/i }));
    await user.click(screen.getByRole("menuitemradio", { name: "Inventory low to high" }));
    await waitFor(() => expect(lastList()).toMatchObject({ sort: "inventory" }));
    expect(where()).toBe("/products?sort=inventory");

    await user.click(screen.getByRole("button", { name: /inventory low to high/i }));
    await user.click(screen.getByRole("menuitemradio", { name: "Product name Z-A" }));
    await waitFor(() => expect(lastList()).toMatchObject({ sort: "-title" }));
  });

  it("pages through numbered pages and resets to page 1 when a filter changes", async () => {
    const user = userEvent.setup();
    api.list.mockResolvedValue(page(FIXTURE, { total: 60, pages: 3 }));
    renderPage();
    await screen.findByText("Premium Travel Bag");
    expect(screen.getByText("Showing 1–4 of 60 products")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastList()).toMatchObject({ page: 2 }));
    expect(where()).toBe("/products?page=2");

    await user.selectOptions(screen.getByLabelText("Products per page"), "12");
    await waitFor(() => expect(lastList()).toMatchObject({ pageSize: 12, page: 1 }));

    await user.click(screen.getByRole("button", { name: "Page 3" }));
    await waitFor(() => expect(lastList()).toMatchObject({ page: 3 }));
    await user.click(screen.getByRole("tab", { name: /^Active/ }));
    await waitFor(() => expect(lastList()).toMatchObject({ status: "active", page: 1 }));
  });
});

describe("ProductsPage bulk actions", () => {
  it("selects products and archives them in one request", async () => {
    const user = userEvent.setup();
    api.bulk.mockResolvedValue(
      bulkResponse({
        summary: { total: 2, succeeded: 2, failed: 0 },
        results: [
          { index: 0, id: ID.bag, ok: true, error: null, productId: ID.bag, status: "archived" },
          { index: 1, id: ID.pack, ok: true, error: null, productId: ID.pack, status: "archived" },
        ],
      }),
    );
    renderPage();
    await screen.findByText("Premium Travel Bag");

    await user.click(screen.getByRole("checkbox", { name: "Select Premium Travel Bag" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Classic Backpack" }));
    expect(screen.getByText("2 products selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith([ID.bag, ID.pack], "archive"));
    await waitFor(() => expect(screen.queryByText("2 products selected")).not.toBeInTheDocument());
    expect(useToastStore.getState().toasts.some((t) => t.description === "2 products archived.")).toBe(true);
  });

  it("shows a partial result per product and keeps the failed ones selected", async () => {
    const user = userEvent.setup();
    api.bulk.mockResolvedValue(
      bulkResponse({
        summary: { total: 2, succeeded: 1, failed: 1 },
        results: [
          { index: 0, id: ID.bag, ok: true, error: null, productId: ID.bag, status: "archived" },
          { index: 1, id: ID.pack, ok: false, error: { code: "NOT_FOUND", message: "Product no longer exists" }, productId: ID.pack },
        ],
      }),
    );
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Select all (4)" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Cotton Overshirt" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Travel Organizer Set" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));

    const dialog = await screen.findByRole("dialog", { name: "Archive results" });
    expect(within(dialog).getByText("1 of 2 products succeeded, 1 failed.")).toBeInTheDocument();
    expect(within(dialog).getByText("Product no longer exists")).toBeInTheDocument();
    expect(within(dialog).getByText("Archived")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("1 product selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Classic Backpack" })).toHaveAttribute("aria-checked", "true");
  });

  it("checks publish readiness and lists what is missing", async () => {
    const user = userEvent.setup();
    api.bulk.mockResolvedValue(
      bulkResponse({
        action: "check_publish_readiness",
        summary: { total: 2, succeeded: 2, failed: 0, canPublish: 1 },
        results: [
          { index: 0, id: ID.bag, ok: true, error: null, productId: ID.bag, canPublish: true, missing: [] },
          { index: 1, id: ID.organizer, ok: true, error: null, productId: ID.organizer, canPublish: false, missing: [{ code: "missing_image", message: "Add at least one image" }] },
        ],
      }),
    );
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("checkbox", { name: "Select Premium Travel Bag" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Travel Organizer Set" }));
    await user.click(screen.getByRole("button", { name: "Check readiness" }));

    const dialog = await screen.findByRole("dialog", { name: "Publish readiness" });
    expect(within(dialog).getByText("1 of 2 products can be published.")).toBeInTheDocument();
    expect(within(dialog).getByText("Ready to publish")).toBeInTheDocument();
    expect(within(dialog).getByText("Add at least one image")).toBeInTheDocument();
    expect(api.bulk).toHaveBeenCalledWith([ID.bag, ID.organizer], "check_publish_readiness");
  });

  it("opens the product detail when a card is clicked, selection stays on the checkbox", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("checkbox", { name: "Select Classic Backpack" }));
    expect(where()).toBe("/products");
    expect(screen.getByText("1 product selected")).toBeInTheDocument();
    await user.click(screen.getByText("Premium Travel Bag"));
    expect(where()).toBe(`/products/${ID.bag}`);
  });

  it("edits a single selected product", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("checkbox", { name: "Select Classic Backpack" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(where()).toBe(`/products/${ID.pack}/edit`);
  });
});

describe("ProductsPage row actions", () => {
  it("duplicates a product through POST /products/{id}/duplicate", async () => {
    const user = userEvent.setup();
    api.duplicate.mockResolvedValue({ id: "99999999-9999-4999-8999-999999999999", productCode: "TRV-1042-COPY" });
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Actions for Premium Travel Bag" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(api.duplicate).toHaveBeenCalledWith(ID.bag));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.description === "Created the draft TRV-1042-COPY.")).toBe(true));
  });

  it("archives a row and offers unarchive for an archived product", async () => {
    const user = userEvent.setup();
    api.bulk.mockResolvedValue(bulkResponse({ summary: { total: 1, succeeded: 1, failed: 0 }, results: [{ index: 0, id: ID.bag, ok: true, error: null, productId: ID.bag }] }));
    api.list.mockResolvedValue(page([FIXTURE[0] as CatalogProduct, product(ID.pack, { title: "Old Backpack", status: "archived" })]));
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Actions for Premium Travel Bag" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith([ID.bag], "archive"));

    await user.click(screen.getByRole("button", { name: "Actions for Old Backpack" }));
    expect(screen.getByRole("menuitem", { name: "Unarchive" })).toBeInTheDocument();
  });

  it("deletes after a confirmation", async () => {
    const user = userEvent.setup();
    api.remove.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Actions for Premium Travel Bag" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(api.remove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete product" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(ID.bag));
  });

  it("reports a failed duplicate", async () => {
    const user = userEvent.setup();
    api.duplicate.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "Product not found", status: 404 }));
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Actions for Premium Travel Bag" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === "Could not duplicate the product" && t.description === "Product not found")).toBe(true));
  });
});

describe("ProductsPage saved views", () => {
  it("lists views and applies one to the URL", async () => {
    const user = userEvent.setup();
    api.views.mockResolvedValue([VIEW(), VIEW({ id: "v2", name: "Team view", shared: true, mine: false, canEdit: false })]);
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Saved views" }));
    expect(await screen.findByText("Team view")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete view Team view" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /Low stock drafts/ }));
    await waitFor(() => expect(lastList()).toMatchObject({ status: "draft", inventory: "low", sort: "-inventory" }));
    expect(where()).toBe("/products?tab=draft&inventory=low&sort=-inventory");
  });

  it("saves the current filters as a view, and reports a name that is taken", async () => {
    const user = userEvent.setup();
    api.createView.mockRejectedValueOnce(new ApiError({ code: "CONFLICT", message: "taken", status: 409, details: { rule: "saved_view_name_taken" } }));
    renderPage("/products?tab=draft&inventory=low&sort=-title");
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Saved views" }));
    await user.click(await screen.findByRole("menuitem", { name: "Save current view..." }));

    const box = await screen.findByRole("dialog", { name: "Save current view" });
    expect(within(box).getByText("Filters · Draft · Inventory: Low stock")).toBeInTheDocument();
    expect(within(box).getByText("Sort · Product name Z-A")).toBeInTheDocument();

    await user.click(within(box).getByRole("button", { name: "Save view" }));
    expect(within(box).getByRole("alert")).toHaveTextContent("Give the view a name.");

    await user.type(within(box).getByLabelText("View name"), "Mine");
    await user.click(within(box).getByRole("button", { name: "Save view" }));
    expect(await within(box).findByRole("alert")).toHaveTextContent("You already have a view with this name");
    expect(api.createView).toHaveBeenCalledWith({ name: "Mine", filters: { status: "draft", inventory: "low" }, sort: "-title", shared: false });

    api.createView.mockResolvedValueOnce(VIEW({ name: "Mine2" }));
    await user.clear(within(box).getByLabelText("View name"));
    await user.type(within(box).getByLabelText("View name"), "Mine2");
    await user.click(within(box).getByLabelText("Share with everyone in this workspace"));
    await user.click(within(box).getByRole("button", { name: "Save view" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Save current view" })).not.toBeInTheDocument());
    expect(api.createView).toHaveBeenLastCalledWith({ name: "Mine2", filters: { status: "draft", inventory: "low" }, sort: "-title", shared: true });
  });

  it("deletes an own view", async () => {
    const user = userEvent.setup();
    api.views.mockResolvedValue([VIEW()]);
    api.deleteView.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Saved views" }));
    await user.click(await screen.findByRole("button", { name: "Delete view Low stock drafts" }));
    await waitFor(() => expect(api.deleteView).toHaveBeenCalledWith("v1"));
  });
});

describe("ProductsPage export", () => {
  it("downloads the CSV of the current filters", async () => {
    const user = userEvent.setup();
    const blob = new Blob(["a,b"], { type: "text/csv" });
    api.exportCsv.mockResolvedValue({ blob, fileName: "products.csv" });
    renderPage("/products?tab=active&inventory=low&sort=title");
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, "products.csv"));
    expect(api.exportCsv).toHaveBeenCalledWith({ status: "active", inventory: "low", sort: "title" });
  });

  it("queues a background export when the file is too large", async () => {
    const user = userEvent.setup();
    const blob = new Blob(["a,b"], { type: "text/csv" });
    api.exportCsv.mockRejectedValue(new ApiError({ code: "PAYLOAD_TOO_LARGE", message: "too big", status: 413 }));
    api.queueExport.mockResolvedValue({ id: "job1", kind: "export", entity: "products", status: "queued", format: "csv", hasOutput: true, errors: [] });
    api.downloadDataJob.mockResolvedValue({ blob, fileName: "job.csv" });
    renderPage("/products?tab=active");
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, "job.csv"));
    expect(api.queueExport).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
  });

  it("explains a too-large export that cannot be queued with these filters", async () => {
    const user = userEvent.setup();
    api.exportCsv.mockRejectedValue(new ApiError({ code: "PAYLOAD_TOO_LARGE", message: "too big", status: 413 }));
    renderPage("/products?inventory=low");
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === "Export failed" && /50,000/.test(t.description ?? ""))).toBe(true));
    expect(api.queueExport).not.toHaveBeenCalled();
    expect(saveBlob).not.toHaveBeenCalled();
  });
});

describe("ProductsPage states", () => {
  it("shows skeletons while loading", () => {
    api.list.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByRole("status", { name: "Loading products" })).toBeInTheDocument();
  });

  it("offers create and import when the catalog is empty", async () => {
    const user = userEvent.setup();
    api.list.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText("No products yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Import products" }));
    expect(where()).toBe("/products/import");
  });

  it("offers to clear the filters when nothing matches", async () => {
    const user = userEvent.setup();
    api.list.mockResolvedValue(page([]));
    renderPage("/products?inventory=out&q=zzz");
    expect(await screen.findByText("No products match these filters.")).toBeInTheDocument();
    api.list.mockResolvedValue(page(FIXTURE));
    await user.click(screen.getAllByRole("button", { name: "Clear filters" }).at(-1) as HTMLElement);
    await waitFor(() => expect(where()).toBe("/products"));
    expect(await screen.findByText("Premium Travel Bag")).toBeInTheDocument();
  });

  it("explains an empty tab", async () => {
    api.list.mockResolvedValue(page([]));
    renderPage("/products?tab=archived");
    expect(await screen.findByText("No archived products.")).toBeInTheDocument();
  });

  it("shows the error and retries", async () => {
    const user = userEvent.setup();
    api.list.mockRejectedValueOnce(new ApiError({ code: "NETWORK_ERROR", message: "Cannot reach the server", status: 0 }));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Products could not be loaded.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Premium Travel Bag")).toBeInTheDocument();
  });

  it("opens the product from its primary action", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Premium Travel Bag");

    await user.click(within(cardOf("Premium Travel Bag")).getByRole("button", { name: /open product/i }));
    expect(where()).toBe(`/products/${ID.bag}`);
  });

  it("goes to the create page and the import wizard", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Import" }));
    await user.click(screen.getByRole("menuitem", { name: "CSV / Excel import" }));
    expect(where()).toBe("/products/import?source=csv_excel");
  });

  it("opens the create page from the header", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "+ Create product" }));
    expect(where()).toBe("/products/new");
  });
});

describe("ProductsPage permissions", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ permissions: ["products:read", "views:read"] });
  });

  it("is read-only for a viewer, with the reason on every disabled control", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Premium Travel Bag");

    const create = screen.getByRole("button", { name: "+ Create product" });
    expect(create).toBeDisabled();
    expect(create).toHaveAttribute("title", "You do not have permission to change products");
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Actions for Premium Travel Bag" }));
    for (const name of ["Edit", "Duplicate", "Archive", "Delete"]) {
      expect(screen.getByRole("menuitem", { name })).toBeDisabled();
      expect(screen.getByRole("menuitem", { name })).toHaveAttribute("title");
    }
    expect(screen.getByRole("menuitem", { name: "Open product" })).toBeEnabled();

    await user.click(screen.getByRole("checkbox", { name: "Select Premium Travel Bag" }));
    expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check readiness" })).toBeEnabled();
  });

  it("opens a draft instead of editing it", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Premium Travel Bag");
    const draft = within(cardOf("Travel Organizer Set"));
    expect(draft.queryByRole("button", { name: /continue editing/i })).not.toBeInTheDocument();
    await user.click(draft.getByRole("button", { name: /open product/i }));
    expect(where()).toBe(`/products/${ID.organizer}`);
  });

  it("cannot save a view", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Saved views" }));
    expect(await screen.findByRole("menuitem", { name: "Save current view..." })).toBeDisabled();
  });
});
