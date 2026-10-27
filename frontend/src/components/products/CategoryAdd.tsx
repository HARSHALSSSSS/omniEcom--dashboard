import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { productCreationApi } from "@/api/productCreation.api";
import { errorMessage, isApiError } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useSubmitLock } from "@/hooks/useSubmitGuard";
import { toast } from "@/hooks/useToast";
import { ghostButton, linkButton, outlineButton } from "@/components/products/create/fieldStyles";

export interface CategoryChoice {
  id: string;
  /** the label with its indent */
  label: string;
}

interface Props {
  /** every category, in tree order, for the optional parent */
  choices: CategoryChoice[];
  disabled?: boolean;
  /** the new category was created: select it */
  onCreated: (id: string) => void;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** every list that shows categories re-reads after one was added (the create form, the edit form, the Products screens) */
export function useRefreshCategories() {
  const qc = useQueryClient();
  return () => {
    for (const queryKey of [["productCreation", "categories"], ["product-edit", "categories"], ["products", "categories"], ["promotions"]] as const) void qc.invalidateQueries({ queryKey });
  };
}

/** a small inline "Add category" (name and an optional parent), the same pattern as adding a brand from the product form */
export function CategoryAdd({ choices, disabled, onCreated }: Props) {
  const canWrite = useCan("categories:write");
  const refresh = useRefreshCategories();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const acquire = useSubmitLock();

  if (!canWrite || disabled) return null;

  const reset = () => {
    setOpen(false);
    setName("");
    setParentId("");
    setProblem(null);
  };

  const create = async () => {
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean) return setProblem("Enter a category name.");
    if (clean.length > 120) return setProblem("A category name is at most 120 characters.");
    const clash = choices.find((c) => norm(c.label.replace(/^[^\p{L}\p{N}]+/u, "")) === norm(clean));
    if (clash && !parentId) return setProblem("A category with this name already exists. Pick it from the list.");
    const release = acquire();
    if (!release) return;
    setBusy(true);
    setProblem(null);
    try {
      const created = await productCreationApi.createCategory({ name: clean, parentId: parentId || null });
      refresh();
      onCreated(created.id);
      toast({ title: "Category added", description: `${created.name} is ready to use.`, variant: "success" });
      reset();
    } catch (e) {
      setProblem(isApiError(e) && e.status === 409 ? "A category with this name already exists there." : errorMessage(e, "Could not add the category."));
    } finally {
      setBusy(false);
      release();
    }
  };

  if (!open) {
    return (
      <button type="button" className={linkButton} onClick={() => setOpen(true)}>
        Add category
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#E5E5E5] p-3" role="group" aria-label="Add category">
      <input
        aria-label="New category name"
        value={name}
        maxLength={120}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void create();
          }
        }}
        placeholder="Category name"
        className="h-9 rounded-md border border-[#E5E5E5] px-3 text-[13px]"
      />
      <select aria-label="Parent category (optional)" value={parentId} onChange={(e) => setParentId(e.target.value)} className="h-9 rounded-md border border-[#E5E5E5] px-2 text-[13px]">
        <option value="">Top level (no parent)</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      {problem && (
        <span role="alert" className="text-[11px] text-red-700">
          {problem}
        </span>
      )}
      <div className="flex gap-2">
        <button type="button" className={outlineButton} disabled={busy} onClick={() => void create()}>
          {busy ? "Adding..." : "Add"}
        </button>
        <button type="button" className={ghostButton} disabled={busy} onClick={reset}>
          Cancel
        </button>
      </div>
    </div>
  );
}
