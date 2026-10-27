import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductContextRail } from "./ProductContextRail";
import { MemoryRouter } from "react-router-dom";
import type { IntelItem } from "@/types/intelligence";
import { CopilotWelcome } from "./CopilotWelcome";
import type { AssistantConversation } from "@/types/assistant";

const SAMPLE_CONV: AssistantConversation = {
  id: "conv-123",
  title: "Review stock risk",
  status: "active",
  messagesCount: 4,
  context: null,
  lastActive: "2026-10-09T10:42:00.000Z",
  createdAt: "2026-10-09T10:00:00.000Z",
};

const ITEM = {
  id: "v1", variantId: "v1", productId: "p1", sku: "KURTA-M", productName: "Cotton Kurta", categoryId: null, category: "Apparel",
  salesVelocity: 2.5, unitsSold30d: 75, velocityTrend: "steady", trendChangePercent: 0, marginPercent: 38.5, sellingPriceMinor: 99900, costPriceMinor: null,
  inventory: { available: 12, onHand: 14, runwayDays: 4.8, ageDays: 3, leadTimeDays: 10, suggestedReorderUnits: null },
  competitor: null, recommendedAction: "reorder", confidence: { score: 80, level: "high", factors: [] }, reasons: [],
} as unknown as IntelItem;

const rail = (over: Partial<React.ComponentProps<typeof ProductContextRail>> = {}) =>
  render(
    <MemoryRouter>
      <ProductContextRail sku="KURTA-M" item={ITEM} loading={false} error={null} onRetry={vi.fn()} {...over} />
    </MemoryRouter>,
  );

describe("ProductContextRail", () => {
  it("shows the product's own stock, demand and margin", () => {
    rail();
    expect(screen.getByText("Cotton Kurta")).toBeInTheDocument();
    expect(screen.getByText(/KURTA-M · Apparel/)).toBeInTheDocument();
    expect(screen.getByText("5 days of cover")).toBeInTheDocument();
    expect(screen.getByText("10-day lead time")).toBeInTheDocument();
    expect(screen.getByText("5 days below the lead time")).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    expect(screen.getByText("38.5%")).toBeInTheDocument();
  });

  it("without a product it says so and shows no example numbers", () => {
    rail({ sku: undefined, item: undefined });
    expect(screen.getByText("No product selected")).toBeInTheDocument();
    expect(screen.queryByText(/days of cover|illustrative/i)).not.toBeInTheDocument();
  });

  it("says when the product was not found, and offers a retry on error", async () => {
    const user = userEvent.setup();
    const { unmount } = rail({ item: null });
    expect(screen.getByText("KURTA-M was not found")).toBeInTheDocument();
    unmount();
    const onRetry = vi.fn();
    rail({ item: undefined, error: "Product Intelligence is down", onRetry });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("can collapse and expand", async () => {
    const user = userEvent.setup();
    rail();
    await user.click(screen.getByTitle("Collapse Panel"));
    expect(screen.queryByText("Cotton Kurta")).not.toBeInTheDocument();
    await user.click(screen.getByTitle("Expand Product Context"));
    expect(screen.getByText("Cotton Kurta")).toBeInTheDocument();
  });
});

describe("CopilotWelcome", () => {
  it("renders hero title, prompt quadrants and triggers onAsk when prompt clicked", async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();

    render(
      <CopilotWelcome
        conversations={[SAMPLE_CONV]}
        onSelectConversation={vi.fn()}
        onNewConversation={vi.fn()}
        onAsk={onAsk}
        draft=""
        onDraftChange={vi.fn()}
      />
    );

    expect(screen.getByText("Ask your business anything.")).toBeInTheDocument();
    expect(screen.getByText("Understand")).toBeInTheDocument();
    expect(screen.getByText("Improve")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Investigate")).toBeInTheDocument();

    const promptBtn = screen.getByText("What needs my attention today?");
    await user.click(promptBtn);
    expect(onAsk).toHaveBeenCalledWith("What needs my attention today?");
  });
});
