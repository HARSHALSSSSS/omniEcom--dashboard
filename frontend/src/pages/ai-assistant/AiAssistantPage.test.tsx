import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/api/errors";
import { useToastStore } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { AssistantConversation, AssistantInsight, AssistantMessage, ConversationDetail } from "@/types/assistant";

const api = vi.hoisted(() => ({
  settings: vi.fn(),
  enable: vi.fn(),
  insights: vi.fn(),
  conversations: vi.fn(),
  conversation: vi.fn(),
  create: vi.fn(),
  send: vi.fn(),
  rename: vi.fn(),
  setStatus: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/api/assistant.api", () => ({ assistantApi: api }));

import AiAssistantPage from "./AiAssistantPage";

const conv = (over: Partial<AssistantConversation> = {}): AssistantConversation => ({
  id: "c1",
  title: "Stock planning",
  status: "active",
  messagesCount: 2,
  lastActive: "2026-10-20T05:00:00.000Z",
  createdAt: "2026-10-20T04:00:00.000Z",
  ...over,
});

const userMsg = (over: Partial<AssistantMessage> = {}): AssistantMessage => ({
  id: "m1",
  role: "user",
  content: "Which products will run out?",
  timestamp: "2026-10-20T05:00:00.000Z",
  intent: null,
  confidence: null,
  generatedBy: null,
  dataVisual: null,
  suggestedActions: [],
  sources: [],
  ...over,
});

const botMsg = (over: Partial<AssistantMessage> = {}): AssistantMessage => ({
  id: "m2",
  role: "assistant",
  content: "**2 products** may run out:\n\n- KURTA-M\n- SHIRT-L",
  timestamp: "2026-10-20T05:00:01.000Z",
  intent: "stockout_risk",
  confidence: "data",
  generatedBy: "rules",
  dataVisual: { type: "warning", title: "Products at risk of running out", details: [{ label: "KURTA-M", value: "3 left, 2/day" }] },
  suggestedActions: [{ label: "Review inventory", actionType: "navigate", targetUrl: "/inventory" }],
  sources: ["inventory"],
  ...over,
});

const detail = (over: Partial<ConversationDetail> = {}): ConversationDetail => ({ ...conv(), messages: [userMsg(), botMsg()], ...over });

const INSIGHT: AssistantInsight = {
  id: "stock:v1",
  category: "stock",
  severity: "warning",
  headline: "Stockout risk on KURTA-M",
  summary: "Cotton Kurta runs out in 3 days.",
  metricImpact: "INR 12,000.00 of weekly sales depends on this SKU",
  metric: null,
  suggestedPrompt: "Show me replenishment quantities for KURTA-M",
  source: "product_intelligence",
};

const listPage = (items: AssistantConversation[]) => ({ items, page: 1, pageSize: 30, total: items.length, pages: 1 });

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname}</div>;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ai-assistant"]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <AiAssistantPage />
                <Probe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function signIn(permissions = ["ai:use"], features: Record<string, boolean> = { "ai.enabled": true }) {
  useWorkspaceStore.getState().setSession({
    user: { id: "u1", fullName: "Asha Admin", email: "a@x.test", businessName: "Nova", role: "owner" },
    permissions,
    shell: {
      user: { id: "u1", name: "Asha Admin", initials: "AA", roleLabel: "Business owner" },
      business: { id: "b1", name: "Nova", plan: "free", tier: "starter", timezone: "Asia/Kolkata" },
      badges: { needsAttention: 0, orders: 0, returns: 0, notifications: 0 },
      features,
    },
    onboardingStatus: "completed",
    onboardingResumeStep: "ready",
  });
}

const forbidden = (rule: string) => new ApiError({ code: "FORBIDDEN", message: "AI is off", status: 403, details: { rule } });

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  useWorkspaceStore.getState().clearWorkspace();
  signIn();
  api.settings.mockResolvedValue({ enabled: true, mode: "recommend", automatedActions: [], isDefault: true });
  api.insights.mockResolvedValue([INSIGHT]);
  api.conversations.mockResolvedValue(listPage([conv()]));
  api.conversation.mockResolvedValue(detail());
});

describe("AiAssistantPage gating", () => {
  it("shows no-access without the ai:use permission and calls nothing", async () => {
    signIn([], { "ai.enabled": true });
    renderPage();
    expect(await screen.findByText("You do not have access to the AI Assistant.")).toBeInTheDocument();
    expect(api.settings).not.toHaveBeenCalled();
    expect(api.conversations).not.toHaveBeenCalled();
  });

  it("shows the not-enabled screen when the ai.enabled flag is off", async () => {
    signIn(["ai:use"], { "ai.enabled": false });
    renderPage();
    expect(await screen.findByText("AI features are not enabled for this business.")).toBeInTheDocument();
    expect(api.insights).not.toHaveBeenCalled();
  });

  it("shows the not-enabled screen when the server answers 403 feature_disabled", async () => {
    api.insights.mockRejectedValue(forbidden("feature_disabled"));
    renderPage();
    expect(await screen.findByText("AI features are not enabled for this business.")).toBeInTheDocument();
  });

  it("offers to turn AI on when the business switched it off, and opens the workspace after", async () => {
    const user = userEvent.setup();
    api.settings.mockResolvedValueOnce({ enabled: false, mode: "recommend", automatedActions: [], isDefault: false });
    api.enable.mockResolvedValue({ enabled: true, mode: "recommend", automatedActions: [], isDefault: false });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Turn AI on" }));
    expect(api.enable).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText("Ask the assistant")).toBeInTheDocument();
  });
});

describe("AiAssistantPage conversations", () => {
  it("lists insights and conversations from the server", async () => {
    renderPage();
    expect(await screen.findByText("Stockout risk on KURTA-M")).toBeInTheDocument();
    expect(screen.getByText("INR 12,000.00 of weekly sales depends on this SKU")).toBeInTheDocument();
    expect(await screen.findByText("Stock planning")).toBeInTheDocument();
    expect(screen.getByText(/2 messages/)).toBeInTheDocument();
    expect(api.conversations).toHaveBeenCalledWith(expect.objectContaining({ status: "active", q: "", page: 1 }), expect.anything());
  });

  it("opens a conversation, renders markdown, the data card, the action link and server times in the business zone", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /^Stock planning/ }));
    expect(await screen.findByText("2 products")).toBeInTheDocument();
    expect(screen.getByText("2 products").tagName).toBe("STRONG");
    expect(screen.getByText("SHIRT-L").tagName).toBe("LI");
    expect(screen.getByText("Products at risk of running out")).toBeInTheDocument();
    expect(screen.getByText("3 left, 2/day")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review inventory/ })).toHaveAttribute("href", "/inventory");
    // 05:00 UTC is 10:30 in Asia/Kolkata
    expect(screen.getAllByText("20 Oct, 10:30")).toHaveLength(2);
    expect(screen.getByText("Source: inventory")).toBeInTheDocument();
  });

  it("creates a conversation and sends the typed question, keeping nothing mocked", async () => {
    const user = userEvent.setup();
    api.create.mockResolvedValue(conv({ id: "c9", title: "New conversation", messagesCount: 0 }));
    api.send.mockResolvedValue({
      conversation: conv({ id: "c9", title: "How are sales?", messagesCount: 2 }),
      userMessage: userMsg({ id: "u9", content: "How are sales?" }),
      assistantMessage: botMsg({ id: "a9", content: "Revenue is **up** 5%.", dataVisual: null, suggestedActions: [] }),
      followUp: null,
    });
    renderPage();
    await screen.findByText("Stock planning");
    await user.type(screen.getByLabelText("Ask the assistant"), "How are sales?");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("up")).toBeInTheDocument();
    expect(api.create).toHaveBeenCalledWith(undefined);
    expect(api.send).toHaveBeenCalledWith("c9", "How are sales?");
    expect(screen.getByLabelText("Ask the assistant")).toHaveValue("");
    expect(screen.getByRole("heading", { name: "How are sales?" })).toBeInTheDocument();
  });

  it("asks the insight's prompt when its card is clicked", async () => {
    const user = userEvent.setup();
    api.create.mockResolvedValue(conv({ id: "c9", title: "New conversation", messagesCount: 0 }));
    api.send.mockResolvedValue({ conversation: conv({ id: "c9" }), userMessage: userMsg({ id: "u9", content: INSIGHT.suggestedPrompt }), assistantMessage: botMsg({ id: "a9" }), followUp: null });
    renderPage();
    await user.click(await screen.findByRole("button", { name: `Ask: ${INSIGHT.suggestedPrompt}` }));
    await waitFor(() => expect(api.send).toHaveBeenCalledWith("c9", INSIGHT.suggestedPrompt));
  });

  it("keeps the typed text when sending fails (rate limit) and sends it again on retry", async () => {
    const user = userEvent.setup();
    api.create.mockResolvedValue(conv({ id: "c9", title: "New conversation", messagesCount: 0 }));
    api.send.mockRejectedValueOnce(new ApiError({ code: "RATE_LIMITED", message: "Too many requests", status: 429 }));
    api.send.mockResolvedValueOnce({ conversation: conv({ id: "c9" }), userMessage: userMsg({ id: "u9", content: "Any returns?" }), assistantMessage: botMsg({ id: "a9", content: "Returns are low." }), followUp: null });
    renderPage();
    await screen.findByText("Stock planning");
    await user.type(screen.getByLabelText("Ask the assistant"), "Any returns?");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/Too many requests/)).toBeInTheDocument();
    expect(screen.getByLabelText("Ask the assistant")).toHaveValue("Any returns?");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Returns are low.")).toBeInTheDocument();
    expect(api.send).toHaveBeenCalledTimes(2);
    // the conversation was created once, not per attempt
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it("enforces the 3 to 500 character limit before anything is sent", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Stock planning");
    await user.type(screen.getByLabelText("Ask the assistant"), "hi");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(screen.getByText("At least 3 characters")).toBeInTheDocument();
  });

  it("locks the composer for an archived conversation until it is restored", async () => {
    const user = userEvent.setup();
    api.conversation.mockResolvedValue(detail({ status: "archived" }));
    api.setStatus.mockResolvedValue(conv());
    renderPage();
    await user.click(await screen.findByRole("button", { name: /^Stock planning/ }));
    expect(await screen.findByText("This conversation is archived. Restore it to continue.")).toBeInTheDocument();
    expect(screen.getByLabelText("Ask the assistant")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Restore conversation" }));
    expect(api.setStatus).toHaveBeenCalledWith("c1", "active");
  });

  it("renames a conversation", async () => {
    const user = userEvent.setup();
    api.rename.mockResolvedValue(conv({ title: "Q4 stock" }));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Rename Stock planning" }));
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Title");
    await user.clear(input);
    await user.type(input, "Q4 stock");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.rename).toHaveBeenCalledWith("c1", "Q4 stock"));
  });

  it("deletes only after a confirmation", async () => {
    const user = userEvent.setup();
    api.remove.mockResolvedValue({ id: "c1", deleted: true });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Delete Stock planning" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete conversation" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("c1"));
  });

  it("asks before following a rule or purchase-order suggestion", async () => {
    const user = userEvent.setup();
    api.conversation.mockResolvedValue(detail({ messages: [userMsg(), botMsg({ suggestedActions: [{ label: "Plan purchase orders", actionType: "draft_po", targetUrl: "/procurement" }] })] }));
    renderPage();
    await user.click(await screen.findByRole("button", { name: /^Stock planning/ }));
    await user.click(await screen.findByRole("button", { name: /Plan purchase orders/ }));
    const dialog = await screen.findByRole("dialog", { name: "Start a purchase order?" });
    expect(screen.getByTestId("loc")).toHaveTextContent("/ai-assistant");
    await user.click(within(dialog).getByRole("button", { name: "Open procurement" }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/procurement");
  });

  it("shows a retry when the conversation list fails to load", async () => {
    const user = userEvent.setup();
    api.conversations.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "boom", status: 500 }));
    renderPage();
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByText(/Conversations could not be loaded/)).toBeInTheDocument();
    await user.click(retry);
    expect(await screen.findByText("Stock planning")).toBeInTheDocument();
  });
});
