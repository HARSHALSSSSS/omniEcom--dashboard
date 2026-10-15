
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
      <div className="flex-1 lg:w-[636px] bg-white border border-[#EAEAEA] rounded-xl p-6 flex flex-col justify-between">
        {/* Section Header */}
        <div className="flex flex-col gap-1 pb-1">
          <h2 className="text-[18px] font-semibold text-[#000000] leading-[26px]">
            Inventory health
          </h2>
          <p className="text-[13px] text-[#666666]">
            Your current stock position across all connected channels.
          </p>
        </div>

        {/* Stock Distribution Bar */}
        <div className="flex flex-col gap-2.5 my-2">
          <div className="h-1.5 w-full flex gap-1 rounded-full overflow-hidden bg-neutral-100">
            {/* Healthy: ~94% */}
            <div
              className="h-full bg-[#333333] rounded-l-full"
              style={{ width: "94.3%" }}
              title="Healthy stock"
            />
            {/* Low stock: ~4.3% */}
            <div
              className="h-full bg-[#F59E0B]"
              style={{ width: "4.3%" }}
              title="Low stock"
            />
            {/* Out of stock: ~1.4% */}
            <div
              className="h-full bg-[#EF4444] rounded-r-full"
              style={{ width: "1.4%" }}
              title="Out of stock"
            />
          </div>

          {/* Stock Legend */}
          <div className="flex items-center justify-between text-[10px] text-[#666666]">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#333333]" />
              Healthy / 403 products
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
              Low stock / 18 products
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#EF4444]" />
              Out of stock / 6 products
            </span>
          </div>
        </div>

        {/* Most affected products table */}
        <div className="flex flex-col gap-3 my-2">
          <h3 className="text-[12px] font-semibold text-[#000000]">
            Most affected products
          </h3>

          <div className="border border-[#EAEAEA] rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 bg-[#F5F5F5] px-3 py-2 text-[10px] text-[#666666] font-medium border-b border-[#EAEAEA]">
              <span className="col-span-5">Product</span>
              <span className="col-span-3">SKU</span>
              <span className="col-span-2 text-right">Available</span>
              <span className="col-span-2 text-right">Status</span>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-[#EAEAEA] bg-white">
              {products.map((prod) => (
                <div
                  key={prod.id}
                  className="grid grid-cols-12 items-center px-3 py-3 text-[12px]"
                >
                  <span className="col-span-5 font-semibold text-[#333333] truncate">
                    {prod.name}
                  </span>
                  <span className="col-span-3 text-[11px] text-[#666666] truncate font-mono">
                    {prod.sku}
                  </span>
                  <span className="col-span-2 text-right text-[12px] text-[#333333] tabular-nums">
                    {prod.available}
                  </span>
                  <div className="col-span-2 flex justify-end">
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-normal border ${
                        prod.status === "Out of stock"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
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
            className="text-[12px] font-medium text-[#000000] hover:underline"
          >
            View inventory →
          </Link>
        </div>
      </div>

      {/* Channel Health Card */}
      <div className="w-full lg:w-[476px] bg-white border border-[#EAEAEA] rounded-xl p-6 flex flex-col justify-between shrink-0">
        {/* Section Header */}
        <div className="flex flex-col gap-1 pb-1">
          <h2 className="text-[18px] font-semibold text-[#000000] leading-[26px]">
            Channel health
          </h2>
          <p className="text-[13px] text-[#666666]">
            Connection and sync status
          </p>
        </div>

        {/* Channel Health Rows */}
        <div className="divide-y divide-[#EAEAEA] my-2">
          {channels.map((chan) => {
            const isAttention = chan.status === "Attention";

            return (
              <div
                key={chan.id}
                className="flex items-center justify-between py-3.5 gap-4"
              >
                {/* Identity */}
                <div className="flex flex-col w-20 shrink-0">
                  <span className="text-[12px] font-semibold text-[#000000]">
                    {chan.channel}
                  </span>
                  <span
                    className={`text-[11px] ${
                      isAttention
                        ? "text-[#D97706] font-medium"
                        : "text-[#666666]"
                    }`}
                  >
                    {chan.status}
                  </span>
                </div>

                {/* Connection Status Badge & Last Sync */}
                <div className="flex flex-col items-start gap-1 flex-1">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-normal border ${
                      isAttention
                        ? "bg-[#FEF3C7] border-[#FDE68A] text-[#92400E]"
                        : "bg-[#ECFDF5] border-[#A7F3D0] text-[#166534]"
                    }`}
                  >
                    <Check className="h-3 w-3 stroke-[2.5]" />
                    Connected
                  </span>
                  <span className="text-[11px] text-[#666666]">
                    Last sync: {chan.lastSync}
                  </span>
                </div>

                {/* Action Link */}
                <div className="flex items-center gap-2 shrink-0">
                  {chan.issuesCount ? (
                    <div className="flex flex-col items-end">
                      <span className="text-[11px] font-medium text-[#D97706]">
                        {chan.issuesCount} issues
                      </span>
                      <Link
                        to={chan.actionHref}
                        className="text-[12px] font-medium text-[#D97706] hover:underline"
                      >
                        Review →
                      </Link>
                    </div>
                  ) : (
                    <Link
                      to={chan.actionHref}
                      className="text-[12px] font-medium text-[#000000] hover:underline"
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
        <div className="flex flex-col gap-1.5 pt-2 border-t border-[#EAEAEA]">
          <Link
            to="/marketplace-hub"
            className="text-[12px] font-semibold text-[#000000] hover:underline"
          >
            Manage channels →
          </Link>
          <p className="text-[11px] text-[#666666]">
            Showing sales channels. The priority queue includes all channel
            connections.
          </p>
        </div>
      </div>
    </div>
  );
};
