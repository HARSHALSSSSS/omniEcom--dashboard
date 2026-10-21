import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { BulkListingsResponse, ListingRow, ListingsOverview, ListingsTablePage, NotListedPage } from "@/types/listing";

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  table: vi.fn(),
  notListed: vi.fn(),
  productListings: vi.fn(),
  bulk: vi.fn(),
  create: vi.fn(),
  syncJob: vi.fn(),
  channels: vi.fn(),
}));
const refreshShell = vi.hoisted(() => vi.fn());
vi.mock("@/api/listings.api", () => ({ listingsApi: api }));
vi.mock("@/lib/session", () => ({ refreshShell }));
vi.mock("@/components/products/list/AuthThumbnail", async () => {
  const React = await import("react");
  return { AuthThumbnail: (p: { initials: string }) => React.createElement("span", { "data-testid": "thumb" }, p.initials) };
});

import ListingsPage from "./ListingsPage";

const PRODUCT = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";

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
  byStatus: {},
  byContentState: {},
  byMarketplace: [],
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
  api.table.mockResolvedValue(page([L1, L2]));
  api.notListed.mockResolvedValue(NOT_LISTED);
  api.productListings.mockResolvedValue(page([L1], { counts: { all: 1, live: 1, ready: 0, needs_review: 0, syncing: 0, failed: 0, blocked: 0 } }));
  api.channels.mockResolvedValue({
    accounts: [{ id: ACCOUNT, marketplace: "amazon_in", displayName: "Main store", status: "active" }],
    marketplaces: [{ code: "amazon_in", name: "Amazon India" }],
  });
});

describe("ListingsPage", () => {
  it("shows the tab counts from the overview and the rows with price, stock, readiness and content chips", async () => {
    renderPage();
    const tabs = await screen.findByRole("tablist", { name: "Listing status" });
    await waitFor(() => expect(within(tabs).getByRole("tab", { name: /Total listings/ })).toHaveTextContent("40"));
    expect(within(tabs).getByRole("tab", { name: /Needs review/ })).toHaveTextContent("3");
    expect(within(tabs).getByRole("tab", { name: /Blocked/ })).toHaveTextContent("5");
    expect(within(tabs).getByRole("tab", { name: /Not listed/ })).toHaveTextContent("11");

    const r1 = (await screen.findByText("Cotton Kurta")).closest("tr") as HTMLElement;
    expect(within(r1).getByText("₹1,299")).toBeInTheDocument();
    expect(within(r1).getByText("95%")).toBeInTheDocument();
    expect(within(r1).getByText("Amazon India")).toBeInTheDocument();
    expect(within(r1).getByText("B0ASIN1")).toBeInTheDocument();

    const r2 = screen.getByText("Linen Shirt").closest("tr") as HTMLElement;
    expect(within(r2).getByText("Push pending")).toBeInTheDocument();
    expect(within(r2).getByText("Add a brand")).toBeInTheDocument();
    expect(within(r2).getByText(/Content: Needs review/)).toBeInTheDocument();
    expect(within(r2).getByRole("link", { name: /Resolve content update/ })).toHaveAttribute("href", "/listings/l2");
    expect(lastTableQuery()).toMatchObject({ tab: "all", page: 1, pageSize: 25, sort: "-updatedAt" });
  });

  it("puts the tab, filters, search and page in the URL and sends them to the table", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Cotton Kurta");

    await user.click(screen.getByRole("tab", { name: /Failed/ }));
    expect(loc()).toBe("/listings?tab=failed");
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ tab: "failed" }));

    await user.click(screen.getByRole("button", { name: "Amazon India" }));
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ tab: "failed", marketplace: "amazon_in" }));
    expect(loc()).toContain("marketplace=amazon_in");

    await user.selectOptions(screen.getByLabelText("Content sync"), "needs_review");
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ contentState: "needs_review" }));

    await user.type(screen.getByLabelText("Search listings"), "kurta");
    await waitFor(() => expect(lastTableQuery()).toMatchObject({ q: "kurta" }), { timeout: 2000 });
    expect(loc()).toContain("q=kurta");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(loc()).toBe("/listings");
  });

  it("reads deep links from the API: filter[contentState] and status=attention", async () => {
    renderPage("/listings?filter[contentState]=failed&status=attention&sort=-price&page=2&size=50");
    await screen.findByText("Cotton Kurta");
    expect(lastTableQuery()).toMatchObject({ contentState: "failed", attention: true, sort: "-price", page: 2, pageSize: 50 });
    expect(screen.getByRole("button", { name: "Needs attention only" })).toHaveAttribute("aria-pressed", "true");
  });

  it("honours ?productId= by listing only that product's listings", async () => {
    renderPage(`/listings?productId=${PRODUCT}`);
    await screen.findByRole("link", { name: "Cotton Kurta" });
    expect(api.productListings).toHaveBeenCalledWith(expect.objectContaining({ productId: PRODUCT }), expect.anything());
    expect(api.table).not.toHaveBeenCalled();
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
    await screen.findByText("Cotton Kurta");

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

  it("runs a row action on one listing", async () => {
    const user = userEvent.setup();
    api.bulk.mockResolvedValue({ action: "unpublish", summary: { total: 1, succeeded: 1, failed: 0, skipped: 0 }, results: [{ index: 0, id: "l1", sku: "KURTA-M", ok: true, status: "done", outcome: null, message: "Unpublished", jobId: null, error: null }] });
    renderPage();
    await screen.findByText("Cotton Kurta");
    await user.click(screen.getByRole("button", { name: "Unpublish Cotton Kurta on Amazon India" }));
    expect(api.bulk).toHaveBeenCalledWith("unpublish", ["l1"]);
    expect(await screen.findByText("Unpublish results")).toBeInTheDocument();
  });

  it("lists the variants without a listing on the Not listed tab and creates a listing", async () => {
    const user = userEvent.setup();
    api.create.mockImplementation(async (t: { variantId: string; accountId: string; label: string }) => ({ key: `${t.variantId}:${t.accountId}`, label: t.label, ok: true, message: "Draft listing created", listingId: "new" }));
    renderPage("/listings?tab=not_listed");
    await screen.findByText("Silk Saree");
    expect(api.notListed).toHaveBeenCalled();
    expect(api.table).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Content sync")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create listing for Silk Saree on Amazon India" }));
    expect(api.create).toHaveBeenCalledWith({ variantId: "v9", accountId: ACCOUNT, label: "SAREE-1 · Amazon India" });
    expect(await screen.findByText("1 of 1 draft created.")).toBeInTheDocument();
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
    await screen.findByText("Cotton Kurta");
    const all = screen.getByLabelText("Select all listings on this page");
    expect(all).toBeDisabled();
    expect(all).toHaveAttribute("title", "Your role can view listings but not change them.");
    expect(screen.getByRole("button", { name: "Unpublish Cotton Kurta on Amazon India" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish Linen Shirt on Flipkart" })).toBeDisabled();
  });

  it("explains an empty workspace and an empty filter result", async () => {
    api.table.mockResolvedValue(page([], { counts: { all: 0, live: 0, ready: 0, needs_review: 0, syncing: 0, failed: 0, blocked: 0 } }));
    const first = renderPage();
    expect(await screen.findByText("No listings yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to products" })).toHaveAttribute("href", "/products");
    expect(screen.getByRole("link", { name: "Open marketplace hub" })).toHaveAttribute("href", "/marketplace-hub");
    first.unmount();
    renderPage("/listings?q=zzz");
    expect(await screen.findByText("No listings match these filters.")).toBeInTheDocument();
  });

  it("shows the API error with a retry", async () => {
    const user = userEvent.setup();
    api.table.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Boom", status: 500 }));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Listings could not be loaded.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Cotton Kurta")).toBeInTheDocument();
  });
});
