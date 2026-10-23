import { useMemo } from "react";
import { Bookmark, ArrowRight } from "lucide-react";
import type { ChannelConnection, ConnectorDirectoryItem } from "@/types/connection";

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return dateStr;
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

interface ConnectorCardItemProps {
  item: ConnectorDirectoryItem;
  connection?: ChannelConnection;
  isSelectedForCompare: boolean;
  onToggleCompare: (id: string) => void;
  onOpenPreview: (item: ConnectorDirectoryItem) => void;
  onConnect: (id: string) => void;
  onManage: (id: string) => void;
}

const CONNECTOR_METADATA: Record<
  string,
  {
    letter: string;
    pricing: string;
    lastSyncText?: string;
  }
> = {
  amazon_in: { letter: "A", pricing: "₹799 / month · ₹7,999 / year" },
  amazon: { letter: "A", pricing: "₹799 / month · ₹7,999 / year" },
  flipkart: { letter: "F", pricing: "₹499 / month · ₹4,999 / year" },
  meesho: { letter: "M", pricing: "₹299 / month · ₹2,999 / year" },
  shopify: { letter: "S", pricing: "₹599 / month · ₹5,999 / year" },
  snapdeal: { letter: "S", pricing: "₹399 / month · ₹3,999 / year" },
  myntra: { letter: "M", pricing: "₹699 / month · ₹6,999 / year" },
};

export function ConnectorCardItem({
  item,
  connection,
  isSelectedForCompare,
  onToggleCompare,
  onOpenPreview,
  onConnect,
  onManage,
}: ConnectorCardItemProps) {
  const meta = CONNECTOR_METADATA[item.id] || {
    letter: item.name.charAt(0).toUpperCase(),
    pricing: "₹499 / month · ₹4,999 / year",
  };

  const isConnected = !!connection || item.status === "connected";
  const isNeedsAttention = connection
    ? connection.status === "warning" || connection.status === "error"
    : item.status === "needs_attention" || item.id === "meesho";
  const isUnavailable = item.status === "unavailable" || item.id === "snapdeal";
  const isExplore = item.id.includes("social");

  const lastSyncText = useMemo(() => {
    if (connection) {
      if (connection.status === "healthy") {
        return `✓ Healthy · Last sync ${formatRelativeTime(connection.lastSyncAt)}`;
      }
      return `! Needs attention · ${connection.attentionIssue?.issueTitle || `Last sync ${formatRelativeTime(connection.lastSyncAt)}`}`;
    }
    if (item.status === "connected") {
      return "✓ Healthy · Connected to workspace";
    }
    return meta.lastSyncText || null;
  }, [connection, item.status, meta.lastSyncText]);

  return (
    <div
      onClick={() => onOpenPreview(item)}
      className="group relative flex flex-col justify-between rounded-xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm transition-all hover:border-[#D4D4D4] hover:shadow-md cursor-pointer"
    >
      <div>
        {/* Top Header Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Compare Checkbox */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                onToggleCompare(item.id);
              }}
              className="flex items-center justify-center pt-0.5"
            >
              <input
                type="checkbox"
                checked={isSelectedForCompare}
                onChange={() => {}}
                className="h-4 w-4 rounded border-[#D4D4D4] text-[#111111] focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Letter Avatar */}
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#EBEBEB] bg-[#F9F9FA] text-[15px] font-bold text-[#111111]">
              {meta.letter}
            </div>

            {/* Name */}
            <div>
              <h3 className="text-[16px] font-bold text-[#111111] group-hover:text-black transition-colors">
                {item.name}
              </h3>
            </div>
          </div>

          {/* Status Badge */}
          <div>
            {isConnected && !isNeedsAttention && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-medium text-[#16A34A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                Connected
              </span>
            )}
            {isNeedsAttention && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFFBEB] px-2.5 py-1 text-[11px] font-medium text-[#D97706]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
                Needs Attention
              </span>
            )}
            {!isConnected && !isNeedsAttention && !isUnavailable && !isExplore && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F3FF] px-2.5 py-1 text-[11px] font-medium text-[#7C3AED]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#7C3AED]" />
                Available
              </span>
            )}
            {isUnavailable && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F5F5] px-2.5 py-1 text-[11px] font-medium text-[#737373]">
                Available
              </span>
            )}
            {isExplore && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-medium text-[#B45309]">
                EXPLORE
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="mt-3 text-[12px] text-[#666666] line-clamp-2 leading-relaxed">
          {item.description}
        </p>

        {/* Capabilities Section */}
        <div className="mt-4 space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A8A8A]">
            CAPABILITIES
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(() => {
              const labelMap: Record<string, string> = {
                product_import: "Product import",
                listings: "Listings",
                inventory: "Inventory",
                orders: "Orders",
                shipping: "Shipping",
                returns: "Returns",
                promotions: "Promotions",
              };
              const caps = (item.capabilities || [])
                .filter((c) => !c.includes("."))
                .map((c) => labelMap[c] || c.replace("_", " "))
                .slice(0, 4);
              const list = caps.length > 0 ? caps : ["Product import", "Listings", "Inventory", "Orders"];
              return list.map((cap) => {
                const isInventory = cap === "Inventory";
                return (
                  <span
                    key={cap}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-normal transition-colors ${
                      isInventory
                        ? "bg-[#ECFDF5] text-[#15803D] font-medium"
                        : "bg-[#F5F5F5] text-[#525252]"
                    }`}
                  >
                    {cap}
                  </span>
                );
              });
            })()}
          </div>
        </div>

        {/* Status & Sync Sub-line */}
        <div className="mt-3 text-[11px]">
          {isConnected && !isNeedsAttention && (
            <span className="text-[#525252]">
              {lastSyncText || "✓ Healthy · Connected to workspace"}
            </span>
          )}
          {isNeedsAttention && (
            <span className="text-[#D97706] font-medium">
              {lastSyncText || "! Needs attention · Synchronization issue"}
            </span>
          )}
          {!isConnected && !isNeedsAttention && !isUnavailable && !isExplore && (
            <span className="text-[#737373]">Available to connect</span>
          )}
          {isUnavailable && (
            <span className="text-[#737373]">Review supported capabilities</span>
          )}
          {isExplore && (
            <span className="text-[#737373]">Explore · Supported channels only</span>
          )}
        </div>

        {/* Pricing Sub-line */}
        <div className="mt-0.5 text-[11px] text-[#737373]">
          {isExplore ? "Availability depends on permissions" : meta.pricing}
        </div>
      </div>

      {/* Bottom Actions Row */}
      <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-[#F5F5F5]">
        {/* Bookmark Icon */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8A8A8A] hover:bg-[#F5F5F5] hover:text-[#111111] transition-colors"
          title="Bookmark"
        >
          <Bookmark className="h-4 w-4" />
        </button>

        {/* Main CTA */}
        {isConnected ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onManage(item.id);
            }}
            className="flex items-center gap-1 text-[12px] font-semibold text-[#111111] hover:underline px-2 py-1"
          >
            Manage <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : isUnavailable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPreview(item);
            }}
            className="h-8 px-3.5 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors"
          >
            View connector
          </button>
        ) : isExplore ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPreview(item);
            }}
            className="h-8 px-3.5 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors"
          >
            Explore
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConnect(item.id);
            }}
            className="h-8 px-4 rounded-lg bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors shadow-none"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}
