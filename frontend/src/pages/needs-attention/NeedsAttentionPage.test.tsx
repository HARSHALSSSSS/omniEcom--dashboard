import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { HistoryItem, Issue, IssueCounts, IssueDetail, IssueHistory } from "@/types/attention";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  counts: vi.fn(),
  history: vi.fn(),
  recommendation: vi.fn(),
  assignees: vi.fn(),
  detail: vi.fn(),
  start: vi.fn(),
  resolve: vi.fn(),
  snooze: vi.fn(),
  unsnooze: vi.fn(),
  assign: vi.fn(),
  bulk: vi.fn(),
  refresh: vi.fn(),
}));
const refreshShell = vi.hoisted(() => vi.fn());
vi.mock("@/api/attention.api", () => ({ attentionApi: api, issueQuery: vi.fn() }));
vi.mock("@/lib/session", () => ({ refreshShell }));

import NeedsAttentionPage from "./NeedsAttentionPage";

const issue = (over: Partial<Issue> = {}): Issue => ({
  id: "i1",
  key: "orders_dispatch_risk",
  area: "orders",
  priority: "critical",
  status: "open",
  title: "7 orders are at risk of missing dispatch",
  explanation: "Dispatch delays may affect customer delivery expectations.",
  impact: "Customer delivery risk",
  count: 7,
  dueAt: "2026-10-20T10:00:00.000Z",
  dueLabel: "Today, 3:30 PM",
  recommendedAction: { text: "Review picking and packing status.", label: "Review orders", href: "/orders" },
  assignedTo: null,
  assigneeName: null,
  snoozedUntil: null,
  statusNote: null,
  firstSeenAt: "2026-10-19T10:00:00.000Z",
  updatedAt: "2026-10-20T09:00:00.000Z",
  ...over,
});

const I1 = issue();
const I2 = issue({ id: "i2", key: "stock_below_threshold", area: "inventory", priority: "high", title: "18 products are below their stock threshold", impact: "Potential stockout", dueLabel: "Today", recommendedAction: { text: "Create purchase orders.", label: "Review inventory", href: "/inventory?health=low" } });

const page = (items: Issue[], over: Record<string, unknown> = {}) => ({ items, page: 1, pageSize: 10, total: items.length, pages: 1, ...over });
const counts = (over: Partial<IssueCounts> = {}): IssueCounts => ({ open: 18, tabs: { all: 18, critical: 3, today: 11, upcoming: 4 }, byArea: {}, updatedAt: new Date(Date.now() - 2 * 60_000).toISOString(), ...over });
const detail = (over: Partial<IssueDetail> = {}): IssueDetail => ({
  ...I1,
  whyItMatters: "These orders are approaching their dispatch deadline.",
  affected: { total: 7, items: [{ type: "order", id: "ord1", label: "ORD-10482", href: "/orders/ord1" }, { type: "order", id: "ord2", label: "ORD-10479", href: "/orders/ord2" }, { type: "order", id: "ord3", label: "ORD-10472", href: null }] },
  deadline: { at: I1.dueAt, label: "Today, 3:30 PM" },
  resolution: null,
  resolvedAt: null,
  timeline: [{ type: "detected", actorType: "system", actorId: null, note: null, at: "2026-10-19T10:00:00.000Z" }],
  ...over,
});
const historyItem = (over: Partial<HistoryItem> = {}): HistoryItem => ({ id: "h1", title: "3 returns are waiting for approval", area: "returns", status: "resolved", updatedAt: new Date().toISOString(), resolvedBy: "Abhishek", resolution: "manual", returnsAt: null, returnsLabel: null, recommendedAction: { label: "Review returns", href: "/returns" }, ...over });
const history = (items: HistoryItem[], over: Partial<IssueHistory> = {}): IssueHistory => ({ items, page: 1, pageSize: 10, total: items.length, pages: 1, counts: { all: 2, resolved: 1, snoozed: 1 }, ...over });

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/needs-attention") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="*" element={<><NeedsAttentionPage /><Probe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const grant = (...permissions: string[]) => useWorkspaceStore.setState({ permissions });
const loc = () => screen.getByTestId("loc").textContent;
const toasts = () => useToastStore.getState().toasts;
const rows = () => screen.findAllByTestId("issue-row");

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("issues:read", "issues:write");
  refreshShell.mockResolvedValue(undefined);
  api.list.mockResolvedValue(page([I1, I2], { total: 18, pages: 2 }));
  api.counts.mockResolvedValue(counts());
  api.history.mockResolvedValue(history([historyItem(), historyItem({ id: "h2", title: "7 orders are at risk of missing dispatch", area: "orders", status: "snoozed", resolvedBy: null, resolution: null, returnsLabel: "Tomorrow, 9:00 AM" })]));
  api.recommendation.mockResolvedValue({ text: "12 of the 18 low-stock products have sold at least 3 units in the last 7 days.", evidence: {}, action: { label: "Review recommendation", href: "/inventory?health=low" } });
  api.assignees.mockResolvedValue([{ id: "u1", name: "Aayush", email: "a@x.test" }, { id: "u2", name: "Abhishek", email: "b@x.test" }]);
  api.detail.mockResolvedValue(detail());
  for (const k of ["start", "resolve", "snooze", "unsnooze", "assign"] as const) api[k].mockResolvedValue(I1);
  api.refresh.mockResolvedValue({ open: 18 });
});

describe("queue from the API", () => {
  it("shows a loading state, then the real rows, the real counters and the recommended action", async () => {
    renderPage();
    expect(screen.getByRole("status", { name: /loading issues/i })).toBeInTheDocument();
    expect(await rows()).toHaveLength(2);
    expect(screen.getByText("7 orders are at risk of missing dispatch")).toBeInTheDocument();
    expect(screen.getByText("Customer delivery risk")).toBeInTheDocument();
    expect(screen.getByText("Today, 3:30 PM")).toBeInTheDocument();
    expect(screen.getByTestId("queue-summary")).toHaveTextContent("18 open issues");
    expect(screen.getByTestId("queue-summary")).toHaveTextContent("Updated 2 min ago");
    expect(screen.getByTestId("tab-count-critical")).toHaveTextContent("3");
    expect(screen.getByTestId("tab-count-today")).toHaveTextContent("11");
    expect(screen.getByTestId("tab-count-upcoming")).toHaveTextContent("4");
    expect(screen.getByText(/12 of the 18 low-stock products/)).toBeInTheDocument();
    expect(screen.getByText("Showing 2 of 18")).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ tab: "all", page: 1, pageSize: 10 }));
  });

  it("hides the recommendation banner when the server has none", async () => {
    api.recommendation.mockResolvedValue(null);
    renderPage();
    await rows();
    expect(screen.queryByText("Recommended action")).not.toBeInTheDocument();
  });

  it("the recommendation button follows the API link through toAppPath", async () => {
    renderPage();
    await rows();
    await userEvent.click(screen.getByRole("button", { name: "Review recommendation" }));
    expect(loc()).toBe("/inventory?health=low");
  });

  it("shows the real error with a retry, and recovers", async () => {
    api.list.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "The server hiccuped", status: 500 }));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("The server hiccuped");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await rows()).toHaveLength(2);
  });

  it("is honest when nothing needs attention, and when a filter matches nothing", async () => {
    api.list.mockResolvedValue(page([]));
    api.counts.mockResolvedValue(counts({ open: 0, tabs: { all: 0, critical: 0, today: 0, upcoming: 0 } }));
    const view = renderPage();
    expect(await screen.findByText("You’re all caught up.")).toBeInTheDocument();
    expect(screen.getByTestId("queue-summary")).toHaveTextContent("0 open issues");
    view.unmount();
    renderPage("/needs-attention?area=orders");
    expect(await screen.findByText("No issues match these filters.")).toBeInTheDocument();
  });
});

describe("tabs, filters and paging live in the URL and go to the server", () => {
  it("a tab asks the API for that tab", async () => {
    renderPage();
    await rows();
    await userEvent.click(screen.getByRole("tab", { name: /Critical/ }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ tab: "critical", page: 1 })));
    expect(loc()).toBe("/needs-attention?tab=critical");
  });

  it("filters map to the API names and Clear filters removes them", async () => {
    renderPage();
    await rows();
    await userEvent.click(screen.getByRole("button", { name: "Area filter" }));
    await userEvent.click(screen.getByRole("option", { name: "Orders" }));
    await userEvent.click(screen.getByRole("button", { name: "Priority filter" }));
    await userEvent.click(screen.getByRole("option", { name: "Low" }));
    await userEvent.click(screen.getByRole("button", { name: "Status filter" }));
    await userEvent.click(screen.getByRole("option", { name: "In progress" }));
    await userEvent.click(screen.getByRole("button", { name: "Due filter" }));
    await userEvent.click(screen.getByRole("option", { name: "This week" }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ area: "orders", priority: "low", status: "in_progress", due: "this_week" })));
    expect(loc()).toBe("/needs-attention?area=orders&priority=low&status=in_progress&due=this_week");
    expect(screen.getByText(/Due this week · 18 matching issues/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(loc()).toBe("/needs-attention"));
    expect(api.list).toHaveBeenLastCalledWith(expect.not.objectContaining({ area: "orders" }));
  });

  it("starts from a shared link and pages with Next and Previous", async () => {
    api.list.mockResolvedValue(page([I2], { page: 2, total: 18, pages: 2 }));
    renderPage("/needs-attention?tab=today&area=inventory&page=2");
    await rows();
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ tab: "today", area: "inventory", page: 2 }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    api.list.mockResolvedValue(page([I1], { page: 1, total: 18, pages: 2 }));
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })));
  });
});

describe("drawer (?issue=<id>)", () => {
  it("opens from a row, shows the real detail, and closes", async () => {
    renderPage();
    await userEvent.click((await screen.findAllByRole("button", { name: /Review orders/ })).at(0) as HTMLElement);
    expect(loc()).toBe("/needs-attention?issue=i1");
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText("These orders are approaching their dispatch deadline.")).toBeInTheDocument();
    expect(within(drawer).getByText("Affected orders")).toBeInTheDocument();
    expect(within(drawer).getByText("ORD-10482")).toBeInTheDocument();
    expect(within(drawer).getByText("+4 more")).toBeInTheDocument();
    expect(within(drawer).getByText("Deadline")).toBeInTheDocument();
    expect(within(drawer).getByText("Review picking and packing status.")).toBeInTheDocument();
    expect(within(drawer).getByRole("list", { name: "Activity" })).toHaveTextContent("Detected");
    expect(within(drawer).getByText(/Open · Requires action/)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    expect(loc()).toBe("/needs-attention");
  });

  it("opens straight from a deep link and an affected record goes to the app route", async () => {
    renderPage("/needs-attention?issue=i1");
    const drawer = await screen.findByRole("dialog");
    await userEvent.click(await within(drawer).findByRole("button", { name: /ORD-10482/ }));
    expect(loc()).toBe("/orders?drawer=order:ord1");
  });

  it("says so when the issue does not exist", async () => {
    api.detail.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "Issue not found", status: 404 }));
    renderPage("/needs-attention?issue=nope");
    expect(await screen.findByText("This issue no longer exists")).toBeInTheDocument();
  });
});

describe("single issue actions", () => {
  const open = async () => {
    renderPage("/needs-attention?issue=i1");
    return within(await screen.findByRole("dialog"));
  };

  it("start marks it in progress, toasts, and refreshes the lists and the sidebar badge", async () => {
    const drawer = await open();
    await userEvent.click(await drawer.findByRole("button", { name: "Mark in progress" }));
    await waitFor(() => expect(api.start).toHaveBeenCalledWith("i1"));
    await waitFor(() => expect(refreshShell).toHaveBeenCalled());
    expect(toasts().some((t) => t.title === "Marked in progress")).toBe(true);
    await waitFor(() => expect(api.counts.mock.calls.length).toBeGreaterThan(1));
  });

  it("resolve manual calls the API in manual mode", async () => {
    const drawer = await open();
    await userEvent.click(await drawer.findByRole("button", { name: "Mark resolved" }));
    await waitFor(() => expect(api.resolve).toHaveBeenCalledWith("i1", "manual"));
    expect(toasts().some((t) => t.title === "Issue marked resolved")).toBe(true);
  });

  it("attempt is offered only for an issue the server can fix, and a failure shows the server banner", async () => {
    api.detail.mockResolvedValue(detail({ key: "channel_sync_failing", area: "channels", title: "Meesho sync is failing" }));
    api.resolve.mockRejectedValue(
      new ApiError({ code: "CONFLICT", message: "Meesho issue couldn't be resolved", status: 409, details: { rule: "resolution_failed", banner: "Meesho issue couldn't be resolved. The issue is still Open." } }),
    );
    const drawer = await open();
    await userEvent.click(await drawer.findByRole("button", { name: "Retry sync and resolve" }));
    await waitFor(() => expect(api.resolve).toHaveBeenCalledWith("i1", "attempt"));
    expect(await drawer.findByRole("alert")).toHaveTextContent("The issue is still Open.");
    expect(toasts().some((t) => t.variant === "destructive" && /still Open/.test(t.description ?? ""))).toBe(true);
  });

  it("does not offer the automatic fix for other issues", async () => {
    const drawer = await open();
    await drawer.findByRole("button", { name: "Mark resolved" });
    expect(drawer.queryByRole("button", { name: "Retry sync and resolve" })).not.toBeInTheDocument();
  });

  it("not_attemptable is explained in plain words", async () => {
    api.detail.mockResolvedValue(detail({ key: "channel_sync_failing" }));
    api.resolve.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "no", status: 409, details: { rule: "not_attemptable" } }));
    const drawer = await open();
    await userEvent.click(await drawer.findByRole("button", { name: "Retry sync and resolve" }));
    await waitFor(() => expect(toasts().some((t) => t.title === "No automatic fix")).toBe(true));
  });

  it("snooze presets send the preset; the critical limit error is shown, not hidden", async () => {
    const drawer = await open();
    await userEvent.click(await drawer.findByRole("button", { name: /Snooze/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Tomorrow" }));
    await waitFor(() => expect(api.snooze).toHaveBeenCalledWith("i1", "tomorrow"));

    api.snooze.mockRejectedValue(new ApiError({ code: "BAD_REQUEST", message: "A critical issue can be snoozed until the next business day at most", status: 400, details: { rule: "snooze_too_long" } }));
    await userEvent.click(drawer.getByRole("button", { name: /Snooze/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "This week" }));
    await waitFor(() => expect(api.snooze).toHaveBeenCalledWith("i1", "this_week"));
    await waitFor(() => expect(toasts().some((t) => t.title === "Snooze is too long" && /next business day/.test(t.description ?? ""))).toBe(true));
  });

  it("assigns to a member from the picker", async () => {
    const drawer = await open();
    await userEvent.click(await drawer.findByRole("button", { name: /Assign/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Abhishek" }));
    await waitFor(() => expect(api.assign).toHaveBeenCalledWith("i1", "u2"));
  });

  it("hides assigning when the member list is not available", async () => {
    api.assignees.mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "no", status: 403 }));
    const drawer = await open();
    await drawer.findByRole("button", { name: "Mark resolved" });
    expect(drawer.queryByRole("button", { name: /Assign/ })).not.toBeInTheDocument();
  });

  it("a snoozed issue offers unsnooze", async () => {
    api.detail.mockResolvedValue(detail({ status: "snoozed", snoozedUntil: "2026-10-21T09:00:00.000Z" }));
    const drawer = await open();
    await userEvent.click(await drawer.findByRole("button", { name: "Unsnooze" }));
    await waitFor(() => expect(api.unsnooze).toHaveBeenCalledWith("i1"));
  });
});

describe("bulk actions", () => {
  const selectBoth = async () => {
    await rows();
    await userEvent.click(screen.getByRole("checkbox", { name: /Select 7 orders/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Select 18 products/ }));
  };

  it("resolves the selection and reports per id; failed ids stay selected with their reason", async () => {
    api.bulk.mockResolvedValue({ succeeded: 1, failed: 1, results: [{ id: "i1", ok: true }, { id: "i2", ok: false, error: "The issue is already resolved" }] });
    renderPage();
    await selectBoth();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mark resolved" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith({ ids: ["i1", "i2"], action: "resolve" }));
    expect(await screen.findByText("Issue marked resolved")).toBeInTheDocument();
    expect(screen.getByText(/18 products are below their stock threshold: The issue is already resolved/)).toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await waitFor(() => expect(refreshShell).toHaveBeenCalled());
    expect(toasts().some((t) => /1 resolved, 1 failed/.test(t.title ?? ""))).toBe(true);
  });

  it("snoozes with a preset", async () => {
    api.bulk.mockResolvedValue({ succeeded: 2, failed: 0, results: [{ id: "i1", ok: true }, { id: "i2", ok: true }] });
    renderPage();
    await selectBoth();
    await userEvent.click(screen.getByRole("button", { name: /Snooze/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Later today" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith({ ids: ["i1", "i2"], action: "snooze", until: "later_today" }));
    expect(await screen.findByText("2 issues snoozed until later today")).toBeInTheDocument();
  });

  it("assigns the selection to a member", async () => {
    api.bulk.mockResolvedValue({ succeeded: 2, failed: 0, results: [{ id: "i1", ok: true }, { id: "i2", ok: true }] });
    renderPage();
    await selectBoth();
    await userEvent.click(await screen.findByRole("button", { name: /Assign/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Aayush" }));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith({ ids: ["i1", "i2"], action: "assign", assigneeId: "u1" }));
  });

  it("select all and clear", async () => {
    renderPage();
    await rows();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all issues on this page" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByText("2 selected")).not.toBeInTheDocument();
  });
});

describe("history", () => {
  it("shows resolved and snoozed rows with the server counts and filters through the API", async () => {
    renderPage("/needs-attention?view=history");
    expect(await screen.findAllByTestId("history-row")).toHaveLength(2);
    expect(screen.getByText("Marked resolved by Abhishek")).toBeInTheDocument();
    expect(screen.getByText("Returns Tomorrow, 9:00 AM")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All · 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolved · 1" })).toBeInTheDocument();
    expect(screen.getByText("History · 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resolved · 1" }));
    await waitFor(() => expect(api.history).toHaveBeenLastCalledWith("resolved", 1, 10));
    expect(loc()).toBe("/needs-attention?view=history&hstatus=resolved");
  });

  it("unsnooze brings an issue back", async () => {
    renderPage("/needs-attention?view=history");
    await userEvent.click(await screen.findByRole("button", { name: "Unsnooze" }));
    await waitFor(() => expect(api.unsnooze).toHaveBeenCalledWith("h2"));
  });

  it("switches between the queue and the history", async () => {
    renderPage();
    await rows();
    await userEvent.click(screen.getByRole("button", { name: "View history" }));
    expect(await screen.findAllByTestId("history-row")).toHaveLength(2);
    await userEvent.click(screen.getAllByRole("button", { name: /Back to open queue/ }).at(0) as HTMLElement);
    expect(await rows()).toHaveLength(2);
  });

  it("has an empty state and an error state", async () => {
    api.history.mockResolvedValue(history([], { counts: { all: 0, resolved: 0, snoozed: 0 } }));
    const view = renderPage("/needs-attention?view=history");
    expect(await screen.findByText("Nothing has been resolved or snoozed yet.")).toBeInTheDocument();
    view.unmount();
    api.history.mockRejectedValue(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    renderPage("/needs-attention?view=history");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load history");
  });
});

describe("a viewer is read-only", () => {
  beforeEach(() => grant("issues:read"));

  it("cannot select, check now, or change anything, and is told why", async () => {
    renderPage("/needs-attention?issue=i1");
    await rows();
    expect(screen.getByRole("checkbox", { name: "Select all issues on this page" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Check now" })).not.toBeInTheDocument();
    const drawer = within(await screen.findByRole("dialog"));
    expect(await drawer.findByText(/can view issues but not change them/)).toBeInTheDocument();
    for (const name of ["Mark in progress", "Mark resolved", /Snooze/]) expect(drawer.getByRole("button", { name })).toBeDisabled();
    expect(api.assignees).not.toHaveBeenCalled();
    await userEvent.click(drawer.getByRole("button", { name: "Mark resolved" }));
    expect(api.resolve).not.toHaveBeenCalled();
  });
});

describe("check now", () => {
  it("runs the detectors and refreshes", async () => {
    renderPage();
    await rows();
    await userEvent.click(screen.getByRole("button", { name: "Check now" }));
    await waitFor(() => expect(api.refresh).toHaveBeenCalled());
    await waitFor(() => expect(refreshShell).toHaveBeenCalled());
  });
});
