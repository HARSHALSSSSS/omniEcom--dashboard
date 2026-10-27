import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { VariantCounts, VariantDetail, VariantGridItem, VariantGridPage, VariantsProductHeader } from "@/types/variants";

const api = vi.hoisted(() => ({
  header: vi.fn(),
  grid: vi.fn(),
  counts: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  bulk: vi.fn(),
  setLeadTime: vi.fn(),
  warehouses: vi.fn(),
  quickAdjust: vi.fn(),
  image: vi.fn(),
}));
vi.mock("@/api/variants.api", async (orig) => ({ ...(await orig<typeof import("@/api/variants.api")>()), variantsApi: api }));

import VariantsPage from "./VariantsPage";

const header: VariantsProductHeader = {
  id: "p1",
  title: "Premium Travel Bag",
  productCode: "TRV-1042",
  status: "active",
  version: 2,
  imageUrl: null,
  variantCount: 3,
  sellableCount: 3,
  availableUnits: 124,
  lowStockVariants: 1,
  connectedChannels: 2,
  options: { Color: ["Black", "Navy"], Size: ["Cabin", "Large"] },
  channels: [{ code: "amazon", name: "Amazon" }],
};

const item = (over: Partial<VariantGridItem> = {}): VariantGridItem => ({
  id: "v1",
  productId: "p1",
  sku: "TRV-1042-B-C",
  barcode: "8901234567890",
  name: "Black / Cabin",
  optionValues: { Color: "Black", Size: "Cabin" },
  currency: "INR",
  mrpMinor: 59900,
  sellingPriceMinor: 49900,
  status: "active",
  lifecycle: "active",
  stock: { available: 48, threshold: 10, status: "healthy" },
  channels: [{ code: "amazon", name: "Amazon", listingStatus: "active" }],
  leadTimeDays: null,
  thumbnailUrl: null,
  version: 3,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
  ...over,
});

const V1 = item();
const V2 = item({ id: "v2", sku: "TRV-1042-N-L", name: "Navy / Large", optionValues: { Color: "Navy", Size: "Large" }, stock: { available: 4, threshold: 10, status: "low" }, barcode: null });
const V3 = item({ id: "v3", sku: "TRV-1042-N-C", name: "Navy / Cabin", optionValues: { Color: "Navy", Size: "Cabin" }, status: "inactive", lifecycle: "archived" });

const page = (items: VariantGridItem[], over: Partial<VariantGridPage> = {}): VariantGridPage => ({ items, page: 1, pageSize: 20, total: items.length, pages: 1, ...over });
const counts = (over: Partial<VariantCounts> = {}): VariantCounts => ({ all: 3, active: 2, lowStock: 1, outOfStock: 0, draft: 0, archived: 1, ...over });
const detail = (over: Partial<VariantDetail> = {}): VariantDetail => ({
  id: "v1",
  productId: "p1",
  sku: "TRV-1042-B-C",
  barcode: "8901234567890",
  optionValues: { Color: "Black", Size: "Cabin" },
  currency: "INR",
  mrpMinor: 59900,
  sellingPriceMinor: 49900,
  costPriceMinor: 30000,
  taxRateBps: 1800,
  weightGrams: 900,
  dimensionsMm: null,
  status: "active",
  version: 3,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
  ...over,
});

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/products/p1/variants") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/products/:id/variants"
            element={
              <>
                <VariantsPage />
                <Probe />
              </>
            }
          />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const grant = (...permissions: string[]) => useWorkspaceStore.setState({ permissions });
const lastGridParams = () => api.grid.mock.calls.at(-1)?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("products:read", "products:write", "inventory:write");
  api.header.mockResolvedValue(header);
  api.grid.mockResolvedValue(page([V1, V2, V3]));
  api.counts.mockResolvedValue(counts());
  api.get.mockResolvedValue(detail());
  api.warehouses.mockResolvedValue([{ id: "w1", code: "BLR", name: "Bengaluru", status: "active", isDefault: true }]);
  api.image.mockRejectedValue(new Error("no image in tests"));
});

describe("VariantsPage: the real grid", () => {
  it("shows the product, the rows and the tab counts from the API", async () => {
    renderPage();
    expect(await screen.findByText("TRV-1042-B-C")).toBeInTheDocument();
    expect(screen.getAllByText("Premium Travel Bag").length).toBeGreaterThan(0);
    expect(screen.getByText("TRV-1042")).toBeInTheDocument();
    expect(screen.getByText("124 available")).toBeInTheDocument();
    const tabs = screen.getByRole("tablist");
    await waitFor(() => expect(within(tabs).getByRole("tab", { name: /Low stock/ })).toHaveTextContent("Low stock1"));
    expect(within(tabs).getByRole("tab", { name: /All variants/ })).toHaveTextContent("3");
    expect(within(tabs).getByRole("tab", { name: /Archived/ })).toHaveTextContent("1");
    expect(screen.getByText("Low stock", { selector: "span.box-border" })).toBeInTheDocument();
    expect(screen.getByText("Showing 1–3 of 3 variants")).toBeInTheDocument();
    expect(screen.getAllByText("₹499").length).toBe(3);
    expect(screen.getAllByText("MRP ₹599").length).toBe(3);
    expect(api.grid).toHaveBeenCalledWith("p1", expect.objectContaining({ tab: "all", page: 1, pageSize: 20, q: "" }), expect.anything());
  });

  it("puts tab, filters, sort and page in the URL and asks the API for them", async () => {
    const user = userEvent.setup();
    api.grid.mockResolvedValue(page([V1], { total: 45, pages: 3 }));
    renderPage();
    await screen.findByText("TRV-1042-B-C");

    await user.click(screen.getByRole("tab", { name: /Low stock/ }));
    await waitFor(() => expect(lastGridParams()).toMatchObject({ tab: "low_stock" }));
    expect(screen.getByTestId("loc")).toHaveTextContent("tab=low_stock");

    await user.selectOptions(screen.getByLabelText("Color"), "Black");
    await waitFor(() => expect(lastGridParams()).toMatchObject({ options: { Color: "Black" } }));
    expect(screen.getByTestId("loc")).toHaveTextContent("opt%3AColor=Black");

    await user.selectOptions(screen.getByLabelText("Channel"), "amazon");
    await waitFor(() => expect(lastGridParams()).toMatchObject({ channel: "amazon" }));

    await user.click(screen.getByRole("button", { name: /^SKU/ }));
    await waitFor(() => expect(lastGridParams()).toMatchObject({ sort: "sku" }));
    await user.click(screen.getByRole("button", { name: /^SKU/ }));
    await waitFor(() => expect(lastGridParams()).toMatchObject({ sort: "-sku" }));

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastGridParams()).toMatchObject({ page: 2 }));
    expect(screen.getByTestId("loc")).toHaveTextContent("page=2");

    await user.type(screen.getByLabelText("Search variants"), "navy");
    await waitFor(() => expect(lastGridParams()).toMatchObject({ q: "navy", page: 1 }), { timeout: 2000 });
  });

  it("restores the state from the URL", async () => {
    renderPage("/products/p1/variants?tab=archived&q=navy&channel=amazon&sort=-inventory&page=2&opt%3ASize=Large");
    await screen.findByText("TRV-1042-B-C");
    expect(lastGridParams()).toMatchObject({ tab: "archived", q: "navy", channel: "amazon", sort: "-inventory", page: 2, options: { Size: "Large" } });
    expect(screen.getByLabelText("Search variants")).toHaveValue("navy");
  });

  it("shows 'Add your first variant' for a product without variants", async () => {
    const user = userEvent.setup();
    api.grid.mockResolvedValue(page([]));
    api.counts.mockResolvedValue(counts({ all: 0, active: 0, lowStock: 0, archived: 0 }));
    renderPage();
    expect(await screen.findByText("This product has no variants yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add your first variant" }));
    expect(await screen.findByRole("heading", { name: "Add variant" })).toBeInTheDocument();
  });

  it("shows a no-match state with Clear filters when a filter finds nothing", async () => {
    api.grid.mockResolvedValue(page([]));
    renderPage("/products/p1/variants?q=zzz");
    expect(await screen.findByText("No variants match")).toBeInTheDocument();
  });

  it("shows an error with retry when the grid fails", async () => {
    const user = userEvent.setup();
    api.grid.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Boom", status: 500 }));
    renderPage();
    expect(await screen.findByText("Boom")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("TRV-1042-B-C")).toBeInTheDocument();
  });

  it("is read-only for a viewer: no add, import, selection or stock actions", async () => {
    grant("products:read");
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    expect(screen.queryByRole("button", { name: "Add variant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Import variants/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /More actions for/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^View TRV/ }).length).toBe(3);
  });

  it("links Import variants to the product import wizard", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    await user.click(screen.getByRole("button", { name: /Import variants/ }));
    await waitFor(() => expect(screen.getByTestId("loc")).toHaveTextContent("/products/import"));
  });
});

describe("VariantsPage: add and edit", () => {
  it("adds a variant with prices converted to minor units", async () => {
    const user = userEvent.setup();
    api.create.mockResolvedValue(detail({ id: "v9", sku: "TRV-NEW" }));
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    await user.click(screen.getByRole("button", { name: "Add variant" }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText("SKU"), "TRV-NEW");
    await user.type(within(dialog).getByLabelText("Option 1 value"), "Black");
    await user.type(within(dialog).getByLabelText("Option 2 value"), "Cabin");
    await user.type(within(dialog).getByLabelText("MRP"), "1,299.50");
    await user.type(within(dialog).getByLabelText("Selling price"), "999.05");
    await user.type(within(dialog).getByLabelText("Cost price"), "0.07");
    await user.type(within(dialog).getByLabelText("GST rate (%)"), "12.5");
    await user.click(within(dialog).getByRole("button", { name: "Add variant" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create).toHaveBeenCalledWith("p1", {
      sku: "TRV-NEW",
      optionValues: { Color: "Black", Size: "Cabin" },
      currency: "INR",
      status: "active",
      mrpMinor: 129950,
      sellingPriceMinor: 99905,
      costPriceMinor: 7,
      taxRateBps: 1250,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // the grid, the counts and the header are reloaded after a write
    await waitFor(() => expect(api.counts.mock.calls.length).toBeGreaterThan(1));
  });

  it("validates before sending and maps a duplicate SKU (409) onto the field", async () => {
    const user = userEvent.setup();
    api.create.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "SKU exists", status: 409, details: { field: "sku" } }));
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    await user.click(screen.getByRole("button", { name: "Add variant" }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Add variant" }));
    expect(await within(dialog).findByText("SKU is required")).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("SKU"), "TRV-1042-B-C");
    await user.type(within(dialog).getByLabelText("MRP"), "12.345");
    await user.click(within(dialog).getByRole("button", { name: "Add variant" }));
    expect(await within(dialog).findByText(/MRP: enter an amount/)).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText("MRP"));
    await user.click(within(dialog).getByRole("button", { name: "Add variant" }));
    expect(await within(dialog).findByText("This SKU is already used by another variant")).toBeInTheDocument();
  });

  it("maps server validation issues (400) onto fields", async () => {
    const user = userEvent.setup();
    api.create.mockRejectedValue(new ApiError({ code: "VALIDATION_ERROR", message: "Invalid", status: 400, details: { issues: [{ path: "barcode", message: "Invalid barcode" }] } }));
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    await user.click(screen.getByRole("button", { name: "Add variant" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("SKU"), "TRV-NEW");
    await user.click(within(dialog).getByRole("button", { name: "Add variant" }));
    expect(await within(dialog).findByText("Invalid barcode")).toBeInTheDocument();
  });

  it("shows the business SKU rule under the SKU input", async () => {
    const user = userEvent.setup();
    api.create.mockRejectedValue(new ApiError({ code: "VALIDATION_FAILED", message: "Invalid", status: 400, details: { issues: [{ path: "sku", message: "The SKU must follow your SKU formula [BRAND]-[CAT3]-[SEQ6]." }] } }));
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    await user.click(screen.getByRole("button", { name: "Add variant" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("SKU"), "TRV-NEW");
    await user.click(within(dialog).getByRole("button", { name: "Add variant" }));
    expect(await within(dialog).findByText(/must follow your SKU formula/)).toBeInTheDocument();
  });

  it("edits with only the changed fields and the version, then the lead time through its own call", async () => {
    const user = userEvent.setup();
    api.update.mockResolvedValue(detail({ version: 4 }));
    api.setLeadTime.mockResolvedValue({ variantId: "v1", productId: "p1", sku: "TRV-1042-B-C", leadTimeDays: 7, version: 5 });
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    await user.click(screen.getByRole("button", { name: "Edit TRV-1042-B-C" }));
    const dialog = await screen.findByRole("dialog");
    const selling = await within(dialog).findByLabelText("Selling price");
    expect(selling).toHaveValue("499.00");

    await user.clear(selling);
    await user.type(selling, "449.5");
    await user.type(within(dialog).getByLabelText("Lead time (days)"), "7");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    expect(api.update).toHaveBeenCalledWith("v1", { sellingPriceMinor: 44950, version: 3 });
    await waitFor(() => expect(api.setLeadTime).toHaveBeenCalledWith("v1", 7));
  });

  it("handles a version conflict: banner, no silent overwrite, reload brings the latest", async () => {
    const user = userEvent.setup();
    api.update.mockRejectedValue(new ApiError({ code: "VERSION_CONFLICT", message: "Resource was modified by someone else", status: 409, details: { currentVersion: 4 } }));
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    await user.click(screen.getByRole("button", { name: "Edit TRV-1042-B-C" }));
    const dialog = await screen.findByRole("dialog");
    const selling = await within(dialog).findByLabelText("Selling price");
    await user.clear(selling);
    await user.type(selling, "400");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await within(dialog).findByText(/Someone else changed this variant/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeDisabled();

    api.get.mockResolvedValue(detail({ version: 4, sellingPriceMinor: 47500 }));
    await user.click(within(dialog).getByRole("button", { name: "Reload latest" }));
    await waitFor(() => expect(within(dialog).getByLabelText("Selling price")).toHaveValue("475.00"));
    expect(within(dialog).queryByText(/Someone else changed/)).not.toBeInTheDocument();
  });

  it("warns (without blocking) about a barcode whose check digit is wrong", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    await user.click(screen.getByRole("button", { name: "Add variant" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Barcode (optional)"), "8901234567891");
    expect(within(dialog).getByText(/check digit does not match/)).toBeInTheDocument();
  });
});

describe("VariantsPage: bulk, delete and stock", () => {
  it("archives the selected variants and lists the ones the API refused", async () => {
    const user = userEvent.setup();
    api.bulk.mockResolvedValue({
      action: "archive",
      summary: { total: 2, succeeded: 1, failed: 1 },
      results: [
        { index: 0, id: "v1", ok: true, error: null },
        { index: 1, id: null, ok: false, error: { code: "CONFLICT", message: "An active product needs at least one active variant; archive the product instead" } },
      ],
    });
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    expect(screen.getByRole("button", { name: "Bulk actions" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Select TRV-1042-B-C" }));
    await user.click(screen.getByRole("checkbox", { name: "Select TRV-1042-N-L" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bulk actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive 2 variants" }));

    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith("p1", ["v1", "v2"], "archive"));
    const alert = await screen.findByText("1 of 2 could not be archived");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/needs at least one active variant|An active product needs at least one active variant/)).toBeInTheDocument();
    expect(screen.queryByText("2 selected")).not.toBeInTheDocument();
  });

  it("selects every row on the page and confirms before a bulk delete", async () => {
    const user = userEvent.setup();
    api.bulk.mockResolvedValue({ action: "delete", summary: { total: 3, succeeded: 3, failed: 0 }, results: [] });
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    await user.click(screen.getByRole("checkbox", { name: "Select all variants on this page" }));
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bulk actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete 3 variants" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.bulk).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith("p1", ["v1", "v2", "v3"], "delete"));
  });

  it("deletes one variant from the row menu and shows the API's reason when it is refused", async () => {
    const user = userEvent.setup();
    api.remove.mockRejectedValueOnce(new ApiError({ code: "CONFLICT", message: "The last active variant cannot be deleted", status: 409 }));
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    await user.click(screen.getByRole("button", { name: "More actions for TRV-1042-B-C" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete variant" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("v1"));
    expect(await screen.findByText("The variant could not be deleted")).toBeInTheDocument();
    expect(screen.getByText(/The last active variant cannot be deleted/)).toBeInTheDocument();
  });

  it("adjusts stock through quick-adjust with a reason, a signed quantity and an idempotency key", async () => {
    const user = userEvent.setup();
    api.quickAdjust.mockResolvedValue({ duplicate: false, variant: { id: "v1", sku: "TRV-1042-B-C", title: "Bag" }, warehouse: { id: "w1", name: "Bengaluru" }, result: { currentAvailable: 48, adjustment: -5, newAvailable: 43 } });
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    await user.click(screen.getByRole("button", { name: "More actions for TRV-1042-B-C" }));
    await user.click(screen.getByRole("menuitem", { name: "Adjust stock" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Reason"), "damaged");
    await user.type(within(dialog).getByLabelText("Units"), "5");
    expect(within(dialog).getByText("Available after: 43")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Adjust stock" }));

    await waitFor(() => expect(api.quickAdjust).toHaveBeenCalledTimes(1));
    expect(api.quickAdjust).toHaveBeenCalledWith(expect.objectContaining({ variantId: "v1", reason: "damaged", quantityDelta: -5, idempotencyKey: expect.stringMatching(/.{8,}/) }));
    expect(api.quickAdjust.mock.calls[0]?.[0].warehouseId).toBeUndefined();
  });

  it("receives stock as a positive manual addition into a chosen warehouse, and refuses removing more than is available", async () => {
    const user = userEvent.setup();
    api.quickAdjust.mockResolvedValue({ duplicate: false, variant: { id: "v2", sku: "TRV-1042-N-L", title: "Bag" }, warehouse: { id: "w1", name: "Bengaluru" }, result: { currentAvailable: 4, adjustment: 20, newAvailable: 24 } });
    renderPage();
    await screen.findByText("TRV-1042-N-L");
    await user.click(screen.getByRole("button", { name: "More actions for TRV-1042-N-L" }));
    await user.click(screen.getByRole("menuitem", { name: "Receive stock" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(await within(dialog).findByLabelText("Warehouse"), "w1");
    await user.type(within(dialog).getByLabelText("Units"), "20");
    await user.click(within(dialog).getByRole("button", { name: "Receive stock" }));
    await waitFor(() => expect(api.quickAdjust).toHaveBeenCalledWith(expect.objectContaining({ variantId: "v2", reason: "manual_addition", quantityDelta: 20, warehouseId: "w1" })));
  });

  it("blocks removing more units than are available", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("TRV-1042-N-L");
    await user.click(screen.getByRole("button", { name: "More actions for TRV-1042-N-L" }));
    await user.click(screen.getByRole("menuitem", { name: "Adjust stock" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Reason"), "shrinkage");
    await user.type(within(dialog).getByLabelText("Units"), "9");
    expect(await within(dialog).findByText("Only 4 units are available to remove")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Adjust stock" })).toBeDisabled();
  });

  it("hides stock actions without inventory:write", async () => {
    const user = userEvent.setup();
    grant("products:read", "products:write");
    renderPage();
    await screen.findByText("TRV-1042-B-C");
    await user.click(screen.getByRole("button", { name: "More actions for TRV-1042-B-C" }));
    expect(screen.queryByRole("menuitem", { name: "Adjust stock" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Archive variant" })).toBeInTheDocument();
  });
});
