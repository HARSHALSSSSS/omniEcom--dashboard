import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  Calendar,
  ChevronDown,
  Layers,
  MessageSquare,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import type { AssistantConversation } from "@/types/assistant";

export interface MockHistoryItem {
  id: string;
  title: string;
  snippet: string;
  source: string;
  sku?: string;
  messagesCount: number;
  time: string;
  group: "Today" | "Yesterday" | "Earlier this week";
  question: string;
  reviewedHeadline: string;
  onHand?: string;
  dailyDemand?: string;
  stockCoverVsLeadTime?: string;
  stillToVerify?: string;
}

const SAMPLE_HISTORY: MockHistoryItem[] = [
  {
    id: "hist-1",
    title: "Review Cotton throw stock risk",
    snippet: "5 days of cover against a 12-day lead time. Incoming stock still needs verification.",
    source: "Product Intelligence",
    sku: "NL-THR-002",
    messagesCount: 4,
    time: "10:42",
    group: "Today",
    question: "Why is Cotton throw marked as a P1 stock risk, and what should I check before placing a purchase order?",
    reviewedHeadline: "Stock cover is shorter than the stated lead time.",
    onHand: "50 units",
    dailyDemand: "10 units/day",
    stockCoverVsLeadTime: "5 / 12 days",
    stillToVerify: "Incoming stock, expected receipt dates and supplier lead time before creating a purchase order.",
  },
  {
    id: "hist-2",
    title: "Compare September product margins",
    snippet: "Reviewed gross margin differences across the top-selling homeware products.",
    source: "Reports",
    sku: "NL-DIN-004",
    messagesCount: 6,
    time: "09:18",
    group: "Today",
    question: "How do Stoneware dinner set margins compare with the category average?",
    reviewedHeadline: "Margin is 4 pp below the 32% benchmark on ₹3.00L net sales.",
    onHand: "160 units",
    dailyDemand: "8 units/day",
    stockCoverVsLeadTime: "20 / 14 days",
    stillToVerify: "Supplier tier discounts for bulk purchase before updating listing price.",
  },
  {
    id: "hist-3",
    title: "Check Ceramic planter listing gaps",
    snippet: "Missing dimensions and care details to verify before updating marketplace listings.",
    source: "Listings",
    sku: "NL-PLN-004",
    messagesCount: 3,
    time: "16:35",
    group: "Yesterday",
    question: "Why did Flipkart suppress the Ceramic planter listing?",
    reviewedHeadline: "Mandatory attribute 'Package Dimensions' missing in latest SP-API sync.",
    stillToVerify: "Update dimensions in Product Catalog and run re-sync job.",
  },
  {
    id: "hist-4",
    title: "Understand delayed orders",
    snippet: "Reviewed unfulfilled orders and carrier handoff records that need a closer look.",
    source: "Fulfillment",
    messagesCount: 5,
    time: "11:06",
    group: "Yesterday",
    question: "Which courier has the highest SLA breach rate this week?",
    reviewedHeadline: "Bluedart ground pickups experienced a 36-hour delay in West hub.",
    stillToVerify: "Reroute urgent shipments to air express partner.",
  },
  {
    id: "hist-5",
    title: "Review Linen cushion return reasons",
    snippet: "Compared reported return reasons; product quality and listing details need checking.",
    source: "Returns",
    sku: "NL-CSH-008",
    messagesCount: 4,
    time: "07 Oct",
    group: "Earlier this week",
    question: "What is driving the 18% return rate on Linen cushions?",
    reviewedHeadline: "Color mismatch claims represent 65% of customer return notes.",
    stillToVerify: "Request revised batch photography from design team.",
  },
  {
    id: "hist-6",
    title: "Assess Oak side table demand",
    snippet: "Reviewed September sales and stock cover before considering replenishment.",
    source: "Product Intelligence",
    sku: "NL-TBL-003",
    messagesCount: 6,
    time: "05 Oct",
    group: "Earlier this week",
    question: "Is demand on Oak side table sufficient to justify a 200-unit PO?",
    reviewedHeadline: "Steady 4 units/day run rate with 18 days of cover remaining.",
    stillToVerify: "Supplier minimum order quantity threshold.",
  },
];

interface ConversationHistoryViewProps {
  conversations: AssistantConversation[];
  onOpenConversation: (id: string) => void;
}

export function ConversationHistoryView({ conversations, onOpenConversation }: ConversationHistoryViewProps) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All sources");
  const [dateFilter, setDateFilter] = useState("All dates");
  const [selectedId, setSelectedId] = useState<string>("hist-1");
  const [previewOpen, setPreviewOpen] = useState(true);

  // Merge real conversations from backend if available
  const allItems: MockHistoryItem[] = useMemo(() => {
    if (conversations.length === 0) return SAMPLE_HISTORY;

    const realMapped: MockHistoryItem[] = conversations.map((c, i) => ({
      id: c.id,
      title: c.title,
      snippet: `Conversation with ${c.messagesCount} message${c.messagesCount === 1 ? "" : "s"}.`,
      source: "Product Intelligence",
      messagesCount: c.messagesCount,
      time: new Date(c.lastActive).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      group: i === 0 ? "Today" : i < 3 ? "Yesterday" : "Earlier this week",
      question: c.title,
      reviewedHeadline: "Evidence and records reviewed from your commerce data.",
      stillToVerify: "Inspect source records before applying automated changes.",
    }));

    // Keep sample items as fallback if few real conversations exist
    return [...realMapped, ...SAMPLE_HISTORY.filter((s) => !realMapped.some((r) => r.id === s.id))];
  }, [conversations]);

  const filtered = useMemo(() => {
    return allItems.filter((item) => {
      if (search) {
        const q = search.toLowerCase();
        if (!item.title.toLowerCase().includes(q) && !item.snippet.toLowerCase().includes(q) && !(item.sku?.toLowerCase().includes(q))) {
          return false;
        }
      }
      if (sourceFilter !== "All sources" && item.source !== sourceFilter) {
        return false;
      }
      return true;
    });
  }, [allItems, search, sourceFilter]);

  const selectedItem = allItems.find((x) => x.id === selectedId) || allItems[0];

  const groups: Array<MockHistoryItem["group"]> = ["Today", "Yesterday", "Earlier this week"];

  return (
    <div className="flex min-h-[750px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Header bar */}
      <div className="border-b border-border p-5">
        <h2 className="text-base font-bold text-foreground">Conversation history</h2>
        <p className="text-xs text-muted-foreground">
          Find previous questions, revisit the evidence and continue a review.
        </p>

        {/* Filter Toolbar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[260px] flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations, products or SKUs..."
              className="h-9 pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Source dropdown */}
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-foreground hover:bg-muted"
              onClick={() =>
                setSourceFilter(
                  sourceFilter === "All sources"
                    ? "Product Intelligence"
                    : sourceFilter === "Product Intelligence"
                      ? "Reports"
                      : "All sources"
                )
              }
            >
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              {sourceFilter}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>

            {/* Date dropdown */}
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-foreground hover:bg-muted"
              onClick={() => setDateFilter(dateFilter === "All dates" ? "Today" : "All dates")}
            >
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              {dateFilter}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>

            {/* Sort indicator */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowUpDown className="h-3.5 w-3.5" />
              <span>Last updated</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main master-detail content */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left column: Grouped conversation list */}
        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>All conversations {filtered.length}</span>
            <span>Last updated ↓</span>
          </div>

          {groups.map((grp) => {
            const inGroup = filtered.filter((x) => x.group === grp);
            if (inGroup.length === 0) return null;
            return (
              <div key={grp} className="py-3">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span>{grp}</span>
                  <span className="text-[11px] font-normal">
                    {grp === "Today" ? "09 Oct 2026" : grp === "Yesterday" ? "08 Oct 2026" : "05–07 Oct 2026"}
                  </span>
                </div>

                <div className="mt-2 space-y-1.5">
                  {inGroup.map((item) => {
                    const active = item.id === selectedId;
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(item.id)}
                        onKeyDown={(e) => e.key === "Enter" && setSelectedId(item.id)}
                        className={cn(
                          "group flex cursor-pointer items-start justify-between rounded-lg border p-3 transition-colors",
                          active
                            ? "border-foreground bg-muted/30"
                            : "border-transparent bg-card hover:border-border hover:bg-muted/10"
                        )}
                      >
                        <div className="flex gap-3 min-w-0">
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                            <MessageSquare className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <h4 className="truncate text-xs font-semibold text-foreground">{item.title}</h4>
                            <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">{item.snippet}</p>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="font-medium text-foreground">{item.source}</span>
                              {item.sku && <span>· {item.sku}</span>}
                              <span>· {item.messagesCount} messages</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <span className="text-[11px] text-muted-foreground">{item.time}</span>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100"
                            title="More options"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right column: Conversation preview */}
        {previewOpen ? (
          <aside className="hidden flex-col overflow-y-auto border-l border-border bg-card p-5 text-xs lg:flex">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                Conversation preview
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                title="Collapse"
                onClick={() => setPreviewOpen(false)}
              >
                <PanelRightClose className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            {selectedItem && (
              <div className="mt-4 flex-1 space-y-4">
                <span className="inline-block rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                  Review only
                </span>

                <div>
                  <h3 className="text-base font-bold text-foreground">{selectedItem.title}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    09 Oct 2026 · {selectedItem.time} · {selectedItem.messagesCount} messages
                  </p>
                  <p className="text-[11px] text-muted-foreground">Started by Abhishek · You</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Source context
                  </span>
                  <p className="font-semibold text-foreground">
                    {selectedItem.sku ? `Cotton throw · ${selectedItem.sku}` : selectedItem.source}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedItem.source} · September 2026
                  </p>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Your question
                  </span>
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-foreground">
                    {selectedItem.question}
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3.5">
                  <span className="text-xs font-semibold text-foreground">What we reviewed</span>
                  <p className="text-xs font-medium text-foreground">{selectedItem.reviewedHeadline}</p>
                  {selectedItem.onHand && (
                    <div className="divide-y divide-border pt-1 text-[11px]">
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">On hand</span>
                        <span className="font-semibold text-foreground">{selectedItem.onHand}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Daily demand</span>
                        <span className="font-semibold text-foreground">{selectedItem.dailyDemand}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Stock cover / lead time</span>
                        <span className="font-semibold text-foreground">{selectedItem.stockCoverVsLeadTime}</span>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Assumes September demand continues. Incoming stock is excluded.
                  </p>
                </div>

                <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-3.5">
                  <span className="text-xs font-semibold text-foreground">Still to verify</span>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {selectedItem.stillToVerify ||
                      "Incoming stock, expected receipt dates and supplier lead time before creating a purchase order."}
                  </p>
                </div>

                <div className="pt-2">
                  <Button
                    size="sm"
                    className="w-full bg-black text-xs text-white hover:bg-neutral-800"
                    onClick={() => onOpenConversation(selectedItem.id)}
                  >
                    Open conversation
                  </Button>
                </div>
              </div>
            )}
          </aside>
        ) : (
          <div className="hidden h-full w-10 flex-col items-center border-l border-border bg-card py-4 lg:flex">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Expand Preview"
              onClick={() => setPreviewOpen(true)}
            >
              <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
            </Button>
            <span className="mt-8 -rotate-90 whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Conversation preview
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
