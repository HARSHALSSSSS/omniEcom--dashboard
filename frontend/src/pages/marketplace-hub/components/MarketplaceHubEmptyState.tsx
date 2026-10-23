import React from "react";
import { Plug } from "lucide-react";

interface MarketplaceHubEmptyStateProps {
  onAddChannel: () => void;
  onBrowseConnectors: () => void;
  /** names of the connectors the platform offers, from the directory */
  connectorNames?: string[];
}

export const MarketplaceHubEmptyState: React.FC<MarketplaceHubEmptyStateProps> = ({
  onAddChannel,
  onBrowseConnectors,
  connectorNames = [],
}) => {
  return (
    <div className="w-full">
      {/* Centered Empty State Box */}
      <div className="w-full border border-[#EAEAEA] rounded-2xl bg-white p-16 flex flex-col items-center justify-center text-center space-y-5 min-h-[420px]">
        {/* Plug Icon Container */}
        <div className="w-10 h-10 rounded-xl bg-[#F5F5F5] border border-[#EAEAEA] flex items-center justify-center text-black">
          <Plug className="w-4 h-4 stroke-[1.8]" />
        </div>

        {/* Text */}
        <div className="space-y-1 max-w-md">
          <h2 className="text-[18px] font-semibold text-black">
            Connect where you sell
          </h2>
          <p className="text-[13px] text-[#666666] leading-relaxed">
            Bring products, orders and inventory from your sales channels into one workspace.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onAddChannel}
            className="h-9 px-5 rounded-lg bg-black text-white text-[13px] font-semibold hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Add channel
          </button>
          <button
            type="button"
            onClick={onBrowseConnectors}
            className="h-9 px-5 rounded-lg border border-[#BDBDBD] text-[13px] font-semibold text-black hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            Browse connectors
          </button>
        </div>

        {/* Sub-meta */}
        {connectorNames.length > 0 && (
          <div className="space-y-1 pt-6 text-[12px] text-[#666666]">
            <div>{connectorNames.join(" · ")}</div>
          </div>
        )}
      </div>
    </div>
  );
};
