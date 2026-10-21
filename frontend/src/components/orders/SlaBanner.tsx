import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OrdersSummary, OrdersWorkspace } from "@/types/orders";

interface SlaBannerProps {
  summary: OrdersSummary | undefined;
  workspace: OrdersWorkspace | undefined;
  onReview: () => void;
}

const plural = (n: number) => `${n} ${n === 1 ? "order" : "orders"}`;

/** shown only while orders are at risk of, or past, their dispatch deadline; the numbers come from the API */
export function SlaBanner({ summary, workspace, onReview }: SlaBannerProps) {
  if (!summary) return null;
  const { atRisk, breached, atRiskMinutes } = summary.sla;
  if (atRisk + breached === 0) return null;

  const parts = [atRisk > 0 ? `${plural(atRisk)} at risk` : null, breached > 0 ? `${plural(breached)} past the deadline` : null].filter(Boolean);
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-white">
          <Clock className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-bold text-rose-950">SLA pressure: {parts.join(", ")}</p>
          <p className="text-[11px] text-rose-800">
            {workspace?.slaPressure.summary ?? `Orders are flagged at risk when they are less than ${atRiskMinutes} minutes from their dispatch deadline.`}
          </p>
        </div>
      </div>
      <Button size="sm" className="h-8 bg-rose-700 text-xs text-white hover:bg-rose-800" onClick={onReview}>
        Review these orders
      </Button>
    </div>
  );
}
