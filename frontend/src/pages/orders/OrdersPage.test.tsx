import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { activity, detail, drawer, ledgerPage, managedActions, nextActions, row, summary, timeline, workspace } from "@/test/ordersFixtures";

const api = vi.hoisted(() => ({
  summary: vi.fn(),
  workspace: vi.fn(),
  ledger: vi.fn(),
  exportCsv: vi.fn(),
  drawer: vi.fn(),
  detail: vi.fn(),
  timeline: vi.fn(),
  nextActions: vi.fn(),
  transition: vi.fn(),
  cancel: vi.fn(),
  allocate: vi.fn(),
  cancellationReasons: vi.fn(),
  bulk: vi.fn(),
  channels: vi.fn(),
  warehouses: vi.fn(),
  syncOrders: vi.fn(),
  syncJob: vi.fn(),
  activity: vi.fn(),
  views: vi.fn(),
  createView: vi.fn(),
  deleteView: vi.fn(),
}));
const refreshShell = vi.hoisted(() => vi.fn());
const saveBlob = vi.hoisted(() => vi.fn());
vi.mock("@/api/orders.api", () => ({ ordersApi: api }));
vi.mock("@/lib/session", () => ({ refreshShell }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob }));
vi.mock("@/components/products/list/AuthThumbnail", async () => {
  const React = await import("react");
  return { AuthThumbnail: (p: { initials: string }) => React.createElement("span", { "data-testid": "thumb" }, p.initials) };
});

import OrdersPage from "./OrdersPage";

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/orders") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <OrdersPage />
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
const toasts = () => useToastStore.getState().toasts;
const lastLedgerQuery = () => api.ledger.mock.calls.at(-1)?.[0];
const syncItem = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "More" }));
  return screen.findByRole("menuitem", { name: "Sync orders" });
};

const O1 = row();
const O2 = row({ id: "o2", number: "ORD-1002", marketplace: { code: "flipkart", name: "Flipkart" }, customerName: "Vikram Shah", status: "confirmed", statusLabel: "Confirmed", priority: true });

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("orders:read", "orders:write", "marketplace_accounts:read");
  refreshShell.mockResolvedValue(undefined);
  api.summary.mockResolvedValue(summary());
  api.workspace.mockResolvedValue(workspace());
  api.activity.mockResolvedValue(activity());
  api.views.mockResolvedValue([]);
  api.ledger.mockResolvedValue(ledgerPage([O1, O2], { total: 71, pages: 3 }));
  api.channels.mockResolvedValue({
    accounts: [{ id: "a1", marketplace: "amazon_in", displayName: "Amazon store", status: "active" }],
    options: [{ code: "amazon_in", name: "Amazon India" }, { code: "flipkart", name: "Flipkart" }],
  });
  api.drawer.mockResolvedValue(drawer());
  api.detail.mockResolvedValue(detail());
  api.timeline.mockResolvedValue(timeline());
  api.nextActions.mockResolvedValue(nextActions());
  api.cancellationReasons.mockResolvedValue([{ code: "out_of_stock", label: "Out of stock", initiators: ["seller"] }, { code: "other", label: "Other", initiators: ["seller", "customer"] }]);
  api.warehouses.mockResolvedValue([{ id: "w2", code: "BLR-1", name: "Bengaluru Hub", isDefault: false }]);
  api.exportCsv.mockResolvedValue({ blob: new Blob(["a"]), fileName: "orders-2026-10-20.csv" });
});

describe("pulse, needs attention, sources, SLA pressure and tabs from the API", () => {
  it("shows today's pulse, the headline numbers and the lifecycle tab counts", async () => {
    renderPage();
    const pulse = await screen.findByRole("group", { name: "Today's orders by stage" });
    expect(within(pulse).getByRole("button", { name: /12\s*Today orders/ })).toBeInTheDocument();
    expect(within(pulse).getByRole("button", { name: /4\s*New/ })).toBeInTheDocument();
    expect(within(pulse).getByRole("button", { name: /1\s*Ready to Dispatch/ })).toBeInTheDocument();
    const numbers = screen.getByLabelText("Today's numbers");
    expect(numbers).toHaveTextContent(/1,23,456/); // revenue 12345600 paise
    expect(numbers).toHaveTextContent("18 pending dispatch");
    expect(numbers).toHaveTextContent("Avg fulfilment 20.5 h");
    expect(numbers).toHaveTextContent("Cancellation rate 2.8%");
    expect(screen.getByRole("tab", { name: /Needs Attention\s*9/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Returns \/ Disputes\s*3/ })).toBeInTheDocument();
  });

  it("a pulse stage filters the list to today's orders in that status and the tab resets", async () => {
    renderPage("/orders?tab=shipped");
    const pulse = await screen.findByRole("group", { name: "Today's orders by stage" });
    await userEvent.click(within(pulse).getByRole("button", { name: /Picking/ }));
    expect(loc()).toContain("status=picking");
    expect(loc()).toContain("date=today");
    expect(loc()).not.toContain("tab=");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ status: ["picking"], date: "today" }));
    expect(lastLedgerQuery().tab).toBeUndefined();
    await userEvent.click(within(pulse).getByRole("button", { name: /Today orders/ }));
    expect(loc()).toContain("date=today");
    expect(loc()).not.toContain("status=");
  });

  it("counts what needs attention and filters the list by it", async () => {
    renderPage();
    const strip = await screen.findByRole("group", { name: "Needs attention" });
    expect(within(strip).getByRole("button", { name: /7\s*Unprocessed/ })).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: /2\s*SLA risk/ })).toBeInTheDocument();
    await userEvent.click(within(strip).getByRole("button", { name: /Inventory issue/ }));
    expect(loc()).toContain("chip=inventory_issue");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ attention: ["inventory_issue"] }));
    expect(screen.getByText(/Filtered by Inventory Issue/)).toBeInTheDocument();
    await userEvent.click(within(strip).getByRole("button", { name: /Inventory issue/ }));
    expect(loc()).not.toContain("chip");
  });

  it("shows the order sources of the last day and the SLA bands with their thresholds", async () => {
    renderPage();
    expect(await screen.findByText("Order sources")).toBeInTheDocument();
    expect(screen.getByText("10 orders · last 24 h")).toBeInTheDocument();
    expect(screen.getByText("6 · 60%")).toBeInTheDocument();
    expect(screen.getByText("6 · 60%").parentElement).toHaveTextContent("Amazon India");
    expect(screen.getByText("20 orders")).toBeInTheDocument();
    expect(screen.getByText("More than 3 h")).toBeInTheDocument();
    expect(screen.getByText("Less than 60 min")).toBeInTheDocument();
  });

  it("shows the SLA pressure text from the API and reviews at-risk orders on click", async () => {
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("2 orders may breach dispatch SLA within the next 60 minutes.");
    expect(alert).toHaveTextContent("1 order is already past the deadline");
    await userEvent.click(within(alert).getByRole("button", { name: /Review at-risk orders/ }));
    expect(loc()).toContain("sla=at_risk%2Cbreached");
    expect(loc()).toContain("sort=sla");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ slaState: ["at_risk", "breached"], sort: "sla" }));
  });

  it("has no SLA warning when nothing is at risk", async () => {
    const w = workspace();
    api.workspace.mockResolvedValue(workspace({ slaPressure: { ...w.slaPressure, atRisk: { ...w.slaPressure.atRisk, orders: 0 }, breached: { ...w.slaPressure.breached, orders: 0 } } }));
    renderPage();
    await screen.findByText("SLA Pressure");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Review at-risk orders/)).not.toBeInTheDocument();
  });

  it("shows a retry when the numbers cannot be loaded", async () => {
    api.workspace.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    renderPage();
    expect(await screen.findByText(/Order numbers could not be loaded/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Retry" })[0] as HTMLElement);
    expect(await screen.findByRole("group", { name: "Today's orders by stage" })).toBeInTheDocument();
  });

  it("lists the recent order activity and opens the order from it", async () => {
    renderPage();
    const section = await screen.findByRole("region", { name: "Recent order activity" });
    expect(await within(section).findByText("Payment confirmed")).toBeInTheDocument();
    expect(within(section).getByText("SLA risk detected")).toBeInTheDocument();
    await userEvent.click(within(section).getByRole("button", { name: "ORD-1002" }));
    expect(loc()).toContain("drawer=order%3Ao2");
  });

  it("says when there is no activity yet", async () => {
    api.activity.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No order activity yet.")).toBeInTheDocument();
  });
});

describe("the ledger", () => {
  it("renders a row per order with customer, destination, items, value, payment, fulfillment, SLA and status", async () => {
    api.ledger.mockResolvedValue(
      ledgerPage([
        row({ sla: { state: "at_risk", dueAt: null, minutesRemaining: 25, label: "Due in 25 min" }, rowTone: "red" }),
        row({ id: "o3", number: "ORD-1003", sla: { state: "breached", dueAt: null, minutesRemaining: -130, label: "Overdue 2 h 10 min" }, status: "picking", statusLabel: "Picking", fulfillmentStatus: "picking", carrier: { name: "Delhivery", trackingNumber: "DLV123" }, inventoryIssue: { productTitle: "Cotton Tote Bag", sku: "TOTE-1", required: 3, available: 1, action: "restock" }, lineCount: 1, firstItem: { title: "Cotton Tote Bag", sku: "TOTE-1", imageUrl: null }, payment: { status: "pending", method: "cod" }, paymentLabel: "Cash on delivery - Pending" }),
        row({ id: "o4", number: "ORD-1004", status: "delivered", statusLabel: "Delivered", sla: { state: "none", dueAt: null, minutesRemaining: null, label: null } }),
      ]),
    );
    renderPage();
    const rows = await screen.findAllByTestId("order-row");
    expect(rows).toHaveLength(3);
    const first = within(rows[0] as HTMLElement);
    expect(first.getByText("ORD-1001")).toBeInTheDocument();
    expect(first.getByText("Amazon India")).toBeInTheDocument();
    expect(first.getByText("Asha Rao")).toBeInTheDocument();
    expect(first.getByText("Pune, MH")).toBeInTheDocument();
    expect(first.getByText("3 items")).toBeInTheDocument();
    expect(first.getByText(/2,499\.50/)).toBeInTheDocument();
    expect(first.getByText("Paid")).toBeInTheDocument();
    expect(first.getByText("Not started")).toBeInTheDocument();
    expect(first.getByText("Due in 25 min")).toHaveAttribute("data-sla", "at_risk");
    expect(first.getByText("New")).toBeInTheDocument();
    const second = within(rows[1] as HTMLElement);
    expect(second.getByText("Overdue 2 h 10 min")).toHaveAttribute("data-sla", "breached");
    expect(second.getByText(/Delhivery · DLV123/)).toBeInTheDocument();
    expect(second.getByText("Inventory Issue")).toBeInTheDocument();
    expect(second.getByText(/Pending · COD/)).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText("No deadline")).toHaveAttribute("data-sla", "none");
    // the lines under the rows that need a person
    const banners = screen.getAllByTestId("order-banner");
    expect(banners).toHaveLength(2);
    expect(banners[0]).toHaveTextContent("SLA critical");
    expect(banners[1]).toHaveTextContent("Inventory issue");
    expect(banners[1]).toHaveTextContent("Required: 3 · Available: 1");
    expect(within(banners[1] as HTMLElement).getByRole("link", { name: /Review inventory/ })).toHaveAttribute("href", "/inventory");
  });

  it("flags priority orders", async () => {
    renderPage();
    const rows = await screen.findAllByTestId("order-row");
    expect(within(rows[1] as HTMLElement).getByLabelText("Priority order")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).queryByLabelText("Priority order")).not.toBeInTheDocument();
  });

  it("requests page 1 of 25, newest first, with no filters by default", async () => {
    renderPage();
    await screen.findAllByTestId("order-row");
    expect(lastLedgerQuery()).toEqual({ sort: "-placedAt", page: 1, pageSize: 25 });
  });

  it("reads tab, marketplace, status, SLA, payment, search, sort and paging from the URL", async () => {
    renderPage("/orders?tab=shipped&marketplace=flipkart&status=dispatched,in_transit&sla=at_risk&payment=cod&q=asha&sort=value&page=2&size=50");
    await screen.findAllByTestId("order-row");
    expect(lastLedgerQuery()).toEqual({
      q: "asha",
      tab: "shipped",
      marketplace: ["flipkart"],
      status: ["dispatched", "in_transit"],
      slaState: ["at_risk"],
      payment: "cod",
      sort: "value",
      page: 2,
      pageSize: 50,
    });
    expect(screen.getByRole("tab", { name: /Shipped/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Marketplace")).toHaveValue("flipkart");
    expect(screen.getByLabelText("Search orders")).toHaveValue("asha");
  });

  it("reads fulfillment, date and the quick filter from the URL and sends them as filters", async () => {
    renderPage("/orders?fulfillment=picking,none&date=yesterday&chip=delayed");
    await screen.findAllByTestId("order-row");
    expect(lastLedgerQuery()).toMatchObject({ fulfillment: ["picking", "none"], date: "yesterday", attention: ["delayed"] });
    expect(screen.getByLabelText("Date")).toHaveValue("yesterday");
    expect(screen.getByRole("button", { name: "Delayed" })).toHaveAttribute("aria-pressed", "true");
  });

  it("filters by fulfillment, date and a quick filter", async () => {
    renderPage();
    await screen.findAllByTestId("order-row");
    await userEvent.selectOptions(screen.getByLabelText("Fulfillment"), "packed");
    await userEvent.selectOptions(screen.getByLabelText("Date"), "today");
    await userEvent.click(screen.getByRole("button", { name: "Payment Issue" }));
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ fulfillment: ["packed"], date: "today", attention: ["payment_issue"] }));
    expect(loc()).toContain("fulfillment=packed");
    expect(loc()).toContain("date=today");
    expect(loc()).toContain("chip=payment_issue");
  });

  it("understands the API's deep links: filter[slaState] and ?attention=true", async () => {
    renderPage("/orders?filter[slaState]=at_risk&attention=true");
    await screen.findAllByTestId("order-row");
    expect(lastLedgerQuery()).toMatchObject({ slaState: ["at_risk"], tab: "needs_attention" });
  });

  it("drops values the API does not know", async () => {
    renderPage("/orders?status=bogus&sla=never&sort=nope&page=-3&size=7&tab=ghost");
    await screen.findAllByTestId("order-row");
    expect(lastLedgerQuery()).toEqual({ sort: "-placedAt", page: 1, pageSize: 25 });
  });

  it("filters by marketplace (names from the connected accounts) and keeps it in the URL", async () => {
    renderPage();
    await screen.findAllByTestId("order-row");
    await userEvent.selectOptions(await screen.findByLabelText("Marketplace"), "flipkart");
    expect(loc()).toContain("marketplace=flipkart");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ marketplace: ["flipkart"] }));
    await userEvent.selectOptions(screen.getByLabelText("Marketplace"), "All channels");
    expect(loc()).not.toContain("marketplace");
  });

  it("changing a lifecycle tab goes back to page 1 and drops the stage filters", async () => {
    renderPage("/orders?page=3&status=new&sla=at_risk");
    await screen.findAllByTestId("order-row");
    await userEvent.click(screen.getByRole("tab", { name: /Delivered/ }));
    expect(loc()).toBe("/orders?tab=delivered");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ tab: "delivered", page: 1 }));
  });

  it("searches after a pause and puts the text in the URL", async () => {
    renderPage();
    await screen.findAllByTestId("order-row");
    await userEvent.type(screen.getByLabelText("Search orders"), "asha");
    await waitFor(() => expect(loc()).toContain("q=asha"));
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ q: "asha" }));
  });

  it("filters by status, SLA and payment, sorts, and clears everything", async () => {
    renderPage();
    await screen.findAllByTestId("order-row");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "packed");
    await userEvent.selectOptions(screen.getByLabelText("Dispatch SLA"), "breached");
    await userEvent.selectOptions(screen.getByLabelText("Payment"), "cod");
    await userEvent.selectOptions(screen.getByLabelText("Sort orders"), "value");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ status: ["packed"], slaState: ["breached"], payment: "cod", sort: "value" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastLedgerQuery()).toEqual({ sort: "value", page: 1, pageSize: 25 }));
  });

  it("pages through numbered pages and changes the page size", async () => {
    renderPage();
    await screen.findAllByTestId("order-row");
    expect(screen.getByText(/Showing 1–2 of 71 orders/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(loc()).toContain("page=2");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ page: 2 }));
    await userEvent.selectOptions(screen.getByLabelText("Orders per page"), "100");
    expect(loc()).toContain("size=100");
    expect(loc()).not.toContain("page=");
  });

  it("explains an empty account and offers a sync", async () => {
    api.ledger.mockResolvedValue(ledgerPage([]));
    renderPage();
    expect(await screen.findByText("No orders yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync orders now" })).toBeEnabled();
  });

  it("explains no matches and clears the filters", async () => {
    api.ledger.mockResolvedValueOnce(ledgerPage([])).mockResolvedValue(ledgerPage([O1]));
    renderPage("/orders?q=zzz");
    expect(await screen.findByText("No orders match these filters.")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0] as HTMLElement);
    expect(loc()).toBe("/orders");
    expect(await screen.findAllByTestId("order-row")).toHaveLength(1);
  });

  it("shows an error with retry when the list fails", async () => {
    api.ledger.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "ledger down", status: 500 }));
    renderPage();
    expect(await screen.findByText("Orders could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("ledger down")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Retry" }).at(-1) as HTMLElement);
    expect(await screen.findAllByTestId("order-row")).toHaveLength(2);
  });
});

describe("bulk actions", () => {
  const select = async (...numbers: string[]) => {
    await screen.findAllByTestId("order-row");
    for (const n of numbers) await userEvent.click(screen.getByLabelText(`Select order ${n}`));
  };

  it("confirms the selected orders and lists what happened per order, including failures", async () => {
    api.bulk.mockResolvedValue({
      action: "confirm",
      total: 2,
      succeeded: 1,
      failed: 1,
      results: [
        { orderId: "o1", orderNumber: "ORD-1001", ok: true, changed: true, status: "confirmed" },
        { orderId: "o2", orderNumber: "ORD-1002", ok: false, changed: false, status: null, error: { code: "INVALID_STATE", message: "An order cannot move from confirmed to confirmed" } },
      ],
    });
    renderPage();
    await select("ORD-1001", "ORD-1002");
    expect(screen.getByRole("toolbar", { name: "Bulk actions" })).toHaveTextContent("2 orders selected");
    await userEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith("confirm", ["o1", "o2"], undefined));
    const dialog = await screen.findByRole("dialog", { name: "Confirm results" });
    expect(dialog).toHaveTextContent("1 of 2 orders succeeded, 1 failed.");
    expect(within(dialog).getByText("Confirmed")).toBeInTheDocument();
    expect(within(dialog).getByText("An order cannot move from confirmed to confirmed")).toBeInTheDocument();
    await waitFor(() => expect(refreshShell).toHaveBeenCalled());
    await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    // the failed order stays selected
    expect(screen.getByRole("toolbar")).toHaveTextContent("1 order selected");
    expect(screen.getByLabelText("Select order ORD-1002")).toBeChecked();
  });

  it("cancels orders with a reason code and text", async () => {
    api.bulk.mockResolvedValue({ action: "cancel", total: 1, succeeded: 1, failed: 0, results: [{ orderId: "o1", orderNumber: "ORD-1001", ok: true, changed: true, status: "cancelled" }] });
    renderPage();
    await select("ORD-1001");
    await userEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Cancel orders" }));
    const dialog = await screen.findByRole("dialog", { name: /Cancel 1 order\?/ });
    const confirm = within(dialog).getByRole("button", { name: "Cancel order" });
    expect(confirm).toBeDisabled();
    await within(dialog).findByRole("option", { name: "Out of stock" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Cancellation reason"), "out_of_stock");
    await userEvent.type(within(dialog).getByLabelText("Cancellation details"), "No stock left");
    await userEvent.click(confirm);
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith("cancel", ["o1"], { reason: "No stock left", reasonCode: "out_of_stock" }));
    expect(await screen.findByRole("dialog", { name: "Cancel results" })).toBeInTheDocument();
  });

  it("assigns a warehouse and marks or clears priority", async () => {
    api.bulk.mockResolvedValue({ action: "assign_warehouse", total: 1, succeeded: 1, failed: 0, results: [{ orderId: "o1", orderNumber: "ORD-1001", ok: true, changed: false, status: "new" }] });
    renderPage();
    await select("ORD-1001");
    await userEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Assign warehouse" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign warehouse" });
    await within(dialog).findByRole("option", { name: /Bengaluru Hub/ });
    expect(within(dialog).getByRole("button", { name: "Assign warehouse" })).toBeDisabled();
    await userEvent.selectOptions(within(dialog).getByLabelText("Warehouse"), "w2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Assign warehouse" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith("assign_warehouse", ["o1"], { warehouseId: "w2" }));
    expect(await screen.findByText("Already in that state, nothing changed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    // everything succeeded, so the selection is cleared
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Select order ORD-1001"));
    await userEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Mark priority" }));
    await waitFor(() => expect(api.bulk).toHaveBeenLastCalledWith("mark_priority", ["o1"], { priority: true }));
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));
    await userEvent.click(screen.getByLabelText("Select order ORD-1001"));
    await userEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Clear priority" }));
    await waitFor(() => expect(api.bulk).toHaveBeenLastCalledWith("mark_priority", ["o1"], { priority: false }));
  });

  it("selects every order on the page and clears the selection", async () => {
    renderPage();
    await screen.findAllByTestId("order-row");
    await userEvent.click(screen.getByLabelText("Select all orders on this page"));
    expect(screen.getByRole("toolbar")).toHaveTextContent("2 orders selected");
    await userEvent.click(screen.getByLabelText("Clear selection"));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("tells when the whole bulk call is refused", async () => {
    api.bulk.mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "no", status: 403 }));
    renderPage();
    await select("ORD-1001");
    await userEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(toasts().some((t) => t.title === "Bulk action failed" && t.variant === "destructive")).toBe(true));
  });
});

describe("saved views", () => {
  const view = { id: "v1", name: "Amazon at risk", filters: { marketplace: ["amazon_in"], slaState: ["at_risk"], attention: ["sla_risk"] }, sort: "sla", shared: false, mine: true, canEdit: true };

  it("lists the views of the orders screen and applies one to the URL", async () => {
    api.views.mockResolvedValue([view]);
    renderPage("/orders?q=old&status=new");
    await screen.findAllByTestId("order-row");
    await userEvent.click(screen.getByRole("button", { name: /Saved views/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Amazon at risk/ }));
    expect(loc()).toContain("marketplace=amazon_in");
    expect(loc()).toContain("sla=at_risk");
    expect(loc()).toContain("chip=sla_risk");
    expect(loc()).toContain("sort=sla");
    expect(loc()).not.toContain("q=old");
    expect(loc()).not.toContain("status=");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ marketplace: ["amazon_in"], slaState: ["at_risk"], attention: ["sla_risk"], sort: "sla" }));
  });

  it("saves the current filters and sort under a name", async () => {
    grant("orders:read", "views:write");
    api.createView.mockResolvedValue({ ...view, id: "v2", name: "COD only" });
    renderPage("/orders?payment=cod&sort=value");
    await screen.findAllByTestId("order-row");
    await userEvent.click(screen.getByRole("button", { name: /Saved views/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Save current view/ }));
    const form = await screen.findByRole("dialog", { name: "Save current view" });
    await userEvent.type(within(form).getByLabelText("View name"), "COD only");
    await userEvent.click(within(form).getByRole("button", { name: "Save view" }));
    await waitFor(() => expect(api.createView).toHaveBeenCalledWith({ name: "COD only", filters: { payment: "cod" }, sort: "value", shared: false }));
  });

  it("deletes a view", async () => {
    api.views.mockResolvedValue([view]);
    api.deleteView.mockResolvedValue(undefined);
    renderPage();
    await screen.findAllByTestId("order-row");
    await userEvent.click(screen.getByRole("button", { name: /Saved views/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete view Amazon at risk" }));
    await waitFor(() => expect(api.deleteView).toHaveBeenCalledWith("v1"));
  });
});

describe("export and sync", () => {
  it("exports the CSV with the page's filters and sort and saves it", async () => {
    renderPage("/orders?tab=shipped&marketplace=flipkart&sort=value");
    await screen.findAllByTestId("order-row");
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(api.exportCsv).toHaveBeenCalledWith({ tab: "shipped", marketplace: ["flipkart"] }, "value"));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "orders-2026-10-20.csv"));
  });

  it("says why an export failed", async () => {
    api.exportCsv.mockRejectedValue(new ApiError({ code: "PAYLOAD_TOO_LARGE", message: "Too many rows: narrow the filters", status: 413 }));
    renderPage();
    await screen.findAllByTestId("order-row");
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(toasts().some((t) => t.title === "Export failed" && t.description === "Too many rows: narrow the filters")).toBe(true));
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("queues the order import (202), follows the job to its end and refreshes the list", async () => {
    api.syncOrders.mockResolvedValue({ job: { id: "j1", status: "queued", error: null }, alreadyQueued: false });
    api.syncJob.mockResolvedValue({ id: "j1", status: "succeeded", error: null });
    renderPage();
    await screen.findAllByTestId("order-row");
    const before = api.ledger.mock.calls.length;
    await userEvent.click(await syncItem());
    await waitFor(() => expect(api.syncOrders).toHaveBeenCalledWith("a1"));
    await waitFor(() => expect(api.syncJob).toHaveBeenCalledWith("j1"), { timeout: 4000 });
    await waitFor(() => expect(toasts().some((t) => t.title === "Orders synced")).toBe(true), { timeout: 4000 });
    await waitFor(() => expect(api.ledger.mock.calls.length).toBeGreaterThan(before));
  });

  it("reports a failed sync job with the job's error", async () => {
    api.syncOrders.mockResolvedValue({ job: { id: "j1", status: "failed", error: { code: "AUTH", message: "Token expired" } }, alreadyQueued: false });
    renderPage();
    await screen.findAllByTestId("order-row");
    await userEvent.click(await syncItem());
    await waitFor(() => expect(toasts().some((t) => t.title === "Order sync had problems" && /Token expired/.test(t.description ?? ""))).toBe(true));
  });

  it("has no sync control without a connected account", async () => {
    api.channels.mockResolvedValue({ accounts: [], options: [] });
    renderPage();
    await screen.findAllByTestId("order-row");
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });
});

describe("a viewer", () => {
  beforeEach(() => grant("orders:read", "marketplace_accounts:read"));

  it("reads the list but cannot select, sync or act, and is told why", async () => {
    renderPage();
    const rows = await screen.findAllByTestId("order-row");
    const box = within(rows[0] as HTMLElement).getByLabelText("Select order ORD-1001");
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute("title", expect.stringContaining("view orders"));
    await userEvent.click(await screen.findByRole("button", { name: "More" }));
    expect(await screen.findByRole("menuitem", { name: "Sync orders" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });
});

describe("the order drawer", () => {
  it("opens from ?drawer=order:<id> with SLA, buyer, items, payment, shipment and timeline", async () => {
    renderPage("/orders?drawer=order:o1");
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Order ORD-1001")).toBeInTheDocument();
    expect(api.drawer).toHaveBeenCalledWith("o1", expect.anything());
    expect(within(dialog).getByText("Due in 1 h 35 min")).toHaveAttribute("data-sla", "approaching");
    expect(within(dialog).getByRole("progressbar", { name: /dispatch window/ })).toHaveAttribute("aria-valuenow", "60");
    expect(await within(dialog).findByText("12 Park Street")).toBeInTheDocument();
    expect(within(dialog).getByText("Pune, MH 411001")).toBeInTheDocument();
    expect(within(dialog).getByText("Phone: +91 90000 11111")).toBeInTheDocument();
    expect(within(dialog).getByText("Cotton Tote Bag")).toBeInTheDocument();
    expect(within(dialog).getByText(/Stock held for 0 of 1 units/)).toBeInTheDocument();
    expect(within(dialog).getByText(/not mapped to a product/)).toBeInTheDocument();
    expect(within(dialog).getByText("Subtotal").nextSibling).toHaveTextContent("2,300");
    expect(within(dialog).getByText("Total").nextSibling).toHaveTextContent("2,499.50");
    expect(within(dialog).getByText("Amazon India: Unshipped")).toBeInTheDocument();
    expect(within(dialog).getByText(/was reported but not applied/)).toBeInTheDocument();
  });

  it("opens from a row and closes back to the same list state", async () => {
    renderPage("/orders?tab=new&page=2");
    await userEvent.click((await screen.findAllByRole("button", { name: "Open order ORD-1001" }))[0] as HTMLElement);
    expect(loc()).toBe("/orders?tab=new&page=2&drawer=order%3Ao1");
    const dialog = await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(loc()).toBe("/orders?tab=new&page=2");
    expect(dialog).not.toBeInTheDocument();
  });

  it("shows an error with retry when the order cannot be loaded", async () => {
    api.drawer.mockRejectedValueOnce(new ApiError({ code: "NOT_FOUND", message: "Order not found", status: 404 }));
    renderPage("/orders?drawer=order:zzz");
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/Order not found/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(await within(dialog).findByText("Order ORD-1001")).toBeInTheDocument();
  });

  it("confirms an order with the version it saw", async () => {
    api.transition.mockResolvedValue({ order: detail({ status: "confirmed", version: 5 }), statusUpdate: { id: "s1", requestedStatus: "confirmed", status: "successful", errorMessage: null } });
    renderPage("/orders?drawer=order:o1");
    await userEvent.click(await screen.findByRole("button", { name: "Confirm order" }));
    await waitFor(() => expect(api.transition).toHaveBeenCalledWith({ id: "o1", status: "confirmed", version: 4, tracking: undefined }));
    await waitFor(() => expect(toasts().some((t) => t.title === "ORD-1001 updated" && t.variant === "success")).toBe(true));
    await waitFor(() => expect(refreshShell).toHaveBeenCalled());
  });

  it("warns when the marketplace could not be told", async () => {
    api.transition.mockResolvedValue({ order: detail(), statusUpdate: { id: "s1", requestedStatus: "confirmed", status: "failed", errorMessage: "down" } });
    renderPage("/orders?drawer=order:o1");
    await userEvent.click(await screen.findByRole("button", { name: "Confirm order" }));
    await waitFor(() => expect(toasts().some((t) => t.variant === "warning" && /marketplace could not be told/.test(t.description ?? ""))).toBe(true));
  });

  it("handles a version conflict: says so and reloads the order", async () => {
    api.transition.mockRejectedValue(new ApiError({ code: "VERSION_CONFLICT", message: "Resource was modified by someone else", status: 409 }));
    renderPage("/orders?drawer=order:o1");
    await userEvent.click(await screen.findByRole("button", { name: "Confirm order" }));
    await waitFor(() => expect(toasts().some((t) => t.variant === "destructive" && /changed by someone else/.test(t.description ?? ""))).toBe(true));
    // the stale order is read again
    await waitFor(() => expect(api.nextActions.mock.calls.length).toBeGreaterThan(1));
  });

  it("sends carrier and tracking when dispatching", async () => {
    api.nextActions.mockResolvedValue(
      nextActions({
        status: "ready_to_dispatch",
        primaryAction: "to_dispatched",
        actions: [{ key: "to_dispatched", label: "Dispatch", kind: "transition", method: "POST", href: "/x", body: { status: "dispatched", version: 4 }, enabled: true, disabledReason: null, message: null, useInstead: null }],
      }),
    );
    api.transition.mockResolvedValue({ order: detail(), statusUpdate: { id: "s1", requestedStatus: "dispatched", status: "sent", errorMessage: null } });
    renderPage("/orders?drawer=order:o1");
    await userEvent.type(await screen.findByLabelText(/Carrier/), "Delhivery");
    await userEvent.type(screen.getByLabelText(/Tracking number/), "DLV-77");
    await userEvent.click(screen.getByRole("button", { name: "Dispatch" }));
    await waitFor(() =>
      expect(api.transition).toHaveBeenCalledWith({ id: "o1", status: "dispatched", version: 4, tracking: { carrier: "Delhivery", number: "DLV-77" } }),
    );
  });

  it("an order managed by fulfillment says so and links to Fulfillment instead of a manual step", async () => {
    api.nextActions.mockResolvedValue(managedActions());
    renderPage("/orders?drawer=order:o1");
    const region = await screen.findByRole("region", { name: "Order actions" });
    expect(within(region).getByText(/Managed by Fulfillment \(FUL-1\)/)).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: "Open fulfillment" })).toHaveAttribute("href", "/fulfillment");
    expect(within(region).getByRole("button", { name: "Mark as packed" })).toBeDisabled();
    expect(within(region).getByText(/Use the fulfillment actions instead/)).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Cancel order" })).toBeEnabled();
    expect(api.transition).not.toHaveBeenCalled();
  });

  it("cancels an order after asking for a reason", async () => {
    api.cancel.mockResolvedValue({ order: detail({ status: "cancelled" }), statusUpdate: { id: "s1", requestedStatus: "cancelled", status: "successful", errorMessage: null } });
    renderPage("/orders?drawer=order:o1");
    await userEvent.click(await screen.findByRole("button", { name: "Cancel order" }));
    const dialog = await screen.findByRole("dialog", { name: /Cancel order ORD-1001\?/ });
    await within(dialog).findByRole("option", { name: "Out of stock" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Cancellation reason"), "out_of_stock");
    await userEvent.type(within(dialog).getByLabelText("Cancellation details"), "Supplier delay");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel order" }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith({ id: "o1", reason: "Supplier delay", reasonCode: "out_of_stock" }));
    await waitFor(() => expect(toasts().some((t) => t.title === "ORD-1001 cancelled")).toBe(true));
  });

  it("keeps the cancel dialog open and shows the reason when the API refuses", async () => {
    api.cancel.mockRejectedValue(new ApiError({ code: "INVALID_STATE", message: "A dispatched order cannot be cancelled", status: 409 }));
    renderPage("/orders?drawer=order:o1");
    await userEvent.click(await screen.findByRole("button", { name: "Cancel order" }));
    const dialog = await screen.findByRole("dialog", { name: /Cancel order ORD-1001\?/ });
    await userEvent.type(within(dialog).getByLabelText("Cancellation details"), "Mistake");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel order" }));
    expect(await within(dialog).findByText("A dispatched order cannot be cancelled")).toBeInTheDocument();
  });

  it("allocates stock for a short order", async () => {
    api.nextActions.mockResolvedValue(
      nextActions({ actions: [{ key: "allocate", label: "Allocate stock", kind: "allocate", method: "POST", href: "/x", body: null, enabled: true, disabledReason: null, message: null, useInstead: null }] }),
    );
    api.allocate.mockResolvedValue({ order: detail(), reserved: 1, wanted: 3 });
    renderPage("/orders?drawer=order:o1");
    await userEvent.click(await screen.findByRole("button", { name: "Allocate stock" }));
    await waitFor(() => expect(api.allocate).toHaveBeenCalledWith("o1"));
    await waitFor(() => expect(toasts().some((t) => t.variant === "warning" && /1 of 3 units/.test(t.description ?? ""))).toBe(true));
  });

  it("is read-only for a viewer, with the reason", async () => {
    grant("orders:read");
    api.nextActions.mockResolvedValue(
      nextActions({
        actions: [
          { key: "to_confirmed", label: "Confirm order", kind: "transition", method: "POST", href: "/x", body: { status: "confirmed", version: 4 }, enabled: false, disabledReason: "permission_required", message: "Your role cannot change orders.", useInstead: null },
        ],
      }),
    );
    renderPage("/orders?drawer=order:o1");
    const button = await screen.findByRole("button", { name: "Confirm order" });
    expect(button).toBeDisabled();
    expect(screen.getAllByText(/can view orders but not change them/).length).toBeGreaterThan(0);
  });
});
