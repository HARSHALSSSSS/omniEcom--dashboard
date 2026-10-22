import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { AiSuggestion, ChangeImpact, EditSaveResult, EditorProduct, EditorView, Insight } from "@/types/productEdit";

const api = vi.hoisted(() => ({
  getEditor: vi.fn(),
  changeImpact: vi.fn(),
  save: vi.fn(),
  getInsights: vi.fn(),
  dismissInsight: vi.fn(),
  restoreInsight: vi.fn(),
  suggestDescription: vi.fn(),
  acceptDescription: vi.fn(),
  dismissDescription: vi.fn(),
  listCategories: vi.fn(),
  listCategoryAttributes: vi.fn(),
}));
vi.mock("@/api/productEdit.api", () => ({ productEditApi: api }));
const brandsApi = vi.hoisted(() => ({ brands: vi.fn() }));
vi.mock("@/api/productCreation.api", () => ({ productCreationApi: brandsApi }));
// product images sit behind the bearer token: a missing image shows the neutral box
vi.mock("@/api/productDetail.api", () => ({ productDetailApi: { imageBlob: vi.fn().mockRejectedValue(new Error("no image")) } }));

import EditProductPage from "./EditProductPage";

const ID = "11111111-1111-4111-8111-111111111111";
const CAT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const product = (over: Partial<EditorProduct> = {}): EditorProduct => ({
  id: ID,
  productCode: "TRV-1042",
  title: "Premium Travel Bag",
  description: "A durable premium travel bag designed for short business trips and weekend travel.",
  descriptionHtml: "<p>A durable premium travel bag designed for short business trips and weekend travel.</p>",
  brand: "Urban Carry",
  manufacturer: null,
  countryOfOrigin: null,
  categoryId: CAT_A,
  hsnCode: null,
  gstRateBps: null,
  tags: [],
  dimensions: null,
  weight: null,
  material: null,
  standardCategory: null,
  customAttributes: [],
  productType: "physical",
  status: "active",
  productCodeLocked: true,
  variantCount: 2,
  version: 3,
  createdAt: "2026-01-18T10:00:00.000Z",
  updatedAt: "2026-10-20T08:46:00.000Z",
  category: { id: CAT_A, name: "Travel Accessories" },
  brandRecord: null,
  primaryImage: { state: "ready", documentId: "d1", url: "/img/1" },
  ...over,
});

const insight: Insight = {
  key: "description_short",
  severity: "suggestion",
  message: "Your product description is shorter than the average for this category.",
  detail: "Adding key product benefits may improve listing completeness.",
  actions: [
    { key: "review_suggestion", label: "Review suggestion", method: "POST", href: `/api/v1/products/${ID}/ai/description`, body: { mode: "benefits" } },
    { key: "dismiss", label: "Dismiss", method: "POST", href: `/api/v1/products/${ID}/insights/description_short/dismiss` },
  ],
  data: {},
};
const mediaInsight: Insight = {
  key: "few_images",
  severity: "suggestion",
  message: "Add more product images",
  detail: "Listings with several images convert better.",
  actions: [
    { key: "manage_media", label: "Manage media", method: "GET", href: `/products/${ID}?tab=media` },
    { key: "dismiss", label: "Dismiss", method: "POST", href: `/api/v1/products/${ID}/insights/few_images/dismiss` },
  ],
  data: {},
};

const editor = (over: Partial<EditorView> = {}, p: Partial<EditorProduct> = {}): EditorView => ({
  product: product(p),
  version: 3,
  status: "active",
  locks: { productCode: { locked: true, reason: "Used as the primary internal product identifier." } },
  meta: { productId: "TRV-1042", createdAt: "2026-01-18T10:00:00.000Z", updatedAt: "2026-10-20T08:46:00.000Z", updatedBy: { id: "u1", name: "Asha Admin" } },
  nav: [
    { key: "overview", label: "Overview" },
    { key: "media", label: "Media", count: 3 },
    { key: "details", label: "Details" },
    { key: "variants", label: "Variants", count: 2 },
    { key: "inventory", label: "Inventory" },
    { key: "listings", label: "Listings", count: 3 },
    { key: "content", label: "Content" },
    { key: "activity", label: "Activity" },
  ],
  attributes: {
    configured: 0,
    customConfirmed: 0,
    slots: [
      { key: "material", label: "Material", supplied: false },
      { key: "dimensions", label: "Dimensions", supplied: false },
      { key: "weight", label: "Weight", supplied: false },
      { key: "countryOfOrigin", label: "Country of origin", supplied: false },
      { key: "hsnCode", label: "HSN code", supplied: false },
      { key: "taxInformation", label: "Tax information", supplied: false },
    ],
    note: "Attribute values were not supplied in the existing product record. Confirm factual and tax details before distributing them.",
  },
  media: { primaryImageUrl: "/img/1", thumbnails: [{ id: "d1", url: "/img/1", isPrimary: true, isPlaceholder: false }], total: 1 },
  inheritance: {
    channels: [
      { code: "amazon_in", name: "Amazon", accountId: "acc-1", listingId: "l1", listings: 1, listingStatus: "active", independentFields: [] },
      { code: "shopify", name: "Shopify", accountId: "acc-4", listingId: "l4", listings: 1, listingStatus: "active", independentFields: ["title"] },
    ],
    text: "Changes to core product information may be reflected across connected listings. Marketplace-specific content remains independently manageable.",
    limited: false,
  },
  readiness: {
    percent: 92,
    items: [
      { key: "core_information", label: "Core information", state: "done" },
      { key: "product_media", label: "Product media", state: "done" },
      { key: "required_attributes", label: "Required attributes", state: "done" },
      { key: "marketplace_content", label: "Marketplace content", state: "pending", detail: "1 marketplace listing needs content review.", action: { label: "Review", href: `/products/${ID}?tab=listings` } },
    ],
    listings: { total: 3, needsReview: 1, syncPending: 0, failed: 0, needsRepublish: 0, rejected: 0 },
  },
  insights: [insight],
  dismissedInsights: [],
  ...over,
});

const impact = (over: Partial<ChangeImpact> = {}): ChangeImpact => ({
  hasChanges: true,
  items: [{ field: "title", label: "Product name", message: "Product name changed" }],
  summary: "Product name changed",
  detail: null,
  listings: { potential: 3, live: 3 },
  channels: [
    { code: "amazon_in", name: "Amazon", accountId: "acc-1", accountName: "Amazon IN", listingId: "l1", listings: 1, effect: "name_inherited", independentFields: [], supportsUpdate: true },
    { code: "flipkart", name: "Flipkart", accountId: "acc-2", accountName: "Flipkart", listingId: "l2", listings: 1, effect: "name_inherited", independentFields: [], supportsUpdate: true },
    { code: "shopify", name: "Shopify", accountId: "acc-4", accountName: "Shopify", listingId: "l4", listings: 1, effect: "independent", independentFields: ["title"], supportsUpdate: true },
  ],
  independentNote: "Shopify content is independently managed.",
  notSentNote: "Updates are not sent to listings until you save.",
  requiresConfirmation: false,
  errors: [],
  ...over,
});

const saved = (title = "Urban Carry Premium Travel Bag", over: Partial<EditorProduct> = {}): EditSaveResult => ({
  saved: true,
  noChanges: false,
  savedAt: "2026-10-20T09:00:00.000Z",
  version: 4,
  product: product({ title, version: 4, ...over }),
  impact: {
    listingsQueued: 3,
    channels: [
      { code: "amazon_in", name: "Amazon", accountId: "acc-1", listingId: "l1", listings: 1, state: "sync_pending" },
      { code: "flipkart", name: "Flipkart", accountId: "acc-2", listingId: "l2", listings: 1, state: "sync_pending" },
      { code: "shopify", name: "Shopify", accountId: "acc-4", listingId: "l4", listings: 1, state: "independent" },
    ],
    text: "3 listings will sync shortly.",
    notSyncedYet: "Saved to the master product. Listings have not synced yet.",
    independentNote: "Shopify content is independently managed.",
  },
  readiness: editor().readiness,
  insights: [insight],
});

const suggestion = (over: Partial<AiSuggestion> = {}): AiSuggestion => ({
  id: "s1",
  productId: ID,
  mode: "rewrite",
  text: "A durable, premium travel bag for short business trips and weekend travel.",
  html: "<p>A durable, premium travel bag for short business trips and weekend travel.</p>",
  basis: [],
  needsFacts: false,
  unchanged: false,
  status: "suggested",
  applied: false,
  note: "note",
  explanation: "Simplifies the sentence using only your existing description. No new features or product claims have been added. Your original remains unchanged above.",
  provider: "rules",
  createdAt: "2026-10-20T09:00:00.000Z",
  expiresAt: "2026-10-27T09:00:00.000Z",
  decidedAt: null,
  alternatives: [
    {
      id: "s2",
      productId: ID,
      mode: "concise",
      text: "A durable premium travel bag for short trips.",
      html: "<p>A durable premium travel bag for short trips.</p>",
      basis: [],
      needsFacts: false,
      unchanged: false,
      status: "suggested",
      applied: false,
      note: "",
      explanation: "Shortens.",
      provider: "rules",
      createdAt: "2026-10-20T09:00:00.000Z",
      expiresAt: "2026-10-27T09:00:00.000Z",
      decidedAt: null,
    },
  ],
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
      features: { "ai.enabled": true },
    },
    onboardingStatus: "completed",
    onboardingResumeStep: "ready",
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/products/:id/edit", element: <EditProductPage /> },
      { path: "/products/:id/variants", element: <p>Variants page</p> },
      { path: "/products/:id", element: <p>Detail page</p> },
    ],
    { initialEntries: [`/products/${ID}/edit`] },
  );
  const view = render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router };
}

const titleInput = () => screen.getByLabelText("Product name") as HTMLInputElement;
// the design has the actions in the header and in the bottom bar: both behave the same
const saveButton = () => screen.getAllByRole("button", { name: /^(Save changes|Saving\.\.\.)$/ })[0] as HTMLElement;
/** Save opens the design's impact dialog on every save; "Save and continue" posts the save */
async function clickSave(user: ReturnType<typeof userEvent.setup>) {
  await user.click(saveButton());
  await user.click(await screen.findByRole("button", { name: "Save and continue" }));
}
const discardButtons = () => screen.getAllByRole("button", { name: "Discard" });

async function pickCategory(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByLabelText("Category"));
  await user.click(await screen.findByRole("option", { name }));
}

async function editTitle(user: ReturnType<typeof userEvent.setup>, text = " Extra") {
  await screen.findByLabelText("Product name");
  await user.click(titleInput());
  await user.type(titleInput(), text);
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.getEditor.mockResolvedValue(editor());
  api.getInsights.mockResolvedValue({ items: [insight], dismissed: [] });
  api.listCategories.mockResolvedValue([
    { id: CAT_A, parentId: null, name: "Travel Accessories", path: "travel" },
    { id: CAT_B, parentId: null, name: "Luggage & Travel Bags", path: "luggage" },
  ]);
  api.changeImpact.mockResolvedValue(impact());
  brandsApi.brands.mockReset();
  brandsApi.brands.mockResolvedValue([
    { id: "b1", name: "Urban Carry", confirmed: true },
    { id: "b2", name: "Nova Living", confirmed: true },
  ]);
  useWorkspaceStore.getState().clearWorkspace();
  signIn(["products:read", "products:write"]);
});

describe("EditProductPage", () => {
  it("loads the editor from the API: fields, locked SKU, meta, nav counts, readiness, insight, attributes", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole("status", { name: "Loading product editor" })).toBeInTheDocument();

    expect(await screen.findByRole("heading", { level: 1, name: "Edit product" })).toBeInTheDocument();
    expect(titleInput().value).toBe("Premium Travel Bag");
    const sku = screen.getByLabelText("Master SKU") as HTMLInputElement;
    expect(sku.value).toBe("TRV-1042");
    expect(sku).toHaveAttribute("readonly");
    expect(screen.getByText(/Locked\. Used as the primary internal product identifier\./)).toBeInTheDocument();
    expect((screen.getByLabelText("Brand") as HTMLInputElement).value).toBe("Urban Carry");
    expect(screen.getByLabelText("Category")).toHaveTextContent("Travel Accessories");
    expect(screen.getByLabelText("Product type")).toHaveTextContent("Physical product");
    expect(screen.getByText("Active", { selector: "span" })).toBeInTheDocument();

    // nothing was saved yet: no "Saved" marker, the bottom bar says so
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("No changes made")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Products/Premium Travel Bag");

    const nav = screen.getByRole("navigation", { name: "Product" });
    expect(within(nav).getByRole("link", { name: /Variants/ })).toHaveAttribute("href", `/products/${ID}/variants`);
    expect(within(nav).getByRole("link", { name: /Listings/ })).toHaveAttribute("href", `/listings?productId=${ID}`);
    expect(within(nav).getByRole("link", { name: /Media/ })).toHaveAttribute("href", `/products/${ID}?tab=media`);

    expect(screen.getByText("92% complete")).toBeInTheDocument();
    expect(screen.getByText("1 marketplace listing needs content review.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review/ })).toHaveAttribute("href", `/products/${ID}?tab=listings`);
    expect(screen.getByText(/shorter than the average for this category/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View affected listings" })).toHaveAttribute("href", `/listings?productId=${ID}`);

    // price, MRP and stock are variant level
    expect(screen.queryByLabelText(/Selling price/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage variants" })).toHaveAttribute("href", `/products/${ID}/variants`);

    await user.click(screen.getByRole("button", { name: /Additional attributes/ }));
    expect(screen.getByText(/Attribute values were not supplied in the existing product record/)).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("Not supplied")).toHaveLength(7);
    expect(api.getEditor).toHaveBeenCalledWith(ID);
  });

  it("marks a modified field with its previous value and Revert puts it back", async () => {
    const user = userEvent.setup();
    renderPage();
    await editTitle(user, " Pro");

    expect(await screen.findByText("Unsaved changes", { selector: "span[role=status]" })).toBeInTheDocument();
    expect(screen.getByText("Modified")).toBeInTheDocument();
    expect(screen.getByText("Previously: Premium Travel Bag")).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Revert Product name" }));
    expect(titleInput().value).toBe("Premium Travel Bag");
    expect(screen.queryByText("Modified")).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("Revert all and Discard restore every modified field", async () => {
    const user = userEvent.setup();
    renderPage();
    await editTitle(user, " X");
    await user.clear(screen.getByLabelText("Brand"));
    await user.type(screen.getByLabelText("Brand"), "Nova");
    expect(screen.getAllByText("Modified")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Revert all" }));
    expect(titleInput().value).toBe("Premium Travel Bag");
    expect((screen.getByLabelText("Brand") as HTMLInputElement).value).toBe("Urban Carry");

    await user.type(titleInput(), "!");
    await user.click(discardButtons()[0] as HTMLElement);
    expect(titleInput().value).toBe("Premium Travel Bag");
  });

  it("offers the four product types of the design and sends the chosen one (Bundle / Kit)", async () => {
    const user = userEvent.setup();
    api.save.mockResolvedValue(saved("Premium Travel Bag", { productType: "bundle" }));
    renderPage();
    await user.click(await screen.findByLabelText("Product type"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Physical product", "Digital product", "Service / Warranty", "Bundle / Kit"]);
    await user.click(screen.getByRole("option", { name: "Bundle / Kit" }));
    expect(screen.getByLabelText("Product type")).toHaveTextContent("Bundle / Kit");
    await clickSave(user);
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(ID, { version: 3, changes: { productType: "bundle" } }));
  });

  it("shows the attributes of the product category with Supplied / Not supplied, edits them and swaps them on a category change", async () => {
    const user = userEvent.setup();
    const cap = { attributeId: "at-1", code: "capacity", name: "Capacity (Volume)", dataType: "number" as const, unit: "L", isRequired: false, options: [] };
    const care = { attributeId: "at-2", code: "care", name: "Care instructions", dataType: "enum" as const, unit: null, isRequired: true, options: [{ value: "wash", label: "Machine wash" }] };
    api.getEditor.mockResolvedValue(editor({}, { categoryAttributes: [{ ...cap, value: 35 }, { ...care, value: null }] }));
    api.listCategoryAttributes.mockResolvedValue([{ attributeId: "at-3", code: "fabric", name: "Fabric composition", dataType: "text", unit: null, isRequired: false, options: [] }]);
    api.save.mockResolvedValue(saved());
    renderPage();
    await screen.findByLabelText("Product name");
    await user.click(screen.getByRole("button", { name: /Additional attributes/ }));

    const status = within(screen.getByRole("region", { name: "Attribute status" }));
    expect(status.getByText("Capacity (Volume)").closest("li")).toHaveAttribute("data-supplied", "true");
    expect(status.getByText(/Care instructions/).closest("li")).toHaveAttribute("data-supplied", "false");
    expect((screen.getByLabelText("Capacity (Volume)") as HTMLInputElement).value).toBe("35");
    expect(screen.getByText("Required for this category")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Capacity (Volume)"));
    await user.type(screen.getByLabelText("Capacity (Volume)"), "40");
    expect(screen.getByText("Previously: 35 L")).toBeInTheDocument();
    await clickSave(user);
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(ID, { version: 3, changes: { categoryAttributes: [{ attributeId: "at-1", value: "40" }] } }));
  });

  it("swaps the attribute fields when another category is picked and sends only the new category's values", async () => {
    const user = userEvent.setup();
    const cap = { attributeId: "at-1", code: "capacity", name: "Capacity (Volume)", dataType: "number" as const, unit: "L", isRequired: false, options: [] };
    api.getEditor.mockResolvedValue(editor({}, { categoryAttributes: [{ ...cap, value: 35 }] }));
    api.listCategoryAttributes.mockResolvedValue([{ attributeId: "at-3", code: "fabric", name: "Fabric composition", dataType: "text", unit: null, isRequired: false, options: [] }]);
    renderPage();
    await screen.findByLabelText("Product name");
    await user.click(screen.getByRole("button", { name: /Additional attributes/ }));
    await user.clear(screen.getByLabelText("Capacity (Volume)"));
    await pickCategory(user, "Luggage & Travel Bags");
    expect(await screen.findByLabelText("Fabric composition")).toBeInTheDocument();
    expect(screen.queryByLabelText("Capacity (Volume)")).not.toBeInTheDocument();
    expect(api.listCategoryAttributes).toHaveBeenCalledWith(CAT_B);
    await user.type(screen.getByLabelText("Fabric composition"), "Wool");
    await waitFor(() => expect(api.changeImpact).toHaveBeenCalled());
    expect(api.changeImpact.mock.calls.at(-1)?.[1]).toEqual({ categoryId: CAT_B, categoryAttributes: [{ attributeId: "at-3", value: "Wool" }] });
  });

  it("previews the change impact (debounced, one request) and renders channels and notes", async () => {
    const user = userEvent.setup();
    renderPage();
    await editTitle(user, " Plus");

    expect(await screen.findByText("Product name changed", { selector: "span" })).toBeInTheDocument();
    expect(api.changeImpact).toHaveBeenCalledTimes(1);
    expect(api.changeImpact.mock.calls[0]?.[0]).toBe(ID);
    expect(api.changeImpact.mock.calls[0]?.[1]).toEqual({ title: "Premium Travel Bag Plus" });
    expect(screen.getByText(/Potential impact/)).toHaveTextContent("3 connected listings");
    const rows = within(screen.getByRole("list", { name: "Channel impact" }));
    expect(rows.getByText("Amazon")).toBeInTheDocument();
    expect(rows.getAllByText("Name inherited")).toHaveLength(2);
    expect(rows.getByText("Independently managed")).toBeInTheDocument();
    expect(screen.getByText("Shopify content is independently managed.")).toBeInTheDocument();
    expect(screen.getByText("Updates are not sent to listings until you save.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Review affected listings/ })).toHaveAttribute("href", `/listings?productId=${ID}`);
    expect(api.save).not.toHaveBeenCalled();
  });

  it("sends only the changed fields in the API units (basis points, cm, kg) and the rich description", async () => {
    const user = userEvent.setup();
    api.save.mockResolvedValue(saved());
    renderPage();
    await screen.findByLabelText("Product name");
    await user.click(screen.getByRole("button", { name: /Additional attributes/ }));
    await user.type(screen.getByLabelText("Tax information (GST %)"), "18");
    await user.type(screen.getByLabelText("Length in cm"), "50");
    await user.type(screen.getByLabelText("Width in cm"), "30");
    await user.type(screen.getByLabelText("Height in cm"), "25.5");
    await user.type(screen.getByLabelText("Weight (kg)"), "1.2");
    await clickSave(user);

    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save).toHaveBeenCalledWith(ID, { version: 3, changes: { gstRateBps: 1800, dimensions: { length: 50, width: 30, height: 25.5, unit: "cm" }, weight: { value: 1.2, unit: "kg" } } });
  });

  it("shows the save summary from the response and resets the editor to the saved product", async () => {
    const user = userEvent.setup();
    api.save.mockResolvedValue(saved());
    api.getEditor.mockResolvedValueOnce(editor()).mockResolvedValue(editor({ version: 4 }, { title: "Urban Carry Premium Travel Bag", version: 4 }));
    renderPage();
    await editTitle(user, " Plus");
    await clickSave(user);

    expect(await screen.findByText("Changes saved", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("3 listings will sync shortly.")).toBeInTheDocument();
    const states = within(screen.getByRole("list", { name: "Channel sync state" }));
    expect(states.getAllByText("Sync pending")).toHaveLength(2);
    expect(states.getByText("Independently managed")).toBeInTheDocument();
    expect(screen.getByText("Saved to the master product. Listings have not synced yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View listings/ })).toHaveAttribute("href", `/listings?productId=${ID}`);
    expect(screen.getByText("No pending changes")).toBeInTheDocument();
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    expect(titleInput().value).toBe("Urban Carry Premium Travel Bag");
    expect(saveButton()).toBeDisabled();
    expect(api.save).toHaveBeenCalledWith(ID, { version: 3, changes: { title: "Premium Travel Bag Plus" } });
  });

  it("protects against double submit", async () => {
    const user = userEvent.setup();
    let resolve: (v: EditSaveResult) => void = () => undefined;
    api.save.mockReturnValue(new Promise<EditSaveResult>((r) => (resolve = r)));
    api.getEditor.mockResolvedValue(editor({ version: 4 }, { title: "Premium Travel Bag Extra", version: 4 }));
    renderPage();
    await editTitle(user);
    await clickSave(user);
    // while the save is running the dialog cannot confirm again
    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(api.save).toHaveBeenCalledTimes(1);
    resolve(saved("Premium Travel Bag Extra"));
    expect(await screen.findByText("3 listings will sync shortly.")).toBeInTheDocument();
  });

  it("opens the impact dialog on every Save with the real impact (fetched at once when the preview has not loaded); Cancel returns to the form", async () => {
    const user = userEvent.setup();
    let release: (v: ChangeImpact) => void = () => undefined;
    api.changeImpact.mockReturnValue(new Promise<ChangeImpact>((r) => (release = r)));
    renderPage();
    await editTitle(user, " Z");
    await user.click(saveButton());

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("This change may affect connected listings.")).toBeInTheDocument();
    expect(within(dialog).getByText("Checking what this change affects...")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save and continue" })).toBeDisabled();
    release(impact());
    expect(await within(dialog).findByText("3 marketplace listings may be affected.")).toBeInTheDocument();
    const rows = within(within(dialog).getByRole("list", { name: "Affected channels" }));
    expect(rows.getByText("Amazon")).toBeInTheDocument();
    expect(rows.getAllByText("Name inherited")).toHaveLength(2);
    expect(api.save).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(titleInput().value).toBe("Premium Travel Bag Z");
    expect(api.save).not.toHaveBeenCalled();
  });

  it("explains a save that changed nothing (saved: false)", async () => {
    const user = userEvent.setup();
    api.save.mockResolvedValue({ saved: false, noChanges: true, version: 3 });
    renderPage();
    await editTitle(user, " x");
    await clickSave(user);
    expect(await screen.findByText("There were no changes to save.")).toBeInTheDocument();
    expect(titleInput().value).toBe("Premium Travel Bag");
    expect(saveButton()).toBeDisabled();
  });

  it("asks for confirmation on a category change, then saves again with confirm: true", async () => {
    const user = userEvent.setup();
    api.save
      .mockRejectedValueOnce(
        new ApiError({
          code: "CONFLICT",
          message: "This change may affect connected listings: confirm it to save",
          status: 409,
          details: {
            rule: "confirmation_required",
            impact: impact({
              requiresConfirmation: true,
              summary: "Category changed",
              confirmation: {
                title: "This change may affect connected listings.",
                message: "3 marketplace listings may need to be remapped.",
                mapping: { from: "Travel Accessories", to: "Luggage & Travel Bags" },
                channels: [
                  { code: "amazon_in", action: "category_mapping_review" },
                  { code: "flipkart", action: "category_mapping_review" },
                ],
              },
            }),
          },
        }),
      )
      .mockResolvedValueOnce({ ...saved("Premium Travel Bag", { categoryId: CAT_B, category: { id: CAT_B, name: "Luggage & Travel Bags" } }), impact: { ...saved().impact, channels: [{ code: "amazon_in", name: "Amazon", accountId: "acc-1", listingId: "l1", listings: 1, state: "needs_review" }], text: "No listings need to sync." } });
    api.getEditor.mockResolvedValue(editor({ version: 4 }, { categoryId: CAT_B, category: { id: CAT_B, name: "Luggage & Travel Bags" }, version: 4 }));
    api.getEditor.mockResolvedValueOnce(editor());
    renderPage();
    await pickCategory(user, "Luggage & Travel Bags");
    expect(screen.getByText("Previously: Travel Accessories")).toBeInTheDocument();
    await clickSave(user);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("This change may affect connected listings.")).toBeInTheDocument();
    expect(within(dialog).getByText("3 marketplace listings may need to be remapped.")).toBeInTheDocument();
    expect(within(dialog).getByText(/Travel Accessories → Luggage & Travel Bags/)).toBeInTheDocument();
    expect(within(dialog).getAllByText("Category mapping review")).toHaveLength(2);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save.mock.calls[0]?.[1]).toEqual({ version: 3, changes: { categoryId: CAT_B } });

    await user.click(within(dialog).getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1]?.[1]).toEqual({ version: 3, changes: { categoryId: CAT_B }, confirm: true });
    expect(await screen.findByText("Needs review")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Cancel in the confirmation keeps the edit and does not save", async () => {
    const user = userEvent.setup();
    api.save.mockRejectedValue(
      new ApiError({ code: "CONFLICT", message: "confirm", status: 409, details: { rule: "confirmation_required", impact: impact({ requiresConfirmation: true, confirmation: { title: "This change may affect connected listings.", message: "m", channels: [] } }) } }),
    );
    renderPage();
    await pickCategory(user, "Luggage & Travel Bags");
    await clickSave(user);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Category")).toHaveTextContent("Luggage & Travel Bags");
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it("offers to reload on VERSION_CONFLICT, listing what the other save changed", async () => {
    const user = userEvent.setup();
    const current = editor({ version: 4 }, { title: "Their Title", brand: "Other Brand", version: 4 });
    api.save.mockRejectedValue(
      new ApiError({
        code: "VERSION_CONFLICT",
        message: "Version conflict",
        status: 409,
        details: { currentVersion: 4, current, updatedAt: "2026-10-20T09:30:00.000Z", updatedBy: { id: "u2", name: "Sam Staff" } },
      }),
    );
    api.getEditor.mockResolvedValueOnce(editor()).mockResolvedValue(current);
    renderPage();
    await editTitle(user, " Mine");
    await clickSave(user);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("This product was changed by someone else")).toBeInTheDocument();
    expect(within(dialog).getByText(/Sam Staff saved a newer version/)).toBeInTheDocument();
    const list = within(dialog).getByRole("list", { name: "Fields changed by the other save" });
    expect(within(list).getByText("Product name")).toBeInTheDocument();
    expect(within(list).getByText("Brand")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Reload latest" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(titleInput().value).toBe("Their Title");
    expect(saveButton()).toBeDisabled();
  });

  it("can reload on VERSION_CONFLICT and keep my own edits on top", async () => {
    const user = userEvent.setup();
    const current = editor({ version: 4 }, { brand: "Other Brand", version: 4 });
    api.save.mockRejectedValueOnce(new ApiError({ code: "VERSION_CONFLICT", message: "conflict", status: 409, details: { currentVersion: 4, current, updatedAt: "2026-10-20T09:30:00.000Z", updatedBy: null } }));
    api.save.mockResolvedValueOnce(saved("Premium Travel Bag Mine"));
    api.getEditor.mockResolvedValueOnce(editor()).mockResolvedValue(current);
    renderPage();
    await editTitle(user, " Mine");
    await clickSave(user);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Reload and keep my edits" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(titleInput().value).toBe("Premium Travel Bag Mine");
    expect((screen.getByLabelText("Brand") as HTMLInputElement).value).toBe("Other Brand");
    await clickSave(user);
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1]?.[1]).toEqual({ version: 4, changes: { title: "Premium Travel Bag Mine" } });
  });

  it("shows code_locked on the SKU of a draft that became locked", async () => {
    const user = userEvent.setup();
    api.getEditor.mockResolvedValue(editor({ status: "draft", locks: { productCode: { locked: false, reason: null } } }, { status: "draft", productCodeLocked: false }));
    api.save.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "The master code cannot be changed", status: 409, details: { rule: "code_locked" } }));
    renderPage();
    await screen.findByLabelText("Product name");
    const sku = screen.getByLabelText("Master SKU");
    expect(sku).not.toHaveAttribute("readonly");
    await user.clear(sku);
    await user.type(sku, "NEW-1");
    await clickSave(user);
    expect(await screen.findByText("The master SKU cannot be changed once the product is no longer a draft.")).toBeInTheDocument();
    expect(screen.getByText(/The master SKU is locked\. Revert it to save your other changes\./)).toBeInTheDocument();
  });

  it("maps 400 field errors onto the fields", async () => {
    const user = userEvent.setup();
    api.save.mockRejectedValue(
      new ApiError({
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        status: 400,
        details: { issues: [{ path: "title", code: "title_too_short", message: "The product name needs at least 3 characters" }, { path: "gstRateBps", code: "invalid_gst", message: "GST rate must be between 0 and 28" }] },
      }),
    );
    renderPage();
    await editTitle(user, "!");
    await clickSave(user);
    expect(await screen.findByText("The product name needs at least 3 characters")).toBeInTheDocument();
    expect(titleInput()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Some fields need attention/)).toBeInTheDocument();
  });

  it("explains needs_variant with a link to the variants page and too_many_listings", async () => {
    const user = userEvent.setup();
    api.save.mockRejectedValueOnce(new ApiError({ code: "CONFLICT", message: "needs a variant", status: 409, details: { rule: "needs_variant" } }));
    api.save.mockRejectedValueOnce(new ApiError({ code: "PAYLOAD_TOO_LARGE", message: "This product has 501 listings; at most 500 can be processed in one change.", status: 413, details: { rule: "too_many_listings" } }));
    renderPage();
    await editTitle(user, "!");
    await clickSave(user);
    expect(await screen.findByText(/needs at least one active variant/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open variants" })).toHaveAttribute("href", `/products/${ID}/variants`);
    await clickSave(user);
    expect(await screen.findByText(/at most 500 can be processed/)).toBeInTheDocument();
  });

  it("AI: rewrite with an alternative, Apply fills the editor only (persist false) and nothing is saved", async () => {
    const user = userEvent.setup();
    api.suggestDescription.mockResolvedValue(suggestion());
    api.acceptDescription.mockResolvedValue({ suggestion: suggestion({ status: "applied", applied: true }), text: suggestion().text, html: suggestion().html });
    renderPage();
    await screen.findByLabelText("Product name");
    await user.click(screen.getByRole("button", { name: "Improve with AI" }));

    expect(await screen.findByText(/Preview/)).toBeInTheDocument();
    expect(api.suggestDescription).toHaveBeenCalledWith(ID, { mode: "rewrite", text: "A durable premium travel bag designed for short business trips and weekend travel.", alsoSuggest: ["concise"] });
    expect(screen.getByText("A durable, premium travel bag for short business trips and weekend travel.")).toBeInTheDocument();
    expect(screen.getByText(/Simplifies the sentence using only your existing description/)).toBeInTheDocument();
    expect(screen.getByText(/Alternative \(Make more concise\):/)).toBeInTheDocument();
    // the editor still holds the original until Apply
    expect(screen.getByRole("textbox", { name: "Description" }).textContent).toContain("designed for");

    await user.click(screen.getByRole("button", { name: "Apply suggestion" }));
    await waitFor(() => expect(api.acceptDescription).toHaveBeenCalledWith(ID, "s1"));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Description" }).textContent).toBe("A durable, premium travel bag for short business trips and weekend travel."));
    expect(screen.getByText("Previously: A durable premium travel bag designed for short business trips and weekend travel.")).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes", { selector: "span[role=status]" })).toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
    expect(screen.queryByText(/Preview/)).not.toBeInTheDocument();
  });

  it("AI: switching to Make more concise requests that mode; Dismiss discards the suggestion", async () => {
    const user = userEvent.setup();
    api.suggestDescription.mockResolvedValue(suggestion());
    api.dismissDescription.mockResolvedValue(suggestion({ status: "dismissed" }));
    renderPage();
    await screen.findByLabelText("Product name");
    await user.click(screen.getByRole("button", { name: "Improve with AI" }));
    await screen.findByText(/Preview/);
    api.suggestDescription.mockResolvedValue(suggestion({ id: "s9", mode: "concise", text: "Shorter text." }));
    await user.click(screen.getByRole("radio", { name: "Make more concise" }));
    await screen.findByText("Shorter text.");
    expect(api.suggestDescription).toHaveBeenLastCalledWith(ID, expect.objectContaining({ mode: "concise", alsoSuggest: ["rewrite"] }));
    await user.click(within(screen.getByRole("region", { name: "Improve with AI" })).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(api.dismissDescription).toHaveBeenCalledWith(ID, "s9"));
    expect(screen.queryByText(/Preview/)).not.toBeInTheDocument();
  });

  it("AI: shows a clear message when AI is turned off", async () => {
    const user = userEvent.setup();
    api.suggestDescription.mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "off", status: 403, details: { rule: "feature_disabled" } }));
    renderPage();
    await screen.findByLabelText("Product name");
    await user.click(screen.getByRole("button", { name: "Improve with AI" }));
    expect(await screen.findByText("AI suggestions are turned off for this business.")).toBeInTheDocument();
  });

  it("insight Review suggestion opens the AI panel with mode benefits", async () => {
    const user = userEvent.setup();
    api.suggestDescription.mockResolvedValue(suggestion({ mode: "benefits", alternatives: undefined }));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Review suggestion" }));
    await screen.findByText(/Preview/);
    expect(api.suggestDescription).toHaveBeenCalledWith(ID, { mode: "benefits" });
    expect(screen.getByRole("radio", { name: "Highlight key benefits" })).toBeChecked();
  });

  it("insights: Dismiss then Restore call the API and update the list; Manage media links to the media tab", async () => {
    const user = userEvent.setup();
    api.getEditor.mockResolvedValue(editor({ insights: [insight, mediaInsight] }));
    api.getInsights.mockResolvedValueOnce({ items: [insight, mediaInsight], dismissed: [] });
    api.dismissInsight.mockResolvedValue({ key: "description_short", dismissed: true, until: null, insights: [mediaInsight] });
    api.restoreInsight.mockResolvedValue({ key: "description_short", dismissed: false, until: null, insights: [insight, mediaInsight] });
    renderPage();
    const card = await screen.findByRole("region", { name: "Suggested improvement" });
    expect(within(card).getByRole("link", { name: "Manage media" })).toHaveAttribute("href", `/products/${ID}?tab=media`);

    api.getInsights.mockResolvedValue({ items: [mediaInsight], dismissed: [{ ...insight, dismissedAt: "2026-10-20T09:00:00.000Z", until: null }] });
    const row = card.querySelector('[data-insight="description_short"]') as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(api.dismissInsight).toHaveBeenCalledWith(ID, "description_short"));
    expect(await within(card).findByText(/\(dismissed\)/)).toBeInTheDocument();
    expect(card.querySelector('[data-insight="description_short"]')).toBeNull();

    api.getInsights.mockResolvedValue({ items: [insight, mediaInsight], dismissed: [] });
    await user.click(within(card).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(api.restoreInsight).toHaveBeenCalledWith(ID, "description_short"));
    await waitFor(() => expect(card.querySelector('[data-insight="description_short"]')).not.toBeNull());
  });

  it("is read-only for a viewer: inputs disabled, no save, no AI, no dismiss", async () => {
    signIn(["products:read"]);
    renderPage();
    await screen.findByLabelText("Product name");
    expect(titleInput()).toBeDisabled();
    expect(screen.getByLabelText("Brand")).toBeDisabled();
    expect(screen.getByLabelText("Category")).toBeDisabled();
    expect(saveButton()).toBeDisabled();
    discardButtons().forEach((b) => expect(b).toBeDisabled());
    expect(screen.getByText(/You have view-only access to products\./, { selector: "p[role=note]" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Improve with AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review suggestion" })).toBeDisabled();
  });

  it("guards leaving with unsaved changes: Keep editing stays, Discard changes leaves", async () => {
    const user = userEvent.setup();
    const { router } = renderPage();
    await editTitle(user, " Z");
    const nav = screen.getByRole("navigation", { name: "Product" });
    await user.click(within(nav).getByRole("link", { name: /Variants/ }));

    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("You have unsaved changes")).toBeInTheDocument();
    expect(within(dialog).getByText("Your latest edits will be lost if you leave now.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe(`/products/${ID}/edit`);
    expect(titleInput().value).toBe("Premium Travel Bag Z");

    await user.click(within(nav).getByRole("link", { name: /Variants/ }));
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByText("Variants page")).toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
  });

  it("guard: Save changes saves and then leaves", async () => {
    const user = userEvent.setup();
    api.save.mockResolvedValue(saved());
    renderPage();
    await editTitle(user, " Z");
    await user.click(within(screen.getByRole("navigation", { name: "Product" })).getByRole("link", { name: /Variants/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Variants page")).toBeInTheDocument();
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it("shows a not-found state and a retryable error state", async () => {
    api.getEditor.mockRejectedValueOnce(new ApiError({ code: "NOT_FOUND", message: "nope", status: 404 }));
    const first = renderPage();
    expect(await screen.findByRole("heading", { name: "Product not found" })).toBeInTheDocument();
    first.unmount();

    const user = userEvent.setup();
    api.getEditor.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "Boom", status: 500 }));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Could not load this product" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Product name")).toBeInTheDocument();
  });
});
