import { Link } from "react-router-dom";
import { AlertTriangle, Check } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { toAppPath } from "@/lib/links";
import { formatNumber } from "@/utils/format";
import type { Dashboard } from "@/types/dashboard";
import { plural, relativeTime } from "./format";

interface InventoryAndChannelsSectionProps {
  /** undefined: the caller may not read inventory, so the card is not rendered */
  inventory?: Dashboard["inventoryHealth"];
  /** undefined: the caller may not read marketplace accounts, so the card is not rendered */
  channels?: Dashboard["channelHealth"];
}

const STATUS_LABEL = { low: "Low stock", out: "Out of stock" } as const;

const InventoryCard: React.FC<{ inventory: NonNullable<Dashboard["inventoryHealth"]> }> = ({ inventory }) => {
  const total = inventory.healthy + inventory.low + inventory.out;
  const segments = [
    { key: "healthy", label: "Healthy", count: inventory.healthy, color: "bg-[#333333]", title: "Healthy stock" },
    { key: "low", label: "Low stock", count: inventory.low, color: "bg-[#F59E0B]", title: "Low stock" },
    { key: "out", label: "Out of stock", count: inventory.out, color: "bg-[#EF4444]", title: "Out of stock" },
  ];
  const summary = segments.map((s) => `${s.label} ${plural(s.count, "product")}`).join(", ");

  return (
    <section
      aria-labelledby="inventory-title"
      className="flex-1 min-w-0 bg-white border border-[#EAEAEA] rounded-[12px] p-6 flex flex-col justify-between"
    >
      <div className="flex flex-col gap-1">
        <h2 id="inventory-title" className="text-[18px] font-semibold text-[#000000] leading-[145%]">
          Inventory health
        </h2>
        <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
          Your current stock position across all connected channels.
        </p>
      </div>

      <div className="flex flex-col gap-2.5 my-3">
        <div
          role="img"
          aria-label={total === 0 ? "No active products yet" : summary}
          className="h-[6px] w-full flex gap-[3px] rounded-[3px] overflow-hidden bg-[#EAEAEA]"
        >
          {total > 0 &&
            segments
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.key}
                  className={`h-full ${s.color}`}
                  style={{ flexGrow: s.count, flexBasis: 0, minWidth: 6 }}
                  title={s.title}
                />
              ))}
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px] font-normal leading-[145%] text-[#666666]">
          {segments.map((s) => (
            <span key={s.key}>
              {s.label} / {plural(s.count, "product")}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 my-2">
        <h3 className="text-[12px] font-semibold text-[#000000] leading-[145%]">Most affected products</h3>

        {inventory.mostAffected.length === 0 ? (
          <p className="border border-[#EAEAEA] rounded-[8px] px-3 py-5 text-[12px] text-[#666666] leading-[145%]">
            {total === 0 ? "No active products yet." : "No products are low or out of stock."}
          </p>
        ) : (
          <div className="border border-[#EAEAEA] rounded-[8px] overflow-hidden">
            <div className="grid grid-cols-4 items-center bg-[#F5F5F5] px-3 h-9 text-[10px] text-[#666666] font-normal leading-[145%]">
              <span>Product</span>
              <span>SKU</span>
              <span>Available</span>
              <span>Status</span>
            </div>
            <ul className="divide-y divide-[#EAEAEA] bg-white">
              {inventory.mostAffected.map((prod) => (
                <li key={`${prod.productId}-${prod.sku}`} className="grid grid-cols-4 items-center px-3 h-[55px] text-[12px]">
                  <span className="font-semibold text-[#333333] leading-[145%] truncate pr-2" title={prod.title}>
                    {prod.title}
                  </span>
                  <span className="text-[11px] font-normal text-[#333333] leading-[145%] truncate font-mono pr-2">
                    {prod.sku}
                  </span>
                  <span className="text-[12px] font-normal text-[#333333] leading-[145%]">
                    {formatNumber(prod.available)}
                  </span>
                  <div className="flex items-center">
                    <span className="inline-flex items-center justify-center px-2 h-[26px] text-[11px] font-normal leading-[145%] text-[#333333] border border-[#EAEAEA] rounded-[4px] bg-white">
                      {STATUS_LABEL[prod.status]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="pt-2">
        <Link to={ROUTES.INVENTORY} className="text-[12px] font-medium text-[#000000] hover:underline leading-[145%]">
          View inventory →
        </Link>
      </div>
    </section>
  );
};

const ChannelCard: React.FC<{ channels: NonNullable<Dashboard["channelHealth"]>; alone: boolean }> = ({
  channels,
  alone,
}) => (
  <section
    aria-labelledby="channels-title"
    className={`w-full ${alone ? "" : "lg:w-[476px]"} bg-white border border-[#EAEAEA] rounded-[12px] p-6 flex flex-col justify-between shrink-0`}
  >
    <div className="flex flex-col gap-1">
      <h2 id="channels-title" className="text-[18px] font-semibold text-[#000000] leading-[145%]">
        Channel health
      </h2>
      <p className="text-[13px] font-normal text-[#666666] leading-[145%]">Connection and sync status</p>
    </div>

    {channels.length === 0 ? (
      <p className="my-6 text-[12px] text-[#666666] leading-[145%]">
        No sales channel is connected yet. Connect one to start syncing orders and stock.
      </p>
    ) : (
      <ul className="flex flex-col my-1">
        {channels.map((chan) => {
          const attention = chan.health === "attention";
          const connected = chan.connection === "connected";
          return (
            <li
              key={chan.channel.accountId ?? chan.channel.code}
              className="flex items-center justify-between h-[66px] border-b border-[#EAEAEA] gap-3"
            >
              <div className="flex flex-col w-[96px] shrink-0 gap-[3px]">
                <span
                  className="text-[12px] font-semibold text-[#000000] leading-[145%] truncate"
                  title={chan.channel.name}
                >
                  {chan.channel.name}
                </span>
                <span
                  className={`text-[11px] font-normal leading-[145%] ${attention ? "text-[#D97706]" : "text-[#666666]"}`}
                >
                  {attention ? "Attention" : "Healthy"}
                </span>
              </div>

              <div className="flex flex-col items-start gap-1 flex-1 min-w-0">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-[4px] px-2 h-[26px] text-[11px] font-normal leading-[145%] text-[#333333] border ${
                    connected ? "bg-[#ECFDF5] border-[#A7F3D0]" : "bg-[#FEF3C7] border-[#FDE68A]"
                  }`}
                >
                  {connected ? (
                    <Check className="h-3 w-3 text-[#16A34A]" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-[#D97706]" aria-hidden="true" />
                  )}
                  {connected ? "Connected" : "Needs attention"}
                </span>
                <span className="text-[10px] font-normal text-[#666666] leading-[145%]">
                  {chan.lastSyncAt ? `Last sync: ${relativeTime(chan.lastSyncAt)}` : "Not synced yet"}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {chan.openIssues > 0 ? (
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-medium text-[#D97706] leading-[145%]">
                      {plural(chan.openIssues, "issue")}
                    </span>
                    <Link
                      to={toAppPath(chan.action.href)}
                      className="text-[12px] font-medium text-[#D97706] hover:underline leading-[145%]"
                    >
                      Review →
                    </Link>
                  </div>
                ) : (
                  <Link
                    to={toAppPath(chan.action.href)}
                    className="text-[12px] font-medium text-[#000000] hover:underline leading-[145%]"
                  >
                    Details →
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    )}

    <div className="flex flex-col gap-1 pt-3">
      <Link to={ROUTES.MARKETPLACE_HUB} className="text-[12px] font-medium text-[#000000] hover:underline leading-[145%]">
        Manage channels →
      </Link>
      <p className="text-[10px] font-normal text-[#666666] leading-[145%]">
        Showing sales channels. The priority queue includes all channel connections.
      </p>
    </div>
  </section>
);

export const InventoryAndChannelsSection: React.FC<InventoryAndChannelsSectionProps> = ({ inventory, channels }) => {
  if (!inventory && !channels) return null;
  return (
    <div className="flex flex-col lg:flex-row items-stretch gap-6 w-full">
      {inventory && <InventoryCard inventory={inventory} />}
      {channels && <ChannelCard channels={channels} alone={!inventory} />}
    </div>
  );
};
