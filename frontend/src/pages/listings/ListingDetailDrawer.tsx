import React, { useState } from "react";
import { X, Check, AlertTriangle, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { ChannelListingItem } from "@/types/listing";

interface ListingDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  listing: ChannelListingItem | null;
  onOpenListing: (listingId: string) => void;
  onApplyFix?: (listingId: string, material: string) => void;
}

export const ListingDetailDrawer: React.FC<ListingDetailDrawerProps> = ({
  isOpen,
  onClose,
  listing,
  onOpenListing,
  onApplyFix,
}) => {
  if (!isOpen || !listing) return null;

  // Local state for material resolution & manual fix
  const [isResolved, setIsResolved] = useState(listing.status !== "needs_review");
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState("Cotton");
  const [isApplying, setIsApplying] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const channelLabel = `${listing.channelName} listing`;
  const score = isResolved ? 100 : listing.readinessScore;
  const statusText = isResolved ? "Ready to publish" : "Needs review";

  const handleFixWithAi = () => {
    setIsApplying(true);
    setTimeout(() => {
      setIsApplying(false);
      setIsResolved(true);
      setSuccessToast("Material set to Cotton via AI assist. Readiness score updated to 100%.");
      onApplyFix?.(listing.id, selectedMaterial);
      setTimeout(() => setSuccessToast(null), 4000);
    }, 400);
  };

  const handleManualSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial.trim()) return;
    setIsApplying(true);
    setTimeout(() => {
      setIsApplying(false);
      setIsResolved(true);
      setIsManualEditing(false);
      setSuccessToast(`Material updated to "${selectedMaterial}". Ready to publish.`);
      onApplyFix?.(listing.id, selectedMaterial);
      setTimeout(() => setSuccessToast(null), 4000);
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px] transition-opacity">
      <div className="w-[430px] max-w-[95vw] h-full bg-white shadow-2xl border-l border-[#EAEAEA] flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
        
        {/* =========================================================================
            DRAWER BODY
           ========================================================================= */}
        <div className="p-6 space-y-5">
          {/* Top header row */}
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <span className="text-[13px] font-normal text-[#666666]">
                {channelLabel}
              </span>
              <div className="flex items-center gap-1.5 text-[13px] font-medium">
                {!isResolved ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] stroke-[2.2]" />
                    <span className="text-[#D97706]">{statusText} · {score}%</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] stroke-[2.2]" />
                    <span className="text-[#16A34A]">{statusText} · 100%</span>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 -mr-1 text-neutral-400 hover:text-black rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 stroke-[2]" />
            </button>
          </div>

          {/* Listing Title & Metadata */}
          <div>
            <h2 className="text-[24px] font-semibold text-black tracking-tight leading-tight">
              {listing.productTitle}
            </h2>
            <p className="text-xs text-[#666666] mt-1">
              {listing.sku} · 4 variants · {listing.channelName}
            </p>
          </div>

          {/* Success banner if resolved */}
          {successToast && (
            <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successToast}</span>
            </div>
          )}

          {/* Listing Preview Card */}
          <div className="rounded-xl bg-[#F8F9FA] p-3.5 border border-neutral-100 space-y-2.5">
            <span className="text-[10px] tracking-wider uppercase text-neutral-400 font-semibold block leading-none">
              LISTING PREVIEW · ILLUSTRATIVE
            </span>

            <div className="flex items-center gap-3">
              <img
                src={listing.imageUrl || "https://images.unsplash.com/photo-1544441893-675973e31985?w=300"}
                alt={listing.productTitle}
                className="w-14 h-14 rounded-lg object-cover bg-neutral-200 border border-neutral-200/60 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-xs text-black truncate">
                  {listing.productTitle} — {listing.sku}
                </h4>
                <p className="text-[11px] text-[#666666] mt-0.5">
                  ₹{listing.sellingPrice.toLocaleString()} · illustrative price
                </p>
                <p className="text-[11px] text-[#666666] mt-0.5">
                  {listing.stock} available
                </p>
                <span className="inline-block bg-[#ECEFF1] text-[#37474F] text-[10px] font-medium px-2 py-0.5 rounded-sm mt-1">
                  {listing.channelName}
                </span>
              </div>
            </div>
          </div>

          {/* Listing Completeness */}
          <div className="pt-2 border-t border-[#F0F0F0] space-y-2.5">
            <h3 className="text-[13px] font-semibold text-black">
              Listing completeness
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#16A34A] stroke-[2.5]" />
                <span className="text-black">Title</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#16A34A] stroke-[2.5]" />
                <span className="text-black">Images</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#16A34A] stroke-[2.5]" />
                <span className="text-black">SKU</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#16A34A] stroke-[2.5]" />
                <span className="text-black">Category</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#16A34A] stroke-[2.5]" />
                <span className="text-black">Weight</span>
              </div>

              {/* Material requirement */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {!isResolved ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] stroke-[2.2]" />
                      <span className="text-[#D97706] font-medium">Material</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#16A34A] stroke-[2.5]" />
                      <span className="text-black font-medium">Material: {selectedMaterial}</span>
                    </>
                  )}
                </div>
                {!isResolved && (
                  <span className="text-xs text-neutral-400">
                    Required for this category
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Recommended Material */}
          {!isResolved && (
            <div className="pt-2 border-t border-[#F0F0F0] space-y-2.5">
              <h3 className="text-[13px] font-semibold text-black">
                Recommended material
              </h3>

              {!isManualEditing ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded border border-neutral-300 bg-white text-xs font-medium text-black">
                      {selectedMaterial}
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      Unconfirmed suggestion · requires review
                    </span>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={handleFixWithAi}
                      disabled={isApplying}
                      className="h-8 px-3.5 bg-black text-white text-xs font-semibold rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer flex items-center gap-1.5 shadow-none"
                    >
                      {isApplying ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Applying…
                        </>
                      ) : (
                        "Review suggestion"
                      )}
                    </button>
                    <button
                      onClick={() => setIsManualEditing(true)}
                      className="text-xs text-neutral-600 hover:text-black font-medium cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={handleManualSave} className="space-y-2 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-neutral-600">
                      Specify material for {listing.channelName}:
                    </label>
                    <input
                      type="text"
                      value={selectedMaterial}
                      onChange={(e) => setSelectedMaterial(e.target.value)}
                      placeholder="e.g., Cotton, Polyester, Canvas"
                      required
                      className="w-full h-8 px-2.5 rounded border border-neutral-300 text-xs text-black focus:outline-none focus:ring-1 focus:ring-black"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={isApplying || !selectedMaterial.trim()}
                      className="h-7 px-3 bg-black text-white text-xs font-semibold rounded hover:bg-neutral-800 cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsManualEditing(false)}
                      className="h-7 px-2.5 border border-neutral-300 text-xs text-neutral-700 rounded hover:bg-neutral-100 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Units Available */}
          <div className="pt-2 border-t border-[#F0F0F0]">
            <div className="text-[32px] font-semibold text-black leading-none">
              {listing.stock}
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              units available
            </p>
          </div>
        </div>

        {/* =========================================================================
            BOTTOM ACTIONS
           ========================================================================= */}
        <div className="p-6 pt-4 border-t border-[#EAEAEA] bg-white space-y-2.5">
          <button
            onClick={() => onOpenListing(listing.id)}
            className="w-full h-10 bg-black text-white font-semibold text-xs rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center cursor-pointer shadow-none"
          >
            Open listing
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleFixWithAi}
              disabled={isApplying}
              className="h-9 border border-neutral-300 rounded-lg text-xs font-semibold text-black hover:bg-neutral-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-none"
            >
              <Sparkles className="w-3 h-3 text-neutral-700" />
              Fix with AI
            </button>
            <button
              onClick={() => setIsManualEditing(true)}
              className="h-9 border border-neutral-300 rounded-lg text-xs font-semibold text-black hover:bg-neutral-50 transition-colors flex items-center justify-center cursor-pointer shadow-none"
            >
              Manual Fix
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
