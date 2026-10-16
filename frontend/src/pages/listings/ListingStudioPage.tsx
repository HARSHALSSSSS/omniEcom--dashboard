import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  History,
  Eye,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/common/StatusPill";
import { ROUTES } from "@/constants/routes";
import { useListingStudio, usePublishListing, useUpdateListing } from "@/hooks/useListings";
import { formatINR, formatRelativeTime } from "@/utils/format";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "content", label: "Content & SEO" },
  { id: "attributes", label: "Attributes" },
  { id: "media", label: "Media Runway" },
  { id: "variations", label: "Variations" },
  { id: "pricing", label: "Pricing & Margins" },
  { id: "readiness", label: "Readiness Check" },
  { id: "activity", label: "Activity Log" },
];

export default function ListingStudioPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const listingId = id || "list-msh-03";

  const { data: studioData } = useListingStudio(listingId);
  const publishMutation = usePublishListing();
  const updateMutation = useUpdateListing(listingId);

  const [activeTab, setActiveTab] = useState("overview");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedPrice, setEditedPrice] = useState<number | undefined>(undefined);

  const listing = studioData?.listing;
  const content = studioData?.content;
  const readiness = studioData?.readiness;
  const pricing = studioData?.pricing;

  const currentTitle = editedTitle || content?.title || listing?.productTitle || "";
  const currentPrice = editedPrice ?? listing?.sellingPrice ?? 2899;

  const handlePublish = () => {
    publishMutation.mutate(listingId);
  };

  const handleSave = () => {
    updateMutation.mutate({
      productTitle: currentTitle,
      sellingPrice: currentPrice,
    });
  };

  return (
    <div className="w-full space-y-6 pb-24">
      {/* Page Header */}
      <PageHeader
        eyebrow={`CHANNEL STUDIO · ${listing?.channelName.toUpperCase() ?? "MEESHO"}`}
        title={listing?.productTitle ?? "Traverse All-Weather Travel Jacket"}
        description={`Configure marketplace-specific tags, image specifications, and attributes for ${listing?.channelName ?? "Meesho"}.`}
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(ROUTES.LISTINGS)}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Listings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              Save Changes
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handlePublish}
              disabled={publishMutation.isPending}
            >
              <UploadCloud className="h-4 w-4" />
              {listing?.status === "failed" ? "Fix & Retry Publish" : "Publish to Channel"}
            </Button>
          </div>
        }
      />

      {/* Failure / Warning Banner if listing has errors (Screen 24 - Publish failure) */}
      {listing?.status === "failed" && (
        <div className="flex items-start justify-between rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-destructive shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-rose-950">
                Publication Rejected by {listing.channelName}
              </h4>
              <p className="mt-0.5 text-xs text-rose-800">
                {listing.syncErrors?.[0] ?? "Validation checks failed on marketplace ingestion."}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs bg-rose-700 hover:bg-rose-800 text-white"
            onClick={handlePublish}
            disabled={publishMutation.isPending}
          >
            Retry Now
          </Button>
        </div>
      )}

      {/* Tabs Row */}
      <div className="flex items-center gap-1 border-b border-border pb-1 overflow-x-auto text-xs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
              <h3 className="text-base font-semibold text-foreground">
                Channel Listing Specifications
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="text-muted-foreground">Marketplace Category</label>
                  <p className="mt-1 font-semibold text-foreground">
                    {listing?.category}
                  </p>
                </div>
                <div>
                  <label className="text-muted-foreground">Channel SKU</label>
                  <p className="mt-1 font-mono font-semibold text-foreground">
                    {listing?.channelSku ?? listing?.sku}
                  </p>
                </div>
                <div>
                  <label className="text-muted-foreground">Channel ASIN / Identifier</label>
                  <p className="mt-1 font-mono font-semibold text-foreground">
                    {listing?.channelListingId ?? "Pending Creation"}
                  </p>
                </div>
                <div>
                  <label className="text-muted-foreground">Publication State</label>
                  <div className="mt-1">
                    <StatusPill status={listing?.status ?? "needs_review"} />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Preview Box ("What the customer sees") */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Eye className="h-4 w-4" /> Marketplace Customer Preview
              </h4>
              <div className="flex gap-4 rounded-lg border border-border bg-muted/20 p-4">
                {listing?.imageUrl && (
                  <img
                    src={listing.imageUrl}
                    alt=""
                    className="h-24 w-24 rounded-lg object-cover border border-border"
                  />
                )}
                <div className="space-y-1.5 text-xs">
                  <p className="font-bold text-foreground text-sm">{currentTitle}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-bold text-foreground">
                      {formatINR(currentPrice)}
                    </span>
                    <span className="text-muted-foreground line-through">
                      {formatINR(listing?.mrp ?? 4999)}
                    </span>
                    <span className="text-emerald-600 font-semibold text-[11px]">
                      {Math.round((1 - currentPrice / (listing?.mrp ?? 4999)) * 100)}% off
                    </span>
                  </div>
                  <p className="text-muted-foreground line-clamp-2">
                    {content?.description}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Rail: Readiness & Health */}
          <div className="space-y-6 lg:col-span-4">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Readiness Score
                </h4>
                <span className="font-mono text-sm font-bold text-foreground">
                  {readiness?.score ?? 72}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${readiness?.score ?? 72}%` }}
                />
              </div>

              <div className="space-y-2 pt-2">
                {readiness?.issues.map((iss) => (
                  <div
                    key={iss.id}
                    className="rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 text-xs text-rose-900"
                  >
                    <p className="font-semibold">{iss.field}: {iss.message}</p>
                    {iss.suggestedFix && (
                      <p className="mt-1 text-[11px] text-rose-700">
                        Fix: {iss.suggestedFix}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CONTENT & SEO */}
      {activeTab === "content" && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Marketplace Product Title
            </label>
            <Input
              value={currentTitle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditedTitle(e.target.value)
              }
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Description
            </label>
            <Textarea
              rows={4}
              defaultValue={content?.description}
              className="text-xs"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">
              Key Features / Bullet Points
            </label>
            {content?.bulletPoints.map((bp, i) => (
              <Input key={i} defaultValue={bp} className="text-xs" />
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: ATTRIBUTES */}
      {activeTab === "attributes" && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h3 className="text-base font-semibold text-foreground">
            Marketplace Category Attributes
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {studioData?.attributes.map((attr) => (
              <div key={attr.key} className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {attr.label} {attr.isRequired && <span className="text-destructive">*</span>}
                </label>
                <Input defaultValue={attr.value} className="text-xs" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: MEDIA RUNWAY */}
      {activeTab === "media" && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">
              Media Runway & Image Compliance
            </h3>
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              1:1 Square Required
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {studioData?.media.map((med) => (
              <div key={med.id} className="relative rounded-xl border border-border overflow-hidden">
                <img src={med.url} alt="" className="h-44 w-full object-cover" />
                {med.isPrimary && (
                  <span className="absolute top-2 left-2 rounded bg-black/80 px-2 py-0.5 text-[10px] text-white">
                    Primary
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: VARIATIONS */}
      {activeTab === "variations" && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h3 className="text-base font-semibold text-foreground">
            SKU Variations on {listing?.channelName}
          </h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                <tr>
                  <th className="py-3 pl-4 pr-3">SKU</th>
                  <th className="px-3 py-3">Variant Name</th>
                  <th className="px-3 py-3">Price</th>
                  <th className="px-3 py-3">Stock</th>
                  <th className="py-3 pl-3 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {studioData?.variations.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/20">
                    <td className="py-3 pl-4 pr-3 font-mono font-medium">{v.sku}</td>
                    <td className="px-3 py-3">{v.name}</td>
                    <td className="px-3 py-3 font-semibold">{formatINR(v.price)}</td>
                    <td className="px-3 py-3 font-mono">{v.stock}</td>
                    <td className="py-3 pl-3 pr-4">
                      <StatusPill status={v.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: PRICING & MARGINS */}
      {activeTab === "pricing" && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
          <h3 className="text-base font-semibold text-foreground">
            Channel Pricing & Commission Breakdown
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border p-4">
              <label className="text-xs text-muted-foreground">Channel Selling Price</label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  value={currentPrice}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEditedPrice(Number(e.target.value))
                  }
                  className="text-xs font-bold"
                />
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <label className="text-xs text-muted-foreground">Marketplace Commission</label>
              <p className="mt-2 text-lg font-bold text-foreground">
                {pricing?.channelCommissionPct}% (₹0)
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <label className="text-xs text-muted-foreground">Estimated Net Payout</label>
              <p className="mt-2 text-lg font-bold text-emerald-600">
                {formatINR(pricing?.estimatedPayout ?? 2754)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: READINESS CHECK */}
      {activeTab === "readiness" && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h3 className="text-base font-semibold text-foreground">
            Marketplace Gateway Validation
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs">
              <span className="flex items-center gap-2 font-medium text-emerald-950">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Barcode / EAN Registered
              </span>
              <span className="font-mono text-emerald-800">8901234567890</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs">
              <span className="flex items-center gap-2 font-medium text-emerald-950">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Mandatory Category Attributes Complete
              </span>
              <span className="text-emerald-800">5 of 5 passed</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50/40 p-3 text-xs">
              <span className="flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Primary Image Square Aspect Ratio
              </span>
              <span className="text-destructive font-semibold">Failed</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: ACTIVITY LOG */}
      {activeTab === "activity" && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h3 className="text-base font-semibold text-foreground">
            Publication History & Activity
          </h3>
          <div className="space-y-4 pt-2">
            {studioData?.activity.map((act) => (
              <div key={act.id} className="flex items-start gap-3 text-xs border-b border-border pb-3">
                <History className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-foreground">{act.action}</p>
                    <span className="text-[11px] text-muted-foreground">
                      {formatRelativeTime(act.timestamp)}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{act.details}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Actor: {act.actor}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
