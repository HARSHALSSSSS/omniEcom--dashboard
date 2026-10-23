import { formatNumber } from "@/utils/format";
import type { HubLane, HubSyncJob } from "@/types/hub";
import { isFailed, jobLabel, jobTime, jobWord, laneLevel } from "./healthModel";

interface DataFlowRiverProps {
  /** the real lanes of the last 24 hours: catalog and listings, inventory, orders */
  productLane?: HubLane;
  inventoryLane?: HubLane;
  orderLane?: HubLane;
  /** names of the connections whose own lane of that stream is failing or degraded */
  delayed?: { products: string[]; inventory: string[]; orders: string[] };
  /** the sync runs of the last 24 hours, newest first */
  recentJobs?: HubSyncJob[];
  /** account id -> name, for the ticker */
  names?: Record<string, string>;
}

function laneText(lane: HubLane | undefined): string {
  if (!lane || lane.jobs === 0) return "No runs in the last 24 h";
  const rate = lane.successRate === null ? "no finished run yet" : `${lane.successRate}% success`;
  return `${rate} · ${lane.finished} finished${lane.failed > 0 ? `, ${lane.failed} failed` : ""} · ${lane.itemsPerHour} items/h`;
}

/** one track of the river: its colour and shape come from the lane's status, never from a fixed picture */
function Track({ label, left, middle, right, lane, delayed }: { label: string; left: string; middle: string; right: string; lane: HubLane | undefined; delayed: string[] }) {
  const level = laneLevel(lane);
  const broken = level === "warning" || level === "error";
  const dot = level === "error" ? "bg-[#DC2626]" : level === "warning" ? "bg-[#D97706]" : level === "idle" ? "bg-[#A3A3A3]" : "bg-[#16A34A]";
  return (
    <div className="grid grid-cols-12 items-center gap-4 text-[12px]" data-lane-status={level}>
      <div className="col-span-2 font-bold tracking-wider text-[#737373] uppercase text-[11px]">{label}</div>
      <div className="col-span-10 relative">
        <div className="flex justify-between text-[11px] text-[#737373] mb-1.5">
          <span>{left}</span>
          <span className={broken ? "text-[#D97706] font-medium" : "text-[#737373]"}>{broken && delayed.length > 0 ? `${middle} · ${delayed.join(", ")} ${level === "error" ? "failing" : "delayed"}` : middle}</span>
          <span>{right}</span>
        </div>
        {broken ? (
          <div className="relative h-2 w-full flex items-center">
            <div className="h-[2px] w-[55%] bg-[#000000]" />
            <div className="h-[2px] w-[45%] border-t-2 border-dashed border-[#D97706]" />
            <div className={`absolute left-[35%] h-2.5 w-6 ${dot} rounded-full`} />
          </div>
        ) : (
          <div className="relative h-2 w-full bg-[#E5E5E5] rounded-full overflow-hidden">
            <div className={`absolute left-[50%] h-full w-8 ${dot} rounded-full`} />
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-[#737373]">{laneText(lane)}</p>
      </div>
    </div>
  );
}

export function DataFlowRiver({ productLane, inventoryLane, orderLane, delayed = { products: [], inventory: [], orders: [] }, recentJobs = [], names = {} }: DataFlowRiverProps) {
  const ticker = recentJobs.slice(0, 4).map((job) => ({
    id: job.id,
    time: jobTime(job),
    failed: isFailed(job) || job.status === "partially_failed",
    text: `${names[job.marketplaceAccountId ?? ""] ?? "Account"} · ${jobLabel(job)} ${jobWord(job)}`,
  }));

  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h3 className="text-[15px] font-bold text-[#111111]">Data flow</h3>
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#737373]">
          <span className="font-semibold text-[#111111]">Sync river · last 24 hours</span>
          <span className="font-semibold text-[#111111]">{formatNumber(productLane?.itemsProcessed ?? 0)} product updates</span>
          <span className="font-semibold text-[#111111]">{formatNumber(inventoryLane?.itemsProcessed ?? 0)} inventory updates</span>
          <span className="font-semibold text-[#111111]">{formatNumber(orderLane?.itemsProcessed ?? 0)} orders</span>
        </div>
      </div>

      <div className="space-y-6 pt-2">
        <Track label="PRODUCTS" left="Master catalog" middle="Marketplace" right="Workspace" lane={productLane} delayed={delayed.products} />
        <Track label="INVENTORY" left="Inventory" middle="Marketplace" right="Workspace" lane={inventoryLane} delayed={delayed.inventory} />
        <Track label="ORDERS" left="Marketplace" middle="" right="Workspace" lane={orderLane} delayed={delayed.orders} />
      </div>

      <div className="border-t border-[#F0F0F0] pt-4 flex flex-wrap items-center justify-between gap-4 text-[11px] text-[#737373]">
        {ticker.length === 0 && <span>No sync runs in the last 24 hours.</span>}
        {ticker.map((item) => (
          <div key={item.id} className="flex items-center gap-1.5">
            <span className="font-medium text-[#111111]">{item.time}</span>
            <span className={item.failed ? "text-[#D97706] font-bold" : "text-[#16A34A] font-bold"}>{item.failed ? "- -" : "→"}</span>
            <span className={item.failed ? "text-[#D97706] font-medium" : "text-[#525252]"}>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
