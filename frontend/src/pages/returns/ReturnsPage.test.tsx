import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { detail, insights, ledgerPage, nextActions, order, row, summary, tabCounts } from "./returnsFixtures";

const api = vi.hoisted(() => ({
  summary: vi.fn(),
  overview: vi.fn(),
  insights: vi.fn(),
  ledger: vi.fn(),
  counts: vi.fn(),
  exportCsv: vi.fn(),
  detail: vi.fn(),
  order: vi.fn(),
  nextActions: vi.fn(),
  run: vi.fn(),
  reasons: vi.fn(),
  eligibility: vi.fn(),
  create: vi.fn(),
  warehouses: vi.fn(),
  marketplaces: vi.fn(),
}));
const refreshShell = vi.hoisted(() => vi.fn());
const saveBlob = vi.hoisted(() => vi.fn());
vi.mock("@/api/returns.api", () => ({ returnsApi: api }));
vi.mock("@/lib/session", () => ({ refreshShell }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob }));

import ReturnsPage from "./ReturnsPage";

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/returns") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ReturnsPage />
                <Probe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, ...view };
}

const grant = (...permissions: string[]) => useWorkspaceStore.setState({ permissions });
const loc = () => decodeURIComponent(screen.getByTestId("loc").textContent ?? "");
const lastLedgerQuery = () => api.ledger.mock.calls.at(-1)?.[0];
const conflict = (message: string, rule: string) => new ApiError({ code: "CONFLICT", message, status: 409, details: { rule } });

const R1 = row();
const R2 = row({ id: "r2", number: "RET-0002", orderNumber: "#1043", channel: { code: "mock", name: "Sandbox" }, stage: "resolution", stageLabel: "Resolution", refund: { status: "failed", amountMinor: 150000, currency: "INR", source: "manual" }, customer: null });

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("returns:read", "returns:write", "returns:refund");
  refreshShell.mockResolvedValue(undefined);
  api.summary.mockResolvedValue(summary());
  api.overview.mockResolvedValue({ createReturn: { available: true, reason: null, allowedChannels: ["shopify"] } });
  api.insights.mockResolvedValue(insights());
  api.ledger.mockResolvedValue(ledgerPage([R1, R2], { total: 51, pages: 3 }));
  api.counts.mockResolvedValue(tabCounts());
  api.detail.mockResolvedValue(detail());
  api.order.mockResolvedValue(order());
  api.nextActions.mockResolvedValue(nextActions());
  api.run.mockResolvedValue(order());
  api.reasons.mockResolvedValue([{ code: "other", label: "Other", sources: ["customer", "seller"] }, { code: "defective", label: "Defective", sources: ["customer", "seller"] }, { code: "size_fit", label: "Size", sources: ["customer"] }]);
  api.warehouses.mockResolvedValue([{ id: "w1", code: "MUM-1", name: "Mumbai Hub", isDefault: true }]);
  api.marketplaces.mockResolvedValue([{ code: "shopify", name: "Shopify" }, { code: "mock", name: "Sandbox" }]);
  api.exportCsv.mockResolvedValue({ blob: new Blob(["a"]), fileName: "returns.csv" });
});

const openDrawer = async (user: ReturnType<typeof userEvent.setup>) => {
  renderPage("/returns?drawer=return:r1");
  await screen.findByRole("heading", { name: "Return RET-0001" });
  await screen.findByRole("region", { name: "Next steps" });
  return user;
};

describe("tiles, tabs and the ledger from the API", () => {
  it("shows the KPI numbers with the honest comparison, stage counts and tab counts", async () => {
    renderPage();
    expect(await screen.findByText("Return requests (30D)")).toBeInTheDocument();
    expect(screen.getByText("42", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("3 today, 11 open")).toBeInTheDocument();
    expect(screen.getByText("2 overdue (over 24 h)")).toBeInTheDocument();
    expect(screen.getByText("4.8%")).toBeInTheDocument();
    expect(screen.getByText(/40 of 833 orders\. Previous 30 days: 5\.2% \(-0\.4 pts\)/)).toBeInTheDocument();
    expect(screen.getByText(/5,398/)).toBeInTheDocument();
    expect(screen.getByText("7 returns, 3 ready to refund")).toBeInTheDocument();
    expect(screen.queryByText(/industry/i)).not.toBeInTheDocument();
    const stages = screen.getByRole("group", { name: "Returns by stage" });
    expect(within(stages).getByRole("button", { name: /Resolution\s*6/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Needs attention\s*8/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Refund pending\s*6/ })).toBeInTheDocument();
  });

  it("lists the rows with number, order, channel, customer, items, reason, stage, refund and date", async () => {
    renderPage();
    const table = await screen.findByRole("table", { name: "Returns" });
    const r1 = within(table).getByText("RET-0001").closest("tr") as HTMLElement;
    expect(within(r1).getByText("#1042")).toBeInTheDocument();
    expect(within(r1).getByText("Shopify")).toBeInTheDocument();
    expect(within(r1).getByText("Asha Rao")).toBeInTheDocument();
    expect(within(r1).getByText("Cotton Kurta")).toBeInTheDocument();
    expect(within(r1).getByText(/KUR-RED-M \+1 more · Qty 2/)).toBeInTheDocument();
    expect(within(r1).getByText("Size / fit issue")).toBeInTheDocument();
    expect(within(r1).getByText("Requested")).toBeInTheDocument();
    expect(within(r1).getByText(/2,999/)).toBeInTheDocument();
    expect(within(r1).getByText("Pending")).toBeInTheDocument();
    const r2 = within(table).getByText("RET-0002").closest("tr") as HTMLElement;
    expect(within(r2).getByText("Not provided")).toBeInTheDocument();
    expect(within(r2).getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText(/Showing 1–2 of 51 returns/)).toBeInTheDocument();
  });

  it("a tab, a stage and the filters go to the URL and into the ledger query", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("table", { name: "Returns" });
    await user.click(screen.getByRole("tab", { name: /Refund pending/ }));
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ tab: "refund_pending" }));
    expect(loc()).toContain("tab=refund_pending");

    await user.click(within(screen.getByRole("group", { name: "Returns by stage" })).getByRole("button", { name: /Resolution/ }));
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ stage: "resolution" }));
    expect(lastLedgerQuery().tab).toBeUndefined();
    expect(loc()).toContain("stage=resolution");
    expect(loc()).not.toContain("tab=");

    await user.selectOptions(screen.getByLabelText("Refund status"), "failed");
    await user.selectOptions(screen.getByLabelText("Inspection status"), "passed");
    await user.selectOptions(screen.getByLabelText("Channel"), "shopify");
    await user.selectOptions(screen.getByLabelText("Attention signal"), "refunds_pending");
    await user.selectOptions(screen.getByLabelText("Disposition"), "damaged");
    await user.selectOptions(screen.getByLabelText("Sort returns"), "-refundAmount");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ stage: "resolution", refundStatus: "failed", inspectionStatus: "passed", marketplace: "shopify", signal: "refunds_pending", disposition: "damaged", sort: "-refundAmount" }));
    expect(loc()).toContain("refund=failed");
    expect(loc()).toContain("sort=-refundAmount");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastLedgerQuery().refundStatus).toBeUndefined());
    expect(loc()).not.toContain("refund=");
  });

  it("search and paging use the URL; the tab counts follow the search", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("table", { name: "Returns" });
    await user.type(screen.getByLabelText("Search returns"), "kurta");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ q: "kurta" }));
    expect(api.counts.mock.calls.at(-1)?.[0]).toMatchObject({ q: "kurta" });
    expect(api.counts.mock.calls.at(-1)?.[0].tab).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ page: 2 }));
    expect(loc()).toContain("page=2");
    await user.selectOptions(screen.getByLabelText("Returns per page"), "50");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ pageSize: 50, page: 1 }));
  });

  it("reads a deep link: the API's filter[...] names, the page and the open drawer", async () => {
    renderPage("/returns?filter[refund]=failed&filter[status]=requested&page=2&drawer=return:r1");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ refundStatus: "failed", stage: "requested", page: 2 }));
    expect(await screen.findByRole("heading", { name: "Return RET-0001" })).toBeInTheDocument();
    expect(api.detail).toHaveBeenCalledWith("r1", expect.anything());
  });

  it("the window selector reloads tiles and insights for that many days", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("table", { name: "Returns" });
    await user.selectOptions(screen.getByLabelText("Summary window"), "90");
    await waitFor(() => expect(api.summary).toHaveBeenLastCalledWith(90, expect.anything()));
    expect(api.insights).toHaveBeenLastCalledWith(90, expect.anything());
    expect(loc()).toContain("days=90");
  });

  it("exports the CSV of the current view", async () => {
    const user = userEvent.setup();
    renderPage("/returns?tab=completed");
    await screen.findByRole("table", { name: "Returns" });
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "returns.csv"));
    expect(api.exportCsv.mock.calls[0][0]).toMatchObject({ tab: "completed" });
  });
});

describe("insights", () => {
  it("renders the reasons, the most returned SKUs with their rate, the channels and the trend", async () => {
    renderPage();
    expect(await screen.findByText("Why products come back")).toBeInTheDocument();
    const reasons = screen.getByRole("list", { name: "Return reasons" });
    expect(within(reasons).getByText("Size / fit issue")).toBeInTheDocument();
    expect(within(reasons).getByText("22 · 55%")).toBeInTheDocument();
    const sku = screen.getByText("KUR-RED-M", { selector: "td p" }).closest("tr") as HTMLElement;
    expect(within(sku).getByText("15%")).toBeInTheDocument();
    expect(within(sku).getByText("80")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Returns by channel" })).getByText("Shopify")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Returns per day, 2 points" })).toBeInTheDocument();
  });

  it("says so when the window has no returns, and offers a retry when the call fails", async () => {
    api.insights.mockResolvedValueOnce(insights({ window: { days: 30, since: "x", returns: 0 }, reasons: [], topSkus: [], channels: [], trend: { granularity: "day", points: [] } }));
    const user = userEvent.setup();
    const { unmount } = renderPage();
    expect(await screen.findByText(/No returns in the last 30 days/)).toBeInTheDocument();
    unmount();
    api.insights.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    renderPage();
    expect(await screen.findByText(/Return insights could not be loaded. boom/)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Retry" })[0] as HTMLElement);
    expect(await screen.findByText("Why products come back")).toBeInTheDocument();
  });
});

describe("states", () => {
  it("shows the empty state, the no-match state and the error with retry", async () => {
    api.ledger.mockResolvedValue(ledgerPage([], { total: 0, pages: 1 }));
    const user = userEvent.setup();
    const first = renderPage();
    expect(await screen.findByText("No returns yet.")).toBeInTheDocument();
    first.unmount();

    renderPage("/returns?q=zzz");
    expect(await screen.findByText("No returns match these filters.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Clear filters" }).at(-1) as HTMLElement);
    await waitFor(() => expect(loc()).not.toContain("q="));
  });

  it("a failed ledger can be retried", async () => {
    api.ledger.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "ledger down", status: 500 }));
    const user = userEvent.setup();
    renderPage();
    const alert = await screen.findByText("Returns could not be loaded.");
    expect(screen.getByText("ledger down")).toBeInTheDocument();
    await user.click(within(alert.closest("div") as HTMLElement).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("RET-0001")).toBeInTheDocument();
  });

  it("a viewer can read everything but every write is disabled with a reason", async () => {
    grant("returns:read");
    renderPage("/returns?drawer=return:r1");
    const create = await screen.findByRole("button", { name: "Create return", hidden: true });
    expect(create).toBeDisabled();
    expect(create).toHaveAttribute("title", "Your role can view returns but not change them.");
    const start = await screen.findByRole("button", { name: "Approve return" });
    expect(start).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reject return" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Your role can view returns but not change them.").length).toBeGreaterThan(0);
  });
});

describe("drawer", () => {
  it("shows the customer, reason, items, state and timeline of the return, and opens from a row", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Open return RET-0001" }));
    expect(loc()).toContain("drawer=return:r1");
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText("Asha Rao")).toBeInTheDocument();
    expect(within(drawer).getByText("asha@example.com")).toBeInTheDocument();
    expect(within(drawer).getAllByText("Too small").length).toBeGreaterThan(0);
    expect(await within(drawer).findByText("Requested 2 · received 0 · decided 0")).toBeInTheDocument();
    expect(within(drawer).getAllByText("Inspection").length).toBeGreaterThan(0);
    expect(within(drawer).getByText("Return timeline")).toBeInTheDocument();
    expect(within(drawer).getByText("Awaiting approval")).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "#1042" })).toHaveAttribute("href", "/orders?drawer=order:o1");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(loc()).not.toContain("drawer="));
  });

  it("shows a quantity mismatch, a failed refund and the pickup of the return", async () => {
    api.detail.mockResolvedValue(
      detail({
        receipt: { expected: 2, received: 1, match: "quantity_mismatch", mismatch: { expected: 2, received: 1 } },
        currentState: { inspection: { status: "passed", inspector: { id: "u1", name: "Ravi" } }, refund: { status: "failed", amountMinor: 299900, currency: "INR", source: "connector", error: "Gateway declined" }, disposition: "pending" },
      }),
    );
    api.order.mockResolvedValue(order({ pickup: { status: "scheduled", awb: "AWB123", scheduledAt: "2026-10-19T08:00:00.000Z" } }));
    renderPage("/returns?drawer=return:r1");
    expect(await screen.findByText("Quantity mismatch: 2 expected, 1 received.")).toBeInTheDocument();
    expect(screen.getByText("Refund failed: Gateway declined")).toBeInTheDocument();
    expect(screen.getByText("Ravi")).toBeInTheDocument();
    expect(await screen.findByText("AWB123")).toBeInTheDocument();
  });

  it("the drawer reports an error with a retry", async () => {
    api.detail.mockRejectedValueOnce(new ApiError({ code: "NOT_FOUND", message: "Return not found", status: 404 }));
    const user = userEvent.setup();
    renderPage("/returns?drawer=return:r1");
    expect(await screen.findByText(/This return could not be loaded. Return not found/)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Retry" }).at(-1) as HTMLElement);
    expect(await screen.findByRole("heading", { name: "Return RET-0001" })).toBeInTheDocument();
  });
});

describe("actions from the next-actions payload", () => {
  it("lists every step with its state and the API's reason for a blocked one", async () => {
    const user = userEvent.setup();
    await openDrawer(user);
    const steps = screen.getByRole("region", { name: "Next steps" });
    expect(within(steps).getByRole("button", { name: "Approve return" })).toBeEnabled();
    const receive = within(steps).getByRole("button", { name: "Receive goods" });
    expect(receive).toBeDisabled();
    expect(receive).toHaveAttribute("title", "Approve the return first");
    expect(within(steps).getByText("Approve the return first")).toBeInTheDocument();
  });

  it("approves with a warehouse and a note, then refreshes the returns, inventory and orders queries and the shell", async () => {
    const user = userEvent.setup();
    const { client } = renderPage("/returns?drawer=return:r1");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await screen.findByRole("region", { name: "Next steps" });
    await user.click(screen.getByRole("button", { name: "Approve return" }));
    const form = screen.getByRole("form", { name: "Approve return" });
    await user.selectOptions(await within(form).findByRole("option", { name: "Mumbai Hub (MUM-1)" }).then((o) => o.closest("select") as HTMLElement), "w1");
    await user.type(within(form).getByLabelText("Note"), "ok to send");
    await user.click(within(form).getByRole("button", { name: "Approve return" }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ id: "r1", action: "approve", body: { note: "ok to send", warehouseId: "w1" } }));
    await waitFor(() => expect(refreshShell).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0]);
    expect(keys).toEqual(expect.arrayContaining(["returns", "inventory", "orders"]));
    expect(useToastStore.getState().toasts[0]).toMatchObject({ title: "RET-0001 updated" });
  });

  it("receives into the default warehouse with the quantity of each item", async () => {
    api.nextActions.mockResolvedValue(nextActions({ status: "approved", next: "receive" }, { approve: { done: true, enabled: false }, receive: { enabled: true, disabledReason: null } }));
    const user = userEvent.setup();
    await openDrawer(user);
    await user.click(screen.getByRole("button", { name: "Receive goods" }));
    const form = screen.getByRole("form", { name: "Receive goods" });
    const qty = within(form).getByLabelText("Quantity received for KUR-RED-M");
    expect(qty).toHaveValue(2);
    await user.clear(qty);
    await user.type(qty, "1");
    await waitFor(() => expect(within(form).getByLabelText("Warehouse")).toHaveValue("w1"));
    await user.click(within(form).getByRole("button", { name: "Receive goods" }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ id: "r1", action: "receive", body: { warehouseId: "w1", items: [{ returnItemId: "i1", quantity: 1 }] } }));
  });

  it("sends the inspection result and the checklist", async () => {
    api.nextActions.mockResolvedValue(nextActions({ status: "received", next: "inspection" }, { approve: { done: true, enabled: false }, receive: { done: true, enabled: false }, inspection: { enabled: true, disabledReason: null } }));
    const user = userEvent.setup();
    await openDrawer(user);
    await user.click(screen.getByRole("button", { name: "Inspect goods" }));
    const form = screen.getByRole("form", { name: "Inspect goods" });
    await user.selectOptions(within(form).getByLabelText("Inspection result"), "fail");
    await user.click(within(form).getByLabelText("Visible damage"));
    await user.click(within(form).getByLabelText("Product usable"));
    await user.type(within(form).getByLabelText("Note"), "torn seam");
    await user.click(within(form).getByRole("button", { name: "Inspect goods" }));
    await waitFor(() =>
      expect(api.run).toHaveBeenCalledWith({
        id: "r1",
        action: "inspection",
        body: { checklist: { packagingIntact: true, productUsable: false, accessoriesPresent: true, visibleDamage: true, productMismatch: false, missingQuantity: false }, result: "fail", note: "torn seam" },
      }),
    );
  });

  it("confirms a disposition, starting from the suggestion", async () => {
    api.nextActions.mockResolvedValue(nextActions({ status: "inspecting", next: "disposition" }, { approve: { done: true, enabled: false }, receive: { done: true, enabled: false }, inspection: { done: true, enabled: false }, disposition: { enabled: true, disabledReason: null } }));
    const user = userEvent.setup();
    await openDrawer(user);
    await user.click(screen.getByRole("button", { name: "Choose disposition" }));
    const form = screen.getByRole("form", { name: "Choose disposition" });
    expect(within(form).getByText("Suggested: Inspection passed")).toBeInTheDocument();
    const select = within(form).getByLabelText("Disposition");
    expect(select).toHaveValue("sellable");
    await user.selectOptions(select, "quarantine");
    await user.click(within(form).getByRole("button", { name: "Choose disposition" }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ id: "r1", action: "disposition", body: { kind: "quarantine" } }));
  });

  it("an admin confirms a refund with the method and amount", async () => {
    api.nextActions.mockResolvedValue(nextActions({ status: "inspecting", next: "refund" }, { refund: { enabled: true, disabledReason: null } }));
    const user = userEvent.setup();
    await openDrawer(user);
    await user.click(screen.getByRole("button", { name: "Refund customer" }));
    const form = screen.getByRole("form", { name: "Refund customer" });
    expect(within(form).getByLabelText("Refund amount")).toHaveValue("2999.00");
    await user.selectOptions(within(form).getByLabelText("Refund method"), "connector");
    await user.clear(within(form).getByLabelText("Refund amount"));
    await user.type(within(form).getByLabelText("Refund amount"), "1,500.50");
    await user.type(within(form).getByLabelText("Refund reference"), "UTR-1");
    await user.click(within(form).getByRole("button", { name: "Refund customer" }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ id: "r1", action: "refund", body: { mode: "connector", amountMinor: 150050, reference: "UTR-1" } }));
  });

  it("an invalid amount blocks the refund", async () => {
    api.nextActions.mockResolvedValue(nextActions({ next: "refund" }, { refund: { enabled: true, disabledReason: null } }));
    const user = userEvent.setup();
    await openDrawer(user);
    await user.click(screen.getByRole("button", { name: "Refund customer" }));
    const form = screen.getByRole("form", { name: "Refund customer" });
    await user.clear(within(form).getByLabelText("Refund amount"));
    await user.type(within(form).getByLabelText("Refund amount"), "abc");
    expect(within(form).getByText(/Enter the amount in rupees/)).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Refund customer" })).toBeDisabled();
  });

  it("retries a failed refund through refund/retry without a body", async () => {
    api.nextActions.mockResolvedValue(nextActions({ next: "refund" }, { refund: { label: "Retry refund", href: "/api/v1/returns/r1/refund/retry", enabled: true, disabledReason: null, inputs: [] } }));
    const user = userEvent.setup();
    await openDrawer(user);
    await user.click(screen.getByRole("button", { name: "Retry refund" }));
    await user.click(within(screen.getByRole("form", { name: "Retry refund" })).getByRole("button", { name: "Retry refund" }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ id: "r1", action: "refund/retry", body: {} }));
  });

  it("staff cannot confirm refunds: the step is disabled with the reason", async () => {
    grant("returns:read", "returns:write");
    api.nextActions.mockResolvedValue(nextActions({ next: "refund" }, { refund: { enabled: true, disabledReason: null } }));
    const user = userEvent.setup();
    await openDrawer(user);
    const refund = screen.getByRole("button", { name: "Refund customer" });
    expect(refund).toBeDisabled();
    expect(refund).toHaveAttribute("title", "Only an admin can confirm a refund (permission returns:refund).");
    expect(screen.getByText("Only an admin can confirm a refund (permission returns:refund).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve return" })).toBeEnabled();
  });

  it("completes a return and can accept missing units", async () => {
    api.nextActions.mockResolvedValue(nextActions({ next: "complete" }, { complete: { enabled: true, disabledReason: null } }));
    const user = userEvent.setup();
    await openDrawer(user);
    await user.click(screen.getByRole("button", { name: "Complete return" }));
    const form = screen.getByRole("form", { name: "Complete return" });
    expect(within(form).getByText("1 unit(s) never arrived")).toBeInTheDocument();
    await user.click(within(form).getByLabelText(/Accept the units that never arrived/));
    await user.click(within(form).getByRole("button", { name: "Complete return" }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ id: "r1", action: "complete", body: { acceptShort: true } }));
  });

  it("rejects a requested return only with a reason, and cancels one that has not arrived", async () => {
    const user = userEvent.setup();
    await openDrawer(user);
    await user.click(screen.getByRole("button", { name: "Reject return" }));
    const form = screen.getByRole("form", { name: "Reject return" });
    const submit = within(form).getByRole("button", { name: "Reject return" });
    expect(submit).toBeDisabled();
    await user.type(within(form).getByLabelText("Rejection reason"), "Outside the return window");
    await user.click(submit);
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ id: "r1", action: "reject", body: { note: "Outside the return window" } }));

    await user.click(screen.getByRole("button", { name: "Cancel return" }));
    await user.click(within(screen.getByRole("form", { name: "Cancel return" })).getByRole("button", { name: "Cancel return" }));
    await waitFor(() => expect(api.run).toHaveBeenLastCalledWith({ id: "r1", action: "cancel", body: {} }));
  });

  it("does not offer reject or cancel once the goods are received", async () => {
    api.detail.mockResolvedValue(detail({ header: { ...detail().header, status: "received" } }));
    const user = userEvent.setup();
    await openDrawer(user);
    expect(screen.queryByRole("button", { name: "Reject return" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel return" })).not.toBeInTheDocument();
  });

  it("shows the API's reason for a 409 and keeps the form open", async () => {
    api.nextActions.mockResolvedValue(nextActions({ next: "refund" }, { refund: { enabled: true, disabledReason: null } }));
    api.run.mockRejectedValueOnce(conflict("The inspection must be finished before the refund", "inspection_required"));
    const user = userEvent.setup();
    await openDrawer(user);
    await user.click(screen.getByRole("button", { name: "Refund customer" }));
    const form = screen.getByRole("form", { name: "Refund customer" });
    await user.click(within(form).getByRole("button", { name: "Refund customer" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("The inspection must be finished before the refund");
    expect(screen.getByRole("form", { name: "Refund customer" })).toBeInTheDocument();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("names the missing permission on a 403", async () => {
    api.run.mockRejectedValueOnce(new ApiError({ code: "FORBIDDEN", message: "Forbidden", status: 403, details: { requiredPermission: "returns:write" } }));
    const user = userEvent.setup();
    await openDrawer(user);
    await user.click(screen.getByRole("button", { name: "Approve return" }));
    await user.click(within(screen.getByRole("form", { name: "Approve return" })).getByRole("button", { name: "Approve return" }));
    expect(await screen.findByText("You do not have permission for this (needs returns:write).")).toBeInTheDocument();
  });

  it("the steps can be reloaded after a failure", async () => {
    api.nextActions.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "steps down", status: 500 }));
    const user = userEvent.setup();
    renderPage("/returns?drawer=return:r1");
    expect(await screen.findByText(/The next steps could not be loaded. steps down/)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Retry" }).at(-1) as HTMLElement);
    expect(await screen.findByRole("region", { name: "Next steps" })).toBeInTheDocument();
  });
});

describe("create a return", () => {
  const eligible = {
    order: { id: "o1", number: "#1042", channel: { code: "shopify", name: "Shopify" }, status: "delivered", totalMinor: 350000, currency: "INR", customer: { name: "Asha Rao" } },
    items: [
      { orderItemId: "oi1", title: "Cotton Kurta", variant: null, sku: "KUR-RED-M", fulfilledQty: 3, alreadyReturnedQty: 1, availableQty: 2, unitPriceMinor: 149950 },
      { orderItemId: "oi2", title: "Scarf", variant: null, sku: "SCF-1", fulfilledQty: 1, alreadyReturnedQty: 1, availableQty: 0, unitPriceMinor: 50000 },
    ],
    note: "x",
  };

  it("finds the order, takes units and a reason, and opens the new return", async () => {
    api.eligibility.mockResolvedValue(eligible);
    api.create.mockResolvedValue(order());
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Create return" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Order number"), "#1042");
    await user.click(within(dialog).getByRole("button", { name: "Find order" }));
    expect(api.eligibility).toHaveBeenCalledWith("#1042");
    const qty = await within(dialog).findByLabelText("Units to return for KUR-RED-M");
    expect(within(dialog).getByLabelText("Units to return for SCF-1")).toBeDisabled();
    expect(within(dialog).getByText(/2 of 3 can still be returned/)).toBeInTheDocument();
    const submit = within(dialog).getByRole("button", { name: "Create return" });
    expect(submit).toBeDisabled();
    await user.type(qty, "2");
    await user.selectOptions(within(dialog).getByLabelText("Return reason"), "defective");
    expect(within(dialog).queryByRole("option", { name: "Size" })).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Return details"), "seam torn");
    await user.click(submit);
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ orderId: "o1", reasonCode: "defective", reasonText: "seam torn", items: [{ orderItemId: "oi1", quantity: 2 }] }));
    await waitFor(() => expect(loc()).toContain("drawer=return:r1"));
    expect(useToastStore.getState().toasts[0]).toMatchObject({ title: "Return RET-0001 created" });
  });

  it("shows why an order cannot be returned", async () => {
    api.eligibility.mockRejectedValue(conflict("A new order has not been fulfilled; only fulfilled orders can be returned", "order_not_fulfilled"));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Create return" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Order number"), "1050");
    await user.click(within(dialog).getByRole("button", { name: "Find order" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("only fulfilled orders can be returned");
  });

  it("disables the button with the reason when no store allows it", async () => {
    api.overview.mockResolvedValue({ createReturn: { available: false, reason: "shopify_only", allowedChannels: ["shopify"] } });
    renderPage();
    const button = await screen.findByRole("button", { name: "Create return" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("title", "Returns can only be created for orders from a connected Shopify store.");
  });
});
