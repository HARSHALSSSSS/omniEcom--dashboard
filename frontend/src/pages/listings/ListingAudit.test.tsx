import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { ListingChannels, ListingSync, PublishingPreparation, ReadinessAudit } from "@/types/listingAudit";

const audit = vi.hoisted(() => ({ getReadiness: vi.fn(), getPublishing: vi.fn(), getSync: vi.fn(), getChannels: vi.fn(), setAttribute: vi.fn(), bulkPublish: vi.fn() }));
vi.mock("@/api/listingAudit.api", () => ({ listingAuditApi: audit, BULK_CHUNK: 100 }));
const studio = vi.hoisted(() => ({ refreshStatus: vi.fn(), contentSync: vi.fn() }));
vi.mock("@/api/listingStudio.api", () => ({ listingStudioApi: studio }));

import { rememberBulkSelection } from "@/components/listings/audit/bulkScope";
import ListingReadinessPage from "./ListingReadinessPage";
import PublishingPreparationPage from "./PublishingPreparationPage";
import ListingSyncPage from "./ListingSyncPage";

const ID = "22222222-2222-4222-8222-222222222222";

function signIn(permissions: string[]) {
  useWorkspaceStore.getState().setSession({
    user: { id: "u1", fullName: "Asha Admin", email: "a@x.test", businessName: "Nova", role: "owner" },
    permissions,
    shell: {
      user: { id: "u1", name: "Asha Admin", initials: "AA", roleLabel: "Business owner" },
      business: { id: "b1", name: "Nova", plan: "free", tier: "starter" },
      badges: { needsAttention: 0, orders: 0, returns: 0, notifications: 0 },
      features: {},
    },
    onboardingStatus: "completed",
    onboardingResumeStep: "ready",
  });
}

function renderAt(path: string, element: React.ReactElement, route = path) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: route, element },
      { path: "/listings", element: <p>Listings page</p> },
      { path: "/listings/publish", element: <p>Publish page</p> },
      { path: "/listings/bulk", element: <p>Bulk page</p> },
    ],
    { initialEntries: [path] },
  );
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const readiness = (over: Partial<ReadinessAudit> = {}): ReadinessAudit => ({
  generatedAt: "2026-10-20T08:46:00.000Z",
  listingsEvaluated: 10,
  totalListings: 10,
  truncated: false,
  overall: { readinessPct: 72, readyListings: 5, cohortListings: 7, readyProducts: 4 },
  spectrum: { ready: 5, needs_review: 2, blocked: 1, not_listed: 2 },
  health: [
    { key: "content", label: "Content", scorePct: 92, listings: 10, checks: 30, unchecked: 0 },
    { key: "attributes", label: "Attributes", scorePct: 71, listings: 8, checks: 8, unchecked: 2 },
    { key: "media", label: "Media", scorePct: 55, listings: 10, checks: 20, unchecked: 0 },
    { key: "variants", label: "Variants", scorePct: 83, listings: 10, checks: 40, unchecked: 0 },
    { key: "compliance", label: "Compliance", scorePct: 64, listings: 10, checks: 70, unchecked: 1 },
  ],
  coverage: [{ marketplace: "amazon_in", name: "Amazon India", activeProducts: 3, totalProducts: 6, percent: 50 }],
  unlistedProducts: 4,
  journey: {
    listingId: ID,
    productTitle: "Premium Travel Bag",
    sku: "TRV-1042",
    marketplace: "amazon_in",
    marketplaceName: "Amazon India",
    accountName: "Nova Amazon",
    screenStatus: "needs_review",
    steps: [
      { key: "master", title: "Master", statusText: "Complete", state: "complete" },
      { key: "mapped", title: "Mapped", statusText: "Category mapped", state: "complete" },
      { key: "content", title: "Content ready", statusText: "material missing", state: "warning" },
      { key: "review", title: "Marketplace review", statusText: "Not submitted", state: "pending" },
      { key: "live", title: "Live", statusText: "Pending", state: "pending" },
    ],
  },
  suggestions: [
    {
      id: "attr:amazon_in:material",
      marketplace: "amazon_in",
      marketplaceName: "Amazon India",
      attribute: "material",
      label: "Material",
      title: "2 Amazon India listings are missing material information",
      description: "Material is required for these marketplace categories.",
      note: "Requires merchant confirmation before applying",
      suggestedValue: "Cotton",
      valueSource: "Already set on TRV-1042 (Meesho)",
      listingIds: ["l1", "l2"],
      listings: [
        { id: "l1", sku: "TRV-1", productTitle: "Travel bag" },
        { id: "l2", sku: "TRV-2", productTitle: "Duffel" },
      ],
      total: 2,
    },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  signIn(["listings:read", "listings:write"]);
});

describe("ListingReadinessPage", () => {
  it("shows the real audit: KPI, spectrum counts, health, coverage and the journey", async () => {
    audit.getReadiness.mockResolvedValue(readiness());
    renderAt("/listings/readiness", <ListingReadinessPage />);
    expect(await screen.findByRole("heading", { name: "Listing readiness" })).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText("Go to Publishing (4 ready)")).toBeInTheDocument();
    expect(screen.getByText("Ready (5)")).toBeInTheDocument();
    expect(screen.getByText("Not listed (2)")).toBeInTheDocument();
    expect(screen.getByText(/4 products can be published without additional changes\. 72% readiness/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Attributes" })).toHaveAttribute("aria-valuenow", "71");
    expect(screen.getByText("2 listings not validated yet")).toBeInTheDocument();
    // the design's five bars: Content, Attributes, Media, Variants, Compliance, each with a computed score
    expect(screen.getAllByRole("progressbar").slice(0, 5).map((b) => b.getAttribute("aria-label"))).toEqual(["Content", "Attributes", "Media", "Variants", "Compliance"]);
    expect(screen.getByRole("progressbar", { name: "Variants" })).toHaveAttribute("aria-valuenow", "83");
    expect(screen.getByRole("progressbar", { name: "Compliance" })).toHaveAttribute("aria-valuenow", "64");
    expect(screen.getByText("1 listing not validated yet")).toBeInTheDocument();
    expect(screen.getByText("3 / 6")).toBeInTheDocument();
    expect(screen.getByText(/4 products are not currently listed/)).toBeInTheDocument();
    expect(screen.getByText("material missing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open listing →" })).toHaveAttribute("href", `/listings/${ID}`);
  });

  it("changes nothing until the merchant confirms, then patches every listing of the suggestion", async () => {
    audit.getReadiness.mockResolvedValue(readiness());
    audit.setAttribute.mockResolvedValue(undefined);
    renderAt("/listings/readiness", <ListingReadinessPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Review suggestions" }));
    expect(audit.setAttribute).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Material");
    expect(input).toHaveValue("Cotton");
    await userEvent.clear(input);
    await userEvent.type(input, "Linen");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply to 2 listings" }));

    await waitFor(() => expect(audit.setAttribute).toHaveBeenCalledTimes(2));
    expect(audit.setAttribute).toHaveBeenCalledWith("l1", "material", "Linen");
    expect(audit.setAttribute).toHaveBeenCalledWith("l2", "material", "Linen");
    expect(await screen.findByText(/Material set to 'Linen' on 2 Amazon India listings/)).toBeInTheDocument();
  });

  it("asks for the value when none is known, keeps Apply off until typed, and can dismiss", async () => {
    const [s] = readiness().suggestions as [ReadinessAudit["suggestions"][number]];
    audit.getReadiness.mockResolvedValue(readiness({ suggestions: [{ ...s, suggestedValue: null, valueSource: null }] }));
    renderAt("/listings/readiness", <ListingReadinessPage />);
    expect(await screen.findByText(/No value is known yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Review suggestions" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Apply to 2 listings" })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(s.title)).not.toBeInTheDocument();
  });

  it("disables the review button without edit permission and says when the catalogue was sampled", async () => {
    signIn(["listings:read"]);
    audit.getReadiness.mockResolvedValue(readiness({ truncated: true, listingsEvaluated: 1000, totalListings: 4200 }));
    renderAt("/listings/readiness", <ListingReadinessPage />);
    expect(await screen.findByRole("button", { name: "Review suggestions" })).toBeDisabled();
    expect(screen.getByText(/1,000 most recently updated of 4,200 listings/)).toBeInTheDocument();
  });

  it("shows an error with a retry", async () => {
    audit.getReadiness.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(readiness());
    renderAt("/listings/readiness", <ListingReadinessPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("72%")).toBeInTheDocument();
  });
});

const prep = (over: Partial<PublishingPreparation> = {}): PublishingPreparation => ({
  generatedAt: "2026-10-20T08:46:00.000Z",
  listingsEvaluated: 12,
  totalListings: 12,
  truncated: false,
  candidateListings: 9,
  readyListings: 6,
  blockedListings: 3,
  readyProducts: 5,
  readyVariants: 6,
  potentialIssueProducts: 3,
  unvalidatedListings: 2,
  readyListingIds: ["a", "b", "c", "d", "e", "f"],
  readyIdsTruncated: false,
  issues: [
    { id: "x1", listingId: "l9", productId: "p9", productTitle: "Cotton Overshirt", sku: "OS-2048", marketplace: "amazon_in", marketplaceName: "Amazon India", issue: "Material is required", severity: "blocker", field: "material", fixAction: "fill_attribute" },
    { id: "x2", listingId: "l8", productId: "p8", productTitle: "Linen Shirt", sku: "LS-1", marketplace: "flipkart", marketplaceName: "Flipkart", issue: "No brand", severity: "warning", field: "brand", fixAction: "edit_content" },
  ],
  issuesTotal: 2,
  channels: [
    {
      marketplace: "amazon_in",
      name: "Amazon India",
      ready: 4,
      blocked: 2,
      warnings: 1,
      categories: ["Apparel"],
      accounts: [{ id: "acc1", name: "Nova Amazon", status: "active" }],
      pricingRule: { policyId: "pol1", name: "Amazon margin floor", strategy: "margin_floor", strategyLabel: "Margin floor", scope: "account", summary: "Margin floor · margin never under 15%" },
      sync: { mode: "real_time", label: "Real-time", detail: "Orders arrive by webhook; stock is pushed when it changes" },
    },
    {
      marketplace: "flipkart",
      name: "Flipkart",
      ready: 2,
      blocked: 1,
      warnings: 0,
      categories: [],
      accounts: [{ id: "acc2", name: "Nova Flipkart", status: "revoked" }],
      pricingRule: null,
      sync: { mode: "polling", label: "Polling every 5 min", detail: "Orders polled every 5 min" },
    },
  ],
  publishLock: { locked: ["price", "MRP"], notLocked: ["stock"], statement: "The price, MRP and content you approve are locked to this approval. Stock is not locked and keeps syncing." },
  ...over,
});

describe("PublishingPreparationPage", () => {
  it("shows the real cohort and lists the issues with a resolve link per kind", async () => {
    audit.getPublishing.mockResolvedValue(prep());
    renderAt("/listings/publish", <PublishingPreparationPage />);
    expect(await screen.findByRole("heading", { name: "Publishing preparation" })).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Within the ready cohort")).toBeInTheDocument();
    expect(screen.getByText(/6 of 9 unpublished listings are ready; 3 are blocked/)).toBeInTheDocument();
    expect(screen.getByText("Amazon India 4 · Flipkart 2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Review issues →" }));
    const links = screen.getAllByRole("link", { name: "Resolve →" });
    expect(links[0]).toHaveAttribute("href", "/listings/l9/blocked");
    expect(links[1]).toHaveAttribute("href", "/listings/l8");
    expect(screen.getByRole("link", { name: /bulk screen are a separate scope/ })).toHaveAttribute("href", "/listings/bulk");
  });

  it("walks the three stages and shows the channels from the data", async () => {
    audit.getPublishing.mockResolvedValue(prep());
    renderAt("/listings/publish", <PublishingPreparationPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Review before publishing" }));
    expect(screen.getByText("Channel Payload Review")).toBeInTheDocument();
    expect(screen.getByText("Target taxonomy: Apparel")).toBeInTheDocument();
    expect(screen.getByText("No marketplace category mapped yet")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    // the pricing rule and the sync mode of each channel come from the active pricing policy and the connector
    expect(screen.getByText("Pricing rule: Amazon margin floor")).toBeInTheDocument();
    expect(screen.getByText("Sync: Real-time")).toBeInTheDocument();
    expect(screen.getByText("Margin floor · margin never under 15%")).toBeInTheDocument();
    expect(screen.getByText("Pricing rule: None (prices stay as set)")).toBeInTheDocument();
    expect(screen.getByText("Sync: Polling every 5 min")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Proceed to final confirmation →" }));
    expect(screen.getByText("You are about to publish 5 products (6 variants) across 2 marketplaces.")).toBeInTheDocument();
    expect(screen.getByText(/The price, MRP and content you approve are locked to this approval/)).toBeInTheDocument();
  });

  it("words the bulk scope with the selected count from the link, else from the last bulk review", async () => {
    audit.getPublishing.mockResolvedValue(prep());
    const first = renderAt("/listings/publish?selected=18", <PublishingPreparationPage />, "/listings/publish");
    expect(await screen.findByRole("link", { name: "The 18 selected listings in the bulk screen are a separate scope →" })).toHaveAttribute("href", "/listings/bulk");
    first.unmount();

    rememberBulkSelection(["a", "b", "c"]);
    const second = renderAt("/listings/publish", <PublishingPreparationPage />);
    expect(await screen.findByRole("link", { name: "The 3 selected listings in the bulk screen are a separate scope →" })).toHaveAttribute("href", "/listings/bulk?ids=a,b,c");
    second.unmount();

    sessionStorage.clear();
    renderAt("/listings/publish?selected=1", <PublishingPreparationPage />, "/listings/publish");
    expect(await screen.findByRole("link", { name: "The 1 selected listing in the bulk screen is a separate scope →" })).toBeInTheDocument();
  });

  it("publishes exactly the ready ids only after the acknowledgement, and reports failures", async () => {
    audit.getPublishing.mockResolvedValue(prep());
    audit.bulkPublish.mockResolvedValue({ total: 6, succeeded: 5, failed: 1, skipped: 0, failures: [{ id: "f", sku: "SKU-F", message: "Validation failed" }] });
    renderAt("/listings/publish", <PublishingPreparationPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Review before publishing" }));
    await userEvent.click(screen.getByRole("button", { name: "Proceed to confirmation" }));
    const [publishButton] = screen.getAllByRole("button", { name: /Confirm & publish cohort/ });
    expect(publishButton).toBeDisabled();
    await userEvent.click(screen.getAllByRole("checkbox")[0] as HTMLElement);
    expect(publishButton).toBeEnabled();
    await userEvent.click(publishButton as HTMLElement);
    await waitFor(() => expect(audit.bulkPublish).toHaveBeenCalledWith(["a", "b", "c", "d", "e", "f"]));
    expect(await screen.findByText(/Publishing started for 5 listings, 1 failed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SKU-F" })).toHaveAttribute("href", "/listings/f");
  });

  it("cannot publish when nothing is ready or without write permission", async () => {
    audit.getPublishing.mockResolvedValue(prep({ readyListings: 0, readyProducts: 0, readyVariants: 0, readyListingIds: [] }));
    renderAt("/listings/publish", <PublishingPreparationPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Review before publishing" }));
    await userEvent.click(screen.getByRole("button", { name: "Proceed to confirmation" }));
    expect(screen.getByText("No listing is ready to publish right now.")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("checkbox")[0] as HTMLElement);
    for (const b of screen.getAllByRole("button", { name: /Confirm & publish cohort/ })) expect(b).toBeDisabled();
    expect(audit.bulkPublish).not.toHaveBeenCalled();
  });
});

const sync = (over: Partial<ListingSync> = {}): ListingSync => ({
  listingId: ID,
  generatedAt: "2026-10-20T08:46:00.000Z",
  listing: { id: ID, productId: "p1", productTitle: "Cotton Overshirt", sku: "OS-2048", variantsCount: 3, marketplace: "meesho", marketplaceName: "Meesho", accountName: "Nova Meesho", status: "pending", screenStatus: "syncing", externalListingId: null },
  state: "syncing",
  startedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  lastSyncedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  steps: [
    { key: "content", label: "Content update", status: "complete", progressPct: 100, progress: null, detail: "The marketplace shows the current content", at: null, jobId: null },
    { key: "stock", label: "Stock sync", status: "pending", progressPct: 0, progress: null, detail: "Stock is sent once the marketplace approves the listing", at: null, jobId: null },
    { key: "listing", label: "Listing update", status: "in_progress", progressPct: null, progress: null, detail: "Submitted: waiting for the marketplace review", at: null, jobId: "j1" },
  ],
  jobs: [{ id: "j1", type: "listing_publish", status: "running", scheduledAt: "2026-10-20T08:40:00.000Z", startedAt: "2026-10-20T08:41:00.000Z", finishedAt: null, attempts: 1, maxAttempts: 5, progress: { total: 0, done: 0, failed: 0 }, error: null }],
  ...over,
});
const channels = (): ListingChannels => ({
  listingId: ID,
  productId: "p1",
  productTitle: "Cotton Overshirt",
  variantId: "v1",
  sku: "OS-2048",
  variantsCount: 3,
  channels: [
    { accountId: "a1", accountName: "Nova Meesho", marketplace: "meesho", marketplaceName: "Meesho", listingId: ID, screenStatus: "syncing", readinessPercent: 90, lastSyncAt: null, externalUrl: null, current: true },
    { accountId: "a2", accountName: "Nova Amazon", marketplace: "amazon_in", marketplaceName: "Amazon India", listingId: "l2", screenStatus: "live", readinessPercent: 100, lastSyncAt: new Date(Date.now() - 8 * 60_000).toISOString(), externalUrl: null, current: false },
    { accountId: "a3", accountName: "Nova Flipkart", marketplace: "flipkart", marketplaceName: "Flipkart", listingId: null, screenStatus: "not_listed", readinessPercent: null, lastSyncAt: null, externalUrl: null, current: false },
  ],
});

describe("ListingSyncPage", () => {
  it("shows the sync telemetry from real steps and the other channels", async () => {
    audit.getSync.mockResolvedValue(sync());
    audit.getChannels.mockResolvedValue(channels());
    renderAt(`/listings/${ID}/sync`, <ListingSyncPage />, "/listings/:id/sync");
    expect(await screen.findByText("Sync in progress · Meesho")).toBeInTheDocument();
    expect(screen.getByText("Started 3 min ago")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cotton Overshirt" })).toBeInTheDocument();
    expect(screen.getByText("OS-2048 · 3 variants · Last synced 3 min ago")).toBeInTheDocument();
    // a step without a total is indeterminate: no invented percentage
    const listing = screen.getByRole("progressbar", { name: "Listing update" });
    expect(listing).not.toHaveAttribute("aria-valuenow");
    expect(listing).toHaveAttribute("aria-valuetext", "In progress");
    expect(screen.getByRole("progressbar", { name: "Content update" })).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("Stock is sent once the marketplace approves the listing")).toBeInTheDocument();
    expect(await screen.findByText("No listing yet")).toBeInTheDocument();
    expect(screen.getByText("8 min ago")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Amazon India" })).toHaveAttribute("href", "/listings/l2/sync");
    expect(audit.getSync).toHaveBeenCalledWith(ID);
  });

  it("shows each step with its real percentage and the counts the running job reports", async () => {
    audit.getSync.mockResolvedValue(
      sync({
        steps: [
          { key: "content", label: "Content update", status: "in_progress", progressPct: 25, progress: { done: 3, total: 12, failed: 1, unit: "listings" }, detail: "The latest product content is on its way", at: null, jobId: "j1" },
          { key: "stock", label: "Stock sync", status: "complete", progressPct: 100, progress: null, detail: "The marketplace confirmed 5 units", at: null, jobId: null },
          { key: "listing", label: "Listing update", status: "in_progress", progressPct: 67, progress: { done: 2, total: 3, failed: 0, unit: "stages" }, detail: "Sending the listing to the marketplace", at: null, jobId: "j2" },
        ],
      }),
    );
    audit.getChannels.mockResolvedValue(channels());
    renderAt(`/listings/${ID}/sync`, <ListingSyncPage />, "/listings/:id/sync");
    expect(await screen.findByRole("progressbar", { name: "Content update" })).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText(/3 of 12 listings \(1 failed\) · The latest product content is on its way/)).toBeInTheDocument();
    expect(screen.getByText("Complete · 100%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Listing update" })).toHaveAttribute("aria-valuenow", "67");
    expect(screen.getByText(/2 of 3 stages · Sending the listing to the marketplace/)).toBeInTheDocument();
  });

  it("starts the marketplace status check through the listing endpoint", async () => {
    audit.getSync.mockResolvedValue(sync());
    audit.getChannels.mockResolvedValue(channels());
    studio.refreshStatus.mockResolvedValue({ job: { id: "j2", status: "queued", error: null }, alreadyQueued: false });
    renderAt(`/listings/${ID}/sync`, <ListingSyncPage />, "/listings/:id/sync");
    await userEvent.click(await screen.findByRole("button", { name: "Check marketplace status" }));
    await waitFor(() => expect(studio.refreshStatus).toHaveBeenCalledWith(ID));
  });

  it("reports a failed step as needing attention and offers the content resend", async () => {
    audit.getSync.mockResolvedValue(
      sync({
        state: "attention",
        steps: [
          { key: "content", label: "Content update", status: "failed", progressPct: 0, progress: null, detail: "Marketplace said no", at: null, jobId: null },
          { key: "stock", label: "Stock sync", status: "complete", progressPct: 100, progress: null, detail: "ok", at: null, jobId: null },
          { key: "listing", label: "Listing update", status: "complete", progressPct: 100, progress: null, detail: "live", at: null, jobId: null },
        ],
      }),
    );
    audit.getChannels.mockResolvedValue(channels());
    studio.contentSync.mockResolvedValue({ job: { id: "j3", status: "queued", error: null }, alreadyQueued: false });
    renderAt(`/listings/${ID}/sync`, <ListingSyncPage />, "/listings/:id/sync");
    expect(await screen.findByText("Sync needs attention · Meesho")).toBeInTheDocument();
    expect(screen.getByText("Content update: Marketplace said no")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send latest content" }));
    await waitFor(() => expect(studio.contentSync).toHaveBeenCalledWith(ID));
  });

  it("shows an error with a way back when the listing cannot be loaded", async () => {
    audit.getSync.mockRejectedValue(new Error("Listing not found"));
    audit.getChannels.mockResolvedValue(channels());
    renderAt(`/listings/${ID}/sync`, <ListingSyncPage />, "/listings/:id/sync");
    expect(await screen.findByRole("alert")).toHaveTextContent("Listing not found");
    await userEvent.click(screen.getByRole("button", { name: "← Back to Listings" }));
    expect(await screen.findByText("Listings page")).toBeInTheDocument();
  });
});
