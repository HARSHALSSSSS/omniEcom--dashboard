import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { ListingRow } from "@/types/listing";
import type { ChannelStatus } from "@/types/listingFlows";
import type { ListingStudio } from "@/types/listingStudio";

const flows = vi.hoisted(() => ({ channels: vi.fn(), unlistedContext: vi.fn(), selection: vi.fn(), prepare: vi.fn(), details: vi.fn(), fixSuggestions: vi.fn(), bulkContent: vi.fn() }));
const studioApi = vi.hoisted(() => ({ getStudio: vi.fn(), save: vi.fn(), validate: vi.fn(), publishFlow: vi.fn() }));
const listingsApi = vi.hoisted(() => ({ bulk: vi.fn(), syncJob: vi.fn() }));
vi.mock("@/api/listingFlows.api", () => ({ listingFlowsApi: flows }));
vi.mock("@/api/listingStudio.api", () => ({ listingStudioApi: studioApi }));
vi.mock("@/api/listings.api", () => ({ listingsApi }));
vi.mock("@/lib/session", () => ({ refreshShell: vi.fn().mockResolvedValue(undefined) }));

import BulkSelectedListingsPage from "./BulkSelectedListingsPage";
import { ListingDetailDrawer } from "./ListingDetailDrawer";
import ListingBlockerPage from "./ListingBlockerPage";
import ListingUnlistedPage from "./ListingUnlistedPage";

const ID = "22222222-2222-4222-8222-222222222222";
const ID2 = "44444444-4444-4444-8444-444444444444";
const VARIANT = "55555555-5555-4555-8555-555555555555";
const ACCOUNT = "66666666-6666-4666-8666-666666666666";
const PRODUCT = "33333333-3333-4333-8333-333333333333";

const fitAttr = (value: string | null) => ({ key: "fit", label: "Fit type", required: true, type: "enum" as const, allowedValues: ["Regular", "Slim"], maxLength: null, value, source: null, channelSpecific: false, status: value ? ("pass" as const) : ("fail" as const) });

function studio(blocked: boolean): ListingStudio {
  const item = { key: "missing_attribute:fit", group: "attributes" as const, status: "fail" as const, label: "fit", message: "Fit type is required for this category", field: "fit", fix: { action: "fill_attribute" as const, field: "fit" } };
  return {
    listing: {
      id: ID, marketplaceAccountId: ACCOUNT, marketplace: "amazon_in", variantId: VARIANT, productId: PRODUCT, sku: "OVR-9", productTitle: "Cotton Overshirt", externalSku: "X", externalListingId: null, status: "draft", externalStatus: null,
      marketplaceCategoryId: "cat-9", currency: "INR", priceMinor: 289900, mrpMinor: 499900, effectivePriceMinor: 289900, effectiveMrpMinor: 499900, attributeValues: {}, issues: [], contentState: "synced",
      contentChangedFields: [], contentReview: {}, contentError: null, version: 7, updatedAt: "2026-10-20T08:46:00.000Z",
      table: { screenStatus: blocked ? "blocked" : "ready", thumbnailUrl: null, marketplaceName: "Amazon India", accountName: "Nova Amazon" },
    },
    product: { id: PRODUCT, variantId: VARIANT, sku: "OVR-9", title: "Cotton Overshirt", brand: null, barcode: null, categoryName: "Shirts", thumbnailUrl: null },
    account: { id: ACCOUNT, displayName: "Nova Amazon", marketplace: "amazon_in", marketplaceName: "Amazon India", status: "active", mode: "live" },
    content: {} as ListingStudio["content"],
    preview: { title: "Cotton Overshirt", description: null, bulletPoints: [], priceMinor: 289900, mrpMinor: 499900, discountPercent: 42, images: [], endpoint: "e", payload: {}, warnings: [], approval: { approved: false, current: false, approvedAt: null } },
    readiness: {
      percent: blocked ? 78 : 100,
      ready: !blocked,
      summary: { pass: 5, warn: 0, fail: blocked ? 1 : 0 },
      topBlocker: blocked ? { key: item.key, message: item.message, field: "fit", fix: item.fix } : null,
      groups: [
        { key: "content", label: "Content", status: "pass", passed: 1, total: 1, items: [{ key: "title", group: "content", status: "pass", label: "Title", message: "The listing has a title", field: "title", fix: null }] },
        blocked
          ? { key: "attributes", label: "Attributes", status: "fail", passed: 0, total: 1, items: [item] }
          : { key: "attributes", label: "Attributes", status: "pass", passed: 1, total: 1, items: [{ ...item, status: "pass", fix: null, message: "All 1 required attribute is filled" }] },
      ],
    },
    pricing: {} as ListingStudio["pricing"],
    stock: { available: 14, sellable: 12, pushed: null, dirty: false, bufferOverride: null, maxQuantityOverride: null, pushedAt: null },
    category: { marketplaceCategoryId: "cat-9", marketplaceCategoryName: "Men's Shirts", masterCategoryName: "Shirts", attributes: [fitAttr(blocked ? null : "Slim")] },
    media: [],
    variations: [{ variantId: VARIANT, sku: "OVR-9", optionValues: null, priceMinor: 289900, available: 14, listingId: ID, listingStatus: "draft", current: true }],
    contentSync: { state: "synced", changedFields: [], review: {}, error: null, changedAt: null, syncedAt: null },
    marketplaceIssues: [],
    externalUrl: null,
    activity: { total: 0, items: [] },
    actions: [],
  };
}

const channel = (over: Partial<ChannelStatus>): ChannelStatus => ({ accountId: "a2", accountName: "Flip One", marketplace: "flipkart", marketplaceName: "Flipkart", listingId: null, screenStatus: "not_listed", readinessPercent: null, lastSyncAt: null, externalUrl: null, current: false, ...over });

function signIn(permissions: string[]) {
  useWorkspaceStore.getState().setSession({
    user: { id: "u1", fullName: "Asha Admin", email: "a@x.test", businessName: "Nova", role: "owner" },
    permissions,
    shell: { user: { id: "u1", name: "Asha Admin", initials: "AA", roleLabel: "Business owner" }, business: { id: "b1", name: "Nova", plan: "free", tier: "starter" }, badges: { needsAttention: 0, orders: 0, returns: 0, notifications: 0 }, features: {} },
    onboardingStatus: "completed",
    onboardingResumeStep: "ready",
  });
}

function renderAt(path: string, routes: Array<{ path: string; element: React.ReactNode }>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  [...Object.values(flows), ...Object.values(studioApi), ...Object.values(listingsApi)].forEach((m) => m.mockReset());
  signIn(["listings:read", "listings:write"]);
  flows.details.mockResolvedValue({
    listingId: ID, productId: PRODUCT, variantId: VARIANT, sku: "OVR-9", variantsCount: 3, marketplace: "amazon_in", marketplaceName: "Amazon India",
    category: { marketplaceCategoryId: "cat-9", marketplaceName: "Men's Shirts", marketplacePath: "Apparel > Tops > Men's Shirts", masterName: "Shirts", masterPath: "Apparel > Tops > Shirts", fullPath: "Apparel > Tops > Men's Shirts", channelCategory: "Amazon India Men's Shirts" },
    completeness: [
      { key: "title", label: "Title", status: "pass", detail: "Cotton Overshirt", field: "title" },
      { key: "images", label: "Images", status: "pass", detail: "2 images", field: "images" },
      { key: "sku", label: "SKU", status: "pass", detail: "OVR-9", field: "sku" },
      { key: "category", label: "Category", status: "pass", detail: "x", field: "category" },
      { key: "weight", label: "Weight", status: "warn", detail: "No weight on the variant or the product", field: "weight" },
    ],
  });
  flows.fixSuggestions.mockResolvedValue({
    listingId: ID, version: 7, generatedAt: "2026-10-20T08:46:00.000Z", engine: "rules", note: "n", unresolved: [],
    suggestions: [{ key: "fit", kind: "attribute", field: "fit", label: "Fit type", severity: "fail", value: "Slim", confidence: 0.78, confidenceLevel: "medium", source: "keyword_match", reason: "The word slim appears in the product title", alternatives: [], apply: { attributeOverrides: { fit: "Slim" } } }],
  });
  flows.channels.mockResolvedValue({
    listingId: ID, productId: PRODUCT, productTitle: "Cotton Overshirt", variantId: VARIANT, sku: "OVR-9", variantsCount: 3,
    channels: [channel({ accountId: ACCOUNT, accountName: "Nova Amazon", marketplaceName: "Amazon India", listingId: ID, screenStatus: "blocked", readinessPercent: 78, current: true }), channel({ listingId: ID2, screenStatus: "live", readinessPercent: 100, lastSyncAt: new Date().toISOString() })],
  });
});

describe("ListingBlockerPage", () => {
  const routes = [
    { path: "/listings/:id/blocked", element: <ListingBlockerPage /> },
    { path: "/listings/:id", element: <p>Studio</p> },
    { path: "/listings", element: <p>Listings page</p> },
  ];

  it("shows the real blocker, resolves it through the one save, validates and shows the unblocked state", async () => {
    const user = userEvent.setup();
    studioApi.getStudio.mockResolvedValueOnce(studio(true)).mockResolvedValue(studio(false));
    studioApi.save.mockResolvedValue({});
    studioApi.validate.mockResolvedValue({ validation: { ready: true, errors: [], warnings: [] } });
    renderAt(`/listings/${ID}/blocked`, routes);

    expect(await screen.findByText("1 listing is blocked and cannot be published")).toBeInTheDocument();
    expect(screen.getByText("Mandatory product attribute missing")).toBeInTheDocument();
    expect(screen.getByText("Fit type")).toBeInTheDocument();
    expect(await screen.findByText("Apparel > Tops > Men's Shirts")).toBeInTheDocument();
    expect(screen.getByText(/OVR-9 · 3 variants/)).toBeInTheDocument();
    // other channels come from the API, each with its marketplace accent colour
    expect(await screen.findByText("Flipkart")).toBeInTheDocument();
    expect(screen.getByText("This listing")).toBeInTheDocument();
    expect(document.querySelector("[data-marketplace=flipkart] [data-testid=channel-accent]")).toHaveStyle({ backgroundColor: "#2874F0" });
    expect(screen.getByText("100%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fix listing" }));
    await user.selectOptions(screen.getByLabelText(/Fit type specification/), "Slim");
    await user.click(screen.getByRole("button", { name: "Save & Unblock" }));

    await waitFor(() => expect(studioApi.save).toHaveBeenCalledWith(ID, { version: 7, attributeOverrides: { fit: "Slim" } }));
    expect(studioApi.validate).toHaveBeenCalledWith(ID);
    expect(await screen.findByText("This listing is ready to publish")).toBeInTheDocument();
    expect(screen.getByText(/Fit type saved for Amazon India/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit attribute" })).toBeInTheDocument();
  });

  it("Fix with AI shows an unconfirmed suggestion and saves nothing until the user confirms", async () => {
    const user = userEvent.setup();
    studioApi.getStudio.mockResolvedValue(studio(true));
    studioApi.save.mockResolvedValue({});
    studioApi.validate.mockResolvedValue({ validation: { ready: true, errors: [], warnings: [] } });
    renderAt(`/listings/${ID}/blocked`, routes);
    await user.click(await screen.findByRole("button", { name: "Fix with AI" }));
    expect(await screen.findByText("Unconfirmed suggestion · requires review")).toBeInTheDocument();
    expect(screen.getByLabelText(/Fit type specification/)).toHaveValue("Slim");
    expect(studioApi.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save & Unblock" }));
    await waitFor(() => expect(studioApi.save).toHaveBeenCalledWith(ID, { version: 7, attributeOverrides: { fit: "Slim" } }));
  });

  it("explains a version conflict and keeps the form open", async () => {
    const user = userEvent.setup();
    studioApi.getStudio.mockResolvedValue(studio(true));
    studioApi.save.mockRejectedValue(new ApiError({ code: "VERSION_CONFLICT", message: "stale", status: 409 }));
    renderAt(`/listings/${ID}/blocked`, routes);
    await user.click(await screen.findByRole("button", { name: "Fix listing" }));
    await user.selectOptions(screen.getByLabelText(/Fit type specification/), "Regular");
    await user.click(screen.getByRole("button", { name: "Save & Unblock" }));
    expect(await screen.findByText(/changed by someone else/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save & Unblock" })).toBeInTheDocument();
  });

  it("does not let a read-only role fix", async () => {
    signIn(["listings:read"]);
    studioApi.getStudio.mockResolvedValue(studio(true));
    renderAt(`/listings/${ID}/blocked`, routes);
    expect(await screen.findByRole("button", { name: "Fix listing" })).toBeDisabled();
  });

  it("shows an error with a way back when the listing cannot be loaded", async () => {
    studioApi.getStudio.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "Listing not found", status: 404 }));
    renderAt(`/listings/${ID}/blocked`, routes);
    expect(await screen.findByText("Failed to load listing issue details.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Listings/ })).toHaveAttribute("href", "/listings");
  });
});

describe("ListingUnlistedPage", () => {
  const routes = [
    { path: "/listings/:id/unlisted", element: <ListingUnlistedPage /> },
    { path: "/listings/:id", element: <p>Studio of the new listing</p> },
  ];
  const context = (over: Record<string, unknown> = {}) => ({
    variantId: VARIANT, productId: PRODUCT, productTitle: "Cotton Overshirt", sku: "OVR-9", barcode: null, categoryName: "Shirts", variantsCount: 3, inventoryAvailable: 41,
    account: { id: ACCOUNT, displayName: "Nova Meesho", marketplace: "meesho", marketplaceName: "Meesho", status: "active", canCreateListings: true },
    existingListingId: null,
    channels: [channel({ accountId: ACCOUNT, accountName: "Nova Meesho", marketplaceName: "Meesho", current: true }), channel({ listingId: ID2, screenStatus: "live" })],
    ...over,
  });

  it("shows the product, stock and other channels, and prepares the listing into the Studio", async () => {
    const user = userEvent.setup();
    flows.unlistedContext.mockResolvedValue(context());
    flows.prepare.mockResolvedValue({ id: ID2 });
    renderAt(`/listings/${VARIANT}/unlisted?account=${ACCOUNT}`, routes);

    expect(await screen.findByText("Cotton Overshirt")).toBeInTheDocument();
    expect(flows.unlistedContext).toHaveBeenCalledWith(VARIANT, ACCOUNT);
    expect(screen.getByText("41 units")).toBeInTheDocument();
    expect(screen.getByText("3 variants", { selector: "span.font-medium" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View product" })).toHaveAttribute("href", `/products/${PRODUCT}`);
    expect(screen.getByText("Live")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Prepare listing" }));
    await waitFor(() => expect(flows.prepare).toHaveBeenCalledWith(VARIANT, ACCOUNT));
    expect(await screen.findByText("Studio of the new listing")).toBeInTheDocument();
  });

  it("offers the existing listing instead of a second one", async () => {
    flows.unlistedContext.mockResolvedValue(context({ existingListingId: ID2 }));
    renderAt(`/listings/${VARIANT}/unlisted?account=${ACCOUNT}`, routes);
    expect(await screen.findByRole("link", { name: "Open listing" })).toHaveAttribute("href", `/listings/${ID2}`);
    expect(screen.queryByRole("button", { name: "Prepare listing" })).not.toBeInTheDocument();
  });

  it("shows the failure of the create call and stays on the page", async () => {
    const user = userEvent.setup();
    flows.unlistedContext.mockResolvedValue(context());
    flows.prepare.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "A listing already exists for this variant", status: 409 }));
    renderAt(`/listings/${VARIANT}/unlisted?account=${ACCOUNT}`, routes);
    await user.click(await screen.findByRole("button", { name: "Prepare listing" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("asks for an account when the link has none", async () => {
    renderAt(`/listings/${VARIANT}/unlisted`, routes);
    expect(await screen.findByText(/Choose a marketplace account first/)).toBeInTheDocument();
    expect(flows.unlistedContext).not.toHaveBeenCalled();
  });
});

const row = (id: string, over: Partial<ListingRow["table"]>, title = "Premium Travel Bag", sku = "TRV-1042"): ListingRow =>
  ({
    id, marketplaceAccountId: ACCOUNT, marketplace: "flipkart", variantId: VARIANT, productId: PRODUCT, sku, productTitle: title, externalSku: "x", externalListingId: null, status: "draft", source: "created", currency: "INR",
    publishedAt: null, contentState: "synced", contentChangedFields: [], contentError: null, issues: [], version: 1, updatedAt: "2026-10-20T08:46:00.000Z",
    table: {
      screenStatus: "ready", barcode: null, thumbnailUrl: null, imageCount: 1, categoryName: null, marketplaceName: "Flipkart", accountName: "Flip One", marketplaceCategoryName: null, priceMinor: 1000, mrpMinor: 2000, salePriceMinor: null,
      saleEndsAt: null, stock: { available: 1, sellable: 1, pushed: null, dirty: false }, readiness: { percent: 100, ready: true, errors: 0, warnings: 0, attributesChecked: true, topBlocker: null }, externalListingId: null,
      externalUrl: null, lastSyncAt: null, ...over,
    },
  }) as ListingRow;

describe("BulkSelectedListingsPage", () => {
  const routes = [
    { path: "/listings/bulk", element: <BulkSelectedListingsPage /> },
    { path: "/listings/:id", element: <p>Studio</p> },
    { path: "/listings", element: <p>Listings page</p> },
  ];

  it("loads the selected ids, shows readiness and status, and publishes the checked listings", async () => {
    const user = userEvent.setup();
    flows.selection.mockResolvedValue({ items: [row(ID, {}), row(ID2, { screenStatus: "needs_review", readiness: { percent: 78, ready: false, errors: 1, warnings: 0, attributesChecked: true, topBlocker: null } }, "Classic Backpack", "BP-1021")], missingIds: ["gone"] });
    listingsApi.bulk.mockResolvedValue({
      action: "publish", summary: { total: 1, succeeded: 1, failed: 0, skipped: 0 },
      results: [{ index: 0, id: ID, sku: "TRV-1042", ok: true, status: "done", outcome: "queued", message: "Publishing", jobId: null, error: null }],
    });
    renderAt(`/listings/bulk?ids=${ID},${ID2},${ID},gone`, routes);

    expect(await screen.findByText("2 listings selected")).toBeInTheDocument();
    expect(flows.selection).toHaveBeenCalledWith([ID, ID2, "gone"]);
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 3 selected listings/)).toBeInTheDocument();
    expect(screen.getByText(/1 selected listing no longer exists/)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Select Classic Backpack on Flipkart" }));
    expect(screen.getByText("1 listing selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(listingsApi.bulk).toHaveBeenCalledWith("publish", [ID]));
    expect(await screen.findByText("Publish results")).toBeInTheDocument();
  });

  it("confirms before unpublishing", async () => {
    const user = userEvent.setup();
    flows.selection.mockResolvedValue({ items: [row(ID, { screenStatus: "live" })], missingIds: [] });
    listingsApi.bulk.mockResolvedValue({ action: "unpublish", summary: { total: 1, succeeded: 1, failed: 0, skipped: 0 }, results: [{ index: 0, id: ID, sku: "TRV-1042", ok: true, status: "done", outcome: null, message: "ok", jobId: null, error: null }] });
    renderAt(`/listings/bulk?ids=${ID}`, routes);
    await user.click(await screen.findByRole("button", { name: "Unpublish" }));
    expect(listingsApi.bulk).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Unpublish 1 listing?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Unpublish" }));
    await waitFor(() => expect(listingsApi.bulk).toHaveBeenCalledWith("unpublish", [ID]));
  });

  it("disables the actions for a read-only role and handles an empty selection", async () => {
    signIn(["listings:read"]);
    flows.selection.mockResolvedValue({ items: [row(ID, {})], missingIds: [] });
    renderAt(`/listings/bulk?ids=${ID}`, routes);
    expect(await screen.findByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("explains an empty selection", async () => {
    renderAt("/listings/bulk", routes);
    expect(await screen.findByText(/No listings are selected/)).toBeInTheDocument();
    expect(flows.selection).not.toHaveBeenCalled();
  });
});

describe("ListingDetailDrawer", () => {
  it("renders nothing without a listing id, loads its own data and fixes the missing attribute", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    studioApi.getStudio.mockResolvedValueOnce(studio(true)).mockResolvedValue(studio(false));
    studioApi.save.mockResolvedValue({});
    studioApi.validate.mockResolvedValue({ validation: { ready: true, errors: [], warnings: [] } });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const tree = (id: string | null) => (
      <QueryClientProvider client={qc}>
        <RouterProvider router={createMemoryRouter([{ path: "*", element: <ListingDetailDrawer listingId={id} onClose={onClose} /> }])} />
      </QueryClientProvider>
    );
    const { rerender, container } = render(tree(null));
    expect(container).toBeEmptyDOMElement();
    expect(studioApi.getStudio).not.toHaveBeenCalled();

    rerender(tree(ID));
    expect(await screen.findByRole("dialog", { name: "Listing details" })).toBeInTheDocument();
    expect(await screen.findByText("Cotton Overshirt", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByText("Amazon India listing")).toBeInTheDocument();
    expect(screen.getByText("Blocked · 78%")).toBeInTheDocument();
    expect(screen.getAllByText(/Fit type is required for this category/).length).toBeGreaterThan(0);
    // the fixed completeness list, weight included, and the unconfirmed suggestion
    expect(await screen.findByText("Weight")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(await screen.findByText("Unconfirmed suggestion · requires review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fix with AI" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Open listing" })).toHaveAttribute("href", `/listings/${ID}`);

    await user.click(screen.getByRole("button", { name: "Slim" }));
    await waitFor(() => expect(studioApi.save).toHaveBeenCalledWith(ID, { version: 7, attributeOverrides: { fit: "Slim" } }));
    expect(await screen.findByText(/Fit type set to "Slim"/)).toBeInTheDocument();
    expect(await screen.findByText("Ready to publish · 100%")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
