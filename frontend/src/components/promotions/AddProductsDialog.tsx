import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/api/errors";
import { useSetCampaignProducts } from "@/hooks/usePromotions";
import { toast } from "@/hooks/useToast";
import type { PromotionCampaign, SelectionResult } from "@/types/promotions";
import { ProductSelector } from "./ProductSelector";
import { EMPTY_SELECTION, isEmptySelection, toSelection, type SelectorValue } from "./selection";

interface Props {
  campaign: PromotionCampaign | null;
  onClose: () => void;
}

/** add products to a draft, or replace its whole set (PUT /promotions/campaigns/{id}/products) */
export function AddProductsDialog({ campaign, onClose }: Props) {
  const save = useSetCampaignProducts();
  const [value, setValue] = useState<SelectorValue>(EMPTY_SELECTION);
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SelectionResult | null>(null);
  const id = campaign?.id;

  useEffect(() => {
    setValue(EMPTY_SELECTION);
    setMode("add");
    setError(null);
    setResult(null);
  }, [id]);

  const submit = () => {
    const selection = toSelection(value);
    if (!campaign || !selection) return;
    setError(null);
    save.mutate(
      { id: campaign.id, selection, mode },
      {
        onSuccess: (res) => {
          if (res.skipped.length === 0 && res.droppedNoListing === 0) {
            toast({ title: "Products updated", description: `${res.added} added, ${res.removed} removed, ${res.total} in the campaign.`, variant: "success" });
            onClose();
          } else setResult(res);
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={campaign !== null} onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{result ? "Products updated" : "Add products"}</DialogTitle>
          <DialogDescription>{campaign ? `${campaign.name} (${campaign.code})` : ""}</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-2 text-xs" aria-live="polite">
            <p>
              {result.added} added, {result.removed} removed. The campaign now has {result.total} product{result.total === 1 ? "" : "s"}.
            </p>
            {result.droppedNoListing > 0 && <p className="text-muted-foreground">{result.droppedNoListing} product{result.droppedNoListing === 1 ? " was" : "s were"} left out because {result.droppedNoListing === 1 ? "it is" : "they are"} not listed on a target marketplace account.</p>}
            {result.skipped.length > 0 && (
              <div>
                <p className="font-semibold">Not added</p>
                <ul className="mt-1 max-h-[160px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {result.skipped.map((s) => (
                    <li key={s.variantId} className="px-3 py-1.5 text-muted-foreground">
                      {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <ProductSelector value={value} onChange={setValue} disabled={save.isPending} />
            <div role="radiogroup" aria-label="What to do with the current products" className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" name="products-mode" checked={mode === "add"} onChange={() => setMode("add")} className="accent-[#1D4ED8]" />
                Keep the current products and add these
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="products-mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="accent-[#1D4ED8]" />
                Replace all current products
              </label>
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" disabled={save.isPending} onClick={onClose}>
                Cancel
              </Button>
              <Button loading={save.isPending} disabled={isEmptySelection(value)} onClick={submit}>
                {mode === "replace" ? "Replace products" : "Add products"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
