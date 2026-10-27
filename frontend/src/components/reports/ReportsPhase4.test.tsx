import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { Catalog, OverviewKpis } from "@/types/reports";

const api = vi.hoisted(() => ({ overviewKpis: vi.fn() }));
const hub = vi.hoisted(() => ({ accounts: vi.fn() }));
const saveBlob = vi.hoisted(() => vi.fn());
vi.mock("@/api/reports.api", () => ({ reportsApi: api }));
vi.mock("@/api/hub.api", () => ({ hubApi: hub }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob }));

import { ReportsOverviewKpiStrip } from "./ReportsOverviewKpiStrip";
import { ReportsChannelBreakdown } from "./ReportsChannelBreakdown";
import { ReportsCatalogSection } from "./ReportsCatalogSection";
import { ReportsOverviewView } from "./ReportsOverviewView";
import { addDays, dateKeyInZone, presetRange } from "./overviewRange";
import { overviewCsv } from "./overviewCsv";

afterEach(() => cleanup());

const KPIS = (over: Partial<OverviewKpis> = {}): OverviewKpis => ({
  range: { from: "2026-10-01", to: "2026-10-07" },
  previousRange: { from: "2026-09-24", to: "2026-09-30" },
  compare: "previous",
  period: "day",
  totals: { orders: 12, units: 20, grossMinor: 5_900_000, taxMinor: 600_000, shippingMinor: 100_000, discountMinor: 200_000, netSalesMinor: 5_000_000, averageOrderValueMinor: 491_667 },
  previous: { orders: 10, units: 15, grossMinor: 4_700_000, taxMinor: 400_000, shippingMinor: 100_000, discountMinor: 0, netSalesMinor: 4_000_000, averageOrderValueMinor: 470_000 },
  refunds: { amountMinor: 118_000, rateBps: 200, returns: 2 },
  previousRefunds: { amountMinor: 47_000, rateBps: 100, returns: 1 },
  margin: { marginBps: null, contributionMinor: null, coverage: 0.4, completeness: "incomplete", missing: ["product_cost"] },
  previousMargin: { marginBps: null, contributionMinor: null, coverage: 0.4, completeness: "incomplete", missing: ["product_cost"] },
  series: [
    { bucket: "2026-10-01T00:00:00.000Z", orders: 5, grossMinor: 2_000_000 },
    { bucket: "2026-10-02T00:00:00.000Z", orders: 7, grossMinor: 3_900_000 },
  ],
  previousSeries: [{ bucket: "2026-09-24T00:00:00.000Z", orders: 10, grossMinor: 4_700_000 }],
  channels: [
    { marketplace: "mock", orders: 8, grossMinor: 4_000_000, shareBps: 6780, averageOrderValueMinor: 500_000, marginBps: null, previousGrossMinor: 3_000_000, changeBps: 3333 },
    { marketplace: "shopify", orders: 4, grossMinor: 1_900_000, shareBps: 3220, averageOrderValueMinor: 475_000, marginBps: 2500, previousGrossMinor: 1_700_000, changeBps: 1176 },
  ],
  connectedAccounts: 2,
  totalAccounts: 2,
  ...over,
});

const CATALOG: Catalog = {
  types: [
    { type: "sales", title: "Sales report", description: "Orders and revenue", category: "Sales", formats: ["csv", "xlsx"], defaultFormat: "csv", schedulable: true, sheets: ["Orders"], csvSheet: "Orders", params: [] },
    { type: "inventory", title: "Stock report", description: "What is on the shelves", category: "Inventory", formats: ["csv"], defaultFormat: "csv", schedulable: false, sheets: [], csvSheet: "Stock", params: [] },
  ],
  periods: [],
  formats: ["csv", "xlsx", "pdf"],
};

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

const wrapView = (props: Partial<React.ComponentProps<typeof ReportsOverviewView>> = {}, url = "/reports") => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <ReportsOverviewView catalog={CATALOG} catalogLoading={false} catalogError={null} onRetryCatalog={vi.fn()} canWrite activeSchedules={0} onGenerate={vi.fn()} onCreateSchedule={vi.fn()} {...props} />
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ shell: { business: { id: "b1", timezone: "Asia/Kolkata", currency: "INR" } } as never });
  api.overviewKpis.mockResolvedValue(KPIS());
  hub.accounts.mockResolvedValue({ items: [{ id: "a1", marketplace: "mock", name: "Sandbox Store", connectorName: "Sandbox Marketplace", category: "marketplace" }], summary: { total: 1, healthy: 1, warning: 0, error: 0, paused: 0 } });
});

describe("date helpers", () => {
  it("presets are counted from today in the business time zone", () => {
    expect(presetRange("last_7", "2026-10-27")).toEqual({ from: "2026-10-21", to: "2026-10-27" });
    expect(presetRange("last_30", "2026-10-27")).toEqual({ from: "2026-09-28", to: "2026-10-27" });
    expect(presetRange("this_month", "2026-10-27")).toEqual({ from: "2026-10-01", to: "2026-10-27" });
    expect(presetRange("last_month", "2026-10-27")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("this_week", "2026-10-27")).toEqual({ from: "2026-10-26", to: "2026-10-27" }); // Tuesday: the week started on Monday the 26th
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("the date is the one in the business time zone, not in UTC", () => {
    const late = new Date("2026-10-27T20:00:00Z"); // 01:30 on the 28th in India
    expect(dateKeyInZone(late, "Asia/Kolkata")).toBe("2026-10-28");
    expect(dateKeyInZone(late, "UTC")).toBe("2026-10-27");
  });
});

describe("ReportsOverviewKpiStrip", () => {
  it("shows real figures with changes against the comparison range, and a dash for margin without costs", () => {
    render(<ReportsOverviewKpiStrip data={KPIS()} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("+25.0%")).toBeInTheDocument(); // net sales 4.0L -> 5.0L
    expect(screen.getByText("+20.0%")).toBeInTheDocument(); // orders 10 -> 12
    expect(screen.getByText("2.0%")).toBeInTheDocument(); // refunds rate
    expect(screen.getByText("+1.0 pp")).toBeInTheDocument();
    expect(screen.getByText("Needs product costs on your products")).toBeInTheDocument();
    expect(screen.getByText("Gross margin").parentElement).toHaveTextContent("—");
  });

  it("says there is no comparison when there is none, and shows a real margin when costs are known", () => {
    render(<ReportsOverviewKpiStrip data={KPIS({ compare: "none", previous: null, previousRange: null, previousRefunds: null, previousMargin: null, margin: { marginBps: 3200, contributionMinor: 1_600_000, coverage: 1, completeness: "complete", missing: [] } })} />);
    expect(screen.getAllByText("No comparison").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("32.0%")).toBeInTheDocument();
  });
});

describe("ReportsChannelBreakdown", () => {
  it("lists the real channels with their connector names and types, and the total", () => {
    const info = new Map([["mock", { name: "Sandbox Marketplace", type: "Marketplaces" }]]);
    render(<ReportsChannelBreakdown data={KPIS()} info={info} />);
    expect(screen.getByText("Sandbox Marketplace")).toBeInTheDocument();
    expect(screen.getByText("Marketplaces")).toBeInTheDocument();
    expect(screen.getByText("shopify")).toBeInTheDocument(); // no connected account to name it: the code
    expect(screen.getByText("+33.3%")).toBeInTheDocument();
    expect(screen.getByText("All channels")).toBeInTheDocument();
    expect(screen.queryByText(/Amazon|Flipkart|Offline/)).not.toBeInTheDocument();
  });

  it("explains an empty period and a business without channels", () => {
    const { rerender } = render(<ReportsChannelBreakdown data={KPIS({ channels: [] })} info={new Map()} />);
    expect(screen.getByText("No sales in this period")).toBeInTheDocument();
    rerender(<ReportsChannelBreakdown data={KPIS({ channels: [], totalAccounts: 0, connectedAccounts: 0 })} info={new Map()} />);
    expect(screen.getByText("No channel is connected yet")).toBeInTheDocument();
  });
});

describe("ReportsCatalogSection", () => {
  const props = { loading: false, error: null, onRetry: vi.fn(), canWrite: true, activeSchedules: 1, onGenerate: vi.fn(), onCreateSchedule: vi.fn() };

  it("lists the server's reports by category and opens the real generate flow", async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(<ReportsCatalogSection {...props} catalog={CATALOG} onGenerate={onGenerate} />);
    expect(screen.getByText("Sales report")).toBeInTheDocument();
    expect(screen.getByText("1 active schedule sends reports on a cadence.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Inventory 1/ }));
    expect(screen.queryByText("Sales report")).not.toBeInTheDocument();
    expect(screen.getByText("Stock report")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export Stock report" }));
    expect(onGenerate).toHaveBeenCalledWith(CATALOG.types[1]);
  });

  it("is read only without report permission and shows an error with retry", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<ReportsCatalogSection {...props} catalog={CATALOG} canWrite={false} />);
    expect(screen.getByRole("button", { name: "Export Sales report" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Create schedule/ })).toBeDisabled();
    rerender(<ReportsCatalogSection {...props} catalog={undefined} error="Catalog down" onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("ReportsOverviewView", () => {
  it("makes one call for the range and shows no invented data", async () => {
    wrapView();
    expect(await screen.findByText("COMMERCE PERFORMANCE")).toBeInTheDocument();
    expect(api.overviewKpis).toHaveBeenCalledTimes(1);
    const q = api.overviewKpis.mock.calls[0]![0];
    expect(q).toMatchObject({ compare: "previous" });
    expect(q.to >= q.from).toBe(true);
    expect(await screen.findByText("Sandbox Marketplace")).toBeInTheDocument();
    expect(screen.queryByText(/Illustrative|Sep 2026|Aug 2026|₹21\.00L|1,400/)).not.toBeInTheDocument();
  });

  it("puts the range, comparison and buckets in the URL and sends them to the server", async () => {
    const user = userEvent.setup();
    wrapView();
    await screen.findByText("COMMERCE PERFORMANCE");
    await user.selectOptions(screen.getByLabelText("Date range"), "last_7");
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toContain("range=last_7"));
    await user.selectOptions(screen.getByLabelText("Compare period"), "previous_year");
    await waitFor(() => expect(api.overviewKpis.mock.calls.at(-1)![0]).toMatchObject({ compare: "previous_year" }));
    await user.selectOptions(screen.getByLabelText("Trend interval"), "week");
    await waitFor(() => expect(api.overviewKpis.mock.calls.at(-1)![0]).toMatchObject({ period: "week" }));
  });

  it("a custom range uses the chosen dates and refuses an end before the start without calling the server", async () => {
    wrapView({}, "/reports?range=custom&from=2026-10-10&to=2026-10-01");
    expect(await screen.findByRole("alert")).toHaveTextContent("The start date must not be after the end date.");
    expect(api.overviewKpis).not.toHaveBeenCalled();
  });

  it("explains a period without sales and offers a longer range", async () => {
    api.overviewKpis.mockResolvedValue(KPIS({ totals: { ...KPIS().totals, orders: 0, grossMinor: 0, netSalesMinor: 0, units: 0, averageOrderValueMinor: 0 }, channels: [], series: [] }));
    const user = userEvent.setup();
    wrapView();
    expect((await screen.findAllByText("No sales in this period")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Show the last 90 days" }));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toContain("range=last_90"));
  });

  it("shows an error with retry", async () => {
    api.overviewKpis.mockRejectedValueOnce(new ApiError({ code: "SERVER", message: "Overview down", status: 500 }));
    const user = userEvent.setup();
    wrapView();
    expect(await screen.findByText("Overview down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("COMMERCE PERFORMANCE")).toBeInTheDocument();
  });

  it("exports the overview as a CSV with rupees and the connector names", async () => {
    const user = userEvent.setup();
    wrapView();
    await screen.findByText("COMMERCE PERFORMANCE");
    await user.click(screen.getByRole("button", { name: /Export overview/ }));
    expect(saveBlob).toHaveBeenCalledTimes(1);
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(saveBlob.mock.calls[0]![0] as Blob);
    });
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // the UTF-8 byte order mark Excel needs
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("\"Net sales (after discounts, before tax and shipping)\",50000,40000");
    expect(text).toContain("Sandbox Marketplace,8,40000,67.8,5000");
    expect(saveBlob.mock.calls[0]![1]).toMatch(/^reports-overview-.*\.csv$/);
  });
});

describe("overviewCsv", () => {
  it("writes money in main units and leaves unknown values empty", () => {
    const csv = overviewCsv(KPIS({ compare: "none", previous: null, previousRange: null, previousRefunds: null, previousMargin: null }), (c) => c);
    expect(csv).toContain("Gross margin (%),,");
    expect(csv).toContain("Orders,12,");
    expect(csv).toContain("2026-10-01,5,20000");
  });
});
