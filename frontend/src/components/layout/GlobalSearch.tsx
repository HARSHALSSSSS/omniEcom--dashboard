import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Package, ShoppingBag, Layers, CornerDownLeft } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useUiStore } from "@/store/ui.store";
import { ROUTES } from "@/constants/routes";

interface SearchItem {
  id: string;
  category: "product" | "order" | "sku";
  title: string;
  subtitle: string;
  typeLabel: string;
  href: string;
}

const SEARCH_DATA: SearchItem[] = [
  {
    id: "p1",
    category: "product",
    title: "Premium Travel Bag",
    subtitle: "TRV-1042 · 4 available · Low stock",
    typeLabel: "Product",
    href: `${ROUTES.PRODUCTS}`,
  },
  {
    id: "p2",
    category: "product",
    title: "Classic Backpack",
    subtitle: "BP-1021 · Bags & travel · 8 available · Low stock",
    typeLabel: "Product",
    href: `${ROUTES.PRODUCTS}`,
  },
  {
    id: "o1",
    category: "order",
    title: "Order #1042",
    subtitle: "Premium Travel Bag · Amazon · Picking · Dispatch today",
    typeLabel: "Order",
    href: `${ROUTES.ORDERS}?search=1042`,
  },
  {
    id: "s1",
    category: "sku",
    title: "TRV-1042 / Home Inventory",
    subtitle: "Premium Travel Bag · Available 4 · Threshold 10",
    typeLabel: "SKU",
    href: `${ROUTES.INVENTORY}?search=TRV-1042`,
  },
];

type CategoryFilter = "all" | "product" | "order" | "sku";

export const GlobalSearch: React.FC = () => {
  const { globalSearchOpen, setGlobalSearchOpen } = useUiStore();
  const [query, setQuery] = useState("bag");
  const [activeTab, setActiveTab] = useState<CategoryFilter>("all");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setGlobalSearchOpen(!globalSearchOpen);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [globalSearchOpen, setGlobalSearchOpen]);

  // Filter items based on active tab and query
  const filteredItems = useMemo(() => {
    return SEARCH_DATA.filter((item) => {
      const matchesTab = activeTab === "all" || item.category === activeTab;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.typeLabel.toLowerCase().includes(q);
      return matchesTab && matchesQuery;
    });
  }, [query, activeTab]);

  // Group by section
  const productItems = useMemo(
    () => filteredItems.filter((i) => i.category === "product"),
    [filteredItems]
  );
  const orderItems = useMemo(
    () => filteredItems.filter((i) => i.category === "order"),
    [filteredItems]
  );
  const skuItems = useMemo(
    () => filteredItems.filter((i) => i.category === "sku"),
    [filteredItems]
  );

  // Flattened for keyboard arrow navigation
  const flatVisibleItems = useMemo(() => {
    return [...productItems, ...orderItems, ...skuItems];
  }, [productItems, orderItems, skuItems]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeTab]);

  const handleSelect = (href: string) => {
    setGlobalSearchOpen(false);
    navigate(href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < flatVisibleItems.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flatVisibleItems[selectedIndex]) {
        handleSelect(flatVisibleItems[selectedIndex].href);
      }
    } else if (e.key === "Escape") {
      setGlobalSearchOpen(false);
    }
  };

  return (
    <Dialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen}>
      <DialogContent
        className="p-0 max-w-[620px] overflow-hidden gap-0 rounded-[16px] border border-[#EAEAEA] bg-white shadow-2xl [&>button]:hidden font-['Inter',sans-serif]"
        onKeyDown={handleKeyDown}
      >
        {/* Top Input Bar with Search Icon & Esc Pill */}
        <div className="p-5 pb-3">
          <div className="flex items-center gap-3 w-full">
            <Search className="h-4 w-4 text-[#666666] shrink-0" />
            <div className="relative flex-1 flex items-center">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, orders, SKUs..."
                className="w-full h-10 px-3.5 pr-12 rounded-[8px] border border-[#666666] bg-white text-[13px] text-[#000000] placeholder:text-[#666666] focus:outline-none focus:border-[#000000] font-medium"
                autoFocus
              />
              <span className="absolute right-3 text-[11px] font-normal text-[#666666] select-none pointer-events-none">
                Esc
              </span>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-6 mt-4 text-[12px]">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`transition-colors pb-0.5 ${
                activeTab === "all"
                  ? "font-semibold text-[#000000] border-b-2 border-[#000000]"
                  : "font-normal text-[#666666] hover:text-[#000000]"
              }`}
            >
              All results
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("product")}
              className={`transition-colors pb-0.5 ${
                activeTab === "product"
                  ? "font-semibold text-[#000000] border-b-2 border-[#000000]"
                  : "font-normal text-[#666666] hover:text-[#000000]"
              }`}
            >
              Products
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("order")}
              className={`transition-colors pb-0.5 ${
                activeTab === "order"
                  ? "font-semibold text-[#000000] border-b-2 border-[#000000]"
                  : "font-normal text-[#666666] hover:text-[#000000]"
              }`}
            >
              Orders
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sku")}
              className={`transition-colors pb-0.5 ${
                activeTab === "sku"
                  ? "font-semibold text-[#000000] border-b-2 border-[#000000]"
                  : "font-normal text-[#666666] hover:text-[#000000]"
              }`}
            >
              SKUs
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="max-h-[440px] overflow-y-auto px-5 py-2 space-y-4">
          {/* Section 1: PRODUCTS */}
          {productItems.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-[#707070]">
                PRODUCTS · {productItems.length}{" "}
                {productItems.length === 1 ? "RESULT" : "RESULTS"}
              </div>
              <div className="space-y-1">
                {productItems.map((item) => {
                  const globalIdx = flatVisibleItems.findIndex(
                    (i) => i.id === item.id
                  );
                  const isSelected = globalIdx === selectedIndex;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.href)}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-[8px] text-left transition-colors ${
                        isSelected
                          ? "bg-[#F5F5F5]"
                          : "bg-white hover:bg-neutral-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center text-[#333333]">
                          <Package className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold text-[#000000] leading-[145%] truncate">
                            {item.title}
                          </span>
                          <span className="text-[11px] font-normal text-[#666666] leading-[145%] truncate">
                            {item.subtitle}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <span className="text-[11px] font-normal text-[#666666]">
                          {item.typeLabel}
                        </span>
                        {isSelected && (
                          <CornerDownLeft className="h-3 w-3 text-[#666666]" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 2: ORDERS */}
          {orderItems.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-[#707070]">
                ORDERS · {orderItems.length}{" "}
                {orderItems.length === 1 ? "RESULT" : "RESULTS"}
              </div>
              <div className="space-y-1">
                {orderItems.map((item) => {
                  const globalIdx = flatVisibleItems.findIndex(
                    (i) => i.id === item.id
                  );
                  const isSelected = globalIdx === selectedIndex;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.href)}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-[8px] text-left transition-colors ${
                        isSelected
                          ? "bg-[#F5F5F5]"
                          : "bg-white hover:bg-neutral-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center text-[#333333]">
                          <ShoppingBag className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold text-[#000000] leading-[145%] truncate">
                            {item.title}
                          </span>
                          <span className="text-[11px] font-normal text-[#666666] leading-[145%] truncate">
                            {item.subtitle}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <span className="text-[11px] font-normal text-[#666666]">
                          {item.typeLabel}
                        </span>
                        {isSelected && (
                          <CornerDownLeft className="h-3 w-3 text-[#666666]" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 3: INVENTORY / SKUs */}
          {skuItems.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-[#707070]">
                INVENTORY · {skuItems.length}{" "}
                {skuItems.length === 1 ? "RESULT" : "RESULTS"}
              </div>
              <div className="space-y-1">
                {skuItems.map((item) => {
                  const globalIdx = flatVisibleItems.findIndex(
                    (i) => i.id === item.id
                  );
                  const isSelected = globalIdx === selectedIndex;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.href)}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-[8px] text-left transition-colors ${
                        isSelected
                          ? "bg-[#F5F5F5]"
                          : "bg-white hover:bg-neutral-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center text-[#333333]">
                          <Layers className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold text-[#000000] leading-[145%] truncate">
                            {item.title}
                          </span>
                          <span className="text-[11px] font-normal text-[#666666] leading-[145%] truncate">
                            {item.subtitle}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <span className="text-[11px] font-normal text-[#666666]">
                          {item.typeLabel}
                        </span>
                        {isSelected && (
                          <CornerDownLeft className="h-3 w-3 text-[#666666]" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {flatVisibleItems.length === 0 && (
            <div className="py-12 text-center text-[12px] text-[#666666]">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        {/* Modal Bottom Status / Controls Footer */}
        <div className="border-t border-[#EAEAEA] px-5 py-3 text-[11px] text-[#666666] flex items-center justify-between select-none">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span>↑ ↓</span>
              <span>to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <span>↵</span>
              <span>to open</span>
            </span>
            <span>Esc to close</span>
          </div>
          <span>
            {flatVisibleItems.length}{" "}
            {flatVisibleItems.length === 1 ? "result" : "results"}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
};

