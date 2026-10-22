import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { carriersOverview, counts, page, row, summary } from "@/test/shippingFixtures";
import { decision, decisionPage, exceptionsReport, method, methodsOverview, options, overview, rule, trackingItem, trackingPage } from "@/test/shippingWorkspaceFixtures";
import type { BulkLabelsResponse } from "@/types/shipping";

const api = vi.hoisted(() => ({
  summary: vi.fn(),
  shipments: vi.fn(),
  carriers: vi.fn(),
  providerCatalog: vi.fn(),
  methods: vi.fn(),
  addMethod: vi.fn(),
  patchMethod: vi.fn(),
  verifyCarrier: vi.fn(),
  capability: vi.fn(),
  warehouses: vi.fn(),
  decisions: vi.fn(),
  options: vi.fn(),
  select: vi.fn(),
  bulkOrders: vi.fn(),
  exportOrders: vi.fn(),
  overview: vi.fn(),
  sync: vi.fn(),
  syncJob: vi.fn(),
  latestSync: vi.fn(),
  shipmentRow: vi.fn(),
  createShipment: vi.fn(),
  dispatchShipment: vi.fn(),
  pickupSlots: vi.fn(),
  bookPickupSlot: vi.fn(),
  cancelPickupSlot: vi.fn(),
  exceptions: vi.fn(),
  exportExceptions: vi.fn(),
  trackingList: vi.fn(),
  trackingFailures: vi.fn(),
  syncTracking: vi.fn(),
  rules: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  ruleAction: vi.fn(),
  reorderRules: vi.fn(),
  bulkLabels: vi.fn(),
  label: vi.fn(),
  tracking: vi.fn(),
  refreshTracking: vi.fn(),
  cancelShipment: vi.fn(),
  ndrCases: vi.fn(),
  ndrAction: vi.fn(),
  manifests: vi.fn(),
}));
const saveBlob = vi.hoisted(() => vi.fn());
vi.mock("@/api/shipping.api", async (orig) => ({ ...(await orig<typeof import("@/api/shipping.api")>()), shippingApi: api }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob }));

import ShippingPage from "./ShippingPage";

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/shipping") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ShippingPage />
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
const lastQuery = () => api.shipments.mock.calls.at(-1)?.[0];
const SHIPMENTS = "/shipping?view=shipments";

const S1 = row();
const S2 = row({ id: "s2", number: "SHP-2", awb: "BD200002", carrier: "Blue Dart", orderNumber: "ORD-1002", status: "delivery_failed", statusLabel: "Delivery failed", paymentMethod: "prepaid", codAmountMinor: null, labelAvailable: false, lastEvent: null });

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("shipping:read", "shipping:write", "shipping:configure", "rules:read");
  api.summary.mockResolvedValue(summary());
  api.shipments.mockResolvedValue(page([S1, S2], { counts: counts() }));
  api.carriers.mockResolvedValue(carriersOverview());
  api.providerCatalog.mockResolvedValue([
    {
      code: "bluedart",
      name: "Blue Dart",
      description: "Blue Dart Apex",
      capabilities: { labels: true, polling: true, cancel: true, reattempt: true, rto: true, manifest: false },
      configFields: [{ key: "accountId", description: "Your account", required: true }],
    },
    {
      code: "custom",
      name: "Configured logistics provider",
      description: "A logistics provider you set up yourself",
      capabilities: { labels: true, polling: true, cancel: true, reattempt: true, rto: true, manifest: true },
      configFields: [
        { key: "carrierName", description: "Name", required: true },
        { key: "trackingUrlTemplate", description: "Public tracking page", required: true },
        { key: "apiKey", description: "Credential for the tracking API", required: false, secret: true },
      ],
    },
  ]);
  api.latestSync.mockResolvedValue(null);
  api.pickupSlots.mockResolvedValue({ items: [], today: "2026-10-21" });
  // the drawer loads its own shipment by id
  api.shipmentRow.mockImplementation(async (id: string) => (id === "s2" ? S2 : id === "s3" ? row({ id: "s3", awb: "DL3", status: "label_ready", statusLabel: "Label ready" }) : S1));
  api.warehouses.mockResolvedValue([{ id: "w1", code: "PUN", name: "Pune WH" }]);
  api.tracking.mockResolvedValue([{ id: 1, status: "in_transit", rawStatus: null, location: "Mumbai hub", note: null, source: "provider", occurredAt: "2026-10-20T08:00:00.000Z" }]);
  api.ndrCases.mockResolvedValue([]);
  api.manifests.mockResolvedValue([]);
  api.methods.mockResolvedValue(methodsOverview());
  api.overview.mockResolvedValue(overview());
  api.decisions.mockResolvedValue(decisionPage([decision(), decision({ fulfillmentId: "f2", number: "ORD-2002", orderId: "o2" })]));
  api.options.mockResolvedValue(options());
  api.exceptions.mockResolvedValue(exceptionsReport());
  api.trackingList.mockResolvedValue(trackingPage([trackingItem(), trackingItem({ shipmentId: "s3", number: "ORD-1003", awb: "DL3", status: "tracking_sync_failed", attention: "retry_required" })]));
  api.trackingFailures.mockResolvedValue([]);
  api.rules.mockResolvedValue({ items: [rule(), rule({ id: "r2", name: "Fallback", status: "disabled", priority: 2, ordersAffected: 0 })], total: 2, max: 100, fields: [], operators: [] });
});

describe("overview", () => {
  it("shows the pulse, the decision field, the availability comparison and the attention band from the API", async () => {
    renderPage();
    expect(await screen.findByText("Shipping Pulse")).toBeInTheDocument();
    expect(await screen.findByText("2 need a decision")).toBeInTheDocument();
    expect(screen.getByText("+4 since last sync")).toBeInTheDocument();
    expect(screen.getByText("−2 since last sync")).toBeInTheDocument();
    expect(screen.getAllByText("+0 since last sync")).toHaveLength(2);
    expect(screen.getByText("1 label unavailable")).toBeInTheDocument();
    expect(screen.getByText("1 tracking issue")).toBeInTheDocument();
    expect(screen.getByText(/2 connected channels · 2 shipping methods active · 3 orders need attention/)).toBeInTheDocument();
    // decision field row with the confirmed selection
    expect(screen.getByText("Amazon India Shipping ✓")).toBeInTheDocument();
    expect(screen.getByText("Default for Amazon India orders")).toBeInTheDocument();
    // availability comparison: honest wording
    expect(screen.getByText("Capability verified")).toBeInTheDocument();
    expect(screen.getByText("No active method configured")).toBeInTheDocument();
    expect(screen.getByText("2 undecided · 1 label · 1 sync")).toBeInTheDocument();
    // nothing in the design's hard-coded sample data
    expect(screen.queryByText(/illustrative/i)).toBeNull();
    expect(screen.queryByText("ORD-10482")).toBeNull();
  });

  it("opens the exception matrix, explains an exception and chooses shipping for its order", async () => {
    api.select.mockResolvedValue({ ...options(), unchanged: false });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /View exceptions/ }));
    expect(loc()).toContain("exceptions=1");
    expect(await screen.findByText("No shipping method selected")).toBeInTheDocument();
    expect(screen.getByText("What happened?")).toBeInTheDocument();
    expect(screen.getByText("Which order? ORD-2001")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Choose shipping for ORD-2002" }));
    await waitFor(() => expect(api.options).toHaveBeenCalledWith("f2", expect.anything()));
    const drawer = await screen.findByRole("dialog", { name: /Choose Shipping — ORD-2001/ });
    expect(within(drawer).getByText("Cotton cushion / CUS-014")).toBeInTheDocument();
    expect(within(drawer).getByText("☉ Recommended")).toBeInTheDocument();
    expect(within(drawer).getByText("Matches your default preference for Amazon India orders.")).toBeInTheDocument();
    expect(within(drawer).getByText(/Not available · not configured/)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: "Confirm Selection" }));
    await waitFor(() => expect(api.select).toHaveBeenCalledWith("f2", { kind: "marketplace", providerId: null, source: "recommended" }));
  });

  it("retries a failed tracking sync from the matrix", async () => {
    api.syncTracking.mockResolvedValue({ processed: 1, updated: 1, failed: 0, failures: [] });
    renderPage("/shipping?exceptions=1");
    await userEvent.click(await screen.findByRole("button", { name: "Retry sync →" }));
    await waitFor(() => expect(api.syncTracking).toHaveBeenCalledWith(["s3"]));
  });

  it("exports the exceptions as a file", async () => {
    api.exportExceptions.mockResolvedValue({ blob: new Blob(["x"]), fileName: "shipping-exceptions.csv" });
    renderPage("/shipping?exceptions=1");
    await userEvent.click(await screen.findByRole("button", { name: "Export exceptions" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "shipping-exceptions.csv"));
  });

  it("an overview error says so and retries", async () => {
    api.overview.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    renderPage();
    expect(await screen.findAllByText(/Shipping pulse could not be loaded/)).not.toHaveLength(0);
    await userEvent.click(screen.getAllByRole("button", { name: "Retry" })[0] as HTMLElement);
    expect(await screen.findByText("2 need a decision")).toBeInTheDocument();
  });
});

describe("sync shipping", () => {
  const syncJob = (over: Record<string, unknown> = {}) => ({ id: "j1", status: "queued", progress: { total: 0, done: 0, failed: 0 }, stats: {}, error: null, failureDetails: [], payload: { orders: 14 }, startedAt: null, finishedAt: null, ...over });

  it("starts a job, shows its real progress while it runs and then the real counts", async () => {
    api.sync.mockResolvedValue(syncJob());
    api.syncJob.mockResolvedValueOnce(syncJob({ status: "running", progress: { total: 20, done: 5, failed: 0 } }));
    api.syncJob.mockResolvedValue(syncJob({ status: "partially_failed", progress: { total: 20, done: 20, failed: 3 }, stats: { orders: 14, statuses: 13, processed: 14, updated: 11, requireAttention: 3 } }));
    renderPage();
    await screen.findByText("Shipping Pulse");
    await userEvent.click(screen.getByRole("button", { name: /Sync Shipping/ }));
    expect(await screen.findByText("Synchronizing shipping data…")).toBeInTheDocument();
    expect(await screen.findByText(/Shipping statuses: 5 \/ 20/)).toBeInTheDocument();
    expect(screen.getByText("Orders: 14")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Shipping sync progress" })).toHaveAttribute("aria-valuenow", "25");
    expect(api.syncJob).toHaveBeenCalledWith("j1", expect.anything());
    expect(await screen.findByText("Shipping sync complete", undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("14 processed")).toBeInTheDocument();
    expect(screen.getByText("11 updated")).toBeInTheDocument();
    expect(screen.getByText("3 require attention")).toBeInTheDocument();
    expect(screen.getByText(/3 exceptions from this sync only; Overview's 3 represent overall shipping attention/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss sync result" }));
    expect(screen.queryByText("Shipping sync complete")).toBeNull();
  });

  it("a job that failed says why; a running one is picked up again after a reload", async () => {
    api.sync.mockResolvedValue(syncJob());
    api.syncJob.mockResolvedValue(syncJob({ status: "failed", error: { code: "INTERNAL", message: "worker lost" } }));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Sync Shipping/ }));
    expect(await screen.findByText("Shipping sync did not complete")).toBeInTheDocument();
    expect(screen.getByText("worker lost")).toBeInTheDocument();
  });

  it("picks a running sync up after a page reload", async () => {
    api.latestSync.mockResolvedValue(syncJob({ status: "running", progress: { total: 8, done: 2, failed: 0 } }));
    api.syncJob.mockResolvedValue(syncJob({ status: "running", progress: { total: 8, done: 2, failed: 0 } }));
    renderPage();
    expect(await screen.findByText(/Shipping statuses: 2 \/ 8/)).toBeInTheDocument();
  });

  it("does not show a sync that finished in an earlier visit", async () => {
    api.latestSync.mockResolvedValue(syncJob({ status: "succeeded", stats: { processed: 1 } }));
    api.syncJob.mockResolvedValue(syncJob({ status: "succeeded", stats: { processed: 1 } }));
    renderPage();
    await screen.findByText("Shipping Pulse");
    expect(screen.queryByText("Shipping sync complete")).toBeNull();
  });

  it("a failed sync is explained", async () => {
    api.sync.mockRejectedValue(new ApiError({ code: "INTERNAL", message: "db down", status: 500 }));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Sync Shipping/ }));
    expect(await screen.findByText("Shipping sync did not complete")).toBeInTheDocument();
    expect(screen.getByText("db down")).toBeInTheDocument();
  });

  it("a viewer cannot sync", async () => {
    grant("shipping:read");
    renderPage();
    const button = await screen.findByRole("button", { name: /Sync Shipping/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Your role can view shipping but not change it.");
    for (const b of screen.getAllByRole("button", { name: "Add Provider" })) expect(b).toBeDisabled();
  });
});

describe("empty workspace", () => {
  it("nothing configured yet: the guided start offers the setup", async () => {
    api.methods.mockResolvedValue(methodsOverview({ items: [], capabilityMatrix: [], activeMethods: 0, summary: "0 active methods" }));
    renderPage();
    expect(await screen.findByText("Shipping is ready when you are.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Configure Shipping" }));
    expect(loc()).toContain("panel=carriers");
    expect(await screen.findByRole("dialog", { name: "Choose Shipping Method" })).toBeInTheDocument();
  });

  it("a viewer is told to ask an admin", async () => {
    grant("shipping:read");
    api.methods.mockResolvedValue(methodsOverview({ items: [], capabilityMatrix: [], activeMethods: 0 }));
    renderPage();
    expect(await screen.findByText(/Ask an admin of your business to configure shipping/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configure Shipping" })).toBeNull();
  });
});

describe("orders to ship", () => {
  it("lists packed orders with real values and writes filters to the URL", async () => {
    renderPage("/shipping?view=orders");
    expect(await screen.findByText("ORD-2001")).toBeInTheDocument();
    expect(screen.getAllByText("Pune, Maharashtra")).toHaveLength(2);
    expect(screen.getAllByText("0.65 kg")).toHaveLength(2);
    expect(screen.getAllByText("Needs Shipping Decision")).toHaveLength(2);
    expect(screen.getAllByText("Due in 2h 10m")).toHaveLength(2);
    expect(screen.getByText(/2 ready to ship/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Shipping method"), "seller");
    await userEvent.selectOptions(screen.getByLabelText("SLA"), "at_risk");
    expect(loc()).toContain("omethod=seller");
    expect(loc()).toContain("osla=at_risk");
    await waitFor(() => expect(api.decisions.mock.calls.at(-1)?.[0]).toMatchObject({ method: "seller", sla: "at_risk", page: 1 }));
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(loc()).toBe("/shipping?view=orders");
  });

  it("reads the filters and page from the URL", async () => {
    renderPage("/shipping?view=orders&oq=ORD&omarketplace=amazon_in&ostatus=exception&opage=2&osize=50");
    await screen.findByText("ORD-2001");
    expect(api.decisions.mock.calls.at(-1)?.[0]).toMatchObject({ q: "ORD", marketplace: "amazon_in", status: "exception", page: 2, pageSize: 50 });
  });

  it("a row action opens the Choose Shipping drawer of that order", async () => {
    renderPage("/shipping?view=orders");
    await userEvent.click(await screen.findByRole("button", { name: "Choose shipping ORD-2002" }));
    await waitFor(() => expect(api.options).toHaveBeenCalledWith("f2", expect.anything()));
    expect(await screen.findByRole("dialog", { name: /Choose Shipping/ })).toBeInTheDocument();
  });

  it("shows the design's action of every state: review choice, print label + dispatch, enter AWB, generate label", async () => {
    const act_ = (key: string, label: string) => ({ key, label, method: "POST" as const, href: "/x", enabled: true });
    api.decisions.mockResolvedValue(
      decisionPage([
        decision({ fulfillmentId: "f1", number: "ORD-3001", status: "selected", selectionConfirmed: true, selectedMethod: { kind: "third_party", name: "Shree Fleet", providerId: "m7" }, action: { key: "review", label: "Review choice", method: "GET", href: "/x", enabled: true }, secondaryActions: [act_("enter_awb", "Enter AWB")] }),
        decision({ fulfillmentId: "f2", number: "ORD-3002", status: "selected", selectionConfirmed: true, action: { key: "review", label: "Review choice", method: "GET", href: "/x", enabled: true }, secondaryActions: [act_("generate_label", "Generate label")] }),
        decision({ fulfillmentId: "f3", number: "ORD-3003", status: "ready_to_dispatch", shipmentId: "s9", action: act_("dispatch", "Dispatch"), secondaryActions: [{ ...act_("print_label", "Print label"), method: "GET" }] }),
        decision({ fulfillmentId: "f4", number: "ORD-3004", status: "label_pending", shipmentId: "s10", action: { key: "view_label", label: "View label", method: "GET", href: "/x", enabled: false } }),
      ]),
    );
    api.methods.mockResolvedValue(methodsOverview({ items: [method({ id: "m7", kind: "custom", providerCode: "custom:shree-fleet", name: "Shree Fleet" })] }));
    api.createShipment.mockResolvedValue({ id: "s11", awb: "SF123456" });
    api.dispatchShipment.mockResolvedValue({ id: "s9" });
    api.bulkOrders.mockResolvedValue({ action: "generate_labels", requested: 1, succeeded: 1, failed: 0, results: [{ fulfillmentId: "f2", number: "ORD-3002", ok: true, shipmentId: "s12", awb: "SBX1" }] });
    api.label.mockResolvedValue({ blob: new Blob(["x"]), fileName: "label.txt" });
    renderPage("/shipping?view=orders");
    expect(await screen.findByRole("button", { name: "Review choice ORD-3001" })).toBeInTheDocument();
    expect(screen.queryByText("View shipment")).toBeNull();
    expect(screen.getByRole("button", { name: "View label ORD-3004" })).toBeDisabled();
    // enter the AWB a configured logistics provider issued
    await userEvent.click(screen.getByRole("button", { name: "Enter AWB ORD-3001" }));
    const awb = await screen.findByRole("dialog", { name: /Enter AWB — ORD-3001/ });
    await userEvent.type(within(awb).getByLabelText("AWB"), "SF123456");
    await userEvent.click(within(awb).getByRole("button", { name: "Create label" }));
    await waitFor(() => expect(api.createShipment).toHaveBeenCalledWith({ fulfillmentId: "f1", providerCode: "custom:shree-fleet", awb: "SF123456" }));
    // generate the label of a confirmed order
    await userEvent.click(screen.getByRole("button", { name: "Generate label ORD-3002" }));
    await waitFor(() => expect(api.bulkOrders).toHaveBeenCalledWith(["f2"], "generate_labels", undefined));
    // print the label of a labelled order and dispatch it (asks first)
    await userEvent.click(screen.getByRole("button", { name: "Print label ORD-3003" }));
    await waitFor(() => expect(api.label).toHaveBeenCalledWith("s9"));
    await userEvent.click(screen.getByRole("button", { name: "Dispatch ORD-3003" }));
    const confirm = await screen.findByRole("dialog", { name: /Dispatch ORD-3003/ });
    await act(async () => {
      await userEvent.click(within(confirm).getByRole("button", { name: "Dispatch" }));
    });
    await waitFor(() => expect(api.dispatchShipment).toHaveBeenCalledWith("s9"));
  });

  it("Awaiting slot booking: Book slot opens the pickup drawer, books a slot and lists / cancels upcoming ones", async () => {
    const slot = { id: "p1", warehouse: { id: "w1", code: "PUN", name: "Pune WH" }, method: { id: "m1", name: "Delhivery", kind: "third_party", providerCode: "delhivery" }, date: "2026-10-23", windowStart: "10:00", windowEnd: "12:00", parcelCount: 3, status: "confirmed", mode: "provider", reference: "SBXPK1", note: null, cancellable: true, cancelledAt: null, createdAt: "2026-10-21T08:00:00.000Z" };
    api.decisions.mockResolvedValue(
      decisionPage([
        decision({ number: "ORD-4001", status: "selected", selectionConfirmed: true, selectedMethod: { kind: "third_party", name: "Delhivery", providerId: "m1" }, pickup: { state: "awaiting", methodId: "m1", warehouseId: "w1", slot: null }, action: { key: "book_slot", label: "Book slot", method: "POST", href: "/x", enabled: true }, secondaryActions: [{ key: "review", label: "Review choice", method: "GET", href: "/x", enabled: true }] }),
      ]),
    );
    api.pickupSlots.mockResolvedValue({ items: [slot], today: "2026-10-21" });
    api.bookPickupSlot.mockResolvedValue({ ...slot, id: "p2" });
    api.cancelPickupSlot.mockResolvedValue({ ...slot, status: "cancelled", cancellable: false });
    renderPage("/shipping?view=orders");
    await userEvent.click(await screen.findByRole("button", { name: "Book slot ORD-4001" }));
    expect(within(screen.getByRole("table")).getByText("Awaiting slot booking")).toBeInTheDocument();
    const drawer = await screen.findByRole("dialog", { name: "Book a pickup slot" });
    expect(within(drawer).getByLabelText("Shipping method")).toHaveValue("m1"); // what the row says is preset
    expect(within(drawer).getByLabelText("Warehouse")).toHaveValue("w1");
    expect(await within(drawer).findByText(/Confirmed with the carrier · SBXPK1/)).toBeInTheDocument();
    await userEvent.clear(within(drawer).getByLabelText("Parcels to collect"));
    await userEvent.type(within(drawer).getByLabelText("Parcels to collect"), "4");
    await userEvent.click(within(drawer).getByRole("button", { name: "Book slot" }));
    await waitFor(() => expect(api.bookPickupSlot).toHaveBeenCalledWith(expect.objectContaining({ warehouseId: "w1", methodId: "m1", windowStart: "10:00", windowEnd: "12:00", parcelCount: 4 })));
    await userEvent.click(within(drawer).getByRole("button", { name: /Cancel slot/ }));
    await waitFor(() => expect(api.cancelPickupSlot).toHaveBeenCalledWith("p1"));
  });

  it("Track dispatch: a dispatched order shows AWB assigned and opens the Tracking tab with that order", async () => {
    api.decisions.mockResolvedValue(
      decisionPage([decision({ number: "ORD-5001", status: "dispatched", shipmentId: "s5", selectionConfirmed: true, action: { key: "track_dispatch", label: "Track dispatch", method: "GET", href: "/x", enabled: true } })]),
    );
    renderPage("/shipping?view=orders");
    const track = await screen.findByRole("button", { name: "Track dispatch ORD-5001" });
    expect(within(screen.getByRole("table")).getByText("AWB assigned")).toBeInTheDocument();
    await userEvent.click(track);
    expect(loc()).toContain("view=tracking");
    expect(loc()).toContain("tq=ORD-5001");
    await waitFor(() => expect(api.trackingList.mock.calls.at(-1)?.[0]).toMatchObject({ q: "ORD-5001" }));
  });

  it("the header menu lists the upcoming pickup slots", async () => {
    renderPage("/shipping?view=orders");
    await userEvent.click(await screen.findByRole("button", { name: "More shipping actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Pickup slots/ }));
    const drawer = await screen.findByRole("dialog", { name: "Book a pickup slot" });
    expect(await within(drawer).findByText("No pickup slot is booked yet.")).toBeInTheDocument();
  });

  it("a manual choice is a manual override", async () => {
    api.select.mockResolvedValue({ ...options(), unchanged: false });
    renderPage("/shipping?view=orders");
    await userEvent.click(await screen.findByRole("button", { name: "Choose shipping ORD-2001" }));
    const drawer = await screen.findByRole("dialog", { name: /Choose Shipping — ORD-2001/ });
    await userEvent.click(await within(drawer).findByRole("radio", { name: /Seller Shipping/ }));
    expect(within(drawer).getByText(/manual override: Amazon India Shipping is the recommended method/)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: "Confirm Selection" }));
    await waitFor(() => expect(api.select).toHaveBeenCalledWith("f1", { kind: "seller", providerId: null, source: "manual_override" }));
  });

  it("bulk: recalculates the selected orders and lists the ones that failed", async () => {
    api.bulkOrders.mockResolvedValue({ action: "recalculate", requested: 2, succeeded: 1, failed: 1, results: [{ fulfillmentId: "f1", number: "ORD-2001", ok: true }, { fulfillmentId: "f2", number: "ORD-2002", ok: false, message: "No shipping decision to make" }] });
    renderPage("/shipping?view=orders");
    await screen.findByText("ORD-2001");
    expect(screen.getByRole("button", { name: "Recalculate shipping option" })).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Select all orders on this page"));
    expect(screen.getByText("2 orders selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Recalculate shipping option" }));
    expect(api.bulkOrders).toHaveBeenCalledWith(["f1", "f2"], "recalculate", undefined);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("No shipping decision to make")).toBeInTheDocument();
    expect(within(dialog).getByText(/1 of 2 orders done, 1 could not be processed/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.getByText("1 order selected")).toBeInTheDocument();
  });

  it("bulk: assigns one method to the selected orders", async () => {
    api.bulkOrders.mockResolvedValue({ action: "assign_method", requested: 1, succeeded: 1, failed: 0, results: [{ fulfillmentId: "f1", number: "ORD-2001", ok: true }] });
    renderPage("/shipping?view=orders");
    await userEvent.click(await screen.findByLabelText("Select order ORD-2001"));
    await userEvent.click(screen.getByRole("button", { name: "Assign shipping method" }));
    const drawer = await screen.findByRole("dialog", { name: /1 orders selected/ });
    await userEvent.click(within(drawer).getByRole("radio", { name: /Seller shipping/ }));
    await userEvent.click(within(drawer).getByRole("button", { name: "Confirm Selection" }));
    await waitFor(() => expect(api.bulkOrders).toHaveBeenCalledWith(["f1"], "assign_method", { kind: "seller" }));
  });

  it("exports with the current filters", async () => {
    api.exportOrders.mockResolvedValue({ blob: new Blob(["x"]), fileName: "orders-to-ship.csv" });
    renderPage("/shipping?view=orders&omethod=seller");
    await userEvent.click(await screen.findByRole("button", { name: "Export" }));
    await waitFor(() => expect(api.exportOrders).toHaveBeenCalledWith(expect.objectContaining({ method: "seller" })));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "orders-to-ship.csv"));
  });

  it("a viewer can look but not select or change", async () => {
    grant("shipping:read");
    renderPage("/shipping?view=orders");
    await screen.findByText("ORD-2001");
    expect(screen.getByLabelText("Select all orders on this page")).toBeDisabled();
    expect(screen.getByLabelText("Select order ORD-2001")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Assign shipping method" })).toBeDisabled();
  });

  it("states: error with retry, no match and nothing waiting", async () => {
    api.decisions.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "db down", status: 500 }));
    const view = renderPage("/shipping?view=orders");
    expect(await screen.findByText("Orders to ship could not be loaded.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("ORD-2001")).toBeInTheDocument();
    view.unmount();
    api.decisions.mockResolvedValue(decisionPage([]));
    const second = renderPage("/shipping?view=orders&ostatus=exception");
    expect(await screen.findByText("No orders match these filters.")).toBeInTheDocument();
    second.unmount();
    renderPage("/shipping?view=orders");
    expect(await screen.findByText("No orders are waiting to ship.")).toBeInTheDocument();
  });
});

describe("shipping methods", () => {
  it("shows the configured methods, their details and the capability matrix", async () => {
    renderPage("/shipping?view=methods");
    expect(await screen.findByText("Connected Shipping Methods")).toBeInTheDocument();
    expect(screen.getByText("Configured · active")).toBeInTheDocument();
    expect(screen.getByText("Requires configuration", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Delhivery (delhivery)")).toBeInTheDocument();
    expect(screen.getByText("34 shipped · 10 in transit")).toBeInTheDocument();
    expect(screen.getByText("Capability matrix")).toBeInTheDocument();
    expect(screen.getByText("Not supported by connector")).toBeInTheDocument();
    expect(screen.getByText("1 active method")).toBeInTheDocument();
    expect(screen.queryByText(/Self-Fulfilled Express/)).toBeNull();
  });

  it("sets a default, disables and verifies the selected method", async () => {
    api.patchMethod.mockResolvedValue(method());
    api.verifyCarrier.mockResolvedValue({ ok: false, checks: [{ key: "x", ok: false, message: "The provider is not available." }] });
    renderPage("/shipping?view=methods");
    await userEvent.click(await screen.findByRole("button", { name: /Seller Shipping/ }));
    await userEvent.click(screen.getByRole("button", { name: "Set as default" }));
    await waitFor(() => expect(api.patchMethod).toHaveBeenCalledWith("m2", { isDefault: true }));
    await userEvent.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() => expect(api.patchMethod).toHaveBeenCalledWith("m2", { active: false }));
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(api.verifyCarrier).toHaveBeenCalledWith("m2"));
    expect(await screen.findByText("The provider is not available.", { selector: "p" })).toBeInTheDocument();
  });

  it("view capability loads what the connector declares", async () => {
    api.capability.mockResolvedValue({ methodId: "m1", kind: "third_party", name: "Delhivery", verified: true, verifiedAt: "2026-10-20T08:00:00.000Z", source: "provider:delhivery", capabilities: [{ key: "label", value: "supported", declared: true, note: "x" }, { key: "statusSync", value: "not_supported", declared: false, note: "Not supported by connector" }] });
    renderPage("/shipping?view=methods");
    await userEvent.click(await screen.findByRole("button", { name: "View capability" }));
    expect(await screen.findByText(/source provider:delhivery/)).toBeInTheDocument();
    expect(api.capability).toHaveBeenCalledWith("m1", expect.anything());
  });

  it("configure saves the settings and then checks them", async () => {
    api.providerCatalog.mockResolvedValue([{ code: "delhivery", name: "Delhivery", description: "d", configFields: [{ key: "token", description: "API token", required: true }] }]);
    api.patchMethod.mockResolvedValue(method());
    api.verifyCarrier.mockResolvedValue({ ok: true, checks: [] });
    renderPage("/shipping?view=methods");
    await userEvent.click(await screen.findByRole("button", { name: "Configure" }));
    const drawer = await screen.findByRole("dialog", { name: "Configure Delhivery" });
    await userEvent.type(await within(drawer).findByLabelText("token"), "abc");
    await userEvent.click(within(drawer).getByRole("button", { name: "Save and verify" }));
    await waitFor(() => expect(api.patchMethod).toHaveBeenCalledWith("m1", { label: "Delhivery", supportedOrderTypes: ["prepaid", "cod"], config: { token: "abc" } }));
    await waitFor(() => expect(api.verifyCarrier).toHaveBeenCalledWith("m1"));
  });

  it("a viewer sees the methods but every change is disabled with the reason", async () => {
    grant("shipping:read");
    renderPage("/shipping?view=methods");
    const configure = await screen.findByRole("button", { name: "Configure" });
    expect(configure).toBeDisabled();
    expect(configure).toHaveAttribute("title", "Only an admin can set up shipping methods and rules.");
    expect(screen.getByRole("button", { name: "Disable" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "View capability" })).toBeEnabled();
  });

  it("adds a third-party provider through its declared fields", async () => {
    api.addMethod.mockResolvedValue({ method: { id: "m5", name: "Blue Dart" }, verify: { ok: true, checks: [] } });
    renderPage("/shipping?panel=carriers");
    const drawer = await screen.findByRole("dialog", { name: "Choose Shipping Method" });
    await userEvent.click(within(drawer).getByRole("radio", { name: /Supported third-party provider/ }));
    await userEvent.selectOptions(await within(drawer).findByLabelText("Provider"), "bluedart");
    await userEvent.type(within(drawer).getByLabelText("accountId"), "ACC-1");
    // the provider has no manifest feature: its capability reads as unsupported before any check
    expect(within(drawer).getByText("Not supported by connector")).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: "Configure method" }));
    await waitFor(() => expect(api.addMethod).toHaveBeenCalledWith(expect.objectContaining({ kind: "third_party", providerCode: "bluedart", config: { accountId: "ACC-1" } })));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === "Blue Dart added")).toBe(true));
  });

  it("adds seller shipping and marketplace shipping for a connected marketplace", async () => {
    api.methods.mockResolvedValue(methodsOverview({ items: [method()] }));
    api.addMethod.mockResolvedValue({ method: { id: "m6", name: "Amazon India Shipping" }, verify: { ok: true, checks: [] } });
    renderPage("/shipping?panel=carriers");
    const drawer = await screen.findByRole("dialog", { name: "Choose Shipping Method" });
    await userEvent.selectOptions(await within(drawer).findByLabelText("Marketplace"), "amazon_in");
    await userEvent.click(within(drawer).getByRole("button", { name: "Configure method" }));
    await waitFor(() => expect(api.addMethod).toHaveBeenCalledWith(expect.objectContaining({ kind: "marketplace", channelCode: "amazon_in" })));
  });

  it("adds a configured logistics provider: its name, tracking page and a credential that is masked while typing", async () => {
    api.addMethod.mockResolvedValue({ method: { id: "m8", name: "Shree Fleet" }, verify: { ok: true, checks: [] } });
    renderPage("/shipping?view=methods");
    const [header] = await screen.findAllByRole("button", { name: "Add Provider" });
    await userEvent.click(header as HTMLElement);
    const drawer = await screen.findByRole("dialog", { name: "Choose Shipping Method" });
    // the design's fourth card
    await userEvent.click(within(drawer).getByRole("radio", { name: /Configured logistics provider/ }));
    const add = within(drawer).getByRole("button", { name: "Configure method" });
    expect(add).toBeDisabled(); // a name and the tracking page are required
    await userEvent.type(within(drawer).getByLabelText("Provider name"), "Shree Fleet");
    expect(within(drawer).queryByLabelText("carrierName")).toBeNull(); // the name is asked once
    expect(within(drawer).getByLabelText("apiKey")).toHaveAttribute("type", "password");
    await userEvent.type(within(drawer).getByLabelText("trackingUrlTemplate"), "https://track.example/{{awb}");
    await userEvent.type(within(drawer).getByLabelText("apiKey"), "k-1");
    await userEvent.click(add);
    await waitFor(() => expect(api.addMethod).toHaveBeenCalledWith({ kind: "custom", label: "Shree Fleet", config: { trackingUrlTemplate: "https://track.example/{awb}", apiKey: "k-1" } }));
  });

  it("explains a failed check after adding", async () => {
    api.addMethod.mockResolvedValue({ method: { id: "m5", name: "Seller Shipping" }, verify: { ok: false, checks: [{ key: "config", ok: false, message: "accountId is wrong." }] } });
    api.methods.mockResolvedValue(methodsOverview({ items: [method()] }));
    renderPage("/shipping?panel=carriers");
    const drawer = await screen.findByRole("dialog", { name: "Choose Shipping Method" });
    await userEvent.click(within(drawer).getByRole("radio", { name: /Seller shipping/ }));
    await userEvent.click(within(drawer).getByRole("button", { name: "Configure method" }));
    expect(await within(drawer).findByRole("alert")).toHaveTextContent("accountId is wrong.");
  });

  it("a user without shipping:configure cannot add, with the reason on the control", async () => {
    grant("shipping:read");
    renderPage("/shipping?panel=carriers");
    const drawer = await screen.findByRole("dialog", { name: "Choose Shipping Method" });
    const add = within(drawer).getByRole("button", { name: "Configure method" });
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute("title", "Only an admin can set up shipping methods and rules.");
  });
});

describe("rules", () => {
  it("shows IF / AND / THEN with real priority and impact", async () => {
    renderPage("/shipping?view=rules");
    expect(await screen.findByText("Marketplace = amazon_in")).toBeInTheDocument();
    expect(screen.getByText(/Order value > ₹1,000/)).toBeInTheDocument();
    expect(screen.getByText("Prefer = Delhivery")).toBeInTheDocument();
    expect(screen.getByText("Priority 1 · 18 orders affected")).toBeInTheDocument();
    expect(screen.queryByText(/illustrative/i)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Fallback" }));
    expect(screen.getByText("Priority 2 · 0 orders affected")).toBeInTheDocument();
  });

  it("enables, duplicates, moves and deletes", async () => {
    api.ruleAction.mockResolvedValue(rule({ id: "r3" }));
    api.reorderRules.mockResolvedValue({ items: [], total: 2, max: 100, fields: [], operators: [] });
    api.deleteRule.mockResolvedValue({ id: "r2", deleted: true });
    renderPage("/shipping?view=rules");
    await userEvent.click(await screen.findByRole("button", { name: "Enable Fallback" }));
    await waitFor(() => expect(api.ruleAction).toHaveBeenCalledWith("r2", "enable"));
    await userEvent.click(screen.getByRole("button", { name: "Duplicate Fallback" }));
    await waitFor(() => expect(api.ruleAction).toHaveBeenCalledWith("r2", "duplicate"));
    await userEvent.click(screen.getByRole("button", { name: "Move Fallback up" }));
    await waitFor(() => expect(api.reorderRules).toHaveBeenCalledWith(["r2", "r1"]));
    await userEvent.click(screen.getByRole("button", { name: "Fallback" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this rule?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete rule" }));
    await waitFor(() => expect(api.deleteRule).toHaveBeenCalledWith("r2"));
  });

  it("creates a rule from conditions with real values (money in minor units, weight in grams)", async () => {
    api.createRule.mockResolvedValue(rule());
    renderPage("/shipping?view=rules");
    await userEvent.click(await screen.findByRole("button", { name: "Create Shipping Rule" }));
    const drawer = await screen.findByRole("dialog", { name: "Create Shipping Rule" });
    await userEvent.type(within(drawer).getByLabelText("Rule name"), "Big Amazon orders");
    // the design's two fixed conditions at the top, then the nested condition (Order value by default) and added ones
    await userEvent.selectOptions(within(drawer).getByLabelText("Marketplace"), "amazon_in");
    await userEvent.selectOptions(within(drawer).getByLabelText("Warehouse"), "PUN");
    await userEvent.type(within(drawer).getByLabelText("Value 1"), "1500.50");
    await userEvent.click(within(drawer).getByRole("button", { name: "Weight" }));
    await userEvent.type(within(drawer).getByLabelText("Value 2"), "2");
    await userEvent.selectOptions(within(drawer).getByLabelText("Preferred shipping method"), "third_party:m1");
    await userEvent.click(within(drawer).getByRole("button", { name: "Save Rule" }));
    await waitFor(() =>
      expect(api.createRule).toHaveBeenCalledWith({
        name: "Big Amazon orders",
        enabled: true,
        conditions: [
          { field: "marketplace", op: "eq", value: "amazon_in" },
          { field: "warehouse", op: "eq", value: "PUN" },
          { field: "orderValueMinor", op: "gt", value: 150050 },
          { field: "weightGrams", op: "gt", value: 2000 },
        ],
        then: { prefer: { kind: "third_party", providerId: "m1" } },
      }),
    );
  });

  it("asks for a name and a value before saving, and shows the server's reason", async () => {
    api.createRule.mockRejectedValue(new ApiError({ code: "VALIDATION_ERROR", message: "bad", status: 400, details: { issues: [{ path: "conditions[0].value", message: "expected a string" }] } }));
    renderPage("/shipping?view=rules");
    await userEvent.click(await screen.findByRole("button", { name: "Create Shipping Rule" }));
    const drawer = await screen.findByRole("dialog", { name: "Create Shipping Rule" });
    await userEvent.click(within(drawer).getByRole("button", { name: "Save Rule" }));
    expect(within(drawer).getByText(/Give the rule a name/)).toBeInTheDocument();
    expect(api.createRule).not.toHaveBeenCalled();
    await userEvent.type(within(drawer).getByLabelText("Rule name"), "Rule");
    await userEvent.click(within(drawer).getByRole("button", { name: "Save Rule" }));
    expect(api.createRule).not.toHaveBeenCalled(); // the nested condition has no value yet
    expect(within(drawer).getByText("Enter a number.")).toBeInTheDocument();
    await userEvent.type(within(drawer).getByLabelText("Value 1"), "10");
    await userEvent.click(within(drawer).getByRole("button", { name: "Save Rule" }));
    expect(await within(drawer).findByRole("alert")).toHaveTextContent("expected a string");
  });

  it("edits a rule", async () => {
    api.updateRule.mockResolvedValue(rule());
    renderPage("/shipping?view=rules");
    await userEvent.click(await screen.findByRole("button", { name: "Edit Amazon · Pune preference" }));
    const drawer = await screen.findByRole("dialog", { name: "Edit Shipping Rule" });
    expect(within(drawer).getByLabelText("Marketplace")).toHaveValue("amazon_in"); // shown in the fixed Marketplace field when editing
    expect(within(drawer).getByLabelText("Value 1")).toHaveValue("1000");
    await userEvent.clear(within(drawer).getByLabelText("Rule name"));
    await userEvent.type(within(drawer).getByLabelText("Rule name"), "Renamed");
    await userEvent.click(within(drawer).getByRole("button", { name: "Save Rule" }));
    await waitFor(() => expect(api.updateRule).toHaveBeenCalledWith("r1", expect.objectContaining({ name: "Renamed", conditions: expect.arrayContaining([{ field: "marketplace", op: "eq", value: "amazon_in" }, { field: "orderValueMinor", op: "gt", value: 100000 }]) })));
  });

  it("a viewer can read the rules but not change them; without rules:read it says so", async () => {
    grant("shipping:read", "rules:read");
    const view = renderPage("/shipping?view=rules");
    expect(await screen.findByText("Prefer = Delhivery")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Shipping Rule" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit Amazon · Pune preference" })).toBeDisabled();
    view.unmount();
    grant("shipping:read");
    renderPage("/shipping?view=rules");
    expect(await screen.findByText("Your role cannot view shipping rules.")).toBeInTheDocument();
  });
});

describe("tracking", () => {
  it("lists dispatched shipments with the derived status and what needs attention", async () => {
    renderPage("/shipping?view=tracking");
    expect(await screen.findByText("DL100001")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("In Transit")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Sync Failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry required" })).toBeInTheDocument();
    expect(screen.getByText("Dispatched").parentElement).toHaveTextContent("1");
  });

  it("retries one shipment and syncs everything", async () => {
    api.syncTracking.mockResolvedValue({ processed: 1, updated: 0, failed: 1, failures: [] });
    renderPage("/shipping?view=tracking");
    await userEvent.click(await screen.findByRole("button", { name: "Retry required" }));
    await waitFor(() => expect(api.syncTracking).toHaveBeenCalledWith(["s3"]));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === "Tracking sync finished with failures")).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Sync Tracking" }));
    await waitFor(() => expect(api.syncTracking).toHaveBeenLastCalledWith(undefined));
  });

  it("the attention card describes the failure, counts the others and can be dismissed", async () => {
    api.trackingFailures.mockResolvedValue([
      { shipmentId: "s3", orderId: "o3", orderNumber: "ORD-1003", awb: "DL3", failedAt: "2026-10-20T08:00:00.000Z", whatFailed: "The latest tracking status was not received.", possibleReason: "Connector timeout.", action: { key: "retry", label: "Retry", method: "POST", href: "/x" } },
      { shipmentId: "s4", orderId: "o4", orderNumber: "ORD-1004", awb: "DL4", failedAt: null, whatFailed: "The latest tracking status was not received.", possibleReason: "Connector timeout.", action: { key: "retry", label: "Retry", method: "POST", href: "/x" } },
    ]);
    api.syncTracking.mockResolvedValue({ processed: 1, updated: 1, failed: 0, failures: [] });
    renderPage("/shipping?view=tracking");
    expect(await screen.findByText("Tracking sync needs attention")).toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
    expect(screen.getByText("ORD-1003 · Sync failed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.syncTracking).toHaveBeenCalledWith(["s3"]));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss alert" }));
    expect(screen.getByText("ORD-1004 · Sync failed")).toBeInTheDocument();
  });

  it("filters go to the URL and opening a row opens the tracking drawer", async () => {
    renderPage("/shipping?view=tracking&tstatus=in_transit&tpage=2");
    await screen.findByText("DL100001");
    expect(api.trackingList.mock.calls.at(-1)?.[0]).toMatchObject({ status: "in_transit", page: 2 });
    await userEvent.selectOptions(screen.getByLabelText("Marketplace"), "amazon_in");
    expect(loc()).toContain("tmarketplace=amazon_in");
    expect(loc()).not.toContain("tpage");
    await userEvent.click(screen.getByRole("button", { name: "Open tracking DL100001" }));
    expect(loc()).toContain("drawer=shipment%3As1");
    expect(await screen.findByText("In transit", { selector: "p" })).toBeInTheDocument();
  });

  it("states: nothing tracked yet", async () => {
    api.trackingList.mockResolvedValue(trackingPage([]));
    renderPage("/shipping?view=tracking");
    expect(await screen.findByText("No shipment is being tracked yet.")).toBeInTheDocument();
  });
});

describe("workspace tabs", () => {
  it("switches the view through the URL", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("tab", { name: "Rules" }));
    expect(loc()).toBe("/shipping?view=rules");
    await userEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(loc()).toBe("/shipping?view=overview");
    await userEvent.click(screen.getByRole("tab", { name: "Shipments" }));
    expect(loc()).toBe("/shipping?view=shipments");
  });

  it("an old deep link with shipment filters lands on the shipments", async () => {
    renderPage("/shipping?filter[group]=ndr");
    await screen.findByText("DL100001");
    expect(screen.getByRole("tab", { name: "Shipments" })).toHaveAttribute("aria-selected", "true");
  });

  it("the manifests panel is reachable from the more menu", async () => {
    api.manifests.mockResolvedValue([{ id: "mf1", number: "MAN-1", warehouseId: "w1", providerCode: "delhivery", status: "dispatched", closedAt: null, dispatchedAt: "2026-10-20T08:00:00.000Z", shipmentCount: 4, createdAt: "2026-10-20T07:00:00.000Z" }]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "More shipping actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Manifests" }));
    expect(await screen.findByText("MAN-1")).toBeInTheDocument();
    expect(loc()).toContain("panel=manifests");
  });
});

describe("shipments: ribbon", () => {
  it("shows per-carrier numbers and a dash for what is unknown", async () => {
    renderPage(SHIPMENTS);
    const cards = await screen.findAllByTestId("carrier-card");
    expect(cards).toHaveLength(2);
    const [first, second] = cards as [HTMLElement, HTMLElement];
    expect(within(first).getByText("34 AWBs")).toBeInTheDocument();
    expect(within(first).getByText("98.2% on time")).toBeInTheDocument();
    expect(within(second).getByText("— on time")).toBeInTheDocument();
    expect(within(second).getByText("—", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("2 shipments")).toBeInTheDocument();
  });

  it("changes the window through the URL and shows an error with retry", async () => {
    api.summary.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    renderPage(SHIPMENTS);
    expect(await screen.findByText(/Carrier performance could not be loaded/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findAllByTestId("carrier-card")).toHaveLength(2);
    await userEvent.selectOptions(screen.getByLabelText("Performance window"), "90");
    expect(loc()).toContain("days=90");
    await waitFor(() => expect(api.summary).toHaveBeenLastCalledWith(90, expect.anything()));
  });
});

describe("shipments: table, tabs and URL state", () => {
  it("renders rows with the last event and counts per group", async () => {
    renderPage(SHIPMENTS);
    expect(await screen.findByText("DL100001")).toBeInTheDocument();
    expect(screen.getByText(/Mumbai hub/)).toBeInTheDocument();
    expect(screen.getAllByText("411001")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: /Delivery failed \(NDR\)/ })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /All shipments/ })).toHaveTextContent("3");
  });

  it("reads filters from the URL (filter[...] aliases too) into the query", async () => {
    renderPage("/shipping?view=shipments&filter[group]=ndr&carrier=Delhivery&filter[payment]=cod&filter[labelAvailable]=true&from=2026-10-01&to=2026-10-05&page=2&size=50&q=DL1");
    await screen.findByText("DL100001");
    expect(lastQuery()).toEqual({ group: "ndr", carrier: "Delhivery", payment: "cod", labelAvailable: true, from: "2026-10-01", to: "2026-10-05", q: "DL1", page: 2, pageSize: 50, status: undefined, warehouseId: undefined });
    expect(screen.getByRole("tab", { name: /Delivery failed/ })).toHaveAttribute("aria-selected", "true");
  });

  it("a group tab and the filters write to the URL and reset the page", async () => {
    renderPage("/shipping?view=shipments&page=3");
    await screen.findByText("DL100001");
    await userEvent.click(screen.getByRole("tab", { name: /In transit/ }));
    expect(loc()).toBe("/shipping?view=shipments&tab=in_transit");
    await waitFor(() => expect(lastQuery()).toMatchObject({ group: "in_transit", page: 1 }));
    await userEvent.selectOptions(screen.getByLabelText("Payment"), "prepaid");
    await userEvent.selectOptions(screen.getByLabelText("Warehouse"), "w1");
    expect(loc()).toContain("payment=prepaid");
    expect(loc()).toContain("warehouse=w1");
    await waitFor(() => expect(lastQuery()).toMatchObject({ payment: "prepaid", warehouseId: "w1" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(loc()).toBe("/shipping?view=shipments");
  });

  it("search is debounced into q", async () => {
    renderPage(SHIPMENTS);
    await screen.findByText("DL100001");
    await userEvent.type(screen.getByLabelText("Search shipments"), "BD2");
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: "BD2" }), { timeout: 2000 });
    expect(loc()).toContain("q=BD2");
  });

  it("opens the tracking drawer from the URL", async () => {
    renderPage("/shipping?drawer=shipment:s1");
    expect(await screen.findByRole("heading", { name: "Tracking", level: 4 })).toBeInTheDocument();
    expect(await screen.findByText("In transit", { selector: "p" })).toBeInTheDocument();
    expect(api.tracking).toHaveBeenCalledWith("s1", expect.anything());
    expect(api.shipmentRow).toHaveBeenCalledWith("s1", expect.anything()); // the drawer loads its own shipment by id: a reload keeps its details
    expect(await screen.findByText("Expected delivery")).toBeInTheDocument(); // a fact of the row itself, not of the list
    expect(screen.getByRole("button", { name: "Refresh tracking" })).toBeEnabled();
  });

  it("opens a row into the drawer and shows the failed delivery decisions", async () => {
    api.ndrCases.mockResolvedValue([{ id: "n1", shipmentId: "s2", orderId: "o1", attemptNo: 1, reasonCode: "customer_unavailable", reasonText: "Customer unavailable", status: "open", action: null, nextAttemptAt: null, resolvedAt: null, createdAt: "2026-10-20T08:00:00.000Z" }]);
    api.ndrAction.mockResolvedValue({ ndr: {} });
    renderPage(SHIPMENTS);
    await userEvent.click(await screen.findByRole("button", { name: "Open shipment BD200002" }));
    expect(loc()).toContain("drawer=shipment%3As2");
    expect(await screen.findByText(/Customer unavailable/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Re-attempt delivery" }));
    expect(api.ndrAction).toHaveBeenCalledWith("n1", "reattempt", undefined);
  });
});

describe("shipments: labels", () => {
  const bulkResponse: BulkLabelsResponse = {
    results: [
      { shipmentId: "s1", ok: true, awb: "DL100001", number: "SHP-1", format: "text", url: "/x", includedInCombined: true, error: null },
      { shipmentId: "s2", ok: false, awb: "BD200002", number: "SHP-2", format: null, url: null, includedInCombined: false, error: { code: "label_unavailable", message: "This shipment has no label yet" } },
    ],
    summary: { requested: 2, ok: 1, failed: 1 },
    combined: { available: true, format: "pdf_base64", fileName: "shipping-labels.pdf", pages: 1, shipmentIds: ["s1"], content: btoa("%PDF-1.4") },
  };

  it("prints several labels: one combined PDF is downloaded and the failures are listed", async () => {
    api.bulkLabels.mockResolvedValue(bulkResponse);
    renderPage(SHIPMENTS);
    await screen.findByText("DL100001");
    await userEvent.click(screen.getByLabelText("Select all shipments on this page"));
    expect(screen.getByText("2 shipments selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Print labels" }));
    expect(api.bulkLabels).toHaveBeenCalledWith(["s1", "s2"]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("This shipment has no label yet")).toBeInTheDocument();
    expect(within(dialog).getByText(/1 of 2 shipments have a label, 1 could not be printed/)).toBeInTheDocument();
    expect(saveBlob).toHaveBeenCalledTimes(1);
    expect(saveBlob.mock.calls[0]?.[1]).toBe("shipping-labels.pdf");
    expect((saveBlob.mock.calls[0]?.[0] as Blob).type).toBe("application/pdf");
    await userEvent.click(within(dialog).getByRole("button", { name: "Download PDF" }));
    expect(saveBlob).toHaveBeenCalledTimes(2);
    await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    // the one that failed stays selected
    expect(screen.getByText("1 shipment selected")).toBeInTheDocument();
  });

  it("shows an error toast when the bulk call fails", async () => {
    api.bulkLabels.mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "no", status: 403 }));
    renderPage(SHIPMENTS);
    await userEvent.click(await screen.findByLabelText("Select shipment DL100001"));
    await userEvent.click(screen.getByRole("button", { name: "Print labels" }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === "Labels could not be printed")).toBe(true));
  });

  it("downloads one label through the authenticated api", async () => {
    api.label.mockResolvedValue({ blob: new Blob(["label"]), fileName: "label-DL100001.txt" });
    renderPage(SHIPMENTS);
    await screen.findByText("DL100001");
    await userEvent.click(screen.getByRole("button", { name: "Print label DL100001" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "label-DL100001.txt"));
    expect(api.label).toHaveBeenCalledWith("s1");
    expect(screen.getByRole("button", { name: "Print label BD200002" })).toBeDisabled();
  });
});

describe("shipments: states and permissions", () => {
  it("no carrier configured and nothing shipped: explains and offers the setup", async () => {
    api.shipments.mockResolvedValue(page([]));
    api.carriers.mockResolvedValue(carriersOverview({ items: [], activeCount: 0 }));
    api.summary.mockResolvedValue(summary({ carriers: [] }));
    renderPage(SHIPMENTS);
    expect(await screen.findByText("No carrier is set up yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add a carrier" }));
    expect(loc()).toContain("panel=carriers");
  });

  it("a viewer is told to ask an admin", async () => {
    grant("shipping:read");
    api.shipments.mockResolvedValue(page([]));
    api.carriers.mockResolvedValue(carriersOverview({ items: [], activeCount: 0 }));
    renderPage(SHIPMENTS);
    expect(await screen.findByText(/Ask an admin/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a carrier" })).toBeNull();
  });

  it("carriers set up but no shipments, and no matches for filters", async () => {
    api.shipments.mockResolvedValue(page([]));
    const view = renderPage(SHIPMENTS);
    expect(await screen.findByText("No shipments yet.")).toBeInTheDocument();
    view.unmount();
    renderPage("/shipping?view=shipments&carrier=Nobody");
    expect(await screen.findByText("No shipments match these filters.")).toBeInTheDocument();
  });

  it("a list error shows a message and retries", async () => {
    api.shipments.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "db down", status: 500 }));
    renderPage(SHIPMENTS);
    expect(await screen.findByText("Shipments could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("db down")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("DL100001")).toBeInTheDocument();
  });

  it("a viewer can look and download one label but cannot select or change anything", async () => {
    grant("shipping:read");
    renderPage("/shipping?drawer=shipment:s1");
    await screen.findByLabelText("Select shipment DL100001");
    expect(screen.getByLabelText("Select all shipments on this page")).toBeDisabled();
    expect(screen.getByLabelText("Select shipment DL100001")).toBeDisabled();
    expect(await screen.findByRole("button", { name: "Refresh tracking" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Print label" })).toBeEnabled();
  });

  it("cancelling a pre-dispatch shipment asks first and sends the request", async () => {
    api.shipments.mockResolvedValue(page([row({ id: "s3", awb: "DL3", status: "label_ready", statusLabel: "Label ready" })]));
    api.cancelShipment.mockResolvedValue({ id: "s3" });
    renderPage("/shipping?drawer=shipment:s3");
    await userEvent.click(await screen.findByRole("button", { name: "Cancel shipment" }));
    const confirm = await screen.findByRole("dialog", { name: "Cancel this shipment?" });
    await act(async () => {
      await userEvent.click(within(confirm).getByRole("button", { name: "Cancel shipment" }));
    });
    expect(api.cancelShipment).toHaveBeenCalledWith("s3", undefined);
  });
});
