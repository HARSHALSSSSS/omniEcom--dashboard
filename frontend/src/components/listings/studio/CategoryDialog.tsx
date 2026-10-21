import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategorySearch, useDebounced } from "@/hooks/useListingStudio";
import { errorMessage } from "@/api/errors";

interface Props {
  open: boolean;
  accountId: string;
  marketplaceName: string;
  busy: boolean;
  onClose: () => void;
  onPick: (marketplaceCategoryId: string) => void;
}

/** choose a category of the marketplace tree (live search through the connector) */
export function CategoryDialog({ open, accountId, marketplaceName, busy, onClose, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const q = useDebounced(query.trim(), 300);
  const search = useCategorySearch(accountId, q, open);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a {marketplaceName} category</DialogTitle>
          <DialogDescription>Pick the most specific category. The attributes the marketplace requires depend on it.</DialogDescription>
        </DialogHeader>
        <Input aria-label="Search categories" placeholder="Search categories" value={query} onChange={(e) => setQuery(e.target.value)} className="text-sm" />
        <div className="max-h-72 overflow-y-auto rounded-md border border-border" aria-busy={search.isFetching}>
          {search.isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : search.isError ? (
            <div role="alert" className="space-y-2 p-4 text-xs text-destructive">
              <p>{errorMessage(search.error, "Could not load the categories.")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void search.refetch()}>
                Retry
              </Button>
            </div>
          ) : (search.data ?? []).length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">{q ? "No category matches your search." : "Type to search the category tree."}</p>
          ) : (
            <ul role="listbox" aria-label="Categories" className="divide-y divide-border">
              {(search.data ?? []).map((c) => (
                <li key={c.id} role="option" aria-selected={chosen === c.id} aria-disabled={!c.leaf}>
                  <button
                    type="button"
                    disabled={!c.leaf}
                    title={c.leaf ? undefined : "Choose a more specific category inside this one"}
                    onClick={() => setChosen(c.id)}
                    className={`flex w-full flex-col px-3 py-2 text-left text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 ${chosen === c.id ? "bg-muted" : ""}`}
                  >
                    <span className="font-medium text-foreground">{c.name}</span>
                    {c.path && <span className="text-[11px] text-muted-foreground">{c.path}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!chosen} loading={busy} onClick={() => chosen && onPick(chosen)}>
            Use this category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
