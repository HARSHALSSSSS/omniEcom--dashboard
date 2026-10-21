import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { VariantGridParams, VariantStockStatus, VariantTab } from "@/types/variants";

export const VARIANTS_PAGE_SIZE = 20;
const TABS: VariantTab[] = ["all", "active", "low_stock", "out_of_stock", "draft", "archived"];
const SORTS = ["sku", "-sku", "inventory", "-inventory", "updatedAt", "-updatedAt", "createdAt", "-createdAt"];
const OPT = "opt:";

/** tab, search, filters, sort and page live in the URL (shareable, survives reload and back/forward) */
export function useVariantsUrlState() {
  const [sp, setSp] = useSearchParams();

  const params: VariantGridParams = useMemo(() => {
    const tab = sp.get("tab") as VariantTab | null;
    const inv = sp.get("inventory");
    const sort = sp.get("sort") ?? "";
    const options: Record<string, string> = {};
    sp.forEach((value, key) => {
      if (key.startsWith(OPT) && value) options[key.slice(OPT.length)] = value;
    });
    const page = Number(sp.get("page"));
    return {
      tab: tab && TABS.includes(tab) ? tab : "all",
      q: sp.get("q") ?? "",
      options,
      channel: sp.get("channel") ?? "",
      inventory: inv === "healthy" || inv === "low" || inv === "out" ? (inv as VariantStockStatus) : "",
      sort: SORTS.includes(sort) ? sort : "",
      page: Number.isInteger(page) && page >= 1 ? page : 1,
      pageSize: VARIANTS_PAGE_SIZE,
    };
  }, [sp]);

  /** change filter-like params; the page always goes back to 1 unless the patch sets it */
  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === "") next.delete(k);
            else next.set(k, v);
          }
          if (!("page" in patch)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  return {
    params,
    setTab: (tab: VariantTab) => update({ tab: tab === "all" ? null : tab }),
    setQ: (q: string) => update({ q }),
    setChannel: (channel: string) => update({ channel }),
    setInventory: (inventory: string) => update({ inventory }),
    setOption: (name: string, value: string) => update({ [`${OPT}${name}`]: value }),
    setSort: (sort: string) => update({ sort }),
    setPage: (page: number) => update({ page: page <= 1 ? null : String(page) }),
    clearFilters: () => {
      setSp(
        (prev) => {
          const next = new URLSearchParams();
          const tab = prev.get("tab");
          if (tab) next.set("tab", tab);
          return next;
        },
        { replace: true },
      );
    },
  };
}
