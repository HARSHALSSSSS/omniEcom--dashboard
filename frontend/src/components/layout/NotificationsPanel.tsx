import { useEffect, useRef, useState } from "react";
import { useWorkspaceStore } from "@/store/workspace.store";
import { Link } from "react-router-dom";
import { Bell, Loader2, X } from "lucide-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { formatDistanceToNowStrict } from "date-fns";
import { useUiStore } from "@/store/ui.store";
import { workspaceApi, type NotificationItem } from "@/api/workspace.api";
import { refreshShell } from "@/lib/session";
import { toAppPath } from "@/lib/links";
import { errorMessage } from "@/api/errors";

const KEY = ["notifications"] as const;
/** a new notification should show up while the panel is open, without reopening it */
const PANEL_REFRESH_MS = 30_000;
const CATEGORIES = [
  { value: "", label: "All types" },
  { value: "order", label: "Orders" },
  { value: "inventory", label: "Inventory" },
  { value: "connector", label: "Marketplaces" },
  { value: "returns", label: "Returns" },
  { value: "security", label: "Team and security" },
  { value: "system", label: "System" },
] as const;
const SEVERITY_DOT: Record<NotificationItem["severity"], string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export const NotificationsPanel = () => {
  const { notificationsPanelOpen, setNotificationsPanelOpen } = useUiStore();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState("");
  // the real number of unread notifications comes from the shell (the list only holds the pages loaded so far)
  const unreadTotal = useWorkspaceStore((s) => s.shell?.badges.notifications ?? 0);

  const list = useInfiniteQuery({
    queryKey: [...KEY, { unreadOnly, category }],
    enabled: notificationsPanelOpen,
    staleTime: 15_000,
    refetchInterval: notificationsPanelOpen ? PANEL_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    initialPageParam: null as string | number | null,
    queryFn: ({ pageParam }) => workspaceApi.notifications({ before: pageParam, limit: 20, unread: unreadOnly, category: category || undefined }),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });

  // the shell refresh moves the unread total when something new arrives: bring the open list up to date at once
  const lastTotal = useRef(unreadTotal);
  useEffect(() => {
    if (lastTotal.current !== unreadTotal && notificationsPanelOpen) void list.refetch();
    lastTotal.current = unreadTotal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadTotal, notificationsPanelOpen]);

  const afterChange = async () => {
    await queryClient.invalidateQueries({ queryKey: KEY });
    await refreshShell().catch(() => undefined);
  };

  const markRead = useGuardedMutation({
    mutationFn: (ids: string[]) => workspaceApi.markRead(ids),
    onSuccess: afterChange,
    onError: (e) => setActionError(errorMessage(e)),
  });
  const markAll = useGuardedMutation({
    mutationFn: () => workspaceApi.markAllRead(),
    onSuccess: afterChange,
    onError: (e) => setActionError(errorMessage(e)),
  });

  // Escape closes the panel, and keyboard focus moves into it while it is open
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!notificationsPanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNotificationsPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [notificationsPanelOpen, setNotificationsPanelOpen]);

  if (!notificationsPanelOpen) return null;

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = unreadTotal;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-['Inter',sans-serif]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-2xs transition-opacity"
        onClick={() => setNotificationsPanelOpen(false)}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Notifications" tabIndex={-1} className="w-screen max-w-[390px] bg-white border-l border-[#EAEAEA] shadow-2xl flex flex-col outline-none">
          {/* Header */}
          <div className="h-16 px-5 border-b border-[#EAEAEA] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#000000]" />
              <h2 className="text-[14px] font-semibold text-[#000000]">
                Notifications
              </h2>
              {unread > 0 && (
                <span className="text-[11px] font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
                  {unread} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                  className="text-[11px] font-medium text-[#666666] hover:text-black disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setNotificationsPanelOpen(false)}
                className="text-neutral-400 hover:text-black transition-colors p-1"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-[#EAEAEA] px-5 py-2">
            <div role="tablist" aria-label="Show" className="flex rounded-md border border-[#EAEAEA] p-0.5 text-[11px]">
              {[{ id: false, label: "All" }, { id: true, label: "Unread" }].map((o) => (
                <button key={String(o.id)} type="button" role="tab" aria-selected={unreadOnly === o.id} onClick={() => setUnreadOnly(o.id)} className={`rounded px-2.5 py-1 font-medium ${unreadOnly === o.id ? "bg-black text-white" : "text-[#666666] hover:text-black"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <select aria-label="Type" value={category} onChange={(e) => setCategory(e.target.value)} className="ml-auto rounded-md border border-[#EAEAEA] bg-white px-2 py-1 text-[11px] text-[#444444]">
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {actionError && (
            <div role="alert" className="border-b border-red-200 bg-red-50 px-5 py-2 text-[11px] text-red-700">
              {actionError}
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#EAEAEA]">
            {list.isLoading && (
              <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-[#666666]">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            )}
            {list.isError && (
              <div className="py-12 px-5 text-center text-[12px] text-red-700">
                {errorMessage(list.error)}{" "}
                <button type="button" className="underline" onClick={() => list.refetch()}>
                  Retry
                </button>
              </div>
            )}
            {list.isSuccess && items.length === 0 && (
              <div className="py-12 text-center text-[12px] text-[#666666]">{unreadOnly || category ? "Nothing matches these filters." : "You are all caught up."}</div>
            )}
            {items.map((n) => (
              <div
                key={n.id}
                className={`p-4 flex flex-col gap-1.5 transition-colors hover:bg-neutral-50 ${
                  !n.read ? "bg-blue-50/20" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-start gap-2 text-[12px] font-semibold text-[#000000] leading-snug">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[n.severity] ?? "bg-blue-500"}`} />
                    {n.title}
                  </span>
                  <span className="text-[10px] text-[#888888] shrink-0">
                    {formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {n.body && (
                  <p className="text-[12px] text-[#555555] leading-relaxed">
                    {n.body}
                  </p>
                )}

                <div className="flex items-center gap-4 pt-1">
                  {n.actionUrl && (
                    <Link
                      to={toAppPath(n.actionUrl)}
                      onClick={() => {
                        if (!n.read) markRead.mutate([n.id]);
                        setNotificationsPanelOpen(false);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
                    >
                      Take action →
                    </Link>
                  )}
                  {!n.read && (
                    <button
                      type="button"
                      onClick={() => markRead.mutate([n.id])}
                      className="text-[11px] text-[#666666] hover:text-black"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            ))}
            {list.hasNextPage && (
              <button
                type="button"
                onClick={() => list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
                className="w-full py-3 text-[11px] font-medium text-[#666666] hover:text-black disabled:opacity-60"
              >
                {list.isFetchingNextPage ? "Loading..." : "Load older"}
              </button>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-[#EAEAEA] bg-neutral-50 text-center">
            <Link
              to="/settings/notifications"
              onClick={() => setNotificationsPanelOpen(false)}
              className="text-[11px] font-medium text-[#666666] hover:text-black"
            >
              Manage alert preferences in Settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
