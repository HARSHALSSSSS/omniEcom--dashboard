import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { ADMIN, settings, signIn } from "@/test/settingsFixtures";
import { skuPreview } from "./InventoryListingsTab";
import { configToTier, tierToConfig } from "./PricingMarginsTab";
import { legacyPatch } from "./legacyMigration";

const api = vi.hoisted(() => ({
  get: vi.fn(), save: vi.fn(), channelPolicy: vi.fn(), saveChannelPolicy: vi.fn(), simulate: vi.fn(),
  listMembers: vi.fn(), listInvitations: vi.fn(), roles: vi.fn(), sessions: vi.fn(), gstStates: vi.fn(), getAi: vi.fn(), setAiEnabled: vi.fn(),
}));
vi.mock("@/api/settings.api", () => ({ settingsApi: api }));
const pricing = vi.hoisted(() => ({ searchVariants: vi.fn() }));
vi.mock("@/api/pricing.api", () => ({ pricingApi: pricing }));
const hub = vi.hoisted(() => ({ accounts: vi.fn() }));
vi.mock("@/api/hub.api", () => ({ hubApi: hub }));
const session = vi.hoisted(() => ({ refreshShell: vi.fn() }));
vi.mock("@/lib/session", () => session);

import SettingsPage from "@/pages/settings/SettingsPage";

const AMZ = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const policy = (over = {}) => ({ marketplaceAccountId: AMZ, mode: "sync", safetyBuffer: 3, allocationPercent: 60, maxQuantity: null, warehouseIds: [], isDefault: false, version: 1, updatedAt: null, ...over });

function renderTab(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: "/settings/:module", element: <SettingsPage /> }], { initialEntries: [path] });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const saveBtn = () => screen.getByRole("button", { name: "Save changes" });
const firstBody = () => api.save.mock.calls[0]![0] as { version: number; preferences: Record<string, unknown>; inventory: Record<string, unknown>; catalog: Record<string, unknown>; operations: Record<string, unknown>; pricing: { channelTiers: Record<string, unknown> } & Record<string, unknown> };

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  pricing.searchVariants.mockReset();
  localStorage.clear();
  session.refreshShell.mockResolvedValue(undefined);
  hub.accounts.mockResolvedValue({ items: [], summary: { total: 0, healthy: 0, warning: 0, error: 0, paused: 0 } });
  api.get.mockResolvedValue(settings());
  api.save.mockImplementation(async (body: { version: number }) => settings({ version: body.version + 1 }));
  api.channelPolicy.mockImplementation(async (id: string) => policy({ marketplaceAccountId: id }));
  api.saveChannelPolicy.mockResolvedValue(policy());
  api.listMembers.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  api.listInvitations.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  api.roles.mockResolvedValue([]);
  api.sessions.mockResolvedValue([]);
  api.gstStates.mockResolvedValue([]);
  signIn([...ADMIN, "listings:read", "marketplace_accounts:write", "pricing:read"]);
});

describe("pure helpers", () => {
  it("the SKU example comes from the saved formula, separator and case", () => {
    expect(skuPreview("[BRAND]-[CAT3]-[SEQ6]", "-", "uppercase", "Nova Living")).toBe("NOVA-CAT-000001");
    expect(skuPreview("[BRAND]-[SEQ6]", "_", "lowercase", "Nova Living")).toBe("nova_000001");
  });

  it("a tier survives the dialog's units (percent, rupees) and unset values stay unset", () => {
    const ch = { id: AMZ, name: "Nova Amazon", marketplace: "amazon", status: "active" };
    expect(configToTier(tierToConfig(ch, undefined))).toMatchObject({ baseMarkupBps: 0, hardFloorMinor: null, minNetMarginBps: null, maxDiscountBps: 2000 });
    const tier = { baseMarkupBps: 850, fixedFeeBufferMinor: 4500, hardFloorMinor: 114_900, maxDiscountBps: 2500, repriceIntervalMinutes: 15, minNetMarginBps: 2200, autoDelistOnBreach: true, dealFloorMinor: null, mandate2faForMarkdown: false, status: "active" as const };
    expect(configToTier(tierToConfig(ch, tier))).toEqual(tier);
  });

  it("old browser values move over only for groups the server still holds defaults for", () => {
    const raw = {
      omni_general_prefs: { defaultRoute: "/orders", pageSize: 50, reportingPeriod: "7d", telemetryFrequency: "15s", catalogScope: "single_hub", guardrailBulk: false },
      omni_pricing_margins_settings: { grossMarginFloorPercent: 18.5, psychologicalEnding: "9", withholdTcsTdsBuffer: true, tiers: [{ id: "tier-shopify" }] },
    };
    const patch = legacyPatch(raw, settings());
    expect(patch?.preferences).toEqual({ defaultRoute: "/orders", pageSize: 50, reportingPeriod: "7d", telemetrySeconds: 15, catalogView: "primary_warehouse", guardrails: { bulkConfirm: false } });
    expect(patch?.pricing).toEqual({ marginFloorBps: 1850, priceEnding: "nine", withholdBufferBps: 110 });
    // the server already has the business's own choice: it wins
    const chosen = settings({ pricing: { ...settings().pricing, marginFloorBps: 3000 } });
    expect(legacyPatch(raw, chosen)?.pricing).toBeUndefined();
    expect(legacyPatch({}, settings())).toBeNull();
  });
});

describe("General tab", () => {
  it("shows the saved preferences and saves a changed one for real, with the version", async () => {
    const user = userEvent.setup();
    renderTab("/settings/general");
    expect(await screen.findByLabelText("Default Table Page Size")).toHaveValue("25");
    expect(screen.queryByText(/HQ-IND-01|FYTD 2024-25|PROTECTION ACTIVE/)).not.toBeInTheDocument();
    expect(saveBtn()).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Default Table Page Size"), "50");
    await user.selectOptions(screen.getByLabelText("Default Reporting Period"), "qtd");
    await user.click(saveBtn());
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const body = firstBody();
    expect(Object.keys(body).sort()).toEqual(["preferences", "version"]);
    expect(body.preferences).toMatchObject({ pageSize: 50, reportingPeriod: "qtd", defaultRoute: "/" });
    expect(body.version).toBe(7);
  });

  it("a viewer sees the values but cannot change them", async () => {
    signIn(["vendors:read"]);
    renderTab("/settings/general");
    expect(await screen.findByLabelText("Default Table Page Size")).toBeDisabled();
    expect(screen.getByText(/read-only access/)).toBeInTheDocument();
  });
});

describe("Products & Listings tab", () => {
  it("lists the real connected channels with their stock rule, and saves a channel rule through the channel policy", async () => {
    const user = userEvent.setup();
    renderTab("/settings/listings");
    expect(await screen.findByText("Nova Amazon")).toBeInTheDocument();
    expect(screen.getByText("Nova Flipkart")).toBeInTheDocument();
    expect(screen.queryByText(/Shopify D2C|Quick Commerce|Bhiwandi|AURA-CLO/)).not.toBeInTheDocument();
    expect(screen.getByText("Mumbai Hub")).toBeInTheDocument();
    const buffer = await screen.findByLabelText("Channel buffer for Nova Amazon");
    await waitFor(() => expect(buffer).toHaveValue(3));
    const row = buffer.closest("tr") as HTMLElement;
    expect(within(row).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.clear(buffer);
    await user.type(buffer, "12");
    await user.click(within(row).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.saveChannelPolicy).toHaveBeenCalledWith(AMZ, { allocationPercent: 60, safetyBuffer: 12 }));
  });

  it("the cushions and the gates save with the settings (inventory and catalog groups only)", async () => {
    const user = userEvent.setup();
    renderTab("/settings/listings");
    const min = await screen.findByLabelText("Minimum Safety Stock (Units)");
    await user.clear(min);
    await user.type(min, "15");
    await user.click(screen.getByRole("switch", { name: "Require a valid EAN" }));
    await user.click(saveBtn());
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const body = firstBody();
    expect(body.inventory).toMatchObject({ minSafetyStockUnits: 15 });
    expect(body.catalog).toMatchObject({ strictEan: true });
    expect(body.catalog.requireHsn).toBeUndefined();
  });

  it("without warehouses or channels it says so instead of showing examples", async () => {
    api.get.mockResolvedValue(settings({ warehouses: [], channels: [] }));
    renderTab("/settings/listings");
    expect(await screen.findByText("No warehouse yet.")).toBeInTheDocument();
    expect(screen.getByText("No marketplace account is connected yet.")).toBeInTheDocument();
  });
});

describe("Pricing & Margins tab", () => {
  it("has no demo tiers: real channels show Not set until a tier is saved, and a tier saves per account in basis points", async () => {
    const user = userEvent.setup();
    renderTab("/settings/pricing");
    expect((await screen.findAllByText("Nova Amazon")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Shopify|AMZN_IN|FLPKRT|AURA-402/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Not set").length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: /Configure Tier/ })[0]!);
    const dialog = await screen.findByRole("dialog");
    const markup = dialog.querySelector("input[step='0.5']") as HTMLInputElement;
    await user.clear(markup);
    await user.type(markup, "8.5");
    await user.click(within(dialog).getByRole("button", { name: "Save Pricing Tier" }));
    await user.click(saveBtn());
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const body = firstBody();
    expect(body.pricing.channelTiers[AMZ]).toMatchObject({ baseMarkupBps: 850, hardFloorMinor: null });
    expect(Object.keys(body.pricing.channelTiers)).toEqual([AMZ]);
  });

  it("the margin floor and the price ending save in basis points and keep the round-to-9 switch in step", async () => {
    const user = userEvent.setup();
    renderTab("/settings/pricing");
    await user.click(await screen.findByLabelText("Minimum gross margin floor"));
    await user.selectOptions(screen.getByLabelText("Psychological Price Rounding Rule"), "nine");
    await user.click(saveBtn());
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const body = firstBody();
    expect(body.pricing).toMatchObject({ marginFloorBps: 2000, priceEnding: "nine" });
    expect(body.operations).toEqual({ roundPriceToNine: true });
  });

  it("the simulator uses a real product and the server's maths, and says what is missing", async () => {
    const user = userEvent.setup();
    pricing.searchVariants.mockResolvedValue([{ id: "v1", sku: "TRV-1042", productTitle: "Travel Bag" }]);
    api.simulate.mockResolvedValue({
      variant: { id: "v1", sku: "TRV-1042", title: "Travel Bag", costMinor: 30_000, mrpMinor: 80_000, sellingPriceMinor: 70_000, gstRateBps: 1800 },
      account: { id: AMZ, name: "Nova Amazon", marketplace: "amazon", feesConfigured: true, feeBps: 1000, fixedFeeMinor: 1000 },
      rules: { workspaceFloorBps: null, effectiveTargetBps: null, withholdBufferBps: 0, legalMetrologyMrpGate: true },
      priceMinor: 70_000,
      breakdown: { gstMinor: 10_678, feeMinor: 8_000, withholdMinor: 0, costMinor: 30_000, netRealizationMinor: 51_322, contributionMinor: 32_000 },
      marginBps: 4571, belowTarget: null, floorPriceMinor: null, exceedsMrp: false,
    });
    renderTab("/settings/pricing");
    expect(await screen.findByText(/Choose a product to see its real unit economics/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Find a product"), "TRV");
    await user.click(await screen.findByRole("button", { name: /Travel Bag/ }));
    await user.selectOptions(screen.getByLabelText("Channel (for its fees)"), AMZ);
    expect(await screen.findByText("45.7%")).toBeInTheDocument();
    expect(api.simulate).toHaveBeenLastCalledWith({ variantId: "v1", accountId: AMZ }, expect.anything());
    expect(screen.getByText("Nova Amazon commission")).toBeInTheDocument();
  });
});

describe("one-time move of the old browser values", () => {
  it("sends them to the server, then clears them", async () => {
    localStorage.setItem("omni_general_prefs", JSON.stringify({ pageSize: 100 }));
    renderTab("/settings/general");
    await waitFor(() => expect(api.save).toHaveBeenCalledWith({ preferences: { pageSize: 100 }, version: 7 }));
    await waitFor(() => expect(localStorage.getItem("omni_general_prefs")).toBeNull());
  });
});
