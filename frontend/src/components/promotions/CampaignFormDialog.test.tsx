import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PromotionCampaign } from "@/types/promotions";

const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  lifecycle: vi.fn(),
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
  version: 1,
  createdAt: "2026-10-20T08:00:00.000Z",
  updatedAt: "2026-10-20T08:00:00.000Z",
  ...over,
});

function renderDialog(onSaved = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CampaignFormDialog open onOpenChange={vi.fn()} campaign={null} accounts={[]} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return onSaved;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.variants.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  api.categories.mockResolvedValue([]);
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
});
