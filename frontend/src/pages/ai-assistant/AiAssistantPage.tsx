import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Send,
  Bot,
  User,
  Lightbulb,
  Clock,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import {
  MOCK_COPILOT_INSIGHTS,
  MOCK_COPILOT_HISTORY,
  MOCK_INITIAL_MESSAGES,
} from "@/mocks/data/assistant.data";
import type { CopilotMessage } from "@/types/assistant";

export default function AiAssistantPage() {
  const [messages, setMessages] = useState<CopilotMessage[]>(
    MOCK_INITIAL_MESSAGES,
  );
  const [inputPrompt, setInputPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend ?? inputPrompt;
    if (!text.trim()) return;

    const userMsg: CopilotMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputPrompt("");
    setIsThinking(true);

    // Contextual responses based on commerce operations
    setTimeout(() => {
      let replyContent =
        "I've cross-referenced your multi-channel sales velocity with warehouse levels. Here are the operational insights and advisory steps:";
      let visual: CopilotMessage["dataVisual"];
      let actions: CopilotMessage["suggestedActions"] = [
        {
          label: "View affected inventory",
          actionType: "navigate",
          targetUrl: "/inventory",
        },
      ];

      const lower = text.toLowerCase();
      if (lower.includes("trv") || lower.includes("travel bag") || lower.includes("stock")) {
        replyContent =
          "Analysis for **Premium Travel Bag (TRV-1042-BLK)**:\n\n• Current On-Hand: **114 units** across Delhi & Mumbai warehouses\n• Daily Sales Velocity: **14.2 units/day**\n• Stock Runway: **8 days remaining**\n• Lead Time with Vanguard Luggage: **21 days**\n\nAt this velocity, you will enter a stockout on approximately **Oct 24, 2026**. I recommend creating a Purchase Order of at least 150 units today.";
        visual = {
          type: "warning",
          title: "Critical Stockout Alert",
          details: [
            { label: "Runway", value: "8 Days" },
            { label: "Recommended PO", value: "150 Units" },
            { label: "Supplier", value: "Vanguard Luggage" },
          ],
        };
        actions = [
          {
            label: "Create Purchase Order for 150 units",
            actionType: "navigate",
            targetUrl: "/procurement",
          },
          {
            label: "Check Warehouse Stock Ledger",
            actionType: "navigate",
            targetUrl: "/inventory",
          },
        ];
      } else if (lower.includes("price") || lower.includes("margin") || lower.includes("flipkart")) {
        replyContent =
          "Pricing Analysis for **Cotton Overshirt (OS-2048-SND)**:\n\n• Buy Box Competitor Price: **₹1,499**\n• Current List Price: **₹1,599** on Flipkart\n• Unit COGS: **₹480** (Current Margin: 62%)\n\nLowering price to **₹1,449** undercuts the competitor by 3.3% while preserving a healthy 59.9% gross margin. This is forecasted to boost weekly sales by +18.5%.";
        visual = {
          type: "kpi",
          title: "Buy Box Opportunity",
          details: [
            { label: "Current Price", value: "₹1,599" },
            { label: "Proposed Price", value: "₹1,449" },
            { label: "Expected Margin", value: "59.9%" },
          ],
        };
        actions = [
          {
            label: "Review Proposal in Pricing Center",
            actionType: "navigate",
            targetUrl: "/pricing",
          },
        ];
      } else if (lower.includes("campaign") || lower.includes("roas") || lower.includes("sale")) {
        replyContent =
          "Campaign Performance Review for **Weekend Luggage Sale**:\n\n• Revenue Generated: **₹2,15,400**\n• Ad Spend: **₹42,500**\n• Effective ROAS: **5.07x**\n• Best Performing Channel: **Shopify (44% conversion)**\n\nYour campaign has 4 days remaining. Because conversion efficiency is above 4.5x, allocating an additional ₹20,000 budget is projected to yield ₹1.01L in additional revenue.";
        actions = [
          {
            label: "Manage Campaign Budget",
            actionType: "navigate",
            targetUrl: "/promotions",
          },
        ];
      }

      const botMsg: CopilotMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: replyContent,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        dataVisual: visual,
        suggestedActions: actions,
      };

      setMessages((prev) => [...prev, botMsg]);
      setIsThinking(false);
    }, 700);
  };

  return (
    <div className="flex h-[calc(100vh-140px)] w-full max-w-[1280px] mx-auto select-none font-['Inter',sans-serif] gap-6">
      {/* Left Column: Contextual Chat Area */}
      <div className="flex-1 flex flex-col bg-white border border-[#EAEAEA] rounded-xl shadow-2xs overflow-hidden">
        {/* Chat Header */}
        <div className="h-16 border-b border-[#EAEAEA] px-6 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-black text-white flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold text-[#000000]">
                  Commerce Copilot
                </h1>
                <span className="text-[10px] font-medium uppercase px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                  Advisory AI
                </span>
              </div>
              <span className="text-[11px] text-[#666666]">
                Connected to Amazon, Flipkart, Shopify, and Meesho catalog feeds
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] text-[#666666]">Active</span>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-neutral-50/40">
          {messages.map((m) => {
            const isBot = m.role === "assistant";

            return (
              <div
                key={m.id}
                className={`flex gap-3.5 max-w-[85%] ${
                  isBot ? "mr-auto" : "ml-auto flex-row-reverse"
                }`}
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
                    isBot ? "bg-black text-white" : "bg-blue-600 text-white"
                  }`}
                >
                  {isBot ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </div>

                <div className="flex flex-col gap-2">
                  <div
                    className={`p-4 rounded-xl text-[13px] leading-relaxed shadow-2xs whitespace-pre-line ${
                      isBot
                        ? "bg-white border border-[#EAEAEA] text-[#191F28]"
                        : "bg-black text-white"
                    }`}
                  >
                    {m.content}
                  </div>

                  {/* Data Visual Widget */}
                  {m.dataVisual && (
                    <div className="bg-white border border-[#EAEAEA] rounded-lg p-3.5 shadow-2xs">
                      <span className="text-[11px] font-semibold text-[#000000] block mb-2">
                        {m.dataVisual.title}
                      </span>
                      <div className="grid grid-cols-3 gap-2">
                        {m.dataVisual.details.map((d) => (
                          <div
                            key={d.label}
                            className="bg-neutral-50 rounded p-2 text-center border border-[#EAEAEA]"
                          >
                            <span className="text-[10px] text-[#666666] block">
                              {d.label}
                            </span>
                            <span className="text-[13px] font-bold text-[#000000]">
                              {d.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested Advisory Actions */}
                  {m.suggestedActions && m.suggestedActions.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {m.suggestedActions.map((act) => (
                        <Link
                          key={act.label}
                          to={act.targetUrl || "#"}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#EAEAEA] text-[11px] font-medium text-[#000000] hover:bg-neutral-50 transition-colors shadow-2xs"
                        >
                          <span>{act.label}</span>
                          <ArrowRight className="h-3 w-3 text-[#666666]" />
                        </Link>
                      ))}
                    </div>
                  )}

                  <span className="text-[10px] text-[#888888] px-1">
                    {m.timestamp}
                  </span>
                </div>
              </div>
            );
          })}

          {isThinking && (
            <div className="flex gap-3.5 mr-auto max-w-[85%] items-center">
              <div className="h-8 w-8 rounded-full bg-black text-white flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <div className="bg-white border border-[#EAEAEA] px-4 py-3 rounded-xl text-[12px] text-[#666666] flex items-center gap-2 shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-black animate-ping" />
                Analyzing live marketplace and inventory data...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-[#EAEAEA] bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-3 bg-neutral-50 border border-[#EAEAEA] rounded-xl px-4 py-2.5 focus-within:border-neutral-400 focus-within:bg-white transition-all shadow-xs"
          >
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Ask anything about inventory, margins, buy-box prices, or operations..."
              className="flex-1 bg-transparent text-[13px] text-[#000000] focus:outline-none placeholder:text-[#888888]"
            />
            <button
              type="submit"
              disabled={!inputPrompt.trim() || isThinking}
              className="h-8 w-8 rounded-lg bg-black text-white flex items-center justify-center hover:bg-neutral-800 disabled:opacity-40 transition-colors shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <span className="text-[10px] text-[#888888] block text-center mt-2">
            AI recommendations are advisory and require explicit confirmation for any financial changes.
          </span>
        </div>
      </div>

      {/* Right Column: Recommended Insights & History */}
      <div className="w-[360px] flex flex-col gap-5 shrink-0">
        {/* Recommended Prompts & Insights */}
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 shadow-2xs flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
            <span className="text-[11px] font-semibold text-[#000000] uppercase tracking-wider flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
              Proactive Insights
            </span>
            <span className="text-[10px] text-[#888888]">3 new</span>
          </div>

          <div className="flex flex-col gap-3">
            {MOCK_COPILOT_INSIGHTS.map((ins) => (
              <div
                key={ins.id}
                onClick={() => handleSendMessage(ins.suggestedPrompt)}
                className="p-3 rounded-lg border border-[#EAEAEA] bg-neutral-50/60 hover:bg-neutral-100/80 cursor-pointer transition-all flex flex-col gap-1.5"
              >
                <span className="text-[12px] font-semibold text-[#000000] leading-snug">
                  {ins.headline}
                </span>
                <p className="text-[11px] text-[#666666] line-clamp-2">
                  {ins.summary}
                </p>
                <span className="text-[10px] font-medium text-emerald-600">
                  {ins.metricImpact}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Conversation History */}
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 shadow-2xs flex-1 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
            <span className="text-[11px] font-semibold text-[#000000] uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[#666666]" />
              Conversation Sessions
            </span>
          </div>

          <div className="divide-y divide-[#EAEAEA] overflow-y-auto">
            {MOCK_COPILOT_HISTORY.map((h) => (
              <div
                key={h.id}
                className="py-2.5 flex items-center justify-between hover:bg-neutral-50 px-2 rounded cursor-pointer transition-colors"
              >
                <div className="flex flex-col overflow-hidden pr-2">
                  <span className="text-[12px] font-medium text-[#000000] truncate">
                    {h.title}
                  </span>
                  <span className="text-[10px] text-[#888888]">
                    {h.lastActive} · {h.messagesCount} msgs
                  </span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-[#888888] shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
