import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { analytics, attention, detail, dispositionOptions, insights, inspectionView, ledgerPage, nextActions, order, overview, refundQueue, refundView, row, summary, tabCounts } from "./returnsFixtures";

const api = vi.hoisted(() => ({
  summary: vi.fn(),
  overview: vi.fn(),
  insights: vi.fn(),
  analytics: vi.fn(),
  attention: vi.fn(),
  exportAttention: vi.fn(),
  refunds: vi.fn(),
  refundView: vi.fn(),
  inspection: vi.fn(),
  saveInspection: vi.fn(),
  dispositionOptions: vi.fn(),
  assignInspection: vi.fn(),
  sync: vi.fn(),
  syncJob: vi.fn(),
  ledgerAll: vi.fn(),
  markInspection: vi.fn(),
  members: vi.fn(),
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
// the chart needs a real layout, which jsdom does not have
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
}));

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

const R1 = row({ action: { key: "inspect", href: "x" } });
const R2 = row({
  id: "r2",
  number: "RET-0002",
  orderNumber: "#1043",
  channel: { code: "mock", name: "Sandbox" },
  stage: "resolution",
  stageLabel: "Resolution",
  refund: { status: "failed", amountMinor: 150000, currency: "INR", source: "manual" },
  customer: null,
  action: { key: "refund", href: "x" },
  signals: ["refunds_pending"],
});

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("returns:read", "returns:write", "returns:refund");
  useWorkspaceStore.setState({ user: { id: "u1", fullName: "Ravi", email: "r@x.com", businessName: "B" } as never });
  refreshShell.mockResolvedValue(undefined);
  api.summary.mockResolvedValue(summary());
  api.overview.mockResolvedValue(overview());
  api.insights.mockResolvedValue(insights());
  api.analytics.mockResolvedValue(analytics());
  api.attention.mockResolvedValue(attention());
  api.exportAttention.mockResolvedValue({ blob: new Blob(["a"]), fileName: "returns-attention.csv" });
  api.refunds.mockResolvedValue(refundQueue());
  api.refundView.mockResolvedValue(refundView());
  api.inspection.mockResolvedValue(inspectionView());
  api.saveInspection.mockResolvedValue(inspectionView({ status: "passed" }));
  api.dispositionOptions.mockResolvedValue(dispositionOptions());
  api.assignInspection.mockResolvedValue({ assigned: ["r1"], skipped: [] });
  api.sync.mockResolvedValue({ enqueued: true, reason: null, eligibleAccounts: 1, jobs: [{ accountId: "a1", accountName: "Sandbox Seller", marketplace: "mock", jobId: "j1", status: "queued", alreadyQueued: false }], skipped: [{ accountId: "a2", accountName: "Flipkart Store", marketplace: "flipkart", reason: "returns_fetch_not_supported" }] });
  api.syncJob.mockResolvedValue({ id: "j1", status: "succeeded", marketplaceAccountId: "a1", progress: { total: 0, done: 3, failed: 0 }, stats: { fetched: 3, created: 2, duplicates: 1, cancelled: 0, rejected: 0, unmatched: 0, failed: 0 }, error: null, failureDetails: [] });
  api.ledgerAll.mockResolvedValue({ rows: [R1, R2], truncated: false });
  api.markInspection.mockResolvedValue({ marked: ["r1"], skipped: [] });
  api.members.mockResolvedValue([{ id: "u1", name: "Ravi" }]);
  api.ledger.mockResolvedValue(ledgerPage([R1, R2], { total: 51, pages: 3 }));
  api.counts.mockResolvedValue(tabCounts());
  api.detail.mockResolvedValue(detail());
  api.order.mockResolvedValue(order());
  api.nextActions.mockResolvedValue(nextActions());
  api.run.mockResolvedValue(order());
  api.reasons.mockResolvedValue([{ code: "other", label: "Other", sources: ["customer", "seller"] }, { code: "defective", label: "Defective / not working", sources: ["customer", "seller"] }, { code: "size_fit", label: "Size / fit issue", sources: ["customer", "seller"] }, { code: "recall", label: "Recalled by the seller", sources: ["seller"] }]);
  api.warehouses.mockResolvedValue([{ id: "w1", code: "MUM-1", name: "Mumbai Hub", isDefault: true }]);
  api.marketplaces.mockResolvedValue([{ code: "shopify", name: "Shopify" }, { code: "mock", name: "Sandbox" }]);
  api.exportCsv.mockResolvedValue({ blob: new Blob(["a"]), fileName: "returns.csv" });
});

const openDrawer = async () => {
  renderPage("/returns?drawer=return:r1");
  await screen.findByRole("heading", { name: "Return RET-0001" });
  await screen.findByRole("region", { name: "Next steps" });
};

describe("overview: header, stages, signals, numbers", () => {
  it("shows the status line, the glance numbers, the stage rail and the signals from the API", async () => {
    renderPage();
    expect(await screen.findByText("11 open returns · 5 awaiting inspection · 3 refunds pending")).toBeInTheDocument();
    expect(screen.getByText("Create Return: Shopify connection only")).toBeInTheDocument();
    expect(await screen.findByText("Return requests (30D)")).toBeInTheDocument();
    expect(screen.getByText("3 today, 11 open")).toBeInTheDocument();
    expect(screen.getByText("2 overdue (over 24 h)")).toBeInTheDocument();
    expect(screen.getByText("4.8%")).toBeInTheDocument();
    expect(screen.getByText(/40 of 833 orders\. Previous 30 days: 5\.2% \(-0\.4 pts\)/)).toBeInTheDocument();
    expect(screen.getByText("7 returns, 3 ready to refund")).toBeInTheDocument();
    expect(screen.queryByText(/industry/i)).not.toBeInTheDocument();
    const stages = await screen.findByRole("group", { name: "Returns by stage" });
    expect(within(stages).getByRole("button", { name: /Resolution\s*6\s*4 refund pending/ })).toBeInTheDocument();
    expect(within(stages).getByRole("button", { name: /Inspecting\s*2\s*1 need review/ })).toBeInTheDocument();
    expect(within(stages).getByRole("button", { name: /Closed\s*20/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5 returns awaiting inspection" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 return has an inventory discrepancy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "0 high-value returns need review" })).toBeInTheDocument();
  });

  it("a stage and a signal narrow the ledger through the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("table", { name: "Returns" });
    await user.click(within(screen.getByRole("group", { name: "Returns by stage" })).getByRole("button", { name: /Resolution/ }));
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ stage: "resolution" }));
    expect(loc()).toContain("stage=resolution");
    await user.click(screen.getByRole("button", { name: "3 refunds pending" }));
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ signal: "refunds_pending" }));
    expect(await screen.findByText("FILTER APPLIED")).toBeInTheDocument();
    expect(screen.getByText("Clear filter ×")).toBeInTheDocument();
  });

  it("the window selector reloads the numbers, analytics and insights", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("table", { name: "Returns" });
    await user.selectOptions(screen.getByLabelText("Summary window"), "90");
    await waitFor(() => expect(api.summary).toHaveBeenLastCalledWith(90, expect.anything()));
    expect(api.insights).toHaveBeenLastCalledWith(90, expect.anything());
    expect(api.analytics).toHaveBeenLastCalledWith(90, expect.anything());
    expect(loc()).toContain("days=90");
  });

  it("Sync Returns runs the real job: live progress, then the counts per account and the accounts that cannot send returns", async () => {
    const user = userEvent.setup();
    api.syncJob
      .mockResolvedValueOnce({ id: "j1", status: "running", marketplaceAccountId: "a1", progress: { total: 0, done: 1, failed: 0 }, stats: {}, error: null, failureDetails: [] });
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Sync Returns/ }));
    await waitFor(() => expect(api.sync).toHaveBeenCalledWith({}));
    const panel = await screen.findByRole("status", { name: "Returns sync" });
    expect(await within(panel).findByText("1 return checked so far")).toBeInTheDocument();
    expect(within(panel).getByText("Syncing returns...")).toBeInTheDocument();
    // the next poll finds the job done
    expect(await within(panel).findByText(/2 new, 1 already in the ledger/, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(await within(panel).findByText("Returns synced")).toBeInTheDocument();
    expect(api.syncJob).toHaveBeenCalledWith("j1");
    expect(within(panel).getByRole("list", { name: "Accounts that cannot send returns" })).toHaveTextContent("Flipkart Store (flipkart): This marketplace does not send returns through its connector.");
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.description).toMatch(/2 new returns, 1 already in the ledger/));
    // the numbers were refreshed
    await waitFor(() => expect(api.summary.mock.calls.length).toBeGreaterThan(1));
    await user.click(within(panel).getByRole("button", { name: "Dismiss sync report" }));
    expect(screen.queryByRole("status", { name: "Returns sync" })).not.toBeInTheDocument();
  });

  it("Sync Returns lists what could not be imported and offers to sync again", async () => {
    const user = userEvent.setup();
    api.syncJob.mockResolvedValue({ id: "j1", status: "partially_failed", marketplaceAccountId: "a1", progress: { total: 0, done: 2, failed: 1 }, stats: { fetched: 2, created: 1, failed: 1, unmatched: 1 }, error: null, failureDetails: [{ ref: "MR-9", code: "ORDER_NOT_IMPORTED", message: "Order MO-9 has not been imported yet" }] });
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Sync Returns/ }));
    const panel = await screen.findByRole("status", { name: "Returns sync" });
    expect(await within(panel).findByText("Returns synced, with problems")).toBeInTheDocument();
    expect(within(panel).getByRole("list", { name: /could not be imported/ })).toHaveTextContent("MR-9 · Order MO-9 has not been imported yet");
    await user.click(within(panel).getByRole("button", { name: "Sync again" }));
    await waitFor(() => expect(api.sync).toHaveBeenCalledTimes(2));
  });

  it("Sync Returns says so when no connected marketplace can send returns", async () => {
    const user = userEvent.setup();
    api.sync.mockResolvedValue({ enqueued: false, reason: "no_eligible_accounts", eligibleAccounts: 0, jobs: [], skipped: [] });
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Sync Returns/ }));
    const panel = await screen.findByRole("status", { name: "Returns sync" });
    expect(await within(panel).findByText("Nothing to sync")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "See your connections" })).toHaveAttribute("href", "/marketplace-hub");
    expect(api.syncJob).not.toHaveBeenCalled();
  });

  it("the more menu exports the attention list, refreshes and reopens the last sync report", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Last sync report" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Marketplace connections" })).toHaveAttribute("href", "/marketplace-hub");
    await user.click(screen.getByRole("menuitem", { name: "Export attention list (CSV)" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "returns-attention.csv"));
    const before = api.summary.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Refresh numbers" }));
    await waitFor(() => expect(api.summary.mock.calls.length).toBeGreaterThan(before));
  });
});

describe("ledger", () => {
  it("lists the rows with order, product, channel, reason, stage, inspection, refund and action", async () => {
    renderPage();
    const table = await screen.findByRole("table", { name: "Returns" });
    const r1 = within(table).getByText("RET-0001").closest("tr") as HTMLElement;
    expect(within(r1).getByText("#1042")).toBeInTheDocument();
    expect(within(r1).getByText("Cotton Kurta")).toBeInTheDocument();
    expect(within(r1).getByText(/KUR-RED-M \+1 more/)).toBeInTheDocument();
    expect(within(r1).getByText("Shopify")).toBeInTheDocument();
    expect(within(r1).getByText("Size / fit issue")).toBeInTheDocument();
    expect(within(r1).getByText("Requested")).toBeInTheDocument();
    expect(within(r1).getByText("Inspect →")).toBeInTheDocument();
    const r2 = within(table).getByText("RET-0002").closest("tr") as HTMLElement;
    expect(within(r2).getByText("Failed")).toBeInTheDocument();
    expect(within(r2).getByText("Review failure →")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "returns pagination" })).toHaveTextContent(/of\s*51\s*returns/);
    expect(screen.getByRole("tab", { name: /Needs Attention\s*8/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Refund Pending\s*6/ })).toBeInTheDocument();
  });

  it("queues, filters, search and paging go to the URL and the query", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("table", { name: "Returns" });
    await user.click(screen.getByRole("tab", { name: /Refund Pending/ }));
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ tab: "refund_pending" }));
    expect(loc()).toContain("tab=refund_pending");

    await user.selectOptions(screen.getByLabelText("Marketplace"), "shopify");
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.selectOptions(screen.getByLabelText("Refund status"), "failed");
    await user.selectOptions(screen.getByLabelText("Inspection status"), "passed");
    await user.selectOptions(screen.getByLabelText("Attention signal"), "refunds_pending");
    await user.selectOptions(screen.getByLabelText("Disposition"), "damaged");
    await user.selectOptions(screen.getByLabelText("Sort returns"), "-refundAmount");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ refundStatus: "failed", inspectionStatus: "passed", marketplace: "shopify", signal: "refunds_pending", disposition: "damaged", sort: "-refundAmount" }));
    expect(loc()).toContain("refund=failed");

    await user.type(screen.getByLabelText("Search returns"), "kurta");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ q: "kurta" }));
    expect(api.counts.mock.calls.at(-1)?.[0]).toMatchObject({ q: "kurta" });

    await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0] as HTMLElement);
    await waitFor(() => expect(lastLedgerQuery().refundStatus).toBeUndefined());
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ page: 2 }));
    await user.selectOptions(screen.getByLabelText("returns per page"), "50");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ pageSize: 50, page: 1 }));
  });

  it("reads a deep link with the API's filter[...] names, the page and the drawer", async () => {
    renderPage("/returns?filter[refund]=failed&filter[status]=requested&page=2&drawer=return:r1");
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ refundStatus: "failed", stage: "requested", page: 2 }));
    expect(await screen.findByRole("heading", { name: "Return RET-0001" })).toBeInTheDocument();
  });

  it("exports the CSV of the current view", async () => {
    const user = userEvent.setup();
    renderPage("/returns?tab=completed");
    await screen.findByRole("table", { name: "Returns" });
    await user.click(screen.getByRole("button", { name: /^Export$/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "returns.csv"));
    expect(api.exportCsv.mock.calls[0][0]).toMatchObject({ tab: "completed" });
  });

  it("selects rows, exports the selection and assigns an inspector", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("table", { name: "Returns" });
    await user.click(screen.getByRole("checkbox", { name: "Select RET-0001" }));
    const bar = await screen.findByRole("toolbar", { name: "Selected returns" });
    expect(within(bar).getByText("1 selected")).toBeInTheDocument();
    await user.click(within(bar).getByRole("button", { name: "Export selected" }));
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "returns-selected.csv");
    await user.click(within(bar).getByRole("button", { name: "Assign inspection" }));
    await user.click(within(bar).getAllByRole("button", { name: "Assign inspection" })[1] as HTMLElement);
    await waitFor(() => expect(api.assignInspection).toHaveBeenCalledWith(["r1"], "u1"));
  });

  it("selection bar: Select all across the pages, Mark inspection status and Review selected", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("table", { name: "Returns" });
    await user.click(screen.getByRole("checkbox", { name: "Select RET-0001" }));
    const bar = await screen.findByRole("toolbar", { name: "Selected returns" });
    await user.click(within(bar).getByRole("button", { name: "Select all (51)" }));
    await waitFor(() => expect(api.ledgerAll).toHaveBeenCalled());
    expect(await within(bar).findByText("2 selected")).toBeInTheDocument();
    await user.click(within(bar).getByRole("button", { name: "Mark inspection status" }));
    await user.selectOptions(within(bar).getByLabelText("Inspection status to mark"), "needs_review");
    await user.click(within(bar).getAllByRole("button", { name: "Mark inspection status" })[1] as HTMLElement);
    await waitFor(() => expect(api.markInspection).toHaveBeenCalledWith(["r1", "r2"], "needs_review", undefined));
    // marking clears the selection; pick again and review: the drawer steps through the picked returns
    await user.click(screen.getByRole("checkbox", { name: "Select RET-0001" }));
    await user.click(screen.getByRole("checkbox", { name: "Select RET-0002" }));
    await user.click(within(await screen.findByRole("toolbar", { name: "Selected returns" })).getByRole("button", { name: "Review selected" }));
    const review = await screen.findByRole("group", { name: "Review selected returns" });
    expect(within(review).getByText("Reviewing 1 of 2")).toBeInTheDocument();
    await user.click(within(review).getByRole("button", { name: /Next/ }));
    expect(await screen.findByText("Reviewing 2 of 2")).toBeInTheDocument();
    expect(within(await screen.findByRole("group", { name: "Review selected returns" })).getByRole("button", { name: /Next/ })).toBeDisabled();
  });

  it("shows the empty state, the no-match state and a retry after an error", async () => {
    api.ledger.mockResolvedValue(ledgerPage([], { total: 0, pages: 1 }));
    const first = renderPage();
    expect(await screen.findByText("No returns yet.")).toBeInTheDocument();
    first.unmount();
    renderPage("/returns?q=zzz");
    expect(await screen.findByText("No returns match these filters.")).toBeInTheDocument();
  });

  it("a failed ledger can be retried", async () => {
    api.ledger.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "ledger down", status: 500 }));
    const user = userEvent.setup();
    renderPage();
    const alert = await screen.findByText("Returns could not be loaded.");
    expect(screen.getByText("ledger down")).toBeInTheDocument();
    await user.click(within(alert.closest("div") as HTMLElement).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("checkbox", { name: "Select RET-0001" })).toBeInTheDocument();
  });
});

describe("analytics and attention", () => {
  it("shows the reason shares, the recommendation with its evidence, the SKUs, channels and trend", async () => {
    renderPage();
    expect(await screen.findByText("Why products are coming back")).toBeInTheDocument();
    const reasons = screen.getByRole("list", { name: "Return reasons" });
    expect(within(reasons).getByText("Size / fit issue")).toBeInTheDocument();
    expect(within(reasons).getByText("55%")).toBeInTheDocument();
    expect(screen.getByText("Return activity is concentrated around 2 products.")).toBeInTheDocument();
    expect(screen.getByText("55% of recent returns mention a sizing issue.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review size chart →" })).toHaveAttribute("href", "/products?sku=KUR-RED-M");
    expect(screen.getByText("Recommendations only. This never changes listings, inventory, or refund decisions.")).toBeInTheDocument();
    const sku = (await screen.findByText("KUR-RED-M", { selector: "td p" })).closest("tr") as HTMLElement;
    expect(within(sku).getByText("15%")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Returns by channel" })).getByText("Shopify")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Returns per day, 2 points" })).toBeInTheDocument();
  });

  it("offers a retry when the analytics call fails", async () => {
    api.analytics.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("The return analytics could not be loaded.")).toBeInTheDocument();
    await user.click(within(screen.getByText("The return analytics could not be loaded.").closest("div") as HTMLElement).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Why products are coming back")).toBeInTheDocument();
  });

  it("lists the returns that need attention, opens the right drawer and exports", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("2 returns need attention", { selector: "h2" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Returns that need attention" });
    expect(within(table).getByText("Refund failed, 1500.00 INR")).toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "Review connector failure RET-0002" }));
    await waitFor(() => expect(loc()).toContain("drawer=refund:r2"));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Export exceptions" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "returns-attention.csv"));
  });
});

describe("Returns, Inspection and Refunds tabs", () => {
  it("the workspace tabs live in the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("table", { name: "Returns" });
    await user.click(screen.getByRole("tab", { name: "Refunds" }));
    expect(loc()).toContain("view=refunds");
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(loc()).not.toContain("view=");
  });

  it("Returns tab: picking a return shows the steps and the receipt reconciliation", async () => {
    const user = userEvent.setup();
    renderPage("/returns?view=returns");
    const table = await screen.findByRole("table", { name: "Returns" });
    await user.click(within(table).getByText("RET-0001"));
    expect(await screen.findByText("Requested is not resolved.")).toBeInTheDocument();
    expect(screen.getByText("Verify")).toBeInTheDocument();
    expect(screen.getByText("Decide")).toBeInTheDocument();
    expect(screen.getByText("Resolve")).toBeInTheDocument();
    const rec = await screen.findByRole("table", { name: "Receipt reconciliation" });
    expect(within(rec).getByText(/KUR-RED-M/)).toBeInTheDocument();
    expect(within(rec).getByText("Awaiting receipt")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Verify/ }));
    await waitFor(() => expect(loc()).toContain("drawer=inspect:r1"));
  });

  it("Inspection tab: the queue, conditions and the explicit disposition decision", async () => {
    api.ledger.mockResolvedValue(
      ledgerPage([row({ status: "inspecting", stage: "inspecting", stageLabel: "Inspecting", receivedAt: "2026-10-17T08:00:00.000Z", receivedQuantity: 1, inspection: { status: "requires_review", inspector: { id: "u1", name: "Ravi" }, physical: "incomplete" } })]),
    );
    const user = userEvent.setup();
    renderPage("/returns?view=inspection");
    const table = await screen.findByRole("table", { name: "Return inspection" });
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ tab: "awaiting_inspection" }));
    expect(within(table).getByText("Incomplete")).toBeInTheDocument();
    expect(within(table).getByText("Quantity mismatch")).toBeInTheDocument();
    expect(within(table).getByText("Ravi")).toBeInTheDocument();
    expect(within(table).getByText("Quarantine - Suggested")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Passed" }));
    await waitFor(() => expect(lastLedgerQuery()).toMatchObject({ inspectionStatus: "passed" }));

    await user.click(within(table).getByText("Ravi"));
    expect(await screen.findByText("What should happen to this returned stock?")).toBeInTheDocument();
    expect(screen.getByText("Recommendation: Return to sellable stock")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Confirm disposition" });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Quarantine/ }));
    await user.click(confirm);
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ id: "r1", action: "disposition", body: { kind: "quarantine" } }));
  });

  it("Inspection tab: a blocked decision says why", async () => {
    api.dispositionOptions.mockResolvedValue(dispositionOptions({ canConfirm: false, blockedReason: "inspection_not_finished", recommendation: { kind: null, reason: "Pending inspection", suggestedOnly: true } }));
    renderPage("/returns?view=inspection&focus=r1");
    expect(await screen.findByText("Recommendation: Pending inspection")).toBeInTheDocument();
    expect(screen.getByText("Finish the inspection before choosing a disposition.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm disposition" })).toBeDisabled();
  });

  it("Refunds tab: the queue with amounts, statuses, actions and the footer counts", async () => {
    const user = userEvent.setup();
    renderPage("/returns?view=refunds");
    const table = await screen.findByRole("table", { name: "Refunds" });
    const r2 = within(table).getByText("RET-0002").closest("tr") as HTMLElement;
    expect(within(r2).getByText("Refund Failed")).toBeInTheDocument();
    expect(within(r2).getByText(/1,500/)).toBeInTheDocument();
    expect(within(r2).getByText("Review failure →")).toBeInTheDocument();
    const r1 = within(table).getByText("RET-0001").closest("tr") as HTMLElement;
    expect(within(r1).getByText("Ready for Refund")).toBeInTheDocument();
    expect(screen.getByText(/2 refunds pending resolution: 1 ready · 0 processing · 1 failed/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Failed/ }));
    await waitFor(() => expect(api.refunds.mock.calls.at(-1)?.[0]).toMatchObject({ status: "failed" }));
    await user.click(within(r1).getByRole("button", { name: "Review refund RET-0001" }));
    await waitFor(() => expect(loc()).toContain("drawer=refund:r1"));
  });
});

describe("return detail drawer", () => {
  it("shows customer, reason, items, state and timeline, and opens from a row", async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await screen.findByRole("table", { name: "Returns" });
    await user.click(within(table).getByRole("button", { name: "RET-0001" }));
    expect(loc()).toContain("drawer=return:r1");
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/Asha Rao · asha@example.com/)).toBeInTheDocument();
    expect(within(dialog).getByText("Requested 2 · received 0 · decided 0")).toBeInTheDocument();
    expect(within(dialog).getByText("Event timeline")).toBeInTheDocument();
    expect(within(dialog).getByText("Awaiting approval")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "View Order" })).toHaveAttribute("href", "/orders?drawer=order:o1");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(loc()).not.toContain("drawer="));
  });

  it("shows a quantity mismatch, a failed refund and the pickup", async () => {
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
    expect(screen.getByText("Inspector Ravi")).toBeInTheDocument();
    expect(await screen.findByText(/AWB AWB123/)).toBeInTheDocument();
  });

  it("reports an error with a retry", async () => {
    api.detail.mockRejectedValueOnce(new ApiError({ code: "NOT_FOUND", message: "Return not found", status: 404 }));
    const user = userEvent.setup();
    renderPage("/returns?drawer=return:r1");
    expect(await screen.findByText(/This return could not be loaded. Return not found/)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Retry" }).at(-1) as HTMLElement);
    expect(await screen.findByRole("heading", { name: "Return RET-0001" })).toBeInTheDocument();
  });

  it("Start inspection moves to the inspection drawer", async () => {
    const user = userEvent.setup();
    await openDrawer();
    await user.click(screen.getByRole("button", { name: "Start inspection" }));
    await waitFor(() => expect(loc()).toContain("drawer=inspect:r1"));
  });

  it("a viewer reads everything but every write is disabled with a reason", async () => {
    grant("returns:read");
    renderPage("/returns?drawer=return:r1");
    const start = await screen.findByRole("button", { name: "Approve return" });
    expect(start).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reject return" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Your role can view returns but not change them.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Create Return/ })).toBeDisabled();
  });
});

describe("next steps in the drawer", () => {
  it("lists every step with the API's reason for a blocked one", async () => {
    await openDrawer();
    const steps = screen.getByRole("region", { name: "Next steps" });
    expect(within(steps).getByRole("button", { name: "Approve return" })).toBeEnabled();
    const receive = within(steps).getByRole("button", { name: "Receive goods" });
    expect(receive).toBeDisabled();
    expect(receive).toHaveAttribute("title", "Approve the return first");
  });

  it("approves with a warehouse and a note, then refreshes returns, inventory, orders and the shell", async () => {
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
    await openDrawer();
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

  it("the inspection and refund steps open their own drawers", async () => {
    api.nextActions.mockResolvedValue(nextActions({ status: "received", next: "inspection" }, { approve: { done: true, enabled: false }, receive: { done: true, enabled: false }, inspection: { enabled: true, disabledReason: null } }));
    const user = userEvent.setup();
    await openDrawer();
    await user.click(screen.getByRole("button", { name: "Open Inspect goods" }));
    await waitFor(() => expect(loc()).toContain("drawer=inspect:r1"));
  });

  it("confirms a disposition, starting from the suggestion", async () => {
    api.nextActions.mockResolvedValue(nextActions({ status: "inspecting", next: "disposition" }, { approve: { done: true, enabled: false }, receive: { done: true, enabled: false }, inspection: { done: true, enabled: false }, disposition: { enabled: true, disabledReason: null } }));
    const user = userEvent.setup();
    await openDrawer();
    await user.click(screen.getByRole("button", { name: "Choose disposition" }));
    const form = screen.getByRole("form", { name: "Choose disposition" });
    expect(within(form).getByText("Suggested: Inspection passed")).toBeInTheDocument();
    expect(within(form).getByLabelText("Disposition")).toHaveValue("sellable");
    await user.selectOptions(within(form).getByLabelText("Disposition"), "quarantine");
    await user.click(within(form).getByRole("button", { name: "Choose disposition" }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ id: "r1", action: "disposition", body: { kind: "quarantine" } }));
  });

  it("completes a return and can accept missing units", async () => {
    api.nextActions.mockResolvedValue(nextActions({ next: "complete" }, { complete: { enabled: true, disabledReason: null } }));
    const user = userEvent.setup();
    await openDrawer();
    await user.click(screen.getByRole("button", { name: "Complete return" }));
    const form = screen.getByRole("form", { name: "Complete return" });
    await user.click(within(form).getByLabelText(/Accept the units that never arrived/));
    await user.click(within(form).getByRole("button", { name: "Complete return" }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ id: "r1", action: "complete", body: { acceptShort: true } }));
  });

  it("rejects only with a reason, and cancels a return that has not arrived", async () => {
    const user = userEvent.setup();
    await openDrawer();
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

  it("shows the API's reason for a 409 and a missing permission for a 403", async () => {
    api.run.mockRejectedValueOnce(conflict("The goods are already received", "already_received"));
    const user = userEvent.setup();
    await openDrawer();
    await user.click(screen.getByRole("button", { name: "Approve return" }));
    const form = screen.getByRole("form", { name: "Approve return" });
    await user.click(within(form).getByRole("button", { name: "Approve return" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("The goods are already received");
    api.run.mockRejectedValueOnce(new ApiError({ code: "FORBIDDEN", message: "Forbidden", status: 403, details: { requiredPermission: "returns:write" } }));
    await user.click(within(form).getByRole("button", { name: "Approve return" }));
    expect(await screen.findByText("You do not have permission for this (needs returns:write).")).toBeInTheDocument();
  });
});

describe("inspection drawer", () => {
  it("saves the checklist, a custom condition and the result", async () => {
    api.detail.mockResolvedValue(detail({ header: { ...detail().header, status: "received" } }));
    const user = userEvent.setup();
    renderPage("/returns?drawer=inspect:r1");
    expect(await screen.findByRole("heading", { name: "Inspect RET-0001" })).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save inspection" });
    expect(save).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Visible damage: Yes" }));
    await user.click(screen.getByRole("button", { name: "Product usable: No" }));
    await user.click(screen.getByRole("button", { name: "Add Conditions" }));
    await user.type(screen.getByLabelText("New condition"), "Tags attached");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Fail" }));
    await user.type(screen.getByLabelText("Inspection note"), "torn seam");
    await user.click(save);
    await waitFor(() =>
      expect(api.saveInspection).toHaveBeenCalledWith({
        id: "r1",
        checklist: { packagingIntact: true, productUsable: false, accessoriesPresent: true, visibleDamage: true, productMismatch: false, missingQuantity: false, custom: [{ label: "Tags attached", ok: true }] },
        result: "fail",
        note: "torn seam",
      }),
    );
    await waitFor(() => expect(loc()).not.toContain("drawer="));
  });

  it("cannot save before the goods arrive and shows the missing units", async () => {
    api.inspection.mockResolvedValue(inspectionView({ systemCondition: "quantity_mismatch", quantity: { expected: 2, received: 1 } }));
    const user = userEvent.setup();
    renderPage("/returns?drawer=inspect:r1");
    expect(await screen.findByText("1 unit is missing")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pass" }));
    expect(screen.getByRole("button", { name: "Save inspection" })).toBeDisabled();
    expect(screen.getByText(/Receive the goods first/)).toBeInTheDocument();
  });
});

describe("refund drawer", () => {
  it("an admin issues a refund with the method and amount", async () => {
    api.nextActions.mockResolvedValue(nextActions({ status: "inspecting", next: "refund" }, { refund: { enabled: true, disabledReason: null } }));
    const user = userEvent.setup();
    renderPage("/returns?drawer=refund:r1");
    expect(await screen.findByRole("heading", { name: "Refund — RET-0001" })).toBeInTheDocument();
    expect(screen.getByText("Ready for Refund · Inspection completed")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Issue Refund/ }));
    const form = screen.getByRole("form", { name: "Refund customer" });
    expect(within(form).getByLabelText("Refund amount")).toHaveValue("2999.00");
    await user.selectOptions(within(form).getByLabelText("Refund method"), "connector");
    await user.clear(within(form).getByLabelText("Refund amount"));
    await user.type(within(form).getByLabelText("Refund amount"), "1,500.50");
    await user.click(within(form).getByRole("button", { name: "Issue refund" }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ id: "r1", action: "refund", body: { mode: "connector", amountMinor: 150050 } }));
  });

  it("retries a failed refund without a body and shows the failure", async () => {
    api.refundView.mockResolvedValue(refundView({ refund: { ...refundView().refund, status: "failed", source: "connector", error: "Gateway declined" } }));
    api.nextActions.mockResolvedValue(nextActions({ next: "refund" }, { refund: { label: "Retry refund", href: "/api/v1/returns/r1/refund/retry", enabled: true, disabledReason: null, inputs: [] } }));
    const user = userEvent.setup();
    renderPage("/returns?drawer=refund:r1");
    expect(await screen.findByText("Connector Failure")).toBeInTheDocument();
    expect(screen.getAllByText(/Gateway declined/).length).toBeGreaterThan(0);
    await user.click(await screen.findByRole("button", { name: "Retry Refund via Connector" }));
    await user.click(within(screen.getByRole("form", { name: "Retry refund" })).getByRole("button", { name: "Retry refund" }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ id: "r1", action: "refund/retry", body: {} }));
  });

  it("staff cannot issue refunds: the button is disabled with the reason", async () => {
    grant("returns:read", "returns:write");
    api.nextActions.mockResolvedValue(nextActions({ next: "refund" }, { refund: { enabled: true, disabledReason: null } }));
    renderPage("/returns?drawer=refund:r1");
    const button = await screen.findByRole("button", { name: /Issue Refund/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Only an admin can confirm a refund (permission returns:refund).");
  });

  it("View return inspection switches drawers", async () => {
    const user = userEvent.setup();
    renderPage("/returns?drawer=refund:r1");
    await user.click(await screen.findByRole("button", { name: "View return inspection" }));
    await waitFor(() => expect(loc()).toContain("drawer=inspect:r1"));
  });
});

describe("create a return", () => {
  const eligible = {
    order: { id: "o1", number: "#1042", channel: { code: "shopify", name: "Shopify" }, status: "delivered", totalMinor: 350000, currency: "INR", customer: { name: "Asha Rao" } },
    items: [
      { orderItemId: "oi1", title: "Cotton Kurta", variant: null, sku: "KUR-RED-M", fulfilledQty: 3, alreadyReturnedQty: 1, availableQty: 2, unitPriceMinor: 149950 },
      { orderItemId: "oi2", title: "Scarf", variant: null, sku: "SCF-1", fulfilledQty: 1, alreadyReturnedQty: 1, availableQty: 0, unitPriceMinor: 50000 },
    ],
    note: "Only fulfilled items are eligible.",
  };

  it("finds the order, takes units and a reason, and opens the new return", async () => {
    api.eligibility.mockResolvedValue(eligible);
    api.create.mockResolvedValue(order());
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Create Return" }));
    const dialog = await screen.findByRole("dialog", { name: "Create return" });
    expect(within(dialog).getByText("Shopify orders only")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Order number"), "#1042");
    await user.click(within(dialog).getByRole("button", { name: "Find order" }));
    expect(api.eligibility).toHaveBeenCalledWith("#1042");
    expect(await within(dialog).findByText(/2 of 3 can still be returned/)).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "Select SCF-1" })).toBeDisabled();
    const submit = within(dialog).getByRole("button", { name: "Create Return" });
    expect(submit).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "More units of KUR-RED-M" }));
    await user.click(within(dialog).getByRole("button", { name: "More units of KUR-RED-M" }));
    expect(within(dialog).getByRole("button", { name: "More units of KUR-RED-M" })).toBeDisabled();
    expect(within(dialog).getByText(/2 units/)).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: "Create Return" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Order number"), "1050");
    await user.click(within(dialog).getByRole("button", { name: "Find order" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("only fulfilled orders can be returned");
  });

  it("disables the button with the reason when no store allows it", async () => {
    api.overview.mockResolvedValue(overview({ createReturn: { available: false, reason: "shopify_only", allowedChannels: ["shopify"] } }));
    renderPage();
    const button = await screen.findByRole("button", { name: "Create Return" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("title", "Returns can only be created for orders from a connected Shopify store.");
  });
});
