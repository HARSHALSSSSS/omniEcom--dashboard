import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { carriersOverview, counts, page, row, summary } from "@/test/shippingFixtures";
import type { BulkLabelsResponse } from "@/types/shipping";

const api = vi.hoisted(() => ({
  summary: vi.fn(),
  shipments: vi.fn(),
  carriers: vi.fn(),
  providerCatalog: vi.fn(),
  addCarrier: vi.fn(),
  verifyCarrier: vi.fn(),
  warehouses: vi.fn(),
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

const S1 = row();
const S2 = row({ id: "s2", number: "SHP-2", awb: "BD200002", carrier: "Blue Dart", orderNumber: "ORD-1002", status: "delivery_failed", statusLabel: "Delivery failed", paymentMethod: "prepaid", codAmountMinor: null, labelAvailable: false, lastEvent: null });

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("shipping:read", "shipping:write", "shipping:configure");
  api.summary.mockResolvedValue(summary());
  api.shipments.mockResolvedValue(page([S1, S2], { counts: counts() }));
  api.carriers.mockResolvedValue(carriersOverview());
  api.providerCatalog.mockResolvedValue([{ code: "bluedart", name: "Blue Dart", description: "Blue Dart Apex", configFields: [{ key: "accountId", description: "Your account", required: true }] }]);
  api.warehouses.mockResolvedValue([{ id: "w1", name: "Pune WH" }]);
  api.tracking.mockResolvedValue([{ id: 1, status: "in_transit", rawStatus: null, location: "Mumbai hub", note: null, source: "provider", occurredAt: "2026-10-20T08:00:00.000Z" }]);
  api.ndrCases.mockResolvedValue([]);
  api.manifests.mockResolvedValue([]);
});

describe("ribbon", () => {
  it("shows per-carrier numbers and a dash for what is unknown", async () => {
    renderPage();
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
    renderPage();
    expect(await screen.findByText(/Carrier performance could not be loaded/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findAllByTestId("carrier-card")).toHaveLength(2);
    await userEvent.selectOptions(screen.getByLabelText("Performance window"), "90");
    expect(loc()).toContain("days=90");
    await waitFor(() => expect(api.summary).toHaveBeenLastCalledWith(90, expect.anything()));
  });
});

describe("table, tabs and URL state", () => {
  it("renders rows with the last event and counts per group", async () => {
    renderPage();
    expect(await screen.findByText("DL100001")).toBeInTheDocument();
    expect(screen.getByText(/Mumbai hub/)).toBeInTheDocument();
    expect(screen.getAllByText("411001")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: /Delivery failed \(NDR\)/ })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /All shipments/ })).toHaveTextContent("3");
  });

  it("reads filters from the URL (filter[...] aliases too) into the query", async () => {
    renderPage("/shipping?filter[group]=ndr&carrier=Delhivery&filter[payment]=cod&filter[labelAvailable]=true&from=2026-10-01&to=2026-10-05&page=2&size=50&q=DL1");
    await screen.findByText("DL100001");
    expect(lastQuery()).toEqual({ group: "ndr", carrier: "Delhivery", payment: "cod", labelAvailable: true, from: "2026-10-01", to: "2026-10-05", q: "DL1", page: 2, pageSize: 50, status: undefined, warehouseId: undefined });
    expect(screen.getByRole("tab", { name: /Delivery failed/ })).toHaveAttribute("aria-selected", "true");
  });

  it("a group tab and the filters write to the URL and reset the page", async () => {
    renderPage("/shipping?page=3");
    await screen.findByText("DL100001");
    await userEvent.click(screen.getByRole("tab", { name: /In transit/ }));
    expect(loc()).toBe("/shipping?tab=in_transit");
    await waitFor(() => expect(lastQuery()).toMatchObject({ group: "in_transit", page: 1 }));
    await userEvent.selectOptions(screen.getByLabelText("Payment"), "prepaid");
    await userEvent.selectOptions(screen.getByLabelText("Warehouse"), "w1");
    expect(loc()).toContain("payment=prepaid");
    expect(loc()).toContain("warehouse=w1");
    await waitFor(() => expect(lastQuery()).toMatchObject({ payment: "prepaid", warehouseId: "w1" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(loc()).toBe("/shipping");
  });

  it("search is debounced into q", async () => {
    renderPage();
    await screen.findByText("DL100001");
    await userEvent.type(screen.getByLabelText("Search shipments"), "BD2");
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: "BD2" }), { timeout: 2000 });
    expect(loc()).toContain("q=BD2");
  });

  it("opens the tracking drawer from the URL and writes it when a row is opened", async () => {
    renderPage("/shipping?drawer=shipment:s1");
    expect(await screen.findByText("Tracking")).toBeInTheDocument();
    expect(await screen.findByText("In transit", { selector: "p" })).toBeInTheDocument();
    expect(api.tracking).toHaveBeenCalledWith("s1", expect.anything());
    expect(screen.getByRole("button", { name: "Refresh tracking" })).toBeEnabled();
  });

  it("opens a row into the drawer and shows the failed delivery decisions", async () => {
    api.ndrCases.mockResolvedValue([{ id: "n1", shipmentId: "s2", orderId: "o1", attemptNo: 1, reasonCode: "customer_unavailable", reasonText: "Customer unavailable", status: "open", action: null, nextAttemptAt: null, resolvedAt: null, createdAt: "2026-10-20T08:00:00.000Z" }]);
    api.ndrAction.mockResolvedValue({ ndr: {} });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Open shipment BD200002" }));
    expect(loc()).toContain("drawer=shipment%3As2");
    expect(await screen.findByText(/Customer unavailable/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Re-attempt delivery" }));
    expect(api.ndrAction).toHaveBeenCalledWith("n1", "reattempt", undefined);
  });
});

describe("labels", () => {
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
    renderPage();
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
    renderPage();
    await userEvent.click(await screen.findByLabelText("Select shipment DL100001"));
    await userEvent.click(screen.getByRole("button", { name: "Print labels" }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === "Labels could not be printed")).toBe(true));
  });

  it("downloads one label through the authenticated api", async () => {
    api.label.mockResolvedValue({ blob: new Blob(["label"]), fileName: "label-DL100001.txt" });
    renderPage();
    await screen.findByText("DL100001");
    await userEvent.click(screen.getByRole("button", { name: "Print label DL100001" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "label-DL100001.txt"));
    expect(api.label).toHaveBeenCalledWith("s1");
    expect(screen.getByRole("button", { name: "Print label BD200002" })).toBeDisabled();
  });
});

describe("carriers", () => {
  it("lists configured carriers with usage and adds one through the declared fields", async () => {
    api.addCarrier.mockResolvedValue({ ok: true, checks: [] });
    renderPage("/shipping?panel=carriers");
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/34 shipments in 30 days/)).toBeInTheDocument();
    expect(within(dialog).getByText("Default")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Add Blue Dart" }));
    await userEvent.type(within(dialog).getByLabelText("accountId"), "ACC-1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add Blue Dart" }));
    await waitFor(() => expect(api.addCarrier).toHaveBeenCalledWith({ providerCode: "bluedart", label: undefined, config: { accountId: "ACC-1" } }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === "Blue Dart added")).toBe(true));
  });

  it("explains a failed check after adding", async () => {
    api.addCarrier.mockResolvedValue({ ok: false, checks: [{ key: "config", ok: false, message: "accountId is wrong." }] });
    renderPage("/shipping?panel=carriers");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(await within(dialog).findByRole("button", { name: "Add Blue Dart" }));
    await userEvent.type(within(dialog).getByLabelText("accountId"), "x");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add Blue Dart" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("accountId is wrong.");
  });

  it("a user without shipping:configure cannot add, with the reason on the control", async () => {
    grant("shipping:read");
    renderPage("/shipping?panel=carriers");
    const dialog = await screen.findByRole("dialog");
    const add = await within(dialog).findByRole("button", { name: "Add Blue Dart" });
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute("title", "Only an admin can set up carriers.");
  });

  it("shows the manifests panel", async () => {
    api.manifests.mockResolvedValue([{ id: "mf1", number: "MAN-1", warehouseId: "w1", providerCode: "delhivery", status: "dispatched", closedAt: null, dispatchedAt: "2026-10-20T08:00:00.000Z", shipmentCount: 4, createdAt: "2026-10-20T07:00:00.000Z" }]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Manifests" }));
    expect(await screen.findByText("MAN-1")).toBeInTheDocument();
    expect(loc()).toContain("panel=manifests");
  });
});

describe("states and permissions", () => {
  it("no carrier configured and nothing shipped: explains and offers the setup", async () => {
    api.shipments.mockResolvedValue(page([]));
    api.carriers.mockResolvedValue(carriersOverview({ items: [], activeCount: 0 }));
    api.summary.mockResolvedValue(summary({ carriers: [] }));
    renderPage();
    expect(await screen.findByText("No carrier is set up yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add a carrier" }));
    expect(loc()).toContain("panel=carriers");
  });

  it("a viewer is told to ask an admin", async () => {
    grant("shipping:read");
    api.shipments.mockResolvedValue(page([]));
    api.carriers.mockResolvedValue(carriersOverview({ items: [], activeCount: 0 }));
    renderPage();
    expect(await screen.findByText(/Ask an admin/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a carrier" })).toBeNull();
  });

  it("carriers set up but no shipments, and no matches for filters", async () => {
    api.shipments.mockResolvedValue(page([]));
    const view = renderPage();
    expect(await screen.findByText("No shipments yet.")).toBeInTheDocument();
    view.unmount();
    renderPage("/shipping?carrier=Nobody");
    expect(await screen.findByText("No shipments match these filters.")).toBeInTheDocument();
  });

  it("a list error shows a message and retries", async () => {
    api.shipments.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "db down", status: 500 }));
    renderPage();
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
