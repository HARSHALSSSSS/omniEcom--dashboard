import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import PricingPage from "./PricingPage";
import { useWorkspaceStore } from "@/store/workspace.store";
import { useToastStore } from "@/hooks/useToast";
import { ApiError } from "@/api/errors";
import type { MarginOverview, PriceProposal, PriceTableRow, PricingOverview } from "@/types/pricing";

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  marginOverview: vi.fn(),
  priceTable: vi.fn(),
  proposals: vi.fn(),
  policies: vi.fn(),
  policyPreview: vi.fn(),
  competitors: vi.fn(),
  history: vi.fn(),
  setFeeProfile: vi.fn(),
}));
const saved = vi.hoisted(() => ({ calls: [] as Array<{ blob: Blob; name: string }> }));

vi.mock("@/api/pricing.api", () => ({ pricingApi: api, HISTORY_PAGE: 50 }));
vi.mock("@/lib/session", () => ({ refreshShell: vi.fn() }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob: (blob: Blob, name: string) => saved.calls.push({ blob, name }) }));

const AMAZON = "11111111-1111-4111-8111-111111111111";

const overview = (): PricingOverview => ({
  pendingProposals: 1, potentialMarginGainMinor: 0, proposalsWithoutEstimate: 0, autoAppliedLast30Days: 0, appliedLast30Days: 0, opportunitiesCount: 0, approvedLast30Days: 0, rejectedLast30Days: 0,
  activePolicies: 1, pausedPolicies: 0, channelsCovered: 1, channels: [{ accountId: AMAZON, name: "Amazon", marketplace: "amazon" }], proposalCounts: {}, basis: "estimated",
});
const margins = (): MarginOverview => ({
  channels: [{ accountId: AMAZON, channel: "Amazon", marketplace: "amazon", priceCount: 2, pricedWithCostCount: 1, avgMarginBps: 2988, belowTargetCount: 0, targetMarginBps: null, feeTermsSummary: "fees not configured", feesConfigured: false, feePercentBps: null, fixedFeeMinor: null, unknownCostCount: 1, nextAction: "fees" }],
  totals: { productsInView: 2, productChannelPrices: 2, avgMarginBps: 2988, belowTargetCount: 0, unknownCostCount: 1, withProposalCount: 0, targetMarginBps: null },
});
const row = (over: Partial<PriceTableRow> = {}): PriceTableRow => ({
  listingId: "l1", variantId: "v1", productId: "pr1", productTitle: 'Kurta, "M"', sku: "KURTA-M", accountId: AMAZON, channel: "Amazon", marketplace: "amazon", currentPriceMinor: 49900, unitCostMinor: 30000, feesMinor: 4990,
  marginBps: 2988, targetMarginBps: 3500, belowTarget: true, proposalState: "proposed", proposalId: "p1", proposedPriceMinor: 54600, ...over,
});
const proposal = (): PriceProposal => ({
  id: "p1", status: "pending_review", strategy: "margin_floor", variantId: "v1", sku: "KURTA-M", productTitle: "Kurta", accountId: AMAZON, channelName: "Amazon", marketplace: "amazon", policyId: "pol", policyName: "Floor",
  currentPriceMinor: 49900, proposedPriceMinor: 54600, currency: "INR", priceChangeBps: 942, competitorPriceMinor: null, estMarginDeltaBps: 512, projectedSalesDeltaBps: null, reasoning: "Floor",
  unitCostMinor: 30000, feesMinor: 4990, proposedFeesMinor: 5460, currentMarginBps: 2988, proposedMarginBps: 3500, targetMarginBps: 3500, reasonCode: "below_margin_target", reasonText: "Below target.",
  expiresAt: null, createdAt: "2026-10-01T00:00:00.000Z", decidedBy: null, decidedByName: null, decidedAt: null, decisionNote: null, appliedAt: null, failureMessage: null, pushSkipped: false, version: 1,
});

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
          <Route path="*" element={<><PricingPage /><Probe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
const readBlob = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(blob);
  });
const readBytes = (blob: Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

beforeEach(() => {
  vi.clearAllMocks();
  saved.calls.length = 0;
  useToastStore.setState({ toasts: [] });
  useWorkspaceStore.setState({ permissions: ["pricing:read", "pricing:write", "pricing:approve"] });
  api.overview.mockResolvedValue(overview());
  api.marginOverview.mockResolvedValue(margins());
  api.priceTable.mockResolvedValue({ items: [row(), row({ listingId: "l2", sku: "SHOE-9", productTitle: "Shoes", unitCostMinor: null, feesMinor: null, marginBps: null, belowTarget: null, targetMarginBps: null, proposalState: "none", proposalId: null, proposedPriceMinor: null })], page: 1, pageSize: 100, total: 2, pages: 1 });
  api.proposals.mockResolvedValue({ items: [proposal()], page: 1, pageSize: 25, total: 1, pages: 1, counts: { pending_review: 1, approved: 0, rejected: 0, auto_applied: 0, failed: 0, expired: 0, superseded: 0, all: 1 } });
  api.policies.mockResolvedValue([]);
  api.competitors.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 });
  api.history.mockResolvedValue({ items: [], nextBefore: null });
});

describe("Export", () => {
  it("exports the Overview price table with the filters on screen, rupees, blanks for unknowns and a BOM", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Product & channel pricing");
    await user.click(screen.getByRole("button", { name: /Below target/ }));
    await waitFor(() => expect(api.priceTable.mock.calls.at(-1)?.[0]).toMatchObject({ state: "below_target" }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(saved.calls).toHaveLength(1));
    expect(saved.calls[0].name).toBe(`pricing-overview-${today()}.csv`);
    const exportCall = api.priceTable.mock.calls.at(-1)?.[0];
    expect(exportCall).toMatchObject({ state: "below_target", page: 1, pageSize: 100 });
    const text = await readBlob(saved.calls[0].blob);
    expect([...new Uint8Array(await readBytes(saved.calls[0].blob)).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("Product,SKU,Channel,Marketplace,Current price,Unit cost,Channel fees,Margin %,Target margin %,Below target,Proposal,Proposed price");
    expect(lines[1]).toBe('"Kurta, ""M""",KURTA-M,Amazon,amazon,499.00,300.00,49.90,29.88%,35%,Yes,Proposed,546.00');
    expect(lines[2]).toBe("Shoes,SHOE-9,Amazon,amazon,499.00,,,,,,None,");
    await waitFor(() => expect(useToastStore.getState().toasts[0]).toMatchObject({ title: "Export ready" }));
  });

  it("exports the proposals of the current tab with cost, fees, margins and the reason", async () => {
    const user = userEvent.setup();
    renderPage("/pricing?view=proposals");
    await screen.findAllByText("Kurta");
    await user.click(screen.getAllByRole("button", { name: "Export" })[0]);
    await waitFor(() => expect(saved.calls).toHaveLength(1));
    expect(saved.calls[0].name).toBe(`pricing-proposals-${today()}.csv`);
    expect(api.proposals.mock.calls.at(-1)?.[0]).toMatchObject({ tab: "pending_review", page: 1, pageSize: 100 });
    const [head, line] = (await readBlob(saved.calls[0].blob)).split("\r\n");
    expect(head).toContain("Unit cost,Channel fees,Current margin %,Proposed margin %,Target margin %,Reason code,Reason");
    expect(line).toContain("300.00,49.90,29.88%,35%,35%,below_margin_target,Below target.");
  });

  it("says when the export was capped, and reports a failure", async () => {
    const user = userEvent.setup();
    api.priceTable.mockImplementation(async (q: { page: number }) => ({ items: Array.from({ length: 100 }, (_, i) => row({ listingId: `l${q.page}-${i}` })), page: q.page, pageSize: 100, total: 12_000, pages: 120 }));
    renderPage();
    await screen.findByText("Product & channel pricing");
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.description).toMatch(/Only the first 10,000 rows/));
    expect(saved.calls).toHaveLength(1);

    useToastStore.setState({ toasts: [] });
    api.priceTable.mockRejectedValue(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]).toMatchObject({ title: "Could not export", variant: "destructive" }));
  });

  it("is available to a viewer and disabled on views without an export", async () => {
    useWorkspaceStore.setState({ permissions: ["pricing:read"] });
    renderPage("/pricing?view=competitors");
    expect(await screen.findByRole("button", { name: "Export" })).toBeDisabled();
  });
});

describe("More menu and Create price proposal", () => {
  it("opens as a menu, moves with arrows, selects, and closes on Escape and outside click", async () => {
    const user = userEvent.setup();
    renderPage();
    const more = await screen.findByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-haspopup", "menu");
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Strategy rules" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Competitor prices" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(more).toHaveFocus();

    await user.click(more);
    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(more);
    await user.click(screen.getByRole("menuitem", { name: "Competitor prices" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(new URL(screen.getByTestId("loc").textContent ?? "", "http://x").searchParams.get("view")).toBe("competitors"));
    // the chip of the secondary view stays
    expect(screen.getAllByRole("tab", { name: "Competitor prices" }).length).toBeGreaterThan(0);
  });

  it("opens the generate dialog from every tab, and is disabled with the reason for a viewer", async () => {
    const user = userEvent.setup();
    for (const view of ["", "?view=proposals", "?view=history", "?view=policies"]) {
      const { unmount } = renderPage(`/pricing${view}`);
      await user.click(await screen.findByRole("button", { name: "Generate proposals" }));
      expect(await screen.findByRole("dialog", { name: "Generate price proposals" })).toBeInTheDocument();
      unmount();
    }
    useWorkspaceStore.setState({ permissions: ["pricing:read"] });
    renderPage();
    const btn = await screen.findByRole("button", { name: "Generate proposals" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "You do not have permission to change pricing");
  });
});

describe("Channel fee editor", () => {
  it("saves the commission in basis points and the fixed fee in paise, then reloads the margins", async () => {
    const user = userEvent.setup();
    api.setFeeProfile.mockResolvedValue({ marketplaceAccountId: AMAZON, feePercentBps: 1250, fixedFeeMinor: 2500, label: null });
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Set channel fees/ }));
    const dialog = await screen.findByRole("dialog", { name: /Channel fees · Amazon/ });
    expect(dialog).toBeInTheDocument();
    const before = api.marginOverview.mock.calls.length;

    // validation first
    await user.click(screen.getByRole("button", { name: "Save fees" }));
    expect(await screen.findByText(/Enter the commission/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Commission/), "120");
    await user.type(screen.getByLabelText(/Fixed fee/), "abc");
    await user.click(screen.getByRole("button", { name: "Save fees" }));
    expect(await screen.findByText(/percentage from 0 to 100/)).toBeInTheDocument();
    expect(screen.getByText(/amount in rupees/)).toBeInTheDocument();
    expect(api.setFeeProfile).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/Commission/));
    await user.type(screen.getByLabelText(/Commission/), "12.5");
    await user.clear(screen.getByLabelText(/Fixed fee/));
    await user.type(screen.getByLabelText(/Fixed fee/), "25");
    await user.click(screen.getByRole("button", { name: "Save fees" }));
    await waitFor(() => expect(api.setFeeProfile).toHaveBeenCalledWith(AMAZON, { feePercentBps: 1250, fixedFeeMinor: 2500 }));
    await waitFor(() => expect(api.marginOverview.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Channel fees/ })).not.toBeInTheDocument());
    expect(useToastStore.getState().toasts[0]).toMatchObject({ title: "Channel fees saved" });
  });

  it("opens from the Margin context row with the saved values, and shows a server error", async () => {
    const user = userEvent.setup();
    const m = margins();
    m.channels[0] = { ...m.channels[0], feesConfigured: true, feePercentBps: 1000, fixedFeeMinor: 2500, feeTermsSummary: "10% commission + Rs 25.00 fixed", nextAction: "proposals" };
    api.marginOverview.mockResolvedValue(m);
    api.setFeeProfile.mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "Not allowed", status: 403 }));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit fees for Amazon" }));
    expect(await screen.findByLabelText(/Commission/)).toHaveValue("10");
    expect(screen.getByLabelText(/Fixed fee/)).toHaveValue("25.00");
    await user.click(screen.getByRole("button", { name: "Save fees" }));
    expect(await screen.findByText("Not allowed")).toBeInTheDocument();
  });

  it("is read-only for a viewer", async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({ permissions: ["pricing:read"] });
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Set channel fees/ }));
    expect(await screen.findByRole("button", { name: "Save fees" })).toBeDisabled();
    expect(screen.getByLabelText(/Commission/)).toBeDisabled();
  });
});
