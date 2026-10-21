import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/api/errors";
import { usePickerVariants, usePromotionCategories } from "@/hooks/usePromotions";
import { cn } from "@/utils/cn";
import type { PickerVariant } from "@/types/promotions";
import { money } from "./promoFormat";
import type { SelectionMode, SelectorValue } from "./selection";

const MODES: ReadonlyArray<{ id: SelectionMode; label: string; hint: string }> = [
  { id: "variants", label: "Pick products", hint: "Search and choose the exact SKUs. Picked products stay in the campaign even when they cannot run; the product list then says why." },
  { id: "categories", label: "By category", hint: "Every active product in the chosen categories (and their sub-categories) that is listed on a target marketplace account." },
  { id: "all", label: "All active products", hint: "Every active product that is listed on a target marketplace account." },
];

const optionText = (v: PickerVariant): string => Object.values(v.optionValues).join(" / ");

interface Props {
  value: SelectorValue;
  onChange: (next: SelectorValue) => void;
  disabled?: boolean;
}

function VariantPicker({ value, onChange, disabled }: Props) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const query = usePickerVariants(q, true);
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const picked = useMemo(() => new Set(value.variants.map((v) => v.id)), [value.variants]);

  const toggle = (v: PickerVariant) =>
    onChange({ ...value, variants: picked.has(v.id) ? value.variants.filter((x) => x.id !== v.id) : [...value.variants, v] });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" aria-label="Search products to add" placeholder="Search by SKU, barcode or product title..." value={text} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)} className="pl-9 text-xs" disabled={disabled} />
      </div>
      <div className="max-h-[220px] overflow-y-auto rounded-lg border border-border">
        {query.isLoading ? (
          <p role="status" className="p-3 text-xs text-muted-foreground">
            Loading products...
          </p>
        ) : query.isError ? (
          <div role="alert" className="flex items-center justify-between gap-2 p-3 text-xs text-destructive">
            {errorMessage(query.error)}
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">{q ? "No active product matches this search." : "There are no active products yet."}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((v) => (
              <li key={v.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-xs hover:bg-muted/40">
                  <Checkbox checked={picked.has(v.id)} onCheckedChange={() => toggle(v)} disabled={disabled} aria-label={`Select ${v.sku}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{v.productTitle}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {v.sku}
                      {optionText(v) ? ` · ${optionText(v)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px]">{v.sellingPriceMinor === null ? "No price" : money(v.sellingPriceMinor)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {query.hasNextPage && (
          <div className="border-t border-border p-2 text-center">
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </div>
      {value.variants.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Picked products">
          {value.variants.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-medium">
              {v.sku}
              <button type="button" aria-label={`Remove ${v.sku}`} disabled={disabled} onClick={() => toggle(v)} className="rounded-full p-0.5 hover:bg-background">
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryPicker({ value, onChange, disabled }: Props) {
  const cats = usePromotionCategories(true);
  const picked = new Set(value.categoryIds);
  if (cats.isLoading) return <p role="status" className="text-xs text-muted-foreground">Loading categories...</p>;
  if (cats.isError) {
    return (
      <div role="alert" className="flex items-center justify-between gap-2 text-xs text-destructive">
        {errorMessage(cats.error)}
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void cats.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  const options = cats.data ?? [];
  if (options.length === 0) return <p className="text-xs text-muted-foreground">There are no categories yet. Pick products or use all active products.</p>;
  return (
    <ul className="max-h-[220px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
      {options.map((c) => (
        <li key={c.id}>
          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-xs hover:bg-muted/40">
            <Checkbox
              checked={picked.has(c.id)}
              disabled={disabled}
              aria-label={c.label}
              onCheckedChange={() => onChange({ ...value, categoryIds: picked.has(c.id) ? value.categoryIds.filter((x) => x !== c.id) : [...value.categoryIds, c.id] })}
            />
            <span>{c.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** how a campaign takes its products: picked SKUs, categories or everything active (PUT /promotions/campaigns/{id}/products) */
export function ProductSelector({ value, onChange, disabled }: Props) {
  const current = MODES.find((m) => m.id === value.mode);
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="How to choose products" className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={value.mode === m.id}
            disabled={disabled}
            onClick={() => onChange({ ...value, mode: m.id })}
            className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", value.mode === m.id ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-muted")}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{current?.hint}</p>
      {value.mode === "variants" && <VariantPicker value={value} onChange={onChange} disabled={disabled} />}
      {value.mode === "categories" && <CategoryPicker value={value} onChange={onChange} disabled={disabled} />}
    </div>
  );
}
