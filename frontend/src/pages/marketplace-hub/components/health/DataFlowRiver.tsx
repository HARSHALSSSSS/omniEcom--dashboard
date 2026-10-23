import type { HubSyncJob } from "@/types/hub";

interface DataFlowRiverProps {
  productUpdatesCount?: number;
  inventoryUpdatesCount?: number;
  ordersUpdatesCount?: number;
  isInventoryDelayed?: boolean;
  delayedMarketplaceName?: string;
  recentJobs?: HubSyncJob[];
}

export function DataFlowRiver({
  productUpdatesCount = 18,
  inventoryUpdatesCount = 42,
  ordersUpdatesCount = 12,
  isInventoryDelayed = false,
  delayedMarketplaceName = "Meesho",
  recentJobs = [],
}: DataFlowRiverProps) {
  // Format real jobs or use realistic defaults
  const tickerItems = recentJobs.length > 0
    ? recentJobs.slice(0, 4).map((job) => {
        const time = job.startedAt
          ? new Date(job.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
          : "Recently";
        const isFailed = job.status === "failed" || job.status === "partially_failed";
        const isRunning = job.status === "running";
        const typeLabel = job.type.charAt(0).toUpperCase() + job.type.slice(1);
        const statusText = isFailed
          ? "sync delayed"
          : isRunning
          ? "sync running"
          : "sync completed";
        return {
          id: job.id,
          time,
          icon: isFailed ? "- -" : "→",
          text: `${typeLabel} ${statusText}`,
          isFailed,
        };
      })
    : [
        {
          id: "1",
          time: "5:42 PM",
          icon: isInventoryDelayed ? "- -" : "→",
          text: isInventoryDelayed ? `${delayedMarketplaceName} inventory sync delayed` : "Catalog sync completed",
          isFailed: isInventoryDelayed,
        },
        { id: "2", time: "5:39 PM", icon: "→", text: "Amazon inventory sync completed", isFailed: false },
        { id: "3", time: "5:37 PM", icon: "→", text: "Shopify order sync completed", isFailed: false },
        { id: "4", time: "5:34 PM", icon: "→", text: "Flipkart catalog sync completed", isFailed: false },
      ];

  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h3 className="text-[15px] font-bold text-[#111111]">
          Data flow
        </h3>
        <div className="flex items-center gap-4 text-[12px] text-[#737373]">
          <span className="font-semibold text-[#111111]">Sync river · current activity</span>
          <span className="font-semibold text-[#111111]">{productUpdatesCount} product updates</span>
          <span className="font-semibold text-[#111111]">{inventoryUpdatesCount} inventory updates</span>
          <span className="font-semibold text-[#111111]">{ordersUpdatesCount} orders</span>
        </div>
      </div>

      {/* 3 Flow Tracks */}
      <div className="space-y-6 pt-2">
        {/* Track 1: PRODUCTS */}
        <div className="grid grid-cols-12 items-center gap-4 text-[12px]">
          <div className="col-span-2 font-bold tracking-wider text-[#737373] uppercase text-[11px]">
            PRODUCTS
          </div>
          <div className="col-span-10 relative">
            <div className="flex justify-between text-[11px] text-[#737373] mb-1.5">
              <span>Master catalog</span>
              <span>Marketplace</span>
              <span>Workspace</span>
            </div>
            <div className="relative h-2 w-full bg-[#E5E5E5] rounded-full overflow-hidden">
              <div className="absolute left-[45%] h-full w-8 bg-[#000000] rounded-full" />
            </div>
          </div>
        </div>

        {/* Track 2: INVENTORY */}
        <div className="grid grid-cols-12 items-center gap-4 text-[12px]">
          <div className="col-span-2 font-bold tracking-wider text-[#737373] uppercase text-[11px]">
            INVENTORY
          </div>
          <div className="col-span-10 relative">
            <div className="flex justify-between text-[11px] text-[#737373] mb-1.5">
              <span>Inventory</span>
              <span className={isInventoryDelayed ? "text-[#D97706] font-medium" : "text-[#737373]"}>
                {isInventoryDelayed ? `Marketplace · ${delayedMarketplaceName} delayed` : "Marketplace"}
              </span>
              <span>Workspace</span>
            </div>
            {isInventoryDelayed ? (
              <div className="relative h-2 w-full flex items-center">
                <div className="h-[2px] w-[55%] bg-[#000000]" />
                <div className="h-[2px] w-[45%] border-t-2 border-dashed border-[#D97706]" />
                <div className="absolute left-[35%] h-2.5 w-6 bg-[#16A34A] rounded-full" />
              </div>
            ) : (
              <div className="relative h-2 w-full bg-[#E5E5E5] rounded-full overflow-hidden">
                <div className="absolute left-[65%] h-full w-8 bg-[#16A34A] rounded-full" />
              </div>
            )}
          </div>
        </div>

        {/* Track 3: ORDERS */}
        <div className="grid grid-cols-12 items-center gap-4 text-[12px]">
          <div className="col-span-2 font-bold tracking-wider text-[#737373] uppercase text-[11px]">
            ORDERS
          </div>
          <div className="col-span-10 relative">
            <div className="flex justify-between text-[11px] text-[#737373] mb-1.5">
              <span>Marketplace</span>
              <span />
              <span>Workspace</span>
            </div>
            <div className="relative h-2 w-full bg-[#E5E5E5] rounded-full overflow-hidden">
              <div className="absolute left-[70%] h-full w-8 bg-[#16A34A] rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Activity Log Ticker at Bottom */}
      <div className="border-t border-[#F0F0F0] pt-4 flex flex-wrap items-center justify-between gap-4 text-[11px] text-[#737373]">
        {tickerItems.map((item) => (
          <div key={item.id} className="flex items-center gap-1.5">
            <span className="font-medium text-[#111111]">{item.time}</span>
            <span className={item.isFailed ? "text-[#D97706] font-bold" : "text-[#16A34A] font-bold"}>
              {item.icon}
            </span>
            <span className={item.isFailed ? "text-[#D97706] font-medium" : "text-[#525252]"}>
              {item.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
