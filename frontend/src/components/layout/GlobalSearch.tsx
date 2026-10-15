import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Package, ShoppingCart, ArrowRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUiStore } from "@/store/ui.store";
import { ROUTES } from "@/constants/routes";

const MOCK_SEARCH_ITEMS = [
  {
    id: "1",
    type: "product",
    title: "Classic Black T-Shirt",
    subtitle: "TS-BLK-042 · 42 units available",
    href: `${ROUTES.PRODUCTS}/1`,
  },
  {
    id: "2",
    type: "product",
    title: "Running Shoes — Blue",
    subtitle: "RS-BLU-211 · 184 units available",
    href: `${ROUTES.PRODUCTS}/2`,
  },
  {
    id: "3",
    type: "product",
    title: "Premium Travel Bag",
    subtitle: "TRV-1042 · 28 units available",
    href: `${ROUTES.PRODUCTS}/3`,
  },
  {
    id: "4",
    type: "order",
    title: "Order #ORD-10291",
    subtitle: "Flipkart · ₹1,499 · Dispatched",
    href: `${ROUTES.ORDERS}?drawer=order:ORD-10291`,
  },
  {
    id: "5",
    type: "order",
    title: "Order #ORD-10292",
    subtitle: "Amazon · ₹2,899 · Packing",
    href: `${ROUTES.ORDERS}?drawer=order:ORD-10292`,
  },
];

export const GlobalSearch: React.FC = () => {
  const { globalSearchOpen, setGlobalSearchOpen } = useUiStore();
  const [query, setQuery] = useState("");
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

  const filteredItems = query.trim()
    ? MOCK_SEARCH_ITEMS.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.subtitle.toLowerCase().includes(query.toLowerCase()),
      )
    : MOCK_SEARCH_ITEMS;

  const handleSelect = (href: string) => {
    setGlobalSearchOpen(false);
    setQuery("");
    navigate(href);
  };

  return (
    <Dialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen}>
      <DialogContent className="p-0 max-w-xl overflow-hidden gap-0 border-border shadow-2xl">
        <div className="flex items-center border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground mr-2.5 shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, orders, SKUs, barcodes... (Press Esc to exit)"
            className="border-0 shadow-none focus-visible:ring-0 p-0 text-sm h-auto placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        <div className="max-h-[360px] overflow-y-auto p-2">
          <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {query.trim() ? "Matching Results" : "Recent & Quick Access"}
          </div>

          <ul className="space-y-0.5 mt-1">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item.href)}
                    className="w-full flex items-center justify-between rounded-md px-3 py-2 text-left hover:bg-muted/70 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-background">
                        {item.type === "product" ? (
                          <Package className="h-3.5 w-3.5" />
                        ) : (
                          <ShoppingCart className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-foreground">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </li>
              ))
            ) : (
              <li className="py-8 text-center text-xs text-muted-foreground">
                No matching results for &ldquo;{query}&rdquo;
              </li>
            )}
          </ul>
        </div>

        <div className="border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>Navigate with ⇅ • Select with ↵</span>
          <span>esc to close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};
