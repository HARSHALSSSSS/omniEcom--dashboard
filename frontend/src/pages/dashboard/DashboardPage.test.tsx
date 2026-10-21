import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";
import { dashboardApi } from "@/api/dashboard.api";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import { greetingFor } from "@/components/dashboard/format";
import type { Dashboard } from "@/types/dashboard";

// jsdom has no ResizeObserver, recharts' ResponsiveContainer needs one
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

vi.mock("@/api/dashboard.api", () => ({
  dashboardApi: { get: vi.fn(), rejectRecommendation: vi.fn() },
}));

const get = vi.mocked(dashboardApi.get);
const reject = vi.mocked(dashboardApi.rejectRecommendation);

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const series = (n: number): Dashboard["sales"]["series"] =>
  Array.from({ length: n }, (_, i) => ({
    day: `2026-10-${String(20 - (n - 1 - i)).padStart(2, "0")}`,
    revenueMinor: (i + 1) * 100_00,
    previousRevenueMinor: (i + 1) * 50_00,
    orders: i,
  }));

const full = (over: Partial<Dashboard> = {}): Dashboard => ({
  asOf: "2026-10-20",
  generatedAt: new Date().toISOString(),
  greeting: { firstName: "Asha" },
  needsAttention: {
    items: [
      { issueKey: "low_stock", area: "inventory", title: "Low stock", summary: "18 products are running low on inventory", count: 18, action: { label: "Review inventory", href: "/inventory?health=low" } },
      { issueKey: "sync_issue", area: "channels", title: "Sync issue", summary: "2 channel connections need attention", count: 2, action: { label: "Check connections", href: "/channels" } },
    ],
  },
  recommendation: { id: "rec-1", kind: "replenish", severity: "medium", title: "Restock 6 products this week", rationale: "Based on recent sales velocity.", status: "open", actions: ["review", "dismiss"], recommendationOnly: true },
  snapshot: {
    period: "today",
    day: "2026-10-20",
    currency: "INR",
    metrics: [
      { key: "orders", value: 126, previous: 112, changePct: 12.5 },
      { key: "revenueMinor", value: 284_00_000, previous: 262_00_000, changePct: 8.4 },
      { key: "units", value: 1318, previous: 1200, changePct: -3.2 },
      { key: "returnRatePct", value: 4.8, previous: 0, changePct: null },
      { key: "lowStockProducts", value: 18, previous: null, changePct: null, note: "needs_review" },
    ],
  },
  sales: {
    period: "30d",
    currency: "INR",
    series: series(7),
    channelContribution: [
      { channel: { code: "amazon_in", name: "Amazon" }, revenueMinor: 1_24_000_00, orders: 40, sharePct: 62.5 },
      { channel: { code: "flipkart", name: "Flipkart" }, revenueMinor: 68_000_00, orders: 20, sharePct: 37.5 },
    ],
  },
  orderFlow: [
    { stage: "new", count: 24 }, { stage: "confirmed", count: 31 }, { stage: "picking", count: 12 },
    { stage: "packing", count: 18 }, { stage: "dispatched", count: 41 }, { stage: "delivered", count: 96 },
  ],
  inventoryHealth: {
    healthy: 403, low: 18, out: 6,
    mostAffected: [
      { productId: "p1", title: "Premium Travel Bag", sku: "TRV-1042", available: 4, status: "low" },
      { productId: "p2", title: "Cotton Overshirt", sku: "OS-2048", available: 0, status: "out" },
    ],
  },
  channelHealth: [
    { channel: { code: "amazon_in", name: "Amazon", accountId: "a1" }, health: "healthy", connection: "connected", lastSyncAt: minutesAgo(2), openIssues: 0, action: { key: "details", href: "/channels/a1" } },
    { channel: { code: "meesho", name: "Meesho", accountId: "a2" }, health: "attention", connection: "needs_attention", lastSyncAt: minutesAgo(18), openIssues: 2, action: { key: "review", href: "/channels/a2" } },
  ],
  sync: { lastSyncedAt: minutesAgo(2), systemStatus: "degraded" },
  ...over,
});

const empty = (): Dashboard => ({
  asOf: "2026-10-20",
  generatedAt: new Date().toISOString(),
  greeting: { firstName: null },
  needsAttention: { items: [] },
  recommendation: null,
  snapshot: {
    period: "today", day: "2026-10-20", currency: "INR",
    metrics: [
      { key: "orders", value: 0, previous: 0, changePct: null },
      { key: "revenueMinor", value: 0, previous: 0, changePct: null },
      { key: "units", value: 0, previous: 0, changePct: null },
      { key: "returnRatePct", value: 0, previous: 0, changePct: null },
      { key: "lowStockProducts", value: 0, previous: null, changePct: null, note: "ok" },
    ],
  },
  sales: { period: "30d", currency: "INR", series: series(7).map((p) => ({ ...p, revenueMinor: 0, previousRevenueMinor: 0, orders: 0 })), channelContribution: [] },
  orderFlow: ["new", "confirmed", "picking", "packing", "dispatched", "delivered"].map((stage) => ({ stage: stage as "new", count: 0 })),
  inventoryHealth: { healthy: 0, low: 0, out: 0, mostAffected: [] },
  channelHealth: [],
  sync: { lastSyncedAt: null, systemStatus: "operational" },
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function signIn(permissions = ["analytics:read", "ai:use"], features: Record<string, boolean> = { "ai.enabled": true }) {
  useWorkspaceStore.getState().setSession({
    user: { id: "u1", fullName: "Asha Admin", email: "a@x.test", businessName: "Nova", role: "owner" },
    permissions,
    shell: {
      user: { id: "u1", name: "Asha Admin", initials: "AA", roleLabel: "Business owner" },
      business: { id: "b1", name: "Nova", plan: "free", tier: "starter", timezone: "Asia/Kolkata" },
      badges: { needsAttention: 0, orders: 0, returns: 0, notifications: 0 },
      features,
    },
    onboardingStatus: "completed",
    onboardingResumeStep: "ready",
  });
}

beforeEach(() => {
  get.mockReset();
  reject.mockReset();
  useWorkspaceStore.getState().clearWorkspace();
  signIn();
});

afterEach(() => vi.useRealTimers());

describe("DashboardPage", () => {
  it("shows a loading skeleton first", () => {
    get.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByRole("status", { name: "Loading dashboard" })).toBeInTheDocument();
  });

  it("renders every section from the server data", async () => {
    get.mockResolvedValue(full());
    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), Asha\.$/ })).toBeInTheDocument();
    expect(screen.getByText("Today · Oct 20, 2026")).toBeInTheDocument();

    // needs attention rows with the API summary and a real app route
    expect(screen.getByText("18 products are running low on inventory")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review inventory →" })).toHaveAttribute("href", "/inventory?health=low");
    expect(screen.getByRole("link", { name: "Check connections →" })).toHaveAttribute("href", "/marketplace-hub");

    // recommendation
    expect(screen.getByRole("heading", { name: "Restock 6 products this week" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review recommendation" })).toHaveAttribute("href", "/recommendations");

    // snapshot: money, percent, vs yesterday wording
    const snapshot = screen.getByRole("region", { name: "Business snapshot" });
    expect(within(snapshot).getByText("126")).toBeInTheDocument();
    expect(within(snapshot).getByText("+12.5% vs yesterday")).toBeInTheDocument();
    expect(within(snapshot).getByText("₹2.84L")).toBeInTheDocument();
    expect(within(snapshot).getByText("1,318")).toBeInTheDocument();
    expect(within(snapshot).getByText("-3.2% vs yesterday")).toBeInTheDocument();
    expect(within(snapshot).getByText("4.8%")).toBeInTheDocument();
    expect(within(snapshot).getByText("No data yesterday to compare")).toBeInTheDocument();
    expect(within(snapshot).getByText("Needs review")).toBeInTheDocument();
    expect(snapshot.textContent).not.toMatch(/previous period/);

    // sales: channel split + accessible data table
    expect(screen.getByText("₹1.24L")).toBeInTheDocument();
    expect(screen.getByText("₹68.0K")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Amazon share of today's revenue" })).toHaveAttribute("aria-valuenow", "62.5");
    expect(screen.getByRole("img", { name: /Daily revenue from Oct 14, 2026 to Oct 20, 2026, total ₹2,800/ })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();

    // order flow
    const flow = screen.getByRole("region", { name: "Order flow" });
    expect(within(flow).getByText("Dispatched")).toBeInTheDocument();
    expect(within(flow).getByText("96")).toBeInTheDocument();
    expect(within(flow).getByRole("link", { name: "View all orders →" })).toHaveAttribute("href", "/orders");

    // inventory health
    expect(screen.getByText("Healthy / 403 products")).toBeInTheDocument();
    expect(screen.getByText("Low stock / 18 products")).toBeInTheDocument();
    expect(screen.getByText("Out of stock / 6 products")).toBeInTheDocument();
    expect(screen.getByText("Premium Travel Bag")).toBeInTheDocument();
    expect(screen.getByText("TRV-1042")).toBeInTheDocument();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();

    // channel health from real values
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Needs attention", { selector: "span.inline-flex" })).toBeInTheDocument();
    expect(screen.getByText("Last sync: 2 minutes ago")).toBeInTheDocument();
    expect(screen.getByText("Last sync: 18 minutes ago")).toBeInTheDocument();
    expect(screen.getByText("2 issues")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review →" })).toHaveAttribute("href", "/marketplace-hub");

    // footer
    expect(screen.getByText("Last synced 2 minutes ago")).toBeInTheDocument();
    expect(screen.getByText("Some connections need attention")).toBeInTheDocument();
  });

  it("shows honest zeros and empty states for a brand new business", async () => {
    get.mockResolvedValue(empty());
    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)\.$/ })).toBeInTheDocument();
    expect(screen.getByText("Nothing needs your attention right now.")).toBeInTheDocument();
    expect(screen.queryByText("Recommended action")).not.toBeInTheDocument();
    expect(screen.getAllByText("No data yesterday to compare")).toHaveLength(4);
    expect(screen.getByText("No action needed")).toBeInTheDocument();
    expect(screen.getByText("No sales on any channel today yet.")).toBeInTheDocument();
    expect(screen.getByText("No orders placed today yet")).toBeInTheDocument();
    expect(screen.getByText("No active products yet.")).toBeInTheDocument();
    expect(screen.getByText("Healthy / 0 products")).toBeInTheDocument();
    expect(screen.getByText(/No sales channel is connected yet/)).toBeInTheDocument();
    expect(screen.getByText("No channel has synced yet")).toBeInTheDocument();
    expect(screen.getByText("All systems operational")).toBeInTheDocument();
    expect(screen.queryByText("126")).not.toBeInTheDocument();
  });

  it("refetches with the chosen sales period and keeps the page on screen meanwhile", async () => {
    const user = userEvent.setup();
    get.mockResolvedValueOnce(full());
    let resolve: (d: Dashboard) => void = () => undefined;
    get.mockReturnValueOnce(new Promise<Dashboard>((r) => { resolve = r; }));
    renderPage();

    await screen.findByText("Business snapshot");
    expect(get.mock.calls[0]?.[0]).toBe("30d");
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(get.mock.calls[1]?.[0]).toBe("7d"));
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Business snapshot")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading dashboard" })).not.toBeInTheDocument();

    resolve(full({ sales: { ...full().sales, period: "7d" } }));
    await waitFor(() => expect(screen.getByRole("button", { name: "7 days" })).toBeEnabled());
  });

  it("dismisses the recommendation through the API and removes the card", async () => {
    const user = userEvent.setup();
    get.mockResolvedValueOnce(full()).mockResolvedValue(full({ recommendation: null }));
    reject.mockResolvedValue(undefined);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith("rec-1"));
    await waitFor(() => expect(screen.queryByText("Restock 6 products this week")).not.toBeInTheDocument());
  });

  it("keeps the recommendation and says so when dismiss fails", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(full());
    reject.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "You may not dismiss this", status: 409 }));
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(await screen.findByText("You may not dismiss this")).toBeInTheDocument();
    expect(screen.getByText("Restock 6 products this week")).toBeInTheDocument();
  });

  it("hides the recommendation without the ai permission or when the flag is off", async () => {
    get.mockResolvedValue(full());
    signIn(["analytics:read"], { "ai.enabled": true });
    const first = renderPage();
    await screen.findByText("Business snapshot");
    expect(screen.queryByText("Restock 6 products this week")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
    first.unmount();

    signIn(["analytics:read", "ai:use"], { "ai.enabled": false });
    renderPage();
    await screen.findByText("Business snapshot");
    expect(screen.queryByText("Restock 6 products this week")).not.toBeInTheDocument();
  });

  it("renders nothing for sections the API omitted", async () => {
    const data = full();
    delete data.needsAttention;
    delete data.orderFlow;
    delete data.inventoryHealth;
    delete data.channelHealth;
    delete data.sync;
    data.recommendation = null;
    data.snapshot.metrics = data.snapshot.metrics.filter((m) => m.key !== "lowStockProducts");
    get.mockResolvedValue(data);
    renderPage();

    await screen.findByText("Business snapshot");
    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
    expect(screen.queryByText("Order flow")).not.toBeInTheDocument();
    expect(screen.queryByText("Inventory health")).not.toBeInTheDocument();
    expect(screen.queryByText("Channel health")).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.queryByText("Low-stock products")).not.toBeInTheDocument();
    expect(screen.getByText("Sales performance")).toBeInTheDocument();
  });

  it("shows the error with a retry that refetches", async () => {
    const user = userEvent.setup();
    get.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "The server is down", status: 500 }));
    get.mockResolvedValue(full());
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("The server is down");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Business snapshot")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("greetingFor", () => {
  it("uses the time of day in the business time zone", () => {
    const at = new Date("2026-10-20T20:00:00Z"); // 01:30 next day in Kolkata, 16:00 in New York
    expect(greetingFor("Asha", "Asia/Kolkata", at)).toBe("Good morning, Asha.");
    expect(greetingFor("Asha", "America/New_York", at)).toBe("Good afternoon, Asha.");
    expect(greetingFor(null, "Pacific/Auckland", at)).toBe("Good morning.");
    expect(greetingFor(null, "America/Los_Angeles", new Date("2026-10-21T02:00:00Z"))).toBe("Good evening.");
  });
});
