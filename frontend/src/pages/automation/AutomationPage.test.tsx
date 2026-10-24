import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { AutomationApproval, AutomationCatalog, AutomationExecution, AutomationOverview, AutomationRule, AutomationRun, PagedResult } from "@/types/automation";

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  catalog: vi.fn(),
  rules: vi.fn(),
  rule: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  activate: vi.fn(),
  disable: vi.fn(),
  remove: vi.fn(),
  test: vi.fn(),
  approvals: vi.fn(),
  runs: vi.fn(),
  execution: vi.fn(),
  approve: vi.fn(),
  dismiss: vi.fn(),
  rollback: vi.fn(),
}));
vi.mock("@/api/automation.api", async (orig) => ({ ...(await orig<typeof import("@/api/automation.api")>()), automationApi: api }));
vi.mock("@/api/procurement.api", () => ({ procurementApi: { activeSuppliers: vi.fn().mockResolvedValue([]), warehouses: vi.fn().mockResolvedValue([]) } }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

import AutomationPage from "./AutomationPage";

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const E1 = "33333333-3333-4333-8333-333333333333";
const E2 = "44444444-4444-4444-8444-444444444444";

const rule = (over: Partial<AutomationRule> = {}): AutomationRule => ({
  id: R1,
  name: "Draft PO on low stock",
  description: "Orders up to 40 units",
  triggerEvent: "inventory.low_stock",
  conditions: { combinator: "all", conditions: [{ field: "available", op: "lte", value: 5 }] },
  action: { type: "draft_purchase_order", params: { targetLevel: 40 } },
  mode: "approval",
  status: "active",
  version: 2,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
  triggerType: "stock_below_threshold",
  actionType: "draft_purchase_order",
  requiresExplicitApproval: true,
  runsCount: 7,
  lastRunAt: "2026-10-20T10:00:00.000Z",
  channelFilter: null,
  schedule: null,
  ...over,
});

const AUTO = rule({ id: R2, name: "Notify on failed sync", triggerEvent: "sync.failed", action: { type: "notify", params: { title: "Sync failed", severity: "warning" } }, mode: "auto", status: "disabled", runsCount: 0, lastRunAt: null, conditions: { combinator: "all", conditions: [] }, description: null });

const catalog = (): AutomationCatalog => ({
  triggers: [
    { event: "inventory.low_stock", description: "Available stock fell to / below the reorder level", facts: ["variantId", "available", "reorderLevel"] },
    { event: "sync.failed", description: "A marketplace sync job failed", facts: ["type", "attempts"] },
    { event: "schedule.cadence", description: "A slot arrived", facts: ["hour"] },
  ],
  actions: [
    { type: "notify", description: "Tell the team", triggers: "*", reversible: false },
    { type: "draft_purchase_order", description: "Draft a purchase order for the low-stock variant", triggers: ["inventory.low_stock"], reversible: false },
    { type: "set_reorder_level", description: "Set the reorder level", triggers: ["inventory.low_stock"], reversible: true },
  ],
  operators: ["eq", "ne", "in", "nin", "gt", "gte", "lt", "lte", "contains", "startsWith", "between", "exists"],
});

const overview = (): AutomationOverview => ({ activeRules: 1, totalRules: 2, pendingApprovals: 3, runs24h: 12, successRate: 91.7, lastRunAt: "2026-10-20T10:00:00.000Z", lastRunRule: "Draft PO on low stock" });

const approval = (over: Partial<AutomationApproval> = {}): AutomationApproval => ({
  id: E1,
  ruleId: R1,
  ruleName: "Draft PO on low stock",
  triggerEvent: "inventory.low_stock",
  triggerType: "stock_below_threshold",
  actionType: "draft_purchase_order",
  entityName: "Premium Travel Bag",
  skuOrOrder: "TRV-1042",
  proposedAction: "Draft a purchase order for 35 unit(s) of TRV-1042",
  recommendedAction: "Draft a purchase order for 35 unit(s) of TRV-1042",
  financialImpact: 8750000,
  currency: "INR",
  timestamp: "2026-10-20T09:00:00.000Z",
  status: "pending",
  facts: { available: 5 },
  ...over,
});

const run = (over: Partial<AutomationRun> = {}): AutomationRun => ({
  id: E2,
  ruleId: R1,
  ruleName: "Draft PO on low stock",
  executionStatus: "success",
  status: "executed",
  triggeredAt: "2026-10-19T09:00:00.000Z",
  timestamp: "2026-10-19T09:00:00.000Z",
  summary: "Drafted PO-2026-0048 for 35 unit(s) of TRV-1042",
  durationMs: 240,
  entityName: "Premium Travel Bag",
  skuOrOrder: "TRV-1042",
  ...over,
});

const execution = (over: Partial<AutomationExecution> = {}): AutomationExecution => ({
  id: E2,
  ruleId: R1,
  eventId: "ev1",
  eventType: "inventory.low_stock",
  status: "executed",
  actionType: "set_reorder_level",
  actionParams: { level: 30 },
  facts: { available: 4, sku: "TRV-1042" },
  result: { level: 30 },
  error: null,
  canRollback: true,
  decidedBy: null,
  decidedAt: "2026-10-19T09:00:05.000Z",
  executedAt: "2026-10-19T09:00:06.000Z",
  createdAt: "2026-10-19T09:00:00.000Z",
  ...over,
});

const page = <T,>(items: T[]): PagedResult<T> => ({ items, page: 1, pageSize: 25, total: items.length, pages: 1 });

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/automation") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <AutomationPage />
                <Probe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function signIn(permissions: string[] = ["automation:read", "automation:write"], features: Record<string, boolean> = { "automation.enabled": true }) {
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

const loc = () => screen.getByTestId("loc").textContent;
const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);
const lastRunsQuery = () => api.runs.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  useWorkspaceStore.getState().clearWorkspace();
  signIn();
  api.overview.mockResolvedValue(overview());
  api.catalog.mockResolvedValue(catalog());
  api.rules.mockResolvedValue([rule(), AUTO]);
  api.approvals.mockResolvedValue(page([approval()]));
  api.runs.mockResolvedValue(page([run(), run({ id: E1, executionStatus: "failed", status: "failed", summary: "Failed: supplier missing" })]));
  api.execution.mockResolvedValue(execution());
  api.rule.mockResolvedValue(rule());
});

describe("AutomationPage gating", () => {
  it("shows a no-access state without automation:read and calls nothing", async () => {
    useWorkspaceStore.getState().clearWorkspace();
    signIn([]);
    renderPage();
    expect(await screen.findByText("You do not have access to Automation.")).toBeInTheDocument();
    expect(api.rules).not.toHaveBeenCalled();
  });

  it("shows a not-enabled state when the feature flag is off", async () => {
    useWorkspaceStore.getState().clearWorkspace();
    signIn(["automation:read", "automation:write"], { "automation.enabled": false });
    renderPage();
    expect(await screen.findByText("Automation is not enabled for this business.")).toBeInTheDocument();
    expect(api.rules).not.toHaveBeenCalled();
    expect(api.overview).not.toHaveBeenCalled();
  });

  it("lets a read-only user look but not change anything", async () => {
    useWorkspaceStore.getState().clearWorkspace();
    signIn(["automation:read"]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Draft PO on low stock");
    expect(screen.getByRole("button", { name: "New rule" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Actions for Draft PO on low stock" }));
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Test (dry run)" })).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("AutomationPage rules", () => {
  it("shows the tiles and the rules from the API", async () => {
    renderPage();
    const row = (await screen.findByText("Draft PO on low stock")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Stock falls to the reorder level")).toBeInTheDocument();
    expect(within(row).getByText("Draft a purchase order")).toBeInTheDocument();
    expect(within(row).getByText("Needs approval")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
    expect(within(row).getByText("7")).toBeInTheDocument();
    expect(await screen.findByText("91.7%")).toBeInTheDocument();
    expect(screen.getByText("Awaiting approval")).toBeInTheDocument();
    const auto = screen.getByText("Notify on failed sync").closest("tr") as HTMLElement;
    expect(within(auto).getByText("Disabled")).toBeInTheDocument();
    expect(within(auto).getByText("Never")).toBeInTheDocument();
  });

  it("filters by status, trigger and search through the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Draft PO on low stock");

    await user.click(screen.getByRole("tab", { name: /^Disabled/ }));
    expect(loc()).toBe("/automation?status=disabled");
    expect(screen.queryByText("Draft PO on low stock")).not.toBeInTheDocument();
    expect(screen.getByText("Notify on failed sync")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(loc()).toBe("/automation");
    await user.selectOptions(screen.getByLabelText("Trigger"), "inventory.low_stock");
    expect(loc()).toContain("trigger=inventory.low_stock");
    expect(screen.queryByText("Notify on failed sync")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.type(screen.getByLabelText("Search rules"), "sync");
    await waitFor(() => expect(screen.queryByText("Draft PO on low stock")).not.toBeInTheDocument(), { timeout: 2000 });
    expect(loc()).toContain("q=sync");
  });

  it("shows an empty state and a load error with retry", async () => {
    api.rules.mockResolvedValueOnce([]);
    const { unmount } = renderPage();
    expect(await screen.findByText("No automation rules yet.")).toBeInTheDocument();
    unmount();

    api.rules.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Rules could not be loaded.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Draft PO on low stock")).toBeInTheDocument();
  });

  it("disables an active rule and enables an approval rule right away", async () => {
    api.disable.mockResolvedValue(rule({ status: "disabled" }));
    api.activate.mockResolvedValue(rule({ status: "active" }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Draft PO on low stock");

    await user.click(screen.getByRole("button", { name: "Actions for Draft PO on low stock" }));
    await user.click(await screen.findByRole("menuitem", { name: "Disable" }));
    await waitFor(() => expect(api.disable).toHaveBeenCalledWith(R1));
    await waitFor(() => expect(toastTitles()).toContain("Rule disabled"));
  });

  it("asks before enabling a rule that runs by itself", async () => {
    api.activate.mockResolvedValue(rule({ ...AUTO, status: "active" }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Notify on failed sync");
    await user.click(screen.getByRole("button", { name: "Actions for Notify on failed sync" }));
    await user.click(await screen.findByRole("menuitem", { name: "Enable" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/without anyone approving it/)).toBeInTheDocument();
    expect(api.activate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Enable rule" }));
    await waitFor(() => expect(api.activate).toHaveBeenCalledWith(R2));
  });

  it("deletes a rule after confirmation and explains a refusal because of history", async () => {
    api.remove.mockRejectedValueOnce(new ApiError({ code: "CONFLICT", message: "has history", status: 409, details: { rule: "has_history" } }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Draft PO on low stock");
    await user.click(screen.getByRole("button", { name: "Actions for Draft PO on low stock" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete rule" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(R1));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === "Could not delete the rule" && /Disable it instead/.test(String(t.description)))).toBe(true));

    api.remove.mockResolvedValueOnce({ id: R2, deleted: true });
    await user.click(screen.getByRole("button", { name: "Actions for Notify on failed sync" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete rule" }));
    await waitFor(() => expect(toastTitles()).toContain("Rule deleted"));
  });

  it("opens a rule drawer from the URL with its details and recent runs", async () => {
    const user = userEvent.setup();
    renderPage(`/automation?rule=${R1}`);
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText("available is at most 5")).toBeInTheDocument();
    expect(within(drawer).getByText("targetLevel")).toBeInTheDocument();
    expect(await within(drawer).findByText("Drafted PO-2026-0048 for 35 unit(s) of TRV-1042")).toBeInTheDocument();
    expect(api.runs.mock.calls.at(-1)?.[0]).toMatchObject({ ruleId: R1, pageSize: 8 });

    await user.click(within(drawer).getByRole("button", { name: /Open run: Drafted PO/ }));
    expect(loc()).toBe(`/automation?run=${E2}`);
    await waitFor(() => expect(api.execution).toHaveBeenCalledWith(E2, expect.anything()));
  });
});

describe("AutomationPage builder", () => {
  it("saves a double-clicked Save rule once", async () => {
    api.create.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(rule({ id: R2, name: "Once" })), 50)));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Draft PO on low stock");
    await user.click(screen.getByRole("button", { name: "New rule" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Rule name"), "Once");
    await user.selectOptions(within(dialog).getByLabelText("Trigger"), "inventory.low_stock");
    await user.selectOptions(within(dialog).getByLabelText("Action"), "draft_purchase_order");
    await user.type(within(dialog).getByLabelText("Order up to (units)"), "40");
    await user.type(within(dialog).getByLabelText(/Unit cost/), "125.5");
    const save = within(dialog).getByRole("button", { name: "Save rule" });
    // two clicks inside one task, before the button can re-render as disabled
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New automation rule" })).not.toBeInTheDocument());
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it("creates a rule with typed conditions and action parameters", async () => {
    api.create.mockResolvedValue(rule({ id: R2, name: "Low stock PO" }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Draft PO on low stock");
    await user.click(screen.getByRole("button", { name: "New rule" }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Save rule" }));
    expect(await within(dialog).findByText("Give the rule a name (at least 2 characters)")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose what starts the rule")).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Rule name"), "Low stock PO");
    await user.selectOptions(within(dialog).getByLabelText("Trigger"), "inventory.low_stock");
    await user.click(within(dialog).getByRole("button", { name: "Add condition" }));
    await user.type(within(dialog).getByLabelText("Condition 1 fact"), "available");
    await user.selectOptions(within(dialog).getByLabelText("Condition 1 operator"), "lte");
    await user.type(within(dialog).getByLabelText("Condition 1 value"), "5");

    // the actions offered depend on the trigger
    const action = within(dialog).getByLabelText("Action");
    expect(within(action).queryByRole("option", { name: /Retry the sync job/ })).not.toBeInTheDocument();
    await user.selectOptions(action, "draft_purchase_order");
    await user.type(within(dialog).getByLabelText("Order up to (units)"), "40");
    await user.type(within(dialog).getByLabelText(/Unit cost/), "125.5");
    await user.selectOptions(within(dialog).getByLabelText("Each run"), "auto");
    await user.selectOptions(within(dialog).getByLabelText("Status"), "active");
    await user.click(within(dialog).getByRole("button", { name: "Save rule" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls.at(0)?.[0]).toEqual({
      name: "Low stock PO",
      description: null,
      triggerEvent: "inventory.low_stock",
      conditions: { combinator: "all", conditions: [{ field: "available", op: "lte", value: 5 }] },
      action: { type: "draft_purchase_order", params: { targetLevel: 40, unitCostMinor: 12550 } },
      mode: "auto",
      status: "active",
    });
    await waitFor(() => expect(toastTitles()).toContain("Rule created and active"));
    expect(loc()).toContain(`rule=${R2}`);
  });

  it("shows server field errors on the parameter they belong to", async () => {
    api.create.mockRejectedValue(new ApiError({ code: "VALIDATION_FAILED", message: "bad", status: 400, details: { issues: [{ path: "targetLevel", message: "Too high for this supplier" }] } }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Draft PO on low stock");
    await user.click(screen.getByRole("button", { name: "New rule" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Rule name"), "Low stock PO");
    await user.selectOptions(within(dialog).getByLabelText("Trigger"), "inventory.low_stock");
    await user.selectOptions(within(dialog).getByLabelText("Action"), "draft_purchase_order");
    await user.type(within(dialog).getByLabelText("Order up to (units)"), "40");
    await user.click(within(dialog).getByRole("button", { name: "Save rule" }));
    expect(await within(dialog).findByText("Too high for this supplier")).toBeInTheDocument();
    expect(within(dialog).getByText("Some fields need a correction.")).toBeInTheDocument();
  });

  it("edits a rule with its version and offers the latest one after a conflict", async () => {
    api.update.mockRejectedValueOnce(new ApiError({ code: "VERSION_CONFLICT", message: "changed", status: 409, details: { currentVersion: 3 } }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Draft PO on low stock");
    await user.click(screen.getByRole("button", { name: "Actions for Draft PO on low stock" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Rule name")).toHaveValue("Draft PO on low stock");
    expect(within(dialog).getByLabelText("Condition 1 value")).toHaveValue("5");
    expect(within(dialog).getByLabelText("Order up to (units)")).toHaveValue("40");

    await user.clear(within(dialog).getByLabelText("Rule name"));
    await user.type(within(dialog).getByLabelText("Rule name"), "Renamed");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(R1, expect.objectContaining({ name: "Renamed", version: 2 })));
    expect(await within(dialog).findByText(/changed by someone else/)).toBeInTheDocument();

    api.rule.mockResolvedValue(rule({ name: "Their name", version: 3 }));
    await user.click(within(dialog).getByRole("button", { name: "Load latest version" }));
    await waitFor(() => expect(within(dialog).getByLabelText("Rule name")).toHaveValue("Their name"));
  });

  it("shows hour and weekday fields for a scheduled trigger and sends them as conditions", async () => {
    api.create.mockResolvedValue(rule({ id: R2 }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Draft PO on low stock");
    await user.click(screen.getByRole("button", { name: "New rule" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Rule name"), "Morning note");
    await user.selectOptions(within(dialog).getByLabelText("Trigger"), "schedule.cadence");
    await user.selectOptions(within(dialog).getByLabelText("Repeats"), "1");
    await user.selectOptions(within(dialog).getByLabelText("At"), "7");
    await user.selectOptions(within(dialog).getByLabelText("Action"), "notify");
    await user.type(within(dialog).getByLabelText("Title"), "Good morning");
    await user.click(within(dialog).getByRole("button", { name: "Save rule" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls.at(0)?.[0]).toMatchObject({
      triggerEvent: "schedule.cadence",
      conditions: { conditions: [{ field: "hour", op: "eq", value: 7 }, { field: "weekday", op: "eq", value: 1 }] },
      action: { type: "notify", params: { title: "Good morning", severity: "info" } },
    });
  });

  it("dry-runs a rule and shows what it would do", async () => {
    api.test.mockResolvedValue({ matched: true, facts: { available: 3, eventType: "inventory.low_stock" }, wouldDo: { action: "draft_purchase_order", params: { targetLevel: 40 }, needsApproval: true } });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Draft PO on low stock");
    await user.click(screen.getByRole("button", { name: "Actions for Draft PO on low stock" }));
    await user.click(await screen.findByRole("menuitem", { name: "Test (dry run)" }));
    const dialog = await screen.findByRole("dialog");
    const payload = within(dialog).getByLabelText("Event payload (JSON)");
    expect((payload as HTMLTextAreaElement).value).toContain('"available": 0');

    await user.clear(payload);
    await user.click(payload);
    await user.paste('{"available": 3}');
    await user.click(within(dialog).getByRole("button", { name: "Run test" }));
    await waitFor(() => expect(api.test).toHaveBeenCalledWith(R1, { available: 3 }));
    expect(await within(dialog).findByText("The rule would fire.")).toBeInTheDocument();
    expect(within(dialog).getByText(/after a person approves/)).toBeInTheDocument();

    await user.clear(payload);
    await user.click(payload);
    await user.paste("not json");
    await user.click(within(dialog).getByRole("button", { name: "Run test" }));
    expect(await within(dialog).findByText("The payload is not valid JSON.")).toBeInTheDocument();
  });
});

describe("AutomationPage approvals and runs", () => {
  it("lists approvals with the money at stake and approves one after confirmation", async () => {
    api.approve.mockResolvedValue(execution({ status: "executed", actionType: "draft_purchase_order" }));
    const user = userEvent.setup();
    renderPage("/automation?tab=approvals");
    const row = (await screen.findByText("Premium Travel Bag")).closest("tr") as HTMLElement;
    expect(within(row).getByText("₹87,500")).toBeInTheDocument();
    expect(within(row).getByText("Draft a purchase order for 35 unit(s) of TRV-1042")).toBeInTheDocument();
    expect(api.approvals.mock.calls.at(-1)?.[0]).toEqual({ page: 1, pageSize: 25 });

    await user.click(within(row).getByRole("button", { name: "Approve Premium Travel Bag" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.approve).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Approve and run" }));
    await waitFor(() => expect(api.approve).toHaveBeenCalledWith(E1));
    await waitFor(() => expect(toastTitles()).toContain("Approved and run"));
  });

  it("says so when an approved action fails and when someone decided first", async () => {
    api.approve.mockResolvedValueOnce(execution({ status: "failed", error: "No supplier is set for this product" }));
    api.approve.mockRejectedValueOnce(new ApiError({ code: "INVALID_STATE", message: "not pending", status: 409 }));
    const user = userEvent.setup();
    renderPage("/automation?tab=approvals");
    await screen.findByText("Premium Travel Bag");
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole("button", { name: "Approve Premium Travel Bag" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Approve and run" }));
      await waitFor(() => expect(api.approve).toHaveBeenCalledTimes(i + 1));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }
    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.title === "The action failed" && t.description === "No supplier is set for this product")).toBe(true);
    expect(toasts.some((t) => t.title === "Could not approve the run" && /already decided/.test(String(t.description)))).toBe(true);
  });

  it("dismisses an approval", async () => {
    api.dismiss.mockResolvedValue(execution({ status: "rejected" }));
    const user = userEvent.setup();
    renderPage("/automation?tab=approvals");
    await screen.findByText("Premium Travel Bag");
    await user.click(screen.getByRole("button", { name: "Dismiss Premium Travel Bag" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(api.dismiss).toHaveBeenCalledWith(E1, undefined));
    await waitFor(() => expect(toastTitles()).toContain("Dismissed"));
  });

  it("shows the empty approvals state", async () => {
    api.approvals.mockResolvedValue(page([]));
    renderPage("/automation?tab=approvals");
    expect(await screen.findByText("Nothing is waiting for approval.")).toBeInTheDocument();
  });

  it("filters the run history and rolls a reversible run back from its drawer", async () => {
    api.rollback.mockResolvedValue(execution({ status: "rolled_back", canRollback: false }));
    const user = userEvent.setup();
    renderPage("/automation?tab=runs&status=failed&page=2&size=50");
    await screen.findByText("Failed: supplier missing");
    expect(lastRunsQuery()).toMatchObject({ status: "failed", page: 2, pageSize: 50 });

    await user.click(screen.getByRole("tab", { name: "All" }));
    expect(loc()).toBe("/automation?tab=runs&size=50");
    await user.selectOptions(screen.getByLabelText("Rule"), R1);
    await waitFor(() => expect(lastRunsQuery()).toMatchObject({ ruleId: R1 }));
    expect(loc()).toContain(`ruleId=${R1}`);

    await user.click(await screen.findByRole("button", { name: /Open run of Draft PO on low stock: Drafted PO-2026-0048/ }));
    const drawer = await screen.findByRole("dialog");
    expect((await within(drawer).findAllByText("Executed")).length).toBeGreaterThan(0);
    expect(within(drawer).getByText("What it saw")).toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: "Roll back" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Roll this run back?" })).getByRole("button", { name: "Roll back" }));
    await waitFor(() => expect(api.rollback).toHaveBeenCalledWith(E2));
    await waitFor(() => expect(toastTitles()).toContain("Rolled back"));
  });

  it("shows the empty run history and a run that could not be loaded", async () => {
    api.runs.mockResolvedValue(page([]));
    const { unmount } = renderPage("/automation?tab=runs");
    expect(await screen.findByText("No runs yet.")).toBeInTheDocument();
    unmount();

    api.execution.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "No such run", status: 404 }));
    renderPage(`/automation?tab=runs&run=${E2}`);
    expect(await screen.findByText("This run could not be loaded.")).toBeInTheDocument();
  });
});
