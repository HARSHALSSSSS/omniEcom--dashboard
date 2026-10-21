import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { ACCOUNT_ID, CATEGORY_ID, IMPORT_ID, OPTIONS, OTHER_ID, WAREHOUSE_ID, mapping, paged, session, summary, validated } from "@/test/importFixtures";
import { saveBlob } from "@/components/products/list/saveBlob";

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
  commit: vi.fn(),
  cancel: vi.fn(),
  errorsCsv: vi.fn(),
  warehouses: vi.fn(),
  accounts: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  grant("imports:read", "imports:write", "marketplace_accounts:read");
  api.options.mockResolvedValue(OPTIONS);
  api.history.mockResolvedValue(paged([]));
  api.get.mockResolvedValue(session());
  api.mapping.mockResolvedValue(mapping());
  api.rows.mockResolvedValue(paged([{ rowNumber: 2, status: "pending", sku: null, productCode: null, title: null, issueCount: 0, plan: null, skipReason: null, fixed: false, result: null, productId: null, variantId: null, values: {}, raw: { SKU_CODE: "TRV-1", PRODUCT_NAME: "Jacket", PRICE: "3499" } }]));
  api.summary.mockResolvedValue(summary());
  api.warehouses.mockResolvedValue([{ id: WAREHOUSE_ID, code: "DEL", name: "Delhi hub", isDefault: true }]);
  api.accounts.mockResolvedValue([{ id: ACCOUNT_ID, marketplace: "amazon_in", displayName: "Main store", status: "active" }]);
  api.cancel.mockResolvedValue(session({ status: "cancelled" }));
});

describe("ImportWizardPage: source and upload", () => {
  it("shows the sources the API accepts, its limits and the recognised layouts", async () => {
    renderPage();
    const group = await screen.findByRole("radiogroup", { name: "Catalogue source" });
    expect(within(group).getByRole("radio", { name: /CSV or Excel spreadsheet/ })).toBeChecked();
    for (const name of [/Shopify product export/, /Amazon inventory file/, /Flipkart listing export/, /ERP or accounting export/, /Excel workbook/, /TSV file/]) {
      expect(within(group).getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/up to 25 MB and 10,000 rows/)).toBeInTheDocument();
    expect(screen.getByText("Products CSV from Shopify.")).toBeInTheDocument();
  });

  it("downloads the real template", async () => {
    api.template.mockResolvedValue({ blob: new Blob(["a,b"]), fileName: "product-import-template.csv" });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /CSV template/ }));
    await waitFor(() => expect(api.template).toHaveBeenCalledWith("csv"));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "product-import-template.csv"));
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
    expect(within(done).getByRole("link", { name: "View products" })).toHaveAttribute("href", "/products");
  });

  it("creates the import, sends the raw file with progress and moves on to the mapping", async () => {
    api.create.mockResolvedValue(session({ status: "created", headers: [], counters: { ...session().counters, total: 0 } }));
    api.upload.mockImplementation(async (_id: string, _file: Blob, opts: { onProgress?: (n: number) => void }) => {
      opts.onProgress?.(40);
      return { session: session(), analysis: {} };
    });
    const { container } = renderPage();
    await screen.findByRole("radiogroup", { name: "Catalogue source" });
    await userEvent.click(screen.getByRole("radio", { name: /Shopify product export/ }));
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, csv());
    await userEvent.click(screen.getByRole("button", { name: /Upload and analyze/ }));

    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ source: "shopify", fileName: "festive.csv", fileSizeBytes: expect.any(Number) }));
    await waitFor(() => expect(api.upload).toHaveBeenCalledWith(IMPORT_ID, expect.any(File), expect.objectContaining({ onProgress: expect.any(Function) })));
    await waitFor(() => expect(loc()).toBe(`/products/import?import=${IMPORT_ID}&step=mapping`));
    expect(await screen.findByRole("heading", { name: "Match your columns" })).toBeInTheDocument();
  });

  it("refuses a file of the wrong type before anything is sent", async () => {
    const { container } = renderPage();
    await screen.findByRole("radiogroup", { name: "Catalogue source" });
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(["x"], "photo.png", { type: "image/png" })] } });
    expect(await screen.findByText("Upload a .csv, .tsv or .xlsx file.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload and analyze/ })).toBeDisabled();
    expect(api.create).not.toHaveBeenCalled();
  });

  it("explains a 415 from the upload and reuses the created import when the same file is retried", async () => {
    api.create.mockResolvedValue(session({ status: "created", headers: [] }));
    api.upload.mockRejectedValueOnce(new ApiError({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Unsupported media type", status: 415 }));
    api.upload.mockResolvedValueOnce({ session: session(), analysis: {} });
    const { container } = renderPage();
    await screen.findByRole("radiogroup", { name: "Catalogue source" });
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, csv());
    await userEvent.click(screen.getByRole("button", { name: /Upload and analyze/ }));
    expect(await screen.findByText(/file type is not supported/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Upload and analyze/ }));
    await waitFor(() => expect(loc()).toContain("step=mapping"));
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.upload).toHaveBeenCalledTimes(2);
  });

  it("explains a 413", async () => {
    api.create.mockResolvedValue(session({ status: "created", headers: [] }));
    api.upload.mockRejectedValue(new ApiError({ code: "PAYLOAD_TOO_LARGE", message: "Payload too large", status: 413 }));
    const { container } = renderPage();
    await screen.findByRole("radiogroup", { name: "Catalogue source" });
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, csv());
    await userEvent.click(screen.getByRole("button", { name: /Upload and analyze/ }));
    expect(await screen.findByText(/too large/)).toBeInTheDocument();
  });

  it("is read-only without the write permission", async () => {
    grant("imports:read");
    renderPage();
    expect(await screen.findByRole("radio", { name: /Shopify product export/ })).toBeDisabled();
    expect(screen.getByText(/imports write permission/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel import" })).not.toBeInTheDocument();
  });

  it("shows no access without the read permission", async () => {
    grant();
    renderPage();
    expect(await screen.findByText("You do not have access to product imports.")).toBeInTheDocument();
    expect(api.options).not.toHaveBeenCalled();
  });
});

describe("ImportWizardPage: resuming from the URL", () => {
  it("continues an analysed import on its mapping step after a reload", async () => {
    renderPage(`/products/import?import=${IMPORT_ID}`);
    expect(await screen.findByRole("heading", { name: "Match your columns" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(IMPORT_ID, expect.anything());
  });

  it("keeps the step inside what the import's status allows", async () => {
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    expect(await screen.findByRole("heading", { name: "Import settings" })).toBeInTheDocument();
  });

  it("opens a validated import on the validation result", async () => {
    api.get.mockResolvedValue(validated());
    renderPage(`/products/import?import=${IMPORT_ID}`);
    expect(await screen.findByRole("heading", { name: "Review your file" })).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole("button", { name: "Cancel import" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel import" }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith(IMPORT_ID));
    await waitFor(() => expect(loc()).toBe("/products"));
  });
});

describe("ImportWizardPage: column mapping", () => {
  it("blocks Next while required fields are missing and saves each change", async () => {
    api.updateMapping.mockResolvedValue(mapping());
    renderPage(`/products/import?import=${IMPORT_ID}&step=mapping`);
    expect(await screen.findByRole("heading", { name: "Match your columns" })).toBeInTheDocument();
    expect(screen.getByText(/Map the required columns first: Category, Selling price, Primary image URL/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue to settings/ })).toBeDisabled();
    expect(screen.getByText("2 of 3 columns mapped")).toBeInTheDocument();
    // the first rows of the real file
    expect(screen.getAllByText("Jacket", { selector: "td" })).toHaveLength(2);

    await userEvent.selectOptions(screen.getByLabelText("Import column PRICE as"), "sellingPrice");
    await waitFor(() => expect(api.updateMapping).toHaveBeenCalledWith(IMPORT_ID, { sourceColumn: "PRICE", targetField: "sellingPrice" }));

    await userEvent.selectOptions(screen.getByLabelText("Import column PRODUCT_NAME as"), "");
    await waitFor(() => expect(api.updateMapping).toHaveBeenLastCalledWith(IMPORT_ID, { sourceColumn: "PRODUCT_NAME", targetField: null }));
  });

  it("enables Next once nothing required is missing", async () => {
    api.mapping.mockResolvedValue(mapping({ missingRequired: [] }));
    renderPage(`/products/import?import=${IMPORT_ID}&step=mapping`);
    const next = await screen.findByRole("button", { name: /Continue to settings/ });
    await waitFor(() => expect(next).toBeEnabled());
    await userEvent.click(next);
    await waitFor(() => expect(loc()).toContain("step=settings"));
  });

  it("shows the API's message when a change is refused", async () => {
    api.updateMapping.mockRejectedValue(new ApiError({ code: "VALIDATION_FAILED", message: "Column mapped twice", status: 422, details: { errors: [{ field: "targetField", message: "Column PRICE is already mapped" }] } }));
    renderPage(`/products/import?import=${IMPORT_ID}&step=mapping`);
    await userEvent.selectOptions(await screen.findByLabelText("Import column PRICE as"), "mrp");
    expect(await screen.findByText("Column PRICE is already mapped")).toBeInTheDocument();
  });
});

describe("ImportWizardPage: settings and validation", () => {
  it("saves the settings in the API's vocabulary, then starts the validation", async () => {
    api.updateSettings.mockResolvedValue(session());
    api.validate.mockResolvedValue(session({ status: "validating", uiStatus: "processing", counters: { ...session().counters, percent: 10, processed: 12 } }));
    renderPage(`/products/import?import=${IMPORT_ID}&step=settings`);
    expect(await screen.findByRole("heading", { name: "Import settings" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Update existing/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Paise/ }));
    await userEvent.selectOptions(screen.getByLabelText("Warehouse for the stock column"), WAREHOUSE_ID);
    await userEvent.selectOptions(screen.getByLabelText("Category for rows without a recognised one"), CATEGORY_ID);
    await userEvent.click(screen.getByRole("checkbox", { name: /Create draft listings/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Only the accounts I pick/ }));
    expect(screen.getByRole("button", { name: /Save and validate/ })).toBeDisabled();
    await userEvent.click(await screen.findByRole("checkbox", { name: /Main store/ }));
    await userEvent.click(screen.getByRole("button", { name: /Save and validate/ }));

    await waitFor(() =>
      expect(api.updateSettings).toHaveBeenCalledWith(IMPORT_ID, {
        duplicateStrategy: "update",
        assignAllChannels: false,
        accountIds: [ACCOUNT_ID],
        autoPublish: true,
        warehouseId: WAREHOUSE_ID,
        defaultCategoryId: CATEGORY_ID,
        currencyUnit: "paise",
      }),
    );
    await waitFor(() => expect(api.validate).toHaveBeenCalledWith(IMPORT_ID));
    await waitFor(() => expect(loc()).toContain("step=validate"));
  });

  it("surfaces a refused settings change and does not validate", async () => {
    api.updateSettings.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "That warehouse is not active", status: 409, details: { rule: "warehouse_inactive" } }));
    renderPage(`/products/import?import=${IMPORT_ID}&step=settings`);
    await userEvent.click(await screen.findByRole("radio", { name: /Update existing/ }));
    await userEvent.click(screen.getByRole("button", { name: /Save and validate/ }));
    expect(await screen.findByText("That warehouse is not active")).toBeInTheDocument();
    expect(api.validate).not.toHaveBeenCalled();
    expect(loc()).toContain("step=settings");
  });

  it("follows a running validation with the server's counters until it settles", async () => {
    api.get.mockResolvedValueOnce(session({ status: "validating", uiStatus: "processing", counters: { ...session().counters, processed: 30, valid: 25, warning: 3, error: 2, percent: 25, etaSeconds: 40 } }));
    api.get.mockResolvedValue(validated({ issues: { total: 0, open: 0, resolved: 0, ignored: 0, openErrors: 0, openWarnings: 0 } }));
    renderPage(`/products/import?import=${IMPORT_ID}&step=validate`);

    expect(await screen.findByText("30 of 120 rows checked")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Validation progress" })).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("about 40 seconds left")).toBeInTheDocument();

    // a clean validation still reads "validated": the open issue count decides
    expect(await screen.findByText("Every row passed the checks. You can import now.", {}, { timeout: 4000 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Review and import/ }));
    await waitFor(() => expect(loc()).toContain("step=review"));
  });

  it("starts a validation that has not run yet, and shows a failure with a retry", async () => {
    api.validate.mockResolvedValue(session({ status: "validating", uiStatus: "processing" }));
    api.get.mockResolvedValue(session({ status: "failed", uiStatus: "failed", failureMessage: "The worker crashed" }));
    renderPage(`/products/import?import=${IMPORT_ID}&step=validate`);
    expect(await screen.findByText("The worker crashed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Validate again" }));
    await waitFor(() => expect(api.validate).toHaveBeenCalledWith(IMPORT_ID));
  });
});

describe("ImportWizardPage: review and import", () => {
  const stubCommit = () => api.commit.mockResolvedValue({ session: validated({ status: "committing", uiStatus: "processing", counters: { ...validated().counters, committed: 10, percent: 8 } }), eligibleRows: 108 });

  it("commits with the chosen mode, follows the job and ends on the real result", async () => {
    api.get.mockResolvedValueOnce(validated());
    stubCommit();
    api.get.mockResolvedValue(
      validated({ status: "committed", uiStatus: "completed", counters: { ...validated().counters, committed: 108, failed: 0, percent: 100 }, results: { productsCreated: 80, productsUpdated: 5, variantsCreated: 20, variantsUpdated: 3 } }),
    );
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    expect(await screen.findByRole("heading", { name: "Review your file" })).toBeInTheDocument();
    expect(await screen.findByText((_, el) => el?.tagName === "P" && /^Up to 108 rows can be imported/.test(el.textContent ?? ""))).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Include resolved rows/ })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: /Clean rows only/ }));
    await userEvent.click(screen.getByRole("button", { name: "Import rows" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Import now" }));

    await waitFor(() => expect(api.commit).toHaveBeenCalledWith(IMPORT_ID, "clean_only"));
    expect(await screen.findByRole("heading", { name: "Importing your products" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Import complete" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View products" })).toHaveAttribute("href", "/products");
  });

  it("asks for a revalidation when the API says rows changed", async () => {
    api.get.mockResolvedValue(validated());
    api.commit.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "Revalidate before committing.", status: 409, details: { rule: "revalidate_first" } }));
    api.revalidate.mockResolvedValue({ queued: false, status: "issues_remain", revalidatedCount: 120, resolvedCount: 3, remainingIssuesCount: 15, session: validated() });
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    await userEvent.click(await screen.findByRole("button", { name: "Import rows" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Import now" }));
    expect(await screen.findByText(/changed rows after the last validation/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import rows" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Revalidate now" }));
    await waitFor(() => expect(api.revalidate).toHaveBeenCalledWith(IMPORT_ID));
    await waitFor(() => expect(screen.queryByText(/changed rows after the last validation/)).not.toBeInTheDocument());
  });

  it("downloads the issues file", async () => {
    api.get.mockResolvedValue(validated());
    api.errorsCsv.mockResolvedValue({ blob: new Blob(["row"]), fileName: "import-11111111-issues.csv" });
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    await userEvent.click(await screen.findByRole("button", { name: "Download issues (CSV)" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "import-11111111-issues.csv"));
  });

  it("links each open kind of issue to the issues screen", async () => {
    api.get.mockResolvedValue(validated());
    renderPage(`/products/import?import=${IMPORT_ID}&step=review`);
    const list = await screen.findByRole("list", { name: "Open issues by kind" });
    const links = within(list).getAllByRole("link", { name: "Resolve" });
    expect(links[0]).toHaveAttribute("href", `/products/import/${IMPORT_ID}/issues?code=missing_sku`);
  });
});
