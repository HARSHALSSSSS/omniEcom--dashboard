import React from "react";
import { Package, Layers, ShoppingBag, Store, ArrowDown } from "lucide-react";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      {/* Left dark brand & value proposition panel */}
      <div className="relative flex flex-col justify-between bg-black p-8 text-white lg:w-1/2 lg:p-14">
        {/* Brand header */}
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight">[Product Name]</h2>
          <p className="text-xs text-neutral-400">Commerce Operating System</p>
        </div>

        {/* Value proposition & data diagram */}
        <div className="my-12 max-w-lg space-y-8">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl leading-tight">
            Run your entire ecommerce business from one place.
          </h1>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Connect your marketplaces, centralize products and inventory, and
            manage orders without switching between platforms.
          </p>

          {/* Data chain visual preview from Screen 01 */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-neutral-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                  Master Product
                </span>
              </div>
              <span className="font-mono text-xs text-neutral-500">
                SKU · NL-001
              </span>
            </div>

            <div className="flex items-center justify-center py-1">
              <ArrowDown className="h-4 w-4 text-neutral-500 animate-bounce" />
            </div>

            <p className="text-center text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              Amazon · Flipkart · Meesho · Shopify
            </p>

            <div className="grid grid-cols-4 gap-2 pt-1 text-center">
              <div className="rounded-md border border-neutral-800 bg-neutral-900/80 p-2">
                <Package className="h-3.5 w-3.5 text-neutral-400 mx-auto mb-1" />
                <span className="block text-[10px] text-neutral-400">
                  Product
                </span>
                <strong className="block text-xs text-neutral-200">
                  1 SKU
                </strong>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-900/80 p-2">
                <Layers className="h-3.5 w-3.5 text-neutral-400 mx-auto mb-1" />
                <span className="block text-[10px] text-neutral-400">
                  Inventory
                </span>
                <strong className="block text-xs text-neutral-200">
                  248 avail
                </strong>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-900/80 p-2">
                <ShoppingBag className="h-3.5 w-3.5 text-neutral-400 mx-auto mb-1" />
                <span className="block text-[10px] text-neutral-400">
                  Order
                </span>
                <strong className="block text-xs text-neutral-200">
                  #1042 New
                </strong>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-900/80 p-2">
                <Store className="h-3.5 w-3.5 text-neutral-400 mx-auto mb-1" />
                <span className="block text-[10px] text-neutral-400">
                  Marketplaces
                </span>
                <strong className="block text-xs text-neutral-200">
                  4 sync
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Tagline footer */}
        <div className="space-y-1 text-xs text-neutral-500">
          <p>Built for modern Indian ecommerce businesses</p>
          <p className="font-medium text-neutral-400">
            One business. One source of truth.
          </p>
        </div>
      </div>

      {/* Right form container */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-12 lg:p-16 bg-background">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
};
