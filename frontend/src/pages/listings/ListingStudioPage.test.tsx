import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { ListingStudio, StudioAction } from "@/types/listingStudio";

const api = vi.hoisted(() => ({
  getStudio: vi.fn(),
  getActivity: vi.fn(),
  save: vi.fn(),
  validate: vi.fn(),
  publishFlow: vi.fn(),
  unpublish: vi.fn(),
  refreshStatus: vi.fn(),
  contentSync: vi.fn(),
  resolveReview: vi.fn(),
  getJob: vi.fn(),
  searchCategories: vi.fn(),
}));
vi.mock("@/api/listingStudio.api", () => ({ listingStudioApi: api }));

import ListingStudioPage from "./ListingStudioPage";

const ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT = "33333333-3333-4333-8333-333333333333";

const ACTIONS: StudioAction[] = [
  { action: "edit", label: "Edit", enabled: true, disabledReason: null },
  { action: "validate", label: "Validate", enabled: true, disabledReason: null },
  { action: "approve", label: "Approve", enabled: true, disabledReason: null },
  { action: "publish", label: "Publish", enabled: false, disabledReason: "Approve the listing first" },
  { action: "publish_flow", label: "Publish to channel", enabled: true, disabledReason: null },
  { action: "unpublish", label: "Unpublish", enabled: false, disabledReason: "Only an active or pending listing can be unpublished" },
  { action: "refresh_status", label: "Refresh status", enabled: false, disabledReason: "The listing has not been submitted to the marketplace yet" },
  { action: "sync_content", label: "Send latest content", enabled: false, disabledReason: "The listing is not live" },
  { action: "resolve_review", label: "Resolve category review", enabled: false, disabledReason: "No category review is waiting" },
  { action: "sync_inventory", label: "Sync stock", enabled: false, disabledReason: "Only an active listing carries stock" },
  { action: "delete", label: "Delete", enabled: true, disabledReason: null },
];

const studio = (over: Partial<ListingStudio> = {}): ListingStudio => ({
  listing: {
    id: ID,
    marketplaceAccountId: "acc-1",
    marketplace: "amazon_in",
    variantId: "var-1",
    productId: PRODUCT,
    sku: "TRV-1042-BLK",
    productTitle: "Traverse Travel Jacket",
    externalSku: "AMZ-TRV-1042",
    externalListingId: null,
    status: "draft",
    externalStatus: null,
    marketplaceCategoryId: "cat-9",
    currency: "INR",
    priceMinor: 289900,
    mrpMinor: 499900,
    effectivePriceMinor: 289900,
    effectiveMrpMinor: 499900,
    attributeValues: { colour: "Black" },
    issues: [],
    contentState: "synced",
    contentChangedFields: [],
    contentReview: {},
    contentError: null,
    version: 5,
    updatedAt: "2026-10-20T08:46:00.000Z",
    table: { screenStatus: "ready", thumbnailUrl: "https://img.test/1.jpg", marketplaceName: "Amazon India", accountName: "Nova Amazon" },
  },
  product: { id: PRODUCT, variantId: "var-1", sku: "TRV-1042-BLK", title: "Traverse Travel Jacket", brand: "Urban Carry", barcode: "8901234567890", categoryName: "Jackets", thumbnailUrl: "https://img.test/1.jpg" },
  account: { id: "acc-1", displayName: "Nova Amazon", marketplace: "amazon_in", marketplaceName: "Amazon India", status: "active", mode: "live" },
  content: {
    title: { master: "Traverse Travel Jacket", effective: "Traverse All-Weather Jacket for Travel", overridden: true },
    description: { master: "A durable jacket for long trips and unpredictable weather.", effective: "A durable jacket for long trips and unpredictable weather.", overridden: false },
    bulletPoints: { master: [], effective: ["Water resistant", "Packs into its own pocket"], overridden: true },
    searchTerms: { master: ["jacket"], effective: ["jacket"], overridden: false },
    brand: { master: "Urban Carry", effective: "Urban Carry", overridden: false },
  },
  preview: {
    title: "Traverse All-Weather Jacket for Travel",
    description: "A durable jacket for long trips and unpredictable weather.",
    bulletPoints: ["Water resistant"],
    priceMinor: 289900,
    mrpMinor: 499900,
    discountPercent: 42,
    images: ["https://img.test/1.jpg"],
    endpoint: "amazon_in: putListingsItem",
    payload: { productType: "JACKET", sku: "AMZ-TRV-1042" },
    warnings: ["No search terms sent"],
    approval: { approved: false, current: false, approvedAt: null },
  },
  readiness: {
    percent: 72,
    ready: false,
    summary: { pass: 4, warn: 1, fail: 2 },
    topBlocker: null,
    groups: [
      {
        key: "media",
        label: "Media",
        status: "fail",
        passed: 0,
        total: 1,
        items: [{ key: "images", group: "media", status: "fail", label: "Images", message: "No product images", field: "images", fix: { action: "upload_images", field: "images" } }],
      },
      {
        key: "price",
        label: "Price",
        status: "warn",
        passed: 0,
        total: 1,
        items: [{ key: "mrp", group: "price", status: "warn", label: "MRP", message: "No MRP", field: "mrp", fix: { action: "set_mrp", field: "mrp" } }],
      },
      {
        key: "category",
        label: "Category mapping",
        status: "fail",
        passed: 0,
        total: 1,
        items: [{ key: "category", group: "category", status: "fail", label: "Marketplace category", message: "Choose a category", field: null, fix: { action: "map_category", field: null } }],
      },
      {
        key: "content",
        label: "Content",
        status: "pass",
        passed: 1,
        total: 1,
        items: [{ key: "title", group: "content", status: "pass", label: "Title", message: "The listing has a title", field: "title", fix: null }],
      },
    ],
  },
  pricing: {
    priceMinor: 289900,
    mrpMinor: 499900,
    salePriceMinor: null,
    saleEndsAt: null,
    discountPercent: 42,
    variantPriceMinor: 299900,
    variantMrpMinor: 499900,
    listingPriceOverride: true,
    listingMrpOverride: true,
    costMinor: 150000,
    grossMarginMinor: 139900,
    currency: "INR",
  },
  stock: { available: 14, sellable: 12, pushed: null, dirty: false, bufferOverride: null, maxQuantityOverride: null, pushedAt: null },
  category: {
    marketplaceCategoryId: "cat-9",
    marketplaceCategoryName: "Men's Jackets",
    masterCategoryName: "Jackets",
    attributes: [
      { key: "colour", label: "Colour", required: true, type: "string", allowedValues: null, maxLength: 40, value: "Black", source: "listing", channelSpecific: true, status: "pass" },
      { key: "fit", label: "Fit type", required: true, type: "enum", allowedValues: ["Regular", "Slim"], maxLength: null, value: null, source: null, channelSpecific: false, status: "fail" },
    ],
  },
  media: [{ id: "m1", url: "https://img.test/1.jpg", fileName: "front.jpg", isPrimary: true, width: 1200, height: 1200 }],
  variations: [
    { variantId: "var-1", sku: "TRV-1042-BLK", optionValues: { Colour: "Black" }, priceMinor: 299900, available: 14, listingId: ID, listingStatus: "draft", current: true },
    { variantId: "var-2", sku: "TRV-1042-NVY", optionValues: { Colour: "Navy" }, priceMinor: 299900, available: 3, listingId: null, listingStatus: null, current: false },
  ],
  contentSync: { state: "synced", changedFields: [], review: {}, error: null, changedAt: null, syncedAt: null },
  marketplaceIssues: [],
  externalUrl: null,
  activity: {
    total: 3,
    items: [
      { id: "a1", at: "2026-10-20T08:46:00.000Z", action: "listing.update", title: "Price changed", details: "From 2,999 to 2,899", actor: { type: "user", id: "u1", name: "Asha Admin" } },
      { id: "a2", at: "2026-10-19T08:46:00.000Z", action: "listing.create", title: "Listing created", details: "", actor: { type: "user", id: "u1", name: "Asha Admin" } },
    ],
  },
  actions: ACTIONS,
  ...over,
});

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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/listings/:id", element: <ListingStudioPage /> },
      { path: "/listings", element: <p>Listings page</p> },
      { path: "/products/:id", element: <p>Product page</p> },
    ],
    { initialEntries: [`/listings/${ID}`] },
  );
  const view = render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router };
}

const openTab = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await screen.findByRole("tab", { name });
  await user.click(screen.getByRole("tab", { name }));
};
const saveBtn = () => screen.getByRole("button", { name: /^Save (Draft|Changes)$/ });

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.getStudio.mockResolvedValue(studio());
  signIn(["listings:read", "listings:write"]);
});

describe("ListingStudioPage render", () => {
  it("shows the header, chips and overview from the studio read model", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Traverse Travel Jacket" })).toBeInTheDocument();
    expect(screen.getByText(/CHANNEL STUDIO · AMAZON INDIA/)).toBeInTheDocument();
    expect(screen.getByText("Content synced")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /TRV-1042-BLK/ })).toHaveAttribute("href", `/products/${PRODUCT}`);
    expect(screen.getByText("Men's Jackets")).toBeInTheDocument();
    expect(screen.getByText("AMZ-TRV-1042")).toBeInTheDocument();
    expect(screen.getByText("Pending Creation")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Readiness score" })).toHaveAttribute("aria-valuenow", "72");
    expect(api.getStudio).toHaveBeenCalledWith(ID);
  });

  it("renders every tab from the same data", async () => {
    const user = userEvent.setup();
    renderPage();
    await openTab(user, "Content & SEO");
    expect(screen.getByLabelText("Marketplace Product Title")).toHaveValue("Traverse All-Weather Jacket for Travel");
    expect(screen.getByLabelText("Bullet point 2")).toHaveValue("Packs into its own pocket");
    await openTab(user, "Attributes");
    expect(screen.getByRole("textbox", { name: /Colour/ })).toHaveValue("Black");
    expect(screen.getByRole("combobox", { name: /Fit type/ })).toHaveValue("");
    await openTab(user, "Media Runway");
    expect(screen.getByRole("link", { name: "Manage images on the product" })).toHaveAttribute("href", `/products/${PRODUCT}?tab=media`);
    await openTab(user, "Variations");
    expect(screen.getByText("TRV-1042-NVY")).toBeInTheDocument();
    await openTab(user, "Pricing & Stock");
    expect(screen.getByLabelText("Channel selling price (INR)")).toHaveValue("2899.00");
    expect(screen.getByLabelText(/^MRP/)).toHaveValue("4999.00");
    expect(screen.getByText("Up to date")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pricing module" })).toHaveAttribute("href", "/pricing");
    await openTab(user, "Readiness Check");
    expect(screen.getByText("Category mapping")).toBeInTheDocument();
    expect(screen.getByText("The listing has a title")).toBeInTheDocument();
    await openTab(user, "Preview");
    expect(screen.getByText("amazon_in: putListingsItem")).toBeInTheDocument();
    expect(screen.getByLabelText("Request payload")).toHaveTextContent("AMZ-TRV-1042");
    await openTab(user, "Activity Log");
    expect(screen.getByText("Price changed")).toBeInTheDocument();
  });

  it("shows a skeleton while loading", async () => {
    api.getStudio.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(await screen.findByLabelText("Loading the listing studio")).toBeInTheDocument();
  });

  it("shows the not found state for a 404", async () => {
    api.getStudio.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "Listing not found", status: 404 }));
    renderPage();
    expect(await screen.findByText("Listing not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("shows an error with retry", async () => {
    const user = userEvent.setup();
    api.getStudio.mockRejectedValue(new ApiError({ code: "VALIDATION_FAILED", message: "Boom", status: 400 }));
    renderPage();
    await screen.findByText("Could not load this listing");
    api.getStudio.mockResolvedValue(studio());
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Traverse Travel Jacket" })).toBeInTheDocument();
  });

  it("is read-only for a viewer", async () => {
    const user = userEvent.setup();
    signIn(["listings:read"]);
    renderPage();
    await openTab(user, "Content & SEO");
    expect(screen.getByLabelText("Marketplace Product Title")).toHaveAttribute("readonly");
    expect(saveBtn()).toBeDisabled();
    expect(screen.getByRole("button", { name: /Publish to channel/ })).toBeDisabled();
    expect(screen.getByText(/read-only access/)).toBeInTheDocument();
  });

  it("disables a button with the server reason", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unpublish" })).toHaveAttribute("title", "Only an active or pending listing can be unpublished");
  });
});

describe("editing and saving", () => {
  it("saves a price in minor units with the listing version", async () => {
    const user = userEvent.setup();
    api.save.mockResolvedValue({});
    renderPage();
    await openTab(user, "Pricing & Stock");
    const price = screen.getByLabelText("Channel selling price (INR)");
    await user.clear(price);
    await user.type(price, "2899.55");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    api.getStudio.mockResolvedValue(studio({ listing: { ...studio().listing, version: 6, priceMinor: 289955 }, pricing: { ...studio().pricing, priceMinor: 289955 } }));
    await user.click(saveBtn());
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(ID, { version: 5, priceMinor: 289955 }));
    await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
    expect(screen.getByLabelText("Channel selling price (INR)")).toHaveValue("2899.55");
  });

  it("sends only the changed channel fields and resets a customised title to the master", async () => {
    const user = userEvent.setup();
    api.save.mockResolvedValue({});
    renderPage();
    await openTab(user, "Content & SEO");
    expect(screen.getAllByText("Customised for this channel").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Reset to master: Marketplace Product Title" }));
    expect(screen.getByLabelText("Marketplace Product Title")).toHaveValue("Traverse Travel Jacket");
    await user.click(saveBtn());
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(ID, { version: 5, title: null }));
  });

  it("saves a description and bullets as channel content", async () => {
    const user = userEvent.setup();
    api.save.mockResolvedValue({});
    renderPage();
    await openTab(user, "Content & SEO");
    const desc = screen.getByLabelText("Description");
    await user.clear(desc);
    await user.type(desc, "New copy for this channel");
    await user.click(screen.getByRole("button", { name: "Remove bullet point 1" }));
    await user.click(saveBtn());
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(ID, { version: 5, description: "New copy for this channel", bulletPoints: ["Packs into its own pocket"] }));
  });

  it("saves an attribute override and refuses attribute edits on a live listing", async () => {
    const user = userEvent.setup();
    api.save.mockResolvedValue({});
    renderPage();
    await openTab(user, "Attributes");
    await user.selectOptions(screen.getByRole("combobox", { name: /Fit type/ }), "Slim");
    await user.click(saveBtn());
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(ID, { version: 5, attributeOverrides: { fit: "Slim" } }));
  });

  it("locks attributes on a live listing", async () => {
    const user = userEvent.setup();
    api.getStudio.mockResolvedValue(studio({ listing: { ...studio().listing, status: "active", externalListingId: "B0ABC" } }));
    renderPage();
    await openTab(user, "Attributes");
    expect(screen.getByText(/cannot be changed. Unpublish/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Fit type/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  });

  it("maps a price_above_mrp error onto the price input", async () => {
    const user = userEvent.setup();
    api.save.mockRejectedValue(new ApiError({ code: "VALIDATION_FAILED", message: "The selling price cannot be higher than the MRP", status: 400, details: { rule: "price_above_mrp" } }));
    renderPage();
    await openTab(user, "Pricing & Stock");
    const price = screen.getByLabelText("Channel selling price (INR)");
    await user.clear(price);
    await user.type(price, "6000");
    await user.click(saveBtn());
    expect(await screen.findByText("The selling price cannot be higher than the MRP.")).toBeInTheDocument();
    expect(screen.getByLabelText("Channel selling price (INR)")).toHaveAttribute("aria-invalid", "true");
  });

  it("maps issue paths of a 400 onto inputs", async () => {
    const user = userEvent.setup();
    api.save.mockRejectedValue(new ApiError({ code: "VALIDATION_FAILED", message: "Invalid", status: 400, details: { issues: [{ path: "title", message: "Too long" }] } }));
    renderPage();
    await openTab(user, "Content & SEO");
    await user.type(screen.getByLabelText("Marketplace Product Title"), "x");
    await user.click(saveBtn());
    expect(await screen.findByText("Too long")).toBeInTheDocument();
  });

  it("rejects an invalid amount before calling the API", async () => {
    const user = userEvent.setup();
    renderPage();
    await openTab(user, "Pricing & Stock");
    const price = screen.getByLabelText("Channel selling price (INR)");
    await user.clear(price);
    await user.type(price, "12.345");
    await user.click(saveBtn());
    expect(await screen.findByText("Enter an amount like 2899 or 2899.50")).toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
  });

  it("opens the conflict dialog on a version conflict and reloads the latest", async () => {
    const user = userEvent.setup();
    api.save.mockRejectedValue(new ApiError({ code: "VERSION_CONFLICT", message: "Resource was modified by someone else", status: 409, details: { currentVersion: 6 } }));
    renderPage();
    await openTab(user, "Content & SEO");
    await user.type(screen.getByLabelText("Marketplace Product Title"), "!");
    await user.click(saveBtn());
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("This listing was changed by someone else")).toBeInTheDocument();
    api.getStudio.mockResolvedValue(studio({ listing: { ...studio().listing, version: 6 } }));
    const before = api.getStudio.mock.calls.length;
    await user.click(within(dialog).getByRole("button", { name: "Reload latest" }));
    await waitFor(() => expect(api.getStudio.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText("Marketplace Product Title")).toHaveValue("Traverse All-Weather Jacket for Travel"));
  });
});

describe("publish flow", () => {
  const step = (s: string, status: "ok" | "failed" | "not_run", message: string) => ({ step: s, status, message, code: null, durationMs: 4 });

  it("shows the blocking step when the flow is blocked", async () => {
    const user = userEvent.setup();
    api.publishFlow.mockResolvedValue({
      listingId: ID,
      outcome: "blocked",
      steps: [step("validate", "failed", "2 validation errors: Colour is required"), step("approve", "not_run", ""), step("publish", "not_run", "")],
      job: null,
      alreadyQueued: false,
    });
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: /Publish to channel/ }));
    const card = await screen.findByRole("region", { name: "Publish result" });
    expect(within(card).getByText("Not published: fix the problems below")).toBeInTheDocument();
    expect(within(card).getAllByText("2 validation errors: Colour is required").length).toBeGreaterThan(0);
    expect(api.getJob).not.toHaveBeenCalled();
  });

  it("saves unsaved edits before it publishes", async () => {
    const user = userEvent.setup();
    api.save.mockResolvedValue({});
    api.publishFlow.mockResolvedValue({ listingId: ID, outcome: "not_applicable", steps: [], job: null, alreadyQueued: false });
    renderPage();
    await openTab(user, "Content & SEO");
    await user.type(screen.getByLabelText("Brand"), " Co");
    await user.click(screen.getByRole("button", { name: /Publish to channel/ }));
    await waitFor(() => expect(api.publishFlow).toHaveBeenCalledWith(ID));
    expect(api.save).toHaveBeenCalledWith(ID, { version: 5, brand: "Urban Carry Co" });
    expect(api.save.mock.invocationCallOrder[0]).toBeLessThan((api.publishFlow.mock.invocationCallOrder[0] ?? 0));
  });

  it("polls the queued job with a visible progress state and refreshes when it is done", async () => {
    const user = userEvent.setup();
    api.publishFlow.mockResolvedValue({
      listingId: ID,
      outcome: "queued",
      steps: [step("validate", "ok", "Valid"), step("approve", "ok", "Approved"), step("publish", "ok", "Queued")],
      job: { id: "job-1", status: "queued", error: null },
      alreadyQueued: false,
    });
    api.getJob.mockResolvedValueOnce({ id: "job-1", status: "running", error: null });
    api.getJob.mockResolvedValue({ id: "job-1", status: "succeeded", error: null });
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: /Publish to channel/ }));
    expect(await screen.findByText("Publishing to the marketplace")).toBeInTheDocument();
    expect(await screen.findByText("Running")).toBeInTheDocument();
    const calls = api.getStudio.mock.calls.length;
    expect(await screen.findByText("Finished", {}, { timeout: 6000 })).toBeInTheDocument();
    await waitFor(() => expect(api.getStudio.mock.calls.length).toBeGreaterThan(calls));
  }, 15000);

  it("shows a failed job with its error", async () => {
    const user = userEvent.setup();
    api.publishFlow.mockResolvedValue({ listingId: ID, outcome: "queued", steps: [], job: { id: "job-2", status: "queued", error: null }, alreadyQueued: false });
    api.getJob.mockResolvedValue({ id: "job-2", status: "failed", error: { code: "MARKETPLACE", message: "Amazon rejected the feed" } });
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: /Publish to channel/ }));
    expect(await screen.findByText(/Amazon rejected the feed/)).toBeInTheDocument();
  });

  it("validates from the header", async () => {
    const user = userEvent.setup();
    api.validate.mockResolvedValue({ validation: { ready: false, errors: [{ code: "attribute_missing", message: "x", attribute: "fit" }], warnings: [] } });
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() => expect(api.validate).toHaveBeenCalledWith(ID));
  });
});

describe("content review of a live listing", () => {
  const needsReview = () =>
    studio({
      listing: { ...studio().listing, status: "active", externalListingId: "B0ABC", contentState: "needs_review", contentReview: { reason: "category_changed", suggestedMarketplaceCategoryId: "cat-77", suggestedMarketplaceCategoryName: "Rain Jackets" } },
      contentSync: { state: "needs_review", changedFields: ["category"], review: { reason: "category_changed", suggestedMarketplaceCategoryId: "cat-77", suggestedMarketplaceCategoryName: "Rain Jackets" }, error: null, changedAt: null, syncedAt: null },
      actions: ACTIONS.map((a) => (a.action === "resolve_review" ? { ...a, enabled: true, disabledReason: null } : a)),
    });

  it("accepts the suggested mapping", async () => {
    const user = userEvent.setup();
    api.getStudio.mockResolvedValue(needsReview());
    api.resolveReview.mockResolvedValue({ syncQueued: true });
    renderPage();
    const panel = await screen.findByRole("region", { name: "Category review" });
    expect(within(panel).getByText("Rain Jackets")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Use suggested category" }));
    await waitFor(() => expect(api.resolveReview).toHaveBeenCalledWith(ID, { action: "accept_mapping" }));
  });

  it("keeps the current category", async () => {
    const user = userEvent.setup();
    api.getStudio.mockResolvedValue(needsReview());
    api.resolveReview.mockResolvedValue({ syncQueued: false });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Keep current category" }));
    await waitFor(() => expect(api.resolveReview).toHaveBeenCalledWith(ID, { action: "keep_current" }));
  });

  it("chooses another category through the marketplace search", async () => {
    const user = userEvent.setup();
    api.getStudio.mockResolvedValue(needsReview());
    api.resolveReview.mockResolvedValue({ syncQueued: true });
    api.searchCategories.mockResolvedValue([
      { id: "root", name: "Clothing", path: "Clothing", leaf: false },
      { id: "cat-5", name: "Windcheaters", path: "Clothing > Jackets > Windcheaters", leaf: true },
    ]);
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Choose another category" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("button", { name: /Windcheaters/ }));
    expect(within(dialog).getByRole("button", { name: /^Clothing/ })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Use this category" }));
    await waitFor(() => expect(api.resolveReview).toHaveBeenCalledWith(ID, { action: "set_category", marketplaceCategoryId: "cat-5" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("retries a failed content update", async () => {
    const user = userEvent.setup();
    api.getStudio.mockResolvedValue(
      studio({
        listing: { ...studio().listing, status: "active", externalListingId: "B0ABC", contentState: "failed", contentError: "Throttled" },
        contentSync: { state: "failed", changedFields: ["title"], review: {}, error: "Throttled", changedAt: null, syncedAt: null },
        actions: ACTIONS.map((a) => (a.action === "sync_content" ? { ...a, enabled: true, disabledReason: null } : a)),
      }),
    );
    api.contentSync.mockResolvedValue({ job: { id: "job-3", status: "queued", error: null }, alreadyQueued: false });
    api.getJob.mockResolvedValue({ id: "job-3", status: "running", error: null });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Retry now" }));
    await waitFor(() => expect(api.contentSync).toHaveBeenCalledWith(ID));
    expect(await screen.findByText("Sending the latest content")).toBeInTheDocument();
  });
});

describe("readiness fix actions", () => {
  it("focuses the MRP input for a price fix", async () => {
    const user = userEvent.setup();
    renderPage();
    await openTab(user, "Readiness Check");
    await user.click(screen.getByRole("button", { name: "Set MRP: MRP" }));
    await waitFor(() => expect(screen.getByLabelText(/^MRP/)).toHaveFocus());
  });

  it("opens the category dialog for a mapping fix", async () => {
    const user = userEvent.setup();
    api.searchCategories.mockResolvedValue([]);
    renderPage();
    await openTab(user, "Readiness Check");
    await user.click(screen.getByRole("button", { name: "Choose category: Marketplace category" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Choose a Amazon India category")).toBeInTheDocument();
  });

  it("navigates to the product media for an image fix", async () => {
    const user = userEvent.setup();
    const { router } = renderPage();
    await openTab(user, "Readiness Check");
    await user.click(screen.getByRole("button", { name: "Add images: Images" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/products/${PRODUCT}`));
    expect(router.state.location.search).toBe("?tab=media");
  });
});

describe("activity timeline", () => {
  it("loads the next page", async () => {
    const user = userEvent.setup();
    api.getActivity.mockResolvedValue({ total: 3, page: 2, pageSize: 20, pages: 2, items: [{ id: "a3", at: "2026-10-18T08:46:00.000Z", action: "listing.validate", title: "Validated", details: "No errors", actor: { type: "system", id: null, name: "System" } }] });
    renderPage();
    await openTab(user, "Activity Log");
    expect(screen.getByText("Showing 2 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Validated")).toBeInTheDocument();
    expect(api.getActivity).toHaveBeenCalledWith(ID, 2);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });
});

describe("leaving with unsaved edits", () => {
  it("asks before leaving", async () => {
    const user = userEvent.setup();
    renderPage();
    await openTab(user, "Content & SEO");
    await user.type(screen.getByLabelText("Brand"), "x");
    await user.click(screen.getByRole("button", { name: /Back to Listings/ }));
    expect(await screen.findByText("You have unsaved changes")).toBeInTheDocument();
  });
});
