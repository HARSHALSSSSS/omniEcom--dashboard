import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import { IMPORT_ID, session, validated } from "@/test/importFixtures";
import type { ActivityItem } from "@/types/importProcessing";

const api = vi.hoisted(() => ({ get: vi.fn() }));
const activityApi = vi.hoisted(() => ({ activity: vi.fn() }));
vi.mock("@/api/import.api", () => ({ importApi: api }));
vi.mock("@/api/importProcessing.api", () => ({ importProcessingApi: activityApi }));

import ImportProcessingPage from "./ImportProcessingPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/products/import/${IMPORT_ID}/processing`]}>
        <Routes>
          <Route path="/products/import/:importId/processing" element={<ImportProcessingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const item = (n: number, over: Partial<ActivityItem> = {}): ActivityItem => ({
  id: `act-${n}`,
  at: `2026-01-02T10:00:${String(n).padStart(2, "0")}.000Z`,
  kind: "row_validated",
  rowNumber: n,
  sku: `SKU-${n}`,
  title: null,
  message: `Row ${n} validated.`,
  ...over,
});

const committing = (over = {}) =>
  validated({
    status: "committing",
    uiStatus: "processing",
    startedAt: "2026-01-02T10:00:00.000Z",
    counters: { total: 120, processed: 120, valid: 100, warning: 8, error: 12, ignored: 0, skipped: 0, committed: 54, failed: 0, percent: 50, etaSeconds: 90 },
    issues: { total: 20, open: 3, resolved: 17, ignored: 0, openErrors: 1, openWarnings: 2 },
    ...over,
  });

/** the item of a stage: its label is the second child (after the circle) */
const stage = (label: string) => {
  const found = within(screen.getByRole("list", { name: "Import stages" }))
    .getAllByRole("listitem")
    .find((li) => li.children[1]?.textContent === label);
  if (!found) throw new Error(`No stage ${label}`);
  return found;
};

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ permissions: ["imports:read", "imports:write"] });
  activityApi.activity.mockResolvedValue({ items: [item(3), item(2), item(1)], nextBefore: null });
});

describe("ImportProcessingPage", () => {
  it("shows the stages, counters and panels of a running commit", async () => {
    api.get.mockResolvedValue(committing());
    renderPage();
    expect(await screen.findByRole("heading", { name: "Import in progress" })).toBeInTheDocument();
    expect(screen.getByText("Running · Creating master product records")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Import progress" })).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("54 of 108 rows processed")).toBeInTheDocument();
    expect(screen.getByText("Estimated remaining work: about 2 min")).toBeInTheDocument();
    expect(stage("Validating")).toHaveTextContent("Complete");
    expect(stage("Creating products")).toHaveTextContent("In progress");
    expect(stage("Complete")).toHaveTextContent("Upcoming");
    expect(screen.getByText("festive.csv")).toBeInTheDocument();
    expect(screen.getByText("Blocking issues").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Warnings so far").nextSibling).toHaveTextContent("2");
    expect(screen.getByText("Remaining").nextSibling).toHaveTextContent("54");
    expect(screen.getByText("We'll notify you when it's complete.")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Import history" })) expect(link).toHaveAttribute("href", "/products/import");
    expect(screen.getByRole("link", { name: "Go to products catalog" })).toHaveAttribute("href", "/products");
    expect(screen.getByRole("link", { name: "Review issues" })).toHaveAttribute("href", `/products/import/${IMPORT_ID}/issues`);
  });

  it("follows a validation", async () => {
    api.get.mockResolvedValue(validated({ status: "validating", uiStatus: "processing", counters: { ...validated().counters, processed: 30, percent: 25 } }));
    renderPage();
    expect(await screen.findByText("Running · Overall product processing")).toBeInTheDocument();
    expect(stage("Validating")).toHaveTextContent("In progress");
    expect(stage("Creating products")).toHaveTextContent("Upcoming");
    expect(screen.getByText("30 of 120 rows processed")).toBeInTheDocument();
  });

  it("shows the finished import with its result", async () => {
    api.get.mockResolvedValue(
      committing({
        status: "committed",
        uiStatus: "completed",
        finishedAt: "2026-01-02T10:05:00.000Z",
        counters: { total: 120, processed: 120, valid: 100, warning: 8, error: 12, ignored: 0, skipped: 0, committed: 108, failed: 0, percent: 100, etaSeconds: null },
        results: { productsCreated: 90, productsUpdated: 4, variantsCreated: 18, variantsUpdated: 0 },
        scope: { products: 94, newProducts: 90, updates: 4 },
      }),
    );
    renderPage();
    expect(await screen.findByRole("heading", { name: "Import complete" })).toBeInTheDocument();
    expect(screen.getByText("Complete · 108 rows added to the master catalog")).toBeInTheDocument();
    expect(stage("Complete")).toHaveTextContent("Complete");
    expect(screen.getByText("Products").nextSibling).toHaveTextContent("94");
    expect(screen.getByText("New products").nextSibling).toHaveTextContent("90");
    expect(screen.getByText("Product updates").nextSibling).toHaveTextContent("4");
    expect(screen.getByRole("link", { name: "View imported products →" })).toHaveAttribute("href", "/products");
  });

  it("marks the stage that failed", async () => {
    api.get.mockResolvedValue(committing({ status: "failed", uiStatus: "failed", failureMessage: "Database unavailable" }));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Import failed" })).toBeInTheDocument();
    expect(stage("Creating products")).toHaveTextContent("Failed");
    expect(screen.getAllByText(/Database unavailable/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Back to the import" })).toHaveAttribute("href", `/products/import?import=${IMPORT_ID}`);
  });

  it("sends an import that was not started back to the wizard", async () => {
    api.get.mockResolvedValue(session());
    renderPage();
    expect(await screen.findByText("This import has not been started yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the import" })).toHaveAttribute("href", `/products/import?import=${IMPORT_ID}`);
    expect(activityApi.activity).not.toHaveBeenCalled();
  });

  it("lists the activity newest first and loads older entries", async () => {
    api.get.mockResolvedValue(committing());
    activityApi.activity.mockResolvedValueOnce({ items: [item(3, { kind: "row_failed", message: "Row 3 failed." }), item(2, { kind: "row_warning", message: "Row 2 has a warning." })], nextBefore: "cursor-1" });
    activityApi.activity.mockResolvedValueOnce({ items: [item(1)], nextBefore: null });
    renderPage();
    const feed = await screen.findByRole("list", { name: "Import activity" });
    const rows = within(feed).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Row 3 failed.");
    expect(rows[0]).toHaveTextContent("Failed");
    expect(rows[1]).toHaveTextContent("Warning");
    await userEvent.click(screen.getByRole("button", { name: "Load older" }));
    await waitFor(() => expect(within(feed).getAllByRole("listitem")).toHaveLength(3));
    expect(activityApi.activity).toHaveBeenLastCalledWith(IMPORT_ID, { limit: 50, before: "cursor-1" });
    expect(screen.queryByRole("button", { name: "Load older" })).not.toBeInTheDocument();
  });

  it("says so when the activity cannot be loaded", async () => {
    api.get.mockResolvedValue(committing());
    activityApi.activity.mockRejectedValue(new ApiError({ code: "INTERNAL", message: "Activity down", status: 500 }));
    renderPage();
    expect(await screen.findByText(/The activity could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows no access without the read permission", async () => {
    useWorkspaceStore.setState({ permissions: [] });
    renderPage();
    expect(await screen.findByText("You do not have access to product imports.")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("says so when the import does not exist", async () => {
    api.get.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "Import not found", status: 404 }));
    renderPage();
    expect(await screen.findByText("This import was not found.")).toBeInTheDocument();
  });
});
