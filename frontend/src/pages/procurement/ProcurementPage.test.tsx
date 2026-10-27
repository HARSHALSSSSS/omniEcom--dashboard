import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { FromSuggestionsResult, ProcurementOverview, PurchaseOrder, PurchaseOrderSummary, ReorderSuggestion, Supplier, SupplierDetail, VariantOffer } from "@/types/procurement";

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  listOrders: vi.fn(),
  allOrders: vi.fn(),
  getOrder: vi.fn(),
  createOrder: vi.fn(),
  updateOrder: vi.fn(),
  deleteOrder: vi.fn(),
  approveOrder: vi.fn(),
  acknowledgeOrder: vi.fn(),
  receiveOrder: vi.fn(),
  cancelOrder: vi.fn(),
  duplicateOrder: vi.fn(),
  suggestions: vi.fn(),
  fromSuggestions: vi.fn(),
  listSuppliers: vi.fn(),
  activeSuppliers: vi.fn(),
  getSupplier: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
  supplierProducts: vi.fn(),
  putSupplierProducts: vi.fn(),
  removeSupplierProduct: vi.fn(),
  searchVariants: vi.fn(),
  warehouses: vi.fn(),
}));
const refreshShell = vi.hoisted(() => vi.fn());
const saveBlob = vi.hoisted(() => vi.fn());
vi.mock("@/api/procurement.api", () => ({ procurementApi: api }));
vi.mock("@/lib/session", () => ({ refreshShell }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob }));

import ProcurementPage from "./ProcurementPage";

const ID = {
  po1: "11111111-1111-4111-8111-111111111111",
  po2: "11111111-1111-4111-8111-222222222222",
  sup1: "22222222-2222-4222-8222-222222222222",
  wh1: "33333333-3333-4333-8333-333333333333",
  var1: "44444444-4444-4444-8444-444444444444",
  line1: "55555555-5555-4555-8555-555555555555",
};

const summary = (over: Partial<PurchaseOrderSummary> = {}): PurchaseOrderSummary => ({
  id: ID.po1,
  poNumber: "PO-2026-0001",
  supplierId: ID.sup1,
  supplierName: "Apex Tex Fab",
  supplierCode: "SUP-APE-01",
  warehouseId: ID.wh1,
  warehouseName: "Mumbai Hub",
  warehouseCode: "MUM",
  status: "submitted",
  itemsCount: 1,
  unitsOrdered: 100,
  unitsReceived: 0,
  unitsDamaged: 0,
  unitsOutstanding: 100,
  currency: "INR",
  subtotalMinor: 12500000,
  taxMinor: 1500000,
  shippingMinor: 0,
  totalMinor: 14000000,
  orderDate: "2026-10-01T00:00:00.000Z",
  expectedAt: "2026-10-20T00:00:00.000Z",
  submittedAt: "2026-10-01T00:00:00.000Z",
  receivedAt: null,
  isLate: false,
  reference: null,
  notes: null,
  version: 3,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

const detail = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  ...summary(),
  paymentTerms: "Net 30",
  cancelReason: null,
  acknowledgedAt: null,
  cancelledAt: null,
  approvedBy: null,
  approvedAt: null,
  createdBy: null,
  supplier: { id: ID.sup1, code: "SUP-APE-01", name: "Apex Tex Fab", contactPerson: "Rajesh", email: "rajesh@apex.in", phone: null, gstin: "27AABCT3521Q1Z8", city: "Surat", state: "Gujarat", status: "active" },
  warehouse: { id: ID.wh1, code: "MUM", name: "Mumbai Hub" },
  lines: [{ id: ID.line1, variantId: ID.var1, sku: "TRV-1042", title: "Travel Bag", quantityOrdered: 100, quantityReceived: 0, quantityDamaged: 0, quantityOutstanding: 100, unitCostMinor: 125000, taxRateBps: 1200, taxMinor: 1500000, totalMinor: 12500000 }],
  receipts: [],
  timeline: [{ at: "2026-10-01T00:00:00.000Z", type: "po.submitted", label: "Submitted", actorId: null, actorName: "Asha", note: null }],
  ...over,
});

const overview = (over: Partial<ProcurementOverview> = {}): ProcurementOverview => ({
  openPurchaseOrders: 4,
  unitsInTransit: 640,
  valueInTransitMinor: 80000000,
  latePurchaseOrders: 1,
  dueThisWeek: 2,
  warehousesCount: 2,
  warehousesWithInbound: 1,
  activeSuppliers: 3,
  totalSuppliers: 4,
  averageLeadTimeDays: 12.5,
  configuredLeadTimeDays: 14,
  leadTimeBySupplier: [],
  statusCounts: { draft: 1, submitted: 3 },
  reorderSuggestionsCount: 2,
  ...over,
});

const poPage = (items: PurchaseOrderSummary[], over: Record<string, unknown> = {}) => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  pages: 1,
  counts: { all: 9, draft: 1, submitted: 3, acknowledged: 2, partially_received: 1, received: 1, cancelled: 1 },
  ...over,
});

const supplier = (over: Partial<Supplier> = {}): Supplier => ({
  id: ID.sup1,
  code: "SUP-APE-01",
  name: "Apex Tex Fab",
  contactPerson: "Rajesh",
  email: "rajesh@apex.in",
  phone: null,
  gstin: "27AABCT3521Q1Z8",
  city: "Surat",
  state: "Gujarat",
  location: "Surat, Gujarat",
  address: {},
  paymentTerms: "Net 30",
  leadTimeDays: 14,
  currency: "INR",
  status: "active",
  notes: null,
  version: 2,
  activeSkusCount: 5,
  openPurchaseOrders: 1,
  deliveredPurchaseOrders: 1,
  averageLeadTimeDays: null,
  onTimeRatePercent: null,
  rating: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

const OFFER: VariantOffer = { variantId: ID.var1, sku: "TRV-1042", title: "Travel Bag", variantCostMinor: 110000, taxRateBps: 1200, available: 8, onHand: 8, incoming: 0, offer: { costMinor: 125000, supplierSku: null, minOrderQuantity: 10, leadTimeDays: 9, isPreferred: true } };

const SUGGESTION: ReorderSuggestion = { variantId: ID.var1, sku: "TRV-1042", title: "Travel Bag", available: 8, unitsPerDay: 4.5, daysOfCover: 1.8, reorderLevel: 20, suggestedUnits: 120, onOrderUnits: 20, netUnits: 100, supplier: { id: ID.sup1, name: "Apex Tex Fab", costMinor: 125000, minOrderQuantity: 10, leadTimeDays: 14, isPreferred: true } };

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/procurement?tab=orders") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ProcurementPage />
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
const lastOrdersQuery = () => api.listOrders.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("procurement:read", "procurement:write", "procurement:approve");
  refreshShell.mockResolvedValue(undefined);
  api.overview.mockResolvedValue(overview());
  api.listOrders.mockResolvedValue(poPage([summary(), summary({ id: ID.po2, poNumber: "PO-2026-0002", status: "draft", isLate: false, supplierName: "Dharavi Leather", itemsCount: 2, unitsReceived: 0 })]));
  api.getOrder.mockResolvedValue(detail());
  api.activeSuppliers.mockResolvedValue([supplier()]);
  api.listSuppliers.mockResolvedValue({ items: [supplier()], page: 1, pageSize: 25, total: 1, pages: 1, counts: { active: 1, inactive: 0, blocked: 0 } });
  api.warehouses.mockResolvedValue([{ id: ID.wh1, code: "MUM", name: "Mumbai Hub", city: "Mumbai", isDefault: true }]);
  api.searchVariants.mockResolvedValue({ items: [OFFER], page: 1, pageSize: 20, total: 1, pages: 1 });
  api.suggestions.mockResolvedValue([SUGGESTION]);
  api.supplierProducts.mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0, pages: 1 });
});

describe("ProcurementPage: purchase orders", () => {
  it("shows the server tiles, the status chip counts and one row per order with its total and late flag", async () => {
    api.listOrders.mockResolvedValue(poPage([summary({ isLate: true, unitsReceived: 40, unitsDamaged: 3 }), summary({ id: ID.po2, poNumber: "PO-2026-0002", status: "draft", supplierName: "Dharavi Leather" })]));
    renderPage();
    await screen.findByText("640 units");
    expect(screen.getByText("1 late · 2 due this week")).toBeInTheDocument();
    expect(screen.getByText("3 of 4")).toBeInTheDocument();
    expect(screen.getByText("Average lead time: 12.5 days")).toBeInTheDocument();

    const chips = await screen.findByRole("tablist", { name: "Purchase order status" });
    expect(within(chips).getByRole("tab", { name: /All orders/ })).toHaveTextContent("9");
    expect(within(chips).getByRole("tab", { name: /Submitted/ })).toHaveTextContent("3");

    const row = (await screen.findByTestId("po-row-PO-2026-0001")) as HTMLElement;
    expect(within(row).getByText("Apex Tex Fab")).toBeInTheDocument();
    expect(within(row).getByText("₹1,40,000")).toBeInTheDocument();
    expect(within(row).getByText("40 / 100")).toBeInTheDocument();
    expect(within(row).getByText("3 damaged")).toBeInTheDocument();
    expect(within(row).getByText("Late")).toBeInTheDocument();
    expect(lastOrdersQuery()).toMatchObject({ page: 1, pageSize: 25, sort: "-orderDate" });
  });

  it("keeps status, supplier, dates, search, sort and page in the URL and sends them to the list", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("po-row-PO-2026-0001");

    await user.click(screen.getByRole("tab", { name: /Draft/ }));
    expect(loc()).toContain("status=draft");
    await waitFor(() => expect(lastOrdersQuery()).toMatchObject({ status: "draft" }));

    await user.selectOptions(screen.getByLabelText("Supplier"), ID.sup1);
    await waitFor(() => expect(lastOrdersQuery()).toMatchObject({ status: "draft", supplierId: ID.sup1 }));

    await user.type(screen.getByLabelText("Ordered from"), "2026-10-01");
    await waitFor(() => expect(lastOrdersQuery()).toMatchObject({ from: "2026-10-01" }));

    await user.selectOptions(screen.getByLabelText("Sort purchase orders"), "-totalMinor");
    await waitFor(() => expect(lastOrdersQuery()).toMatchObject({ sort: "-totalMinor" }));

    await user.type(screen.getByLabelText("Search purchase orders"), "apex");
    await waitFor(() => expect(lastOrdersQuery()).toMatchObject({ q: "apex" }), { timeout: 2000 });
    expect(loc()).toContain("q=apex");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(loc()).toContain("sort=-totalMinor"));
  });

  it("opens in the state the URL describes and pages with numbered buttons", async () => {
    api.listOrders.mockImplementation(async (q: { page: number }) => poPage([summary()], { page: q.page, total: 60, pages: 3 }));
    const user = userEvent.setup();
    renderPage("/procurement?status=submitted&page=2&size=25");
    await screen.findByTestId("po-row-PO-2026-0001");
    expect(lastOrdersQuery()).toMatchObject({ status: "submitted", page: 2 });
    expect(screen.getByText(/Showing 26–26 of 60 purchase orders/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Page 3" }));
    expect(loc()).toContain("page=3");
    await waitFor(() => expect(lastOrdersQuery()).toMatchObject({ page: 3 }));
  });

  it("explains an empty list and a failed load with a retry", async () => {
    api.listOrders.mockResolvedValueOnce(poPage([], { total: 0, counts: { all: 0 } }));
    const { unmount } = renderPage();
    expect(await screen.findByText("No purchase orders yet.")).toBeInTheDocument();
    unmount();

    api.listOrders.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    renderPage();
    expect(await screen.findByText("Purchase orders could not be loaded.")).toBeInTheDocument();
    api.listOrders.mockResolvedValue(poPage([summary()]));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("po-row-PO-2026-0001")).toBeInTheDocument();
  });

  it("exports every matching order as a CSV file", async () => {
    api.allOrders.mockResolvedValue([summary(), summary({ id: ID.po2, poNumber: "PO-2026-0002", supplierName: "=cmd|' /C calc'!A0" })]);
    const user = userEvent.setup();
    renderPage("/procurement?status=submitted");
    await screen.findByTestId("po-row-PO-2026-0001");
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(api.allOrders).toHaveBeenCalledWith(expect.objectContaining({ status: "submitted", sort: "-orderDate" }));
    const blob = saveBlob.mock.calls[0]?.[0] as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text.split("\r\n")).toHaveLength(3);
    expect(text).toContain("PO-2026-0001,Submitted,Apex Tex Fab,Mumbai Hub,2026-10-01,2026-10-20,1,100,0,0,125000,15000,0,140000,INR,no");
    // a supplier name that would run as a spreadsheet formula is neutralised
    expect(text).toContain("'=cmd");
  });
});

describe("ProcurementPage: create and edit", () => {
  it("creates a draft with supplier prices, MOQ, GST totals in minor units and one Idempotency-Key", async () => {
    api.createOrder.mockResolvedValue(detail({ status: "draft", poNumber: "PO-2026-0003" }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("po-row-PO-2026-0001");
    await user.click(screen.getByRole("button", { name: "New purchase order" }));
    const dialog = await screen.findByRole("dialog", { name: /New purchase order/ });

    // submit with nothing: the form says what is missing and sends nothing
    await user.click(within(dialog).getByRole("button", { name: "Create draft" }));
    expect(await within(dialog).findByText("Choose a supplier")).toBeInTheDocument();
    expect(within(dialog).getByText("Add at least one product")).toBeInTheDocument();
    expect(api.createOrder).not.toHaveBeenCalled();

    await user.selectOptions(within(dialog).getByLabelText(/Supplier/), ID.sup1);
    await waitFor(() => expect(api.searchVariants).toHaveBeenLastCalledWith(expect.objectContaining({ supplierId: ID.sup1 }), expect.anything()));
    expect(within(dialog).getByLabelText(/Receive into/)).toHaveValue(ID.wh1);
    expect(within(dialog).getByLabelText(/Payment terms/)).toHaveValue("Net 30");

    await user.click(await within(dialog).findByRole("button", { name: "Add TRV-1042" }));
    const qty = within(dialog).getByLabelText("Quantity for TRV-1042");
    const cost = within(dialog).getByLabelText("Unit cost for TRV-1042");
    expect(qty).toHaveValue("10"); // the supplier minimum
    expect(cost).toHaveValue("1250");

    await user.clear(qty);
    await user.type(qty, "5");
    await user.click(within(dialog).getByRole("button", { name: "Create draft" }));
    expect(await within(dialog).findByText("Minimum order is 10")).toBeInTheDocument();
    expect(api.createOrder).not.toHaveBeenCalled();

    await user.clear(qty);
    await user.type(qty, "20");
    await user.clear(cost);
    await user.type(cost, "1250.50");
    const totals = within(dialog).getByLabelText("Order totals");
    expect(within(totals).getByText("₹25,010")).toBeInTheDocument(); // 20 x 1250.50
    expect(within(totals).getByText("₹3,001.20")).toBeInTheDocument(); // 12% GST, exact
    expect(within(totals).getByText("₹28,011.20")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Shipping charges/), "250");
    await user.click(within(dialog).getByRole("button", { name: "Create draft" }));
    await waitFor(() => expect(api.createOrder).toHaveBeenCalledTimes(1));
    const [body, key] = api.createOrder.mock.calls[0] as [Record<string, unknown>, string];
    expect(body).toMatchObject({ supplierId: ID.sup1, warehouseId: ID.wh1, shippingMinor: 25000, paymentTerms: "Net 30", lines: [{ variantId: ID.var1, quantity: 20, unitCostMinor: 125050 }] });
    expect(key).toMatch(/^po-ui-/);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /New purchase order/ })).not.toBeInTheDocument());
    expect(loc()).toContain(`po=${ID.po1}`);
  });

  it("maps a server field error onto its field and keeps the dialog open", async () => {
    api.createOrder.mockRejectedValue(new ApiError({ code: "VALIDATION_ERROR", message: "Invalid", status: 400, details: { issues: [{ path: "lines.0.unitCostMinor", message: "No cost known" }] } }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("po-row-PO-2026-0001");
    await user.click(screen.getByRole("button", { name: "New purchase order" }));
    const dialog = await screen.findByRole("dialog", { name: /New purchase order/ });
    await user.selectOptions(within(dialog).getByLabelText(/Supplier/), ID.sup1);
    await user.click(await within(dialog).findByRole("button", { name: "Add TRV-1042" }));
    await user.click(within(dialog).getByRole("button", { name: "Create draft" }));
    expect(await within(dialog).findByText("No cost known")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /New purchase order/ })).toBeInTheDocument();
  });

  it("asks before throwing away an edited form", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("po-row-PO-2026-0001");
    await user.click(screen.getByRole("button", { name: "New purchase order" }));
    const dialog = await screen.findByRole("dialog", { name: /New purchase order/ });
    await user.type(within(dialog).getByLabelText(/Your reference/), "Q-77");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    const ask = await screen.findByRole("alertdialog").catch(() => screen.findByText("Discard your changes?"));
    expect(ask).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("dialog", { name: /New purchase order/ })).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog", { name: /New purchase order/ })).getByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /New purchase order/ })).not.toBeInTheDocument());
  });

  it("is read only for someone without purchasing permission", async () => {
    grant("procurement:read");
    const user = userEvent.setup();
    renderPage(`/procurement?po=${ID.po1}`);
    const drawer = await screen.findByRole("dialog", { name: /PO-2026-0001/ });
    // the page behind the open drawer is hidden from the accessibility tree, but its button is still disabled
    expect(screen.getByRole("button", { name: "New purchase order", hidden: true })).toBeDisabled();
    expect(await within(drawer).findByRole("button", { name: "Receive stock" })).toBeDisabled();
    expect(within(drawer).getByRole("button", { name: "Duplicate" })).toBeDisabled();
    // reading and printing stay available
    expect(within(drawer).getByRole("button", { name: /Print/ })).toBeEnabled();
    await user.click(within(drawer).getByRole("button", { name: /CSV/ }));
    expect(saveBlob).toHaveBeenCalled();
  });
});

describe("ProcurementPage: approve, receive, cancel", () => {
  it("receives a partial delivery with a damaged part, one receipt key, and refreshes stock-facing data", async () => {
    api.receiveOrder.mockResolvedValue({ purchaseOrder: detail({ status: "partially_received", unitsReceived: 40, unitsDamaged: 5, unitsOutstanding: 60 }), receiptId: "r1", duplicate: false });
    const user = userEvent.setup();
    renderPage(`/procurement?po=${ID.po1}`);
    const drawer = await screen.findByRole("dialog", { name: /PO-2026-0001/ });
    await user.click(await within(drawer).findByRole("button", { name: "Receive stock" }));
    const dialog = await screen.findByRole("dialog", { name: /Receive stock for PO-2026-0001/ });

    const got = within(dialog).getByLabelText("Received now for TRV-1042");
    const bad = within(dialog).getByLabelText("Damaged for TRV-1042");
    await user.type(got, "150");
    expect(within(dialog).getByText("Only 100 are still expected")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Record receipt" })).toBeDisabled();

    await user.clear(got);
    await user.type(got, "40");
    await user.type(bad, "50");
    expect(within(dialog).getByText("Damaged units are part of the received units")).toBeInTheDocument();
    await user.clear(bad);
    await user.type(bad, "5");
    expect(within(dialog).getByText("35 good and 5 damaged units will be added to stock.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Record receipt" }));
    await waitFor(() => expect(api.receiveOrder).toHaveBeenCalledTimes(1));
    const [id, body, key] = api.receiveOrder.mock.calls[0] as [string, Record<string, unknown>, string];
    expect(id).toBe(ID.po1);
    expect(body).toMatchObject({ items: [{ lineId: ID.line1, receivedQuantity: 40, damagedQuantity: 5 }], version: 3 });
    expect(key).toMatch(/^receive-ui-/);
    await waitFor(() => expect(refreshShell).toHaveBeenCalled());
    expect(useToastStore.getState().toasts.some((t) => t.title === "Stock received")).toBe(true);
  });

  it("shows the over-receipt refusal from the server and lets the person fix it", async () => {
    api.receiveOrder.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "Line TRV-1042 is only owed 100 more", status: 409, details: { rule: "over_receipt" } }));
    const user = userEvent.setup();
    renderPage(`/procurement?po=${ID.po1}`);
    const drawer = await screen.findByRole("dialog", { name: /PO-2026-0001/ });
    await user.click(await within(drawer).findByRole("button", { name: "Receive stock" }));
    const dialog = await screen.findByRole("dialog", { name: /Receive stock/ });
    await user.click(within(dialog).getByRole("button", { name: "Everything arrived" }));
    await user.click(within(dialog).getByRole("button", { name: "Record receipt" }));
    expect(await within(dialog).findByText("Line TRV-1042 is only owed 100 more")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /Receive stock/ })).toBeInTheDocument();
  });

  it("only administrators approve; approving sends the version and the chosen date", async () => {
    api.getOrder.mockResolvedValue(detail({ status: "draft" }));
    api.approveOrder.mockResolvedValue(detail({ status: "submitted" }));
    const user = userEvent.setup();
    renderPage(`/procurement?po=${ID.po1}`);
    const drawer = await screen.findByRole("dialog", { name: /PO-2026-0001/ });
    await user.click(await within(drawer).findByRole("button", { name: "Approve and submit" }));
    const dialog = await screen.findByRole("dialog", { name: /Approve PO-2026-0001/ });
    await user.type(within(dialog).getByLabelText("Expected delivery"), "2099-01-15");
    await user.click(within(dialog).getByRole("button", { name: "Approve and submit" }));
    await waitFor(() => expect(api.approveOrder).toHaveBeenCalledWith(ID.po1, { version: 3, expectedAt: "2099-01-15T00:00:00.000Z" }));
    await waitFor(() => expect(refreshShell).toHaveBeenCalled());
  });

  it("disables approval without the approve permission", async () => {
    grant("procurement:read", "procurement:write");
    api.getOrder.mockResolvedValue(detail({ status: "draft" }));
    renderPage(`/procurement?po=${ID.po1}`);
    const drawer = await screen.findByRole("dialog", { name: /PO-2026-0001/ });
    const approve = await within(drawer).findByRole("button", { name: "Approve and submit" });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAttribute("title", "Only administrators can approve purchase orders");
    expect(within(drawer).getByRole("button", { name: "Edit" })).toBeEnabled();
  });

  it("offers to reload when somebody else changed the order (409 VERSION_CONFLICT)", async () => {
    api.getOrder.mockResolvedValue(detail({ status: "draft" }));
    api.approveOrder.mockRejectedValue(new ApiError({ code: "VERSION_CONFLICT", message: "changed", status: 409 }));
    const user = userEvent.setup();
    renderPage(`/procurement?po=${ID.po1}`);
    const drawer = await screen.findByRole("dialog", { name: /PO-2026-0001/ });
    await user.click(await within(drawer).findByRole("button", { name: "Approve and submit" }));
    const dialog = await screen.findByRole("dialog", { name: /Approve/ });
    await user.click(within(dialog).getByRole("button", { name: "Approve and submit" }));
    expect(await screen.findByText("This purchase order was changed by someone else")).toBeInTheDocument();
    const callsBefore = api.getOrder.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    await waitFor(() => expect(api.getOrder.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("cancelling needs a reason and sends it", async () => {
    api.cancelOrder.mockResolvedValue({ purchaseOrder: detail({ status: "cancelled" }), releasedUnits: 100 });
    const user = userEvent.setup();
    renderPage(`/procurement?po=${ID.po1}`);
    const drawer = await screen.findByRole("dialog", { name: /PO-2026-0001/ });
    await user.click(await within(drawer).findByRole("button", { name: "Cancel order" }));
    const dialog = await screen.findByRole("dialog", { name: /Cancel PO-2026-0001/ });
    const confirm = within(dialog).getByRole("button", { name: "Cancel order" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Reason/), "Supplier cannot deliver");
    await user.click(confirm);
    await waitFor(() => expect(api.cancelOrder).toHaveBeenCalledWith(ID.po1, { reason: "Supplier cannot deliver", version: 3 }));
    await waitFor(() => expect(refreshShell).toHaveBeenCalled());
  });
});

describe("ProcurementPage: suppliers", () => {
  it("lists suppliers with their scorecard and hides rating until there are deliveries", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("po-row-PO-2026-0001");
    await user.click(screen.getByRole("tab", { name: /Suppliers/ }));
    expect(loc()).toBe("/procurement?tab=suppliers");
    const row = (await screen.findByText("Apex Tex Fab")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Surat, Gujarat")).toBeInTheDocument();
    expect(within(row).getByText("14 days")).toBeInTheDocument();
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(2); // on-time and rating
    await user.selectOptions(screen.getByLabelText("Supplier status"), "blocked");
    await waitFor(() => expect(api.listSuppliers.mock.calls.at(-1)?.[0]).toMatchObject({ status: "blocked" }));
  });

  it("validates the GSTIN before sending, then adds the supplier", async () => {
    api.createSupplier.mockResolvedValue(supplier({ id: "99999999-9999-4999-8999-999999999999", name: "Deccan Mills" }));
    api.getSupplier.mockResolvedValue({ ...supplier({ name: "Deccan Mills" }), products: [], recentPurchaseOrders: [] } satisfies SupplierDetail);
    const user = userEvent.setup();
    renderPage("/procurement?tab=suppliers");
    await user.click(await screen.findByRole("button", { name: "Add supplier" }));
    const dialog = await screen.findByRole("dialog", { name: /Add supplier/ });
    await user.click(within(dialog).getByRole("button", { name: "Add supplier" }));
    expect(await within(dialog).findByText(/Enter the supplier's name/)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Supplier \/ company name/), "Deccan Mills");
    await user.type(within(dialog).getByLabelText("GSTIN"), "bad");
    await user.click(within(dialog).getByRole("button", { name: "Add supplier" }));
    expect(await within(dialog).findByText(/A GSTIN has 15 characters/)).toBeInTheDocument();
    expect(api.createSupplier).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText("GSTIN"));
    await user.type(within(dialog).getByLabelText("GSTIN"), "27aabct3521q1z8");
    await user.clear(within(dialog).getByLabelText(/Standard lead time/));
    await user.type(within(dialog).getByLabelText(/Standard lead time/), "21");
    await user.click(within(dialog).getByRole("button", { name: "Add supplier" }));
    await waitFor(() => expect(api.createSupplier).toHaveBeenCalledTimes(1));
    expect(api.createSupplier.mock.calls[0]?.[0]).toMatchObject({ name: "Deccan Mills", gstin: "27AABCT3521Q1Z8", leadTimeDays: 21, status: "active" });
    await waitFor(() => expect(loc()).toContain("sup=99999999-9999-4999-8999-999999999999"));
  });

  it("shows the server's refusal when a supplier with open orders is deleted", async () => {
    api.getSupplier.mockResolvedValue({ ...supplier(), products: [], recentPurchaseOrders: [] } satisfies SupplierDetail);
    api.deleteSupplier.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "Supplier has open purchase orders", status: 409, details: { rule: "has_open_purchase_orders" } }));
    const user = userEvent.setup();
    renderPage(`/procurement?tab=suppliers&sup=${ID.sup1}`);
    const drawer = await screen.findByRole("dialog", { name: /Apex Tex Fab/ });
    await user.click(await within(drawer).findByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Delete supplier" }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.description === "Supplier has open purchase orders")).toBe(true));
  });

  it("edits a price list row in minor units", async () => {
    api.getSupplier.mockResolvedValue({ ...supplier(), products: [], recentPurchaseOrders: [] } satisfies SupplierDetail);
    api.supplierProducts.mockResolvedValue({
      items: [{ id: "sp1", variantId: ID.var1, sku: "TRV-1042", productTitle: "Travel Bag", supplierSku: null, costMinor: 125000, variantCostMinor: 110000, leadTimeDays: null, minOrderQuantity: 10, isPreferred: false, updatedAt: "2026-10-01T00:00:00.000Z" }],
      page: 1,
      pageSize: 100,
      total: 1,
      pages: 1,
    });
    api.putSupplierProducts.mockResolvedValue({ items: [], total: 1 });
    const user = userEvent.setup();
    renderPage(`/procurement?tab=suppliers&sup=${ID.sup1}`);
    const price = await screen.findByLabelText("Price for TRV-1042");
    expect(price).toHaveValue("1250");
    await user.clear(price);
    await user.type(price, "1199.99");
    await user.type(screen.getByLabelText("Lead time for TRV-1042"), "7");
    await user.click(screen.getByLabelText("Preferred supplier for TRV-1042"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.putSupplierProducts).toHaveBeenCalledWith(ID.sup1, [{ variantId: ID.var1, costMinor: 119999, minOrderQuantity: 10, leadTimeDays: 7, supplierSku: null, isPreferred: true }]));
  });
});

describe("ProcurementPage: reorder suggestions", () => {
  const result = (over: Partial<FromSuggestionsResult> = {}): FromSuggestionsResult => ({
    dryRun: false,
    warehouseId: ID.wh1,
    orders: [{ id: ID.po2, poNumber: "PO-2026-0009", supplierId: ID.sup1, supplierName: "Apex Tex Fab", lines: 1, units: 100, totalMinor: 12500000, skus: ["TRV-1042"] }],
    unassigned: [],
    ...over,
  });

  it("lists what is running low and creates one draft per supplier from the selection", async () => {
    api.fromSuggestions.mockResolvedValue(result());
    const user = userEvent.setup();
    renderPage("/procurement?tab=reorder");
    const row = (await screen.findByText("Travel Bag")).closest("tr") as HTMLElement;
    expect(within(row).getByText("2 days")).toBeInTheDocument();
    expect(within(row).getByText("100")).toBeInTheDocument();
    expect(within(row).getByText(/Apex Tex Fab \(preferred\)/)).toBeInTheDocument();

    await user.click(within(row).getByRole("checkbox", { name: "Select TRV-1042" }));
    await user.click(screen.getByRole("button", { name: /Create draft orders \(1 selected\)/ }));
    await waitFor(() => expect(api.fromSuggestions).toHaveBeenCalledWith({ warehouseId: ID.wh1, variantIds: [ID.var1], dryRun: false }));
    const done = await screen.findByRole("dialog", { name: /Draft purchase orders created/ });
    await user.click(within(done).getByRole("button", { name: "Open PO-2026-0009" }));
    await waitFor(() => expect(loc()).toContain(`po=${ID.po2}`));
  });

  it("previews without creating and reports products no supplier sells", async () => {
    api.fromSuggestions.mockResolvedValue(result({ dryRun: true, orders: [], unassigned: [{ variantId: ID.var1, sku: "TRV-1042", suggestedUnits: 100, reason: "no_supplier" }] }));
    const user = userEvent.setup();
    renderPage("/procurement?tab=reorder");
    await screen.findByText("Travel Bag");
    await user.click(screen.getByRole("button", { name: "Preview orders" }));
    const dialog = await screen.findByRole("dialog", { name: /Preview/ });
    expect(api.fromSuggestions).toHaveBeenCalledWith({ warehouseId: ID.wh1, variantIds: undefined, dryRun: true });
    expect(within(dialog).getByText(/No supplier for 1 product/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Create these drafts" })).not.toBeInTheDocument();
  });

  it("says so when nothing needs reordering", async () => {
    api.suggestions.mockResolvedValue([]);
    renderPage("/procurement?tab=reorder");
    expect(await screen.findByText("Nothing to reorder right now.")).toBeInTheDocument();
  });
});

describe("ProcurementPage: overview tab flow", () => {
  it("opens on the overview tab by default when visiting /procurement", async () => {
    renderPage("/procurement");
    expect(await screen.findByText("Replenishment needs")).toBeInTheDocument();
    expect(screen.getByText("Procurement intelligence")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Overview/ })).toHaveAttribute("aria-selected", "true");
  });

  it("renders the procurement pulse, replenishment needs, intelligence card and previews", async () => {
    const user = userEvent.setup();
    renderPage("/procurement?tab=overview");

    expect(await screen.findByText("Replenishment needs")).toBeInTheDocument();
    expect(screen.getByText("Procurement intelligence")).toBeInTheDocument();
    expect(screen.getByText("Supplier context")).toBeInTheDocument();
    expect(await screen.findByText("Travel Bag")).toBeInTheDocument();
    expect(await screen.findByText("PO-2026-0001")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review replenishment" }));
    expect(loc()).toBe("/procurement?tab=reorder");
  });
});
