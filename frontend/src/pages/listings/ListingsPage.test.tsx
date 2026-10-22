import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { BulkListingsResponse, ChannelSummary, ListingRow, ListingsInsights, ListingsMatrix, ListingsOverview, ListingsTablePage, NotListedPage } from "@/types/listing";

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  matrix: vi.fn(),
  insights: vi.fn(),
  table: vi.fn(),
  notListed: vi.fn(),
  productListings: vi.fn(),
  bulk: vi.fn(),
  create: vi.fn(),
  syncJob: vi.fn(),
  channels: vi.fn(),
  channelSummary: vi.fn(),
  filterOptions: vi.fn(),
  bulkCreate: vi.fn(),
  searchProducts: vi.fn(),
}));
const refreshShell = vi.hoisted(() => vi.fn());
vi.mock("@/api/listings.api", () => ({ listingsApi: api }));
vi.mock("@/lib/session", () => ({ refreshShell }));
vi.mock("@/components/listings/flows/BulkContentEditDialog", async () => {
  const React = await import("react");
  return {
    BulkContentEditDialog: (p: { open: boolean; listingIds: string[]; onClose: () => void; onDone: () => void }) =>
      p.open
        ? React.createElement(
            "section",
            { "data-testid": "bulk-edit" },
            p.listingIds.join(","),
            React.createElement("button", { type: "button", onClick: p.onDone }, "Finish editing"),
            React.createElement("button", { type: "button", onClick: p.onClose }, "Close editor"),
          )
        : null,
  };
});
vi.mock("./ListingDetailDrawer", async () => {
  const React = await import("react");
  return { ListingDetailDrawer: (p: { listingId: string | null }) => (p.listingId ? React.createElement("aside", { "data-testid": "drawer" }, p.listingId) : null) };
});

import ListingsPage from "./ListingsPage";

const PRODUCT = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const CATEGORY = "44444444-4444-4444-8444-444444444444";

function row(over: Partial<ListingRow> = {}, table: Partial<ListingRow["table"]> = {}): ListingRow {
  return {
    id: "l1",
    marketplaceAccountId: ACCOUNT,
    marketplace: "amazon_in",
    variantId: "v1",
    productId: PRODUCT,
    sku: "KURTA-M",
    productTitle: "Cotton Kurta",
    externalSku: "KURTA-M",
    externalListingId: "B0ASIN1",
    status: "active",
    source: "created",
    currency: "INR",
    publishedAt: null,
    contentState: "synced",
    contentChangedFields: [],
    contentError: null,
    issues: [],
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
    table: {
      screenStatus: "live",
      barcode: null,
      thumbnailUrl: null,
      imageCount: 2,
      categoryName: "Kurtas",
      marketplaceName: "Amazon India",
      accountName: "Main store",
      marketplaceCategoryName: null,
      priceMinor: 129900,
      mrpMinor: 149900,
      salePriceMinor: null,
      saleEndsAt: null,
      stock: { available: 12, sellable: 9, pushed: 9, dirty: false },
      readiness: { percent: 95, ready: true, errors: 0, warnings: 0, attributesChecked: true, topBlocker: null },
      externalListingId: "B0ASIN1",
      externalUrl: null,
      lastSyncAt: null,
      ...table,
    },
  };
}

const L1 = row();
const L2 = row(
  { id: "l2", sku: "SHIRT-L", productTitle: "Linen Shirt", contentState: "needs_review", status: "ready" },
  { screenStatus: "ready", marketplaceName: "Flipkart", priceMinor: 79900, mrpMinor: null, stock: { available: 0, sellable: 0, pushed: null, dirty: true }, readiness: { percent: 60, ready: false, errors: 1, warnings: 0, attributesChecked: true, topBlocker: { message: "Add a brand", field: "brand" } } },
);

const overview = (): ListingsOverview => ({
  totals: { listings: 40, live: 25, needsAttention: 6, notListed: 11 },
  byScreenStatus: { live: 25, ready: 4, needs_review: 3, syncing: 2, failed: 1, blocked: 5, not_listed: 11 },
  byStatus: { draft: 7 },
  byContentState: {},
  byMarketplace: [],
});

const matrix = (): ListingsMatrix => ({
  total: 427,
  channels: [
    { code: "amazon_in", name: "Amazon India", accounts: 1, connected: true },
    { code: "flipkart", name: "Flipkart", accounts: 1, connected: false },
  ],
  items: [
    {
      productId: PRODUCT,
      title: "Cotton Kurta",
      sku: "P-KURTA",
      variantsCount: 3,
      signal: "needs_review",
      channels: {
        amazon_in: { status: "needs_review", listings: 2, listedVariants: 2, byStatus: { needs_review: 1, live: 1 } },
        flipkart: { status: "not_listed", listings: 0, listedVariants: 0, byStatus: {} },
      },
    },
  ],
});

const insights = (): ListingsInsights => ({
  masterProducts: 427,
  connectedChannels: 2,
  activeListings: 25,
  readyToPublish: 4,
  needReview: 3,
  issues: { notReady: 9, missingAttributes: 4, missingImages: 3, categoryMismatch: 2, variantIssues: 1 },
});

const page = (items: ListingRow[], over: Partial<ListingsTablePage> = {}): ListingsTablePage => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  pages: 1,
  counts: { all: items.length, live: 1, ready: 1, needs_review: 0, syncing: 0, failed: 0, blocked: 0 },
  ...over,
});

const channel = (code: string, name: string, over: Partial<ChannelSummary["channels"][number]> = {}): ChannelSummary["channels"][number] => ({
  code,
  name,
  implementation: "ga",
  listable: true,
  group: null,
  accounts: 0,
  activeAccounts: 0,
  connected: false,
  listings: 0,
  live: 0,
  needsAttention: 0,
  drafts: 0,
  notListed: 0,
  ...over,
});

const summary = (): ChannelSummary => ({
  channels: [
    channel("amazon_in", "Amazon India", { accounts: 1, activeAccounts: 1, connected: true, listings: 30 }),
    channel("flipkart", "Flipkart", { accounts: 1, activeAccounts: 1, connected: true, listings: 8 }),
    channel("meesho", "Meesho", { group: "social", accounts: 1, activeAccounts: 1, connected: true, listings: 2 }),
    channel("shopify", "Shopify", { group: "social" }),
    channel("snapdeal", "Snapdeal"),
    channel("myntra", "Myntra", { accounts: 1, activeAccounts: 0, listings: 1 }),
    channel("mock", "Mock marketplace"),
  ],
  groups: [{ code: "social", name: "Social Commerce", marketplaces: ["meesho", "shopify"], accounts: 1, activeAccounts: 1, connected: true, listings: 2, live: 0, needsAttention: 0, drafts: 0, notListed: 0 }],
});

const NOT_LISTED: NotListedPage = {
  items: [
    { variantId: "v9", productId: PRODUCT, sku: "SAREE-1", barcode: null, productTitle: "Silk Saree", priceMinor: 250000, mrpMinor: 300000, accountId: ACCOUNT, accountName: "Main store", marketplace: "amazon_in", marketplaceName: "Amazon India" },
    { variantId: "v10", productId: PRODUCT, sku: "SAREE-2", barcode: null, productTitle: "Cotton Saree", priceMinor: 100000, mrpMinor: null, accountId: ACCOUNT, accountName: "Main store", marketplace: "amazon_in", marketplaceName: "Amazon India" },
  ],
  page: 1,
  pageSize: 25,
  total: 2,
  pages: 1,
};

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/listings") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ListingsPage />
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
const lastTableQuery = () => api.table.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("listings:read", "listings:write", "marketplace_accounts:read");
  refreshShell.mockResolvedValue(undefined);
  api.overview.mockResolvedValue(overview());
  api.matrix.mockResolvedValue(matrix());
  api.insights.mockResolvedValue(insights());
  api.table.mockResolvedValue(page([L1, L2]));
  api.notListed.mockResolvedValue(NOT_LISTED);
  api.productListings.mockResolvedValue(page([L1], { counts: { all: 1, live: 1, ready: 0, needs_review: 0, syncing: 0, failed: 0, blocked: 0 } }));
  api.channels.mockResolvedValue({
    accounts: [{ id: ACCOUNT, marketplace: "amazon_in", displayName: "Main store", status: "active" }],
    marketplaces: [{ code: "amazon_in", name: "Amazon India" }],
  });
  api.channelSummary.mockResolvedValue(summary());
  api.filterOptions.mockResolvedValue({ categories: [{ id: CATEGORY, name: "Kurtas", path: "kurtas", listings: 12 }] });
  api.searchProducts.mockResolvedValue([
    { id: PRODUCT, title: "Cotton Kurta", sku: "P-KURTA", variantCount: 3, thumbnailUrl: null },
    { id: "33333333-3333-4333-8333-333333333333", title: "Linen Shirt", sku: "P-SHIRT", variantCount: 1, thumbnailUrl: null },
  ]);
});

describe("ListingsPage", () => {
  it("shows the tab counts from the overview and the rows with price, stock, readiness and content chips", async () => {
    renderPage();
    const tabs = await screen.findByRole("tablist", { name: "Listing status" });
    await waitFor(() => expect(within(tabs).getByRole("tab", { name: /All/ })).toHaveTextContent("40"));
    expect(within(tabs).getByRole("tab", { name: /Needs review/ })).toHaveTextContent("3");
    expect(within(tabs).getByRole("tab", { name: /Blocked/ })).toHaveTextContent("5");
    expect(within(tabs).getByRole("tab", { name: /Not listed/ })).toHaveTextContent("11");

    const r1 = (await screen.findByRole("link", { name: "Cotton Kurta" })).closest('[role="row"]') as HTMLElement;
    expect(within(r1).getByText("₹1,299")).toBeInTheDocument();
    expect(within(r1).getByRole("img", { name: "Readiness 95 percent" })).toBeInTheDocument();
    expect(within(r1).getByText("Amazon India")).toBeInTheDocument();
    expect(within(r1).getByText("B0ASIN1")).toBeInTheDocument();
    expect(within(r1).getByText("Live")).toBeInTheDocument();

    const r2 = screen.getByRole("link", { name: "Linen Shirt" }).closest('[role="row"]') as HTMLElement;
    expect(within(r2).getByText("Push pending")).toBeInTheDocument();
    expect(within(r2).getByText("Add a brand")).toBeInTheDocument();
    expect(within(r2).getByText(/Content: Needs review/)).toBeInTheDocument();
    expect(within(r2).getByRole("link", { name: /Resolve content update/ })).toHaveAttribute("href", "/listings/l2");
    expect(lastTableQuery()).toMatchObject({ tab: "all", page: 1, pageSize: 25, sort: "-updatedAt" });
  });

  it("shows the catalogue reach, the matrix and why listings are not ready from the API", async () => {
    renderPage();
    const reach = await screen.findByRole("region", { name: "Catalog reach" });
    await waitFor(() => expect(within(reach).getByText("25")).toBeInTheDocument());
    expect(within(reach).getByText("427")).toBeInTheDocument();
    expect(within(reach).getByRole("link", { name: /ready to publish/ })).toHaveAttribute("href", "/listings/publish");
    expect(within(reach).getByText("4")).toBeInTheDocument();

    const grid = await screen.findByRole("region", { name: "Listing matrix" });
    expect(within(grid).getByText("Amazon India")).toBeInTheDocument();
    expect(within(grid).getByText("P-KURTA · 3 variants")).toBeInTheDocument();
    expect(within(grid).getByText("2 of 3 variants")).toBeInTheDocument();
    expect(within(grid).getByText("Not published")).toBeInTheDocument();
    expect(within(grid).getByText(/Showing 1 of 427 master products/)).toBeInTheDocument();
    expect(within(grid).getByRole("link", { name: "Manage →" })).toHaveAttribute("href", `/products/${PRODUCT}`);

    const why = await screen.findByRole("region", { name: "Why not live" });
    expect(within(why).getByText("9 listings are not ready to publish")).toBeInTheDocument();
    expect(within(why).getByRole("button", { name: /4 Missing attributes/ })).toBeInTheDocument();
    expect(within(why).getByRole("button", { name: /3 Missing images/ })).toBeInTheDocument();
    expect(within(why).getByRole("button", { name: /2 Category mismatch/ })).toBeInTheDocument();
    expect(within(why).getByRole("button", { name: /1 Variant issues/ })).toBeInTheDocument();
    // the readiness audit stays one click away
    expect(within(why).getByRole("link", { name: "Audit readiness →" })).toHaveAttribute("href", "/listings/readiness");

    const user = userEvent.setup();
    await user.click(within(reach).getByRole("button", { name: /need review/ }));
    expect(loc()).toBe("/listings?tab=needs_review");
    await user.click(within(why).getByRole("button", { name: "Filter by issue →" }));
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ tab: "all", attention: true }));
    expect(loc()).toBe("/listings?attention=true");
  });

  it("opens the listing workflow screens from the rows", async () => {
    const user = userEvent.setup();
    const review = row({ id: "r1", sku: "REV-1", productTitle: "Review Tee", contentState: "synced" }, { screenStatus: "needs_review" });
    const blocked = row({ id: "b1", sku: "BLK-1", productTitle: "Blocked Tee" }, { screenStatus: "blocked" });
    const syncing = row({ id: "s1", sku: "SYN-1", productTitle: "Syncing Tee" }, { screenStatus: "syncing" });
    const failed = row({ id: "f1", sku: "FAI-1", productTitle: "Failed Tee" }, { screenStatus: "failed" });
    api.table.mockResolvedValue(page([L1, review, blocked, syncing, failed]));
    renderPage();
    await screen.findByRole("link", { name: "Review Tee" });
    const rowOf = (title: string) => screen.getByRole("link", { name: title }).closest('[role="row"]') as HTMLElement;

    expect(within(rowOf("Cotton Kurta")).getByRole("link", { name: "Manage Cotton Kurta on Amazon India" })).toHaveAttribute("href", "/listings/l1");
    expect(within(rowOf("Blocked Tee")).getByRole("link", { name: "Fix Blocked Tee on Amazon India" })).toHaveAttribute("href", "/listings/b1/blocked");
    expect(within(rowOf("Blocked Tee")).getByRole("link", { name: "Blocked" })).toHaveAttribute("href", "/listings/b1/blocked");
    expect(within(rowOf("Failed Tee")).getByRole("link", { name: "Fix Failed Tee on Amazon India" })).toHaveAttribute("href", "/listings/f1/blocked");
    expect(within(rowOf("Syncing Tee")).getByRole("link", { name: "View Syncing Tee on Amazon India" })).toHaveAttribute("href", "/listings/s1/sync");
    expect(within(rowOf("Review Tee")).getByRole("link", { name: "Needs review" })).toHaveAttribute("href", "/listings/r1/blocked");

    // "Review" opens the quick-view drawer of that listing
    await user.click(within(rowOf("Review Tee")).getByRole("button", { name: "Review Review Tee on Amazon India" }));
    expect(screen.getByTestId("drawer")).toHaveTextContent("r1");
  });

  it("puts the tab, filters, search and page in the URL and sends them to the table", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });

    await user.click(screen.getByRole("tab", { name: /Failed/ }));
    expect(loc()).toBe("/listings?tab=failed");
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ tab: "failed" }));

    await user.click(within(screen.getByRole("group", { name: "Marketplace" })).getByRole("button", { name: /^Amazon/ }));
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ tab: "failed", marketplace: "amazon_in" }));
    expect(loc()).toContain("marketplace=amazon_in");

    await user.selectOptions(screen.getByLabelText("Content sync"), "needs_review");
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ contentState: "needs_review" }));

    await user.type(screen.getByLabelText("Search listings"), "kurta");
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ q: "kurta" }), { timeout: 2000 });
    expect(loc()).toContain("q=kurta");

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(loc()).toBe("/listings");
  });

  it("focuses the search with Ctrl+K", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByLabelText("Search listings")).toHaveFocus();
  });

  it("reads deep links from the API: filter[contentState] and status=attention", async () => {
    renderPage("/listings?filter[contentState]=failed&status=attention&sort=-price&page=2&size=50");
    await screen.findByRole("link", { name: "Cotton Kurta" });
    expect(lastTableQuery()).toMatchObject({ contentState: "failed", attention: true, sort: "-price", page: 2, pageSize: 50 });
    expect(screen.getByRole("button", { name: "Needs attention only" })).toHaveAttribute("aria-pressed", "true");
  });

  it("honours ?productId= by listing only that product's listings", async () => {
    renderPage(`/listings?productId=${PRODUCT}`);
    await screen.findByRole("link", { name: "Cotton Kurta" });
    expect(api.productListings).toHaveBeenCalledWith(expect.objectContaining({ productId: PRODUCT }), expect.anything());
    expect(api.table).not.toHaveBeenCalled();
    expect(api.matrix).not.toHaveBeenCalled();
    expect(screen.getByText(/listings of/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Not listed/ })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Show all listings" }));
    expect(loc()).toBe("/listings");
  });

  it("selects every row on the page and bulk-publishes with a partial result and a job that is followed", async () => {
    const user = userEvent.setup();
    const res: BulkListingsResponse = {
      action: "publish",
      summary: { total: 2, succeeded: 1, failed: 1, skipped: 0 },
      results: [
        { index: 0, id: "l1", sku: "KURTA-M", ok: true, status: "done", outcome: "queued", message: "Publish queued", jobId: "job-1", error: null },
        { index: 1, id: "l2", sku: "SHIRT-L", ok: false, status: "failed", outcome: null, message: "x", jobId: null, error: { code: "LISTING_NOT_READY", message: "Add a brand first" } },
      ],
    };
    api.bulk.mockResolvedValue(res);
    api.syncJob.mockResolvedValue({ id: "job-1", status: "succeeded", error: null });
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });

    await user.click(screen.getByLabelText("Select all listings on this page"));
    expect(screen.getByText("2 listings selected")).toBeInTheDocument();
    await user.click(within(screen.getByRole("toolbar", { name: "Bulk actions" })).getByRole("button", { name: "Publish" }));

    expect(api.bulk).toHaveBeenCalledWith("publish", ["l1", "l2"]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("1 of 2 listings succeeded, 1 failed.")).toBeInTheDocument();
    expect(within(dialog).getByText("Add a brand first")).toBeInTheDocument();
    expect(await within(dialog).findByText(/Job: Finished/)).toBeInTheDocument();
    expect(api.syncJob).toHaveBeenCalledWith("job-1");
    expect(refreshShell).toHaveBeenCalled();
    // what failed stays selected
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.getByText("1 listing selected")).toBeInTheDocument();
  });

  it("runs the other bulk actions, opens the full review screen with the selected ids and exports the selection", async () => {
    const user = userEvent.setup();
    const create = vi.fn(() => "blob:csv");
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    api.bulk.mockResolvedValue({ action: "sync_inventory", summary: { total: 2, succeeded: 2, failed: 0, skipped: 0 }, results: [] });
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });
    await user.click(screen.getByLabelText("Select all listings on this page"));
    const bar = () => screen.getByRole("toolbar", { name: "Bulk actions" });

    await user.click(within(bar()).getByRole("button", { name: "Sync" }));
    expect(api.bulk).toHaveBeenCalledWith("sync_inventory", ["l1", "l2"]);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Done" }));

    await user.click(screen.getByLabelText("Select all listings on this page"));
    await user.click(within(bar()).getByRole("button", { name: "Export" }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalled();
    const blob = (create.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.size).toBeGreaterThan(40);

    await user.click(within(bar()).getByRole("button", { name: /More/ }));
    await user.click(screen.getByRole("menuitem", { name: "Validate" }));
    expect(api.bulk).toHaveBeenLastCalledWith("validate", ["l1", "l2"]);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Done" }));

    await user.click(screen.getByLabelText("Select all listings on this page"));
    await user.click(within(bar()).getByRole("button", { name: /More/ }));
    await user.click(screen.getByRole("menuitem", { name: "Full review screen →" }));
    expect(loc()).toBe("/listings/bulk?ids=l1,l2");
    click.mockRestore();
  });

  it("opens the bulk content editor for the whole selection from Edit content, and the readiness audit from the More menu", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });
    await user.click(screen.getByLabelText("Select Linen Shirt on Flipkart"));
    await user.click(screen.getByLabelText("Select Cotton Kurta on Amazon India"));
    const bar = screen.getByRole("toolbar", { name: "Bulk actions" });
    await user.click(within(bar).getByRole("button", { name: "Edit content" }));
    expect(screen.getByTestId("bulk-edit")).toHaveTextContent("l2,l1");
    // a finished edit clears the selection and reloads the listings
    const before = api.table.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Finish editing" }));
    expect(screen.queryByTestId("bulk-edit")).not.toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Bulk actions" })).not.toBeInTheDocument();
    await waitFor(() => expect(api.table.mock.calls.length).toBeGreaterThan(before));

    await user.click(screen.getByLabelText("Select Linen Shirt on Flipkart"));
    await user.click(within(screen.getByRole("toolbar", { name: "Bulk actions" })).getByRole("button", { name: "Edit content" }));
    expect(screen.getByTestId("bulk-edit")).toHaveTextContent("l2");
    await user.click(screen.getByRole("button", { name: "Close editor" }));
    const bar2 = screen.getByRole("toolbar", { name: "Bulk actions" });
    expect(within(bar2).getByText("1 listing selected")).toBeInTheDocument();
    await user.click(within(bar2).getByRole("button", { name: /More/ }));
    await user.click(screen.getByRole("menuitem", { name: "Audit readiness" }));
    expect(loc()).toBe("/listings/readiness");
  });

  it("publishes the selection from the header button, and opens the publishing preparation without one", async () => {
    const user = userEvent.setup();
    api.bulk.mockResolvedValue({ action: "publish", summary: { total: 1, succeeded: 1, failed: 0, skipped: 0 }, results: [{ index: 0, id: "l2", sku: "SHIRT-L", ok: true, status: "done", outcome: null, message: "Queued", jobId: null, error: null }] });
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });
    await user.click(screen.getByLabelText("Select Linen Shirt on Flipkart"));
    await user.click(screen.getByRole("button", { name: "Publish products" }));
    expect(api.bulk).toHaveBeenCalledWith("publish", ["l2"]);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Publish products" }));
    expect(loc()).toBe("/listings/publish");
  });

  it("runs a row action on one listing", async () => {
    const user = userEvent.setup();
    api.bulk.mockResolvedValue({ action: "unpublish", summary: { total: 1, succeeded: 1, failed: 0, skipped: 0 }, results: [{ index: 0, id: "l1", sku: "KURTA-M", ok: true, status: "done", outcome: null, message: "Unpublished", jobId: null, error: null }] });
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });
    await user.click(screen.getByRole("button", { name: "Unpublish Cotton Kurta on Amazon India" }));
    expect(api.bulk).toHaveBeenCalledWith("unpublish", ["l1"]);
    expect(await screen.findByText("Unpublish results")).toBeInTheDocument();
  });

  it("publishes a ready listing from its row", async () => {
    const user = userEvent.setup();
    api.bulk.mockResolvedValue({ action: "publish", summary: { total: 1, succeeded: 1, failed: 0, skipped: 0 }, results: [{ index: 0, id: "l2", sku: "SHIRT-L", ok: true, status: "done", outcome: null, message: "Queued", jobId: null, error: null }] });
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });
    await user.click(screen.getByRole("button", { name: "Publish Linen Shirt on Flipkart" }));
    expect(api.bulk).toHaveBeenCalledWith("publish", ["l2"]);
    expect(await screen.findByText("Publish results")).toBeInTheDocument();
  });

  it("lists the variants without a listing on the Not listed tab and creates a listing", async () => {
    const user = userEvent.setup();
    api.create.mockImplementation(async (t: { variantId: string; accountId: string; label: string }) => ({ key: `${t.variantId}:${t.accountId}`, label: t.label, ok: true, message: "Draft listing created", listingId: "new" }));
    renderPage("/listings?tab=not_listed");
    await screen.findByText("Silk Saree");
    expect(api.notListed).toHaveBeenCalled();
    expect(api.table).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Content sync")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Prepare Silk Saree for Amazon India" })).toHaveAttribute("href", `/listings/v9/unlisted?account=${ACCOUNT}`);

    await user.click(screen.getByRole("button", { name: "Create listing for Silk Saree on Amazon India" }));
    expect(api.create).toHaveBeenCalledWith({ variantId: "v9", accountId: ACCOUNT, label: "SAREE-1 · Amazon India" });
    expect(await screen.findByText("1 of 1 draft created.")).toBeInTheDocument();
  });

  it("creates master listings from the header's dialog: product search, channel multi-select and per-pair results", async () => {
    const user = userEvent.setup();
    const second = "55555555-5555-4555-8555-555555555555";
    api.channels.mockResolvedValue({
      accounts: [
        { id: ACCOUNT, marketplace: "amazon_in", displayName: "Main store", status: "active" },
        { id: second, marketplace: "flipkart", displayName: "FK store", status: "active" },
        { id: "66666666-6666-4666-8666-666666666666", marketplace: "myntra", displayName: "Old store", status: "revoked" },
      ],
      marketplaces: [
        { code: "amazon_in", name: "Amazon India" },
        { code: "flipkart", name: "Flipkart" },
        { code: "myntra", name: "Myntra" },
      ],
    });
    api.bulkCreate.mockResolvedValue({
      summary: { total: 4, created: 2, existing: 1, failed: 1 },
      marketplaces: [],
      results: [
        { index: 0, variantId: "v1", accountId: ACCOUNT, sku: "KURTA-M", productTitle: "Cotton Kurta", accountName: "Main store", marketplace: "amazon_in", ok: true, status: "created", listingId: "new-1", message: "Draft listing created", error: null },
        { index: 1, variantId: "v1", accountId: second, sku: "KURTA-M", productTitle: "Cotton Kurta", accountName: "FK store", marketplace: "flipkart", ok: true, status: "created", listingId: "new-2", message: "Draft listing created", error: null },
        { index: 2, variantId: "v2", accountId: ACCOUNT, sku: "SHIRT-L", productTitle: "Linen Shirt", accountName: "Main store", marketplace: "amazon_in", ok: true, status: "exists", listingId: "old-1", message: "Already has a listing here", error: null },
        { index: 3, variantId: "v2", accountId: second, sku: "SHIRT-L", productTitle: "Linen Shirt", accountName: "FK store", marketplace: "flipkart", ok: false, status: "failed", listingId: null, message: "Flipkart is not available yet", error: { code: "CAPABILITY_UNSUPPORTED", message: "Flipkart is not available yet" } },
      ],
    });
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });
    await user.click(screen.getByRole("button", { name: "Create listing" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Create Master Listing")).toBeInTheDocument();
    const submit = within(dialog).getByRole("button", { name: "Create listings" });
    expect(submit).toBeDisabled();

    // products come from the search and stay ticked across searches
    await within(dialog).findByLabelText("Select Cotton Kurta");
    await user.click(within(dialog).getByLabelText("Select Cotton Kurta"));
    await user.click(within(dialog).getByLabelText("Select Linen Shirt"));
    expect(within(dialog).getByText(/2 products selected \(4 variants\)/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Search master products"), "kurta");
    await waitFor(() => expect(api.searchProducts).toHaveBeenCalledWith("kurta", expect.anything()), { timeout: 2000 });

    // a revoked account cannot be ticked
    expect(within(dialog).getByLabelText("Myntra Old store")).toBeDisabled();
    expect(submit).toBeDisabled();
    await user.click(within(dialog).getByLabelText("Amazon India Main store"));
    await user.click(within(dialog).getByLabelText("Flipkart FK store"));
    expect(within(dialog).getByText("8 draft listings to prepare")).toBeInTheDocument();
    await user.click(submit);

    expect(api.bulkCreate).toHaveBeenCalledWith({ productIds: [PRODUCT, "33333333-3333-4333-8333-333333333333"], accountIds: [ACCOUNT, second] });
    expect(await within(dialog).findByText(/2 drafts created, 1 already listed, 1 failed\./)).toBeInTheDocument();
    const results = within(dialog).getByRole("list", { name: "Results" });
    expect(within(results).getAllByRole("link", { name: "Open listing" }).map((a) => a.getAttribute("href"))).toEqual(["/listings/new-1", "/listings/new-2", "/listings/old-1"]);
    expect(within(results).getByText(/Flipkart is not available yet/, { selector: "p" })).toBeInTheDocument();
    expect(refreshShell).toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog's button off for a viewer, with the reason", async () => {
    const user = userEvent.setup();
    grant("listings:read");
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });
    await user.click(screen.getByRole("button", { name: "Create listing" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByLabelText("Select Cotton Kurta");
    await user.click(within(dialog).getByLabelText("Select Cotton Kurta"));
    await user.click(within(dialog).getByLabelText("Amazon India Main store"));
    expect(within(dialog).getByRole("button", { name: "Create listings" })).toBeDisabled();
    expect(within(dialog).getByText("Your role can view listings but not change them.")).toBeInTheDocument();
  });

  it("shows the design's channel tabs with the real counts, a Connect hint without an account and Social Commerce as a group", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });
    const tabs = screen.getByRole("group", { name: "Marketplace" });
    const names = await waitFor(() => {
      const labels = within(tabs).getAllByRole("button").map((b) => b.textContent);
      expect(labels).toContain("Amazon30");
      return labels;
    });
    expect(names).toEqual(["All channels41", "Amazon30", "Flipkart8", "Meesho2", "Shopify0", "Snapdeal0", "Social Commerce2", "Myntra1"]);
    // no connected account: 0 and a Connect link; connected ones have none
    expect(within(tabs).getByRole("link", { name: "Connect Snapdeal" })).toHaveAttribute("href", "/marketplace-hub");
    expect(within(tabs).getByRole("link", { name: "Connect Shopify" })).toBeInTheDocument();
    expect(within(tabs).queryByRole("link", { name: "Connect Amazon" })).not.toBeInTheDocument();
    expect(within(tabs).queryByRole("link", { name: "Connect Social Commerce" })).not.toBeInTheDocument();

    await user.click(within(tabs).getByRole("button", { name: /Social Commerce/ }));
    expect(loc()).toBe("/listings?marketplace=social");
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ marketplace: "social" }));
    await user.click(within(tabs).getByRole("button", { name: /Snapdeal/ }));
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ marketplace: "snapdeal" }));
    await user.click(within(tabs).getByRole("button", { name: /All channels/ }));
    expect(loc()).toBe("/listings");
  });

  it("has the Draft tab with its count, filtering the table to draft listings", async () => {
    const user = userEvent.setup();
    const draft = row({ id: "d1", sku: "DRAFT-1", productTitle: "Draft Tee", status: "draft" }, { screenStatus: "blocked" });
    api.table.mockResolvedValue(page([draft]));
    renderPage("/listings?tab=draft");
    const tabs = await screen.findByRole("tablist", { name: "Listing status" });
    expect(within(tabs).getByRole("tab", { name: /Draft/ })).toHaveTextContent("7");
    expect(within(tabs).getByRole("tab", { name: /Draft/ })).toHaveAttribute("aria-selected", "true");
    expect(lastTableQuery()).toMatchObject({ tab: "draft" });
    // the grey Draft pill, and what is wrong with the draft stays visible under it
    const r = screen.getByRole("link", { name: "Draft Tee" }).closest('[role="row"]') as HTMLElement;
    expect(within(r).getByRole("link", { name: "Draft" })).toHaveAttribute("href", "/listings/d1/blocked");
    expect(within(r).getByText("Blocked")).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /Failed/ })).toBeInTheDocument();
    await user.click(within(tabs).getByRole("tab", { name: /Live/ }));
    expect(loc()).toBe("/listings?tab=live");
  });

  it("filters by category, readiness, inventory, potential and product status through the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });
    await user.selectOptions(await screen.findByLabelText("Category"), CATEGORY);
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ categoryId: CATEGORY }));
    await user.selectOptions(screen.getByLabelText("Listing readiness"), "high");
    await user.selectOptions(screen.getByLabelText("Inventory"), "out_of_stock");
    await user.selectOptions(screen.getByLabelText("Potential"), "missing_channel");
    await user.selectOptions(screen.getByLabelText("Product status"), "draft");
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ categoryId: CATEGORY, readiness: "high", inventory: "out_of_stock", potential: "missing_channel", productStatus: "draft" }));
    expect(loc()).toBe(`/listings?category=${CATEGORY}&readiness=high&inventory=out_of_stock&potential=missing_channel&productStatus=draft`);
    expect(screen.getByRole("option", { name: "100% Ready" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "< 50% Blocked" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "High Velocity" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(loc()).toBe("/listings");
  });

  it("restores the filters from a deep link, in both the page's and the API's names", async () => {
    renderPage(`/listings?filter[categoryId]=${CATEGORY}&filter[readiness]=100&filter[inventory]=in_stock&potential=high_velocity&filter[productStatus]=archived&issue=missing_images`);
    await screen.findByRole("link", { name: "Cotton Kurta" });
    expect(lastTableQuery()).toMatchObject({ categoryId: CATEGORY, readiness: "100", inventory: "in_stock", potential: "high_velocity", productStatus: "archived", issue: "missing_images" });
    expect(screen.getByLabelText("Potential")).toHaveValue("high_velocity");
    expect(screen.getByLabelText("Product status")).toHaveValue("archived");
  });

  it("filters the table by an issue chip, the chip toggles and the audit link stays", async () => {
    const user = userEvent.setup();
    renderPage();
    const why = await screen.findByRole("region", { name: "Why not live" });
    const chip = within(why).getByRole("button", { name: /3 Missing images/ });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await user.click(chip);
    expect(loc()).toBe("/listings?issue=missing_images");
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ issue: "missing_images" }));
    expect(within(await screen.findByRole("region", { name: "Why not live" })).getByRole("button", { name: /3 Missing images/ })).toHaveAttribute("aria-pressed", "true");
    // another chip replaces it, the active chip clears it
    await user.click(within(why).getByRole("button", { name: /1 Variant issues/ }));
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ issue: "variant_issues" }));
    await user.click(within(why).getByRole("button", { name: /1 Variant issues/ }));
    expect(loc()).toBe("/listings");
    await user.click(within(why).getByRole("button", { name: /4 Missing attributes/ }));
    expect(loc()).toBe("/listings?issue=missing_attributes");
  });

  it("shows the master product's title with its SKU in the Master product column", async () => {
    renderPage();
    const r = (await screen.findByRole("link", { name: "Linen Shirt" })).closest('[role="row"]') as HTMLElement;
    const master = within(r).getByRole("link", { name: "Master product Linen Shirt" });
    expect(master).toHaveTextContent("Linen Shirt");
    expect(master).toHaveAttribute("href", `/products/${PRODUCT}`);
    expect(within(r).getByText("SHIRT-L")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Master product" })).toBeInTheDocument();
  });

  it("starts the matrix with five master products and shows more on demand", async () => {
    const user = userEvent.setup();
    const many = (n: number): ListingsMatrix => ({ ...matrix(), items: Array.from({ length: n }, (_, i) => ({ ...(matrix().items[0] as ListingsMatrix["items"][number]), productId: `${PRODUCT}-${i}`, title: `Product ${i}`, sku: `P-${i}` })) });
    api.matrix.mockImplementation(async (limit: number) => many(Math.min(limit, 40)));
    renderPage();
    const grid = await screen.findByRole("region", { name: "Listing matrix" });
    await waitFor(() => expect(within(grid).getByText(/Showing 5 of 427 master products/)).toBeInTheDocument());
    expect(api.matrix).toHaveBeenLastCalledWith(5, expect.anything());
    expect(within(grid).queryByRole("button", { name: "Show fewer" })).not.toBeInTheDocument();
    await user.click(within(grid).getByRole("button", { name: "Show more products" }));
    await waitFor(() => expect(within(grid).getByText(/Showing 15 of 427 master products/)).toBeInTheDocument());
    expect(api.matrix).toHaveBeenLastCalledWith(15, expect.anything());
    await user.click(within(grid).getByRole("button", { name: "Show fewer" }));
    await waitFor(() => expect(within(grid).getByText(/Showing 5 of 427 master products/)).toBeInTheDocument());
  });

  it("opens the Not listed tab and keeps its create flow, with the category filter", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });
    await user.click(screen.getByRole("tab", { name: /Not listed/ }));
    expect(loc()).toBe("/listings?tab=not_listed");
    expect(await screen.findByText("Silk Saree")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Category"), CATEGORY);
    await waitFor(() => expect(api.notListed).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: CATEGORY }), expect.anything()));
    expect(screen.queryByLabelText("Listing readiness")).not.toBeInTheDocument();
  });

  it("creates drafts for the selected products in bulk and reports the one that failed", async () => {
    const user = userEvent.setup();
    api.create.mockImplementation(async (t: { variantId: string; accountId: string; label: string }) => ({
      key: `${t.variantId}:${t.accountId}`,
      label: t.label,
      ok: t.variantId === "v9",
      message: t.variantId === "v9" ? "Draft listing created" : "Already listed",
      listingId: null,
    }));
    renderPage("/listings?tab=not_listed");
    await screen.findByText("Silk Saree");
    await user.click(screen.getByLabelText("Select all products on this page"));
    await user.click(screen.getByRole("button", { name: "Create listings" }));
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("1 of 2 drafts created, 1 failed.")).toBeInTheDocument();
    expect(screen.getByText("Already listed")).toBeInTheDocument();
  });

  it("is read-only for a viewer, with the reason", async () => {
    grant("listings:read");
    renderPage();
    await screen.findByRole("link", { name: "Cotton Kurta" });
    const all = screen.getByLabelText("Select all listings on this page");
    expect(all).toBeDisabled();
    expect(all).toHaveAttribute("title", "Your role can view listings but not change them.");
    expect(screen.getByRole("button", { name: "Unpublish Cotton Kurta on Amazon India" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish Linen Shirt on Flipkart" })).toBeDisabled();
  });

  it("shows the design's empty state for an empty workspace, and an empty filter result", async () => {
    api.table.mockResolvedValue(page([], { counts: { all: 0, live: 0, ready: 0, needs_review: 0, syncing: 0, failed: 0, blocked: 0 } }));
    const first = renderPage();
    expect(await screen.findByText("Your master products are ready for the marketplace.")).toBeInTheDocument();
    expect(await screen.findByText(/427 master products ready to list/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to products" })).toHaveAttribute("href", "/products");
    expect(screen.getByRole("link", { name: "Amazon India" })).toHaveAttribute("href", "/marketplace-hub");
    expect(screen.getByRole("link", { name: "Explore publishing opportunities" })).toHaveAttribute("href", "/listings/publish");
    first.unmount();
    renderPage("/listings?q=zzz");
    expect(await screen.findByText("No listings match the current filters.")).toBeInTheDocument();
  });

  it("shows the design's error state with the API message and a retry", async () => {
    const user = userEvent.setup();
    api.table.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Boom", status: 500 }));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Listings couldn't be loaded");
    expect(screen.getByText("Boom")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Cotton Kurta" })).toBeInTheDocument();
  });
});
