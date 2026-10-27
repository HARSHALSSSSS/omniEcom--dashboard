import { useState, type KeyboardEvent } from "react";
import {
  ArrowRight,
  ArrowUp,
  Bookmark,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Info,
  Maximize2,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import type { AssistantConversation } from "@/types/assistant";

export interface PromptOption {
  category: "Understand" | "Improve" | "Plan" | "Investigate";
  prompt: string;
}

const STARTER_PROMPTS = [
  {
    category: "Understand",
    icon: Maximize2,
    items: [
      "What needs my attention today?",
      "Why did sales change?",
      "Which marketplace is performing best for this product?",
    ],
  },
  {
    category: "Improve",
    icon: SlidersHorizontal,
    items: [
      "Which products are losing money?",
      "Which listings are incomplete?",
      "Which products have recurring customer complaints?",
    ],
  },
  {
    category: "Plan",
    icon: Calendar,
    items: [
      "Which products should I restock?",
      "Which products have high demand but low stock?",
      "Which products should I consider promoting?",
    ],
  },
  {
    category: "Investigate",
    icon: Search,
    items: [
      "Why are returns increasing?",
      "Show products with weak margins.",
      "Find orders or products affected by a marketplace sync issue.",
    ],
  },
] as const;

interface CopilotWelcomeProps {
  conversations: AssistantConversation[];
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onAsk: (question: string) => void;
  draft: string;
  onDraftChange: (v: string) => void;
  sending?: boolean;
}

export function CopilotWelcome({
  conversations,
  onSelectConversation,
  onNewConversation,
  onAsk,
  draft,
  onDraftChange,
  sending = false,
}: CopilotWelcomeProps) {
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [searchHistory, setSearchHistory] = useState("");
  const [scope, setScope] = useState("All Business Data");
  const [marketplace, setMarketplace] = useState("Marketplace");
  const [dateRange, setDateRange] = useState("Date Range");

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = draft.trim();
      if (trimmed.length >= 3 && !sending) {
        onAsk(trimmed);
      }
    }
  };

  const handleSend = () => {
    const trimmed = draft.trim();
    if (trimmed.length >= 3 && !sending) {
      onAsk(trimmed);
    }
  };

  const canSubmit = draft.trim().length >= 3 && !sending;

  return (
    <div className="grid min-h-[750px] flex-1 grid-cols-1 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[240px_minmax(0,1fr)_auto]">
      {/* 1. Left Mini Sidebar: Conversation list & shortcuts */}
      <div className="hidden flex-col border-r border-border bg-muted/20 p-4 lg:flex">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-foreground">Commerce Copilot</h2>
          <p className="text-[11px] text-muted-foreground">Your business, understood.</p>
        </div>

        <Button
          size="sm"
          className="mt-4 w-full justify-start gap-2 bg-black text-xs text-white hover:bg-neutral-800"
          onClick={onNewConversation}
        >
          <Plus className="h-3.5 w-3.5" />
          New conversation
        </Button>

        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchHistory}
            onChange={(e) => setSearchHistory(e.target.value)}
            placeholder="Search conversations"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto text-xs">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Today</span>
            <div className="mt-1 space-y-0.5">
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                onClick={() => onAsk("Products at risk of stockout")}
              >
                Products at risk of stockout
              </button>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                onClick={() => onAsk("Today's operational priorities")}
              >
                Today&apos;s operational priorities
              </button>
            </div>
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Yesterday</span>
            <div className="mt-1 space-y-0.5">
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                onClick={() => onAsk("Why returns increased")}
              >
                Why returns increased
              </button>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                onClick={() => onAsk("Products needing listing fixes")}
              >
                Products needing listing fixes
              </button>
            </div>
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Earlier</span>
            <div className="mt-1 space-y-0.5">
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                onClick={() => onAsk("Marketplace profitability comparison")}
              >
                Marketplace profitability comparison
              </button>
            </div>
          </div>

          {conversations.length > 0 && (
            <div className="pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</span>
              <div className="mt-1 space-y-0.5">
                {conversations.slice(0, 5).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full truncate rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                    onClick={() => onSelectConversation(c.id)}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-border">
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Bookmark className="h-3.5 w-3.5" />
              Saved Insights
            </button>
          </div>
        </div>

        <div className="border-t border-border pt-3 text-[10px] text-muted-foreground">
          <p className="font-semibold uppercase tracking-wider">SAMPLE CONVERSATIONS</p>
          <p className="mt-0.5">Explore examples. Nothing here is a finding about your business.</p>
        </div>
      </div>

      {/* 2. Center Hero: Scoped Query Input and Structured Prompt Quadrants */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 lg:p-8">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center space-y-8">
          {/* Header Title */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                COMMERCE COPILOT
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                DEMO WORKSPACE
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Ask your business anything.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Understand what&apos;s selling, uncover risks, and decide what to do next using your connected commerce data.
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="font-semibold uppercase tracking-wider text-blue-600">DEMO CONTEXT</span>
              <span className="text-muted-foreground">Products · Orders · Inventory · Profitability</span>
            </div>
          </div>

          {/* Prominent Scoped Query Box */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs focus-within:border-foreground focus-within:ring-1 focus-within:ring-foreground">
            <textarea
              aria-label="Ask the assistant"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder="Ask about your products, sales, inventory, or operations..."
              className="w-full resize-none bg-transparent text-sm text-foreground outline-hidden placeholder:text-muted-foreground"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* Data Scope dropdown */}
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground hover:bg-muted"
                  onClick={() => setScope(scope === "All Business Data" ? "Inventory" : "All Business Data")}
                >
                  {scope}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>

                {/* Marketplace dropdown */}
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground hover:bg-muted"
                  onClick={() => setMarketplace(marketplace === "Marketplace" ? "Amazon" : "Marketplace")}
                >
                  {marketplace}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>

                {/* Date range dropdown */}
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground hover:bg-muted"
                  onClick={() => setDateRange(dateRange === "Date Range" ? "Last 30 Days" : "Date Range")}
                >
                  {dateRange}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Attach reference"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <Button
                  size="sm"
                  aria-label="Send message"
                  disabled={!canSubmit}
                  loading={sending}
                  onClick={handleSend}
                  className="h-8 w-8 rounded-lg bg-black p-0 text-white hover:bg-neutral-800 disabled:opacity-40"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Add a question. Choose the scope. You&apos;re in control.</span>
            <span>Shift + Enter for a new line</span>
          </div>

          {/* Curated Prompt Quadrants ("Start with a better question") */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Start with a better question
              </h2>
              <span className="text-xs text-muted-foreground">Explore your business</span>
            </div>

            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {STARTER_PROMPTS.map((group) => {
                const Icon = group.icon;
                return (
                  <div key={group.category} className="grid grid-cols-1 p-3.5 sm:grid-cols-[140px_minmax(0,1fr)] gap-2">
                    <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {group.category}
                    </div>
                    <div className="space-y-1.5">
                      {group.items.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => onAsk(item)}
                        >
                          <span>{item}</span>
                          <ArrowRight className="h-3 w-3 -rotate-45 shrink-0 opacity-60" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            Demonstration data — not actual business findings. Review source records before making decisions. No changes applied.
          </p>
        </div>
      </div>

      {/* 3. Right Docked Rail: Analysis Context */}
      {rightPanelOpen ? (
        <aside className="hidden w-[310px] flex-col overflow-y-auto border-l border-border bg-card p-5 text-xs lg:flex">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <span className="font-semibold uppercase tracking-wider text-muted-foreground">Analysis Context</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              title="Collapse"
              onClick={() => setRightPanelOpen(false)}
            >
              <PanelRightClose className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>

          <div className="mt-4 space-y-5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                READY WHEN YOU ARE
              </span>
              <h3 className="mt-1 text-base font-bold text-foreground">A clear view behind every answer.</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Ask a question to see its scope, supporting records and limitations here. No analysis has run yet.
              </p>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex gap-2.5">
                <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <h4 className="font-semibold text-foreground">Scope you can inspect</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Your question determines the data used. Narrow the marketplace or date range before you ask.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5">
                <Bookmark className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <h4 className="font-semibold text-foreground">Evidence, not guesswork</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Answers link back to relevant records. Missing or outdated data is called out, not filled in.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <h4 className="font-semibold text-foreground">The decision stays yours</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Suggestions are for review. Changes require your explicit approval.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <span className="text-[11px] font-bold text-foreground">From question to decision</span>
              <ol className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
                <li className="flex items-center justify-between">
                  <span>01 Question</span>
                  <span className="text-[10px]">↓</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>02 Context</span>
                  <span className="text-[10px]">↓</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>03 Evidence</span>
                  <span className="text-[10px]">↓</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>04 Recommend</span>
                  <span className="text-[10px]">↓</span>
                </li>
                <li className="flex items-center justify-between font-semibold text-foreground">
                  <span>05 Merchant decides</span>
                </li>
              </ol>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Info className="h-3.5 w-3.5" />
                Demonstration data
              </div>
              <p className="mt-1">
                Not actual business findings. Freshness is unavailable in demo.
              </p>
            </div>
          </div>
        </aside>
      ) : (
        <div className="hidden h-full w-10 flex-col items-center border-l border-border bg-card py-4 lg:flex">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Expand Analysis Context"
            onClick={() => setRightPanelOpen(true)}
          >
            <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
          </Button>
          <span className="mt-8 -rotate-90 whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Analysis Context
          </span>
        </div>
      )}
    </div>
  );
}
