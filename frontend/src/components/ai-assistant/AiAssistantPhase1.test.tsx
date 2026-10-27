import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductContextRail } from "./ProductContextRail";
import { ConversationHistoryView } from "./ConversationHistoryView";
import { CopilotWelcome } from "./CopilotWelcome";
import type { AssistantConversation } from "@/types/assistant";

const SAMPLE_CONV: AssistantConversation = {
  id: "conv-123",
  title: "Review Cotton throw stock risk",
  status: "active",
  messagesCount: 4,
  lastActive: "2026-10-09T10:42:00.000Z",
  createdAt: "2026-10-09T10:00:00.000Z",
};

describe("ProductContextRail", () => {
  it("renders product name, category, days of cover and performance metrics", () => {
    render(
      <ProductContextRail
        data={{
          sku: "NL-THR-002",
          name: "Cotton throw",
          category: "Textiles",
          riskBadge: "P1 · Stock risk",
          daysOfCover: 5,
          leadTimeDays: 12,
          onHand: 50,
          unitsSold: 300,
          dailyDemand: 10,
          netSales: "₹4,50,000",
          grossProfit: "₹1,53,000",
          grossMargin: "34.0%",
          month: "September 2026",
        }}
      />
    );

    expect(screen.getByText("Cotton throw")).toBeInTheDocument();
    expect(screen.getByText(/NL-THR-002 · Textiles/)).toBeInTheDocument();
    expect(screen.getByText("P1 · Stock risk")).toBeInTheDocument();
    expect(screen.getByText("5 days of cover")).toBeInTheDocument();
    expect(screen.getByText("12-day lead time")).toBeInTheDocument();
    expect(screen.getByText("7 days below the stated lead time")).toBeInTheDocument();
    expect(screen.getByText("₹4,50,000")).toBeInTheDocument();
    expect(screen.getByText("34.0%")).toBeInTheDocument();
  });

  it("can collapse and expand the context rail", async () => {
    const user = userEvent.setup();
    render(<ProductContextRail />);

    const collapseBtn = screen.getByTitle("Collapse Panel");
    await user.click(collapseBtn);

    expect(screen.queryByText("Cotton throw")).not.toBeInTheDocument();
    const expandBtn = screen.getByTitle("Expand Product Context");
    expect(expandBtn).toBeInTheDocument();

    await user.click(expandBtn);
    expect(screen.getByText("Cotton throw")).toBeInTheDocument();
  });
});

describe("ConversationHistoryView", () => {
  it("renders search, filters and grouped conversation timeline", () => {
    render(<ConversationHistoryView conversations={[SAMPLE_CONV]} onOpenConversation={vi.fn()} />);

    expect(screen.getByText("Conversation history")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search conversations, products or SKUs...")).toBeInTheDocument();
    expect(screen.getByText("All sources")).toBeInTheDocument();
    expect(screen.getByText("All dates")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("selects and previews conversation, and opens it on button click", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ConversationHistoryView conversations={[SAMPLE_CONV]} onOpenConversation={onOpen} />);

    expect(screen.getByText("Conversation preview")).toBeInTheDocument();
    const openBtn = screen.getByRole("button", { name: "Open conversation" });
    await user.click(openBtn);
    expect(onOpen).toHaveBeenCalled();
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
