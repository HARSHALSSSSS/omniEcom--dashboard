import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { ChannelRow, Component, SpendPage, SpendRow, SpendSummary, Waterfall } from "@/types/profitability";

const api = vi.hoisted(() => ({
  waterfall: vi.fn(),
  spend: vi.fn(),
  spendSummary: vi.fn(),
  createSpend: vi.fn(),
  updateSpend: vi.fn(),
  deleteSpend: vi.fn(),
  importSpend: vi.fn(),
  accounts: vi.fn(),
}));
vi.mock("@/api/profitability.api", () => ({ profitabilityApi: api }));
const saveBlob = vi.hoisted(() => vi.fn());
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob }));

import ProfitabilityPage from "./ProfitabilityPage";

const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const comp = (amountMinor: number | null, basis: Component["basis"] = "actual", coverage = 1): Component => ({ amountMinor, basis, coverage });

const channel = (over: Partial<ChannelRow> = {}): ChannelRow => ({
  channel: "amazon_in",
  label: "Amazon",
  orders: 12,
  grossRevenue: comp(20_000_000),
  cogs: comp(8_000_000, "estimated", 0.9),
  marketplaceFees: comp(3_000_000),
  shippingCosts: comp(null, "missing", 0),
  returnsImpact: comp(500_000),
  advertisingSpend: comp(null, "missing", 0),
  netProfitMinor: null,
  knownPartMinor: 8_500_000,
  netMarginPercent: null,
  missing: ["shipping", "advertising"],
  ...over,
});

const incomplete = (over: Partial<Waterfall> = {}): Waterfall => ({
  range: { from: "2026-09-22", to: "2026-10-21" },
  ordersAnalysed: 20,
  ordersInRange: 20,
  windows: 1,
  truncated: false,
  grossRevenueMinor: 28_400_000,
  netContributionMinor: null,
  knownPartMinor: 9_000_000,
  netMarginPercent: null,
  missing: ["shipping", "advertising"],
  completeness: "incomplete",
  unallocatedAdvertisingMinor: 0,
  channels: [channel()],
  comparison: {
    range: { from: "2026-08-23", to: "2026-09-21" },
    ordersAnalysed: 18,
    truncated: false,
    grossRevenue: { changeMinor: 2_000_000, changePercent: 7.6 },
    netContribution: { changeMinor: null, changePercent: null },
    netMarginPoints: null,
    previousNetContributionMinor: null,
    previousGrossRevenueMinor: 26_400_000,
  },
  steps: [
    { key: "gross_revenue", label: "Gross revenue", type: "positive", amountMinor: 28_400_000, basis: "actual", coverage: 1, shareOfRevenuePercent: 100, tooltip: "Item price x quantity for every order.", previousAmountMinor: 26_400_000, change: { changeMinor: 2_000_000, changePercent: 7.6 } },
    { key: "product_cost", label: "Product cost", type: "negative", amountMinor: -11_360_000, basis: "estimated", coverage: 0.9, shareOfRevenuePercent: 40, tooltip: "Current cost price.", previousAmountMinor: -10_000_000, change: { changeMinor: -1_360_000, changePercent: 13.6 } },
    { key: "advertising", label: "Advertising", type: "negative", amountMinor: null, basis: "missing", coverage: 0, shareOfRevenuePercent: null, tooltip: "No advertising spend is recorded for this period.", previousAmountMinor: null, change: { changeMinor: null, changePercent: null } },
    { key: "net_contribution", label: "Net contribution", type: "subtotal", amountMinor: null, basis: "missing", coverage: 0, shareOfRevenuePercent: null, tooltip: "Not available.", previousAmountMinor: null, change: { changeMinor: null, changePercent: null } },
  ],
  ...over,
});

const complete = (): Waterfall =>
  incomplete({
    netContributionMinor: 6_304_800,
    netMarginPercent: 22.2,
    missing: [],
    completeness: "complete",
    channels: [channel({ shippingCosts: comp(1_000_000), advertisingSpend: comp(300_000), netProfitMinor: 6_304_800, netMarginPercent: 22.2, missing: [] })],
    comparison: { range: { from: "2026-08-23", to: "2026-09-21" }, ordersAnalysed: 18, truncated: false, grossRevenue: { changeMinor: 2_000_000, changePercent: 7.6 }, netContribution: { changeMinor: 500_000, changePercent: 8.6 }, netMarginPoints: 1.8, previousNetContributionMinor: 5_804_800, previousGrossRevenueMinor: 26_400_000 },
    steps: [
      { key: "gross_revenue", label: "Gross revenue", type: "positive", amountMinor: 28_400_000, basis: "actual", coverage: 1, shareOfRevenuePercent: 100, tooltip: "x" },
      { key: "net_contribution", label: "Net contribution", type: "subtotal", amountMinor: 6_304_800, basis: "actual", coverage: 1, shareOfRevenuePercent: 22.2, tooltip: "y" },
    ],
  });

const spendRow = (over: Partial<SpendRow> = {}): SpendRow => ({
  id: "s1",
  spendDate: "2026-10-01",
  accountId: ACCOUNT,
  accountName: "Main store",
  marketplace: "amazon_in",
  amountMinor: 125_000,
  currency: "INR",
  campaign: "Sponsored products",
  source: "manual",
  notes: "week 1",
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
  ...over,
});

const spendPage = (items: SpendRow[], over: Partial<SpendPage> = {}): SpendPage => ({ items, page: 1, pageSize: 25, total: items.length, pages: 1, ...over });
const summary = (): SpendSummary => ({ range: { from: "2026-09-22", to: "2026-10-21" }, rows: 1, totalMinor: 125_000, byAccount: [{ accountId: ACCOUNT, accountName: "Main store", marketplace: "amazon_in", rows: 1, amountMinor: 125_000 }], byCampaign: [{ campaign: "Sponsored products", rows: 1, amountMinor: 125_000 }], byDay: [{ day: "2026-10-01", amountMinor: 125_000 }] });

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/profitability") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ProfitabilityPage />
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
const lastWaterfallQuery = () => api.waterfall.mock.calls.at(-1)?.[0];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("analytics:read", "pricing:write");
  api.waterfall.mockResolvedValue(incomplete());
  api.spend.mockResolvedValue(spendPage([spendRow()]));
  api.spendSummary.mockResolvedValue(summary());
  api.accounts.mockResolvedValue([{ id: ACCOUNT, marketplace: "amazon_in", displayName: "Main store", status: "active" }]);
});

describe("ProfitabilityPage waterfall", () => {
  it("renders the steps as the API returns them, with a dash for unknown amounts", async () => {
    renderPage();
    const gross = await screen.findByTestId("step-gross_revenue");
    expect(within(gross).getByText("₹2,84,000")).toBeInTheDocument();
    expect(within(gross).getByText("Actual")).toBeInTheDocument();
    expect(within(gross).getByText("Item price x quantity for every order.")).toBeInTheDocument();
    expect(within(gross).getByText(/was ₹2,64,000/)).toBeInTheDocument();
    expect(within(gross).getByText(/\+7\.6%/)).toBeInTheDocument();

    const cost = screen.getByTestId("step-product_cost");
    expect(within(cost).getByText("Estimated (90% known)")).toBeInTheDocument();
    expect(within(cost).getByText(/1,13,600/)).toBeInTheDocument();

    const ads = screen.getByTestId("step-advertising");
    expect(within(ads).getByText("—")).toBeInTheDocument();
    expect(within(ads).getByText("Missing")).toBeInTheDocument();
    expect(within(screen.getByTestId("step-net_contribution")).getByText("—")).toBeInTheDocument();
  });

  it("asks for the default 30 day range with the comparison, as real dates", async () => {
    renderPage();
    await screen.findByTestId("step-gross_revenue");
    const q = lastWaterfallQuery();
    expect(q.from).toMatch(DAY);
    expect(q.to).toMatch(DAY);
    expect(q.compare).toBe(true);
    expect((Date.parse(q.to) - Date.parse(q.from)) / 86_400_000).toBe(29);
  });

  it("shows the missing-cost banner and no net contribution while costs are missing", async () => {
    renderPage();
    const banner = await screen.findByText("Net contribution is not shown because some costs are missing");
    const box = banner.closest("[role=alert]") as HTMLElement;
    expect(within(box).getAllByRole("listitem")).toHaveLength(2);
    expect(within(box).getByText("shipping cost")).toBeInTheDocument();
    expect(within(box).getByText("advertising spend")).toBeInTheDocument();
    expect(screen.getByText(/Revenue minus known costs is ₹90,000/)).toBeInTheDocument();
    expect(screen.getByText("Available once every cost is known")).toBeInTheDocument();
  });

  it("shows the figures and the comparison once everything is known", async () => {
    api.waterfall.mockResolvedValue(complete());
    renderPage();
    expect(await screen.findByText("+1.8 pts vs previous period")).toBeInTheDocument();
    expect(screen.getAllByText("22.2%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("+8.6% vs previous period")).toBeInTheDocument();
    expect(screen.queryByText(/some costs are missing/)).not.toBeInTheDocument();
  });

  it("warns when the range is truncated, estimated or has unallocated advertising", async () => {
    api.waterfall.mockResolvedValue(complete());
    api.waterfall.mockResolvedValue({ ...complete(), truncated: true, ordersAnalysed: 5000, ordersInRange: 6200, completeness: "estimated", unallocatedAdvertisingMinor: 250_000 });
    renderPage();
    expect(await screen.findByText(/5,000 of 6,200 orders were analysed/)).toBeInTheDocument();
    expect(screen.getByText("Some figures are estimates")).toBeInTheDocument();
    expect(screen.getByText(/₹2,500 of advertising is not tied to a marketplace/)).toBeInTheDocument();
  });

  it("lists the channels with dashes for unknown costs", async () => {
    renderPage();
    const row = (await screen.findByText("Amazon")).closest("tr") as HTMLElement;
    expect(within(row).getByText("₹2,00,000")).toBeInTheDocument();
    expect(within(row).getByText("est.")).toBeInTheDocument();
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(4);
    expect(within(row).getByText(/Missing: shipping cost, advertising spend/)).toBeInTheDocument();
  });

  it("puts the range pills and the comparison switch in the URL and the query", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("step-gross_revenue");

    await user.click(screen.getByRole("button", { name: "This month" }));
    expect(loc()).toBe("/profitability?range=mtd");
    await waitFor(() => expect(lastWaterfallQuery().from).toMatch(/-01$/));

    await user.click(screen.getByRole("checkbox", { name: /Compare with the previous period/ }));
    expect(loc()).toBe("/profitability?range=mtd&compare=off");
    await waitFor(() => expect(lastWaterfallQuery().compare).toBe(false));
  });

  it("reads a custom range from the URL and sends exactly those dates", async () => {
    renderPage("/profitability?range=custom&from=2026-09-01&to=2026-09-30");
    await screen.findByTestId("step-gross_revenue");
    expect(lastWaterfallQuery()).toEqual({ from: "2026-09-01", to: "2026-09-30", compare: true });
    expect(screen.getByLabelText("From")).toHaveValue("2026-09-01");
  });

  it("does not call the API for an invalid custom range", async () => {
    renderPage("/profitability?range=custom&from=2026-10-05&to=2026-10-01");
    expect(await screen.findByText("Choose a date range.")).toBeInTheDocument();
    expect(screen.getAllByText(/must not be after/).length).toBeGreaterThan(0);
    expect(api.waterfall).not.toHaveBeenCalled();
  });

  it("exports the waterfall as CSV", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("step-gross_revenue");
    await user.click(screen.getByRole("button", { name: /Export waterfall/ }));
    expect(saveBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = saveBlob.mock.calls[0] as [Blob, string];
    expect(name).toBe("profitability-waterfall-2026-09-22_to_2026-10-21.csv");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text).toContain("Gross revenue,284000.00,actual,100,100,264000.00,7.6");
    expect(text).toContain("Advertising,,missing,0,");
  });

  it("shows the API error and retries", async () => {
    const user = userEvent.setup();
    api.waterfall.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Database is busy", status: 500 }));
    renderPage();
    expect(await screen.findByText("Profitability could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("Database is busy")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("step-gross_revenue")).toBeInTheDocument();
  });

  it("does not load anything without analytics:read", () => {
    grant();
    renderPage();
    expect(screen.getByText("You do not have access to profitability.")).toBeInTheDocument();
    expect(api.waterfall).not.toHaveBeenCalled();
  });
});

describe("ProfitabilityPage advertising spend", () => {
  it("lists spend and totals for the selected range", async () => {
    renderPage("/profitability?view=spend");
    const row = (await screen.findByText("Sponsored products", { selector: "td" })).closest("tr") as HTMLElement;
    expect(within(row).getByText("2026-10-01")).toBeInTheDocument();
    expect(within(row).getByText("Main store")).toBeInTheDocument();
    expect(within(row).getByText("₹1,250")).toBeInTheDocument();
    expect(await screen.findByText("1 row recorded")).toBeInTheDocument();
    expect(api.spend.mock.calls.at(-1)?.[0]).toMatchObject({ page: 1, pageSize: 25 });
    expect(api.spendSummary.mock.calls.at(-1)?.[0].from).toMatch(DAY);
  });

  it("sends the account filter and the search to the API through the URL", async () => {
    const user = userEvent.setup();
    renderPage("/profitability?view=spend");
    await screen.findByText("Sponsored products", { selector: "td" });
    await user.selectOptions(screen.getByLabelText("Account"), "none");
    expect(loc()).toBe("/profitability?view=spend&account=none");
    await waitFor(() => expect(api.spend.mock.calls.at(-1)?.[0].account).toBe("none"));
    await user.type(screen.getByLabelText("Search campaign or notes"), "diwali");
    await waitFor(() => expect(loc()).toContain("q=diwali"), { timeout: 2000 });
    await waitFor(() => expect(api.spend.mock.calls.at(-1)?.[0].q).toBe("diwali"));
  });

  it("records spend with integer paise and refreshes", async () => {
    const user = userEvent.setup();
    api.createSpend.mockResolvedValue(spendRow({ id: "s2", amountMinor: 125_050 }));
    renderPage("/profitability?view=spend");
    await screen.findByText("Sponsored products", { selector: "td" });
    await user.click(screen.getByRole("button", { name: "Record spend" }));
    const dialog = await screen.findByRole("dialog");
    await user.clear(within(dialog).getByLabelText("Date"));
    await user.type(within(dialog).getByLabelText("Date"), "2026-10-02");
    await user.type(within(dialog).getByLabelText(/Amount/), "1250.50");
    await user.selectOptions(within(dialog).getByLabelText("Marketplace account"), ACCOUNT);
    await user.type(within(dialog).getByLabelText("Campaign (optional)"), "Brand ads");
    await user.click(within(dialog).getByRole("button", { name: "Record spend" }));
    await waitFor(() => expect(api.createSpend).toHaveBeenCalledWith({ spendDate: "2026-10-02", accountId: ACCOUNT, amountMinor: 125_050, campaign: "Brand ads", notes: null }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useToastStore.getState().toasts.some((t) => t.title === "Spend recorded")).toBe(true);
    await waitFor(() => expect(api.waterfall.mock.calls.length).toBeGreaterThan(1));
  });

  it("validates the amount before calling the API", async () => {
    const user = userEvent.setup();
    renderPage("/profitability?view=spend");
    await screen.findByText("Sponsored products", { selector: "td" });
    await user.click(screen.getByRole("button", { name: "Record spend" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Record spend" }));
    expect(await within(dialog).findByText(/Enter the amount spent/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Amount/), "1.999");
    await user.click(within(dialog).getByRole("button", { name: "Record spend" }));
    expect(await within(dialog).findByText(/at most two decimals/)).toBeInTheDocument();
    expect(api.createSpend).not.toHaveBeenCalled();
  });

  it("shows the server's message on the field it names", async () => {
    const user = userEvent.setup();
    api.createSpend.mockRejectedValue(new ApiError({ code: "BAD_REQUEST", message: "Spend cannot be recorded for a future date", status: 400, details: { rule: "future_date", field: "spendDate" } }));
    renderPage("/profitability?view=spend");
    await screen.findByText("Sponsored products", { selector: "td" });
    await user.click(screen.getByRole("button", { name: "Record spend" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Amount/), "10");
    await user.click(within(dialog).getByRole("button", { name: "Record spend" }));
    expect(await within(dialog).findByText("Spend cannot be recorded for a future date")).toBeInTheDocument();
    expect(within(dialog).getByText("Some fields need a correction.")).toBeInTheDocument();
  });

  it("corrects a row with a PATCH", async () => {
    const user = userEvent.setup();
    api.updateSpend.mockResolvedValue(spendRow({ amountMinor: 150_000 }));
    renderPage("/profitability?view=spend");
    await user.click(await screen.findByRole("button", { name: /Edit spend of 2026-10-01/ }));
    const dialog = await screen.findByRole("dialog");
    const amount = within(dialog).getByLabelText(/Amount/);
    expect(amount).toHaveValue("1250");
    await user.clear(amount);
    await user.type(amount, "1500");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateSpend).toHaveBeenCalledWith("s1", { spendDate: "2026-10-01", accountId: ACCOUNT, amountMinor: 150_000, campaign: "Sponsored products", notes: "week 1" }));
  });

  it("deletes a row after a confirmation", async () => {
    const user = userEvent.setup();
    api.deleteSpend.mockResolvedValue({ id: "s1", deleted: true });
    renderPage("/profitability?view=spend");
    await user.click(await screen.findByRole("button", { name: /Delete spend of 2026-10-01/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/recalculated/)).toBeInTheDocument();
    expect(api.deleteSpend).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete spend" }));
    await waitFor(() => expect(api.deleteSpend).toHaveBeenCalledWith("s1"));
  });

  it("checks a CSV first, then imports it", async () => {
    const user = userEvent.setup();
    api.importSpend.mockResolvedValueOnce({ rows: 2, created: 1, updated: 0, unchanged: 0, failed: 1, dryRun: true, errors: [{ row: 3, field: "amount", message: "amount must be a number" }] });
    api.importSpend.mockResolvedValueOnce({ rows: 2, created: 1, updated: 0, unchanged: 0, failed: 1, dryRun: false, errors: [] });
    renderPage("/profitability?view=spend");
    await screen.findByText("Sponsored products", { selector: "td" });
    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Use an example" }));
    await user.click(within(dialog).getByRole("button", { name: "Check without saving" }));
    expect(await within(dialog).findByText(/Checked, nothing was saved/)).toBeInTheDocument();
    expect(within(dialog).getByText("amount must be a number")).toBeInTheDocument();
    expect(api.importSpend).toHaveBeenLastCalledWith(expect.stringContaining("date,amount"), { unit: "rupees", dryRun: true });
    const waterfallCalls = api.waterfall.mock.calls.length;

    await user.click(within(dialog).getByRole("button", { name: "Import" }));
    await waitFor(() => expect(api.importSpend).toHaveBeenLastCalledWith(expect.any(String), { unit: "rupees", dryRun: false }));
    expect(await within(dialog).findByRole("button", { name: "Done" })).toBeInTheDocument();
    await waitFor(() => expect(api.waterfall.mock.calls.length).toBeGreaterThan(waterfallCalls));
  });

  it("disables the write actions without pricing:write", async () => {
    grant("analytics:read");
    renderPage("/profitability?view=spend");
    await screen.findByText("Sponsored products", { selector: "td" });
    expect(screen.getByRole("button", { name: "Record spend" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Edit spend of/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Delete spend of/ })).toBeDisabled();
  });

  it("offers to record spend from the missing-advertising banner", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Record advertising spend" }));
    expect(loc()).toBe("/profitability?view=spend");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("explains an empty range", async () => {
    api.spend.mockResolvedValue(spendPage([]));
    renderPage("/profitability?view=spend");
    expect(await screen.findByText("No advertising spend recorded in this range.")).toBeInTheDocument();
  });
});
