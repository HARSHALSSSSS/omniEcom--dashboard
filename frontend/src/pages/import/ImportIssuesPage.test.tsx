import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { saveBlob } from "@/components/products/list/saveBlob";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { CATEGORY_ID, IMPORT_ID, ISSUE_A, ISSUE_B, OPTIONS, issue, paged, session, summary, validated } from "@/test/importFixtures";

const api = vi.hoisted(() => ({
  options: vi.fn(),
  get: vi.fn(),
  summary: vi.fn(),
  issues: vi.fn(),
  rows: vi.fn(),
  resolve: vi.fn(),
  bulkResolve: vi.fn(),
  revalidate: vi.fn(),
  commit: vi.fn(),
  errorsCsv: vi.fn(),
}));
vi.mock("@/api/import.api", () => ({ importApi: api }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob: vi.fn() }));
vi.mock("@/hooks/useProducts", () => ({
  useCategoryOptions: () => ({ data: [{ id: "55555555-5555-4555-8555-555555555555", label: "Women > Kurtas" }], isLoading: false, isError: false }),
}));

import ImportIssuesPage from "./ImportIssuesPage";

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(search = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/products/import/${IMPORT_ID}/issues${search}`]}>
        <Routes>
          <Route
            path="/products/import/:importId/issues"
            element={
              <>
                <ImportIssuesPage />
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
const toastTexts = () => useToastStore.getState().toasts.map((t) => `${t.title} ${t.description ?? ""}`);
const lastIssuesQuery = () => api.issues.mock.calls.at(-1)?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("imports:read", "imports:write");
  api.options.mockResolvedValue(OPTIONS);
  api.get.mockResolvedValue(validated());
  api.summary.mockResolvedValue(summary());
  api.issues.mockResolvedValue(paged([ISSUE_A, ISSUE_B]));
  api.rows.mockResolvedValue(
    paged([{ rowNumber: 2, status: "valid", sku: "TRV-1", productCode: "TRV", title: "Jacket", issueCount: 0, plan: "create", skipReason: null, fixed: false, result: null, productId: null, variantId: null, values: { sku: "TRV-1" }, raw: { SKU_CODE: "TRV-1" } }]),
  );
});

describe("ImportIssuesPage", () => {
  it("shows the real counters, one tab per kind of issue and the numbered issues", async () => {
    renderPage();
    expect(await screen.findByText("festive.csv", { exact: false })).toBeInTheDocument();
    const ribbon = (await screen.findByText("Open issues")).parentElement as HTMLElement;
    expect(ribbon).toHaveTextContent("18");
    const tabs = await screen.findByRole("tablist", { name: "Issue kind" });
    await waitFor(() => expect(within(tabs).getByRole("tab", { name: /All issues/ })).toHaveTextContent("18"));
    expect(within(tabs).getByRole("tab", { name: /Missing SKU identifier/ })).toHaveTextContent("12");
    expect(within(tabs).getByRole("tab", { name: /Unrecognized category/ })).toHaveTextContent("6");

    const table = await screen.findByRole("table", { name: "Import issues" });
    expect(within(table).getByText("7")).toBeInTheDocument();
    expect(within(table).getByText("9")).toBeInTheDocument();
    // the first issue is open in the workspace, with the row it belongs to
    const detail = screen.getByRole("region", { name: "Issue in row 7" });
    expect(within(detail).getAllByText("Women > Kurtas").length).toBeGreaterThan(0);
    expect(within(detail).getAllByText("Cotton Kurti").length).toBeGreaterThan(0);
    expect(lastIssuesQuery()).toEqual({ code: undefined, severity: undefined, status: "open", q: undefined, page: 1, pageSize: 25 });
  });

  it("filters by kind, severity, status and search through the URL", async () => {
    renderPage();
    const tabs = await screen.findByRole("tablist", { name: "Issue kind" });
    await userEvent.click(await within(tabs).findByRole("tab", { name: /Missing SKU identifier/ }));
    await waitFor(() => expect(loc()).toContain("code=missing_sku"));
    await waitFor(() => expect(lastIssuesQuery()).toMatchObject({ code: "missing_sku", status: "open" }));

    await userEvent.selectOptions(screen.getByLabelText("Severity"), "error");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "resolved");
    await waitFor(() => expect(lastIssuesQuery()).toMatchObject({ code: "missing_sku", severity: "error", status: "resolved" }));
    expect(loc()).toContain("status=resolved");

    await userEvent.type(screen.getByLabelText("Search issues"), "KUR-7");
    await waitFor(() => expect(lastIssuesQuery()).toMatchObject({ q: "KUR-7" }), { timeout: 2000 });
    expect(loc()).toContain("q=KUR-7");

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastIssuesQuery()).toMatchObject({ code: undefined, severity: undefined, status: "open", q: undefined }));
  });

  it("restores the filters from the URL", async () => {
    renderPage("?code=category_unmapped&status=all&page=2&size=50");
    await waitFor(() => expect(lastIssuesQuery()).toMatchObject({ code: "category_unmapped", status: undefined, page: 2, pageSize: 50 }));
  });

  it("accepts the suggestion and the counters move with the answer", async () => {
    api.resolve.mockResolvedValue({
      issue: { ...ISSUE_A, status: "resolved", currentFix: "Women > Kurtas" },
      issues: { total: 20, open: 17, resolved: 3, ignored: 0, openErrors: 12, openWarnings: 5 },
      counters: validated().counters,
    });
    renderPage();
    const detail = await screen.findByRole("region", { name: "Issue in row 7" });
    await userEvent.click(within(detail).getByRole("button", { name: "Accept suggestion" }));
    await waitFor(() => expect(api.resolve).toHaveBeenCalledWith(IMPORT_ID, { issueId: ISSUE_A.id, action: "accept_suggestion", customValue: undefined }));
    await waitFor(() => expect((screen.getByText("Open issues").parentElement as HTMLElement).textContent).toContain("17"));
    // the next issue takes its place
    await waitFor(() => expect(loc()).toContain(`issue=${ISSUE_B.id}`));
    await waitFor(() => expect(toastTitles()).toContain("Issue resolved"));
  });

  it("maps a category by id, types a value for other fields and ignores", async () => {
    api.resolve.mockResolvedValue({ issue: ISSUE_A, issues: validated().issues, counters: validated().counters });
    renderPage();
    const detail = await screen.findByRole("region", { name: "Issue in row 7" });
    await userEvent.selectOptions(within(detail).getByLabelText("Category"), CATEGORY_ID);
    await userEvent.click(within(detail).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(api.resolve).toHaveBeenLastCalledWith(IMPORT_ID, { issueId: ISSUE_A.id, action: "custom_value", customValue: CATEGORY_ID }));

    await userEvent.click(screen.getByRole("button", { name: /Open issue for row 9/ }));
    const second = await screen.findByRole("region", { name: "Issue in row 9" });
    await userEvent.type(within(second).getByLabelText("Custom value"), "SAR-9");
    await userEvent.click(within(second).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(api.resolve).toHaveBeenLastCalledWith(IMPORT_ID, { issueId: ISSUE_B.id, action: "custom_value", customValue: "SAR-9" }));

    // the issue after the one just settled is open now: back to row 9 to ignore it
    await userEvent.click(await screen.findByRole("button", { name: /Open issue for row 9/ }));
    await userEvent.click(within(await screen.findByRole("region", { name: "Issue in row 9" })).getByRole("button", { name: /Ignore this issue/ }));
    await waitFor(() => expect(api.resolve).toHaveBeenLastCalledWith(IMPORT_ID, { issueId: ISSUE_B.id, action: "ignore", customValue: undefined }));
  });

  it("shows the API's reason when a fix is refused", async () => {
    api.resolve.mockRejectedValue(new ApiError({ code: "VALIDATION_FAILED", message: "Price must be a number", status: 422 }));
    renderPage();
    await userEvent.click(within(await screen.findByRole("region", { name: "Issue in row 7" })).getByRole("button", { name: "Accept suggestion" }));
    await waitFor(() => expect(toastTexts().join()).toContain("Price must be a number"));
  });

  it("changes every open issue of a kind and lists what was left out", async () => {
    api.bulkResolve.mockResolvedValue({
      matched: 6,
      applied: 5,
      skippedCount: 1,
      skipped: [{ issueId: "x", rowNumber: 44, reason: "No suggestion for this row" }],
      issues: { total: 20, open: 13, resolved: 7, ignored: 0, openErrors: 12, openWarnings: 1 },
      counters: validated().counters,
    });
    renderPage();
    const detail = await screen.findByRole("region", { name: "Issue in row 7" });
    await userEvent.click(within(detail).getByRole("button", { name: "Accept suggestions for all" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply to all" }));
    await waitFor(() => expect(api.bulkResolve).toHaveBeenCalledWith(IMPORT_ID, { code: "category_unmapped", action: "accept_suggestion", customValue: undefined, sourceValue: undefined }));
    expect(await within(dialog).findByText(/5 of 6 issues were changed/)).toBeInTheDocument();
    expect(within(dialog).getByText("No suggestion for this row")).toBeInTheDocument();
    await waitFor(() => expect((screen.getByText("Open issues").parentElement as HTMLElement).textContent).toContain("13"));
  });

  it("sets one value for the rows that show the same cell", async () => {
    api.bulkResolve.mockResolvedValue({ matched: 3, applied: 3, skippedCount: 0, skipped: [], issues: validated().issues, counters: validated().counters });
    renderPage();
    const detail = await screen.findByRole("region", { name: "Issue in row 7" });
    await userEvent.click(within(detail).getByRole("button", { name: "Set a value for rows showing the same" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Apply to all" })).toBeDisabled();
    await userEvent.selectOptions(within(dialog).getByLabelText("Category"), CATEGORY_ID);
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply to all" }));
    await waitFor(() => expect(api.bulkResolve).toHaveBeenCalledWith(IMPORT_ID, { code: "category_unmapped", action: "custom_value", customValue: CATEGORY_ID, sourceValue: "Kurtis" }));
  });

  it("revalidates, inline or queued", async () => {
    api.revalidate.mockResolvedValueOnce({ queued: false, status: "issues_remain", revalidatedCount: 120, resolvedCount: 4, remainingIssuesCount: 14, session: validated() });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Revalidate/ }));
    await waitFor(() => expect(api.revalidate).toHaveBeenCalledWith(IMPORT_ID));
    await waitFor(() => expect(toastTexts().join()).toContain("4 fixed, 14 issue(s) remain."));

    api.revalidate.mockResolvedValueOnce({ queued: true, status: "queued", revalidatedCount: 0, resolvedCount: 0, remainingIssuesCount: 18, session: validated({ status: "validating", uiStatus: "processing", counters: { ...validated().counters, processed: 10, percent: 8 } }) });
    api.get.mockResolvedValue(validated({ status: "validating", uiStatus: "processing", counters: { ...validated().counters, processed: 10, percent: 8 } }));
    await userEvent.click(screen.getByRole("button", { name: /Revalidate/ }));
    expect(await screen.findByRole("heading", { name: "Revalidating" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Validation progress" })).toHaveAttribute("aria-valuenow", "8");
  });

  it("downloads the unresolved issues as CSV", async () => {
    api.errorsCsv.mockResolvedValue({ blob: new Blob(["row"]), fileName: "import-11111111-issues.csv" });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Download issues/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "import-11111111-issues.csv"));
  });

  it("starts the import from here and follows it to the result", async () => {
    api.commit.mockResolvedValue({ session: validated({ status: "committing", uiStatus: "processing" }), eligibleRows: 108 });
    api.get.mockResolvedValueOnce(validated());
    api.get.mockResolvedValue(validated({ status: "committed", uiStatus: "completed", counters: { ...validated().counters, committed: 108, percent: 100 }, results: { productsCreated: 90, productsUpdated: 0, variantsCreated: 18, variantsUpdated: 0 } }));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Import rows" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Import rows" }));
    await userEvent.click(await screen.findByRole("button", { name: "Import now" }));
    await waitFor(() => expect(api.commit).toHaveBeenCalledWith(IMPORT_ID, "include_resolved"));
    expect(await screen.findByRole("heading", { name: "Import complete" }, { timeout: 4000 })).toBeInTheDocument();
  });

  it("shows the clean state when nothing was found", async () => {
    api.get.mockResolvedValue(validated({ issues: { total: 0, open: 0, resolved: 0, ignored: 0, openErrors: 0, openWarnings: 0 } }));
    api.summary.mockResolvedValue(summary({ total: 0, open: 0, resolved: 0, errors: 0, warnings: 0, byCode: [] }));
    api.issues.mockResolvedValue(paged([]));
    renderPage();
    expect(await screen.findByText("No issues found.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Import rows" })).toHaveLength(2);
  });

  it("says when there are no open issues left but resolved ones exist", async () => {
    api.issues.mockResolvedValue(paged([]));
    renderPage();
    expect(await screen.findByText("No open issues.")).toBeInTheDocument();
  });

  it("explains an import that has not been validated yet", async () => {
    api.get.mockResolvedValue(session());
    renderPage();
    expect(await screen.findByText("This import has not been validated yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue the import" })).toHaveAttribute("href", `/products/import?import=${IMPORT_ID}`);
    expect(api.issues).not.toHaveBeenCalled();
  });

  it("shows the rows of the file with their status", async () => {
    renderPage("?view=rows");
    const table = await screen.findByRole("table", { name: "Rows of the import file" });
    expect(within(table).getByText("TRV-1")).toBeInTheDocument();
    expect(within(table).getByText("Create product")).toBeInTheDocument();
    await userEvent.click(within(table).getByRole("button", { name: /Show details of row 2/ }));
    expect(within(table).getByText("In your file")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Row status"), "error");
    await waitFor(() => expect(api.rows.mock.calls.at(-1)?.[1]).toMatchObject({ status: "error" }));
  });

  it("offers retry when the issues cannot be loaded", async () => {
    api.issues.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Database unavailable", status: 500 }));
    renderPage();
    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table", { name: "Import issues" })).toBeInTheDocument();
  });

  it("is read-only without the write permission", async () => {
    grant("imports:read");
    renderPage();
    expect(await screen.findByText(/viewing this import read-only/)).toBeInTheDocument();
    const detail = await screen.findByRole("region", { name: "Issue in row 7" });
    expect(within(detail).queryByRole("button", { name: "Accept suggestion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revalidate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import rows" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download issues/ })).toBeInTheDocument();
  });

  it("shows no access without the read permission", async () => {
    grant();
    renderPage();
    expect(await screen.findByText("You do not have access to product imports.")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("says so when the import does not exist", async () => {
    api.get.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "Import not found", status: 404 }));
    renderPage();
    expect(await screen.findByText("This import was not found.")).toBeInTheDocument();
  });

  it("shows a resolved issue with what was applied", async () => {
    api.issues.mockResolvedValue(paged([issue({ status: "resolved", currentFix: "Women > Kurtas", resolvedAt: "2026-01-02T10:00:00.000Z" })]));
    renderPage("?status=resolved");
    const detail = await screen.findByRole("region", { name: "Issue in row 7" });
    expect(within(detail).getByText(/Women > Kurtas/)).toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: "Accept suggestion" })).not.toBeInTheDocument();
  });
});
