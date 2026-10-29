import { useEffect, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useInventoryLedger, useUnstockedVariants } from "@/hooks/useInventory";
import { formatNumber } from "@/utils/format";
import type { CatalogVariant, LedgerRow } from "@/types/inventory";

interface ProductFieldProps {
  id: string;
  /** the product the form acts on (null = nothing picked yet) */
  value: { title: string; sku: string } | null;
  onPick: (row: LedgerRow) => void;
  /** also search variants without a stock row (not in the ledger); picking one calls this. Only the Adjust form offers it. */
  onPickCatalog?: (variant: CatalogVariant) => void;
  disabled?: boolean;
}

/** the "Product" control of the Adjust and Transfer forms: shows the picked product and searches the stock ledger (by SKU, name or barcode) to change it */
export function ProductField({ id, value, onPick, onPickCatalog, disabled }: ProductFieldProps) {
  const [searching, setSearching] = useState(value === null);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setQ(text.trim()), 300);
    return () => window.clearTimeout(t);
  }, [text]);
  const results = useInventoryLedger({ q, page: 1, pageSize: 8 }, searching && q.length >= 2);
  const unstocked = useUnstockedVariants(q, Boolean(onPickCatalog) && searching && q.length >= 2);
  const unstockedItems = onPickCatalog ? (unstocked.data ?? []) : [];

  if (!searching && value) {
    return (
      <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[12px]">
        <span className="truncate text-[#111111]" id={id}>
          {value.title}
        </span>
        <button type="button" disabled={disabled} onClick={() => setSearching(true)} className="flex shrink-0 cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[11px] font-medium text-[#555555] hover:text-black disabled:cursor-not-allowed disabled:opacity-50">
          Change
          <ChevronDown className="h-3 w-3" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex h-8 w-full items-center gap-2 rounded-lg border border-[#E5E5E5] bg-white px-2.5 focus-within:border-black">
        <Search className="h-3.5 w-3.5 stroke-[1.75px] text-[#888888]" aria-hidden />
        <input id={id} autoComplete="off" aria-label="Search for a product" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search SKU, product or barcode" className="w-full border-none bg-transparent text-[12px] text-[#111111] outline-none placeholder:text-[#888888]" />
      </div>
      {q.length >= 2 && results.isPending && <p className="m-0 text-[11px] text-[#737373]">Searching...</p>}
      {q.length >= 2 && results.isError && <p role="alert" className="m-0 text-[11px] text-red-700">The search failed. Try again.</p>}
      {q.length >= 2 && results.data && results.data.items.length === 0 && unstockedItems.length === 0 && !unstocked.isPending && <p className="m-0 text-[11px] text-[#737373]">No product matches &quot;{q}&quot;.</p>}
      {results.data && results.data.items.length > 0 && q.length >= 2 && (
        <ul className="m-0 max-h-48 list-none divide-y divide-[#F0F0F0] overflow-auto rounded-lg border border-[#EAEAEA] bg-white p-0">
          {results.data.items.map((r) => (
            <li key={r.variantId}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setSearching(false);
                  setText("");
                  setQ("");
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-2 border-none bg-transparent px-2.5 py-1.5 text-left text-[12px] hover:bg-neutral-50"
              >
                <span className="truncate font-medium text-[#111111]">{r.title}</span>
                <span className="shrink-0 text-[11px] text-[#737373]">
                  {r.sku} · {formatNumber(r.available)} available
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {unstockedItems.length > 0 && q !== "" && (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-[11px] font-semibold text-[#555555]">No stock yet (give it opening stock)</p>
          <ul aria-label="Products without stock" className="m-0 max-h-48 list-none divide-y divide-[#F0F0F0] overflow-auto rounded-lg border border-[#EAEAEA] bg-white p-0">
            {unstockedItems.map((v) => (
              <li key={v.variantId}>
                <button
                  type="button"
                  onClick={() => {
                    onPickCatalog?.(v);
                    setSearching(false);
                    setText("");
                    setQ("");
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 border-none bg-transparent px-2.5 py-1.5 text-left text-[12px] hover:bg-neutral-50"
                >
                  <span className="truncate font-medium text-[#111111]">{v.variantName ? `${v.title} (${v.variantName})` : v.title}</span>
                  <span className="shrink-0 text-[11px] text-[#737373]">{v.sku} · no stock yet</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {value && (
        <button type="button" onClick={() => setSearching(false)} className="w-fit cursor-pointer border-none bg-transparent p-0 text-[11px] text-[#737373] hover:text-black">
          Keep {value.title}
        </button>
      )}
    </div>
  );
}
