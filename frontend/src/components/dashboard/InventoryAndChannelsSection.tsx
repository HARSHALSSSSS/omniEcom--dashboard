
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import type { AffectedProduct, ChannelHealthStatus } from "@/types/dashboard";

interface InventoryAndChannelsSectionProps {
  products: AffectedProduct[];
  channels: ChannelHealthStatus[];
}

export const InventoryAndChannelsSection: React.FC<
  InventoryAndChannelsSectionProps
> = ({ products, channels }) => {
  return (
    <div className="flex flex-col lg:flex-row items-stretch gap-6 w-full">
      {/* Inventory Health Card */}
      <div className="flex-1 bg-white border border-[#EAEAEA] rounded-[12px] p-6 flex flex-col justify-between">
        {/* Section Header */}
        <div className="flex flex-col gap-1">
          <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
            Inventory health
          </h2>
          <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
            Your current stock position across all connected channels.
          </p>
        </div>

        {/* Stock Distribution Bar: height 6px, radius 3px */}
        <div className="flex flex-col gap-2.5 my-3">
          <div className="h-[6px] w-full flex gap-[3px] rounded-[3px] overflow-hidden">
            {/* Healthy: 549px */}
            <div
              className="h-full bg-[#333333] flex-1"
              title="Healthy stock"
            />
            {/* Low stock: 25px */}
            <div
              className="h-full bg-[#F59E0B] w-[25px] shrink-0"
              title="Low stock"
            />
            {/* Out of stock: 8px */}
            <div
              className="h-full bg-[#EF4444] w-[8px] shrink-0"
              title="Out of stock"
            />
          </div>

          {/* Stock Legend */}
          <div className="flex items-center justify-between text-[10px] font-normal leading-[145%] text-[#666666]">
            <span>Healthy / 403 products</span>
            <span>Low stock / 18 products</span>
            <span>Out of stock / 6 products</span>
          </div>
        </div>

        {/* Most affected products table */}
        <div className="flex flex-col gap-3 my-2">
          <h3 className="text-[12px] font-semibold text-[#000000] leading-[145%]">
            Most affected products
          </h3>

          <div className="border border-[#EAEAEA] rounded-[8px] overflow-hidden">
            {/* Table Header: height 36px, bg #F5F5F5 */}
            <div className="grid grid-cols-4 items-center bg-[#F5F5F5] px-3 h-9 text-[10px] text-[#666666] font-normal leading-[145%]">
              <span>Product</span>
              <span>SKU</span>
              <span>Available</span>
              <span>Status</span>
            </div>

            {/* Table Rows: height 55px each, border-bottom 1px solid #EAEAEA */}
            <div className="divide-y divide-[#EAEAEA] bg-white">
              {products.map((prod) => (
                <div
                  key={prod.id}
                  className="grid grid-cols-4 items-center px-3 h-[55px] text-[12px]"
                >
                  <span className="font-semibold text-[#333333] leading-[145%] truncate pr-2">
                    {prod.name}
                  </span>
                  <span className="text-[11px] font-normal text-[#333333] leading-[145%] truncate font-mono">
                    {prod.sku}
                  </span>
                  <span className="text-[12px] font-normal text-[#333333] leading-[145%]">
                    {prod.available}
                  </span>
                  <div className="flex items-center">
                    <span className="inline-flex items-center justify-center px-2 h-[26px] text-[11px] font-normal leading-[145%] text-[#333333] border border-[#EAEAEA] rounded-[4px] bg-white">
                      {prod.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Inventory Action */}
        <div className="pt-2">
          <Link
            to="/inventory"
            className="text-[12px] font-medium text-[#000000] hover:underline leading-[145%]"
          >
            View inventory →
          </Link>
        </div>
      </div>

      {/* Channel Health Card: width 476px */}
      <div className="w-full lg:w-[476px] bg-white border border-[#EAEAEA] rounded-[12px] p-6 flex flex-col justify-between shrink-0">
        {/* Section Header */}
        <div className="flex flex-col gap-1">
          <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
            Channel health
          </h2>
          <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
            Connection and sync status
          </p>
        </div>

        {/* Channel Health Rows: 66px each, border-bottom 1px solid #EAEAEA */}
        <div className="flex flex-col my-1">
          {channels.map((chan) => {
            const isAttention = chan.status === "Attention";

            return (
              <div
                key={chan.id}
                className="flex items-center justify-between h-[66px] border-b border-[#EAEAEA] gap-3"
              >
                {/* Identity */}
                <div className="flex flex-col w-[80px] shrink-0 gap-[3px]">
                  <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                    {chan.channel}
                  </span>
                  <span
                    className={`text-[11px] font-normal leading-[145%] ${
                      isAttention ? "text-[#D97706]" : "text-[#666666]"
                    }`}
                  >
                    {chan.status}
                  </span>
                </div>

                {/* Connection Status Badge & Last Sync */}
                <div className="flex flex-col items-start gap-1 flex-1">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-[4px] px-2 h-[26px] text-[11px] font-normal leading-[145%] text-[#333333] border ${
                      isAttention
                        ? "bg-[#FEF3C7] border-[#FDE68A]"
                        : "bg-[#ECFDF5] border-[#A7F3D0]"
                    }`}
                  >
                    <Check
                      className={`h-3 w-3 ${
                        isAttention ? "text-[#D97706]" : "text-[#16A34A]"
                      }`}
                    />
                    Connected
                  </span>
                  <span className="text-[10px] font-normal text-[#666666] leading-[145%]">
                    Last sync: {chan.lastSync}
                  </span>
                </div>

                {/* Action Link */}
                <div className="flex items-center gap-2 shrink-0">
                  {chan.issuesCount ? (
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-[#D97706] leading-[145%]">
                        {chan.issuesCount} issues
                      </span>
                      <Link
                        to={chan.actionHref}
                        className="text-[12px] font-medium text-[#D97706] hover:underline leading-[145%]"
                      >
                        Review →
                      </Link>
                    </div>
                  ) : (
                    <Link
                      to={chan.actionHref}
                      className="text-[12px] font-medium text-[#000000] hover:underline leading-[145%]"
                    >
                      Details →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Area */}
        <div className="flex flex-col gap-1 pt-3">
          <Link
            to="/marketplace-hub"
            className="text-[12px] font-medium text-[#000000] hover:underline leading-[145%]"
          >
            Manage channels →
          </Link>
          <p className="text-[10px] font-normal text-[#666666] leading-[145%]">
            Showing sales channels. The priority queue includes all channel
            connections.
          </p>
        </div>
      </div>
    </div>
  );
};

