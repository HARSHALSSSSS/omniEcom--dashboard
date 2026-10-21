import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  options: vi.fn(),
  saveBusiness: vi.fn(),
  saveDraft: vi.fn(),
  skip: vi.fn(),
  channels: vi.fn(),
  saveChannels: vi.fn(),
  connectChannel: vi.fn(),
  connectorForm: vi.fn(),
  authorizeAccount: vi.fn(),
  products: vi.fn(),
  refreshCounts: vi.fn(),
  importCatalog: vi.fn(),
  syncJob: vi.fn(),
  continueProducts: vi.fn(),
  inventory: vi.fn(),
  saveInventory: vi.fn(),
  inventoryOverview: vi.fn(),
  fulfillment: vi.fn(),
  saveFulfillment: vi.fn(),
  readiness: vi.fn(),
  complete: vi.fn(),
}));
const session = vi.hoisted(() => ({ refreshOnboarding: vi.fn(), signOut: vi.fn() }));

vi.mock("@/api/onboarding.api", async (orig) => ({ ...(await orig<typeof import("@/api/onboarding.api")>()), onboardingApi: api }));
vi.mock("@/lib/session", () => session);

import OnboardingPage from "./OnboardingPage";
import { ApiError } from "@/api/errors";
import type { FulfillmentSetup, OnboardingProgress, StepKey } from "@/api/onboarding.api";
import { useWorkspaceStore } from "@/store/workspace.store";

const KEYS: StepKey[] = ["business", "channels", "products", "inventory", "fulfillment", "ready"];

/** a server state where the steps before `resume` are completed */
function state(resume: StepKey, extra: Partial<OnboardingProgress> = {}): OnboardingProgress {
  const at = KEYS.indexOf(resume);
  return {
    status: "in_progress",
    currentStep: resume,
    resumeStep: resume,
    percentComplete: Math.min(at, 5) * 20,
    completedAt: null,
    steps: KEYS.map((key, i) => ({
      key,
      title: key,
      order: i + 1,
      skippable: key !== "business" && key !== "ready",
      status: i < at ? "completed" : i === at ? "in_progress" : "not_started",
      completedAt: null,
      skippedAt: null,
    })),
    drafts: {},
    selectedChannels: [],
    business: { businessName: "Nova Living", businessType: null, teamSize: null, operatingLocation: null, workspaceTier: "starter" },
    version: 1,
    ...extra,
  };
}

const options = {
  businessTypes: [
    { value: "d2c_brand", label: "D2C Brand", description: "Sell your own brand directly." },
    { value: "retail", label: "Retail Business", description: "Sell through physical stores." },
  ],
  teamSizes: [
    { value: "just_me", label: "Just me" },
    { value: "2_5", label: "2–5" },
    { value: "50_plus", label: "50+" },
  ],
  steps: [],
};

const channel = (over: Record<string, unknown>) => ({
  code: "flipkart",
  name: "Flipkart",
  kind: "marketplace",
  description: "Products, orders, inventory and listings",
  availability: "available",
  selected: false,
  connection: "not_connected",
  account: null,
  accountCount: 0,
  actions: ["connect"],
  ...over,
});

const fulfillment = (over: Partial<FulfillmentSetup> = {}): FulfillmentSetup => ({
  configured: false,
  defaultMethod: "marketplace",
  defaultPreference: "recommended",
  overrides: {},
  methods: [
    { value: "marketplace", label: "Marketplace Shipping", description: "Use the marketplace.", hint: "When supported", available: true, requiresConnection: true, unavailableReason: null },
    { value: "seller", label: "Seller Shipping", description: "Your logistics.", hint: "Your control", available: true, requiresConnection: false, unavailableReason: null },
    { value: "third_party", label: "Third-party Shipping", description: "A provider.", hint: "Connection required", available: false, requiresConnection: true, unavailableReason: "connection_required" },
  ],
  preferenceOptions: [
    { value: "recommended", label: "Recommended for most orders" },
    { value: "lowest_cost", label: "Lowest cost" },
  ],
  connections: {
    marketplaceShipping: { available: true, marketplaces: ["flipkart"] },
    thirdParty: { available: false, providers: [], connectWith: { method: "POST", url: "/api/v1/shipping/providers" } },
  },
  preview: [
    { kind: "marketplace", marketplace: "flipkart", label: "Marketplace / Flipkart", method: "marketplace", isOverride: false },
    { kind: "default", marketplace: null, label: "Other orders", method: "marketplace", isOverride: false },
  ],
  warnings: [],
  flow: ["Order received", "Pick", "Pack", "Shipping", "Dispatch"],
  ...over,
});

const catalogItem = (over: Record<string, unknown> = {}) => ({
  accountId: "acc-1",
  marketplace: "flipkart",
  name: "Flipkart",
  connection: "connected",
  productsAvailable: null,
  productsAvailableIsCapped: false,
  countedAt: null,
  importedProducts: 0,
  awaitingReview: 0,
  lastSyncedAt: null,
  importStatus: "not_imported",
  lastImportAt: null,
  canImport: true,
  ...over,
});

const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={queryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/onboarding/:step" element={<OnboardingPage />} />
          <Route path="/" element={<div>dashboard page</div>} />
          <Route path="/signin" element={<div>sign-in page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function signIn(permissions: string[] = ["onboarding:read", "onboarding:write"]) {
  useWorkspaceStore.getState().setSession({
    user: { id: "u1", fullName: "Asha", email: "asha@nova.test", businessName: "Nova Living", role: "owner" },
    permissions,
    shell: null,
    onboardingStatus: "in_progress",
    onboardingResumeStep: "business",
  });
  useWorkspaceStore.getState().setBootstrapStatus("ready");
}

beforeEach(() => {
  vi.resetAllMocks();
  useWorkspaceStore.getState().clearWorkspace();
  signIn();
  api.options.mockResolvedValue(options);
});

describe("navigation and resume", () => {
  it("opens on the step the server says to resume on", async () => {
    api.get.mockResolvedValue(state("inventory"));
    api.inventory.mockResolvedValue({ mode: null, startingMethod: null, location: null, warehouseCount: 0, options: {} });
    api.inventoryOverview.mockResolvedValue({ products: 0, units: 0, lowStock: 0, outOfStock: 0, lowStockThreshold: 5, syncedChannels: [] });
    renderAt("/onboarding/nonsense");
    expect(await screen.findByRole("heading", { name: /set up your inventory/i })).toBeInTheDocument();
  });

  it("redirects the old step names", async () => {
    api.get.mockResolvedValue(state("ready"));
    api.readiness.mockResolvedValue({ items: [], percentComplete: 0, canGoToDashboard: true, completed: false, whatHappensNext: [] });
    renderAt("/onboarding/complete");
    expect(await screen.findByText(/essential setup complete/i)).toBeInTheDocument();
  });

  it("shows an error with a retry when the setup cannot be loaded", async () => {
    api.get.mockRejectedValueOnce(new ApiError({ code: "NETWORK_ERROR", message: "x", status: 0 }));
    api.get.mockResolvedValue(state("business"));
    renderAt("/onboarding/business");
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot reach the server/i);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("heading", { name: /tell us about/i })).toBeInTheDocument();
  });

  it("marks finished steps in the progress bar and blocks steps that are not reachable yet", async () => {
    api.get.mockResolvedValue(state("channels"));
    api.channels.mockResolvedValue({ items: [], summary: { connected: 0, selectedToConnect: 0, interestedInComingSoon: 0 } });
    renderAt("/onboarding/channels");
    const nav = await screen.findByRole("navigation", { name: /setup progress/i });
    expect(within(nav).getByRole("button", { name: /01 Business ✓/ })).toBeEnabled();
    expect(within(nav).getByRole("button", { name: /04 Inventory/ })).toBeDisabled();
  });
});

describe("business step", () => {
  it("saves exactly what the API expects and moves on to the step the server returns", async () => {
    api.get.mockResolvedValue(state("business"));
    api.saveBusiness.mockResolvedValue({ business: state("channels").business, state: state("channels") });
    api.channels.mockResolvedValue({ items: [], summary: { connected: 0, selectedToConnect: 0, interestedInComingSoon: 0 } });
    const user = userEvent.setup();
    renderAt("/onboarding/business");

    const name = await screen.findByLabelText(/business \/ brand name/i);
    await user.clear(name);
    await user.type(name, "  Riya Crafts ");
    await user.click(screen.getByRole("radio", { name: /retail business/i }));
    await user.click(screen.getByRole("radio", { name: "2–5" }));
    await user.type(screen.getByLabelText(/where do you operate from/i), "Pune, Maharashtra");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(api.saveBusiness).toHaveBeenCalledWith({ businessName: "Riya Crafts", businessType: "retail", teamSize: "2_5", operatingLocation: "Pune, Maharashtra" }),
    );
    expect(await screen.findByRole("heading", { name: /where do you sell today/i })).toBeInTheDocument();
    expect(useWorkspaceStore.getState().onboardingResumeStep).toBe("channels");
  });

  it("starts from what the server saved, not from a default", async () => {
    api.get.mockResolvedValue(
      state("business", { business: { businessName: "Saved Co", businessType: "retail", teamSize: "50_plus", operatingLocation: "Goa", workspaceTier: "scale" } }),
    );
    renderAt("/onboarding/business");
    expect(await screen.findByLabelText(/business \/ brand name/i)).toHaveValue("Saved Co");
    expect(screen.getByRole("radio", { name: /retail business/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: "50+" })).toBeChecked();
    expect(screen.getByLabelText(/where do you operate from/i)).toHaveValue("Goa");
  });

  it("restores the draft from Save & exit over the saved profile", async () => {
    api.get.mockResolvedValue(state("business", { drafts: { business: { businessName: "Half typed", businessType: "retail", teamSize: "2_5", operatingLocation: "Del" } } }));
    renderAt("/onboarding/business");
    expect(await screen.findByLabelText(/business \/ brand name/i)).toHaveValue("Half typed");
    expect(screen.getByLabelText(/where do you operate from/i)).toHaveValue("Del");
  });

  it("explains what is missing and does not call the server", async () => {
    api.get.mockResolvedValue(state("business"));
    const user = userEvent.setup();
    renderAt("/onboarding/business");
    await screen.findByLabelText(/business \/ brand name/i);
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/tell us where you operate from/i)).toBeInTheDocument();
    expect(api.saveBusiness).not.toHaveBeenCalled();
  });

  it("shows the server's field errors next to the field", async () => {
    api.get.mockResolvedValue(state("business"));
    api.saveBusiness.mockRejectedValue(
      new ApiError({ code: "VALIDATION_ERROR", message: "Invalid", status: 400, details: { issues: [{ path: "operatingLocation", message: "Location is not recognised" }] } }),
    );
    const user = userEvent.setup();
    renderAt("/onboarding/business");
    await user.type(await screen.findByLabelText(/where do you operate from/i), "Nowhere");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText("Location is not recognised")).toBeInTheDocument();
  });

  it("is read-only for someone who may not write", async () => {
    useWorkspaceStore.getState().clearWorkspace();
    signIn(["onboarding:read"]);
    api.get.mockResolvedValue(state("business"));
    renderAt("/onboarding/business");
    expect(await screen.findByText(/only an administrator can set up the business/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/business \/ brand name/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /save & exit/i })).not.toBeInTheDocument();
  });
});

describe("save & exit", () => {
  it("stores the form as typed, then shows where things stand instead of the dashboard", async () => {
    api.get.mockResolvedValue(state("business"));
    api.saveDraft.mockResolvedValue(state("business", { drafts: { business: { businessName: "Typed" } } }));
    session.signOut.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderAt("/onboarding/business");
    const name = await screen.findByLabelText(/business \/ brand name/i);
    await user.clear(name);
    await user.type(name, "Typed");
    await user.click(screen.getByRole("button", { name: /save & exit/i }));

    await waitFor(() =>
      expect(api.saveDraft).toHaveBeenCalledWith("business", { businessName: "Typed", businessType: "d2c_brand", teamSize: "just_me", operatingLocation: "" }),
    );
    expect(await screen.findByRole("heading", { name: /your progress is saved/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^sign out$/i }));
    await waitFor(() => expect(session.signOut).toHaveBeenCalled());
    expect(await screen.findByText("sign-in page")).toBeInTheDocument();
  });

  it("shows why saving failed and stays on the form", async () => {
    api.get.mockResolvedValue(state("business"));
    api.saveDraft.mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "no", status: 403 }));
    const user = userEvent.setup();
    renderAt("/onboarding/business");
    await screen.findByLabelText(/business \/ brand name/i);
    await user.click(screen.getByRole("button", { name: /save & exit/i }));
    expect(await screen.findByText(/do not have permission/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /your progress is saved/i })).not.toBeInTheDocument();
  });
});

describe("channels step", () => {
  const list = {
    items: [
      channel({ code: "amazon_in", name: "Amazon", connection: "connected", selected: true, account: { id: "a1", displayName: "Amazon", status: "active", connectionStatus: "connected", lastSyncedAt: null, mode: "live" }, actions: ["manage"] }),
      channel({ code: "flipkart", name: "Flipkart" }),
      channel({ code: "social_commerce", name: "Social Commerce", kind: "social", availability: "coming_soon", actions: [] }),
    ],
    summary: { connected: 1, selectedToConnect: 0, interestedInComingSoon: 0 },
  };

  it("shows real connection states and saves the ticked channels (connected ones included)", async () => {
    api.get.mockResolvedValue(state("channels"));
    api.channels.mockResolvedValue(list);
    api.saveChannels.mockResolvedValue({ selected: [], state: state("products") });
    api.products.mockResolvedValue({ items: [], summary: { connected: 0, productsAvailable: 0, allCounted: true, masterProducts: 0, masterVariants: 0 }, ways: {} });
    const user = userEvent.setup();
    renderAt("/onboarding/channels");

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Amazon" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /connect social commerce/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /tell me when social commerce/i }));
    await user.click(screen.getByRole("button", { name: /^continue/i }));
    await waitFor(() => expect(api.saveChannels).toHaveBeenCalledWith(["amazon_in", "social_commerce"]));
    expect(await screen.findByRole("heading", { name: /bring your products into one place/i })).toBeInTheDocument();
  });

  it("skips the step on the server", async () => {
    api.get.mockResolvedValue(state("channels"));
    api.channels.mockResolvedValue(list);
    api.skip.mockResolvedValue(state("products"));
    api.products.mockResolvedValue({ items: [], summary: { connected: 0, productsAvailable: 0, allCounted: true, masterProducts: 0, masterVariants: 0 }, ways: {} });
    const user = userEvent.setup();
    renderAt("/onboarding/channels");
    await user.click(await screen.findByRole("button", { name: /skip for now/i }));
    await waitFor(() => expect(api.skip).toHaveBeenCalledWith("channels"));
    expect(await screen.findByRole("heading", { name: /bring your products into one place/i })).toBeInTheDocument();
  });

  it("connects a channel with the credential form the connector asks for", async () => {
    api.get.mockResolvedValue(state("channels"));
    api.channels.mockResolvedValue(list);
    api.connectorForm.mockResolvedValue({
      code: "flipkart",
      displayName: "Flipkart",
      implementation: "ga",
      authFlow: {
        type: "api_key",
        mode: "credentials",
        fields: [
          { key: "appId", label: "App ID", type: "text", required: true, secret: false, pattern: null, help: null },
          { key: "appSecret", label: "App secret", type: "password", required: true, secret: true, pattern: null, help: null },
        ],
        redirectFields: [],
        partnerGated: false,
        refreshable: false,
      },
    });
    api.connectChannel.mockResolvedValue({ accountId: "acc-9", created: true, status: "pending_authorization", next: { authorizationUrl: "", authorize: "" } });
    api.authorizeAccount.mockResolvedValue({ id: "acc-9", status: "active", connectionStatus: "connected" });
    const user = userEvent.setup();
    renderAt("/onboarding/channels");

    await user.click(await screen.findByRole("button", { name: "Connect Flipkart" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^connect$/i }));
    expect(await within(dialog).findByText(/app id is required/i)).toBeInTheDocument();
    expect(api.connectChannel).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/app id/i), "app-1");
    await user.type(within(dialog).getByLabelText(/app secret/i), "s3cret");
    await user.click(within(dialog).getByRole("button", { name: /^connect$/i }));

    await waitFor(() => expect(api.connectChannel).toHaveBeenCalledWith("flipkart", {}));
    expect(api.authorizeAccount).toHaveBeenCalledWith("acc-9", { appId: "app-1", appSecret: "s3cret" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows why a connection was refused and keeps the form open", async () => {
    api.get.mockResolvedValue(state("channels"));
    api.channels.mockResolvedValue(list);
    api.connectorForm.mockResolvedValue({
      code: "flipkart",
      displayName: "Flipkart",
      implementation: "ga",
      authFlow: { type: "api_key", mode: "credentials", fields: [{ key: "appId", label: "App ID", type: "text", required: true, secret: false, pattern: null, help: null }], redirectFields: [], partnerGated: false, refreshable: false },
    });
    api.connectChannel.mockResolvedValue({ accountId: "acc-9", created: true, status: "pending_authorization", next: { authorizationUrl: "", authorize: "" } });
    api.authorizeAccount.mockRejectedValue(new ApiError({ code: "UPSTREAM_ERROR", message: "Flipkart rejected these keys", status: 502 }));
    const user = userEvent.setup();
    renderAt("/onboarding/channels");
    await user.click(await screen.findByRole("button", { name: "Connect Flipkart" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(await within(dialog).findByLabelText(/app id/i), "bad");
    await user.click(within(dialog).getByRole("button", { name: /^connect$/i }));
    expect(await within(dialog).findByText("Flipkart rejected these keys")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("is honest about a marketplace that connects by redirect only", async () => {
    api.get.mockResolvedValue(state("channels"));
    api.channels.mockResolvedValue(list);
    api.connectorForm.mockResolvedValue({
      code: "flipkart",
      displayName: "Flipkart",
      implementation: "ga",
      authFlow: { type: "oauth", mode: "redirect", fields: [], redirectFields: [], partnerGated: false, refreshable: true },
    });
    const user = userEvent.setup();
    renderAt("/onboarding/channels");
    await user.click(await screen.findByRole("button", { name: "Connect Flipkart" }));
    expect(await screen.findByText(/connects by approving access on the marketplace itself/i)).toBeInTheDocument();
    expect(api.connectChannel).not.toHaveBeenCalled();
  });
});

describe("products step", () => {
  const overview = (items: unknown[], over: Record<string, unknown> = {}) => ({
    items,
    summary: { connected: items.length, productsAvailable: 0, allCounted: false, masterProducts: 3, masterVariants: 7, ...over },
    ways: {},
  });

  it("shows only real numbers: uncounted until the server counts them", async () => {
    api.get.mockResolvedValue(state("products"));
    api.products.mockResolvedValueOnce(overview([catalogItem()]));
    api.products.mockResolvedValue(overview([catalogItem({ productsAvailable: 128 })], { productsAvailable: 128, allCounted: true }));
    api.refreshCounts.mockResolvedValue({ counted: [{ accountId: "acc-1", count: 128, capped: false }], failed: [] });
    const user = userEvent.setup();
    renderAt("/onboarding/products");

    expect(await screen.findByText("Not counted")).toBeInTheDocument();
    expect(screen.getByText(/3 products · 7 variants/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /count products/i }));
    await waitFor(() => expect(api.refreshCounts).toHaveBeenCalledWith(undefined));
    expect(await screen.findByText("128")).toBeInTheDocument();
  });

  it("reports a marketplace that could not be counted", async () => {
    api.get.mockResolvedValue(state("products"));
    api.products.mockResolvedValue(overview([catalogItem()]));
    api.refreshCounts.mockResolvedValue({ counted: [], failed: [{ accountId: "acc-1", message: "Token expired" }] });
    const user = userEvent.setup();
    renderAt("/onboarding/products");
    await user.click(await screen.findByRole("button", { name: /count products/i }));
    expect(await screen.findByText(/Flipkart: Token expired/)).toBeInTheDocument();
  });

  it("starts an import and follows the job until it finishes", async () => {
    api.get.mockResolvedValue(state("products"));
    api.products.mockResolvedValueOnce(overview([catalogItem({ productsAvailable: 10 })]));
    api.products.mockResolvedValue(overview([catalogItem({ productsAvailable: 10, importStatus: "imported", importedProducts: 10, awaitingReview: 10 })], { productsAvailable: 10, allCounted: true }));
    api.importCatalog.mockResolvedValue({ job: { id: "job-1", type: "catalog_import", status: "queued", marketplaceAccountId: "acc-1", progress: { total: 0, done: 0, failed: 0 } }, alreadyQueued: false });
    api.syncJob.mockResolvedValueOnce({ id: "job-1", type: "catalog_import", status: "running", marketplaceAccountId: "acc-1", progress: { total: 10, done: 4, failed: 0 } });
    api.syncJob.mockResolvedValue({ id: "job-1", type: "catalog_import", status: "succeeded", marketplaceAccountId: "acc-1", progress: { total: 10, done: 10, failed: 0 } });
    const user = userEvent.setup();
    renderAt("/onboarding/products");

    await user.click(await screen.findByRole("button", { name: /import the flipkart catalog/i }));
    await waitFor(() => expect(api.importCatalog).toHaveBeenCalledWith("acc-1"));
    expect(await screen.findByText(/importing 4\/10/i)).toBeInTheDocument();
    await waitFor(() => expect(api.syncJob).toHaveBeenCalledWith("job-1"));
    expect(await screen.findByText("Imported ✓", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/10 imported · 10 to review/)).toBeInTheDocument();
  });

  it("shows a failed import with its reason and offers a retry", async () => {
    api.get.mockResolvedValue(state("products"));
    api.products.mockResolvedValue(overview([catalogItem({ productsAvailable: 10 })]));
    api.importCatalog.mockResolvedValue({ job: { id: "job-2", type: "catalog_import", status: "queued", marketplaceAccountId: "acc-1", progress: { total: 0, done: 0, failed: 0 } }, alreadyQueued: false });
    api.syncJob.mockResolvedValue({ id: "job-2", type: "catalog_import", status: "failed", marketplaceAccountId: "acc-1", progress: { total: 0, done: 0, failed: 0 }, error: { code: "UPSTREAM", message: "Marketplace refused the request" } });
    const user = userEvent.setup();
    renderAt("/onboarding/products");
    await user.click(await screen.findByRole("button", { name: /import the flipkart catalog/i }));
    expect(await screen.findByText(/import failed/i)).toBeInTheDocument();
    expect(screen.getByText("Marketplace refused the request")).toBeInTheDocument();
  });

  it("explains the empty case and sends the seller to the channels step", async () => {
    api.get.mockResolvedValue(state("products"));
    api.products.mockResolvedValue(overview([], { allCounted: true }));
    renderAt("/onboarding/products");
    expect(await screen.findByText(/no marketplace is connected yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^upload file$/i })).toBeDisabled();
  });

  it("continues, which marks the step on the server", async () => {
    api.get.mockResolvedValue(state("products"));
    api.products.mockResolvedValue(overview([], { allCounted: true }));
    api.continueProducts.mockResolvedValue(state("inventory"));
    api.inventory.mockResolvedValue({ mode: null, startingMethod: null, location: null, warehouseCount: 0, options: {} });
    api.inventoryOverview.mockResolvedValue({ products: 0, units: 0, lowStock: 0, outOfStock: 0, lowStockThreshold: 5, syncedChannels: [] });
    const user = userEvent.setup();
    renderAt("/onboarding/products");
    await user.click(await screen.findByRole("button", { name: /^continue$/i }));
    await waitFor(() => expect(api.continueProducts).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: /set up your inventory/i })).toBeInTheDocument();
  });
});

describe("inventory step", () => {
  const setup = (over: Record<string, unknown> = {}) => ({ mode: null, startingMethod: null, location: null, warehouseCount: 0, options: {}, ...over });
  const overview = { products: 12, units: 340, lowStock: 2, outOfStock: 1, lowStockThreshold: 5, syncedChannels: [{ marketplace: "flipkart", name: "Flipkart" }] };

  it("shows the real stock numbers", async () => {
    api.get.mockResolvedValue(state("inventory"));
    api.inventory.mockResolvedValue(setup());
    api.inventoryOverview.mockResolvedValue(overview);
    renderAt("/onboarding/inventory");
    const units = (await screen.findByText("Units")).nextElementSibling;
    await waitFor(() => expect(units).toHaveTextContent("340"));
    expect(screen.getByText("Low stock").nextElementSibling).toHaveTextContent("2");
    expect(screen.queryByText("2,846")).not.toBeInTheDocument();
  });

  it("saves simple inventory with the API's field names", async () => {
    api.get.mockResolvedValue(state("inventory"));
    api.inventory.mockResolvedValue(setup());
    api.inventoryOverview.mockResolvedValue(overview);
    api.saveInventory.mockResolvedValue({ warehouseId: "w1", created: true, setup: setup(), state: state("fulfillment") });
    api.fulfillment.mockResolvedValue(fulfillment());
    const user = userEvent.setup();
    renderAt("/onboarding/inventory");
    const field = await screen.findByLabelText(/inventory location name/i);
    expect(field).toHaveValue("Home Inventory");
    await user.clear(field);
    await user.type(field, "Back room");
    await user.click(screen.getByRole("radio", { name: /import stock from marketplace/i }));
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => expect(api.saveInventory).toHaveBeenCalledWith({ mode: "simple", startingMethod: "marketplace", locationName: "Back room" }));
    expect(await screen.findByRole("heading", { name: /how will you fulfill/i })).toBeInTheDocument();
  });

  it("saves warehouse inventory with the city / state as `location`", async () => {
    api.get.mockResolvedValue(state("inventory"));
    api.inventory.mockResolvedValue(setup());
    api.inventoryOverview.mockResolvedValue(overview);
    api.saveInventory.mockResolvedValue({ warehouseId: "w1", created: true, setup: setup(), state: state("fulfillment") });
    api.fulfillment.mockResolvedValue(fulfillment());
    const user = userEvent.setup();
    renderAt("/onboarding/inventory");
    await user.click(await screen.findByRole("radio", { name: /warehouse inventory/i }));
    await user.type(screen.getByLabelText(/warehouse name/i), "Main Warehouse");
    await user.type(screen.getByLabelText(/city \/ state/i), "Mumbai, Maharashtra");
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() =>
      expect(api.saveInventory).toHaveBeenCalledWith({ mode: "warehouse", startingMethod: "manual", warehouse: { name: "Main Warehouse", location: "Mumbai, Maharashtra" } }),
    );
  });

  it("restores a saved warehouse", async () => {
    api.get.mockResolvedValue(state("inventory"));
    api.inventory.mockResolvedValue(
      setup({ mode: "warehouse", startingMethod: "file", location: { id: "w1", code: "MAIN", name: "Pune WH", city: "Pune", state: "Maharashtra", address: "Plot 4" } }),
    );
    api.inventoryOverview.mockResolvedValue(overview);
    renderAt("/onboarding/inventory");
    expect(await screen.findByLabelText(/warehouse name/i)).toHaveValue("Pune WH");
    expect(screen.getByLabelText(/city \/ state/i)).toHaveValue("Pune, Maharashtra");
    expect(screen.getByLabelText(/warehouse address/i)).toHaveValue("Plot 4");
    expect(screen.getByRole("radio", { name: /import inventory file/i })).toBeChecked();
  });

  it("validates the name and shows a server conflict", async () => {
    api.get.mockResolvedValue(state("inventory"));
    api.inventory.mockResolvedValue(setup());
    api.inventoryOverview.mockResolvedValue(overview);
    api.saveInventory.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "Simple inventory uses a single location.", status: 409, details: { rule: "multiple_warehouses" } }));
    const user = userEvent.setup();
    renderAt("/onboarding/inventory");
    const field = await screen.findByLabelText(/inventory location name/i);
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(await screen.findByText(/name of 2 to 80 characters/i)).toBeInTheDocument();
    expect(api.saveInventory).not.toHaveBeenCalled();
    await user.type(field, "Shed");
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(await screen.findByText(/uses a single location/i)).toBeInTheDocument();
  });

  it("keeps the form usable when the overview cannot load", async () => {
    api.get.mockResolvedValue(state("inventory"));
    api.inventory.mockResolvedValue(setup());
    api.inventoryOverview.mockRejectedValue(new ApiError({ code: "NETWORK_ERROR", message: "x", status: 0 }));
    renderAt("/onboarding/inventory");
    expect(await screen.findByLabelText(/inventory location name/i)).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot reach the server/i);
  });
});

describe("fulfillment step", () => {
  it("saves the method, the API's preference value and marketplace overrides", async () => {
    api.get.mockResolvedValue(state("fulfillment"));
    api.fulfillment.mockResolvedValue(fulfillment());
    api.saveFulfillment.mockResolvedValue({ fulfillment: fulfillment({ configured: true }), state: state("ready") });
    api.readiness.mockResolvedValue({ items: [], percentComplete: 0, canGoToDashboard: true, completed: false, whatHappensNext: [] });
    const user = userEvent.setup();
    renderAt("/onboarding/fulfillment");

    await user.click(await screen.findByRole("radio", { name: /seller shipping/i }));
    await user.selectOptions(screen.getByLabelText(/your default preference/i), "lowest_cost");
    await user.click(screen.getByRole("button", { name: /edit shipping for marketplace \/ flipkart/i }));
    await user.selectOptions(screen.getByLabelText(/shipping for marketplace \/ flipkart/i), "marketplace");
    await user.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() =>
      expect(api.saveFulfillment).toHaveBeenCalledWith({ defaultMethod: "seller", defaultPreference: "lowest_cost", overrides: { flipkart: "marketplace" } }),
    );
    expect(await screen.findByText(/essential setup complete/i)).toBeInTheDocument();
  });

  it("offers only the preferences the API knows and marks unavailable methods", async () => {
    api.get.mockResolvedValue(state("fulfillment"));
    api.fulfillment.mockResolvedValue(fulfillment());
    renderAt("/onboarding/fulfillment");
    await screen.findByRole("radio", { name: /third-party shipping/i });
    expect(screen.queryByText(/manual selection per order/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/connect a shipping provider first/i).length).toBeGreaterThan(0);
  });

  it("shows the server's warnings after saving and moves on only when asked", async () => {
    api.get.mockResolvedValue(state("fulfillment"));
    api.fulfillment.mockResolvedValue(fulfillment());
    api.saveFulfillment.mockResolvedValue({
      fulfillment: fulfillment({ configured: true, warnings: [{ code: "third_party_unavailable", message: "Connect a shipping provider to use third-party shipping." }] }),
      state: state("ready"),
    });
    api.readiness.mockResolvedValue({ items: [], percentComplete: 0, canGoToDashboard: true, completed: false, whatHappensNext: [] });
    const user = userEvent.setup();
    renderAt("/onboarding/fulfillment");
    await user.click(await screen.findByRole("radio", { name: /third-party shipping/i }));
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(await screen.findByText(/connect a shipping provider to use third-party shipping\./i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /how will you fulfill/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue anyway/i }));
    expect(await screen.findByText(/essential setup complete/i)).toBeInTheDocument();
    expect(api.saveFulfillment).toHaveBeenCalledTimes(1);
  });
});

describe("ready step", () => {
  const readiness = (over: Record<string, unknown> = {}) => ({
    items: [
      { key: "business", group: "Business", title: "Business profile", status: "complete" },
      { key: "channels", group: "Sales Channels", title: "Sales channels", status: "skipped" },
      { key: "products", group: "Products", title: "Product catalog", status: "pending" },
    ],
    percentComplete: 33,
    canGoToDashboard: true,
    completed: false,
    whatHappensNext: [{ title: "Your channels sync", body: "From the server." }],
    ...over,
  });

  it("shows the real checklist and progress, not a hardcoded 100%", async () => {
    api.get.mockResolvedValue(state("ready"));
    api.readiness.mockResolvedValue(readiness());
    renderAt("/onboarding/ready");
    expect(await screen.findByText("33% essential setup complete")).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("Not set up yet")).toBeInTheDocument();
    expect(screen.getByText("From the server.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /workspace is ready to open/i })).toBeInTheDocument();
  });

  it("finishes on the server, refreshes the session and lands on the dashboard", async () => {
    api.get.mockResolvedValue(state("ready"));
    api.readiness.mockResolvedValue(readiness({ percentComplete: 100 }));
    api.complete.mockResolvedValue({ alreadyCompleted: false, completedAt: "2026-01-01T00:00:00.000Z" });
    session.refreshOnboarding.mockImplementation(async () => {
      const done = state("ready", { status: "completed" });
      useWorkspaceStore.getState().setOnboardingProgress({ status: "completed", resumeStep: "ready" });
      return done;
    });
    const user = userEvent.setup();
    renderAt("/onboarding/ready");
    await user.click((await screen.findAllByRole("button", { name: /go to dashboard/i }))[0] as HTMLElement);
    await waitFor(() => expect(api.complete).toHaveBeenCalledTimes(1));
    expect(session.refreshOnboarding).toHaveBeenCalled();
    expect(await screen.findByText("dashboard page")).toBeInTheDocument();
    expect(useWorkspaceStore.getState().onboardingComplete).toBe(true);
  });

  it("shows why finishing failed", async () => {
    api.get.mockResolvedValue(state("ready"));
    api.readiness.mockResolvedValue(readiness());
    api.complete.mockRejectedValue(new ApiError({ code: "CONFLICT", message: "Finish your business profile before opening the dashboard.", status: 409 }));
    const user = userEvent.setup();
    renderAt("/onboarding/ready");
    await user.click((await screen.findAllByRole("button", { name: /go to dashboard/i }))[0] as HTMLElement);
    expect(await screen.findByText(/finish your business profile before opening/i)).toBeInTheDocument();
    expect(screen.queryByText("dashboard page")).not.toBeInTheDocument();
  });

  it("will not offer the dashboard before the business step is done", async () => {
    api.get.mockResolvedValue(state("ready"));
    api.readiness.mockResolvedValue(readiness({ canGoToDashboard: false }));
    renderAt("/onboarding/ready");
    const buttons = await screen.findAllByRole("button", { name: /go to dashboard/i });
    for (const b of buttons) expect(b).toBeDisabled();
  });
});
