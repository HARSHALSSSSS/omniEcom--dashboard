import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { ReportsOverviewKpiStrip } from "./ReportsOverviewKpiStrip";
import { ReportsSalesTrendSection } from "./ReportsSalesTrendSection";
import { ReportsChannelBreakdown } from "./ReportsChannelBreakdown";
import { ReportsCatalogSection, type StandardReportItem } from "./ReportsCatalogSection";
import { useReportsRealData } from "./useReportsRealData";

interface ReportsOverviewViewProps {
  onExportReport?: (report: StandardReportItem) => void;
  onCreateSchedule?: () => void;
  onExploreSales?: () => void;
  onViewChannelReport?: () => void;
}

const DATE_OPTIONS = [
  "01–30 Sep 2026",
  "01–26 Oct 2026",
  "Last 7 days",
  "Last 30 days",
  "This financial year",
];

export function ReportsOverviewView({
  onExportReport,
  onCreateSchedule,
  onExploreSales,
  onViewChannelReport,
}: ReportsOverviewViewProps) {
  const [dateRange, setDateRange] = useState("01–30 Sep 2026");
  const [selectedChannel, setSelectedChannel] = useState("All channels");
  const [comparePeriod, setComparePeriod] = useState("Compare: previous month");
  const [trendInterval, setTrendInterval] = useState<"Weekly" | "Monthly" | "Daily">("Weekly");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const {
    kpis,
    trendBuckets,
    channelsList,
    totalChannelsSummary,
    performanceGlance,
    contextSubtitle,
  } = useReportsRealData({
    dateRange,
    selectedChannel,
    comparePeriod,
    interval: trendInterval,
  });

  return (
    <div className="space-y-6">
      {/* 1. Global Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-xs shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Range Picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-foreground hover:bg-muted/50"
            >
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{dateRange}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {isDatePickerOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 w-52 rounded-lg border border-border bg-card p-1 shadow-md">
                {DATE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setDateRange(opt);
                      setIsDatePickerOpen(false);
                    }}
                    className="w-full rounded-md px-3 py-1.5 text-left text-xs text-foreground hover:bg-muted/70 transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Channel Selector */}
          <div className="relative">
            <select
              aria-label="Filter by channel"
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-foreground"
            >
              <option value="All channels">All channels</option>
              <option value="Amazon">Amazon</option>
              <option value="Flipkart">Flipkart</option>
              <option value="Shopify">Shopify</option>
              <option value="Offline">Offline</option>
            </select>
          </div>

          {/* Compare Period */}
          <div className="relative">
            <select
              aria-label="Compare period"
              value={comparePeriod}
              onChange={(e) => setComparePeriod(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-foreground"
            >
              <option value="Compare: previous month">Compare: previous month</option>
              <option value="Compare: previous year">Compare: previous year</option>
              <option value="No comparison">No comparison</option>
            </select>
          </div>
        </div>

        {/* Currency & Timezone Context */}
        <span className="text-[11px] font-mono text-muted-foreground">
          {contextSubtitle}
        </span>
      </div>

      {/* 2. Commerce Performance KPI Strip */}
      <ReportsOverviewKpiStrip data={kpis} />

      {/* 3. Sales Trend & Performance At a Glance */}
      <ReportsSalesTrendSection
        buckets={trendBuckets}
        currentPeriodLabel={selectedChannel === "All channels" ? "Sep 2026" : `${selectedChannel}`}
        currentPeriodTotal={kpis.netSales}
        previousPeriodLabel={selectedChannel === "All channels" ? "Aug 2026" : "Previous"}
        previousPeriodTotal={kpis.netSalesCompare.replace("vs ", "").replace(" previous period", "")}
        interval={trendInterval}
        onIntervalChange={setTrendInterval}
        headline={performanceGlance.headline}
        narrative={performanceGlance.narrative}
        salesAfterDiscounts={performanceGlance.salesAfterDiscounts}
        lessRefunds={performanceGlance.lessRefunds}
        netSales={performanceGlance.netSales}
        onExploreSales={onExploreSales}
      />

      {/* 4. Channel Breakdown Table */}
      <ReportsChannelBreakdown
        channels={channelsList}
        summaryRow={totalChannelsSummary}
        periodLabel={dateRange}
        onViewChannelReport={onViewChannelReport}
      />

      {/* 5. Standard Available Reports & Schedule Banner */}
      <ReportsCatalogSection
        onExportReport={onExportReport}
        onCreateSchedule={onCreateSchedule}
      />
    </div>
  );
}
