import { ArrowRight, Clock, Lock, Shield, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/utils/format";
import { SetupFooterNote } from "./SetupNotices";
import type { DirectoryItem } from "@/types/directory";

interface SetupReviewStepProps {
  item: DirectoryItem;
  businessName: string;
  workspaceName: string;
  /** master catalogue size, when known */
  totalProducts?: number;
  onContinue: () => void;
}

export function SetupReviewStep({
  item,
  businessName,
  workspaceName,
  totalProducts,
  onContinue,
}: SetupReviewStepProps) {
  const categoryLabel =
    item.category === "storefront"
      ? "Storefront"
      : item.category === "shipping"
        ? "Shipping carrier"
        : "Marketplace";

  // what the connector really offers: its directory capability tags
  const tags = new Set(item.capabilityTags ?? []);
  const hasProducts = tags.has("product_import");
  const hasInventory = tags.has("inventory");
  const hasOrders = tags.has("orders");
  const hasListings = tags.has("listings");
  const hasShipping = tags.has("shipping");

  return (
    <div className="space-y-6">
      {/* 1. Connection summary */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
          <h3 className="text-base font-bold text-foreground">Connection summary</h3>
          <span className="text-xs text-muted-foreground font-medium">Ready to connect</span>
        </div>
        <div className="divide-y divide-neutral-100 text-xs">
          <div className="flex justify-between py-3">
            <span className="text-muted-foreground">Business</span>
            <span className="font-semibold text-foreground">{businessName}</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-muted-foreground">Connector</span>
            <span className="font-semibold text-foreground">{item.name}</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-muted-foreground">Connection type</span>
            <span className="font-semibold text-foreground">{categoryLabel}</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-muted-foreground">Workspace</span>
            <span className="font-semibold text-foreground">{workspaceName}</span>
          </div>
        </div>
      </div>

      {/* 2. Data bridge */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-foreground mb-4">Data bridge</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <div>
              <p className="font-semibold text-foreground">Your business</p>
              <p className="text-[11px] text-muted-foreground">Central workspace</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-foreground">{item.name}</p>
              <p className="text-[11px] text-muted-foreground">{categoryLabel}</p>
            </div>
          </div>

          <div className="relative flex items-center justify-center my-2">
            <div className="w-full border-t border-neutral-200" />
            <span className="absolute bg-white px-3 text-[11px] text-muted-foreground font-mono">
              Review → Authorize
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div className="rounded-lg bg-neutral-50 p-3 text-xs">
              <p className="font-semibold text-foreground">Catalog</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Product/catalog data</p>
            </div>
            <div className="rounded-lg bg-neutral-50 p-3 text-xs">
              <p className="font-semibold text-foreground">Inventory</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Stock updates</p>
            </div>
            <div className="rounded-lg bg-neutral-50 p-3 text-xs">
              <p className="font-semibold text-foreground">Orders</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Marketplace orders</p>
            </div>
            <div className="rounded-lg bg-neutral-50 p-3 text-xs">
              <p className="font-semibold text-foreground">Listings</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Listing information</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. What will connect */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-bold text-foreground">What will connect</h3>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mt-1">
            INTO YOUR WORKSPACE
          </p>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1.5 border-b border-neutral-100">
            <span className="font-medium text-foreground w-32">Products</span>
            <div className="flex-1 hidden sm:block border-b border-dotted border-neutral-300 mx-4" />
            <div className="flex items-center gap-6 justify-between sm:justify-end">
              <span className="font-semibold text-foreground">
                {hasProducts ? "Supported" : "Not enabled"}
              </span>
              <span className="text-muted-foreground text-[11px] w-48 text-right">
                {hasProducts ? "Supported product/catalog data" : "Not offered by this connector"}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1.5 border-b border-neutral-100">
            <span className="font-medium text-foreground w-32">Inventory</span>
            <div className="flex-1 hidden sm:block border-b border-dotted border-neutral-300 mx-4" />
            <div className="flex items-center gap-6 justify-between sm:justify-end">
              <span className="font-semibold text-foreground">
                {hasInventory ? "Supported" : "Not enabled"}
              </span>
              <span className="text-muted-foreground text-[11px] w-48 text-right">
                {hasInventory ? "Supported stock updates" : "Not offered by this connector"}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1.5 border-b border-neutral-100">
            <span className="font-medium text-foreground w-32">Orders</span>
            <div className="flex-1 hidden sm:block border-b border-dotted border-neutral-300 mx-4" />
            <div className="flex items-center gap-6 justify-between sm:justify-end">
              <span className="font-semibold text-foreground">
                {hasOrders ? "Supported" : "Not enabled"}
              </span>
              <span className="text-muted-foreground text-[11px] w-48 text-right">
                {hasOrders ? "Supported marketplace orders" : "Not offered by this connector"}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1.5 border-b border-neutral-100">
            <span className="font-medium text-foreground w-32">Listings</span>
            <div className="flex-1 hidden sm:block border-b border-dotted border-neutral-300 mx-4" />
            <div className="flex items-center gap-6 justify-between sm:justify-end">
              <span className="font-semibold text-foreground">
                {hasListings ? "Supported" : "Not enabled"}
              </span>
              <span className="text-muted-foreground text-[11px] w-48 text-right">
                {hasListings ? "Supported marketplace listing information" : "Not offered by this connector"}
              </span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground pt-1">
          You remain in control of publishing and commercial actions.
        </p>
      </div>

      {/* 4. Review access */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-bold text-foreground">Review access</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            The connector will use your authorized marketplace account to access supported commerce data.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-neutral-200 text-muted-foreground">
                <th className="pb-2 font-medium">Access</th>
                <th className="pb-2 font-medium">Purpose</th>
                <th className="pb-2 font-medium text-right">Required</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              <tr>
                <td className="py-2.5 font-medium text-foreground">Product/catalog</td>
                <td className="py-2.5 text-muted-foreground">Import and synchronize supported products</td>
                <td className="py-2.5 text-right font-semibold text-foreground">
                  {hasProducts ? "Required" : "Not offered"}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium text-foreground">Inventory</td>
                <td className="py-2.5 text-muted-foreground">Sync available stock</td>
                <td className="py-2.5 text-right font-semibold text-foreground">
                  {hasInventory ? "Required" : "Not offered"}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium text-foreground">Orders</td>
                <td className="py-2.5 text-muted-foreground">Retrieve marketplace orders</td>
                <td className="py-2.5 text-right font-semibold text-foreground">
                  {hasOrders ? "Required" : "Not offered"}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium text-foreground">Listings</td>
                <td className="py-2.5 text-muted-foreground">Manage supported listing information</td>
                <td className="py-2.5 text-right font-semibold text-foreground">
                  {hasListings ? "Required" : "Not offered"}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium text-foreground">Shipping</td>
                <td className="py-2.5 text-muted-foreground">Update supported fulfillment information</td>
                <td className="py-2.5 text-right text-muted-foreground">
                  {hasShipping ? "Required" : "Not offered"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Trust strip */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Shield className="h-4 w-4 text-neutral-600 shrink-0" />
            <span>Secure authorization</span>
          </div>
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Lock className="h-4 w-4 text-neutral-600 shrink-0" />
            <span>Encrypted credentials</span>
          </div>
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Sliders className="h-4 w-4 text-neutral-600 shrink-0" />
            <span>Controlled access</span>
          </div>
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Clock className="h-4 w-4 text-neutral-600 shrink-0" />
            <span>Connection audit trail</span>
          </div>
        </div>
      </div>

      {/* 6. Catalog matching */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-bold text-foreground">Catalog matching</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {totalProducts !== undefined ? `Your workspace already contains ${formatNumber(totalProducts)} master products. ` : ""}Match existing SKUs before importing new products to reduce duplicate master products and preserve your existing catalog structure.
          </p>
        </div>

        {/* 3-stage diagram */}
        <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="bg-white rounded-md border border-neutral-200 p-3 text-xs">
              <p className="font-bold text-foreground">Marketplace Catalog</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Source catalog</p>
            </div>
            
            <div className="bg-white rounded-md border border-neutral-200 p-3 text-xs space-y-1">
              <p className="font-bold text-foreground">Matching</p>
              <p className="text-[11px] text-muted-foreground">
                Match existing SKUs / Detect duplicates / Map variants / Map categories
              </p>
            </div>

            <div className="bg-white rounded-md border border-neutral-200 p-3 text-xs">
              <p className="font-bold text-foreground">Master Catalog</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Cleaned workspace catalog</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onContinue}>
            Use recommendation
          </Button>
          <Button variant="outline" size="sm" onClick={onContinue}>
            Configure manually
          </Button>
        </div>
      </div>

      {/* 7. Continue to authorization */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-bold text-foreground">Continue to authorization</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Connecting does not publish products automatically. You will review catalog mapping and marketplace workflows before activating them.
          </p>
        </div>

        <SetupFooterNote connectorName={item.name} />

        <Button
          onClick={onContinue}
          className="bg-black text-white hover:bg-neutral-800 gap-2 h-9 px-4 text-xs font-semibold"
        >
          Continue to authorization <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
