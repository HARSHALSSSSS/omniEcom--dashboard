import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { ACCOUNT_ID, CATEGORY_ID, IMPORT_ID, ISSUE_A, ISSUE_B, OPTIONS, OTHER_ID, WAREHOUSE_ID, issue, mapping, paged, session, summary, validated } from "@/test/importFixtures";
import { saveBlob } from "@/components/products/list/saveBlob";
import type { MarketplaceSource } from "@/types/import";

const api = vi.hoisted(() => ({
  options: vi.fn(),
  template: vi.fn(),
  create: vi.fn(),
  history: vi.fn(),
  get: vi.fn(),
  upload: vi.fn(),
  mapping: vi.fn(),
  updateMapping: vi.fn(),
  updateSettings: vi.fn(),
  validate: vi.fn(),
  revalidate: vi.fn(),
  summary: vi.fn(),
  issues: vi.fn(),
  rows: vi.fn(),
  resolve: vi.fn(),
  bulkResolve: vi.fn(),
  commitPreview: vi.fn(),
  commit: vi.fn(),
  cancel: vi.fn(),
  errorsCsv: vi.fn(),
  warehouses: vi.fn(),
  accounts: vi.fn(),
  marketplaceSources: vi.fn(),
  fromMarketplace: vi.fn(),
}));
vi.mock("@/api/import.api", () => ({ importApi: api }));
vi.mock("@/components/products/list/saveBlob", () => ({ saveBlob: vi.fn() }));
vi.mock("@/hooks/useProducts", () => ({
  useCategoryOptions: () => ({ data: [{ id: "55555555-5555-4555-8555-555555555555", label: "Women > Kurtas" }], isLoading: false, isError: false }),
}));

import ImportWizardPage from "./ImportWizardPage";

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(url = "/products/import") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <ImportWizardPage />
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const grant = (...permissions: string[]) => useWorkspaceStore.setState({ permissions });
const loc = () => screen.getByTestId("loc").textContent;
const csv = (name = "festive.csv") => new File(["SKU_CODE,PRODUCT_NAME,PRICE\nA,B,1\n"], name, { type: "text/csv" });
const fileInput = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;
const SOURCE: MarketplaceSource = { accountId: ACCOUNT_ID, marketplace: "amazon_in", displayName: "Main store", mode: "live", connection: "connected", productsAvailable: 427, importedProducts: 0, lastImportAt: null, canImport: true };
const DUPLICATE = issue({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  rowNumber: 21,
  code: "duplicate_sku",
  type: "duplicate_sku",
  title: "Duplicate SKU",
  description: "This SKU already exists.",
  severity: "error",
  field: "sku",
  sourceValue: "TRV-1042",
  suggestion: null,
  suggestedFix: null,
  productData: { sku: "TRV-1042", title: "Premium Travel Bag", existing: { id: "p1", productId: "p1", variantId: "v1", productCode: "TRV", sku: "TRV-1042", title: "Premium Travel Bag", price: 100, barcode: null }, source: {} },
  duplicateMatch: { existingSku: "TRV-1042", existingTitle: "Premium Travel Bag", confidence: "exact", reason: "Same SKU and title." },
});

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("imports:read", "imports:write", "marketplace_accounts:read");
  api.options.mockResolvedValue(OPTIONS);
  api.history.mockResolvedValue(paged([]));
  api.get.mockResolvedValue(session());
  api.mapping.mockResolvedValue(mapping());
  api.rows.mockResolvedValue(paged([]));
  api.summary.mockResolvedValue(summary());
  api.issues.mockImplementation(async (_id: string, q: { code?: string }) => paged(q.code === "category_unmapped" ? [ISSUE_A] : q.code === "missing_sku" ? [ISSUE_B] : q.code === "duplicate_sku" ? [DUPLICATE] : []));
  api.commitPreview.mockResolvedValue({ cleanOnly: 100, includeResolved: 108, pendingFixes: 0 });
  api.marketplaceSources.mockResolvedValue([]);
  api.warehouses.mockResolvedValue([{ id: WAREHOUSE_ID, code: "DEL", name: "Delhi hub", isDefault: true }]);
  api.accounts.mockResolvedValue([{ id: ACCOUNT_ID, marketplace: "amazon_in", displayName: "Main store", status: "active" }]);
  api.cancel.mockResolvedValue(session({ status: "cancelled" }));
});

describe("ImportWizardPage: source", () => {
  it("shows the three ways in, the stepper and a connect state when no marketplace is connected", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Where are your products coming from?" })).toBeInTheDocument();
    for (const name of ["Excel or CSV", "Connected marketplace", "Request bulk product template"]) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    for (const label of ["Source", "Upload", "Mapping", "Review", "Import"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(await screen.findByText("No marketplace connected")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connect a marketplace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect marketplace" })).toHaveAttribute("href", "/marketplace-hub");
  });

  it("moves to the upload step with Choose file", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Choose file" }));
    expect(await screen.findByRole("heading", { name: "Upload your catalog" })).toBeInTheDocument();
    expect(loc()).toBe("/products/import?step=upload");
  });

  it("downloads the real template", async () => {
    api.template.mockResolvedValue({ blob: new Blob(["a,b"]), fileName: "product-import-template.xlsx" });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Download template" }));
    await waitFor(() => expect(api.template).toHaveBeenCalledWith("xlsx"));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "product-import-template.xlsx"));
  });

  it("offers the connected marketplace with its real product count and starts the import from it", async () => {
    api.marketplaceSources.mockResolvedValue([SOURCE]);
    api.fromMarketplace.mockResolvedValue(session({ source: "marketplace", fileName: null }));
    renderPage();
    expect(await screen.findByText("Amazon · 427 products")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Import from Amazon" })).toBeInTheDocument();
    expect(screen.getByText(/We found 427 products in your connected Amazon catalog/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Import catalog" }));
    await waitFor(() => expect(api.fromMarketplace).toHaveBeenCalledWith(ACCOUNT_ID));
    await waitFor(() => expect(loc()).toBe(`/products/import?import=${IMPORT_ID}&step=mapping`));
    expect(await screen.findByRole("heading", { name: "Review field mapping" })).toBeInTheDocument();
  });

  it("uses the recommended card too, and says when an account needs attention", async () => {
    api.marketplaceSources.mockResolvedValue([{ ...SOURCE, connection: "attention", canImport: false }]);
    renderPage();
    expect(await screen.findByText("Amazon · needs attention")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open marketplace hub" })).toHaveAttribute("href", "/marketplace-hub");
  });

  it("lists recent imports with a way back into each", async () => {
    api.history.mockResolvedValue(
      paged([
        session({ id: IMPORT_ID, fileName: "festive.csv", status: "validated", issues: { total: 5, open: 4, resolved: 1, ignored: 0, openErrors: 2, openWarnings: 2 } }),
        session({ id: OTHER_ID, fileName: "done.csv", status: "committed", counters: { ...session().counters, committed: 50 } }),
      ]),
    );
    renderPage();
    const festive = (await screen.findByText("festive.csv")).closest("li") as HTMLElement;
    expect(within(festive).getByText("Validated")).toBeInTheDocument();
    expect(within(festive).getByRole("link", { name: "Resume" })).toHaveAttribute("href", `/products/import?import=${IMPORT_ID}`);
    expect(within(festive).getByRole("link", { name: "View issues" })).toHaveAttribute("href", `/products/import/${IMPORT_ID}/issues`);
    const done = screen.getByText("done.csv").closest("li") as HTMLElement;
    expect(within(done).queryByRole("link", { name: "Resume" })).not.toBeInTheDocument();
  });

  it("shows no access without the read permission", async () => {
    grant();
    renderPage();
    expect(await screen.findByText("You do not have access to product imports.")).toBeInTheDocument();
    expect(api.options).not.toHaveBeenCalled();
  });
});

describe("ImportWizardPage: upload", () => {
  it("creates the import, sends the raw file with progress and moves on to the mapping", async () => {
    api.create.mockResolvedValue(session({ status: "created", headers: [], counters: { ...session().counters, total: 0 } }));
    api.upload.mockImplementation(async (_id: string, _file: Blob, opts: { onProgress?: (n: number) => void }) => {
      opts.onProgress?.(40);
      return { session: session(), analysis: {} };
    });
    const { container } = renderPage("/products/import?step=upload");
    await screen.findByRole("heading", { name: "Upload your catalog" });
    await userEvent.selectOptions(screen.getByLabelText("File layout"), "shopify");
    await userEvent.upload(fileInput(container), csv());
    expect(screen.getByRole("heading", { name: "festive.csv" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ source: "shopify", fileName: "festive.csv", fileSizeBytes: expect.any(Number) }));
    await waitFor(() => expect(api.upload).toHaveBeenCalledWith(IMPORT_ID, expect.any(File), expect.objectContaining({ onProgress: expect.any(Function) })));
    await waitFor(() => expect(loc()).toContain(`import=${IMPORT_ID}`));
    expect(loc()).toContain("step=mapping");
    expect(await screen.findByRole("heading", { name: "Review field mapping" })).toBeInTheDocument();
  });

  it("refuses a file of the wrong type before anything is sent", async () => {
    const { container } = renderPage("/products/import?step=upload");
    await screen.findByRole("heading", { name: "Upload your catalog" });
    fireEvent.change(fileInput(container), { target: { files: [new File(["x"], "photo.png", { type: "image/png" })] } });
    expect(await screen.findByText("We couldn't read this file")).toBeInTheDocument();
    expect(screen.getByText("Upload a .csv, .tsv or .xlsx file.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue →" })).toBeDisabled();
    expect(api.create).not.toHaveBeenCalled();
  });

  it("explains a 415 and reuses the created import when the same file is retried", async () => {
    api.create.mockResolvedValue(session({ status: "created", headers: [] }));
    api.upload.mockRejectedValueOnce(new ApiError({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Unsupported media type", status: 415 }));
    api.upload.mockResolvedValueOnce({ session: session(), analysis: {} });
    const { container } = renderPage("/products/import?step=upload");
    await screen.findByRole("heading", { name: "Upload your catalog" });
    await userEvent.upload(fileInput(container), csv());
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(await screen.findByText(/file type is not supported/)).toBeInTheDocument();

    fireEvent.change(fileInput(container), { target: { files: [csv()] } });
    await userEvent.click(await screen.findByRole("button", { name: "Continue →" }));
    await waitFor(() => expect(loc()).toContain("step=mapping"));
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.upload).toHaveBeenCalledTimes(2);
  });

  it("explains a 413", async () => {
    api.create.mockResolvedValue(session({ status: "created", headers: [] }));
    api.upload.mockRejectedValue(new ApiError({ code: "PAYLOAD_TOO_LARGE", message: "Payload too large", status: 413 }));
    const { container } = renderPage("/products/import?step=upload");
    await screen.findByRole("heading", { name: "Upload your catalog" });
    await userEvent.upload(fileInput(container), csv());
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(await screen.findByText(/too large/)).toBeInTheDocument();
  });

  it("downloads the Excel and CSV templates", async () => {
    api.template.mockResolvedValue({ blob: new Blob(["a"]), fileName: "t.csv" });
    renderPage("/products/import?step=upload");
    await userEvent.click(await screen.findByRole("button", { name: "Download CSV template" }));
    await waitFor(() => expect(api.template).toHaveBeenCalledWith("csv"));
  });

  it("is read-only without the write permission", async () => {
    grant("imports:read");
    renderPage("/products/import?step=upload");
    expect(await screen.findByRole("button", { name: "Browse files" })).toBeDisabled();
    expect(screen.getByText(/imports write permission/)).toBeInTheDocument();
  });

  it("keeps the upload step for an uploaded import and continues to the mapping", async () => {
    renderPage(`/products/import?import=${IMPORT_ID}&step=upload`);
    expect(await screen.findByRole("heading", { name: "festive.csv" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    await waitFor(() => expect(loc()).toContain("step=mapping"));
  });
});

describe("ImportWizardPage: import settings", () => {
  it("saves the switches and the settings of the API when going back to the upload", async () => {
    api.updateSettings.mockResolvedValue(session());
    renderPage(`/products/import?import=${IMPORT_ID}&step=upload`);
    await userEvent.click(await screen.findByRole("button", { name: /Import settings/ }));
    expect(await screen.findByRole("heading", { name: "Import settings" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Create new products only" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Update matching products" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Import image URLs" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Import inventory quantities" }));
    await userEvent.click(screen.getByRole("radio", { name: /Paise/ }));
    await userEvent.selectOptions(screen.getByLabelText("Warehouse for the stock column"), WAREHOUSE_ID);
    await userEvent.selectOptions(screen.getByLabelText("Category for rows without a recognised one"), CATEGORY_ID);
    await userEvent.click(screen.getByRole("button", { name: "Back to upload" }));

    await waitFor(() =>
      expect(api.updateSettings).toHaveBeenCalledWith(IMPORT_ID, {
        duplicateStrategy: "update",
        includeImages: false,
        includeQuantities: false,
        currencyUnit: "paise",
        warehouseId: WAREHOUSE_ID,
        defaultCategoryId: CATEGORY_ID,
      }),
    );
    expect(await screen.findByRole("heading", { name: "Upload your catalog" })).toBeInTheDocument();
  });

  it("maps Create new products only to the skip strategy and needs an account for draft listings", async () => {
    api.updateSettings.mockResolvedValue(session());
    renderPage(`/products/import?import=${IMPORT_ID}&step=upload`);
    await userEvent.click(await screen.findByRole("button", { name: /Import settings/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Update matching products" }));
    await userEvent.click(screen.getByRole("radio", { name: "Create new products only" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Create draft listings/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Only the accounts I pick/ }));
    expect(screen.getByRole("button", { name: "Continue →" })).toBeDisabled();
    await userEvent.click(await screen.findByRole("checkbox", { name: /Main store/ }));
    await userEvent.click(screen.getByRole("button", { name: "Back to upload" }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith(IMPORT_ID, { autoPublish: true, accountIds: [ACCOUNT_ID] }));
  });

  it("saves Ask me as the ask strategy and shows the saved choice after a reload", async () => {
    api.updateSettings.mockResolvedValue(session());
    api.get.mockResolvedValue(session({ settings: { ...session().settings, duplicateStrategy: "ask" } }));
    renderPage(`/products/import?import=${IMPORT_ID}&step=upload`);
    await userEvent.click(await screen.findByRole("button", { name: /Import settings/ }));
    expect(screen.getByRole("radio", { name: "Ask me when a match is found" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Create new products only" }));
    await userEvent.click(screen.getByRole("button", { name: "Back to upload" }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith(IMPORT_ID, { duplicateStrategy: "skip" }));
  });

  it("surfaces a refused settings change", async () => {
    api.updateSettings.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "That warehouse is not active", status: 409, details: { rule: "warehouse_inactive" } }));
    renderPage(`/products/import?import=${IMPORT_ID}&step=upload`);
    await userEvent.click(await screen.findByRole("button", { name: /Import settings/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Update matching products" }));
    await userEvent.click(screen.getByRole("button", { name: "Back to upload" }));
    expect(await screen.findByText("That warehouse is not active")).toBeInTheDocument();
  });
});

describe("ImportWizardPage: resuming from the URL", () => {
  it("continues an analysed import on its mapping step after a reload", async () => {
    renderPage(`/products/import?import=${IMPORT_ID}`);
    expect(await screen.findByRole("heading", { name: "Review field mapping" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(IMPORT_ID, expect.anything());
  });

  it("keeps the step inside what the import's status allows", async () => {
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    expect(await screen.findByRole("heading", { name: "Review field mapping" })).toBeInTheDocument();
  });

  it("opens a validated import on its exceptions", async () => {
    api.get.mockResolvedValue(validated());
    renderPage(`/products/import?import=${IMPORT_ID}`);
    expect(await screen.findByRole("heading", { name: "Only exceptions need you" })).toBeInTheDocument();
  });

  it("says so when the import does not exist", async () => {
    api.get.mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "Import not found", status: 404 }));
    renderPage(`/products/import?import=${IMPORT_ID}`);
    expect(await screen.findByText("This import was not found.")).toBeInTheDocument();
  });

  it("offers a restart for a cancelled import", async () => {
    api.get.mockResolvedValue(session({ status: "cancelled" }));
    renderPage(`/products/import?import=${IMPORT_ID}`);
    await userEvent.click(await screen.findByRole("button", { name: "Start a new import" }));
    await waitFor(() => expect(loc()).toBe("/products/import"));
  });

  it("cancels the import after a confirmation", async () => {
    renderPage(`/products/import?import=${IMPORT_ID}&step=mapping`);
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel import" }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith(IMPORT_ID));
    await waitFor(() => expect(loc()).toBe("/products"));
  });

  it("saves the draft and returns to the recent imports", async () => {
    renderPage(`/products/import?import=${IMPORT_ID}&step=mapping`);
    await userEvent.click(await screen.findByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(loc()).toBe("/products/import"));
    expect(useToastStore.getState().toasts[0]?.title).toBe("Draft saved");
  });

  it("waits while the rows of a marketplace import are pulled", async () => {
    api.get.mockResolvedValueOnce(session({ source: "marketplace", status: "created", headers: [], fileName: null }));
    api.get.mockResolvedValue(session({ source: "marketplace", fileName: null }));
    renderPage(`/products/import?import=${IMPORT_ID}`);
    expect(await screen.findByText("Pulling products from your marketplace…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Review field mapping" }, { timeout: 4000 })).toBeInTheDocument();
  });
});

describe("ImportWizardPage: mapping", () => {
  it("shows the real matching, blocks Continue while required fields are missing and changes a column in the dialog", async () => {
    api.updateMapping.mockResolvedValue(mapping());
    renderPage(`/products/import?import=${IMPORT_ID}&step=mapping`);
    expect(await screen.findByRole("heading", { name: "Automatic matching" })).toBeInTheDocument();
    expect(screen.getByText("File detected · 120 rows")).toBeInTheDocument();
    expect(screen.getByText(/Map the required columns first: Category, Selling price, Primary image URL/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue →" })).toBeDisabled();
    expect(screen.getByText("Analysis runs when you continue")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Change mapping of PRICE" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("3499")).toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText("Destination product field"), "sellingPrice");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save mapping" }));
    await waitFor(() => expect(api.updateMapping).toHaveBeenCalledWith(IMPORT_ID, { sourceColumn: "PRICE", targetField: "sellingPrice" }));

    await userEvent.click(screen.getByRole("button", { name: "Change mapping of PRODUCT_NAME" }));
    await userEvent.selectOptions(await screen.findByLabelText("Destination product field"), "");
    await userEvent.click(screen.getByRole("button", { name: "Save mapping" }));
    await waitFor(() => expect(api.updateMapping).toHaveBeenLastCalledWith(IMPORT_ID, { sourceColumn: "PRODUCT_NAME", targetField: null }));
  });

  it("shows the API's message when a change is refused", async () => {
    api.updateMapping.mockRejectedValue(new ApiError({ code: "VALIDATION_FAILED", message: "Column mapped twice", status: 422, details: { errors: [{ field: "targetField", message: "Column PRICE is already mapped" }] } }));
    renderPage(`/products/import?import=${IMPORT_ID}&step=mapping`);
    await userEvent.click(await screen.findByRole("button", { name: "Change mapping of PRICE" }));
    await userEvent.selectOptions(await screen.findByLabelText("Destination product field"), "mrp");
    await userEvent.click(screen.getByRole("button", { name: "Save mapping" }));
    expect(await screen.findByText("Column PRICE is already mapped")).toBeInTheDocument();
  });

  it("resets the columns the seller changed to the automatic matches", async () => {
    api.updateMapping.mockResolvedValue(mapping());
    api.mapping.mockResolvedValue(
      mapping({
        missingRequired: [],
        columns: [{ sourceColumn: "PRICE", targetField: "sellingPrice", confidence: 0, sampleValues: ["1"], isRequired: false, status: "manual", autoTargetField: "mrp" }],
      }),
    );
    renderPage(`/products/import?import=${IMPORT_ID}&step=mapping`);
    await userEvent.click(await screen.findByRole("button", { name: "Reset to auto matches" }));
    await waitFor(() => expect(api.updateMapping).toHaveBeenCalledWith(IMPORT_ID, { sourceColumn: "PRICE", targetField: "mrp" }));
  });

  it("starts the analysis when the seller continues", async () => {
    api.mapping.mockResolvedValue(mapping({ missingRequired: [] }));
    api.validate.mockResolvedValue(session({ status: "validating", uiStatus: "processing" }));
    renderPage(`/products/import?import=${IMPORT_ID}&step=mapping`);
    const next = await screen.findByRole("button", { name: "Continue →" });
    await waitFor(() => expect(next).toBeEnabled());
    await userEvent.click(next);
    await waitFor(() => expect(api.validate).toHaveBeenCalledWith(IMPORT_ID));
    await waitFor(() => expect(loc()).toContain("step=review"));
  });

  it("shows the real numbers of a validated import in the side panel", async () => {
    api.get.mockResolvedValue(validated({ products: 90, plan: { create: 70, update: 15, addVariant: 3, skip: 2 }, scope: { products: 90, newProducts: 70, updates: 15 } }));
    api.mapping.mockResolvedValue(mapping({ missingRequired: [] }));
    renderPage(`/products/import?import=${IMPORT_ID}&step=mapping`);
    expect(await screen.findByText("File detected · 90 products · 120 rows")).toBeInTheDocument();
    expect((await screen.findAllByText("18 require attention", {}, { timeout: 4000 })).length).toBeGreaterThan(0);
    expect(await screen.findByText("12 missing SKUs")).toBeInTheDocument();
    expect(screen.getByText("6 category mappings")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Import 100 ready products/ }));
    await waitFor(() => expect(loc()).toContain("step=import"));
    expect(screen.getByRole("radio", { name: /Clean rows only/ })).toBeChecked();
  });
});

describe("ImportWizardPage: analysis and exceptions", () => {
  it("follows a running validation with the server's counters until it settles", async () => {
    api.get.mockResolvedValueOnce(session({ status: "validating", uiStatus: "processing", counters: { ...session().counters, processed: 30, valid: 25, warning: 3, error: 2, percent: 25, etaSeconds: 40 } }));
    api.get.mockResolvedValue(validated());
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    expect(await screen.findByText("30 of 120 rows checked", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Validation progress" })).toHaveAttribute("aria-valuenow", "25");
    expect(await screen.findByRole("heading", { name: "Only exceptions need you" }, { timeout: 4000 })).toBeInTheDocument();
  });

  it("shows a failed validation with a retry", async () => {
    api.validate.mockResolvedValue(session({ status: "validating", uiStatus: "processing" }));
    api.get.mockResolvedValue(session({ status: "failed", uiStatus: "failed", failureMessage: "The worker crashed" }));
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    expect(await screen.findByText("The worker crashed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Validate again" }));
    await waitFor(() => expect(api.validate).toHaveBeenCalledWith(IMPORT_ID));
  });

  it("groups the issues into the design's kinds and accepts a suggestion on a card", async () => {
    api.get.mockResolvedValue(validated());
    api.resolve.mockResolvedValue({ issue: ISSUE_A, issues: validated().issues, counters: validated().counters });
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    expect(await screen.findByRole("button", { name: "Categories · 6" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Missing SKUs · 12" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicates · 0" })).toBeInTheDocument();
    expect(await screen.findByText("Cotton Kurti")).toBeInTheDocument();
    expect(screen.getByText("Row 7")).toBeInTheDocument();
    expect(screen.getByText(/"Kurtis" → Women > Kurtas/)).toBeInTheDocument();
    expect(screen.getByText("AI recommends and explains. You decide which mapping is applied.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(api.resolve).toHaveBeenCalledWith(IMPORT_ID, { issueId: ISSUE_A.id, action: "accept_suggestion" }));

    await userEvent.click(screen.getByRole("button", { name: "Missing SKUs · 12" }));
    expect(await screen.findByText("Silk Saree")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
  });

  it("shows the table view", async () => {
    api.get.mockResolvedValue(validated());
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    await userEvent.click(await screen.findByRole("button", { name: "Table" }));
    for (const h of ["Row", "Product", "Issue", "Field", "Suggested Fix", "Actions"]) expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
    expect(await screen.findByText("Women > Kurtas")).toBeInTheDocument();
  });

  it("offers the duplicate decision: update the existing product or create a new one", async () => {
    api.get.mockResolvedValue(validated());
    api.summary.mockResolvedValue(summary({ byCode: [{ code: "duplicate_sku", title: "Duplicate SKU", total: 1, open: 1, resolved: 0, ignored: 0, errors: 1, warnings: 0 }] }));
    api.resolve.mockResolvedValue({ issue: DUPLICATE, issues: validated().issues, counters: validated().counters });
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    expect(await screen.findByText("Potential duplicates · Premium Travel Bag")).toBeInTheDocument();
    expect(screen.getByText("CSV SKU: TRV-1042 · Existing master product: TRV-1042")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Update existing product" }));
    await waitFor(() => expect(api.resolve).toHaveBeenCalledWith(IMPORT_ID, { issueId: DUPLICATE.id, action: "use_existing" }));
    await userEvent.click(screen.getByRole("button", { name: "Create new product" }));
    await waitFor(() => expect(api.resolve).toHaveBeenLastCalledWith(IMPORT_ID, { issueId: DUPLICATE.id, action: "create_new" }));
  });

  it("downloads the issues file and revalidates from the recovery bar", async () => {
    api.get.mockResolvedValue(validated());
    api.errorsCsv.mockResolvedValue({ blob: new Blob(["row"]), fileName: "import-11111111-issues.csv" });
    api.revalidate.mockResolvedValue({ queued: false, status: "issues_remain", revalidatedCount: 120, resolvedCount: 3, remainingIssuesCount: 15, session: validated() });
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    await userEvent.click(await screen.findByRole("button", { name: "Download corrected file" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "import-11111111-issues.csv"));
    await userEvent.click(screen.getByRole("button", { name: "Revalidate" }));
    await waitFor(() => expect(api.revalidate).toHaveBeenCalledWith(IMPORT_ID));
    expect(screen.getByText("Fix → Revalidate → Continue")).toBeInTheDocument();
  });

  it("accepts every suggestion of a kind in one go", async () => {
    api.get.mockResolvedValue(validated());
    api.issues.mockImplementation(async () => paged([ISSUE_A, issue({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9", rowNumber: 8 })]));
    api.bulkResolve.mockResolvedValue({ matched: 6, applied: 6, skippedCount: 0, skipped: [], issues: validated().issues, counters: validated().counters });
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    await userEvent.click(await screen.findByRole("button", { name: /Accept all 6 suggestions/ }));
    await waitFor(() => expect(api.bulkResolve).toHaveBeenCalledWith(IMPORT_ID, { code: "category_unmapped", action: "accept_suggestion" }));
  });

  it("continues to the confirmation", async () => {
    api.get.mockResolvedValue(validated());
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    await userEvent.click(await screen.findByRole("button", { name: "Continue →" }));
    await waitFor(() => expect(loc()).toContain("step=import"));
    expect(await screen.findByRole("heading", { name: "Ready to import" })).toBeInTheDocument();
  });
});

describe("ImportWizardPage: import", () => {
  it("commits with the chosen mode and continues on the processing page", async () => {
    api.get.mockResolvedValue(validated());
    api.commit.mockResolvedValue({ session: validated({ status: "committing", uiStatus: "processing" }), eligibleRows: 100 });
    renderPage(`/products/import?import=${IMPORT_ID}&step=import`);
    expect(await screen.findByRole("heading", { name: "Ready to import" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Include resolved rows/ })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: /Clean rows only/ }));
    expect(await screen.findByText(/12 blocking issues · 100 rows ready to import/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Import products" }));
    await waitFor(() => expect(api.commit).toHaveBeenCalledWith(IMPORT_ID, "clean_only"));
    await waitFor(() => expect(loc()).toBe(`/products/import/${IMPORT_ID}/processing`));
  });

  it("asks for a revalidation when the API says rows changed", async () => {
    api.get.mockResolvedValue(validated());
    api.commit.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "Revalidate before committing.", status: 409, details: { rule: "revalidate_first" } }));
    api.revalidate.mockResolvedValue({ queued: false, status: "issues_remain", revalidatedCount: 120, resolvedCount: 3, remainingIssuesCount: 15, session: validated() });
    renderPage(`/products/import?import=${IMPORT_ID}&step=import`);
    await userEvent.click(await screen.findByRole("button", { name: "Import products" }));
    expect(await screen.findByText(/changed rows after the last validation/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import products" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Revalidate now" }));
    await waitFor(() => expect(api.revalidate).toHaveBeenCalledWith(IMPORT_ID));
  });

  it("sends the seller to the settings when the commit needs a warehouse", async () => {
    api.get.mockResolvedValue(validated());
    api.commit.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "Choose a warehouse first.", status: 409, details: { rule: "no_warehouse" } }));
    renderPage(`/products/import?import=${IMPORT_ID}&step=import`);
    await userEvent.click(await screen.findByRole("button", { name: "Import products" }));
    await userEvent.click(await screen.findByRole("button", { name: "Open settings" }));
    expect(await screen.findByRole("heading", { name: "Import settings" })).toBeInTheDocument();
    expect(loc()).toContain("step=upload");
  });

  it("shows the result of a finished import", async () => {
    api.get.mockResolvedValue(validated({ status: "committed", uiStatus: "completed", counters: { ...validated().counters, committed: 108 }, results: { productsCreated: 80, productsUpdated: 5, variantsCreated: 20, variantsUpdated: 3 } }));
    renderPage(`/products/import?import=${IMPORT_ID}`);
    expect(await screen.findByRole("heading", { name: "Import complete" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open import progress" })).toHaveAttribute("href", `/products/import/${IMPORT_ID}/processing`);
  });

  it("is read-only without the write permission", async () => {
    grant("imports:read");
    api.get.mockResolvedValue(validated());
    renderPage(`/products/import?import=${IMPORT_ID}&step=import`);
    expect(await screen.findByRole("button", { name: "Import products" })).toBeDisabled();
    expect(screen.getByText(/imports write permission/, { selector: "p" })).toBeInTheDocument();
  });
});
