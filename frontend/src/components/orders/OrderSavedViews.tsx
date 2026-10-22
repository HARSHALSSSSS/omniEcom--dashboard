import { useEffect, useRef, useState } from "react";
import { Bookmark, ChevronDown, X } from "lucide-react";
import { errorMessage, isApiError } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useCreateOrderView, useDeleteOrderView, useOrderViews } from "@/hooks/useOrders";
import { toast } from "@/hooks/useToast";
import type { OrderFilters, OrderSavedView, OrderSort } from "@/types/orders";
import { describeFilters, viewFiltersOf } from "./orderParams";

const NO_VIEWS_REASON = "Your role cannot save views.";

interface OrderSavedViewsProps {
  filters: OrderFilters;
  sort: OrderSort;
  channelName: (code: string) => string;
  onApply: (view: OrderSavedView) => void;
}

/** "Saved views": the person's own views and the shared ones (GET /views?screen=orders); apply, delete, or save the current filters and sort */
export function OrderSavedViews({ filters, sort, channelName, onApply }: OrderSavedViewsProps) {
  const canSave = useCan("views:write");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const views = useOrderViews();
  const remove = useDeleteOrderView();

  useEffect(() => {
    if (!open && !saving) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSaving(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, saving]);

  const onDelete = (view: OrderSavedView) =>
    remove.mutate(view, {
      onSuccess: () => toast({ title: "View deleted", description: `"${view.name}" was removed.`, variant: "success" }),
      onError: (e) => toast({ title: "Could not delete the view", description: errorMessage(e), variant: "destructive" }),
    });

  const savedFilters = viewFiltersOf(filters);
  const lines = describeFilters({ ...filters, tab: undefined }, channelName);

  return (
    <div className="relative shrink-0" ref={root}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setSaving(false);
          setOpen((o) => !o);
        }}
        className="box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
      >
        <Bookmark className="w-[14px] h-[14px] text-[#666666] stroke-[1.5px]" aria-hidden />
        <span className="text-[12px] font-normal leading-[145%] text-[#666666]">Saved views</span>
        <ChevronDown className="w-3 h-3 text-[#666666] stroke-[1.5px]" aria-hidden />
      </button>

      {open && (
        <div role="menu" aria-label="Saved views" className="absolute left-0 top-[36px] z-30 w-[260px] bg-white border border-[#EAEAEA] rounded-lg shadow-[0px_4px_12px_rgba(0,0,0,0.08)] p-1 text-[12px]">
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
            <div key={v.id} className="flex items-center gap-1 rounded hover:bg-[#F5F5F5]">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onApply(v);
                  setOpen(false);
                }}
                className="flex-1 min-w-0 px-2 py-1.5 text-left flex flex-col cursor-pointer"
              >
                <span className="truncate font-medium text-[#000000]">{v.name}</span>
                {v.shared && <span className="text-[11px] text-[#666666]">{v.mine ? "Shared with the workspace" : "Shared"}</span>}
              </button>
              {v.canEdit && (
                <button
                  type="button"
                  aria-label={`Delete view ${v.name}`}
                  disabled={remove.isPending}
                  onClick={() => onDelete(v)}
                  className="p-1.5 text-[#666666] hover:text-[#B42318] disabled:opacity-50 cursor-pointer"
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
              setSaving(true);
            }}
            className="w-full px-2 py-1.5 rounded text-left font-medium text-[#000000] hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent cursor-pointer"
          >
            Save current view...
          </button>
        </div>
      )}

      {saving && <SaveViewForm filters={savedFilters} sort={sort} lines={lines} onClose={() => setSaving(false)} />}
    </div>
  );
}

interface SaveViewFormProps {
  filters: Record<string, unknown>;
  sort: OrderSort;
  lines: string[];
  onClose: () => void;
}

/** names and saves the current filters and sort (POST /views, 409 when the name is taken) */
function SaveViewForm({ filters, sort, lines, onClose }: SaveViewFormProps) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateOrderView();
  const trimmed = name.trim();

  const save = () => {
    if (!trimmed) {
      setError("Give the view a name.");
      return;
    }
    setError(null);
    create.mutate(
      { name: trimmed, filters, sort: sort === "-placedAt" ? null : sort, shared },
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
    <form
      role="dialog"
      aria-label="Save current view"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="absolute left-0 top-[36px] z-30 w-[300px] bg-white border border-[#EAEAEA] shadow-[0px_4px_16px_rgba(0,0,0,0.12)] rounded-lg p-4 flex flex-col gap-3 text-[12px]"
    >
      <h3 className="text-[13px] font-semibold text-[#000000]">Save current view</h3>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="order-view-name" className="text-[12px] font-medium text-[#000000]">
          View name
        </label>
        <input
          id="order-view-name"
          type="text"
          value={name}
          maxLength={80}
          autoFocus
          aria-invalid={error ? true : undefined}
          placeholder="SLA risk on Amazon"
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          className="w-full h-[36px] px-3 bg-white border border-[#666666] rounded-lg text-[13px] text-[#000000] outline-none"
        />
        {error && (
          <p role="alert" className="text-[11px] text-[#B42318]">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1 text-[11px] text-[#666666]">
        <div>Filters · {lines.length ? lines.join(", ") : "none"}</div>
        <div>Sort · {sort}</div>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-[#000000]">
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        Share with everyone in this workspace
      </label>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 h-[30px] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] rounded-lg cursor-pointer">
          Cancel
        </button>
        <button type="submit" disabled={create.isPending} className="px-3 h-[30px] bg-[#000000] text-[12px] font-semibold text-white hover:bg-[#1A1A1A] rounded-lg disabled:opacity-60 cursor-pointer">
          {create.isPending ? "Saving..." : "Save view"}
        </button>
      </div>
    </form>
  );
}
