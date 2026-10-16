import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  UploadCloud,
  AlertTriangle,
  CheckSquare,
  Square,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/common/StatusPill";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { ROUTES } from "@/constants/routes";
import {
  useListings,
  useBulkPublishListings,
} from "@/hooks/useListings";
import { ChannelListingItem } from "@/types/listing";
import { formatINR, formatRelativeTime } from "@/utils/format";

export default function ListingsPage() {
  const navigate = useNavigate();

  const [activeChannel, setActiveChannel] = useState<string>("all");
  const [activeStatus, setActiveStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawerListing, setDrawerListing] = useState<ChannelListingItem | null>(
    null,
  );

  const { data: listingsData } = useListings({
    channel: activeChannel,
    status: activeStatus,
    search: searchTerm,
  });

  const bulkPublishMutation = useBulkPublishListings();

  const listings = listingsData?.data ?? [];
  const meta = listingsData?.meta;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    if (selectedIds.length === listings.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(listings.map((l) => l.id));
    }
  };

  const handleBulkPublish = () => {
    if (selectedIds.length === 0) return;
    bulkPublishMutation.mutate(selectedIds, {
      onSuccess: () => {
        setSelectedIds([]);
      },
    });
  };

  return (
    <div className="w-full space-y-6 pb-24">
      {/* Page Header */}
      <PageHeader
        eyebrow="COMMERCE CATALOG"
        title="Listings Management"
        description="Unified status matrix and multi-channel publication studio across Amazon, Flipkart, Meesho, and Shopify."
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(ROUTES.PRODUCTS_IMPORT)}
            >
              Import Products
            </Button>
            <Button
              size="sm"
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate(ROUTES.PRODUCTS_NEW)}
            >
              Create Product
            </Button>
          </div>
        }
      />

      {/* KPI Status Matrix Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div
          onClick={() => setActiveStatus("all")}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            activeStatus === "all"
              ? "border-[#1D4ED8] bg-[#E6F4FF]/30 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total Listings
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-foreground">
            {meta?.total ?? 8}
          </p>
        </div>

        <div
          onClick={() => setActiveStatus("live")}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            activeStatus === "live"
              ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            Live / Active
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-emerald-600">
            {meta?.live ?? 3}
          </p>
        </div>

        <div
          onClick={() => setActiveStatus("syncing")}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            activeStatus === "syncing"
              ? "border-blue-500 bg-blue-50/50 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1D4ED8]">
            Syncing
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-[#1D4ED8]">
            {meta?.syncing ?? 1}
          </p>
        </div>

        <div
          onClick={() => setActiveStatus("needs_review")}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            activeStatus === "needs_review"
              ? "border-amber-500 bg-amber-50/50 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            Needs Review
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-amber-600">
            {meta?.needsReview ?? 1}
          </p>
        </div>

        <div
          onClick={() => setActiveStatus("failed")}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            activeStatus === "failed"
              ? "border-rose-500 bg-rose-50/50 shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive">
            Failed / Errors
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-destructive">
            {meta?.failed ?? 1}
          </p>
        </div>

        <div
          onClick={() => setActiveStatus("not_listed")}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            activeStatus === "not_listed"
              ? "border-border bg-muted shadow-sm"
              : "border-border bg-card hover:bg-muted/30"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Not Listed
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-muted-foreground">
            {meta?.notListed ?? 1}
          </p>
        </div>
      </div>

      {/* Filter and Channel Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by SKU, ASIN, or product title..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchTerm(e.target.value)
            }
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          {["all", "amazon", "flipkart", "meesho", "shopify"].map((ch) => (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                activeChannel === ch
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {ch === "all" ? "All Channels" : ch}
            </button>
          ))}
        </div>
      </div>

      {/* Listings Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
            <tr>
              <th className="py-3 pl-4 pr-2 w-10">
                <button onClick={selectAll} className="text-muted-foreground">
                  {selectedIds.length === listings.length && listings.length > 0 ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
              </th>
              <th className="px-3 py-3">Product / SKU</th>
              <th className="px-3 py-3">Marketplace</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Price / MRP</th>
              <th className="px-3 py-3">Stock</th>
              <th className="px-3 py-3">Readiness</th>
              <th className="py-3 pl-3 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {listings.map((item) => {
              const isSelected = selectedIds.includes(item.id);

              return (
                <tr
                  key={item.id}
                  className={`hover:bg-muted/20 transition-colors ${
                    isSelected ? "bg-muted/30" : ""
                  }`}
                >
                  <td className="py-3 pl-4 pr-2">
                    <button
                      onClick={() => toggleSelect(item.id)}
                      className="text-muted-foreground"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-10 w-10 rounded-md object-cover border border-border bg-muted"
                        />
                      )}
                      <div>
                        <p
                          onClick={() =>
                            navigate(`${ROUTES.LISTINGS}/${item.id}`)
                          }
                          className="font-medium text-foreground hover:underline cursor-pointer"
                        >
                          {item.productTitle}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          SKU: {item.sku}{" "}
                          {item.channelListingId && (
                            <span>· {item.channelListingId}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 capitalize font-medium text-foreground">
                    {item.channelName}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={item.status} />
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-semibold text-foreground">
                      {formatINR(item.sellingPrice)}
                    </span>
                    <span className="ml-1 text-[11px] text-muted-foreground line-through">
                      {formatINR(item.mrp)}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono">
                    <span
                      className={
                        item.stock === 0
                          ? "text-destructive font-bold"
                          : "text-foreground"
                      }
                    >
                      {item.stock}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${
                            item.readinessScore >= 90
                              ? "bg-emerald-500"
                              : item.readinessScore >= 70
                                ? "bg-amber-500"
                                : "bg-destructive"
                          }`}
                          style={{ width: `${item.readinessScore}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {item.readinessScore}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setDrawerListing(item)}
                      >
                        Quick Drawer
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() =>
                          navigate(`${ROUTES.LISTINGS}/${item.id}`)
                        }
                      >
                        Studio
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Floating Bulk Selection Action Bar (Screen 23D) */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 rounded-full border border-border bg-card px-6 py-3 shadow-xl z-40">
          <span className="text-xs font-semibold text-foreground">
            {selectedIds.length} listing(s) selected
          </span>
          <Button
            size="sm"
            className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={bulkPublishMutation.isPending}
            onClick={handleBulkPublish}
          >
            <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
            Publish Selected to Marketplace
          </Button>
          <button
            onClick={() => setSelectedIds([])}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Deselect
          </button>
        </div>
      )}

      {/* Contextual Right Slide-over Drawer (Screen 23C) */}
      {drawerListing && (
        <ContextDrawer
          open={Boolean(drawerListing)}
          onClose={() => setDrawerListing(null)}
          title={drawerListing.productTitle}
          description={`LISTING · ${drawerListing.channelName.toUpperCase()}`}
          footer={
            <div className="flex w-full gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setDrawerListing(null)}
              >
                Close
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  const id = drawerListing.id;
                  setDrawerListing(null);
                  navigate(`${ROUTES.LISTINGS}/${id}`);
                }}
              >
                Open Studio
              </Button>
            </div>
          }
        >
          <div className="space-y-6 text-xs">
            {drawerListing.imageUrl && (
              <img
                src={drawerListing.imageUrl}
                alt=""
                className="h-44 w-full rounded-lg object-cover border border-border"
              />
            )}

            <div className="space-y-3">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Marketplace</span>
                <span className="font-semibold text-foreground">
                  {drawerListing.channelName}
                </span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Status</span>
                <StatusPill status={drawerListing.status} />
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Selling Price</span>
                <span className="font-semibold text-foreground">
                  {formatINR(drawerListing.sellingPrice)}
                </span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Readiness</span>
                <span className="font-mono font-bold text-foreground">
                  {drawerListing.readinessScore}%
                </span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Last Synced</span>
                <span className="text-muted-foreground">
                  {formatRelativeTime(drawerListing.lastSyncAt)}
                </span>
              </div>
            </div>

            {drawerListing.syncErrors && drawerListing.syncErrors.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-destructive space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Sync Failure Reason:
                </p>
                <p className="text-[11px] leading-relaxed">
                  {drawerListing.syncErrors[0]}
                </p>
              </div>
            )}
          </div>
        </ContextDrawer>
      )}
    </div>
  );
}
