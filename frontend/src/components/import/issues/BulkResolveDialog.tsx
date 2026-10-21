import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CategoryOption } from "@/hooks/useProducts";
import type { BulkResolveInput, BulkResult } from "@/types/import";
import { Alert } from "../ImportStates";
import { codeLabel, importErrorMessage, num } from "../importFormat";
import type { BulkRequest } from "./IssueDetail";

interface Props {
  request: BulkRequest | null;
  categories: CategoryOption[];
  onSubmit: (input: BulkResolveInput) => Promise<BulkResult>;
  onClose: () => void;
}

/** Applies one decision to every open issue of a kind, then lists what was applied and what was left out and why. */
export function BulkResolveDialog({ request, categories, onSubmit, onClose }: Props) {
  const [value, setValue] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);

  useEffect(() => {
    setValue("");
    setCategoryId("");
    setError(null);
    setResult(null);
    setBusy(false);
  }, [request]);

  const isCategory = request?.code === "category_unmapped";
  const customValue = isCategory ? categoryId : value.trim();
  const missingValue = Boolean(request?.needsValue) && !customValue;

  const run = async () => {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await onSubmit({ code: request.code, action: request.action, customValue: request.needsValue ? customValue : undefined, sourceValue: request.sourceValue }));
    } catch (e) {
      setError(importErrorMessage(e, "The change could not be applied."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{result ? "Done" : "Change many issues at once"}</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground">
            {result ? `${codeLabel(request?.code ?? "")}: ${num(result.applied)} of ${num(result.matched)} issues were changed.` : request?.label}
          </DialogDescription>
        </DialogHeader>

        {!result && request?.needsValue && (
          <div className="space-y-2">
            {isCategory ? (
              <select aria-label="Category" className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Select one of your categories…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <input aria-label="New value" className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs" placeholder="New value" value={value} onChange={(e) => setValue(e.target.value)} />
            )}
          </div>
        )}

        {error && <Alert>{error}</Alert>}

        {result && result.skippedCount > 0 && (
          <div className="space-y-2">
            <Alert tone="warning">{num(result.skippedCount)} could not be changed and stay open:</Alert>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-3 text-xs">
              {result.skipped.slice(0, 50).map((s) => (
                <li key={s.issueId}>
                  <span className="font-mono font-semibold">Row {s.rowNumber}</span> <span className="text-muted-foreground">{s.reason}</span>
                </li>
              ))}
              {result.skipped.length > 50 && <li className="text-muted-foreground">and {num(result.skipped.length - 50)} more</li>}
            </ul>
          </div>
        )}

        <DialogFooter className="mt-2 gap-2 sm:gap-0">
          {result ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button loading={busy} disabled={missingValue} onClick={() => void run()}>
                Apply to all
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
