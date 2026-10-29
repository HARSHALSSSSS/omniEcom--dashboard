import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { isApiError, errorMessage } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useCreateView, useDeleteView, useSavedViews } from "@/hooks/useProducts";
import type { SavedView } from "@/types/product";

const NO_VIEWS_REASON = "You do not have permission to save views";

interface SavedViewsMenuProps {
  canSave: boolean;
  onApply: (view: SavedView) => void;
  onSave: () => void;
}

/** "Saved views": the user's own views and the shared ones (GET /views?screen=products); apply, delete, or save the current one */
export function SavedViewsMenu({ canSave, onApply, onSave }: SavedViewsMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const views = useSavedViews();
  const remove = useDeleteView();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onDelete = (view: SavedView) =>
    remove.mutate(view, {
      onSuccess: () => toast({ title: "View deleted", description: `"${view.name}" was removed.`, variant: "success" }),
      onError: (e) => toast({ title: "Could not delete the view", description: errorMessage(e), variant: "destructive" }),
    });

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="hover:text-[#666666] transition-colors cursor-pointer py-1 sm:py-0 min-h-[40px] sm:min-h-0 inline-flex items-center"
      >
        Saved views
      </button>

      {open && (
        <div role="menu" aria-label="Saved views" className="absolute right-0 top-[30px] z-50 w-[260px] max-w-[calc(100vw-32px)] bg-[#FFFFFF] border border-[#EAEAEA] rounded-[8px] shadow-[0px_4px_12px_rgba(0,0,0,0.08)] p-1 text-[12px]">
          <div className="px-2 py-1 text-[11px] font-medium text-[#666666] uppercase">Saved views</div>

          {views.isPending && <div className="px-2 py-2 text-[#666666]">Loading views...</div>}
          {views.isError && (
            <div className="px-2 py-2 text-[#B42318]">
              Could not load views.{" "}
              <button type="button" onClick={() => void views.refetch()} className="underline">
                Retry
              </button>
            </div>
          )}
          {views.data?.length === 0 && <div className="px-2 py-2 text-[#666666]">No saved views yet. Set filters and save them as a view.</div>}
          {views.data?.map((v) => (
            <div key={v.id} className="flex items-center gap-1 rounded-[4px] hover:bg-[#F5F5F5]">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onApply(v);
                  setOpen(false);
                }}
                className="flex-1 min-w-0 px-2 py-1.5 text-left flex flex-col"
              >
                <span className="truncate font-medium">{v.name}</span>
                {v.shared && <span className="text-[11px] text-[#666666]">{v.mine ? "Shared with the workspace" : "Shared"}</span>}
              </button>
              {v.canEdit && (
                <button
                  type="button"
                  aria-label={`Delete view ${v.name}`}
                  disabled={remove.isPending}
                  onClick={() => onDelete(v)}
                  className="p-1.5 text-[#666666] hover:text-[#B42318] disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          ))}

          <div className="h-[1px] bg-[#EAEAEA] my-1" />
          <button
            type="button"
            role="menuitem"
            disabled={!canSave}
            title={canSave ? undefined : NO_VIEWS_REASON}
            onClick={() => {
              setOpen(false);
              onSave();
            }}
            className="w-full px-2 py-1.5 rounded-[4px] text-left font-medium hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            Save current view...
          </button>
        </div>
      )}
    </div>
  );
}

interface SaveViewPopoverProps {
  /** one line per saved part: "Filters · ...", "Sort · ..." */
  lines: string[];
  filters: Record<string, unknown>;
  sort: string | null;
  onClose: () => void;
}

/** The bottom-right box that names and saves the current filters and sort (POST /views, 409 when the name is taken). */
export function SaveViewPopover({ lines, filters, sort, onClose }: SaveViewPopoverProps) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateView();
  const trimmed = name.trim();

  const save = () => {
    if (!trimmed) {
      setError("Give the view a name.");
      return;
    }
    setError(null);
    create.mutate(
      { name: trimmed, filters, sort, shared },
      {
        onSuccess: () => {
          toast({ title: "View saved", description: `"${trimmed}" is in your saved views.`, variant: "success" });
          onClose();
        },
        onError: (e) => {
          if (isApiError(e) && e.rule === "saved_view_name_taken") setError("You already have a view with this name. Choose another name.");
          else setError(errorMessage(e, "Could not save the view."));
        },
      },
    );
  };

  return (
    <div
      role="dialog"
      aria-label="Save current view"
      className="fixed bottom-4 sm:bottom-8 right-4 sm:right-8 left-4 sm:left-auto z-50 max-w-[calc(100vw-32px)] sm:w-[338px] bg-[#FFFFFF] border border-[#EAEAEA] shadow-[0px_4px_16px_rgba(0,0,0,0.12)] rounded-[8px] p-4 flex flex-col gap-4 text-xs animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="w-full flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-[#000000]">Save current view</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="text-[#666666] hover:text-[#000000] p-1">
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="w-full flex flex-col gap-1.5">
          <label htmlFor="view-name" className="text-[12px] font-medium text-[#000000]">
            View name
          </label>
          <input
            id="view-name"
            type="text"
            value={name}
            maxLength={80}
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "view-name-error" : undefined}
            placeholder="Low stock, active products"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            className="w-full h-[40px] px-3 bg-[#FFFFFF] border border-[#666666] rounded-[8px] text-[13px] text-[#000000] outline-none"
          />
          {error && (
            <p id="view-name-error" role="alert" className="text-[11px] text-[#B42318]">
              {error}
            </p>
          )}
        </div>

        <div className="w-full flex flex-col gap-1 text-[11px] text-[#666666]">
          {lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>

        <label className="flex items-center gap-2 text-[12px] text-[#000000]">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Share with everyone in this workspace
        </label>

        <div className="w-full flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 h-[32px] min-h-[44px] sm:min-h-[32px] bg-[#FFFFFF] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] rounded-[8px]">
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="px-4 h-[32px] min-h-[44px] sm:min-h-[32px] bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-[#1A1A1A] rounded-[8px] disabled:opacity-60"
          >
            {create.isPending ? "Saving..." : "Save view"}
          </button>
        </div>
      </form>
    </div>
  );
}
