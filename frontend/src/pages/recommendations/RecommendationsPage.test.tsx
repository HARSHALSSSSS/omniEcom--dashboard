import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { Recommendations, SyncJob } from "@/types/recommendations";

const api = vi.hoisted(() => ({ get: vi.fn(), retrySync: vi.fn(), syncJob: vi.fn() }));
vi.mock("@/api/recommendations.api", () => ({ recommendationsApi: api }));

import RecommendationsPage from "./RecommendationsPage";

const job = (status: SyncJob["status"], over: Partial<SyncJob> = {}): SyncJob => ({ id: "job1", type: "inventory", status, attempts: 1, maxAttempts: 3, finishedAt: null, progress: { total: 0, done: 0, failed: 0 }, ...over });

const full = (): Recommendations => ({
  asOf: "2026-10-20T10:00:00.000Z",
  channelConnections: 2,
  channel: {
    channel: { code: "meesho", name: "Meesho", accountId: "acc1" },
    displayName: "Meesho",
    mode: "live",
    connection: "needs_attention",
    health: "attention",
    lastSyncAt: "2026-10-20T09:42:00.000Z",
    syncMode: "automatic",
    openIssueCount: 2,
    openIssues: [
      { code: "inventory_rejected", title: "Inventory update rejected", explanation: "The stock update for TRV-1042 was not accepted.", action: { label: "Review mapping", href: "/listings" } },
      { code: "last_sync_failed", title: "Latest sync failed", explanation: "Timeout", action: { label: "View sync log", href: "/sync/jobs/j9" } },
    ],
    actions: [
      { key: "retry_sync", label: "Retry sync", method: "POST", href: "/api/v1/marketplace-accounts/acc1/inventory-sync", enabled: true, disabledReason: null },
      { key: "manage", label: "Manage connection", method: "GET", href: "/api/v1/marketplace-accounts/acc1", enabled: true, disabledReason: null },
    ],
  },
  product: {
    productId: "p1",
    variantId: "v1",
    title: "Premium Travel Bag",
    sku: "TRV-1042",
    location: "Home Inventory",
    status: "low",
    onHand: 6,
    reserved: 2,
    available: 4,
    lowStockThreshold: 10,
    salesVelocityPerDay: 2,
    estimatedCoverDays: 2,
    recentMovements: [
      { at: "2026-10-04T10:00:00.000Z", type: "receive", label: "Stock received", quantity: 12, positive: true },
      { at: "2026-10-05T10:00:00.000Z", type: "issue", label: "Dispatched", quantity: -6, positive: false },
    ],
    actions: [
      { key: "review_replenishment", label: "Review replenishment", href: "/procurement" },
      { key: "open_product", label: "Open product", href: "/products/p1" },
    ],
  },
  replenishment: {
    headline: "Replenish 2 products this week",
    approachingThreshold: 18,
    summary: "18 products are approaching their stock threshold.",
    rationale: "Based on units sold over the last 30 days, replenishing these 2 products could reduce potential stockouts.",
    targetDays: 14,
    formula: "14 days of sales minus available stock",
    shown: 2,
    totalProducts: 5,
    items: [
      { variantId: "v1", name: "Premium Travel Bag", sku: "TRV-1042", available: 4, salesVelocityPerDay: 2, coverDays: 2, suggestedUnits: 24 },
      { variantId: "v2", name: "Classic Backpack", sku: "BP-1", available: 8, salesVelocityPerDay: 3, coverDays: 2, suggestedUnits: 34 },
    ],
    note: "Recommendation only. Review quantities and supplier lead times before deciding. No inventory changes have been made.",
    actions: [{ key: "review_replenishment", label: "Review replenishment", href: "/procurement" }],
  },
});

function Probe() {
  return <div data-testid="loc">{useLocation().pathname}</div>;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/recommendations"]}>
        <Routes>
          <Route path="*" element={<><RecommendationsPage /><Probe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ permissions: ["listings:write", "inventory:read"] });
  api.get.mockResolvedValue(full());
});
afterEach(() => vi.useRealTimers());

describe("recommendations cards", () => {
  it("shows a loading state, then all three real cards", async () => {
    renderPage();
    expect(screen.getByRole("status", { name: /loading recommendations/i })).toBeInTheDocument();
    const channel = within(await screen.findByTestId("channel-panel"));
    expect(channel.getByText("Meesho")).toBeInTheDocument();
    expect(channel.getByText("Needs attention")).toBeInTheDocument();
    expect(channel.getByText("2 issues")).toBeInTheDocument();
    expect(channel.getByText("Inventory update rejected")).toBeInTheDocument();
    expect(channel.getByText("Automatic")).toBeInTheDocument();

    const product = within(screen.getByTestId("product-panel"));
    expect(product.getByText("Premium Travel Bag")).toBeInTheDocument();
    expect(product.getByText("4 units available")).toBeInTheDocument();
    expect(product.getByText("Low stock")).toBeInTheDocument();
    expect(product.getByText("2 days")).toBeInTheDocument();
    expect(product.getByText("+12")).toBeInTheDocument();
    expect(product.getByText("-6")).toBeInTheDocument();

    const rep = within(screen.getByTestId("replenishment-panel"));
    expect(rep.getByText("Replenish 2 products this week")).toBeInTheDocument();
    expect(rep.getAllByTestId("replenishment-row")).toHaveLength(2);
    expect(rep.getByText("+24")).toBeInTheDocument();
    expect(rep.getByText("+34")).toBeInTheDocument();
    expect(rep.getByText("Showing 2 of 5 products.")).toBeInTheDocument();
    expect(rep.getByText(/Recommendation only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  it("links are real: problem actions, manage, review replenishment and open product go through toAppPath", async () => {
    renderPage();
    const channel = within(await screen.findByTestId("channel-panel"));
    await userEvent.click(channel.getByRole("button", { name: /Review mapping/ }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/listings");
    await userEvent.click(channel.getByRole("button", { name: /Manage connection/ }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/marketplace-hub");
    await userEvent.click(within(screen.getByTestId("replenishment-panel")).getByRole("button", { name: "Review replenishment" }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/procurement");
    await userEvent.click(within(screen.getByTestId("product-panel")).getByRole("button", { name: /Open product/ }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/products/p1");
  });

  it("renders only the cards the server sent", async () => {
    api.get.mockResolvedValue({ ...full(), channel: null, product: null });
    renderPage();
    expect(await screen.findByTestId("replenishment-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("channel-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("product-panel")).not.toBeInTheDocument();
  });

  it("says nothing needs attention when every card is empty", async () => {
    api.get.mockResolvedValue({ asOf: "2026-10-20T10:00:00.000Z", channel: null, channelConnections: 1, product: null, replenishment: null });
    renderPage();
    expect(await screen.findByText("Nothing needs your attention right now")).toBeInTheDocument();
  });

  it("shows the error and retries", async () => {
    api.get.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "The server hiccuped", status: 500 }));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("The server hiccuped");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("channel-panel")).toBeInTheDocument();
  });
});

describe("retry sync", () => {
  it("starts the channel's own action, follows the job until it ends, then reloads the cards", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    api.retrySync.mockResolvedValue({ job: job("queued"), alreadyQueued: false });
    api.syncJob.mockResolvedValueOnce(job("running", { progress: { total: 10, done: 4, failed: 0 } })).mockResolvedValue(job("succeeded"));
    renderPage();
    const channel = within(await screen.findByTestId("channel-panel"));
    await user.click(channel.getByRole("button", { name: "Retry sync" }));
    expect(api.retrySync).toHaveBeenCalledWith("/api/v1/marketplace-accounts/acc1/inventory-sync");
    expect(await channel.findByRole("button", { name: "Retrying..." })).toBeDisabled();

    await vi.advanceTimersByTimeAsync(1600);
    expect(await channel.findByText(/Sync running \(4\/10\)/)).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(1600);
    expect(await channel.findByText("Sync finished successfully.")).toBeInTheDocument();
    expect(api.syncJob).toHaveBeenCalledWith("job1");
    expect(channel.getByRole("button", { name: "Retry sync" })).toBeEnabled();
    await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(1));
  });

  it("reports a failed job honestly", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    api.retrySync.mockResolvedValue({ job: job("running"), alreadyQueued: true });
    api.syncJob.mockResolvedValue(job("failed"));
    renderPage();
    const channel = within(await screen.findByTestId("channel-panel"));
    await user.click(channel.getByRole("button", { name: "Retry sync" }));
    await vi.advanceTimersByTimeAsync(1600);
    expect(await channel.findByText(/The sync failed/)).toBeInTheDocument();
  });

  it("shows the server's reason when the sync cannot start", async () => {
    api.retrySync.mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "Forbidden", status: 403 }));
    renderPage();
    const channel = within(await screen.findByTestId("channel-panel"));
    await userEvent.click(channel.getByRole("button", { name: "Retry sync" }));
    expect(await channel.findByText("You do not have permission to do that.")).toBeInTheDocument();
  });

  it("is disabled with the reason when the server says the action is not available", async () => {
    const data = full();
    data.channel = { ...(data.channel as NonNullable<typeof data.channel>), actions: [{ key: "retry_sync", label: "Retry sync", method: "POST", href: "/api/v1/marketplace-accounts/acc1/inventory-sync", enabled: false, disabledReason: "The connection is not active" }] };
    api.get.mockResolvedValue(data);
    renderPage();
    const channel = within(await screen.findByTestId("channel-panel"));
    expect(channel.getByRole("button", { name: "Retry sync" })).toBeDisabled();
    expect(channel.getByText("The connection is not active")).toBeInTheDocument();
  });

  it("is disabled for a role that cannot write listings", async () => {
    useWorkspaceStore.setState({ permissions: ["inventory:read"] });
    renderPage();
    const channel = within(await screen.findByTestId("channel-panel"));
    expect(channel.getByRole("button", { name: "Retry sync" })).toBeDisabled();
    expect(channel.getByText("Your role cannot start a sync")).toBeInTheDocument();
  });
});
