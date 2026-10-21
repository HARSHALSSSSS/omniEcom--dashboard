import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from "lucide-react";
import type { VariantGridItem, VariantGridPage } from "@/types/variants";
import { formatINR, formatNumber } from "@/utils/format";
import { AuthImage } from "./AuthImage";
import { Menu, type MenuItem } from "./Menu";
import { LIFECYCLE_LABEL, optionSummary, STOCK_LABEL } from "./variantUtils";

export type RowAction = "edit" | "adjust" | "receive" | "archive" | "activate" | "delete";

const badge = "box-border px-2 py-1 bg-[#F5F5F5] rounded-[4px] text-[11px] font-normal leading-[16px] text-[#000000] whitespace-nowrap";
const stockBadge: Record<string, string> = {
  healthy: "bg-[#F5F5F5] text-[#000000]",
  low: "bg-[#FFF4D6] text-[#7A4B00]",
  out: "bg-[#FDE7E7] text-[#B42318]",
};

function SortHeader({ label, field, sort, onSort, className }: { label: string; field: string; sort: string; onSort: (s: string) => void; className: string }) {
  const asc = sort === field;
  const desc = sort === `-${field}`;
  const Icon = asc ? ArrowUp : desc ? ArrowDown : ArrowUpDown;
  return (
    <div className={className} role="columnheader" aria-sort={asc ? "ascending" : desc ? "descending" : "none"}>
      <button
        type="button"
        onClick={() => onSort(asc ? `-${field}` : desc ? "" : field)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#666666] hover:text-[#000000] cursor-pointer"
      >
        {label}
        <Icon className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}

interface Props {
  page: VariantGridPage;
  sort: string;
  onSort: (s: string) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  canWrite: boolean;
  canStock: boolean;
  busy: boolean;
  onAction: (action: RowAction, item: VariantGridItem) => void;
  onPage: (page: number) => void;
}

export function VariantGridTable({ page, sort, onSort, selected, onToggle, onToggleAll, canWrite, canStock, busy, onAction, onPage }: Props) {
  const all = useRef<HTMLInputElement>(null);
  const ids = page.items.map((i) => i.id);
  const picked = ids.filter((id) => selected.has(id)).length;
  const allSelected = ids.length > 0 && picked === ids.length;
  useEffect(() => {
    if (all.current) all.current.indeterminate = picked > 0 && picked < ids.length;
  }, [picked, ids.length]);

  const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const to = (page.page - 1) * page.pageSize + page.items.length;

  return (
    <div className="w-full box-border flex flex-col items-start border border-[#EAEAEA] rounded-[12px] overflow-hidden bg-white">
      <div className="w-full overflow-x-auto">
        <div role="table" aria-label="Variants" aria-busy={busy} className="min-w-[960px]">
          <div role="row" className="w-full box-border flex flex-row items-center px-4 h-10 bg-[#F5F5F5] border-b border-[#EAEAEA] text-[11px] font-medium leading-[16px] text-[#666666] gap-3">
            <div className="w-4 flex justify-center items-center shrink-0" role="columnheader">
              {canWrite && (
                <input
                  ref={all}
                  type="checkbox"
                  aria-label="Select all variants on this page"
                  checked={allSelected}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  className="w-4 h-4 rounded-[3px] border-[#BDBDBD] cursor-pointer"
                />
              )}
            </div>
            <div className="flex-1 min-w-[200px]" role="columnheader">Variant</div>
            <SortHeader label="SKU" field="sku" sort={sort} onSort={onSort} className="w-[120px] shrink-0" />
            <div className="w-[90px] shrink-0" role="columnheader">Price</div>
            <SortHeader label="Inventory" field="inventory" sort={sort} onSort={onSort} className="w-[90px] shrink-0" />
            <div className="w-[110px] shrink-0" role="columnheader">Channels</div>
            <div className="w-[100px] shrink-0" role="columnheader">Status</div>
            <div className="w-[88px] shrink-0" role="columnheader">Lifecycle</div>
            <div className="w-[112px] shrink-0 text-right" role="columnheader">Actions</div>
          </div>

          <div className="w-full divide-y divide-[#EAEAEA]" role="rowgroup">
            {page.items.map((item) => {
              const menu: MenuItem[] = [];
              if (canStock) {
                menu.push({ key: "adjust", label: "Adjust stock", onSelect: () => onAction("adjust", item) });
                menu.push({ key: "receive", label: "Receive stock", onSelect: () => onAction("receive", item) });
              }
              if (canWrite) {
                menu.push(
                  item.status === "active"
                    ? { key: "archive", label: "Archive variant", onSelect: () => onAction("archive", item) }
                    : { key: "activate", label: "Activate variant", onSelect: () => onAction("activate", item) },
                );
                menu.push({ key: "delete", label: "Delete variant", danger: true, onSelect: () => onAction("delete", item) });
              }
              const sub = optionSummary(item.optionValues);
              return (
                <div
                  key={item.id}
                  role="row"
                  className="w-full box-border flex flex-row items-center px-4 py-3 bg-[#FFFFFF] gap-3 hover:bg-[#FAFAFA] transition-colors text-[12px] leading-[17px]"
                >
                  <div className="w-4 flex justify-center items-center shrink-0" role="cell">
                    {canWrite && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.sku}`}
                        checked={selected.has(item.id)}
                        onChange={() => onToggle(item.id)}
                        className="w-4 h-4 rounded-[3px] border-[#BDBDBD] cursor-pointer"
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-[200px] flex flex-row items-center gap-3" role="cell">
                    <AuthImage src={item.thumbnailUrl} alt="" className="w-8 h-8 rounded-[4px] border border-[#EAEAEA] overflow-hidden shrink-0" />
                    <div className="flex flex-col items-start gap-0.5 min-w-0">
                      <span className="font-medium text-[#000000] truncate max-w-full">{item.name}</span>
                      {sub && <span className="text-[11px] font-normal leading-[16px] text-[#666666] truncate max-w-full">{sub}</span>}
                    </div>
                  </div>

                  <div className="w-[120px] shrink-0 flex flex-col" role="cell">
                    <span className="font-normal text-[#000000] truncate">{item.sku}</span>
                    {item.barcode && <span className="text-[11px] text-[#666666] truncate">{item.barcode}</span>}
                  </div>

                  <div className="w-[90px] shrink-0 flex flex-col" role="cell">
                    <span className="font-medium text-[#000000]">{item.sellingPriceMinor === null ? "—" : formatINR(item.sellingPriceMinor)}</span>
                    {item.mrpMinor !== null && <span className="text-[11px] text-[#666666]">MRP {formatINR(item.mrpMinor)}</span>}
                  </div>

                  <div className="w-[90px] shrink-0 font-medium text-[#000000]" role="cell" title={`Low stock at ${item.stock.threshold} or fewer`}>
                    {formatNumber(item.stock.available)}
                  </div>

                  <div className="w-[110px] shrink-0 font-normal text-[#666666] truncate" role="cell" title={item.channels.map((c) => c.name).join(", ")}>
                    {item.channels.length ? item.channels.map((c) => c.name).join(" · ") : "Not listed"}
                  </div>

                  <div className="w-[100px] shrink-0 flex items-center" role="cell">
                    <span className={`${badge} ${stockBadge[item.stock.status]}`}>{STOCK_LABEL[item.stock.status]}</span>
                  </div>

                  <div className="w-[88px] shrink-0 flex items-center" role="cell">
                    <span className={badge}>{LIFECYCLE_LABEL[item.lifecycle]}</span>
                  </div>

                  <div className="w-[112px] shrink-0 flex justify-end items-center gap-1" role="cell">
                    <button
                      type="button"
                      onClick={() => onAction("edit", item)}
                      aria-label={`${canWrite ? "Edit" : "View"} ${item.sku}`}
                      className="box-border flex flex-row items-center px-2.5 h-[34px] bg-[#FFFFFF] border border-[#BDBDBD] hover:bg-[#F5F5F5] rounded-[8px] text-[12px] font-medium text-[#000000] transition-colors cursor-pointer"
                    >
                      {canWrite ? "Edit" : "View"}
                    </button>
                    {menu.length > 0 && (
                      <Menu
                        label={`More actions for ${item.sku}`}
                        items={menu}
                        className="flex items-center justify-center h-[34px] w-[34px] bg-[#FFFFFF] border border-[#BDBDBD] hover:bg-[#F5F5F5] rounded-[8px] text-[#666666] cursor-pointer"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                      </Menu>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="w-full box-border flex flex-row justify-between items-center px-4 py-3 border-t border-[#EAEAEA] bg-white text-[12px]">
        <span className="text-[#666666]" aria-live="polite">
          Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(page.total)} {page.total === 1 ? "variant" : "variants"}
        </span>
        <nav aria-label="Variant pages" className="flex flex-row items-center gap-2">
          <button
            type="button"
            disabled={page.page <= 1}
            onClick={() => onPage(page.page - 1)}
            className="box-border flex flex-row justify-center items-center px-4 h-[30px] bg-[#FFFFFF] border border-[#666666] rounded-[8px] text-[12px] font-semibold text-[#000000] cursor-pointer hover:bg-[#F5F5F5] disabled:bg-[#F5F5F5] disabled:border-[#EAEAEA] disabled:text-[#666666] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Previous
          </button>
          <div aria-current="page" className="flex flex-row justify-center items-center min-w-7 h-7 px-2 bg-[#F5F5F5] rounded-[4px] text-[11px] font-medium text-[#000000]">
            {page.page} / {Math.max(page.pages, 1)}
          </div>
          <button
            type="button"
            disabled={page.page >= page.pages}
            onClick={() => onPage(page.page + 1)}
            className="box-border flex flex-row justify-center items-center px-4 h-[30px] bg-[#FFFFFF] border border-[#666666] rounded-[8px] text-[12px] font-semibold text-[#000000] cursor-pointer hover:bg-[#F5F5F5] disabled:bg-[#F5F5F5] disabled:border-[#EAEAEA] disabled:text-[#666666] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Next
          </button>
        </nav>
      </div>
    </div>
  );
}
