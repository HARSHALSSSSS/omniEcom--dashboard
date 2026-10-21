import { Link } from "react-router-dom";
import { errorMessage } from "@/api/errors";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCan } from "@/hooks/useCan";
import { useDraftPurchaseOrders, useGeneratePriceProposals } from "@/hooks/useProductIntelligence";
import { toast } from "@/hooks/useToast";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { ProductIntelligenceItem } from "@/types/intelligence";
import { NO_PO_REASON, NO_PRICING_REASON } from "./intelFormat";
import { describePoResult, describePricingResult } from "./intelResults";

const LINK = cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs");

/** the one thing worth doing for this variant (a draft PO, a price proposal or a promotion) plus the links around it */
export function IntelActions({ item }: { item: ProductIntelligenceItem }) {
  const canPo = useCan("procurement:write");
  const canPrice = useCan("pricing:write");
  const draft = useDraftPurchaseOrders();
  const generate = useGeneratePriceProposals();
  const action = item.recommendedAction;
  const sku = encodeURIComponent(item.sku);

  const onDraft = () =>
    draft.mutate(
      { variantIds: [item.variantId] },
      {
        onSuccess: (res) => toast(describePoResult(res)),
        onError: (e) => toast({ title: "Could not create the purchase order", description: errorMessage(e), variant: "destructive" }),
      },
    );
  const onGenerate = () =>
    generate.mutate([item.variantId], {
      onSuccess: (res) => toast(describePricingResult(res)),
      onError: (e) => toast({ title: "Could not generate a price proposal", description: errorMessage(e), variant: "destructive" }),
    });

  return (
    <div className="space-y-3">
      {action === "reorder" && (
        <Button size="sm" className="w-full text-xs" disabled={!canPo || draft.isPending} loading={draft.isPending} title={canPo ? undefined : NO_PO_REASON} onClick={onDraft}>
          Create draft purchase order
          {item.inventory.suggestedReorderUnits ? ` (${formatNumber(item.inventory.suggestedReorderUnits)} units)` : ""}
        </Button>
      )}
      {(action === "raise_price" || action === "liquidate") && (
        <Button size="sm" className="w-full text-xs" disabled={!canPrice || generate.isPending} loading={generate.isPending} title={canPrice ? undefined : NO_PRICING_REASON} onClick={onGenerate}>
          Generate price proposal
        </Button>
      )}
      {action === "promote" && (
        <Link to={ROUTES.PROMOTIONS} className={cn(buttonVariants({ size: "sm" }), "w-full text-xs")}>
          Plan a promotion
        </Link>
      )}

      <div className="flex flex-wrap gap-2">
        <Link to={`${ROUTES.PRODUCTS}/${item.productId}`} className={LINK}>
          Open product
        </Link>
        <Link to={`${ROUTES.LISTINGS}?q=${sku}`} className={LINK}>
          Listings
        </Link>
        <Link to={`${ROUTES.PRICING}?q=${sku}`} className={LINK}>
          Pricing
        </Link>
        {action === "reorder" && (
          <Link to={ROUTES.PROCUREMENT} className={LINK}>
            Procurement
          </Link>
        )}
      </div>
    </div>
  );
}
