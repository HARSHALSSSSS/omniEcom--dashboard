import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CampaignPrefill, PreviewResult, PromotionAccount, PromotionCampaign } from "@/types/promotions";

const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  lifecycle: vi.fn(),
  preview: vi.fn(),
  campaignProducts: vi.fn(),
  campaign: vi.fn(),
  variants: vi.fn(),
  categories: vi.fn(),
}));
vi.mock("@/api/promotions.api", () => ({ promotionsApi: api }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

import { CampaignFormDialog } from "./CampaignFormDialog";

const saved = (over: Partial<PromotionCampaign> = {}): PromotionCampaign => ({
  id: "66666666-6666-4666-8666-666666666666",
  name: "Once",
  code: "ONCE",
  description: null,
  type: "percentage_discount",
  valueBps: 1000,
  valueMinor: null,
  buyQuantity: null,
  getQuantity: null,
  minOrderMinor: 0,
  budgetMinor: 0,
  currency: "INR",
  status: "draft",
  startsAt: null,
  endsAt: null,
  accountIds: [],
  channels: [],
  spendMinor: 0,
  revenueMinor: 0,
  unitsMoved: 0,
  ordersCount: 0,
  budgetUsedBps: null,
  statsUpdatedAt: null,
  itemCounts: { total: 0, eligible: 0, pending_sync: 0, live: 0, ineligible: 0, ended: 0 },
  endReason: null,
  horizon: "next",
  endingSoon: false,
  endsInHours: null,
  capability: "supported",
  version: 1,
  createdAt: "2026-10-20T08:00:00.000Z",
  updatedAt: "2026-10-20T08:00:00.000Z",
  ...over,
});

const ACCOUNTS: PromotionAccount[] = [
  { id: "22222222-2222-4222-8222-222222222222", marketplace: "amazon_in", displayName: "Main store", status: "active" },
  { id: "55555555-5555-4555-8555-555555555555", marketplace: "flipkart", displayName: "Flipkart shop", status: "active" },
];
const V1 = "00000000-0000-4000-8000-000000000001";
const V2 = "00000000-0000-4000-8000-000000000002";
const PREFILL: CampaignPrefill = {
  accountId: ACCOUNTS[0]!.id,
  discountBps: 1000,
  variants: [
    { id: V1, productId: "p1", sku: "SKU-1", productTitle: "Tee", optionValues: {}, sellingPriceMinor: 49_900, status: "active" },
    { id: V2, productId: "p2", sku: "SKU-2", productTitle: "Mug", optionValues: {}, sellingPriceMinor: 29_900, status: "active" },
  ],
};

const emptySummary = { products: 0, placements: 0, runnable: 0, notRunnable: 0, notListed: 0, belowMarginTarget: 0, unknownCost: 0, conflicts: 0, connectorCannotPush: 0, avgDiscountBps: null, unknownVariants: 0 };
const previewRow = (over: Record<string, unknown>) => ({
  variantId: V1, productId: "p1", productName: "Tee", sku: "SKU-1", availableStock: 40, lowStock: false, accountId: ACCOUNTS[0]!.id, marketplace: "amazon_in", displayName: "Main store", listed: true, canPushPrices: true,
  regularPriceMinor: 49_900, promoPriceMinor: 44_910, discountBps: 1000, ok: true, reason: null, conflict: null, unitCostMinor: 30_000, feesConfigured: true, marginRegularBps: 2988, marginPromoBps: 2320,
  targetMarginBps: null, belowTarget: null, minPromoPriceMinor: null, maxDiscountBps: null, ...over,
});
const previewOf = (summary: Partial<PreviewResult["summary"]>, items: unknown[]): PreviewResult => ({ summary: { ...emptySummary, ...summary }, items: items as PreviewResult["items"] });

function renderDialog(onSaved = vi.fn(), props: { prefill?: CampaignPrefill | null; accounts?: PromotionAccount[] } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CampaignFormDialog open onOpenChange={vi.fn()} campaign={null} accounts={props.accounts ?? []} prefill={props.prefill} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return onSaved;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.variants.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  api.categories.mockResolvedValue([]);
  api.preview.mockResolvedValue(previewOf({}, []));
  api.campaignProducts.mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0, pages: 1, counts: {} });
});

describe("CampaignFormDialog", () => {
  it("saves a double-clicked Create Campaign once", async () => {
    api.create.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ campaign: saved(), products: null }), 50)));
    const user = userEvent.setup();
    const onSaved = renderDialog();
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Campaign name/), "Once");
    await user.type(within(dialog).getByLabelText(/Proposed discount/), "10");
    const create = within(dialog).getByRole("button", { name: "Create Campaign" });
    // two clicks inside one task, before the button can re-render as disabled
    act(() => {
      fireEvent.click(create);
      fireEvent.click(create);
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it("asks for both quantities of a buy X get Y campaign and sends them", async () => {
    api.create.mockResolvedValue({ campaign: saved({ type: "bogo", valueBps: null, buyQuantity: 2, getQuantity: 1 }), products: null });
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Campaign name/), "Two for one");
    await user.selectOptions(within(dialog).getByLabelText(/Promotion type/), "bogo");
    await user.type(within(dialog).getByLabelText(/Buy quantity/), "2");
    await user.type(within(dialog).getByLabelText(/Get quantity/), "1");
    await user.click(within(dialog).getByRole("button", { name: "Create Campaign" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0]?.[0]).toMatchObject({ type: "bogo", buyQuantity: 2, getQuantity: 1, valueBps: null });
  });

  it("previews the prefilled products per channel: prices, margins against the target, floor, reasons and totals", async () => {
    api.preview.mockResolvedValue(
      previewOf(
        { products: 2, placements: 2, runnable: 1, notRunnable: 1, belowMarginTarget: 1, unknownCost: 1, conflicts: 1, avgDiscountBps: 1000, unknownVariants: 1 },
        [
          previewRow({ ok: false, reason: "Main store: the margin at the promotional price, after marketplace fees, is below the pricing margin target", marginPromoBps: 1485, targetMarginBps: 2000, belowTarget: true, minPromoPriceMinor: 42_858, maxDiscountBps: 1411 }),
          previewRow({ variantId: V2, productName: "Mug", sku: "SKU-2", regularPriceMinor: 29_900, promoPriceMinor: 26_910, unitCostMinor: null, marginRegularBps: null, marginPromoBps: null, conflict: { kind: "other_campaign", message: "Festive Flash (active) already covers it" } }),
        ],
      ),
    );
    renderDialog(vi.fn(), { prefill: PREFILL, accounts: ACCOUNTS });
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(api.preview).toHaveBeenCalled(), { timeout: 3000 });
    const body = api.preview.mock.calls[0]![0];
    expect(body).toMatchObject({ type: "percentage_discount", valueBps: 1000, accountIds: [ACCOUNTS[0]!.id], variantIds: [V1, V2] });
    expect(api.preview.mock.calls[0]![1]).toBeInstanceOf(AbortSignal);
    const panel = within(await within(dialog).findByLabelText("Campaign preview"));
    expect(panel.getByTestId("preview-summary")).toHaveTextContent("1 of 2 product placements can run, 1 cannot · average discount 10%");
    expect(panel.getByText(/1 below the margin target · 1 without a cost price · 1 in conflict with another campaign or sale · 1 product not found/)).toBeInTheDocument();
    expect(panel.getByText("₹499")).toBeInTheDocument();
    expect(panel.getByText("₹449.10")).toBeInTheDocument();
    expect(panel.getByText(/target 20% · below target/)).toBeInTheDocument();
    expect(panel.getByText("₹428.58")).toBeInTheDocument();
    expect(panel.getByText("up to 14.1% off")).toBeInTheDocument();
    expect(panel.getByText(/after marketplace fees, is below the pricing margin target/)).toBeInTheDocument();
    expect(panel.getByText("cost not set")).toBeInTheDocument();
    expect(panel.getByText("Festive Flash (active) already covers it")).toBeInTheDocument();
    expect(within(dialog).queryByText(/illustrative/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Sample values/)).not.toBeInTheDocument();
  });

  it("asks for nothing until there are products and a valid discount, and says why", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Pick products and enter the discount to preview prices and margins.")).toBeInTheDocument();
    expect(api.preview).not.toHaveBeenCalled();
  });

  it("lets a campaign run on several channels and sends them all", async () => {
    api.create.mockResolvedValue({ campaign: saved(), products: null });
    const user = userEvent.setup();
    renderDialog(vi.fn(), { accounts: ACCOUNTS });
    const dialog = await screen.findByRole("dialog");
    const every = within(dialog).getByRole("checkbox", { name: "Every connected channel" });
    expect(every).toBeChecked();
    await user.click(within(dialog).getByRole("checkbox", { name: "Main store" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Flipkart shop" }));
    expect(every).not.toBeChecked();
    await user.type(within(dialog).getByLabelText(/Campaign name/), "Two channels");
    await user.type(within(dialog).getByLabelText(/Proposed discount/), "10");
    await user.click(within(dialog).getByRole("button", { name: "Create Campaign" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0]?.[0].accountIds).toEqual(ACCOUNTS.map((a) => a.id));
  });

  it("sends the optional code, description, budget and minimum order", async () => {
    api.create.mockResolvedValue({ campaign: saved(), products: null });
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Campaign name/), "Optional");
    await user.type(within(dialog).getByLabelText(/Proposed discount/), "10");
    await user.type(within(dialog).getByLabelText(/Campaign code/), "diwali25");
    await user.type(within(dialog).getByLabelText(/Description/), "Festive offer");
    await user.type(within(dialog).getByLabelText(/Discount budget/), "1500.50");
    await user.type(within(dialog).getByLabelText(/Minimum order/), "999");
    await user.click(within(dialog).getByRole("button", { name: "Create Campaign" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0]?.[0]).toMatchObject({ name: "Optional", code: "diwali25", description: "Festive offer", budgetMinor: 150_050, minOrderMinor: 99_900 });
  });

  it("shows the product-count hint and asks for dates before scheduling", async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("You can also add or change products from the campaign after saving.")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Campaign name/), "Dates");
    await user.type(within(dialog).getByLabelText(/Proposed discount/), "10");
    await user.click(within(dialog).getByRole("button", { name: /Save & Schedule/ }));
    expect(await within(dialog).findByText("A scheduled campaign needs a start")).toBeInTheDocument();
    expect(within(dialog).getByText("A scheduled campaign needs an end")).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });

  it("saves and schedules in one go", async () => {
    api.create.mockResolvedValue({ campaign: saved({ version: 1 }), products: null });
    api.lifecycle.mockResolvedValue({ campaign: saved({ status: "scheduled", version: 2 }), changed: true, pushed: [] });
    const user = userEvent.setup();
    const onSaved = renderDialog(vi.fn(), { prefill: PREFILL, accounts: ACCOUNTS });
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Campaign name/), "Scheduled sale");
    fireEvent.change(within(dialog).getByLabelText(/Starts/), { target: { value: "2030-01-01T10:00" } });
    fireEvent.change(within(dialog).getByLabelText(/Ends/), { target: { value: "2030-01-05T10:00" } });
    await user.click(within(dialog).getByRole("button", { name: /Save & Schedule/ }));
    await waitFor(() => expect(api.lifecycle).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0]?.[0]).toMatchObject({ name: "Scheduled sale", valueBps: 1000, selection: { variantIds: [V1, V2] } });
    expect(api.lifecycle).toHaveBeenCalledWith("66666666-6666-4666-8666-666666666666", "schedule", 1);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ status: "scheduled" })));
  });

  it("blocks scheduling, with the reason, when none of the products can run; a draft can still be saved", async () => {
    api.preview.mockResolvedValue(previewOf({ products: 2, placements: 2, runnable: 0, notRunnable: 2 }, [previewRow({ ok: false, reason: "Main store: no active listing on this account" }), previewRow({ variantId: V2, sku: "SKU-2", ok: false, reason: "Main store: no active listing on this account" })]));
    api.create.mockResolvedValue({ campaign: saved(), products: null });
    const user = userEvent.setup();
    renderDialog(vi.fn(), { prefill: PREFILL, accounts: ACCOUNTS });
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Campaign name/), "Nothing runs");
    await waitFor(() => expect(within(dialog).getByText("None of the products can run yet: see the preview.")).toBeInTheDocument(), { timeout: 3000 });
    expect(within(dialog).getAllByText("Main store: no active listing on this account").length).toBe(2);
    expect(within(dialog).getByRole("button", { name: /Save & Schedule/ })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Create Campaign" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
  });

  it("shows why the preview failed instead of numbers", async () => {
    api.preview.mockRejectedValue(new Error("Preview unavailable"));
    renderDialog(vi.fn(), { prefill: PREFILL, accounts: ACCOUNTS });
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/The preview could not be loaded: Preview unavailable/, undefined, { timeout: 3000 })).toBeInTheDocument();
  });
});
