import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, ArrowLeft, Download, RefreshCw, Eye } from "lucide-react";
import { useBulkPublishListings } from "@/hooks/useListings";
import { useToast } from "@/hooks/useToast";
import { ROUTES } from "@/constants/routes";

interface SelectedListingItem {
  id: string;
  title: string;
  sku: string;
  marketplace: string;
  readinessPct: number;
  status: "Ready" | "Live" | "Needs review";
  statusColor: string;
  isReady: boolean;
}

const INITIAL_SELECTED_ITEMS: SelectedListingItem[] = [
  {
    id: "bulk-1",
    title: "Premium Travel Bag",
    sku: "TRV-1042",
    marketplace: "Flipkart",
    readinessPct: 100,
    status: "Ready",
    statusColor: "#16A34A",
    isReady: true,
  },
  {
    id: "bulk-2",
    title: "Classic Backpack",
    sku: "BP-1021",
    marketplace: "Amazon",
    readinessPct: 100,
    status: "Live",
    statusColor: "#16A34A",
    isReady: true,
  },
  {
    id: "bulk-3",
    title: "Premium Travel Bag",
    sku: "TRV-1042",
    marketplace: "Meesho",
    readinessPct: 78,
    status: "Needs review",
    statusColor: "#D97706",
    isReady: false,
  },
];

export default function BulkSelectedListingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const bulkPublishMutation = useBulkPublishListings();

  // Checked state for items (Row 1 & 2 checked by default matching Figma screenshot)
  const [checkedIds, setCheckedIds] = useState<string[]>(["bulk-1", "bulk-2"]);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const totalSelectedCount = 18; // Preserves the 18 selected batch size from Figma

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    if (checkedIds.length === INITIAL_SELECTED_ITEMS.length) {
      setCheckedIds([]);
    } else {
      setCheckedIds(INITIAL_SELECTED_ITEMS.map((item) => item.id));
    }
  };

  const handlePublish = () => {
    if (checkedIds.length === 0) {
      toast({
        title: "No listings selected",
        description: "Please check at least one ready listing to publish.",
        variant: "destructive",
      });
      return;
    }

    bulkPublishMutation.mutate(checkedIds, {
      onSuccess: () => {
        toast({
          title: "Bulk publish triggered!",
          description: `Successfully initiated marketplace publishing for ${checkedIds.length} listings.`,
        });
      },
    });
  };

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      toast({
        title: "Sync completed",
        description: `Refreshed catalog and inventory telemetry for ${checkedIds.length} listings.`,
      });
    }, 1200);
  };

  const handleExport = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      ["Listing,SKU,Marketplace,Readiness,Status"]
        .concat(
          INITIAL_SELECTED_ITEMS.map(
            (i) =>
              `"${i.title}","${i.sku}","${i.marketplace}","${i.readinessPct}%","${i.status}"`,
          ),
        )
        .join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "selected_listings_batch.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export downloaded",
      description: "Downloaded CSV of selected listings batch.",
    });
  };

  const handleUnpublish = () => {
    toast({
      title: "Unpublish requested",
      description: `Queued unpublish command for ${checkedIds.length} listings across connected channels.`,
    });
  };

  return (
    <div className="w-full flex flex-col items-start gap-4 font-['Inter',sans-serif] text-[#000000] pb-24">
      {/* Optional Top Return Link */}
      <div className="w-full flex items-center justify-between text-xs text-[#666666]">
        <button
          onClick={() => navigate(ROUTES.LISTINGS)}
          className="hover:text-black flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>← Back to all listings</span>
        </button>
      </div>

      {/* =========================================================================
          1. TOP FLOATING / STICKY BULK ACTION BAR (Exact Figma design)
         ========================================================================= */}
      <div className="w-full h-12 bg-white border border-[#EAEAEA] rounded-lg px-4 flex items-center justify-between shadow-none">
        {/* Left: Checkbox + Count */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleAll}
            className="w-4 h-4 bg-black rounded flex items-center justify-center text-white cursor-pointer"
            title="Toggle selection"
          >
            {checkedIds.length > 0 && (
              <Check className="w-3 h-3 stroke-[3]" />
            )}
          </button>
          <span className="text-[13px] font-semibold text-black tracking-tight">
            {totalSelectedCount} listings selected
          </span>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-2 relative">
          <button
            type="button"
            onClick={() => navigate(ROUTES.LISTINGS_PUBLISH)}
            className="h-8 px-3 rounded-lg border border-[#BDBDBD] bg-white text-black text-[12px] font-medium hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            Edit content
          </button>

          <button
            type="button"
            onClick={handlePublish}
            disabled={bulkPublishMutation.isPending || checkedIds.length === 0}
            className="h-8 px-4 rounded-lg bg-black text-white text-[12px] font-semibold hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            {bulkPublishMutation.isPending ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Publishing…
              </>
            ) : (
              "Publish"
            )}
          </button>

          <button
            type="button"
            onClick={handleUnpublish}
            className="h-8 px-3 rounded-lg border border-[#BDBDBD] bg-white text-black text-[12px] font-medium hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            Unpublish
          </button>

          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className="h-8 px-3 rounded-lg border border-[#BDBDBD] bg-white text-black text-[12px] font-medium hover:bg-neutral-50 transition-colors cursor-pointer flex items-center gap-1"
          >
            {isSyncing ? (
              <RefreshCw className="w-3 h-3 animate-spin text-[#2563EB]" />
            ) : (
              "Sync"
            )}
          </button>

          <button
            type="button"
            onClick={handleExport}
            className="h-8 px-3 rounded-lg border border-[#BDBDBD] bg-white text-black text-[12px] font-medium hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            Export
          </button>

          {/* More Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMoreMenuOpen((v) => !v)}
              className="h-8 px-3 rounded-lg border border-[#BDBDBD] bg-white text-black text-[12px] font-medium hover:bg-neutral-50 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>More</span>
              <span className="text-[10px]">⌄</span>
            </button>

            {isMoreMenuOpen && (
              <div
                className="absolute right-0 mt-1 w-44 bg-white border border-[#EAEAEA] rounded-lg shadow-lg py-1 z-30 text-[12px]"
                onMouseLeave={() => setIsMoreMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    navigate(ROUTES.LISTINGS_READINESS);
                  }}
                  className="w-full text-left px-3 py-2 text-black hover:bg-neutral-100 flex items-center gap-2 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Audit readiness</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    handleExport();
                  }}
                  className="w-full text-left px-3 py-2 text-black hover:bg-neutral-100 flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Download report</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          2. SELECTED LISTINGS TABLE
         ========================================================================= */}
      <div className="w-full border border-[#EAEAEA] rounded-lg overflow-hidden bg-white shadow-none text-xs">
        {/* Table Header */}
        <div className="h-10 bg-white border-b border-[#EAEAEA] px-4 grid grid-cols-[36px_1fr_140px_140px_160px_120px] items-center text-[12px] font-normal text-[#666666]">
          <div>
            <button
              type="button"
              onClick={toggleAll}
              className="w-4 h-4 bg-black rounded flex items-center justify-center text-white cursor-pointer"
            >
              {checkedIds.length > 0 && (
                <Check className="w-3 h-3 stroke-[3]" />
              )}
            </button>
          </div>
          <div>Listing</div>
          <div>SKU</div>
          <div>Marketplace</div>
          <div>Readiness</div>
          <div>Status</div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-[#EAEAEA]">
          {INITIAL_SELECTED_ITEMS.map((item) => {
            const isChecked = checkedIds.includes(item.id);
            return (
              <div
                key={item.id}
                className="h-12 px-4 grid grid-cols-[36px_1fr_140px_140px_160px_120px] items-center hover:bg-[#FAFAFA] transition-colors"
              >
                {/* Checkbox */}
                <div>
                  <button
                    type="button"
                    onClick={() => toggleCheck(item.id)}
                    className={`w-4 h-4 rounded flex items-center justify-center cursor-pointer transition-colors ${
                      isChecked
                        ? "bg-black text-white"
                        : "border border-[#BDBDBD] bg-white hover:border-black"
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>
                </div>

                {/* Listing Title */}
                <div
                  className={`text-[13px] truncate ${
                    item.isReady ? "font-semibold text-black" : "font-normal text-[#666666]"
                  }`}
                >
                  {item.title}
                </div>

                {/* SKU */}
                <div className="text-[12px] text-[#666666] font-mono">
                  {item.sku}
                </div>

                {/* Marketplace */}
                <div
                  className={`text-[12px] ${
                    item.isReady ? "font-semibold text-black" : "font-normal text-[#666666]"
                  }`}
                >
                  {item.marketplace}
                </div>

                {/* Readiness Score Progress */}
                <div className="flex items-center gap-2.5">
                  <div className="w-16 h-1.5 bg-[#EAEAEA] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${item.readinessPct}%`,
                        backgroundColor: item.statusColor,
                      }}
                    />
                  </div>
                  <span
                    className="font-semibold text-[12px]"
                    style={{ color: item.statusColor }}
                  >
                    {item.readinessPct}%
                  </span>
                </div>

                {/* Status */}
                <div
                  className="font-medium text-[12px]"
                  style={{ color: item.statusColor }}
                >
                  {item.status}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          3. BOTTOM NOTIFICATION / HELPER BANNER
         ========================================================================= */}
      <div className="w-full p-3.5 rounded-lg bg-[#F5F5F5] border border-[#EAEAEA] text-[12px] font-normal text-[#666666]">
        Showing 3 of {totalSelectedCount} selected listings. Review listing readiness before publishing.
      </div>
    </div>
  );
}
