import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReportsOverviewKpiStrip } from "./ReportsOverviewKpiStrip";
import { ReportsSalesTrendSection } from "./ReportsSalesTrendSection";
import { ReportsChannelBreakdown } from "./ReportsChannelBreakdown";
import { ReportsCatalogSection } from "./ReportsCatalogSection";
import { ReportsOverviewView } from "./ReportsOverviewView";

describe("ReportsPhase4 Components", () => {
  it("renders ReportsOverviewKpiStrip with all 5 core metrics", () => {
    render(<ReportsOverviewKpiStrip />);

    expect(screen.getByText("COMMERCE PERFORMANCE")).toBeInTheDocument();
    expect(screen.getByText("Net sales")).toBeInTheDocument();
    expect(screen.getByText("₹21.00L")).toBeInTheDocument();
    expect(screen.getByText("1,400")).toBeInTheDocument();
    expect(screen.getByText("₹1,500")).toBeInTheDocument();
    expect(screen.getByText("4.76%")).toBeInTheDocument();
    expect(screen.getByText("32.0%")).toBeInTheDocument();
  });

  it("renders ReportsSalesTrendSection with weekly buckets and performance card", async () => {
    const onExploreSales = vi.fn();
    const user = userEvent.setup();

    render(<ReportsSalesTrendSection onExploreSales={onExploreSales} />);

    expect(screen.getByText("Sales trend")).toBeInTheDocument();
    expect(screen.getByText("01–07 Sep")).toBeInTheDocument();
    expect(screen.getByText("22–30 Sep")).toBeInTheDocument();
    expect(screen.getByText("PERFORMANCE AT A GLANCE")).toBeInTheDocument();
    expect(screen.getByText("Sales after discounts")).toBeInTheDocument();
    expect(screen.getByText("Less refunds")).toBeInTheDocument();

    const exploreBtn = screen.getByRole("button", { name: /Explore sales report/i });
    await user.click(exploreBtn);
    expect(onExploreSales).toHaveBeenCalled();
  });

  it("renders ReportsChannelBreakdown with marketplace & retail rows", async () => {
    const onViewChannelReport = vi.fn();
    const user = userEvent.setup();

    render(<ReportsChannelBreakdown onViewChannelReport={onViewChannelReport} />);

    expect(screen.getByText("Channel breakdown")).toBeInTheDocument();
    expect(screen.getByText("Amazon")).toBeInTheDocument();
    expect(screen.getByText("Flipkart")).toBeInTheDocument();
    expect(screen.getByText("Shopify")).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.getByText("All channels")).toBeInTheDocument();

    const viewReportBtn = screen.getByRole("button", { name: /View channel report/i });
    await user.click(viewReportBtn);
    expect(onViewChannelReport).toHaveBeenCalled();
  });

  it("renders ReportsCatalogSection and filters reports by category and search", async () => {
    const onExportReport = vi.fn();
    const onCreateSchedule = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportsCatalogSection
        onExportReport={onExportReport}
        onCreateSchedule={onCreateSchedule}
      />
    );

    expect(screen.getByText("Available reports")).toBeInTheDocument();
    expect(screen.getByText("Sales overview")).toBeInTheDocument();
    expect(screen.getByText("Channel performance")).toBeInTheDocument();
    expect(screen.getByText("Product profitability")).toBeInTheDocument();

    // Category filtering
    await user.click(screen.getByRole("button", { name: /^Inventory/i }));
    expect(screen.getByText("Inventory valuation")).toBeInTheDocument();
    expect(screen.queryByText("Sales overview")).not.toBeInTheDocument();

    // Reset to all
    await user.click(screen.getByRole("button", { name: /^All reports/i }));
    expect(screen.getByText("Sales overview")).toBeInTheDocument();

    // Search query
    const searchInput = screen.getByPlaceholderText("Find a report...");
    await user.type(searchInput, "procurement");
    expect(screen.getByText("Procurement spend")).toBeInTheDocument();
    expect(screen.queryByText("Sales overview")).not.toBeInTheDocument();

    // Create schedule banner CTA
    const scheduleBtn = screen.getByRole("button", { name: /Create schedule/i });
    await user.click(scheduleBtn);
    expect(onCreateSchedule).toHaveBeenCalled();
  });

  it("renders full ReportsOverviewView container", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ReportsOverviewView />
      </QueryClientProvider>
    );

    expect(screen.getByText("01–30 Sep 2026")).toBeInTheDocument();
    expect(screen.getAllByText("All channels").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Compare: previous month")).toBeInTheDocument();
    expect(screen.getByText("INR (₹) · Asia/Kolkata · vs 01–31 Aug 2026")).toBeInTheDocument();
  });

  it("updates metrics dynamically when channel is selected in ReportsOverviewView", async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ReportsOverviewView />
      </QueryClientProvider>
    );

    const channelSelect = screen.getByLabelText("Filter by channel");
    await user.selectOptions(channelSelect, "Amazon");

    expect(screen.getByText("Amazon sales grew 12.5%, with average order value at ₹1,500.")).toBeInTheDocument();
    expect(screen.getAllByText("₹9.45L").length).toBeGreaterThanOrEqual(1);
  });

  it("opens date range picker dropdown and allows selecting alternative dates", async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ReportsOverviewView />
      </QueryClientProvider>
    );

    const dateBtn = screen.getByRole("button", { name: /01–30 Sep 2026/i });
    await user.click(dateBtn);

    expect(screen.getByRole("button", { name: "Last 30 days" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Last 30 days" }));

    expect(screen.getByRole("button", { name: /Last 30 days/i })).toBeInTheDocument();
  });
});
