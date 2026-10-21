import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { counts, exception, exceptionsPage, queuePage, row, view, workspace } from "@/test/fulfillmentFixtures";

const api = vi.hoisted(() => ({
  queue: vi.fn(),
  exceptions: vi.fn(),
  workspace: vi.fn(),
  act: vi.fn(),
  batchHandover: vi.fn(),
  createPickList: vi.fn(),
  resolveException: vi.fn(),
  warehouses: vi.fn(),
  carriers: vi.fn(),
}));
const refreshShell = vi.hoisted(() => vi.fn());
vi.mock("@/api/fulfillment.api", () => ({ fulfillmentApi: api }));
vi.mock("@/lib/session", () => ({ refreshShell }));

import FulfillmentPage from "./FulfillmentPage";

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/fulfillment") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <FulfillmentPage />
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
const toasts = () => useToastStore.getState().toasts;
const lastQueue = () => api.queue.mock.calls.at(-1)?.[0];

const R1 = row();
const R2 = row({
  fulfillmentId: "f2",
  number: "FUL-0002",
  orderId: "o2",
  orderNumber: "ORD-1002",
  stage: "picking",
  stageLabel: "Picking",
  status: "picking",
  priority: "urgent",
  sla: { dueAt: null, minutesRemaining: -40, band: "breached", label: "Overdue by 40m" },
  pickList: { id: "p1", number: "PL-0007" },
  assignee: { id: "u1", name: "Staff One" },
  nextAction: "pick_all",
  openExceptions: 1,
});
const SHIP = (n: number) =>
  row({ fulfillmentId: `s${n}`, orderId: `so${n}`, orderNumber: `ORD-200${n}`, number: `FUL-900${n}`, stage: "ready_to_ship", stageLabel: "Ready to ship", status: "ready_to_ship", carrier: "Sandbox Express", awb: `SBX${n}`, shipmentId: `sh${n}`, shipmentStatus: "label_ready", nextAction: "handover" });

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("fulfillment:read", "fulfillment:write", "shipping:read", "shipping:write");
  refreshShell.mockResolvedValue(undefined);
  api.queue.mockResolvedValue(queuePage([R1, R2], { total: 60, pages: 3 }));
  api.exceptions.mockResolvedValue(exceptionsPage([exception()]));
  api.workspace.mockResolvedValue(workspace());
  api.warehouses.mockResolvedValue([{ id: "11111111-1111-4111-8111-111111111111", code: "MAIN", name: "Main warehouse" }]);
  api.carriers.mockResolvedValue([{ providerCode: "sandbox", name: "Sandbox Express" }]);
});

describe("queue", () => {
  it("shows rows with SLA label, items, bins, warehouse, pick list, assignee and exceptions, and the tab counts", async () => {
    renderPage();
    const r1 = (await screen.findByRole("button", { name: "ORD-1001" })).closest("tr") as HTMLElement;
    expect(within(r1).getByText("Due in 2h 15m")).toHaveAttribute("data-sla", "approaching");
    expect(within(r1).getByText("TRV-1042")).toBeInTheDocument();
    expect(within(r1).getByText(/Bin A-04-02/)).toBeInTheDocument();
    expect(within(r1).getByText("Main warehouse")).toBeInTheDocument();
    expect(within(r1).getByRole("button", { name: "Start picking" })).toBeInTheDocument();
    const r2 = screen.getByRole("button", { name: "ORD-1002" }).closest("tr") as HTMLElement;
    expect(within(r2).getByText("Overdue by 40m")).toHaveAttribute("data-sla", "breached");
    expect(within(r2).getByText(/PL-0007 · Staff One/)).toBeInTheDocument();
    expect(within(r2).getByText("1 open")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Awaiting pick\s*3/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Ready to ship\s*4/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Exceptions\s*2/ })).toBeInTheDocument();
    expect(lastQueue()).toEqual({ page: 1, pageSize: 25 });
  });

  it("a stage tab, the filters, the search and the page go to the URL and to the query", async () => {
    renderPage();
    await screen.findByText("ORD-1001");
    await userEvent.click(screen.getByRole("tab", { name: /Picking/ }));
    expect(loc()).toContain("tab=picking");
    await waitFor(() => expect(lastQueue()).toMatchObject({ stage: "picking" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Warehouse" }), "11111111-1111-4111-8111-111111111111");
    await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Carrier" }), "sandbox");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Priority" }), "urgent");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Exceptions" }), "true");
    await waitFor(() => expect(lastQueue()).toMatchObject({ stage: "picking", warehouse: "11111111-1111-4111-8111-111111111111", carrier: "sandbox", priority: "urgent", hasException: true }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search fulfillment queue" }), "ORD-1");
    await waitFor(() => expect(lastQueue()).toMatchObject({ q: "ORD-1" }));
    expect(loc()).toContain("q=ORD-1");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(loc()).toContain("page=2");
    await waitFor(() => expect(lastQueue()).toMatchObject({ page: 2 }));
  });

  it("reads tab, filters and page from the URL", async () => {
    renderPage("/fulfillment?tab=ready_to_ship&priority=high&exception=false&page=2&size=50&carrier=sandbox");
    await screen.findByText("ORD-1001");
    expect(lastQueue()).toEqual({ stage: "ready_to_ship", priority: "high", hasException: false, carrier: "sandbox", page: 2, pageSize: 50 });
    expect(screen.getByRole("tab", { name: /Ready to ship/ })).toHaveAttribute("aria-selected", "true");
  });

  it("shows skeletons, then an error with retry", async () => {
    api.queue.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Queue exploded", status: 500 }));
    renderPage();
    expect(screen.getByRole("status", { name: "Loading queue" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Queue exploded");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("ORD-1001")).toBeInTheDocument();
  });

  it("explains an empty queue and an empty filter result", async () => {
    api.queue.mockResolvedValue(queuePage([], { total: 0, counts: counts({ all: 0 }) }));
    renderPage();
    expect(await screen.findByText("The warehouse queue is empty.")).toBeInTheDocument();
    renderPage("/fulfillment?priority=urgent");
    expect(await screen.findByText("No orders match these filters.")).toBeInTheDocument();
  });

  it("is read-only for a viewer: no selection and no action, with the reason", async () => {
    grant("fulfillment:read");
    renderPage();
    const box = await screen.findByRole("checkbox", { name: "Select ORD-1001" });
    expect(box).toBeDisabled();
    const button = screen.getByRole("button", { name: "Start picking" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringMatching(/view fulfillment but not change/));
    expect(screen.queryByRole("combobox", { name: "Carrier" })).not.toBeInTheDocument();
  });
});

describe("row actions and bulk", () => {
  it("runs the next action of a row, refreshes the shell and reports a refused action with its reason", async () => {
    api.act.mockResolvedValueOnce({ action: "start", applied: true, alreadyDone: false, fulfillmentId: "f1", result: {}, workspace: workspace() });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Start picking" }));
    expect(api.act).toHaveBeenCalledWith({ orderId: "o1", action: "start", fulfillmentId: "f1" });
    await waitFor(() => expect(refreshShell).toHaveBeenCalled());
    await waitFor(() => expect(api.queue.mock.calls.length).toBeGreaterThan(1));
    expect(toasts().at(-1)).toMatchObject({ title: "Done", variant: "success" });

    api.act.mockRejectedValueOnce(new ApiError({ code: "INVALID_STATE", message: "Not allowed", status: 409, details: { rule: "action_not_available", reason: "Picking has already started" } }));
    await userEvent.click(screen.getByRole("button", { name: "Start picking" }));
    await waitFor(() => expect(toasts().at(-1)).toMatchObject({ title: "ORD-1001 could not be updated", description: "Picking has already started", variant: "destructive" }));
  });

  it("a row whose next step needs scans or a weight opens the workspace instead", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Pick" }));
    expect(loc()).toContain("drawer=order%3Ao2");
    expect(api.act).not.toHaveBeenCalled();
  });

  it("creates a picking batch from awaiting-pick orders of one warehouse and refuses other selections", async () => {
    api.createPickList.mockResolvedValue({ id: "p9", number: "PL-0009", tasks: [] });
    renderPage();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select ORD-1002" }));
    const toolbar = screen.getByRole("toolbar", { name: "Bulk actions" });
    const batch = within(toolbar).getByRole("button", { name: "Create picking batch" });
    expect(batch).toBeDisabled();
    expect(batch).toHaveAttribute("title", expect.stringMatching(/awaiting pick/));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select ORD-1002" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select ORD-1001" }));
    await userEvent.click(within(screen.getByRole("toolbar", { name: "Bulk actions" })).getByRole("button", { name: "Create picking batch" }));
    expect(api.createPickList).toHaveBeenCalledWith(["f1"]);
    await waitFor(() => expect(toasts().at(-1)).toMatchObject({ title: "Picking batch created" }));
  });

  it("hands several orders over to a carrier and shows the per-order results, keeping the failed ones selected", async () => {
    api.queue.mockResolvedValue(queuePage([SHIP(1), SHIP(2)]));
    api.batchHandover.mockResolvedValue({
      carrier: "Sandbox Express",
      manifests: [{ id: "m1", number: "MAN-1", shipmentCount: 1, status: "dispatched" }],
      results: [
        { orderId: "so1", orderNumber: "ORD-2001", shipmentId: "sh1", ok: true, manifestId: "m1", error: null },
        { orderId: "so2", orderNumber: "ORD-2002", shipmentId: null, ok: false, manifestId: null, error: { code: "carrier_mismatch", message: "The shipment belongs to another carrier" } },
      ],
      summary: { requested: 2, handedOver: 1, failed: 1 },
    });
    renderPage();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select all orders on this page" }));
    await userEvent.click(screen.getByRole("button", { name: "Hand over to carrier" }));
    const dialog = await screen.findByRole("dialog");
    const select = within(dialog).getByRole("combobox", { name: "Carrier" });
    expect(select).toHaveValue("Sandbox Express");
    await userEvent.click(within(dialog).getByRole("button", { name: "Hand over" }));
    expect(api.batchHandover).toHaveBeenCalledWith("Sandbox Express", ["so1", "so2"]);
    const results = await screen.findByRole("dialog", { name: "Hand-over results" });
    expect(results).toHaveTextContent("1 of 2 handed over to Sandbox Express, 1 failed");
    expect(results).toHaveTextContent("The shipment belongs to another carrier");
    await userEvent.click(within(results).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select ORD-2002" })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "Select ORD-2001" })).not.toBeChecked();
  });

  it("hand-over is off without shipping:write", async () => {
    grant("fulfillment:read", "fulfillment:write");
    api.queue.mockResolvedValue(queuePage([SHIP(1)]));
    renderPage();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select ORD-2001" }));
    const button = screen.getByRole("button", { name: "Hand over to carrier" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringMatching(/cannot hand parcels/));
  });
});

describe("order workspace drawer", () => {
  const act = (action: string, ws = workspace()) => ({ action, applied: true, alreadyDone: false, fulfillmentId: "f1", result: {}, workspace: ws });

  it("opens from the URL with items, history and the actions with their reasons", async () => {
    renderPage("/fulfillment?drawer=order:o1");
    expect(await screen.findByRole("heading", { name: "Order ORD-1001" })).toBeInTheDocument();
    expect(api.workspace).toHaveBeenCalledWith("o1", undefined, expect.anything());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Bin A-04-02 · Qty 2/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Start picking" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Pack" })).toBeDisabled();
    expect(within(dialog).getByText("Only picked items can be packed")).toBeInTheDocument();
    expect(within(dialog).getByText("Create the label first")).toBeInTheDocument();
  });

  it("runs start and replaces the workspace with the answer", async () => {
    const picking = workspace({}, { status: "picking", stage: "picking" });
    api.act.mockResolvedValue(act("start", picking));
    renderPage("/fulfillment?drawer=order:o1");
    await userEvent.click(await screen.findByRole("button", { name: "Start picking" }));
    expect(api.act).toHaveBeenCalledWith({ orderId: "o1", action: "start" });
    await waitFor(() => expect(toasts().at(-1)).toMatchObject({ title: "Start picking", variant: "success" }));
  });

  it("pick all asks for the manual confirmation when nothing was scanned, then sends override", async () => {
    const ws = workspace();
    ws.actions = ws.actions.map((a) => (a.action === "pick_all" ? view("pick_all", { enabled: true, disabledReason: null, requiresOverride: true }) : a));
    api.workspace.mockResolvedValue(ws);
    api.act.mockResolvedValue(act("pick_all"));
    renderPage("/fulfillment?drawer=order:o1");
    await userEvent.click(await screen.findByRole("button", { name: "Pick all items" }));
    const form = screen.getByRole("form", { name: "Pick all items" });
    const submit = within(form).getByRole("button", { name: "Pick all items" });
    expect(submit).toBeDisabled();
    await userEvent.click(within(form).getByRole("checkbox"));
    await userEvent.click(submit);
    expect(api.act).toHaveBeenCalledWith({ orderId: "o1", action: "pick_all", override: true });
  });

  it("pack needs a weight and sends it with the box and the override", async () => {
    const ws = workspace();
    ws.actions = ws.actions.map((a) => (a.action === "pack" ? view("pack", { enabled: true, disabledReason: null, requires: ["weightGrams"], requiresOverride: true }) : a));
    api.workspace.mockResolvedValue(ws);
    api.act.mockResolvedValue(act("pack"));
    renderPage("/fulfillment?drawer=order:o1");
    await userEvent.click(await screen.findByRole("button", { name: "Pack" }));
    const form = screen.getByRole("form", { name: "Pack" });
    await userEvent.click(within(form).getByRole("checkbox"));
    expect(within(form).getByRole("button", { name: "Pack" })).toBeDisabled();
    await userEvent.type(within(form).getByRole("spinbutton", { name: "Package weight in grams" }), "700");
    await userEvent.type(within(form).getByRole("textbox", { name: "Box type" }), "small");
    await userEvent.click(within(form).getByRole("button", { name: "Pack" }));
    expect(api.act).toHaveBeenCalledWith({ orderId: "o1", action: "pack", override: true, weightGrams: 700, boxType: "small", lengthMm: undefined, widthMm: undefined, heightMm: undefined });
  });

  it("reports an exception with a kind and a note", async () => {
    api.act.mockResolvedValue(act("exception"));
    renderPage("/fulfillment?drawer=order:o1");
    await userEvent.click(await screen.findByRole("button", { name: "Report an exception" }));
    const form = screen.getByRole("form", { name: "Report an exception" });
    expect(within(form).getByRole("button", { name: "Report an exception" })).toBeDisabled();
    await userEvent.selectOptions(within(form).getByRole("combobox", { name: "Exception kind" }), "damaged");
    await userEvent.type(within(form).getByRole("textbox", { name: "Exception note" }), "box crushed");
    await userEvent.click(within(form).getByRole("button", { name: "Report an exception" }));
    expect(api.act).toHaveBeenCalledWith({ orderId: "o1", action: "exception", kind: "damaged", note: "box crushed" });
  });

  it("creates the label and hands over without extra fields", async () => {
    const ws = workspace();
    ws.actions = ws.actions.map((a) => (a.action === "ready" || a.action === "handover" ? view(a.action, { enabled: true, disabledReason: null }) : a));
    api.workspace.mockResolvedValue(ws);
    api.act.mockResolvedValue(act("ready"));
    renderPage("/fulfillment?drawer=order:o1");
    await userEvent.click(await screen.findByRole("button", { name: "Create label (ready to ship)" }));
    expect(api.act).toHaveBeenLastCalledWith({ orderId: "o1", action: "ready" });
    await userEvent.click(screen.getByRole("button", { name: "Hand over to the courier" }));
    expect(api.act).toHaveBeenLastCalledWith({ orderId: "o1", action: "handover" });
  });

  it("shows the API's reason when an action is refused (409 action_not_available)", async () => {
    api.act.mockRejectedValue(new ApiError({ code: "INVALID_STATE", message: "Not allowed", status: 409, details: { rule: "action_not_available", reason: "Picking has already started" } }));
    renderPage("/fulfillment?drawer=order:o1");
    await userEvent.click(await screen.findByRole("button", { name: "Start picking" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Picking has already started");
  });

  it("on a multi-warehouse order the actions name the focused fulfillment", async () => {
    const ws = workspace();
    ws.fulfillments = [
      { id: "f1", number: "FUL-0001", status: "confirmed", stage: "awaiting_pick", warehouse: { id: "w1", code: "MAIN", name: "Main warehouse" }, units: 1, focused: true },
      { id: "f9", number: "FUL-0009", status: "confirmed", stage: "awaiting_pick", warehouse: { id: "w2", code: "BLR", name: "Bengaluru" }, units: 1, focused: false },
    ];
    api.workspace.mockResolvedValue(ws);
    api.act.mockResolvedValue(act("start"));
    renderPage("/fulfillment?drawer=order:o1");
    await userEvent.click(await screen.findByRole("button", { name: "Start picking" }));
    expect(api.act).toHaveBeenCalledWith({ orderId: "o1", action: "start", fulfillmentId: "f1" });
    await userEvent.click(screen.getByRole("button", { name: /FUL-0009/ }));
    await waitFor(() => expect(api.workspace).toHaveBeenLastCalledWith("o1", "f9", expect.anything()));
  });

  it("is read-only for a viewer and shows a load error with retry", async () => {
    grant("fulfillment:read");
    api.workspace.mockRejectedValueOnce(new ApiError({ code: "NOT_FOUND", message: "Order not found", status: 404 }));
    renderPage("/fulfillment?drawer=order:o1");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Order not found");
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    const start = await screen.findByRole("button", { name: "Start picking" });
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute("title", expect.stringMatching(/view fulfillment but not change/));
  });
});

describe("exceptions", () => {
  it("lists exceptions with status, resolves one with a note and follow-up, and dismisses another", async () => {
    api.resolveException.mockResolvedValue({ id: "x1", status: "resolved" });
    renderPage("/fulfillment?tab=exceptions");
    expect(await screen.findByText("Damaged item")).toBeInTheDocument();
    expect(api.exceptions).toHaveBeenCalledWith({ status: "open", page: 1, pageSize: 25 }, expect.anything());
    expect(screen.getByText("box crushed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resolve" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Note" }), "repacked");
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Follow-up" }), "hold");
    await userEvent.click(within(dialog).getByRole("button", { name: "Resolve" }));
    expect(api.resolveException).toHaveBeenCalledWith({ id: "x1", status: "resolved", note: "repacked", action: "hold" });
    await waitFor(() => expect(toasts().at(-1)).toMatchObject({ title: "Exception resolved" }));
    await userEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Dismiss" }));
    expect(api.resolveException).toHaveBeenLastCalledWith({ id: "x1", status: "dismissed", note: undefined, action: "none" });
  });

  it("filters by status through the URL and explains an empty list", async () => {
    api.exceptions.mockResolvedValue(exceptionsPage([]));
    renderPage("/fulfillment?tab=exceptions");
    expect(await screen.findByText("No open exceptions.")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Exception status" }), "resolved");
    expect(loc()).toContain("xstatus=resolved");
    await waitFor(() => expect(api.exceptions).toHaveBeenLastCalledWith({ status: "resolved", page: 1, pageSize: 25 }, expect.anything()));
  });

  it("a viewer cannot resolve", async () => {
    grant("fulfillment:read");
    renderPage("/fulfillment?tab=exceptions");
    expect(await screen.findByRole("button", { name: "Resolve" })).toBeDisabled();
  });
});
