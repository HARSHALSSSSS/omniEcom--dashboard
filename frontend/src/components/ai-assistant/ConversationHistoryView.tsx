import { useMemo, useState } from "react";
import { Calendar, Layers, MessageSquare, PanelRightClose, PanelRightOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/pricing/PricingStates";
import { dateKeyInZone } from "@/components/reports/overviewRange";
import { useConversationDetail } from "@/hooks/useAssistant";
import { errorMessage } from "@/api/errors";
import { cn } from "@/utils/cn";
import { CONTEXT_SOURCES, type AssistantConversation, type ContextSource } from "@/types/assistant";
import { SOURCE_LABELS } from "./assistantFormat";

const DATE_FILTERS = [
  { id: "all", label: "All dates", days: null },
  { id: "today", label: "Today", days: 0 },
  { id: "week", label: "Last 7 days", days: 6 },
  { id: "month", label: "Last 30 days", days: 29 },
] as const;
type DateFilterId = (typeof DATE_FILTERS)[number]["id"];

const dayNumber = (key: string) => Date.parse(`${key}T00:00:00Z`) / 86_400_000;

interface ConversationHistoryViewProps {
  /** the real conversations, newest first (one list, fetched by the page) */
  conversations: AssistantConversation[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** the source filter is applied by the server, so the page owns it */
  source: ContextSource | "all";
  onSourceChange: (s: ContextSource | "all") => void;
  /** the business time zone: the days are its days, not the browser's */
  timezone: string;
  onOpenConversation: (id: string) => void;
}

/** the conversations the business really had, grouped by the day they were last active in the business time zone */
export function ConversationHistoryView({ conversations, loading = false, error = null, onRetry, hasMore = false, loadingMore = false, onLoadMore, source, onSourceChange, timezone, onOpenConversation }: ConversationHistoryViewProps) {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterId>("all");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);

  const todayKey = dateKeyInZone(new Date(), timezone);
  const dayLabel = (key: string) => {
    const diff = dayNumber(todayKey) - dayNumber(key);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${key}T00:00:00Z`));
  };
  const timeLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const span = (DATE_FILTERS.find((d) => d.id === dateFilter) ?? DATE_FILTERS[0]).days;
    return conversations.filter((c) => {
      if (q && !c.title.toLowerCase().includes(q) && !(c.context?.sku ?? "").toLowerCase().includes(q)) return false;
      if (span !== null && dayNumber(todayKey) - dayNumber(dateKeyInZone(new Date(c.lastActive), timezone)) > span) return false;
      return true;
    });
  }, [conversations, search, dateFilter, todayKey, timezone]);

  const groups = useMemo(() => {
    const byDay = new Map<string, AssistantConversation[]>();
    for (const c of filtered) {
      const key = dateKeyInZone(new Date(c.lastActive), timezone);
      byDay.set(key, [...(byDay.get(key) ?? []), c]);
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered, timezone]);

  const selected = filtered.find((c) => c.id === pickedId) ?? filtered[0] ?? null;
  const detail = useConversationDetail(selected?.id ?? null);
  const firstQuestion = detail.data?.messages.find((m) => m.role === "user")?.content;
  const lastAnswer = [...(detail.data?.messages ?? [])].reverse().find((m) => m.role === "assistant")?.content;
  const filtering = Boolean(search.trim()) || dateFilter !== "all" || source !== "all";

  return (
    <div className="flex min-h-[750px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-5">
        <h2 className="text-base font-bold text-foreground">Conversation history</h2>
        <p className="text-xs text-muted-foreground">Find previous questions and continue where you left off.</p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[260px] max-w-md flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations, products or SKUs..." aria-label="Search conversations" className="h-9 pl-9 text-xs" />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <select aria-label="Source" value={source} onChange={(e) => onSourceChange(e.target.value as ContextSource | "all")} className="bg-transparent text-foreground outline-none">
                <option value="all">All sources</option>
                {CONTEXT_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <select aria-label="Date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilterId)} className="bg-transparent text-foreground outline-none">
                {DATE_FILTERS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error && conversations.length === 0 ? (
            <LoadError what="The conversation history" message={errorMessage(error)} onRetry={onRetry ?? (() => undefined)} />
          ) : loading && conversations.length === 0 ? (
            <div role="status" aria-label="Loading conversations" className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="space-y-1 py-16 text-center text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">{filtering ? "No conversations match." : "No conversations yet."}</p>
              <p>{filtering ? "Change the search or the filters." : "Ask the assistant a question and it will be kept here."}</p>
            </div>
          ) : (
            <>
              <div className="mb-2 text-xs text-muted-foreground">
                {filtered.length} conversation{filtered.length === 1 ? "" : "s"}
                {hasMore ? " loaded" : ""}
              </div>
              {groups.map(([key, items]) => (
                <div key={key} className="py-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span>{dayLabel(key)}</span>
                    <span className="text-[11px] font-normal">{key}</span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {items.map((c) => {
                      const active = c.id === selected?.id;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => setPickedId(c.id)}
                            className={cn("flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors", active ? "border-foreground bg-muted/30" : "border-transparent bg-card hover:border-border hover:bg-muted/10")}
                          >
                            <span className="flex min-w-0 gap-3">
                              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                              </span>
                              <span className="min-w-0 space-y-1">
                                <span className="block truncate text-xs font-semibold text-foreground">{c.title}</span>
                                <span className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                  {c.context?.source && <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">{SOURCE_LABELS[c.context.source]}</span>}
                                  {c.context?.sku && <span className="font-mono">{c.context.sku}</span>}
                                  <span>
                                    {c.messagesCount} message{c.messagesCount === 1 ? "" : "s"}
                                  </span>
                                  {c.status === "archived" && <span>Archived</span>}
                                </span>
                              </span>
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{timeLabel(c.lastActive)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {hasMore && (
                <div className="py-3 text-center">
                  <Button size="sm" variant="outline" className="text-xs" disabled={loadingMore} onClick={onLoadMore}>
                    {loadingMore ? "Loading..." : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {previewOpen ? (
          <aside className="hidden flex-col overflow-y-auto border-l border-border bg-card p-5 text-xs lg:flex">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">Conversation preview</span>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Collapse" onClick={() => setPreviewOpen(false)}>
                <PanelRightClose className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            {selected ? (
              <div className="mt-4 flex-1 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">{selected.title}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {dateKeyInZone(new Date(selected.lastActive), timezone)} · {timeLabel(selected.lastActive)} · {selected.messagesCount} message{selected.messagesCount === 1 ? "" : "s"}
                  </p>
                </div>

                {(selected.context?.source || selected.context?.sku) && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Started from</span>
                    <p className="font-semibold text-foreground">{[selected.context.source ? SOURCE_LABELS[selected.context.source] : null, selected.context.sku].filter(Boolean).join(" · ")}</p>
                  </div>
                )}

                {detail.isLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : detail.isError ? (
                  <p role="alert" className="text-rose-700">
                    {errorMessage(detail.error)}
                  </p>
                ) : (
                  <>
                    {firstQuestion && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">First question</span>
                        <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-foreground">{firstQuestion}</div>
                      </div>
                    )}
                    {lastAnswer && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Last answer</span>
                        <p className="line-clamp-6 whitespace-pre-line leading-relaxed text-muted-foreground">{lastAnswer}</p>
                      </div>
                    )}
                    {!firstQuestion && <p className="text-muted-foreground">No messages in this conversation yet.</p>}
                  </>
                )}
                {/* The earlier "Still to verify" box had no source, so it is left out until answers carry open questions. */}

                <div className="pt-2">
                  <Button size="sm" className="w-full text-xs" onClick={() => onOpenConversation(selected.id)}>
                    Open conversation
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-muted-foreground">Select a conversation to preview it.</p>
            )}
          </aside>
        ) : (
          <div className="hidden h-full w-10 flex-col items-center border-l border-border bg-card py-4 lg:flex">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Expand Preview" onClick={() => setPreviewOpen(true)}>
              <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
            </Button>
            <span className="mt-8 -rotate-90 whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Conversation preview</span>
          </div>
        )}
      </div>
    </div>
  );
}
