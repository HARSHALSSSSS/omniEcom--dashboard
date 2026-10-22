import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Trash2 } from "lucide-react";
import { errorMessage, isApiError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/useToast";
import { useCreateInventoryPreset, useDeleteInventoryPreset, useInventoryPresets } from "@/hooks/useInventory";
import { cn } from "@/utils/cn";
import { filterBody, type InventoryFilters, type InventoryPreset } from "@/types/inventory";
import { describeFilters, isActivePreset, presetToPatch, type Patch } from "./inventoryParams";
import { NO_VIEWS_REASON } from "./inventoryLabels";

const BUTTON = "h-[36px] px-3 flex flex-row items-center gap-2 bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shadow-2xs";

interface SavedFiltersProps {
  filters: InventoryFilters;
  sort: string;
  update: (patch: Patch) => void;
  canSave: boolean;
  /** opens the "Save view" dialog */
  onSave: () => void;
  /** names of the warehouses and channels, for the one-line summary of a preset */
  nameOf: (kind: "warehouse" | "channel", id: string) => string;
}

/** "Saved filters": the filter presets of this screen (GET /views?screen=inventory). Pick one to apply the whole filter state and sort; delete your own. */
export function SavedFilters({ filters, sort, update, canSave, onSave, nameOf }: SavedFiltersProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const presets = useInventoryPresets();
  const remove = useDeleteInventoryPreset();
  const active = presets.data?.find((p) => isActivePreset(p, filters, sort));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apply = (p: InventoryPreset) => {
    update(presetToPatch(p));
    setOpen(false);
  };
  const onDelete = (p: InventoryPreset) =>
    remove.mutate(p.id, {
      onSuccess: () => toast({ title: "Saved filter deleted", description: `"${p.name}" was removed.`, variant: "success" }),
      onError: (e) => toast({ title: "Could not delete the saved filter", description: errorMessage(e), variant: "destructive" }),
    });

  return (
    <div className="relative" ref={root}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn(BUTTON, active && "border-[#111111]")}>
        <ChevronDown className="h-3.5 w-3.5 stroke-[1.75px] text-[#888888]" aria-hidden />
        <span className="text-[13px] text-[#111111]">{active ? `Saved filters: ${active.name}` : "Saved filters"}</span>
      </button>

      {open && (
        <div role="menu" aria-label="Saved filters" className="absolute left-0 top-[40px] z-30 w-[300px] rounded-lg border border-[#EAEAEA] bg-white p-1 text-[12px] shadow-[0px_4px_12px_rgba(0,0,0,0.08)]">
          {presets.isPending && <div className="px-2 py-2 text-[#666666]">Loading saved filters...</div>}
          {presets.isError && (
            <div className="px-2 py-2 text-[#B42318]">
              Could not load the saved filters.{" "}
              <button type="button" onClick={() => void presets.refetch()} className="cursor-pointer underline">
                Retry
              </button>
            </div>
          )}
          {presets.data?.length === 0 && <div className="px-2 py-2 text-[#666666]">No saved filters yet. Set the filters you use most and save them.</div>}
          {presets.data?.map((p) => {
            const lines = describeFilters(p.filters, nameOf);
            return (
              <div key={p.id} className="flex items-center gap-1 rounded hover:bg-[#F5F5F5]">
                <button type="button" role="menuitem" onClick={() => apply(p)} className="flex min-w-0 flex-1 cursor-pointer flex-col border-none bg-transparent px-2 py-1.5 text-left">
                  <span className="flex items-center gap-1.5 truncate font-medium text-[#000000]">
                    {p.name}
                    {active?.id === p.id && <Check className="h-3 w-3 shrink-0 text-[#16A34A]" aria-label="Applied" />}
                  </span>
                  <span className="truncate text-[11px] text-[#666666]">
                    {lines.length ? lines.join(" · ") : "All products"}
                    {p.shared ? (p.mine ? " · Shared with the workspace" : " · Shared") : ""}
                  </span>
                </button>
                {p.canEdit && (
                  <button
                    type="button"
                    aria-label={`Delete saved filter ${p.name}`}
                    disabled={remove.isPending}
                    onClick={() => onDelete(p)}
                    className="cursor-pointer border-none bg-transparent p-1.5 text-[#666666] hover:text-[#B42318] disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            );
          })}
          <div className="my-1 h-[1px] bg-[#EAEAEA]" />
          <button
            type="button"
            role="menuitem"
            disabled={!canSave}
            title={canSave ? undefined : NO_VIEWS_REASON}
            onClick={() => {
              setOpen(false);
              onSave();
            }}
            className="w-full cursor-pointer rounded border-none bg-transparent px-2 py-1.5 text-left font-medium text-[#000000] hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            Save current filters...
          </button>
        </div>
      )}
    </div>
  );
}

interface SaveViewDialogProps {
  open: boolean;
  filters: InventoryFilters;
  sort: string;
  nameOf: SavedFiltersProps["nameOf"];
  onClose: () => void;
}

/** "Save view": names the whole current filter state and sort and keeps it as a saved filter (POST /views, 409 when the name is taken) */
export function SaveViewDialog({ open, filters, sort, nameOf, onClose }: SaveViewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">{open && <SaveViewForm filters={filters} sort={sort} nameOf={nameOf} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function SaveViewForm({ filters, sort, nameOf, onClose }: Omit<SaveViewDialogProps, "open">) {
  const create = useCreateInventoryPreset();
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = describeFilters(filterBody(filters), nameOf);
  const trimmed = name.trim();

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!trimmed) {
      setError("Give the saved filter a name.");
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({ name: trimmed, filters: filterBody(filters), sort: sort || null, shared });
      toast({ title: "View saved", description: `"${trimmed}" is in your saved filters.`, variant: "success" });
      onClose();
    } catch (e) {
      if (isApiError(e) && e.rule === "saved_view_name_taken") setError("You already have a saved filter with this name. Choose another name.");
      else setError(errorMessage(e, "The view could not be saved."));
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <DialogHeader>
        <DialogTitle>Save view</DialogTitle>
        <DialogDescription>Keeps the filters and the sort you have set now, so you can bring them back from Saved filters.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1">
        <label htmlFor="save-view-name" className="text-xs font-semibold">
          View name
        </label>
        <Input id="save-view-name" value={name} maxLength={80} autoFocus autoComplete="off" aria-invalid={error ? true : undefined} placeholder="Low stock in Delhi" onChange={(e) => { setName(e.target.value); setError(null); }} className="text-xs" />
        {error && (
          <p role="alert" className="m-0 text-[11px] text-[#B42318]">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1 text-[11px] text-[#666666]">
        <div>Filters · {lines.length ? lines.join(", ") : "none (all products)"}</div>
        <div>Sort · {sort || "Most urgent first"}</div>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-[#000000]">
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="accent-black" />
        Share with everyone in this workspace
      </label>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" size="sm" disabled={create.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={create.isPending} disabled={trimmed === ""}>
          Save view
        </Button>
      </DialogFooter>
    </form>
  );
}
