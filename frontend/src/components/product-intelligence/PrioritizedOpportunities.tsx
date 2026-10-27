import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export interface OpportunityCardData {
  id: string;
  sku: string;
  priorityLabel: string;
  badgeLabel: string;
  badgeTone: "red" | "amber" | "yellow";
  title: string;
  description: string;
  recommendation: string;
}

const DEFAULT_OPPORTUNITIES: OpportunityCardData[] = [
  {
    id: "opp-1",
    sku: "NL-THR-002",
    priorityLabel: "P1 · Review first",
    badgeLabel: "Stock risk",
    badgeTone: "red",
    title: "Cotton throw",
    description: "5 days of cover vs a 12-day lead time. 50 units on hand; September sold 10 units/day.",
    recommendation: "Check incoming stock before creating a purchase order.",
  },
  {
    id: "opp-2",
    sku: "NL-DIN-004",
    priorityLabel: "P2 · Review margin",
    badgeLabel: "Margin gap",
    badgeTone: "amber",
    title: "Stoneware dinner set",
    description: "28.0% gross margin vs 32.0% overall. ₹3.00L in net sales and ₹84,000 gross profit.",
    recommendation: "Inspect unit costs and discounts before changing price.",
  },
  {
    id: "opp-3",
    sku: "NL-CUS-005",
    priorityLabel: "P3 · Review inventory",
    badgeLabel: "Slow mover",
    badgeTone: "yellow",
    title: "Linen cushion",
    description: "72 days of cover vs a 60-day review threshold. 600 units on hand; 250 sold in September.",
    recommendation: "Review channel demand before planning a promotion.",
  },
];

const TONE_CLASSES = {
  red: "bg-red-100 text-red-800 border-red-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
};

interface PrioritizedOpportunitiesProps {
  opportunities?: OpportunityCardData[];
  onInspectProduct: (sku: string, title: string) => void;
}

export function PrioritizedOpportunities({
  opportunities = DEFAULT_OPPORTUNITIES,
  onInspectProduct,
}: PrioritizedOpportunitiesProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">Prioritized opportunities</h2>
        <span className="text-xs text-muted-foreground">{opportunities.length} products · Review suggestions only</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {opportunities.map((opp) => (
          <div
            key={opp.id}
            className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-2xs transition-shadow hover:shadow-xs"
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{opp.priorityLabel}</span>
                <span
                  className={cn(
                    "rounded border px-2 py-0.5 text-[10px] font-semibold",
                    TONE_CLASSES[opp.badgeTone]
                  )}
                >
                  {opp.badgeLabel}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-foreground">{opp.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{opp.description}</p>
              </div>

              <p className="text-[11px] font-medium text-foreground">{opp.recommendation}</p>
            </div>

            <div className="mt-4 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between text-xs"
                onClick={() => onInspectProduct(opp.sku, opp.title)}
              >
                <span>Inspect product</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Priority: cover below lead time → margin below 32% with ≥ ₹3.00L net sales → cover above 60 days. Other margin gaps are monitored. No changes applied.
      </p>
    </div>
  );
}
