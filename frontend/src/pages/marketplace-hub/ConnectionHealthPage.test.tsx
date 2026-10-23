import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import { FLIPKART, REVOKED, card, health, job, lane, summaryOf } from "@/test/hubFixtures";
import type { HubAccountCard, HubHealth, HubLane, HubSyncJob } from "@/types/hub";

const http = vi.hoisted(() => ({ health: vi.fn(), jobs: vi.fn() }));
const hub = vi.hoisted(() => ({ startSync: vi.fn(), syncStatus: vi.fn(), test: vi.fn(), retryJob: vi.fn(), cancelJob: vi.fn(), jobLogs: vi.fn(), connector: vi.fn(), reconnect: vi.fn(), update: vi.fn(), disconnect: vi.fn(), remove: vi.fn() }));
vi.mock("@/api/hub.api", () => ({ hubApi: hub }));
vi.mock("@/lib/session", () => ({ refreshShell: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/api/client", () => ({
  unwrap: (res: { data: { data: unknown } }) => res.data.data,
  client: {
    get: (url: string) => (url.includes("/marketplace-hub/health") ? http.health() : http.jobs()).then((data: unknown) => ({ data: { data } })),
  },
}));

import ConnectionHealthPage from "./ConnectionHealthPage";

const Where = () => {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
};

function renderPage(url = "/marketplace-hub/health") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/marketplace-hub/health" element={<ConnectionHealthPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const A = card({ marketplace: "amazon_in", name: "Acme Amazon" });
const idleLane = (key: string, label: string): HubLane => lane({ key, label, status: "idle", jobs: 0, finished: 0, failed: 0, successRate: null, itemsProcessed: 0, itemsPerHour: 0 });
const LANES: HubLane[] = [
  lane({ key: "orders", label: "Order ingestion", status: "healthy", jobs: 12, finished: 12, successRate: 100, itemsProcessed: 240, itemsPerHour: 10 }),
  lane({ key: "inventory", label: "Inventory sync", status: "healthy", jobs: 8, finished: 8, successRate: 100, itemsProcessed: 96, itemsPerHour: 4 }),
  lane({ key: "listings", label: "Catalog and listings", status: "healthy", jobs: 3, finished: 3, successRate: 100, itemsProcessed: 30, itemsPerHour: 1.3 }),
  idleLane("prices", "Price updates"),
];

const build = (cards: HubAccountCard[], over: Partial<HubHealth> = {}): HubHealth =>
  health({
    connections: cards,
    summary: summaryOf(cards),
    connectionsCount: cards.filter((c) => c.accountStatus === "active").length,
    dataFlowLanes: LANES,
    accountLanes: cards.map((c) => ({ accountId: c.id, lanes: LANES })),
    syncReliability: { windowHours: 24, finished: 23, failed: 0, successRate: 100 },
    overallPulseScore: 96,
    networkStatus: "optimal",
    generatedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    ...over,
  });

const grant = (...permissions: string[]) => useWorkspaceStore.setState({ permissions });
const loc = () => screen.getAllByTestId("where").at(-1)?.textContent;
const runs = (...js: HubSyncJob[]) => http.jobs.mockResolvedValue(js);

beforeEach(() => {
  vi.clearAllMocks();
  grant("marketplace_accounts:read", "marketplace_accounts:write", "sync:read", "sync:write");
  http.health.mockResolvedValue(build([A]));
  runs();
  hub.jobLogs.mockResolvedValue({ items: [], nextAfter: null });
});

describe("overview from the real hub health", () => {
  it("all healthy: the counts, the pulse score, the freshness and the lane numbers are the API's", async () => {
    http.health.mockResolvedValue(build([A, { ...A, id: "a2", name: "Second", marketplace: "flipkart" }]));
    renderPage();
    expect(await screen.findByText("Everything is flowing.")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText("Pulse score 96")).toBeInTheDocument();
    expect(screen.getByText(/100% sync success · last 24h \(23 runs\)/)).toBeInTheDocument();
    expect(screen.getByText("Last checked · 2 min ago")).toBeInTheDocument();
    expect(screen.getByText("240 orders")).toBeInTheDocument();
    expect(screen.getByText("96 inventory updates")).toBeInTheDocument();
    expect(screen.getByText("30 product updates")).toBeInTheDocument();
    expect(screen.getByText("100% success · 12 finished · 10 items/h")).toBeInTheDocument();
    expect(screen.getByText("2 endpoints")).toBeInTheDocument();
    expect(screen.getByText("STABLE")).toBeInTheDocument();
    // nothing invented
    expect(screen.queryByText(/99\.4|Meesho|18 min|5:42|Shopify order sync/)).not.toBeInTheDocument();
    expect(screen.getByText(/0 listings waiting for stock · 0 open orders/)).toBeInTheDocument();
  });

  it("the DNA is driven by the lanes: an idle lane says it has no data", async () => {
    http.health.mockResolvedValue(build([A], { dataFlowLanes: [LANES[0], LANES[1], idleLane("listings", "Catalog and listings")] }));
    renderPage();
    const dna = (await screen.findByText("Network health DNA")).closest("div.rounded-2xl") as HTMLElement;
    const cell = (label: string) => within(dna).getByText(label).closest("[data-status]") as HTMLElement;
    expect(cell("Orders")).toHaveAttribute("data-status", "healthy");
    expect(cell("Catalog")).toHaveAttribute("data-status", "idle");
    expect(within(cell("Catalog")).getByText("No runs in 24 h")).toBeInTheDocument();
    expect(cell("Authentication")).toHaveAttribute("data-status", "healthy");
  });

  it("a degraded connection: the friction card, the risk numbers and the delayed stream come from the data", async () => {
    const fk = { ...FLIPKART, marketplace: "flipkart" };
    http.health.mockResolvedValue(
      build([A, fk], {
        networkStatus: "degraded",
        dataFlowLanes: [LANES[0], lane({ key: "inventory", label: "Inventory sync", status: "warning", jobs: 5, finished: 5, failed: 1, successRate: 80, itemsProcessed: 20, itemsPerHour: 1 }), LANES[2]],
        accountLanes: [
          { accountId: A.id, lanes: LANES },
          { accountId: fk.id, lanes: [LANES[0], lane({ key: "inventory", label: "Inventory sync", status: "warning", jobs: 3, finished: 3, failed: 1, successRate: 66.7 }), LANES[2]] },
        ],
        atRisk: { staleStockListings: 4, problemListings: 2, openOrders: 5, accounts: [{ accountId: fk.id, name: fk.name, staleStockListings: 4, problemListings: 2, openOrders: 5 }] },
        syncReliability: { windowHours: 24, finished: 20, failed: 2, successRate: 90 },
      }),
    );
    renderPage();
    expect(await screen.findByText("Network friction")).toBeInTheDocument();
    expect(screen.getByText("1 connection needs attention")).toBeInTheDocument();
    expect(screen.getByText("6 listings affected")).toBeInTheDocument();
    expect(screen.getByText("2 sync runs failed in the last 24 hours")).toBeInTheDocument();
    const risk = screen.getByText("What is at risk").closest("div.rounded-2xl") as HTMLElement;
    expect(within(risk).getByText("4").nextSibling).toHaveTextContent("listings whose stock change is still waiting");
    expect(within(risk).getByText("5").nextSibling).toHaveTextContent("open orders on connections that need attention");
    expect(within(risk).getByText("2").nextSibling).toHaveTextContent("rejected or wants corrected");
    expect(screen.getByText(/Marketplace · Acme Flipkart delayed/)).toBeInTheDocument();
    expect(screen.queryByText("Everything is flowing.")).not.toBeInTheDocument();
  });

  it("a disconnected account is critical with the server's own reason", async () => {
    http.health.mockResolvedValue(build([A, REVOKED], { networkStatus: "degraded" }));
    renderPage();
    expect(await screen.findByText("One connection needs immediate attention")).toBeInTheDocument();
    expect(screen.getByText(/Old Amazon: The account was disconnected/)).toBeInTheDocument();
  });

  it("the data flow ticker shows the real runs with their account", async () => {
    runs(job({ id: "j1", type: "orders", status: "succeeded", marketplaceAccountId: A.id, createdAt: new Date().toISOString(), startedAt: new Date().toISOString() }), job({ id: "j2", type: "inventory", status: "failed", marketplaceAccountId: A.id, createdAt: new Date().toISOString(), startedAt: new Date().toISOString() }));
    renderPage();
    expect(await screen.findByText("Acme Amazon · Order import completed")).toBeInTheDocument();
    expect(screen.getByText("Acme Amazon · Inventory push failed")).toBeInTheDocument();
  });

  it("keeps the shown token problems: an expired token makes authentication critical", async () => {
    http.health.mockResolvedValue(build([A], { tokenWarnings: [{ accountId: A.id, name: A.name, marketplace: "amazon_in", daysLeft: -1, expired: true }] }));
    renderPage();
    const dna = (await screen.findByText("Network health DNA")).closest("div.rounded-2xl") as HTMLElement;
    expect(within(dna).getByText("Authentication").closest("[data-status]")).toHaveAttribute("data-status", "error");
    expect(within(dna).getByText("1 token expiring or expired")).toBeInTheDocument();
  });
});

describe("recovery: drawer and actions", () => {
  const fk = { ...FLIPKART, marketplace: "flipkart" };
  const degraded = () =>
    http.health.mockResolvedValue(
      build([A, fk], {
        atRisk: { staleStockListings: 4, problemListings: 0, openOrders: 2, accounts: [{ accountId: fk.id, name: fk.name, staleStockListings: 4, problemListings: 0, openOrders: 2 }] },
        accountLanes: [{ accountId: A.id, lanes: LANES }, { accountId: fk.id, lanes: [lane({ key: "inventory", label: "Inventory sync", status: "error", failed: 2, successRate: 50 })] }],
      }),
    );

  it("the drawer states what happened and the impact, and Retry sync starts the real sync", async () => {
    degraded();
    hub.startSync.mockResolvedValue({ accountId: fk.id, jobs: [{ scope: "orders", job: job({ id: "n1" }), created: true }], skipped: [] });
    hub.syncStatus.mockResolvedValue({ accountId: fk.id, state: "syncing", progress: null, active: [job({ id: "n1", status: "running" })], latest: [], lastSyncedAt: null, nextSyncAt: null });
    renderPage();
    await userEvent.click(await screen.findByTitle("Click to inspect Acme Flipkart"));
    const drawer = await screen.findByRole("complementary", { name: "Acme Flipkart recovery details" });
    expect(within(drawer).getAllByText("2 sync runs failed in the last 24 hours").length).toBeGreaterThan(0);
    expect(within(drawer).getByText(/At risk: 4 listings with stock waiting to reach the marketplace · 2 open orders/)).toBeInTheDocument();
    expect(within(drawer).getByText("Affected: Inventory")).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: "Retry sync" }));
    expect(hub.startSync).toHaveBeenCalledWith(fk.id, undefined);
    expect(await screen.findByText("Sync Acme Flipkart")).toBeInTheDocument();
  });

  it("a disconnected account offers Reconnect, which asks for the connector's credential fields", async () => {
    http.health.mockResolvedValue(build([A, REVOKED], { networkStatus: "degraded" }));
    hub.connector.mockResolvedValue({
      code: "amazon_in",
      displayName: "Amazon India",
      authFlow: { mode: "both", fields: [{ key: "sellerId", label: "Seller ID", type: "text", required: true, secret: false, pattern: null, help: null }], redirectFields: [], partnerGated: false, refreshable: true },
    });
    renderPage();
    await userEvent.click(await screen.findByTitle("Click to inspect Old Amazon"));
    const drawer = await screen.findByRole("complementary", { name: "Old Amazon recovery details" });
    await userEvent.click(within(drawer).getByRole("button", { name: "Reconnect" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByLabelText(/Seller ID/)).toBeInTheDocument();
  });

  it("test connection from the drawer shows the real steps", async () => {
    degraded();
    hub.test.mockResolvedValue({ ok: true, marketplace: "flipkart", mode: "live", checkedAt: "2026-10-23T10:00:00.000Z", steps: [{ name: "credentials", ok: true, skipped: false, durationMs: 5, message: "Connected" }] });
    renderPage();
    await userEvent.click(await screen.findByTitle("Click to inspect Acme Flipkart"));
    const drawer = await screen.findByRole("complementary", { name: "Acme Flipkart recovery details" });
    await userEvent.click(within(drawer).getByRole("button", { name: "Test connection" }));
    expect(hub.test).toHaveBeenCalledWith(fk.id);
    expect(await screen.findByText("Connected")).toBeInTheDocument();
  });

  it("a viewer can look but not act, and is told why", async () => {
    grant("marketplace_accounts:read", "sync:read");
    degraded();
    renderPage();
    expect(await screen.findByRole("status")).toHaveTextContent("read-only");
    await userEvent.click(await screen.findByTitle("Click to inspect Acme Flipkart"));
    const drawer = await screen.findByRole("complementary", { name: "Acme Flipkart recovery details" });
    expect(within(drawer).getByRole("button", { name: "Retry sync" }).closest("span")).toHaveAttribute("title", expect.stringContaining("marketplace_accounts:write"));
    expect(within(drawer).getByRole("button", { name: "Retry sync" })).toBeDisabled();
  });
});

describe("connections and recovery view (kept in the URL)", () => {
  const fk = { ...FLIPKART, marketplace: "flipkart", capabilityTags: ["product_import", "listings", "inventory", "orders"] };
  const data = () =>
    http.health.mockResolvedValue(
      build([A, fk], {
        atRisk: { staleStockListings: 4, problemListings: 0, openOrders: 2, accounts: [{ accountId: fk.id, name: fk.name, staleStockListings: 4, problemListings: 0, openOrders: 2 }] },
        accountLanes: [
          { accountId: A.id, lanes: LANES },
          { accountId: fk.id, lanes: [LANES[0], lane({ key: "inventory", label: "Inventory sync", status: "error", failed: 2, successRate: 50 }), idleLane("listings", "Catalog and listings")] },
        ],
      }),
    );

  it("the view, tab, search, area and sort are in the URL", async () => {
    data();
    renderPage();
    await screen.findByText("Network friction");
    await userEvent.click(screen.getAllByRole("button", { name: /View connections/ })[0]);
    expect(loc()).toBe("/marketplace-hub/health?view=recovery");
    expect(await screen.findByText("All connections")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Attention" }));
    expect(loc()).toContain("tab=attention");
    expect(screen.queryByText("Acme Amazon")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await userEvent.type(screen.getByLabelText("Search connections"), "amaz");
    expect(loc()).toContain("q=amaz");
    expect(screen.queryByText("Acme Flipkart")).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Search connections"));
    await userEvent.click(screen.getByRole("button", { name: "Inventory" }));
    expect(loc()).toContain("area=inventory");
    expect(screen.queryByText("Acme Amazon")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Sort connections"), "name");
    expect(loc()).toContain("sort=name");
  });

  it("restores the filters from the URL and shows each capability from the account's own lanes", async () => {
    data();
    renderPage("/marketplace-hub/health?view=recovery&sort=name");
    const table = (await screen.findByText("Connector")).closest("table") as HTMLElement;
    const rows = within(table).getAllByRole("row");
    const amazon = rows.find((r) => within(r).queryByText("Acme Amazon")) as HTMLElement;
    const flip = rows.find((r) => within(r).queryByText("Acme Flipkart")) as HTMLElement;
    expect(within(amazon).getAllByTitle("Healthy").length).toBeGreaterThanOrEqual(3);
    expect(within(flip).getByTitle("Failing")).toBeInTheDocument(); // inventory
    expect(within(flip).getByTitle("No runs in the last 24 hours")).toBeInTheDocument(); // catalog lane idle
    expect(within(flip).getByText(/Attention · 70%/)).toBeInTheDocument();
  });

  it("the timeline and the recovery callout are facts: real runs, real steps, Retry starts a real sync", async () => {
    data();
    runs(
      job({ id: "j1", type: "inventory", status: "failed", marketplaceAccountId: fk.id, createdAt: new Date(Date.now() - 20 * 60_000).toISOString(), error: { code: "UPSTREAM", message: "Marketplace refused" } }),
      job({ id: "j0", type: "orders", status: "succeeded", marketplaceAccountId: A.id, createdAt: new Date(Date.now() - 50 * 60_000).toISOString() }),
    );
    hub.startSync.mockResolvedValue({ accountId: fk.id, jobs: [{ scope: "orders", job: job({ id: "n1" }), created: true }], skipped: [] });
    hub.syncStatus.mockResolvedValue({ accountId: fk.id, state: "syncing", progress: null, active: [job({ id: "n1", status: "running" })], latest: [], lastSyncedAt: null, nextSyncAt: null });
    renderPage("/marketplace-hub/health?view=recovery");
    expect(await screen.findByText(/Latest sync failure: Acme Flipkart inventory push at .* \(Marketplace refused\)/)).toBeInTheDocument();
    const steps = screen.getByLabelText("Recovery steps");
    expect(steps).toHaveTextContent("Detected ✓");
    expect(steps).toHaveTextContent("Diagnosed ✓");
    expect(steps).toHaveTextContent("Verified ○");
    expect(steps).toHaveTextContent("Healthy ○");
    expect(screen.getByText(/At risk: 4 listings waiting for stock/)).toBeInTheDocument();
    const callout = steps.closest("div.rounded-xl") as HTMLElement;
    await userEvent.click(within(callout).getByRole("button", { name: "Retry" }));
    expect(hub.startSync).toHaveBeenCalledWith(fk.id, undefined);
  });

  it("a failed sync run can be retried and its log read, with the real endpoints", async () => {
    data();
    runs(job({ id: "j1", type: "inventory", status: "failed", marketplaceAccountId: fk.id, createdAt: new Date().toISOString(), error: { code: "UPSTREAM", message: "Marketplace refused" } }));
    hub.retryJob.mockResolvedValue(job({ id: "j1b" }));
    hub.jobLogs.mockResolvedValue({ items: [{ id: 1, level: "error", message: "refused by marketplace", createdAt: new Date().toISOString() }], nextAfter: null });
    renderPage("/marketplace-hub/health?view=recovery");
    const section = await screen.findByRole("region", { name: "Sync runs that need a look" });
    await userEvent.click(within(section).getByRole("button", { name: "Log" }));
    expect(await within(section).findByText(/refused by marketplace/)).toBeInTheDocument();
    await userEvent.click(within(section).getByRole("button", { name: "Retry" }));
    expect(hub.retryJob).toHaveBeenCalledWith("j1");
  });

  it("nothing to recover: says so and offers no retry", async () => {
    renderPage("/marketplace-hub/health?view=recovery");
    expect(await screen.findByText("No connection needs recovery.")).toBeInTheDocument();
    expect(screen.getByText("No sync runs in the last 24 hours.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});

describe("states", () => {
  it("shows the empty state when nothing is connected", async () => {
    http.health.mockResolvedValue(build([]));
    renderPage();
    expect(await screen.findByText("Connect a marketplace to begin")).toBeInTheDocument();
  });

  it("error with retry", async () => {
    http.health.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "health down", status: 500 }));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("health down");
    await userEvent.click(screen.getByRole("button", { name: /retry diagnostics/i }));
    expect(await screen.findByText("Everything is flowing.")).toBeInTheDocument();
  });

  it("the sync runs failing to load is shown, the rest still works", async () => {
    http.jobs.mockRejectedValue(new ApiError({ code: "INTERNAL", message: "jobs down", status: 500 }));
    renderPage();
    expect(await screen.findByText(/The sync runs could not be loaded \(jobs down\)/)).toBeInTheDocument();
    expect(screen.getByText("Everything is flowing.")).toBeInTheDocument();
  });

  it("refreshes on demand", async () => {
    renderPage();
    await screen.findByText("Everything is flowing.");
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(http.health.mock.calls.length).toBeGreaterThan(1));
  });
});
