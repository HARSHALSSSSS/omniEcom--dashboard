import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationList, useDeleteConversation, useRenameConversation, useSetConversationStatus } from "@/hooks/useAssistant";
import { toast } from "@/hooks/useToast";
import { cn } from "@/utils/cn";
import { formatRelativeTime } from "@/utils/format";
import { TITLE_MAX } from "./assistantFormat";
import type { AssistantConversation, ConversationFilter } from "@/types/assistant";

interface ConversationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  /** the open conversation was deleted or archived out of the current view */
  onGone: (id: string) => void;
  disabled?: boolean;
}

const FILTERS: Array<{ value: ConversationFilter; label: string }> = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

function RenameDialog({ target, onClose }: { target: AssistantConversation | null; onClose: () => void }) {
  const rename = useRenameConversation();
  const [title, setTitle] = useState("");
  useEffect(() => {
    if (target) setTitle(target.title);
  }, [target]);
  const trimmed = title.trim();
  const invalid = trimmed.length === 0 || trimmed.length > TITLE_MAX;
  const submit = () => {
    if (!target || invalid) return;
    if (trimmed === target.title) return onClose();
    rename.mutate(
      { id: target.id, title: trimmed },
      {
        onSuccess: () => {
          toast({ title: "Conversation renamed", variant: "success" });
          onClose();
        },
        onError: (e) => toast({ title: "Could not rename", description: errorMessage(e), variant: "destructive" }),
      },
    );
  };
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>Give it a name you will recognise later (up to {TITLE_MAX} characters).</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-1.5">
            <label htmlFor="conversation-title" className="text-xs font-medium text-foreground">
              Title
            </label>
            <Input id="conversation-title" value={title} maxLength={TITLE_MAX} autoFocus onChange={(e) => setTitle(e.target.value)} error={title.length > 0 && invalid} />
          </div>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={rename.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={invalid} loading={rename.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConversationList({ selectedId, onSelect, onNew, onGone, disabled }: ConversationListProps) {
  const [filter, setFilter] = useState<ConversationFilter>("active");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [renaming, setRenaming] = useState<AssistantConversation | null>(null);
  const [deleting, setDeleting] = useState<AssistantConversation | null>(null);
  const list = useConversationList({ status: filter, q }, true);
  const setStatus = useSetConversationStatus();
  const remove = useDeleteConversation();

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  const toggleArchive = (c: AssistantConversation) => {
    const status = c.status === "active" ? "archived" : "active";
    setStatus.mutate(
      { id: c.id, status },
      {
        onSuccess: () => {
          toast({ title: status === "archived" ? "Conversation archived" : "Conversation restored", variant: "success" });
          if (status === "archived" && filter === "active") onGone(c.id);
        },
        onError: (e) => toast({ title: "Could not update the conversation", description: errorMessage(e), variant: "destructive" }),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const id = deleting.id;
    remove.mutate(id, {
      onSuccess: () => {
        toast({ title: "Conversation deleted", variant: "success" });
        setDeleting(null);
        onGone(id);
      },
      onError: (e) => {
        setDeleting(null);
        toast({ title: "Could not delete the conversation", description: errorMessage(e), variant: "destructive" });
      },
    });
  };

  return (
    <section aria-label="Conversations" className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-card p-3.5 sm:p-5">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          Conversations
          {list.data && <span className="font-normal text-muted-foreground">{total}</span>}
        </h2>
        <Button size="sm" variant="outline" className="h-7 min-h-[32px] sm:min-h-0 gap-1 px-2 text-[11px]" disabled={disabled} onClick={onNew}>
          <Plus className="h-3 w-3" aria-hidden />
          New
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input aria-label="Search conversations" placeholder="Search by title" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs flex-1 min-w-0" maxLength={100} />
        <select aria-label="Show conversations" value={filter} onChange={(e) => setFilter(e.target.value as ConversationFilter)} className="h-8 rounded-md border border-border bg-card px-2 text-xs w-full sm:w-auto shrink-0">
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {list.isLoading && (
        <div role="status" aria-label="Loading conversations" className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {list.isError && (
        <div role="alert" className="space-y-2 text-xs text-muted-foreground">
          <p>Conversations could not be loaded. {errorMessage(list.error)}</p>
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!list.isLoading && !list.isError && items.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {q ? `No conversation matches "${q}".` : filter === "archived" ? "No archived conversations." : "No conversations yet. Ask a question to start one."}
        </p>
      )}

      {items.length > 0 && (
        <ul className="-mx-2 min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {items.map((c) => {
            const selected = c.id === selectedId;
            return (
              <li key={c.id} className={cn("group flex items-center gap-1 rounded px-2 py-2", selected ? "bg-muted" : "hover:bg-muted/50")}>
                <button type="button" disabled={disabled} onClick={() => onSelect(c.id)} aria-current={selected ? "true" : undefined} className="flex min-w-0 flex-1 flex-col text-left disabled:cursor-not-allowed">
                  <span className="truncate text-xs font-medium text-foreground">{c.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatRelativeTime(c.lastActive)} &middot; {c.messagesCount} {c.messagesCount === 1 ? "message" : "messages"}
                    {c.status === "archived" && " · archived"}
                  </span>
                </button>
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="icon-sm" className="min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0" aria-label={`Rename ${c.title}`} onClick={() => setRenaming(c)}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon-sm" className="min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0" aria-label={`${c.status === "active" ? "Archive" : "Restore"} ${c.title}`} disabled={setStatus.isPending} onClick={() => toggleArchive(c)}>
                    {c.status === "active" ? <Archive className="h-3.5 w-3.5" aria-hidden /> : <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />}
                  </Button>
                  <Button variant="ghost" size="icon-sm" className="min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0" aria-label={`Delete ${c.title}`} onClick={() => setDeleting(c)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {list.hasNextPage && (
        <Button variant="outline" size="sm" className="text-xs" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          Show more
        </Button>
      )}

      <RenameDialog target={renaming} onClose={() => setRenaming(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this conversation?"
        description={deleting ? `"${deleting.title}" and its ${deleting.messagesCount} messages will be deleted for good. This cannot be undone.` : ""}
        confirmText="Delete conversation"
        variant="destructive"
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
