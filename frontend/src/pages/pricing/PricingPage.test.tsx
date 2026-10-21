import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { CompetitorsPage, PriceProposal, PricingOverview, PricingPolicy, ProposalsPage } from "@/types/pricing";

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  proposals: vi.fn(),
  proposal: vi.fn(),
  decide: vi.fn(),
  bulkDecide: vi.fn(),
  generate: vi.fn(),
  policies: vi.fn(),
  policyPreview: vi.fn(),
  createPolicy: vi.fn(),
  updatePolicy: vi.fn(),
  deletePolicy: vi.fn(),
  competitors: vi.fn(),
  addCompetitor: vi.fn(),
  importCompetitors: vi.fn(),
  deleteCompetitor: vi.fn(),
  searchVariants: vi.fn(),
  history: vi.fn(),
}));
const refreshShell = vi.hoisted(() => vi.fn());
vi.mock("@/api/pricing.api", () => ({ pricingApi: api, HISTORY_PAGE: 50 }));
vi.mock("@/lib/session", () => ({ refreshShell }));

import PricingPage from "./PricingPage";

const ACCOUNT = "22222222-2222-4222-8222-222222222222";

function proposal(over: Partial<PriceProposal> = {}): PriceProposal {
  return {
    id: "p1",
    status: "pending_review",
    strategy: "automated_match",
    variantId: "v1",
    sku: "KURTA-M",
    productTitle: "Cotton Kurta",
    accountId: ACCOUNT,
    channelName: "Main Amazon",
    marketplace: "amazon_in",
    policyId: "pol1",
    policyName: "Defend Amazon",
    currentPriceMinor: 129900,
    proposedPriceMinor: 134950,
    currency: "INR",
    priceChangeBps: 389,
    competitorPriceMinor: 135000,
    estMarginDeltaBps: 380,
    projectedSalesDeltaBps: -120,
    reasoning: "The competitor raised its price by 5%.",
    expiresAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    decisionNote: null,
    appliedAt: null,
    failureMessage: null,
    pushSkipped: false,
    version: 4,
    ...over,
  };
}

const P1 = proposal();
const P2 = proposal({ id: "p2", sku: "SHIRT-L", productTitle: "Linen Shirt", strategy: "velocity_boost", currentPriceMinor: 79900, proposedPriceMinor: 75900, priceChangeBps: -500, estMarginDeltaBps: null, competitorPriceMinor: null, projectedSalesDeltaBps: null, version: 2 });

const overview = (): PricingOverview => ({
  pendingProposals: 5,
  potentialMarginGainMinor: 4860000,
  proposalsWithoutEstimate: 2,
  autoAppliedLast30Days: 7,
  approvedLast30Days: 3,
  rejectedLast30Days: 1,
  activePolicies: 2,
  pausedPolicies: 1,
  channelsCovered: 2,
  channels: [
    { accountId: ACCOUNT, name: "Main Amazon", marketplace: "amazon_in" },
    { accountId: "33333333-3333-4333-8333-333333333333", name: "Flipkart store", marketplace: "flipkart" },
  ],
  proposalCounts: {},
  basis: "estimated",
});

const page = (items: PriceProposal[], over: Partial<ProposalsPage> = {}): ProposalsPage => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  pages: 1,
  counts: { pending_review: items.length, approved: 3, rejected: 1, auto_applied: 7, failed: 0, expired: 0, superseded: 0, all: 11 },
  ...over,
});

const POLICY: PricingPolicy = {
  id: "pol1",
  name: "Defend Amazon",
  accountId: ACCOUNT,
  channel: "Main Amazon",
  strategy: "automated_match",
  targetMarginMinBps: 2200,
  maxDiscountBps: 1200,
  autoApproveUnderBps: 300,
  params: { undercutBps: 100 },
  status: "active",
  affectedVariants: 12,
  version: 3,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/pricing") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <PricingPage />
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
const lastQuery = () => api.proposals.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("pricing:read", "pricing:write", "pricing:approve");
  refreshShell.mockResolvedValue(undefined);
  api.overview.mockResolvedValue(overview());
  api.proposals.mockResolvedValue(page([P1, P2]));
  api.policies.mockResolvedValue([POLICY]);
  api.policyPreview.mockResolvedValue({ affectedVariants: 12 });
  api.competitors.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 } satisfies CompetitorsPage);
  api.history.mockResolvedValue({ items: [], nextBefore: null });
});

describe("PricingPage proposals", () => {
  it("shows the KPI tiles from the overview and the proposals with prices, changes and reasoning", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("+₹48,600")).toBeInTheDocument();
    expect(screen.getByText(/2 without a cost price not counted/)).toBeInTheDocument();
    expect(screen.getByText("Main Amazon · Flipkart store")).toBeInTheDocument();
    expect(screen.getByText(/7 auto-applied in 30 days/)).toBeInTheDocument();

    const r1 = (await screen.findByText("Cotton Kurta")).closest("tr") as HTMLElement;
    expect(within(r1).getByText("₹1,299")).toBeInTheDocument();
    expect(within(r1).getByText("₹1,349.50")).toBeInTheDocument();
    expect(within(r1).getByText("+3.89%")).toBeInTheDocument();
    expect(within(r1).getByText("+3.8%")).toBeInTheDocument();
    const r2 = screen.getByText("Linen Shirt").closest("tr") as HTMLElement;
    // no cost price and no sales history: a dash, not a made-up number
    expect(within(r2).getAllByText("—").length).toBe(2);
    expect(lastQuery()).toMatchObject({ tab: "pending_review", sort: "impact", page: 1, pageSize: 25 });

    await user.click(within(r1).getByText("Cotton Kurta"));
    expect(await screen.findByText("The competitor raised its price by 5%.")).toBeInTheDocument();
    expect(screen.getByText("₹1,350")).toBeInTheDocument();
  });

  it("approves only after a confirmation, sends the version and note, and reports the result", async () => {
    const user = userEvent.setup();
    api.decide.mockResolvedValue({ outcome: "applied", proposal: proposal({ status: "approved" }), pushed: [{ accountId: ACCOUNT }] });
    renderPage();
    await screen.findByText("Cotton Kurta");

    await user.click(screen.getByRole("button", { name: "Approve KURTA-M" }));
    const dialog = await screen.findByRole("dialog", { name: /Approve this price/ });
    expect(api.decide).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/goes from ₹1,299 to ₹1,349.50/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Note/), "festive pricing");
    await user.click(within(dialog).getByRole("button", { name: "Confirm and apply price" }));

    await waitFor(() => expect(api.decide).toHaveBeenCalledWith("p1", "approve", { version: 4, note: "festive pricing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useToastStore.getState().toasts[0]).toMatchObject({ title: "Price applied" });
    // the queue reloads after a decision
    await waitFor(() => expect(api.proposals.mock.calls.length).toBeGreaterThan(1));
    expect(refreshShell).toHaveBeenCalled();
  });

  it("tells the seller to change the price in the seller panel when the marketplace cannot take it", async () => {
    const user = userEvent.setup();
    api.decide.mockResolvedValue({ outcome: "applied", proposal: proposal({ status: "approved" }), pushed: [{ accountId: ACCOUNT, skipped: "pricing.push not supported" }] });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Approve KURTA-M" }));
    await user.click(await screen.findByRole("button", { name: "Confirm and apply price" }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.description).toMatch(/seller panel/));
  });

  it("rejects a proposal and keeps the dialog open with the reason when the API refuses", async () => {
    const user = userEvent.setup();
    api.decide.mockRejectedValueOnce(new ApiError({ code: "INVALID_STATE", message: "expired", status: 409, details: { rule: "proposal_expired" } }));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Reject KURTA-M" }));
    await user.click(await screen.findByRole("button", { name: "Confirm rejection" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/expired before a decision/);
    expect(api.decide).toHaveBeenCalledWith("p1", "reject", { version: 4, note: undefined });
    expect(screen.getByRole("dialog", { name: /Reject this proposal/ })).toBeInTheDocument();
  });

  it("opens the version-conflict dialog and reloads the queue when someone decided first", async () => {
    const user = userEvent.setup();
    api.decide.mockRejectedValueOnce(new ApiError({ code: "VERSION_CONFLICT", message: "stale", status: 409 }));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Approve KURTA-M" }));
    await user.click(await screen.findByRole("button", { name: "Confirm and apply price" }));
    expect(await screen.findByText(/This proposal was changed by someone else/)).toBeInTheDocument();
    const before = api.proposals.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    await waitFor(() => expect(api.proposals.mock.calls.length).toBeGreaterThan(before));
  });

  it("approves a selection in one call and shows the result of each proposal", async () => {
    const user = userEvent.setup();
    api.bulkDecide.mockResolvedValue({
      action: "approve",
      total: 2,
      succeeded: 1,
      failed: 1,
      items: [
        { id: "p1", outcome: "applied" },
        { id: "p2", outcome: "failed", code: "CONFLICT", message: "The price is above the MRP" },
      ],
      pushed: [],
    });
    renderPage();
    await screen.findByText("Cotton Kurta");
    await user.click(screen.getByLabelText("Select all open proposals on this page"));
    expect(screen.getByText("2 proposals selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve selected" }));
    await user.click(await screen.findByRole("button", { name: "Confirm and apply price" }));

    await waitFor(() => expect(api.bulkDecide).toHaveBeenCalledWith(["p1", "p2"], "approve", undefined));
    const results = await screen.findByRole("dialog", { name: "Approval finished" });
    expect(within(results).getByText(/1 of 2 succeeded, 1 did not/)).toBeInTheDocument();
    expect(within(results).getByText("SHIRT-L · Main Amazon")).toBeInTheDocument();
    expect(within(results).getByText("The price is above the MRP")).toBeInTheDocument();
    await user.click(within(results).getByRole("button", { name: "Done" }));
    // what failed stays selected for another try
    expect(screen.getByText("1 proposal selected")).toBeInTheDocument();
  });

  it("hides the decision buttons from a user without pricing:approve", async () => {
    grant("pricing:read", "pricing:write");
    renderPage();
    await screen.findByText("Cotton Kurta");
    expect(screen.queryByRole("button", { name: "Approve KURTA-M" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Select all open proposals on this page")).toBeDisabled();
    expect(screen.getAllByText("View only").length).toBe(2);
  });

  it("keeps tab, filters, search and page in the URL and sends them to the API", async () => {
    const user = userEvent.setup();
    api.proposals.mockResolvedValue(page([P1], { total: 60, pages: 3 }));
    renderPage();
    await screen.findByText("Cotton Kurta");

    await user.click(screen.getByRole("tab", { name: /Approved/ }));
    expect(loc()).toBe("/pricing?tab=approved");
    await waitFor(() => expect(lastQuery()).toMatchObject({ tab: "approved" }));

    await user.selectOptions(screen.getByLabelText("Channel"), ACCOUNT);
    await waitFor(() => expect(lastQuery()).toMatchObject({ tab: "approved", accountId: ACCOUNT }));
    await user.selectOptions(screen.getByLabelText("Strategy"), "velocity_boost");
    await user.selectOptions(screen.getByLabelText("Sort proposals"), "newest");
    await waitFor(() => expect(lastQuery()).toMatchObject({ strategy: "velocity_boost", sort: "newest" }));

    await user.type(screen.getByLabelText("Search proposals"), "kurta");
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: "kurta" }), { timeout: 2000 });

    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));
    expect(loc()).toContain("page=2");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: undefined, accountId: undefined, strategy: undefined }));
  });

  it("starts from the URL: a deep link restores the tab and page", async () => {
    renderPage(`/pricing?tab=failed&page=2&sort=oldest&account=${ACCOUNT}`);
    await screen.findByText("Cotton Kurta");
    expect(lastQuery()).toMatchObject({ tab: "failed", page: 2, sort: "oldest", accountId: ACCOUNT });
  });

  it("shows a retry for a failed load and an empty state with a generate action", async () => {
    const user = userEvent.setup();
    api.proposals.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    renderPage();
    expect(await screen.findByText("Proposals could not be loaded.")).toBeInTheDocument();
    api.proposals.mockResolvedValue(page([]));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No proposals are waiting for review.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Generate proposals" }).length).toBeGreaterThan(0);
  });

  it("previews and then generates proposals", async () => {
    const user = userEvent.setup();
    const result = (dryRun: boolean) => ({
      queued: false as const,
      truncated: false,
      pushed: [],
      result: { dryRun, evaluated: 10, proposed: 4, autoApplied: 1, unchanged: 3, skipped: 2, failed: 0, items: [{ variantId: "v1", sku: "KURTA-M", accountId: ACCOUNT, status: "proposed" as const, currentPriceMinor: 129900, proposedPriceMinor: 134950, policyId: "pol1" }] },
    });
    api.generate.mockResolvedValueOnce(result(true)).mockResolvedValueOnce(result(false));
    renderPage();
    await screen.findByText("Cotton Kurta");
    await user.click(screen.getAllByRole("button", { name: "Generate proposals" })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Generate price proposals" });
    await user.selectOptions(within(dialog).getByLabelText("Channel"), ACCOUNT);
    await user.click(await within(dialog).findByRole("button", { name: "Preview only" }));
    await waitFor(() => expect(api.generate).toHaveBeenCalledWith({ dryRun: true, accountId: ACCOUNT }));
    expect(await within(dialog).findByText(/Preview, nothing was saved/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Generate proposals now" }));
    await waitFor(() => expect(api.generate).toHaveBeenLastCalledWith({ dryRun: false, accountId: ACCOUNT }));
    expect(await within(dialog).findByText(/4 proposed/)).toBeInTheDocument();
  });

  it("says a large run was queued", async () => {
    const user = userEvent.setup();
    api.generate.mockResolvedValue({ queued: true, pairs: 4200 });
    renderPage();
    await screen.findByText("Cotton Kurta");
    await user.click(screen.getAllByRole("button", { name: "Generate proposals" })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Generate price proposals" });
    await user.click(await within(dialog).findByRole("button", { name: "Generate proposals" }));
    expect(await within(dialog).findByText(/runs in the background/)).toBeInTheDocument();
  });

  it("blocks the whole screen without pricing:read", async () => {
    grant();
    renderPage();
    expect(await screen.findByText("You do not have access to pricing.")).toBeInTheDocument();
    expect(api.proposals).not.toHaveBeenCalled();
  });
});

describe("PricingPage policies", () => {
  it("pauses a policy with the version the page saw", async () => {
    const user = userEvent.setup();
    api.updatePolicy.mockResolvedValue({ ...POLICY, status: "paused", version: 4 });
    renderPage("/pricing?view=policies");
    const card = await screen.findByRole("article", { name: "Defend Amazon" });
    expect(within(card).getByText("22%")).toBeInTheDocument();
    expect(within(card).getByText("12 listings")).toBeInTheDocument();
    await user.click(within(card).getByRole("switch"));
    await waitFor(() => expect(api.updatePolicy).toHaveBeenCalledWith("pol1", { status: "paused" }, 3));
    await waitFor(() => expect(useToastStore.getState().toasts[0]).toMatchObject({ title: "Policy paused" }));
  });

  it("opens the conflict dialog when the policy changed meanwhile", async () => {
    const user = userEvent.setup();
    api.updatePolicy.mockRejectedValue(new ApiError({ code: "VERSION_CONFLICT", message: "stale", status: 409 }));
    renderPage("/pricing?view=policies");
    const card = await screen.findByRole("article", { name: "Defend Amazon" });
    await user.click(within(card).getByRole("switch"));
    expect(await screen.findByText(/This policy was changed by someone else/)).toBeInTheDocument();
  });

  it("creates a policy: validates first, then saves percentages as basis points", async () => {
    const user = userEvent.setup();
    api.createPolicy.mockResolvedValue({ ...POLICY, id: "pol2" });
    renderPage("/pricing?view=policies");
    await screen.findByRole("article", { name: "Defend Amazon" });
    await user.click(screen.getByRole("button", { name: "New policy" }));
    const dialog = await screen.findByRole("dialog", { name: "New pricing policy" });

    await user.click(within(dialog).getByRole("button", { name: "Create policy" }));
    expect(await within(dialog).findByText("Give the policy a name")).toBeInTheDocument();
    expect(api.createPolicy).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Name"), "Festive floor");
    await user.selectOptions(within(dialog).getByLabelText("Strategy"), "margin_floor");
    await user.click(within(dialog).getByRole("button", { name: "Create policy" }));
    expect(await within(dialog).findByText(/needs a minimum margin above 0%/)).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText("Margin floor"));
    await user.type(within(dialog).getByLabelText("Margin floor"), "18.5");
    await user.clear(within(dialog).getByLabelText("Auto-apply under"));
    await user.type(within(dialog).getByLabelText("Auto-apply under"), "2");
    await user.click(within(dialog).getByRole("button", { name: "Create policy" }));
    await waitFor(() =>
      expect(api.createPolicy).toHaveBeenCalledWith({
        name: "Festive floor",
        accountId: null,
        strategy: "margin_floor",
        targetMarginMinBps: 1850,
        maxDiscountBps: 0,
        autoApproveUnderBps: 200,
        params: {},
        status: "active",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New pricing policy" })).not.toBeInTheDocument());
  });

  it("puts a server field error on the field and keeps the dialog open", async () => {
    const user = userEvent.setup();
    api.createPolicy.mockRejectedValue(new ApiError({ code: "VALIDATION_FAILED", message: "bad", status: 400, details: { issues: [{ path: "maxDiscountBps", message: "Too large" }] } }));
    renderPage("/pricing?view=policies");
    await screen.findByRole("article", { name: "Defend Amazon" });
    await user.click(screen.getByRole("button", { name: "New policy" }));
    const dialog = await screen.findByRole("dialog", { name: "New pricing policy" });
    await user.type(within(dialog).getByLabelText("Name"), "x");
    await user.click(within(dialog).getByRole("button", { name: "Create policy" }));
    expect(await within(dialog).findByText("Too large")).toBeInTheDocument();
  });

  it("asks before discarding edits and before deleting", async () => {
    const user = userEvent.setup();
    api.deletePolicy.mockResolvedValue({ deleted: true });
    renderPage("/pricing?view=policies");
    const card = await screen.findByRole("article", { name: "Defend Amazon" });
    await user.click(within(card).getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit pricing policy" });
    await user.type(within(dialog).getByLabelText("Name"), " v2");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Discard your changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit pricing policy" })).not.toBeInTheDocument());

    await user.click(within(card).getByRole("button", { name: "Delete Defend Amazon" }));
    await user.click(await screen.findByRole("button", { name: "Delete policy" }));
    await waitFor(() => expect(api.deletePolicy).toHaveBeenCalledWith("pol1"));
  });

  it("disables policy changes without pricing:write", async () => {
    grant("pricing:read");
    renderPage("/pricing?view=policies");
    const card = await screen.findByRole("article", { name: "Defend Amazon" });
    expect(within(card).getByRole("switch")).toBeDisabled();
    expect(within(card).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New policy" })).toBeDisabled();
  });
});

describe("PricingPage competitor prices and history", () => {
  it("lists competitor prices and records a new one with the price parsed in paise", async () => {
    const user = userEvent.setup();
    api.competitors.mockResolvedValue({
      items: [{ id: "c1", variantId: "v1", sku: "KURTA-M", productTitle: "Cotton Kurta", accountId: null, accountName: null, priceMinor: 135000, currency: "INR", sellerName: "Rival Store", source: "manual", observedAt: "2026-10-01T10:00:00.000Z", createdAt: "2026-10-01T10:00:00.000Z" }],
      page: 1,
      pageSize: 25,
      total: 1,
      pages: 1,
    });
    api.searchVariants.mockResolvedValue([{ id: "v1", sku: "KURTA-M", productTitle: "Cotton Kurta" }]);
    api.addCompetitor.mockResolvedValue({});
    renderPage("/pricing?view=competitors");
    const row = (await screen.findByText("Rival Store")).closest("tr") as HTMLElement;
    expect(within(row).getByText("₹1,350")).toBeInTheDocument();
    expect(within(row).getByText("Any channel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add price" }));
    const dialog = await screen.findByRole("dialog", { name: "Record a competitor price" });
    await user.click(within(dialog).getByRole("button", { name: "Record price" }));
    expect(await within(dialog).findByText("Pick the product this price is for")).toBeInTheDocument();
    expect(api.addCompetitor).not.toHaveBeenCalled();

    await user.type(within(dialog).getByPlaceholderText(/Search by SKU/), "kurta");
    await user.click(await within(dialog).findByRole("button", { name: /Cotton Kurta/ }, { timeout: 2000 }));
    await user.type(within(dialog).getByLabelText("Competitor price"), "1299.5");
    await user.type(within(dialog).getByLabelText("Seller"), "Rival Store");
    await user.click(within(dialog).getByRole("button", { name: "Record price" }));
    await waitFor(() => expect(api.addCompetitor).toHaveBeenCalledWith({ variantId: "v1", accountId: null, priceMinor: 129950, sellerName: "Rival Store", observedAt: null }));
  });

  it("imports a CSV and reports each row", async () => {
    const user = userEvent.setup();
    api.importCompetitors.mockResolvedValue({ total: 2, imported: 1, skipped: 1, rows: [{ line: 2, sku: "KURTA-M", status: "imported" }, { line: 3, sku: "NOPE", status: "skipped", reason: "Unknown SKU" }] });
    renderPage("/pricing?view=competitors");
    await screen.findByText("No competitor prices yet.");
    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog", { name: "Import competitor prices" });
    expect(within(dialog).getByRole("button", { name: "Import prices" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Use an example" }));
    await user.click(within(dialog).getByRole("button", { name: "Import prices" }));
    await waitFor(() => expect(api.importCompetitors).toHaveBeenCalledWith(expect.stringContaining("sku,price,seller")));
    expect(await within(dialog).findByText("1 of 2 rows imported, 1 skipped.")).toBeInTheDocument();
    expect(within(dialog).getByText("Unknown SKU")).toBeInTheDocument();
  });

  it("deletes a competitor price after a confirmation", async () => {
    const user = userEvent.setup();
    api.competitors.mockResolvedValue({
      items: [{ id: "c1", variantId: "v1", sku: "KURTA-M", productTitle: "Cotton Kurta", accountId: null, accountName: null, priceMinor: 135000, currency: "INR", sellerName: null, source: "import", observedAt: "2026-10-01T10:00:00.000Z", createdAt: "2026-10-01T10:00:00.000Z" }],
      page: 1,
      pageSize: 25,
      total: 1,
      pages: 1,
    });
    api.deleteCompetitor.mockResolvedValue({ deleted: true });
    renderPage("/pricing?view=competitors");
    await user.click(await screen.findByRole("button", { name: "Delete competitor price for KURTA-M" }));
    expect(api.deleteCompetitor).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Delete price" }));
    await waitFor(() => expect(api.deleteCompetitor).toHaveBeenCalledWith("c1"));
  });

  it("loads the audit log newest first and fetches older changes with the cursor", async () => {
    const user = userEvent.setup();
    const row = (id: number, sku: string, oldP: number | null, newP: number | null) => ({
      id,
      variantId: "v1",
      sku,
      productTitle: "Cotton Kurta",
      accountName: "Main Amazon",
      actorName: "Asha",
      marketplaceAccountId: ACCOUNT,
      field: "marketplace" as const,
      oldPriceMinor: oldP,
      newPriceMinor: newP,
      source: "rule" as const,
      ruleId: null,
      batchId: null,
      reason: "proposal:p1",
      actorId: "u1",
      createdAt: "2026-10-01T10:00:00.000Z",
    });
    api.history.mockResolvedValueOnce({ items: [row(9, "KURTA-M", 129900, 134950)], nextBefore: 9 }).mockResolvedValueOnce({ items: [row(8, "SHIRT-L", null, 79900)], nextBefore: null });
    renderPage("/pricing?view=history");
    expect(await screen.findByText("₹1,349.50")).toBeInTheDocument();
    expect(screen.getByText("Pricing rule")).toBeInTheDocument();
    expect(api.history).toHaveBeenLastCalledWith({ accountId: undefined, field: undefined }, null, expect.anything());

    await user.click(screen.getByRole("button", { name: "Load older changes" }));
    expect(await screen.findByText("SHIRT-L")).toBeInTheDocument();
    expect(api.history).toHaveBeenLastCalledWith({ accountId: undefined, field: undefined }, 9, expect.anything());
    expect(screen.queryByRole("button", { name: "Load older changes" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Price field"), "sale");
    await waitFor(() => expect(api.history).toHaveBeenLastCalledWith({ accountId: undefined, field: "sale" }, null, expect.anything()));
    expect(loc()).toBe("/pricing?view=history&field=sale");
  });
});
