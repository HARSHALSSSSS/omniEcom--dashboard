import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  formOptions: vi.fn(),
  standardCategories: vi.fn(),
  categoryTree: vi.fn(),
  brands: vi.fn(),
  createBrand: vi.fn(),
  confirmBrand: vi.fn(),
  skuCheck: vi.fn(),
  verifySku: vi.fn(),
  createDraft: vi.fn(),
  patchDraft: vi.fn(),
  getCreation: vi.fn(),
  listDrafts: vi.fn(),
  discardDraft: vi.fn(),
  savedReadiness: vi.fn(),
  previewReadiness: vi.fn(),
  validateStep: vi.fn(),
  continueStep: vi.fn(),
  suggestDescription: vi.fn(),
  applySuggestion: vi.fn(),
  dismissSuggestion: vi.fn(),
  primaryImage: vi.fn(),
  registerImage: vi.fn(),
  uploadImageBytes: vi.fn(),
  cancelUpload: vi.fn(),
  deleteDocument: vi.fn(),
  generatePlaceholder: vi.fn(),
  documentBlob: vi.fn(),
}));
vi.mock("@/api/productCreation.api", async (orig) => ({ ...(await orig<typeof import("@/api/productCreation.api")>()), productCreationApi: api }));

import CreateProductPage from "./CreateProductPage";
import { ApiError } from "@/api/errors";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { CreationDto, CreationReadiness, FormOptions, ProductEditor, ReadinessItem } from "@/types/productCreation";

// ------------------------------------------------------------------------------------------------ fixtures
const options: FormOptions = {
  productTypes: ["physical", "digital", "service"],
  gstSlabs: [
    { bps: 0, label: "0%" },
    { bps: 1800, label: "18%" },
  ],
  countries: [
    { code: "IN", name: "India" },
    { code: "VN", name: "Vietnam" },
  ],
  materials: [{ value: "Canvas", label: "Canvas" }],
  units: { dimension: "cm", weight: "kg", accepted: { dimension: ["cm", "mm", "in"], weight: ["kg", "g", "lb"] } },
  limits: {
    titleMin: 3,
    titleMax: 200,
    descriptionMaxChars: 2000,
    brandMax: 80,
    codeMax: 64,
    hsnLengths: [4, 6, 8],
    materialMax: 80,
    standardCategoryMax: 120,
    gstMaxBps: 2800,
    customAttributes: { max: 20, nameMax: 60, valueMax: 250 },
    dimensionMaxMm: 100000,
    weightMaxGrams: 10000000,
  },
  image: { maxBytes: 10 * 1024 * 1024, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"], maxPerProduct: 20, minShortSidePx: 200, recommendedLongSidePx: 1000 },
};

const item = (key: string, label: string, state: ReadinessItem["state"]): ReadinessItem => ({ key, label, state });
function readiness(over: Partial<CreationReadiness> = {}, states: Partial<Record<string, ReadinessItem["state"]>> = {}): CreationReadiness {
  const s = (k: string, d: ReadinessItem["state"]) => states[k] ?? d;
  return {
    percent: 38,
    required: [
      item("product_name", "Product name", s("product_name", "done")),
      item("category", "Category", s("category", "done")),
      item("product_type", "Product type", s("product_type", "done")),
      item("primary_image", "Primary image", s("primary_image", "pending")),
      item("master_sku", "Master SKU", s("master_sku", "verify")),
    ],
    recommended: [item("description", "Description", s("description", "pending")), item("brand", "Brand", s("brand", "confirm")), item("attributes", "Attributes", s("attributes", "pending"))],
    blockers: [{ key: "primary_image", state: "pending", message: "Add a primary image before publishing this product to marketplaces.", fixTarget: "primary_image" }],
    hints: ["SKU and brand are entered; circles indicate pending verification or confirmation, not missing values."],
    channels: [
      { code: "amazon", name: "Amazon" },
      { code: "flipkart", name: "Flipkart" },
    ],
    chain: ["Product", "Variants", "Inventory", "Listings", "Channels"],
    ...over,
  };
}

function product(over: Partial<ProductEditor> = {}): ProductEditor {
  return {
    id: "p1",
    productCode: "DRAFT-AB12CD34",
    title: "Premium Travel Bag",
    description: null,
    descriptionHtml: null,
    brand: null,
    manufacturer: null,
    countryOfOrigin: null,
    categoryId: null,
    hsnCode: null,
    gstRateBps: null,
    tags: [],
    dimensions: null,
    dimensionsMm: null,
    weight: null,
    weightGrams: null,
    material: null,
    standardCategory: null,
    customAttributes: [],
    productType: "physical",
    status: "draft",
    productCodeLocked: false,
    variantCount: 0,
    version: 1,
    createdAt: "2026-10-20T10:00:00.000Z",
    updatedAt: "2026-10-20T10:00:00.000Z",
    category: null,
    brandRecord: null,
    primaryImage: { state: "none", documentId: null, url: null },
    ...over,
  };
}
function creation(version = 1, p: Partial<ProductEditor> = {}, codeIsPlaceholder = true, r: CreationReadiness = readiness()): CreationDto {
  return { product: product({ version, ...p }), creation: { currentStep: "basic", completedSteps: [], savedAt: new Date().toISOString(), version, codeIsPlaceholder }, readiness: r };
}
const suggestion = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  productId: "p1",
  mode: "concise",
  text: "Explore the Premium Travel Bag in our Travel Accessories collection.",
  html: "<p>Explore the Premium Travel Bag in our Travel Accessories collection.</p>",
  basis: ["name", "category"],
  needsFacts: true,
  unchanged: false,
  status: "suggested",
  applied: false,
  note: "Based on the product name and category only.",
  explanation: "Written from the product name and category.",
  provider: "rules",
  createdAt: "",
  expiresAt: "",
  decidedAt: null,
  ...over,
});
const doc = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  productId: "p1",
  fileName: "bag.png",
  mimeType: "image/png",
  sizeBytes: 2048,
  isPrimary: true,
  isPlaceholder: false,
  width: 800,
  height: 600,
  warnings: [],
  status: "uploaded",
  downloadUrl: null,
  createdAt: "",
  ...over,
});

const err = (status: number, code: string, message: string, details: Record<string, unknown> | null = null) => new ApiError({ code, message, status, details });

// ------------------------------------------------------------------------------------------------ rendering
let lastLocation = "";
function Probe() {
  const l = useLocation();
  lastLocation = `${l.pathname}${l.search}`;
  return null;
}
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });

function renderPage(path = "/products/new") {
  const router = createMemoryRouter(
    [
      {
        path: "/products/new",
        element: (
          <>
            <Probe />
            <CreateProductPage />
          </>
        ),
      },
      { path: "/products", element: <div>Products list page</div> },
      { path: "/products/:id/variants", element: <div>Variants page</div> },
    ],
    { initialEntries: [path] },
  );
  const view = render(
    <QueryClientProvider client={qc()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, ...view };
}

const setPermissions = (permissions: string[]) => useWorkspaceStore.setState({ permissions });

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(api).forEach((f) => f.mockReset());
  lastLocation = "";
  setPermissions(["products:read", "products:write"]);
  api.formOptions.mockResolvedValue(options);
  api.standardCategories.mockResolvedValue([]);
  api.categoryTree.mockResolvedValue([{ id: "cat1", parentId: null, name: "Travel Accessories", slug: "travel", path: "travel", children: [] }]);
  api.brands.mockResolvedValue([{ id: "b1", name: "Urban Carry", confirmed: true, confirmedAt: null, createdAt: "" }]);
  api.listDrafts.mockResolvedValue({ items: [], total: 0 });
  api.previewReadiness.mockResolvedValue(readiness());
  api.skuCheck.mockImplementation(async (code: string) => ({ code, normalized: code.toLowerCase(), valid: true, reason: null, message: null, available: true, conflict: null, similar: [], suggestion: null }));
  api.primaryImage.mockResolvedValue({ state: "none", document: null });
  api.documentBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
});
afterEach(() => {
  vi.useRealTimers();
});

const title = () => screen.getByLabelText("Product name") as HTMLInputElement;
const waitIdle = async () => {
  await waitFor(() => expect(api.formOptions).toHaveBeenCalled());
  await screen.findByText("38% complete");
};

/** open a saved draft (resume URL) */
async function openDraft(dto: CreationDto = creation(3, { id: "p1" }, true)) {
  api.getCreation.mockResolvedValue(dto);
  const view = renderPage(`/products/new?draft=${dto.product.id}`);
  await waitFor(() => expect(title().value).toBe(dto.product.title));
  return view;
}

// ================================================================================================ tests
describe("Create product: the real creation flow", () => {
  it("builds its dropdowns from the API and has no price, stock or cost inputs", async () => {
    renderPage();
    await waitIdle();
    const types = within(screen.getByLabelText("Product type")).getAllByRole("option").map((o) => o.textContent);
    expect(types).toEqual(["Physical product", "Digital product", "Service / Warranty"]);
    await waitFor(() => expect(within(screen.getByLabelText("Category")).getByRole("option", { name: "Travel Accessories" })).toBeInTheDocument());
    expect(screen.queryByLabelText(/price|mrp|stock|cost/i)).toBeNull();
    // the readiness numbers are the API's, not a canned 52 / 50
    expect(screen.getByText("Amazon · Flipkart")).toBeInTheDocument();
    expect(screen.getByText(/1 issue blocking publication/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Product readiness" })).toHaveAttribute("aria-valuenow", "38");
    // nothing is created until the seller types
    expect(api.createDraft).not.toHaveBeenCalled();
  });

  it("creates the draft after a first meaningful edit and autosaves later edits with the version lock", async () => {
    api.createDraft.mockResolvedValue(creation(1));
    api.patchDraft.mockResolvedValue(creation(2, { brand: "Urban Carry" }));
    const user = userEvent.setup();
    renderPage();
    await waitIdle();

    await user.type(title(), "Premium Travel Bag");
    await waitFor(() => expect(api.createDraft).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const body = api.createDraft.mock.calls[0][0];
    expect(body).toMatchObject({ title: "Premium Travel Bag", productType: "physical", productCode: null, categoryId: null, brand: null });
    expect(body).not.toHaveProperty("price");
    await waitFor(() => expect(lastLocation).toBe("/products/new?draft=p1"));
    expect(await screen.findByText("Last saved just now")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Brand"), "Urban Carry");
    await waitFor(() => expect(api.patchDraft).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(api.patchDraft).toHaveBeenLastCalledWith("p1", expect.objectContaining({ brand: "Urban Carry", title: "Premium Travel Bag" }), 1);

    await user.type(screen.getByLabelText("Master SKU"), "TRV-1042");
    api.patchDraft.mockResolvedValueOnce(creation(3, { productCode: "TRV-1042" }, false));
    await waitFor(() => expect(api.patchDraft).toHaveBeenCalledTimes(2), { timeout: 4000 });
    expect(api.patchDraft.mock.calls[1][2]).toBe(2); // the version of the previous answer
    expect(api.patchDraft.mock.calls[1][1]).toMatchObject({ productCode: "TRV-1042" });
  }, 20000);

  it("Save draft without a name asks for the name instead of calling the API", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitIdle();
    await user.click(screen.getAllByRole("button", { name: "Save draft" })[0]);
    expect(await screen.findByText("Enter a product name to save a draft.")).toBeInTheDocument();
    expect(api.createDraft).not.toHaveBeenCalled();
  });

  it("resumes an existing draft from ?draft=<id> without creating a new one", async () => {
    await openDraft(creation(3, { title: "Premium Travel Bag", brand: "Urban Carry", categoryId: "cat1", dimensions: { length: 50, width: 30, height: 25, unit: "cm" } }));
    expect(api.getCreation).toHaveBeenCalledWith("p1");
    expect((screen.getByLabelText("Brand") as HTMLSelectElement).value).toBe("Urban Carry");
    await userEvent.click(screen.getByRole("button", { name: /Add more product information/ }));
    expect((screen.getByLabelText("Length") as HTMLInputElement).value).toBe("50");
    expect(api.createDraft).not.toHaveBeenCalled();
    expect(await screen.findByText("Last saved just now")).toBeInTheDocument();
  });

  it("shows a missing draft as not found", async () => {
    api.getCreation.mockRejectedValue(err(404, "NOT_FOUND", "Product not found"));
    renderPage("/products/new?draft=gone");
    expect(await screen.findByText("Draft not found")).toBeInTheDocument();
  });

  it("offers unfinished drafts to resume while the form is empty", async () => {
    api.listDrafts.mockResolvedValue({ items: [{ id: "p9", title: "Old bag", code: "OLD-1", codeIsPlaceholder: false, thumbnailUrl: null, savedAt: new Date().toISOString(), readinessPercent: 63, currentStep: "basic", version: 4 }], total: 1 });
    api.getCreation.mockResolvedValue(creation(4, { id: "p9", title: "Old bag" }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Resume draft" }));
    await user.click(screen.getByRole("button", { name: "Resume draft Old bag" }));
    await waitFor(() => expect(title().value).toBe("Old bag"));
    expect(api.getCreation).toHaveBeenCalledWith("p9");
  });

  describe("Master SKU", () => {
    it("shows a duplicate with the suggestion and lets the seller take it", async () => {
      api.skuCheck.mockImplementation(async (code: string) => ({
        code,
        normalized: code.toLowerCase(),
        valid: true,
        reason: null,
        message: null,
        available: false,
        conflict: { type: "product", id: "p7", title: "Other bag", code: "TRV-1042" },
        similar: [],
        suggestion: "TRV-1042-2",
      }));
      const user = userEvent.setup();
      renderPage();
      await waitIdle();
      await user.type(screen.getByLabelText("Master SKU"), "TRV-1042");
      expect(await screen.findByText(/Already used by Other bag \(TRV-1042\)/, {}, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.getByText("Master SKU already exists. Use a unique SKU to continue.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Use TRV-1042-2" }));
      expect((screen.getByLabelText("Master SKU") as HTMLInputElement).value).toBe("TRV-1042-2");
      expect(api.skuCheck).toHaveBeenCalledWith("TRV-1042", null, expect.anything());
    });

    it("Verify saves the draft and records the verified code, then the readiness is refreshed", async () => {
      api.verifySku.mockResolvedValue({ verified: true });
      api.patchDraft.mockResolvedValue(creation(4, { productCode: "TRV-1042" }, false));
      await openDraft(creation(3, { productCode: "TRV-1042" }, false));
      const user = userEvent.setup();
      const verify = await screen.findByRole("button", { name: "Verify Master SKU" }, { timeout: 3000 });
      api.previewReadiness.mockResolvedValue(readiness({ percent: 50 }, { master_sku: "done" }));
      await user.click(verify);
      await waitFor(() => expect(api.verifySku).toHaveBeenCalledWith("p1", "TRV-1042"));
      expect(await screen.findByText("50% complete")).toBeInTheDocument();
    });

    it("an invalid code shows the server message", async () => {
      api.skuCheck.mockResolvedValue({ code: "bad code", normalized: "bad code", valid: false, reason: "pattern", message: "Use letters, digits and . _ - /", available: false, conflict: null, similar: [], suggestion: null });
      const user = userEvent.setup();
      renderPage();
      await waitIdle();
      await user.type(screen.getByLabelText("Master SKU"), "bad code");
      expect(await screen.findByText("Use letters, digits and . _ - /", {}, { timeout: 3000 })).toBeInTheDocument();
    });
  });

  describe("brand", () => {
    it("confirms an unconfirmed brand through the API", async () => {
      api.brands.mockResolvedValue([{ id: "b2", name: "Nova Living", confirmed: false, confirmedAt: null, createdAt: "" }]);
      api.confirmBrand.mockResolvedValue({ id: "b2", name: "Nova Living", confirmed: true, confirmedAt: "x", createdAt: "" });
      await openDraft(creation(3, { brand: "Nova Living", brandRecord: { id: "b2", name: "Nova Living", confirmed: false } }));
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "Confirm brand Nova Living" }));
      await waitFor(() => expect(api.confirmBrand).toHaveBeenCalledWith("b2"));
    });

    it("adds a new brand (confirmed) and selects it", async () => {
      api.createBrand.mockResolvedValue({ id: "b3", name: "AeroPak", confirmed: true, confirmedAt: "x", createdAt: "" });
      api.brands.mockResolvedValueOnce([]).mockResolvedValue([{ id: "b3", name: "AeroPak", confirmed: true, confirmedAt: "x", createdAt: "" }]);
      const user = userEvent.setup();
      renderPage();
      await waitIdle();
      await user.selectOptions(screen.getByLabelText("Brand"), "+ Add new brand...");
      await user.type(screen.getByLabelText("New brand name"), "AeroPak");
      await user.click(screen.getByRole("button", { name: "Add brand" }));
      await waitFor(() => expect(api.createBrand).toHaveBeenCalledWith("AeroPak"));
      await waitFor(() => expect((screen.getByLabelText("Brand") as HTMLSelectElement).value).toBe("AeroPak"));
    });
  });

  describe("Improve with AI", () => {
    it("previews a suggestion (not applied), then Apply writes it with the version lock", async () => {
      api.suggestDescription.mockResolvedValue(suggestion());
      api.applySuggestion.mockResolvedValue({ suggestion: suggestion({ applied: true }), text: "Explore the Premium Travel Bag in our Travel Accessories collection.", html: "<p>Explore the Premium Travel Bag in our Travel Accessories collection.</p>", product: { id: "p1", description: "x", descriptionHtml: "<p>x</p>", status: "draft", version: 7, updatedAt: "" } });
      await openDraft(creation(6, {}, true));
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Improve with AI" }));
      await waitFor(() => expect(api.suggestDescription).toHaveBeenCalledWith("p1", "concise", undefined));
      expect(await screen.findByText("Preview · Not applied")).toBeInTheDocument();
      expect(screen.getByText("Explore the Premium Travel Bag in our Travel Accessories collection.")).toBeInTheDocument();
      expect(screen.getByText("Written from the product name and category.")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Description" })).toHaveTextContent("");

      await user.click(screen.getByRole("button", { name: "Apply suggestion" }));
      await waitFor(() => expect(api.applySuggestion).toHaveBeenCalledWith("p1", "s1", 6));
      await waitFor(() => expect(screen.getByRole("textbox", { name: "Description" })).toHaveTextContent("Explore the Premium Travel Bag"));
      expect(screen.queryByText("Preview · Not applied")).toBeNull();
    });

    it("another choice asks the API for that mode, and Dismiss records the decision without touching the text", async () => {
      api.suggestDescription.mockResolvedValueOnce(suggestion()).mockResolvedValueOnce(suggestion({ id: "s2", mode: "benefits", text: "Material: Canvas" }));
      api.dismissSuggestion.mockResolvedValue(suggestion({ id: "s2", status: "dismissed" }));
      await openDraft();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Improve with AI" }));
      await screen.findByText("Preview · Not applied");
      await user.click(screen.getByLabelText("Highlight key benefits"));
      await waitFor(() => expect(api.suggestDescription).toHaveBeenLastCalledWith("p1", "benefits", undefined));
      expect(await screen.findByText("Material: Canvas")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Dismiss" }));
      await waitFor(() => expect(api.dismissSuggestion).toHaveBeenCalledWith("p1", "s2"));
      expect(screen.queryByText("Preview · Not applied")).toBeNull();
      expect(api.applySuggestion).not.toHaveBeenCalled();
    });

    it("shows the feature-disabled state and the rate limit", async () => {
      api.suggestDescription.mockRejectedValueOnce(err(403, "FORBIDDEN", "AI features are not enabled", { rule: "feature_disabled", flag: "ai.enabled" }));
      await openDraft();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Improve with AI" }));
      expect(await screen.findByText(/AI suggestions are turned off for this business/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Apply suggestion" })).toBeDisabled();
    });

    it("a rate limited request can be retried", async () => {
      api.suggestDescription.mockRejectedValueOnce(err(429, "RATE_LIMITED", "Too many requests")).mockResolvedValueOnce(suggestion());
      await openDraft();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Improve with AI" }));
      expect(await screen.findByText(/Too many AI requests/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("Explore the Premium Travel Bag in our Travel Accessories collection.")).toBeInTheDocument();
    });

    it("rewrite needs text first", async () => {
      await openDraft();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Improve with AI" }));
      await screen.findByText("Preview · Not applied");
      api.suggestDescription.mockClear();
      await user.click(screen.getByLabelText("Rewrite for clarity"));
      expect(await screen.findByText("Write a description first, then ask AI to rewrite it.")).toBeInTheDocument();
      expect(api.suggestDescription).not.toHaveBeenCalled();
    });

    it("needs a product name before the first suggestion (the draft is created first)", async () => {
      const user = userEvent.setup();
      renderPage();
      await waitIdle();
      await user.click(screen.getByRole("button", { name: "Improve with AI" }));
      expect(await screen.findByText(/Add a product name first/)).toBeInTheDocument();
      expect(api.suggestDescription).not.toHaveBeenCalled();
    });
  });

  describe("images", () => {
    const png = () => new File([new Uint8Array(2048)], "bag.png", { type: "image/png" });
    const pick = async (file: File) => {
      const input = screen.getByLabelText("Choose a product image") as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });
    };

    it("registers, uploads with real progress, then shows the primary image", async () => {
      let finish: (d: unknown) => void = () => undefined;
      let report: (p: { loaded: number; total: number }) => void = () => undefined;
      api.registerImage.mockResolvedValue({ document: doc({ status: "pending_upload" }), upload: { strategy: "api", method: "POST", url: "/api/v1/documents/d1/upload", headers: {} } });
      api.uploadImageBytes.mockImplementation((_r: unknown, _f: unknown, o: { onProgress: typeof report }) => {
        report = o.onProgress;
        return new Promise((res) => {
          finish = res;
        });
      });
      await openDraft();
      await pick(png());
      await waitFor(() => expect(api.registerImage).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "bag.png", type: "image/png", size: 2048 })));
      await screen.findByText("Local preview · Upload in progress");
      act(() => report({ loaded: 1024, total: 2048 }));
      expect(await screen.findByText("50%")).toBeInTheDocument();
      expect(screen.getByRole("progressbar", { name: "Upload progress" })).toHaveAttribute("aria-valuenow", "50");

      api.primaryImage.mockResolvedValue({ state: "ready", document: doc() });
      api.previewReadiness.mockResolvedValue(readiness({ percent: 50, blockers: [] }, { primary_image: "done" }));
      await act(async () => finish(doc()));
      expect(await screen.findByText("bag.png")).toBeInTheDocument();
      expect(await screen.findByText("No issues blocking publication")).toBeInTheDocument();
      expect(await screen.findByAltText("Primary image bag.png")).toBeInTheDocument();
    });

    it("Cancel upload aborts and cancels the pending document on the server", async () => {
      api.registerImage.mockResolvedValue({ document: doc({ id: "d5", status: "pending_upload" }), upload: { strategy: "api", method: "POST", url: "/x", headers: {} } });
      api.uploadImageBytes.mockImplementation((_r: unknown, _f: unknown, o: { signal: AbortSignal }) => new Promise((_res, rej) => o.signal.addEventListener("abort", () => rej(Object.assign(new Error("canceled"), { code: "ERR_CANCELED" })))));
      api.cancelUpload.mockResolvedValue(undefined);
      const user = userEvent.setup();
      await openDraft();
      await pick(png());
      await user.click(await screen.findByRole("button", { name: "Cancel upload" }));
      await waitFor(() => expect(api.cancelUpload).toHaveBeenCalledWith("d5"));
      expect(await screen.findByText("Add product image")).toBeInTheDocument();
    });

    it("rejects a wrong type or a too large file before any request", async () => {
      await openDraft();
      await pick(new File(["x"], "notes.pdf", { type: "application/pdf" }));
      expect(await screen.findByText(/not an accepted image type/)).toBeInTheDocument();
      expect(api.registerImage).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      const big = new File([new Uint8Array(11 * 1024 * 1024)], "huge.png", { type: "image/png" });
      await pick(big);
      expect(await screen.findByText(/Images can be up to 10 MB/)).toBeInTheDocument();
      expect(api.registerImage).not.toHaveBeenCalled();
    });

    it("shows the server rule that rejected the image", async () => {
      api.registerImage.mockResolvedValue({ document: doc({ status: "pending_upload" }), upload: { strategy: "api", method: "POST", url: "/x", headers: {} } });
      api.uploadImageBytes.mockRejectedValue(err(422, "VALIDATION_FAILED", "Image is too small", { rule: "image_too_small", code: "image_too_small" }));
      await openDraft();
      await pick(png());
      expect(await screen.findByText("The image is too small: the shorter side must be at least 200 px.")).toBeInTheDocument();
    });

    it("generates a placeholder and shows it as the primary image state", async () => {
      api.generatePlaceholder.mockResolvedValue(doc({ id: "d9", isPlaceholder: true, mimeType: "image/svg+xml", fileName: "placeholder.svg" }));
      await openDraft();
      api.primaryImage.mockResolvedValue({ state: "placeholder", document: doc({ id: "d9", isPlaceholder: true, mimeType: "image/svg+xml", fileName: "placeholder.svg" }) });
      api.previewReadiness.mockResolvedValue(readiness({ percent: 50 }, { primary_image: "placeholder" }));
      await userEvent.click(screen.getByRole("button", { name: "Generate placeholder" }));
      await waitFor(() => expect(api.generatePlaceholder).toHaveBeenCalledWith("p1"));
      expect(await screen.findByText("Placeholder image")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Upload real image" })).toBeInTheDocument();
    });

    it("a placeholder with a real primary image is refused with the server's reason", async () => {
      api.generatePlaceholder.mockRejectedValue(err(409, "CONFLICT", "has primary", { rule: "has_primary_image" }));
      await openDraft();
      await userEvent.click(screen.getByRole("button", { name: "Generate placeholder" }));
      expect(await screen.findByText(/already has a real primary image/)).toBeInTheDocument();
    });
  });

  describe("Continue", () => {
    it("maps the step errors onto the fields and does not continue", async () => {
      api.patchDraft.mockResolvedValue(creation(4));
      api.validateStep.mockResolvedValue({
        valid: false,
        errors: [
          { field: "productCode", code: "code_required", message: "Choose a Master SKU: Continue needs a real, unique code" },
          { field: "categoryId", code: "category_required", message: "Select a category" },
        ],
        warnings: [],
        readiness: readiness(),
      });
      await openDraft();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Continue/ }));
      expect(await screen.findByText("Select a category")).toBeInTheDocument();
      expect(screen.getByText("Choose a Master SKU: Continue needs a real, unique code")).toBeInTheDocument();
      expect(api.continueStep).not.toHaveBeenCalled();
      expect(api.validateStep).toHaveBeenCalledWith("p1", expect.objectContaining({ title: "Premium Travel Bag" }));
      await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Category")));
    });

    it("maps a 422 from continue (details.errors) and keeps the version of the saved values", async () => {
      api.patchDraft.mockResolvedValue(creation(4));
      api.validateStep.mockResolvedValue({ valid: true, errors: [], warnings: [], readiness: readiness() });
      api.continueStep.mockRejectedValue(err(422, "VALIDATION_FAILED", "Step has errors", { step: "basic", errors: [{ field: "productCode", code: "duplicate_product_code", message: "Master SKU already exists. Use a unique SKU to continue." }], warnings: [], creation: creation(5) }));
      await openDraft();
      await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
      expect(await screen.findByText("Master SKU already exists. Use a unique SKU to continue.", { selector: "span[role=alert]" })).toBeInTheDocument();
      expect(lastLocation).toContain("/products/new");
    });

    it("saves, validates, continues and opens the variants step", async () => {
      api.patchDraft.mockResolvedValue(creation(4));
      api.validateStep.mockResolvedValue({ valid: true, errors: [], warnings: [], readiness: readiness() });
      api.continueStep.mockResolvedValue({ ...creation(5), creation: { currentStep: "variants", completedSteps: ["basic"], savedAt: new Date().toISOString(), version: 5, codeIsPlaceholder: false } });
      await openDraft();
      await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
      expect(await screen.findByText("Variants page")).toBeInTheDocument();
      expect(api.continueStep).toHaveBeenCalledWith("p1", 4, expect.objectContaining({ title: "Premium Travel Bag" }));
      const order = [api.patchDraft, api.validateStep, api.continueStep].map((f) => f.mock.invocationCallOrder[0]);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("protects against a double click while the step is being checked", async () => {
      api.patchDraft.mockResolvedValue(creation(4));
      let release: (v: unknown) => void = () => undefined;
      api.validateStep.mockImplementation(() => new Promise((res) => (release = res)));
      await openDraft();
      const user = userEvent.setup();
      const btn = screen.getByRole("button", { name: /Continue/ });
      await user.click(btn);
      await waitFor(() => expect(api.validateStep).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("button", { name: /Checking/ })).toBeDisabled();
      await act(async () => release({ valid: false, errors: [], warnings: [], readiness: readiness() }));
    });

    it("blocks Continue when the form itself is incomplete (a half-filled dimension)", async () => {
      await openDraft();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Add more product information/ }));
      await user.type(screen.getByLabelText("Length"), "50");
      api.patchDraft.mockClear();
      await user.click(screen.getByRole("button", { name: /Continue/ }));
      expect(await screen.findByText(/Enter length, width and height/)).toBeInTheDocument();
      expect(api.validateStep).not.toHaveBeenCalled();
    });
  });

  describe("conflicts", () => {
    it("a stale version shows the banner; Keep my changes retries with the current version", async () => {
      api.patchDraft.mockRejectedValueOnce(err(409, "VERSION_CONFLICT", "stale", { currentVersion: 9 })).mockResolvedValue(creation(10, { brand: "Urban Carry" }));
      await openDraft();
      const user = userEvent.setup();
      await user.selectOptions(screen.getByLabelText("Brand"), "Urban Carry");
      expect(await screen.findByText("This draft was changed somewhere else", {}, { timeout: 4000 })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Keep my changes" }));
      await waitFor(() => expect(api.patchDraft).toHaveBeenCalledTimes(2));
      expect(api.patchDraft.mock.calls[1][2]).toBe(9);
      await waitFor(() => expect(screen.queryByText("This draft was changed somewhere else")).toBeNull());
    }, 15000);

    it("Reload saved version replaces the form with the server's draft", async () => {
      api.patchDraft.mockRejectedValue(err(409, "VERSION_CONFLICT", "stale", { currentVersion: 9 }));
      await openDraft();
      const user = userEvent.setup();
      await user.type(title(), " Pro");
      await screen.findByText("This draft was changed somewhere else", {}, { timeout: 4000 });
      api.getCreation.mockResolvedValue(creation(9, { title: "Travel Bag from another tab" }));
      await user.click(screen.getByRole("button", { name: "Reload saved version" }));
      await waitFor(() => expect(title().value).toBe("Travel Bag from another tab"));
    }, 15000);

    it("a duplicate Master SKU on autosave still saves the other fields", async () => {
      api.patchDraft
        .mockRejectedValueOnce(err(409, "CONFLICT", "duplicate", { rule: "duplicate_product_code", field: "productCode" }))
        .mockResolvedValueOnce(creation(4, { brand: "Urban Carry" }));
      await openDraft();
      const user = userEvent.setup();
      await user.type(screen.getByLabelText("Master SKU"), "TRV-1042");
      await waitFor(() => expect(api.patchDraft).toHaveBeenCalledTimes(2), { timeout: 4000 });
      expect(api.patchDraft.mock.calls[1][1]).not.toHaveProperty("productCode");
      expect(await screen.findByText("Master SKU already exists. Choose another code.")).toBeInTheDocument();
    }, 15000);
  });

  describe("leaving", () => {
    it("Cancel on an empty form just leaves", async () => {
      renderPage();
      await waitIdle();
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(await screen.findByText("Products list page")).toBeInTheDocument();
    });

    it("Discard draft removes the draft on the server and leaves", async () => {
      api.discardDraft.mockResolvedValue(undefined);
      await openDraft();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("Save changes before leaving?")).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Discard draft" }));
      await waitFor(() => expect(api.discardDraft).toHaveBeenCalledWith("p1"));
      expect(await screen.findByText("Products list page")).toBeInTheDocument();
    });

    it("a refused discard stays on the page and says why", async () => {
      api.discardDraft.mockRejectedValue(err(409, "CONFLICT", "This draft has stock and cannot be discarded", { rule: "has_stock" }));
      await openDraft();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Discard draft" }));
      expect(await within(dialog).findByText("This draft has stock and cannot be discarded")).toBeInTheDocument();
      expect(screen.queryByText("Products list page")).toBeNull();
    });

    it("Save draft in the dialog saves, then leaves; Stay keeps the form", async () => {
      api.createDraft.mockResolvedValue(creation(1));
      const user = userEvent.setup();
      renderPage();
      await waitIdle();
      await user.type(title(), "Pe");
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      let dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Stay" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(title().value).toBe("Pe");
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Save draft" }));
      await waitFor(() => expect(api.createDraft).toHaveBeenCalledTimes(1));
      expect(await screen.findByText("Products list page")).toBeInTheDocument();
    });
  });

  describe("permissions", () => {
    it("a viewer sees a read-only notice and cannot save or continue", async () => {
      setPermissions(["products:read"]);
      renderPage();
      await waitIdle();
      expect(screen.getByText(/read-only access to products/)).toBeInTheDocument();
      expect(title()).toBeDisabled();
      expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Save as draft" })).toBeDisabled();
      expect(api.createDraft).not.toHaveBeenCalled();
    });
  });

  describe("description editor", () => {
    it("counts plain text characters and flags more than 2,000", async () => {
      renderPage();
      await waitIdle();
      const editor = screen.getByRole("textbox", { name: "Description" });
      await act(async () => {
        editor.innerHTML = "<p><strong>Hello</strong> world</p>";
        fireEvent.input(editor);
      });
      expect(await screen.findByText("11 / 2,000 characters")).toBeInTheDocument();
      await act(async () => {
        editor.innerHTML = `<p>${"a".repeat(2005)}</p>`;
        fireEvent.input(editor);
      });
      expect(await screen.findByText(/2,005 \/ 2,000 characters \(5 over the limit\)/)).toBeInTheDocument();
      expect(screen.getByText(/not saved until it fits/)).toBeInTheDocument();
    });

    it("sends the rich text html to the draft", async () => {
      api.createDraft.mockResolvedValue(creation(1));
      const user = userEvent.setup();
      renderPage();
      await waitIdle();
      await user.type(title(), "Bag one");
      const editor = screen.getByRole("textbox", { name: "Description" });
      await act(async () => {
        editor.innerHTML = "<p>Water <strong>resistant</strong></p><ul><li>Laptop sleeve</li></ul>";
        fireEvent.input(editor);
      });
      await waitFor(() => expect(api.createDraft).toHaveBeenCalled(), { timeout: 4000 });
      expect(api.createDraft.mock.calls[0][0].descriptionHtml).toBe("<p>Water <strong>resistant</strong></p><ul><li>Laptop sleeve</li></ul>");
    }, 15000);

    it("link: only http(s) and mailto addresses are accepted", async () => {
      const user = userEvent.setup();
      renderPage();
      await waitIdle();
      await user.click(screen.getByRole("button", { name: "Link" }));
      const url = screen.getByLabelText("Link address");
      await user.clear(url);
      await user.type(url, "javascript:alert(1)");
      await user.click(screen.getByRole("button", { name: "Add link" }));
      expect(await screen.findByText(/Enter a web address/)).toBeInTheDocument();
    });
  });

  describe("more information", () => {
    it("sends dimensions, weight, GST, HSN and custom attributes with their units", async () => {
      api.patchDraft.mockResolvedValue(creation(4));
      api.validateStep.mockResolvedValue({ valid: false, errors: [], warnings: [], readiness: readiness() });
      await openDraft();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Add more product information/ }));
      await user.selectOptions(screen.getByLabelText("Material"), "Canvas");
      await user.selectOptions(screen.getByLabelText("Country of origin"), "IN");
      await user.type(screen.getByLabelText("Length"), "50");
      await user.type(screen.getByLabelText("Width"), "30");
      await user.type(screen.getByLabelText("Height"), "25");
      await user.selectOptions(screen.getByLabelText("Dimension unit"), "mm");
      await user.type(screen.getByLabelText("Weight"), "1.2");
      await user.selectOptions(screen.getByLabelText("Weight unit"), "kg");
      await user.selectOptions(screen.getByLabelText("GST / tax information"), "1800");
      await user.type(screen.getByLabelText("HSN code"), "4202");
      await user.type(screen.getByLabelText("Attribute name"), "Collection");
      await user.type(screen.getByLabelText("Attribute value"), "Travel 2026");
      await user.click(screen.getByRole("button", { name: /Continue/ }));
      await waitFor(() => expect(api.validateStep).toHaveBeenCalled());
      expect(api.validateStep.mock.calls[0][1]).toMatchObject({
        material: "Canvas",
        countryOfOrigin: "IN",
        dimensions: { length: 50, width: 30, height: 25, unit: "mm" },
        weight: { value: 1.2, unit: "kg" },
        gstRateBps: 1800,
        hsnCode: "4202",
        customAttributes: [{ name: "Collection", value: "Travel 2026", confirmed: false }],
      });
    }, 20000);
  });

  describe("readiness panel", () => {
    it("Fix issue focuses the field behind the blocker", async () => {
      api.previewReadiness.mockResolvedValue(
        readiness({ blockers: [{ key: "master_sku", state: "duplicate", message: "Resolve the duplicate SKU to continue.", fixTarget: "master_sku" }] }, { master_sku: "duplicate" }),
      );
      renderPage();
      await waitIdle();
      expect(await screen.findByText("Duplicate")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /Fix issue: Resolve the duplicate SKU/ }));
      await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Master SKU")));
    });

    it("sends the unsaved values to the stateless readiness preview", async () => {
      const user = userEvent.setup();
      renderPage();
      await waitIdle();
      await user.type(title(), "Bag");
      await waitFor(() => expect(api.previewReadiness).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Bag", productType: "physical" }), null, expect.anything()));
    });
  });
});
