import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ProductDetailPage from "./ProductDetailPage";
import { productDetailApi } from "@/api/productDetail.api";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import { useToastStore } from "@/hooks/useToast";
import {
  PRODUCT_ID,
  activeOverview,
  archivedOverview,
  contentTab,
  draftOverview,
  imageDoc,
  inventoryTab,
  listingsTab,
  variantRow,
} from "@/components/products/detail/testFixtures";
import type { Paged, ProductOverview, VariantGridRow } from "@/types/productDetail";

vi.mock("@/api/productDetail.api", () => ({
  productDetailApi: {
    overview: vi.fn(),
    inventory: vi.fn(),
    listings: vi.fn(),
    content: vi.fn(),
    activity: vi.fn(),
    variants: vi.fn(),
    variantCounts: vi.fn(),
    images: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
    uploadImage: vi.fn(),
    imageBlob: vi.fn(),
    duplicate: vi.fn(),
    bulkAction: vi.fn(),
    exportCsv: vi.fn(),
    marketplaceAccounts: vi.fn(),
    createListing: vi.fn(),
  },
}));

const api = vi.mocked(productDetailApi);

const WRITER = ["products:read", "products:write", "documents:read", "documents:write", "listings:write"];
const VIEWER = ["products:read", "documents:read"];

const nth = <T,>(items: T[], i: number): T => {
  const v = items[i];
  if (v === undefined) throw new Error(`no element at ${i}`);
  return v;
};
const must = <T,>(v: T | null | undefined): T => {
  if (v == null) throw new Error("element missing");
  return v;
};

const page = <T,>(items: T[], over: Partial<Paged<T>> = {}): Paged<T> => ({ items, page: 1, pageSize: 20, total: items.length, pages: 1, ...over });

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{`${l.pathname}${l.search}`}</div>;
}

function renderAt(path: string, permissions: string[] = WRITER) {
  useWorkspaceStore.setState({ permissions });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <Routes>
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/products/:id/edit" element={<div>edit screen</div>} />
          <Route path="/products/:id/variants" element={<div>variants screen</div>} />
          <Route path="/listings/:id" element={<div>listing studio</div>} />
          <Route path="/inventory" element={<div>inventory screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const here = () => screen.getByTestId("loc").textContent;
const detail = `/products/${PRODUCT_ID}`;

beforeEach(() => {
  vi.resetAllMocks();
  useToastStore.setState({ toasts: [] });
  api.overview.mockResolvedValue(activeOverview());
  api.inventory.mockResolvedValue(inventoryTab());
  api.listings.mockResolvedValue(listingsTab());
  api.content.mockResolvedValue(contentTab());
  api.activity.mockResolvedValue(page([]));
  api.variants.mockResolvedValue(page([variantRow(1), variantRow(2)], { pageSize: 25 }));
  api.variantCounts.mockResolvedValue({ all: 2, active: 2, lowStock: 0, outOfStock: 0, draft: 0, archived: 0 });
  api.images.mockResolvedValue([imageDoc(1), imageDoc(2), imageDoc(3)]);
});

afterEach(() => cleanup());

const openMore = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: /more/i }));
};

describe("ProductDetailPage: header, health and overview", () => {
  it("renders the real product, health strip, channels, content and activity", async () => {
    renderAt(detail);
    expect(await screen.findByRole("heading", { level: 1, name: "Weekender Duffel" })).toBeInTheDocument();
    expect(screen.getByText("SKU family: CARRY-77")).toBeInTheDocument();
    expect(screen.getAllByText("Bags & Luggage").length).toBeGreaterThan(0);
    expect(screen.getByText(/5 variants · 2 sales channels · Last updated about 3 hours ago/)).toBeInTheDocument();

    const strip = screen.getByRole("region", { name: "Product health" });
    expect(within(strip).getByText("Ready")).toBeInTheDocument();
    expect(within(strip).getByText("87 units")).toBeInTheDocument();
    expect(within(strip).getByText("Low stock")).toBeInTheDocument();
    expect(within(strip).getByText("2 connected")).toBeInTheDocument();
    expect(within(strip).getByText("1 Active · 1 Attention")).toBeInTheDocument();

    expect(screen.getByText("Flipkart listing requires review.")).toBeInTheDocument();
    expect(screen.getByText("Listing Needs attention")).toBeInTheDocument();
    expect(screen.getAllByText("73% complete").length).toBeGreaterThan(0);
    expect(screen.getByText("Received 25 units of CARRY-77-OL-M")).toBeInTheDocument();
    expect(screen.getByText("Pune Hub")).toBeInTheDocument();
    expect(screen.getByText("Olive / M")).toBeInTheDocument();
    expect(api.overview).toHaveBeenCalledWith(PRODUCT_ID, expect.anything());
    expect(document.body.textContent).not.toMatch(/Premium Travel Bag|TRV-1042|Unsplash|Meesho/);
  });

  it("shows the product status panel from the API", async () => {
    renderAt(detail);
    await screen.findByRole("heading", { name: "Product status" });
    const status = nth(screen.getAllByRole("complementary"), 0);
    expect(within(status).getByText("1 Active · 1 Attention")).toBeInTheDocument();
    expect(within(status).getByText("73% complete")).toBeInTheDocument();
    expect(within(status).getByText(/Signals last synced/)).toBeInTheDocument();
  });

  it("an incomplete, unpublished draft has no demo toggle and says so honestly", async () => {
    api.overview.mockResolvedValue(draftOverview());
    renderAt(detail);
    expect(await screen.findByRole("heading", { level: 1, name: "Draft Tote" })).toBeInTheDocument();
    const strip = screen.getByRole("region", { name: "Product health" });
    expect(within(strip).getByText("Incomplete")).toBeInTheDocument();
    expect(within(strip).getByText("0 connected")).toBeInTheDocument();
    expect(within(strip).getByText("Not published yet")).toBeInTheDocument();
    expect(screen.getByText("Product information incomplete.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete product" })).toBeInTheDocument();
    expect(screen.queryByText(/View Incomplete/)).not.toBeInTheDocument();
    expect(screen.getByText("No variants yet")).toBeInTheDocument();
    expect(screen.getByText("No images yet")).toBeInTheDocument();
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    // publish is disabled with the API's reason
    const publish = screen.getAllByRole("button", { name: "Publish product" });
    publish.forEach((b) => expect(b).toBeDisabled());
    expect(publish[0]).toHaveAttribute("title", expect.stringMatching(/missing product information/i));
  });

  it("the attention banner follows the API href (?tab=listings)", async () => {
    const user = userEvent.setup();
    renderAt(detail);
    await user.click(nth(await screen.findAllByRole("button", { name: "Review →" }), 0));
    expect(here()).toBe(`${detail}?tab=listings`);
  });
});

describe("ProductDetailPage: not found and errors", () => {
  it("shows a not-found state for an unknown product", async () => {
    api.overview.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "Product not found", status: 404 }));
    renderAt(detail);
    expect(await screen.findByRole("heading", { name: "Product not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to products" })).toHaveAttribute("href", "/products");
  });

  it("shows an error with retry for a server failure and recovers", async () => {
    const user = userEvent.setup();
    api.overview.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Boom", status: 500 }));
    renderAt(detail);
    expect(await screen.findByRole("heading", { name: "The product could not be loaded" })).toBeInTheDocument();
    api.overview.mockResolvedValue(activeOverview());
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Weekender Duffel" })).toBeInTheDocument();
  });

  it("a tab that fails shows its own error with retry", async () => {
    const user = userEvent.setup();
    api.inventory.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Inventory is down", status: 500 }));
    renderAt(`${detail}?tab=inventory`);
    expect(await screen.findByText("The inventory could not be loaded")).toBeInTheDocument();
    api.inventory.mockResolvedValue(inventoryTab());
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Stock by variant")).toBeInTheDocument();
  });
});

describe("ProductDetailPage: tabs in the URL", () => {
  it("opens the tab from ?tab= and marks it selected", async () => {
    renderAt(`${detail}?tab=inventory`);
    expect(await screen.findByText("Stock by variant")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Inventory" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "product-tab-inventory");
  });

  it("clicking a tab changes the URL, back to overview clears it", async () => {
    const user = userEvent.setup();
    renderAt(detail);
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("tab", { name: "Listings" }));
    expect(here()).toBe(`${detail}?tab=listings`);
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(here()).toBe(detail);
  });

  it("an unknown tab falls back to overview", async () => {
    renderAt(`${detail}?tab=nonsense`);
    expect(await screen.findByRole("heading", { name: "Product information" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });

  it("arrow keys move between tabs", async () => {
    const user = userEvent.setup();
    renderAt(detail);
    const overviewTab = await screen.findByRole("tab", { name: "Overview" });
    overviewTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(here()).toBe(`${detail}?tab=variants`);
  });

  it("the tab endpoints are only called when the tab is open", async () => {
    renderAt(detail);
    await screen.findByRole("heading", { level: 1 });
    expect(api.inventory).not.toHaveBeenCalled();
    expect(api.listings).not.toHaveBeenCalled();
    expect(api.content).not.toHaveBeenCalled();
  });
});

describe("ProductDetailPage: variants tab", () => {
  it("lists the variants of the grid and the structure panel", async () => {
    api.variantCounts.mockResolvedValue({ all: 2, active: 2, lowStock: 1, outOfStock: 0, draft: 0, archived: 0 });
    api.variants.mockResolvedValue(page([variantRow(1), variantRow(2, { stock: { available: 2, threshold: 5, status: "low" } })], { pageSize: 25 }));
    renderAt(`${detail}?tab=variants`);
    expect(await screen.findByText("Variant 1")).toBeInTheDocument();
    expect(api.variants).toHaveBeenCalledWith(PRODUCT_ID, 1, 25, expect.anything());
    expect(screen.getByText("Olive · Sand")).toBeInTheDocument();
    expect(screen.getByText("1 low-stock variant")).toBeInTheDocument();
    expect(screen.getByText(/Variant 2 · CARRY-77-2 · 2 available/)).toBeInTheDocument();
  });

  it("an empty product shows the empty state", async () => {
    api.variants.mockResolvedValue(page<VariantGridRow>([], { pageSize: 25, total: 0, pages: 0 }));
    api.variantCounts.mockResolvedValue({ all: 0, active: 0, lowStock: 0, outOfStock: 0, draft: 0, archived: 0 });
    renderAt(`${detail}?tab=variants`);
    expect(await screen.findByText("No variants yet")).toBeInTheDocument();
  });

  it("pages through the grid", async () => {
    const user = userEvent.setup();
    api.variants.mockResolvedValue(page([variantRow(1)], { pageSize: 25, total: 30, pages: 2 }));
    renderAt(`${detail}?tab=variants`);
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(here()).toBe(`${detail}?tab=variants&page=2`);
    await waitFor(() => expect(api.variants).toHaveBeenCalledWith(PRODUCT_ID, 2, 25, expect.anything()));
  });

  it("Manage variants goes to the variants screen", async () => {
    const user = userEvent.setup();
    renderAt(`${detail}?tab=variants`);
    await user.click(nth(await screen.findAllByRole("button", { name: /Manage variants/ }), 0));
    expect(here()).toBe(`${detail}/variants`);
  });
});

describe("ProductDetailPage: inventory tab", () => {
  it("renders totals, stock by variant, warehouses and the low-stock notice", async () => {
    renderAt(`${detail}?tab=inventory`);
    expect(await screen.findByText("Product inventory")).toBeInTheDocument();
    expect(api.inventory).toHaveBeenCalledWith(PRODUCT_ID, expect.anything());
    expect(screen.getByText("Sand / L is low on stock")).toBeInTheDocument();
    expect(screen.getByText("Pune Hub")).toBeInTheDocument();
    expect(screen.getAllByText("87 units").length).toBeGreaterThan(0);
    expect(screen.getByText("CARRY-77-SA-L")).toBeInTheDocument();
    expect(screen.queryByText("Main Warehouse")).not.toBeInTheDocument();
  });

  it("an empty product shows honest empty states and no notice", async () => {
    api.inventory.mockResolvedValue(
      inventoryTab({ totals: { available: 0, reserved: 0, incoming: 0, lowStockVariants: 0 }, health: { status: "out", variants: 0, lowStockThreshold: 10 }, byVariant: [], byWarehouse: [], lowStock: null }),
    );
    renderAt(`${detail}?tab=inventory`);
    expect(await screen.findByText("No variants yet")).toBeInTheDocument();
    expect(screen.getByText("No stock in any warehouse")).toBeInTheDocument();
    expect(screen.getByText("This product is out of stock.")).toBeInTheDocument();
  });

  it("Update inventory is disabled with the reason when the API says so", async () => {
    api.overview.mockResolvedValue(draftOverview());
    renderAt(`${detail}?tab=inventory`);
    const btns = await screen.findAllByRole("button", { name: /Update inventory/ });
    btns.forEach((b) => expect(b).toBeDisabled());
    expect(btns[0]).toHaveAttribute("title", expect.stringMatching(/no active variant/i));
  });
});

describe("ProductDetailPage: listings tab", () => {
  it("renders channel rollups, variant listings and links into the listing studio", async () => {
    const user = userEvent.setup();
    renderAt(`${detail}?tab=listings`);
    expect(await screen.findByText("Channel listings")).toBeInTheDocument();
    expect(api.listings).toHaveBeenCalledWith(PRODUCT_ID, expect.anything());
    expect(screen.getByText("Flipkart listing needs attention")).toBeInTheDocument();
    expect(screen.getByText(/Image rejected by the marketplace/)).toBeInTheDocument();
    expect(screen.getByText("Master Product → Channel Listing → Marketplace")).toBeInTheDocument();
    expect(screen.getByText(/on Amazon and Flipkart/)).toBeInTheDocument();
    await user.click(nth(screen.getAllByRole("button", { name: "Open →" }), 1));
    expect(here()).toBe("/listings/l3");
  });

  it("a product with no listings says it is not published and offers Publish", async () => {
    api.listings.mockResolvedValue(
      listingsTab({ summary: { connected: 0, active: 0, attention: 0, lastSyncAt: null }, channels: [], items: [] }),
    );
    renderAt(`${detail}?tab=listings`);
    expect(await screen.findByText("Not published yet")).toBeInTheDocument();
    expect(screen.getByText("Not synced yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish product" })).toBeEnabled();
  });
});

describe("ProductDetailPage: content tab", () => {
  it("renders readiness, master attributes with readable values and marketplace content issues", async () => {
    renderAt(`${detail}?tab=content`);
    expect(await screen.findByText("Master attributes")).toBeInTheDocument();
    expect(api.content).toHaveBeenCalledWith(PRODUCT_ID, expect.anything());
    expect(screen.getByRole("progressbar", { name: "Content completeness" })).toHaveAttribute("aria-valuenow", "73");
    // category id is shown as the category name, GST bps as a percentage, unset values say so
    const table = screen.getByRole("table", { name: "Master attributes" });
    expect(within(table).getByText("Bags & Luggage")).toBeInTheDocument();
    expect(within(table).getByText("12%")).toBeInTheDocument();
    expect(within(table).getByText("HSN code")).toBeInTheDocument();
    expect(within(table).getByText("Not set")).toBeInTheDocument();
    expect(screen.getByText("Flipkart marketplace content needs review")).toBeInTheDocument();
    expect(screen.getByText("Main image too small")).toBeInTheDocument();
    expect(screen.getByText("1 attribute needs completion.")).toBeInTheDocument();
  });

  it("a product that is not published shows the empty marketplace state", async () => {
    api.content.mockResolvedValue(contentTab({ marketplaceContent: [] }));
    renderAt(`${detail}?tab=content`);
    expect(await screen.findByText(/No channel content exists yet/)).toBeInTheDocument();
  });
});

describe("ProductDetailPage: activity tab", () => {
  const events = [
    { at: new Date(Date.now() - 3_600_000).toISOString(), type: "variants" as const, event: "variant_added", params: {}, text: "Variant CARRY-77-OL-M added", actor: { type: "user", id: "u1", name: "Asha" } },
    { at: new Date(Date.now() - 7_200_000).toISOString(), type: "listings" as const, event: "listing_failed", params: {}, text: "Flipkart listing sync failed", actor: null },
  ];

  it("renders the feed with the scope switch and pagination in the URL", async () => {
    const user = userEvent.setup();
    api.activity.mockResolvedValue(page(events, { total: 45, pages: 3 }));
    renderAt(`${detail}?tab=activity`);
    expect(await screen.findByText("Variant CARRY-77-OL-M added")).toBeInTheDocument();
    expect(api.activity).toHaveBeenCalledWith(PRODUCT_ID, "all", 1, 20, expect.anything());
    expect(screen.getByText("Showing 1-2 of 45 events.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Channels" }));
    expect(here()).toBe(`${detail}?tab=activity&scope=channels`);
    await waitFor(() => expect(api.activity).toHaveBeenCalledWith(PRODUCT_ID, "channels", 1, 20, expect.anything()));

    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(here()).toBe(`${detail}?tab=activity&scope=channels&page=2`);
    await waitFor(() => expect(api.activity).toHaveBeenCalledWith(PRODUCT_ID, "channels", 2, 20, expect.anything()));
  });

  it("honours scope and page from the URL", async () => {
    renderAt(`${detail}?tab=activity&scope=variants&page=2`);
    await waitFor(() => expect(api.activity).toHaveBeenCalledWith(PRODUCT_ID, "variants", 2, 20, expect.anything()));
  });

  it("an empty feed says so", async () => {
    renderAt(`${detail}?tab=activity`);
    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
  });
});

describe("ProductDetailPage: media gallery", () => {
  it("renders the real images and makes another one primary", async () => {
    const user = userEvent.setup();
    api.updateDocument.mockResolvedValue(imageDoc(2, { isPrimary: true }));
    renderAt(`${detail}?tab=media`);
    expect(await screen.findByRole("list", { name: "Product images" })).toBeInTheDocument();
    const imgs = screen.getAllByRole("img").filter((i) => i.getAttribute("src")?.includes("cdn.example.test/photo-"));
    expect(imgs).toHaveLength(3);
    expect(api.images).toHaveBeenCalledWith(PRODUCT_ID, expect.anything());
    expect(within(screen.getByRole("list", { name: "Product images" })).getByText("Primary image")).toBeInTheDocument();

    const second = must(screen.getByText("photo-2.jpg").closest("li"));
    await user.click(within(second).getByRole("button", { name: "Make primary" }));
    expect(api.updateDocument).toHaveBeenCalledWith("doc2", { isPrimary: true });
  });

  it("reorders by writing the new positions", async () => {
    const user = userEvent.setup();
    api.updateDocument.mockResolvedValue(imageDoc(1));
    renderAt(`${detail}?tab=media`);
    await user.click(await screen.findByRole("button", { name: "Move photo-2.jpg earlier" }));
    await waitFor(() => expect(api.updateDocument).toHaveBeenCalledTimes(2));
    expect(api.updateDocument).toHaveBeenCalledWith("doc2", { sortOrder: 0 });
    expect(api.updateDocument).toHaveBeenCalledWith("doc1", { sortOrder: 1 });
    expect(screen.getByRole("button", { name: "Move photo-1.jpg earlier" })).toBeDisabled();
  });

  it("uploads images through the documents flow", async () => {
    const user = userEvent.setup();
    api.uploadImage.mockResolvedValue(imageDoc(4));
    renderAt(`${detail}?tab=media`);
    await screen.findByRole("list", { name: "Product images" });
    const file = new File(["x"], "new.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Upload images"), file);
    await waitFor(() => expect(api.uploadImage).toHaveBeenCalledWith(PRODUCT_ID, file, expect.any(Function)));
  });

  it("refuses files that are not images", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderAt(`${detail}?tab=media`);
    await screen.findByRole("list", { name: "Product images" });
    await user.upload(screen.getByLabelText("Upload images"), new File(["x"], "notes.pdf", { type: "application/pdf" }));
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts[0]?.title).toBe("File not accepted");
  });

  it("an empty gallery says so", async () => {
    api.images.mockResolvedValue([]);
    renderAt(`${detail}?tab=media`);
    expect(await screen.findByText("No images yet")).toBeInTheDocument();
  });

  it("deletes an image and shows a success toast", async () => {
    const user = userEvent.setup();
    api.deleteDocument.mockResolvedValue({ message: "Document deleted" });
    renderAt(`${detail}?tab=media`);
    expect(await screen.findByRole("list", { name: "Product images" })).toBeInTheDocument();
    const second = must(screen.getByText("photo-2.jpg").closest("li"));
    await user.click(within(second).getByRole("button", { name: "Delete photo-2.jpg" }));
    await waitFor(() => expect(api.deleteDocument).toHaveBeenCalledWith("doc2"));
    expect(useToastStore.getState().toasts[0]?.title).toBe("Image deleted");
  });

  it("loads API-served images through the authenticated client", async () => {
    const created = vi.fn(() => "blob:fake");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    api.imageBlob.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    api.images.mockResolvedValue([imageDoc(1, { downloadUrl: "/api/v1/documents/doc1/content" })]);
    renderAt(`${detail}?tab=media`);
    await waitFor(() => expect(screen.getAllByRole("img").some((i) => i.getAttribute("src") === "blob:fake")).toBe(true));
    expect(api.imageBlob).toHaveBeenCalledWith("/api/v1/documents/doc1/content", expect.anything());
    vi.unstubAllGlobals();
  });

  it("loads absolute API-served download URLs through the authenticated client", async () => {
    const created = vi.fn(() => "blob:fake-absolute");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    api.imageBlob.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    api.images.mockResolvedValue([imageDoc(1, { downloadUrl: "http://localhost:3000/api/v1/documents/doc1/content" })]);
    renderAt(`${detail}?tab=media`);
    await waitFor(() => expect(screen.getAllByRole("img").some((i) => i.getAttribute("src") === "blob:fake-absolute")).toBe(true));
    expect(api.imageBlob).toHaveBeenCalledWith("http://localhost:3000/api/v1/documents/doc1/content", expect.anything());
    vi.unstubAllGlobals();
  });
});

describe("ProductDetailPage: actions", () => {
  it("Edit product goes to the edit screen", async () => {
    const user = userEvent.setup();
    renderAt(detail);
    await user.click(nth(await screen.findAllByRole("button", { name: "Edit product" }), 0));
    expect(here()).toBe(`${detail}/edit`);
  });

  it("Edit and Publish follow actions[] (archived product)", async () => {
    api.overview.mockResolvedValue(archivedOverview());
    const user = userEvent.setup();
    renderAt(detail);
    const edit = nth(await screen.findAllByRole("button", { name: "Edit product" }), 0);
    expect(edit).toBeDisabled();
    expect(edit).toHaveAttribute("title", expect.stringMatching(/archived/i));
    await openMore(user);
    expect(screen.getByRole("menuitem", { name: "Unarchive" })).toBeEnabled();
  });

  it("duplicates the product and opens the copy", async () => {
    const user = userEvent.setup();
    api.duplicate.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", productCode: "CARRY-77-COPY", title: "Weekender Duffel (copy)" });
    renderAt(detail);
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(api.duplicate).toHaveBeenCalledWith(PRODUCT_ID));
    await waitFor(() => expect(here()).toBe("/products/22222222-2222-4222-8222-222222222222"));
  });

  it("reports a failed duplicate and stays", async () => {
    const user = userEvent.setup();
    api.duplicate.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "No free code", status: 409 }));
    renderAt(detail);
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.variant).toBe("destructive"));
    expect(here()).toBe(detail);
  });

  it("archives after confirmation through the bulk action and refreshes the product", async () => {
    const user = userEvent.setup();
    api.bulkAction.mockResolvedValue({ action: "archive", summary: { total: 1, succeeded: 1, failed: 0 }, results: [{ index: 0, id: PRODUCT_ID, ok: true, error: null, productId: PRODUCT_ID }] });
    renderAt(detail);
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(api.bulkAction).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    api.overview.mockResolvedValue(archivedOverview());
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(api.bulkAction).toHaveBeenCalledWith(PRODUCT_ID, "archive"));
    await waitFor(() => expect(screen.getByText("Archived")).toBeInTheDocument());
  });

  it("a per-item failure of the bulk action is shown as an error", async () => {
    const user = userEvent.setup();
    api.bulkAction.mockResolvedValue({
      action: "archive",
      summary: { total: 1, succeeded: 0, failed: 1 },
      results: [{ index: 0, id: PRODUCT_ID, ok: false, error: { code: "CONFLICT", message: "Product is already archived" }, productId: PRODUCT_ID }],
    });
    renderAt(detail);
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.description === "Product is already archived")).toBe(true));
  });

  it("unarchives an archived product directly", async () => {
    const user = userEvent.setup();
    api.overview.mockResolvedValue(archivedOverview());
    api.bulkAction.mockResolvedValue({ action: "unarchive", summary: { total: 1, succeeded: 1, failed: 0 }, results: [{ index: 0, id: PRODUCT_ID, ok: true, error: null, productId: PRODUCT_ID, status: "draft" }] });
    renderAt(detail);
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Unarchive" }));
    await waitFor(() => expect(api.bulkAction).toHaveBeenCalledWith(PRODUCT_ID, "unarchive"));
  });

  it("exports the CSV with the link the API gave", async () => {
    const user = userEvent.setup();
    const created = vi.fn(() => "blob:csv");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    api.exportCsv.mockResolvedValue(new Blob(["sku\n"], { type: "text/csv" }));
    renderAt(detail);
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Export" }));
    await waitFor(() => expect(api.exportCsv).toHaveBeenCalledWith("/api/v1/products/export?q=CARRY-77"));
    await waitFor(() => expect(created).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it("View activity in the menu opens the activity tab", async () => {
    const user = userEvent.setup();
    renderAt(detail);
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "View activity" }));
    expect(here()).toBe(`${detail}?tab=activity`);
  });

  it("quick actions: update inventory and manage listings switch tabs", async () => {
    const user = userEvent.setup();
    renderAt(detail);
    await screen.findByRole("heading", { name: "Quick actions" });
    await user.click(within(nth(screen.getAllByRole("complementary"), 0)).getByRole("button", { name: "Update inventory" }));
    expect(here()).toBe(`${detail}?tab=inventory`);
  });

  it("quick action: manage variants opens the variants screen", async () => {
    const user = userEvent.setup();
    renderAt(detail);
    await screen.findByRole("heading", { name: "Quick actions" });
    await user.click(within(nth(screen.getAllByRole("complementary"), 0)).getByRole("button", { name: "Manage variants" }));
    expect(here()).toBe(`${detail}/variants`);
  });
});

describe("ProductDetailPage: publish", () => {
  const draftReady = (): ProductOverview => ({ ...draftOverview(), health: { state: "ready", missing: [], text: "Product information is complete." }, actions: activeOverview().actions });

  it("creates listings for the active variants on the chosen channel, then opens the listing", async () => {
    const user = userEvent.setup();
    api.overview.mockResolvedValue(draftReady());
    api.marketplaceAccounts.mockResolvedValue([
      { id: "acc-1", marketplace: "amazon_in", displayName: "Amazon India", status: "active", connectionStatus: "connected" },
      { id: "acc-2", marketplace: "flipkart", displayName: "Flipkart Store", status: "active", connectionStatus: "connected" },
    ]);
    api.variants.mockResolvedValue(page([variantRow(1)], { pageSize: 100 }));
    api.createListing.mockResolvedValue({ id: "listing-9", marketplaceAccountId: "acc-2", variantId: "vg1", status: "draft" });
    renderAt(detail);
    await user.click(nth(await screen.findAllByRole("button", { name: "Publish product" }), 0));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(await within(dialog).findByLabelText("Sales channel"), "acc-2");
    expect(await within(dialog).findByText("1 active variant will get a listing.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Create listings" }));
    await waitFor(() => expect(api.createListing).toHaveBeenCalledWith({ marketplaceAccountId: "acc-2", variantId: "vg1" }));
    await waitFor(() => expect(here()).toBe("/listings/listing-9"));
  });

  it("explains when no channel is connected", async () => {
    const user = userEvent.setup();
    api.overview.mockResolvedValue(draftReady());
    api.marketplaceAccounts.mockResolvedValue([]);
    api.variants.mockResolvedValue(page([variantRow(1)], { pageSize: 100 }));
    renderAt(detail);
    await user.click(nth(await screen.findAllByRole("button", { name: "Publish product" }), 0));
    expect(await screen.findByText(/No connected sales channel yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create listings" })).toBeDisabled();
  });
});

describe("ProductDetailPage: read-only viewer", () => {
  it("cannot edit, duplicate, archive, publish or upload, with a reason on hover", async () => {
    const user = userEvent.setup();
    api.overview.mockResolvedValue(draftOverview());
    renderAt(`${detail}?tab=media`, VIEWER);
    await screen.findByRole("list", { name: "Product images" });
    const edit = nth(screen.getAllByRole("button", { name: "Edit product" }), 0);
    expect(edit).toBeDisabled();
    expect(edit).toHaveAttribute("title", "You do not have permission to do this.");
    expect(screen.getAllByRole("button", { name: "Publish product" })[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: /Upload images/ })).toBeDisabled();
    await openMore(user);
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Archive" })).toBeDisabled();
    // reading and exporting still work
    expect(screen.getByRole("menuitem", { name: "Export" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "View activity" })).toBeEnabled();
  });

  it("cannot reorder or change the primary image", async () => {
    renderAt(`${detail}?tab=media`, VIEWER);
    await screen.findByRole("list", { name: "Product images" });
    expect(screen.getByRole("button", { name: "Move photo-2.jpg earlier" })).toBeDisabled();
    screen.getAllByRole("button", { name: "Make primary" }).forEach((b) => expect(b).toBeDisabled());
  });
});
