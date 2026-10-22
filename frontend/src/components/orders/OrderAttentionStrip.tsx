import { formatNumber } from "@/utils/format";
import type { AttentionKey, OrdersWorkspace } from "@/types/orders";

interface Item {
  key: AttentionKey;
  label: string;
  tone: string;
  count: (a: OrdersWorkspace["needsAttention"]) => number;
}

const ITEMS: Item[] = [
  { key: "sla_risk", label: "SLA risk", tone: "text-[#D97706]", count: (a) => a.slaRisk },
  { key: "unprocessed", label: "Unprocessed", tone: "text-[#666666]", count: (a) => a.unprocessed },
  { key: "inventory_issue", label: "Inventory issue", tone: "text-[#DC2626]", count: (a) => a.inventoryIssue },
  { key: "payment_issue", label: "Payment issue", tone: "text-[#D97706]", count: (a) => a.paymentIssue },
  { key: "cancellation_risk", label: "Cancellation risk", tone: "text-[#D97706]", count: (a) => a.cancellationRisk },
  { key: "returns", label: "Returns", tone: "text-[#666666]", count: (a) => a.returns },
];

interface OrderAttentionStripProps {
  workspace: OrdersWorkspace | undefined;
  active: readonly AttentionKey[];
  onToggle: (key: AttentionKey) => void;
}

/** the counts of orders that need a person, each one a filter of the list (the same definitions as the ledger's quick filters) */
export function OrderAttentionStrip({ workspace, active, onToggle }: OrderAttentionStripProps) {
  if (!workspace) return null;
  return (
    <div
      role="group"
      aria-label="Needs attention"
      className="box-border w-full min-h-[40px] px-3 py-1 flex flex-row flex-wrap justify-between items-center gap-x-4 gap-y-1 bg-[#FFFBF5] border-y border-[#EAEAEA]"
    >
      <div className="flex flex-row items-center gap-2">
        <div className="w-[3px] h-[18px] bg-[#D97706] rounded-[2px]" />
        <span className="text-[12px] font-semibold leading-[145%] text-[#000000]">Needs Attention</span>
      </div>

      {ITEMS.map((item) => {
        const on = active.includes(item.key);
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(item.key)}
            className="flex flex-row items-center gap-[5px] hover:opacity-80 transition-opacity cursor-pointer"
          >
            <span className={`text-[12px] font-semibold leading-[145%] ${item.tone}`}>{formatNumber(item.count(workspace.needsAttention))}</span>
            <span className={`text-[12px] leading-[145%] ${on ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"}`}>{item.label}</span>
            <span className="text-[10px] leading-[12px] text-[#666666]" aria-hidden>
              ›
            </span>
          </button>
        );
      })}
    </div>
  );
}
