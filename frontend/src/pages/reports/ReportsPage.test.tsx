import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { Catalog, CatalogEntry, ReportRun, ReportSchedule, ReportsOverview } from "@/types/reports";

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  catalog: vi.fn(),
  exportReport: vi.fn(),
  listRuns: vi.fn(),
  getRun: vi.fn(),
  downloadRun: vi.fn(),
  listSchedules: vi.fn(),
  getSchedule: vi.fn(),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  pauseSchedule: vi.fn(),
  resumeSchedule: vi.fn(),
  runScheduleNow: vi.fn(),
  choices: { warehouses: vi.fn(), accounts: vi.fn(), categories: vi.fn() },
}));
const saveBlob = vi.hoisted(() => vi.fn());
vi.mock("@/api/reports.api", () => ({ reportsApi: api }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob }));

import ReportsPage from "./ReportsPage";

const ID = {
  run1: "11111111-1111-4111-8111-111111111111",
  run2: "11111111-1111-4111-8111-222222222222",
  sch1: "22222222-2222-4222-8222-222222222222",
  wh1: "33333333-3333-4333-8333-333333333333",
};

const WINDOW = [
  { key: "range", type: "range", label: "Period", description: "A period relative to the run.", options: ["last_30_days", "this_month", "previous_month"], default: "this_month", min: null, max: null, relative: true },
  { key: "month", type: "month", label: "Month", description: "A calendar month.", options: null, default: null, min: null, max: null, relative: false },
  { key: "from", type: "date", label: "From", description: "First day.", options: null, default: null, min: null, max: null, relative: false },
  { key: "to", type: "date", label: "To", description: "Last day.", options: null, default: null, min: null, max: null, relative: false },
] as CatalogEntry["params"];

const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
  type: "sales",
  title: "Sales report",
  description: "Orders placed in the period.",
  category: "sales",
  formats: ["csv", "xlsx", "pdf"],
  defaultFormat: "xlsx",
  schedulable: true,
  sheets: ["Summary", "Trend"],
  csvSheet: "Trend",
  params: WINDOW,
  ...over,
});

const catalog = (): Catalog => ({
  types: [
    entry({ type: "gst_register", title: "GST tax and sales invoicing register", category: "compliance", sheets: ["Summary", "Invoices"], csvSheet: "Invoices" }),
    entry({ type: "settlement_audit", title: "Marketplace settlement and deduction audit", category: "finance", defaultFormat: "csv" }),
    entry({
      type: "inventory_valuation",
      title: "Inventory valuation",
      category: "inventory",
      defaultFormat: "pdf",
      params: [
        { key: "asOf", type: "date", label: "As of", description: "The day.", options: null, default: null, min: null, max: null, relative: false },
        { key: "warehouseId", type: "uuid", label: "Warehouse", description: "Only this warehouse.", options: null, default: null, min: null, max: null, relative: true },
      ],
    }),
    entry({ type: "sales" }),
  ],
  periods: [
    { key: "last_30_days", label: "Last 30 days" },
    { key: "this_month", label: "This month" },
    { key: "previous_month", label: "Previous month" },
  ],
  formats: ["csv", "xlsx", "pdf"],
});

const run = (over: Partial<ReportRun> = {}): ReportRun => ({
  id: ID.run1,
  reportType: "gst_register",
  reportTitle: "GST tax and sales invoicing register",
  format: "xlsx",
  params: { month: "2026-10" },
  status: "succeeded",
  trigger: "manual",
  scheduleId: null,
  scheduleName: null,
  period: { fromDay: "2026-10-01", toDay: "2026-10-31", label: "October 2026" },
  fileName: "gst-register-2026-10.xlsx",
  sizeBytes: 20480,
  rowCount: 120,
  warnings: 0,
  notes: [],
  settlementDataAvailable: null,
  error: null,
  requestedBy: null,
  startedAt: "2026-10-21T05:00:00.000Z",
  finishedAt: "2026-10-21T05:00:02.000Z",
  expiresAt: "2026-11-20T05:00:02.000Z",
  downloadable: true,
  downloadUrl: `/api/v1/reports/runs/${ID.run1}/download`,
  createdAt: "2026-10-21T05:00:00.000Z",
  ...over,
});

const schedule = (over: Partial<ReportSchedule> = {}): ReportSchedule => ({
  id: ID.sch1,
  name: "Monthly GST for the CA",
  reportType: "gst_register",
  reportTitle: "GST tax and sales invoicing register",
  format: "xlsx",
  frequency: "monthly",
  dayOfWeek: null,
  dayOfMonth: 2,
  timeOfDay: "06:00",
  timezone: "Asia/Kolkata",
  cadence: "Monthly on day 2 at 06:00",
  params: { range: "previous_month" },
  recipients: ["ca@example.com"],
  status: "active",
  lastRunAt: null,
  lastRunStatus: null,
  nextRunAt: "2026-11-02T00:30:00.000Z",
  lastRun: null,
  createdBy: null,
  version: 1,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

const overview = (over: Partial<ReportsOverview> = {}): ReportsOverview => ({
  timezone: "Asia/Kolkata",
  today: "2026-10-21",
  periods: [],
  featured: [
    { type: "gst_register", title: "GST tax and sales invoicing register", description: "GSTR-1 style register.", formats: ["csv", "xlsx", "pdf"], defaultFormat: "xlsx", buttonLabel: "Download October 2026", suggestedParams: { month: "2026-10" }, lastRun: run() },
    { type: "settlement_audit", title: "Marketplace settlement and deduction audit", description: "Fees against terms.", formats: ["csv", "xlsx", "pdf"], defaultFormat: "csv", buttonLabel: "Download Settlement Log", suggestedParams: { range: "previous_month" }, lastRun: null },
    { type: "inventory_valuation", title: "Inventory valuation", description: "Stock at cost.", formats: ["csv", "xlsx", "pdf"], defaultFormat: "pdf", buttonLabel: "Download Valuation PDF", suggestedParams: {}, lastRun: null },
  ],
  recentRuns: [run()],
  schedules: { total: 1, active: 1, paused: 0, nextRunAt: "2026-11-02T00:30:00.000Z", next: schedule() },
  ...over,
});

const page = <T,>(items: T[], over: Record<string, unknown> = {}) => ({ items, page: 1, pageSize: 25, total: items.length, pages: 1, ...over });

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/reports?tab=reports") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ReportsPage />
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
const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);
const blobFile = { blob: new Blob(["x"]), fileName: "gst-register-2026-10.xlsx" };

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("reports:read", "reports:write");
  api.overview.mockResolvedValue(overview());
  api.catalog.mockResolvedValue(catalog());
  api.listRuns.mockResolvedValue(page([run(), run({ id: ID.run2, reportType: "sales", reportTitle: "Sales report", status: "failed", error: "Add your GSTIN first", downloadable: false, downloadUrl: null, fileName: null })]));
  api.listSchedules.mockResolvedValue(page([schedule()]));
  api.downloadRun.mockResolvedValue(blobFile);
  api.choices.warehouses.mockResolvedValue([{ value: ID.wh1, label: "Mumbai Hub (MUM)" }]);
  api.choices.accounts.mockResolvedValue([]);
  api.choices.categories.mockResolvedValue([]);
});

describe("ReportsPage: quick downloads and catalog", () => {
  it("shows the featured reports from the server with their button labels, and every catalog report", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "Download October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Settlement Log" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Valuation PDF" })).toBeInTheDocument();
    expect(screen.getByText(/1 active schedule, next delivery/)).toBeInTheDocument();
    const all = await screen.findByRole("region", { name: "All reports" });
    expect(within(all).getAllByRole("article")).toHaveLength(4);
  });

  it("generates a featured report with its suggested parameters and downloads the file", async () => {
    const user = userEvent.setup();
    api.exportReport.mockResolvedValue(run());
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Download October 2026" }));
    await waitFor(() => expect(api.exportReport).toHaveBeenCalledWith({ type: "gst_register", format: "xlsx", params: { month: "2026-10" } }));
    await waitFor(() => expect(api.downloadRun).toHaveBeenCalled());
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blobFile.blob, "gst-register-2026-10.xlsx"));
    expect(toastTitles()).toContain("Report downloaded");
  });

  it("uses the format picked on the card", async () => {
    const user = userEvent.setup();
    api.exportReport.mockResolvedValue(run({ format: "pdf" }));
    renderPage();
    await user.selectOptions(await screen.findByLabelText("Inventory valuation file format"), "csv");
    await user.click(screen.getByRole("button", { name: "Download Valuation PDF" }));
    await waitFor(() => expect(api.exportReport).toHaveBeenCalledWith({ type: "inventory_valuation", format: "csv", params: {} }));
  });

  it("polls a queued report until it is ready and then downloads it", async () => {
    const user = userEvent.setup();
    api.exportReport.mockResolvedValue(run({ status: "queued", downloadable: false, downloadUrl: null, fileName: null }));
    api.getRun.mockResolvedValueOnce(run({ status: "running", downloadable: false, downloadUrl: null })).mockResolvedValue(run());
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Download October 2026" }));
    await waitFor(() => expect(toastTitles()).toContain("Generating your report"));
    await waitFor(() => expect(api.downloadRun).toHaveBeenCalled(), { timeout: 8000 });
    expect(api.getRun.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(api.getRun.mock.calls[0]?.[0]).toBe(ID.run1);
  }, 12000);

  it("tells the person when the GST register cannot be built", async () => {
    const user = userEvent.setup();
    api.exportReport.mockRejectedValue(new ApiError({ code: "UNPROCESSABLE", message: "x", status: 422, details: { rule: "gst_registration_required" } }));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Download October 2026" }));
    await waitFor(() => expect(toastTitles()).toContain("Could not generate GST tax and sales invoicing register"));
    expect(useToastStore.getState().toasts[0]?.description).toMatch(/Add your GSTIN/);
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("generates from the dialog with a custom month, and refuses an empty one before calling the API", async () => {
    const user = userEvent.setup();
    api.exportReport.mockResolvedValue(run({ reportType: "sales", reportTitle: "Sales report" }));
    renderPage();
    const all = await screen.findByRole("region", { name: "All reports" });
    await user.click(within(await within(all).findByRole("article", { name: "Sales report" })).getByRole("button", { name: "Generate" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Period type"), "month");
    await user.click(within(dialog).getByRole("button", { name: "Generate report" }));
    expect(await within(dialog).findByText("Choose a month")).toBeInTheDocument();
    expect(api.exportReport).not.toHaveBeenCalled();

    fireMonth(within(dialog).getByLabelText(/Month/), "2026-09");
    await user.selectOptions(within(dialog).getByLabelText("File format"), "csv");
    await user.click(within(dialog).getByRole("button", { name: "Generate report" }));
    await waitFor(() => expect(api.exportReport).toHaveBeenCalledWith({ type: "sales", format: "csv", params: { month: "2026-09" }, background: false }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("disables generating and scheduling without report write permission", async () => {
    grant("reports:read");
    renderPage();
    expect(await screen.findByRole("button", { name: "Download October 2026" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Schedule a report" })).toBeDisabled();
  });

  it("explains a failed load and retries", async () => {
    const user = userEvent.setup();
    api.overview.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Boom", status: 500 }));
    renderPage();
    expect(await screen.findByText("Reports could not be loaded.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Download October 2026" })).toBeInTheDocument();
  });
});

describe("ReportsPage: history", () => {
  it("lists runs with their status, filters through the URL and downloads a kept file", async () => {
    const user = userEvent.setup();
    renderPage("/reports?tab=history");
    expect(await screen.findByText("Add your GSTIN first")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download gst-register-2026-10.xlsx" }));
    await waitFor(() => expect(api.downloadRun).toHaveBeenCalledWith(expect.objectContaining({ id: ID.run1 })));

    await user.selectOptions(screen.getByLabelText("Status"), "failed");
    expect(loc()).toBe("/reports?tab=history&status=failed");
    await waitFor(() => expect(api.listRuns.mock.calls.at(-1)?.[0]).toMatchObject({ status: "failed", page: 1 }));
  });

  it("restores filters and the page from the URL", async () => {
    api.listRuns.mockResolvedValue(page([run()], { page: 2, total: 30, pages: 2 }));
    renderPage("/reports?tab=history&type=sales&trigger=schedule&page=2");
    await screen.findByText(/Showing 26–26 of 30 runs/);
    expect(api.listRuns.mock.calls.at(-1)?.[0]).toMatchObject({ type: "sales", trigger: "schedule", page: 2 });
  });

  it("opens a run in a dialog from the URL and shows its details", async () => {
    api.getRun.mockResolvedValue(run({ warnings: 3, notes: ["2 orders have no HSN code"] }));
    renderPage(`/reports?tab=history&run=${ID.run1}`);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("3 flagged in the file")).toBeInTheDocument();
    expect(within(dialog).getByText("2 orders have no HSN code")).toBeInTheDocument();
    expect(within(dialog).getByText("October 2026")).toBeInTheDocument();
  });

  it("shows an expired file as expired, and an empty history with a way forward", async () => {
    api.listRuns.mockResolvedValueOnce(page([run({ downloadable: false, downloadUrl: null })]));
    const { unmount } = renderPage("/reports?tab=history");
    expect(await screen.findByText("Expired")).toBeInTheDocument();
    unmount();
    api.listRuns.mockResolvedValueOnce(page([]));
    renderPage("/reports?tab=history");
    expect(await screen.findByText("No reports generated yet.")).toBeInTheDocument();
  });

  it("tells the person a download failed because the file expired", async () => {
    const user = userEvent.setup();
    api.downloadRun.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "gone", status: 404, details: { rule: "file_expired" } }));
    renderPage("/reports?tab=history");
    await user.click(await screen.findByRole("button", { name: "Download gst-register-2026-10.xlsx" }));
    await waitFor(() => expect(toastTitles().some((t) => t?.startsWith("Could not download"))).toBe(true));
    expect(useToastStore.getState().toasts[0]?.description).toMatch(/expired/);
  });
});

describe("ReportsPage: schedules", () => {
  it("lists schedules with cadence, recipients and the next delivery", async () => {
    renderPage("/reports?tab=schedules");
    const row = (await screen.findByText("Monthly GST for the CA")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Monthly on day 2 at 06:00")).toBeInTheDocument();
    expect(within(row).getByText("ca@example.com")).toBeInTheDocument();
    expect(within(row).getByText("Previous month")).toBeInTheDocument();
  });

  it("creates a schedule with relative parameters and the chosen cadence", async () => {
    const user = userEvent.setup();
    api.createSchedule.mockResolvedValue(schedule({ id: "new" }));
    renderPage("/reports?tab=schedules");
    await screen.findByText("Monthly GST for the CA");
    await user.click(screen.getByRole("button", { name: "Schedule a report" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Schedule report" }));
    expect(await within(dialog).findByText("Give the schedule a name")).toBeInTheDocument();
    expect(api.createSchedule).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/Name/), "Weekly GST");
    await user.selectOptions(within(dialog).getByLabelText("Period"), "previous_month");
    await user.selectOptions(within(dialog).getByLabelText("Repeats"), "weekly");
    await user.selectOptions(within(dialog).getByLabelText("On"), "5");
    await user.type(within(dialog).getByLabelText("Recipients"), "ca@example.com, not-an-email");
    await user.click(within(dialog).getByRole("button", { name: "Schedule report" }));
    expect(await within(dialog).findByText("not-an-email is not a valid e-mail address")).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText("Recipients"));
    await user.type(within(dialog).getByLabelText("Recipients"), "ca@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Schedule report" }));
    await waitFor(() =>
      expect(api.createSchedule).toHaveBeenCalledWith({
        name: "Weekly GST",
        reportType: "gst_register",
        format: "xlsx",
        frequency: "weekly",
        dayOfWeek: 5,
        timeOfDay: "06:00",
        timezone: "Asia/Kolkata",
        params: { range: "previous_month" },
        recipients: ["ca@example.com"],
        status: "active",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toastTitles()).toContain("Report scheduled");
  });

  it("does not offer fixed dates in a schedule", async () => {
    const user = userEvent.setup();
    renderPage("/reports?tab=schedules");
    await user.click(await screen.findByRole("button", { name: "Schedule a report" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("Period type")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Month/)).not.toBeInTheDocument();
  });

  it("pauses, resumes and runs a schedule now", async () => {
    const user = userEvent.setup();
    api.pauseSchedule.mockResolvedValue(schedule({ status: "paused", nextRunAt: null, version: 2 }));
    api.runScheduleNow.mockResolvedValue(run({ status: "queued", downloadable: false, downloadUrl: null, scheduleId: ID.sch1 }));
    api.getRun.mockResolvedValue(run({ scheduleId: ID.sch1 }));
    renderPage("/reports?tab=schedules");
    await user.click(await screen.findByRole("button", { name: "Pause Monthly GST for the CA" }));
    await waitFor(() => expect(api.pauseSchedule).toHaveBeenCalledWith(ID.sch1));
    expect(toastTitles()).toContain("Schedule paused");

    await user.click(screen.getByRole("button", { name: "Run Monthly GST for the CA now" }));
    await waitFor(() => expect(api.runScheduleNow).toHaveBeenCalledWith(ID.sch1));
    await waitFor(() => expect(api.getRun).toHaveBeenCalledWith(ID.run1, expect.anything()));
    // a run started from a schedule only tells the person: it does not download by itself
    await waitFor(() => expect(toastTitles()).toContain("GST tax and sales invoicing register is ready"));
    expect(api.downloadRun).not.toHaveBeenCalled();
  });

  it("asks before deleting a schedule", async () => {
    const user = userEvent.setup();
    api.deleteSchedule.mockResolvedValue({ deleted: true, id: ID.sch1 });
    renderPage("/reports?tab=schedules");
    await user.click(await screen.findByRole("button", { name: "Delete Monthly GST for the CA" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/will stop running/)).toBeInTheDocument();
    expect(api.deleteSchedule).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete schedule" }));
    await waitFor(() => expect(api.deleteSchedule).toHaveBeenCalledWith(ID.sch1));
    expect(toastTitles()).toContain("Schedule deleted");
  });

  it("sends the version on edit and recovers from a version conflict", async () => {
    const user = userEvent.setup();
    api.updateSchedule.mockRejectedValueOnce(new ApiError({ code: "VERSION_CONFLICT", message: "changed", status: 409, details: { currentVersion: 3 } })).mockResolvedValue(schedule({ name: "Renamed", version: 4 }));
    api.getSchedule.mockResolvedValue(schedule({ version: 3 }));
    renderPage("/reports?tab=schedules");
    await user.click(await screen.findByRole("button", { name: "Edit Monthly GST for the CA" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText(/Name/);
    await user.clear(name);
    await user.type(name, "Renamed");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateSchedule).toHaveBeenCalledWith(ID.sch1, expect.objectContaining({ version: 1, name: "Renamed" })));
    expect(await screen.findByText("This schedule was changed by someone else")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep my edits" }));
    await waitFor(() => expect(api.getSchedule).toHaveBeenCalled());
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateSchedule).toHaveBeenLastCalledWith(ID.sch1, expect.objectContaining({ version: 3, name: "Renamed" })));
    expect(toastTitles()).toContain("Schedule saved");
  });

  it("shows the server's message under a field it refuses", async () => {
    const user = userEvent.setup();
    api.updateSchedule.mockRejectedValue(new ApiError({ code: "VALIDATION_FAILED", message: "bad", status: 400, details: { rule: "bad_timezone", issues: [{ path: "timezone", message: "Unknown time zone Mars/Base" }] } }));
    renderPage("/reports?tab=schedules");
    await user.click(await screen.findByRole("button", { name: "Edit Monthly GST for the CA" }));
    const dialog = await screen.findByRole("dialog");
    const tz = within(dialog).getByLabelText("Time zone");
    await user.clear(tz);
    await user.type(tz, "Mars/Base");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText("Unknown time zone Mars/Base")).toBeInTheDocument();
  });

  it("explains that there are no schedules", async () => {
    api.listSchedules.mockResolvedValue(page([]));
    renderPage("/reports?tab=schedules");
    expect(await screen.findByText("No scheduled reports.")).toBeInTheDocument();
  });
});

/** a month input takes its value in one go (user-event cannot type into it) */
function fireMonth(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } });
}
