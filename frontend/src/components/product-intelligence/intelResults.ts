import { formatNumber } from "@/utils/format";
import type { GenerateResponse } from "@/types/pricing";
import type { FromSuggestionsResult } from "@/types/procurement";

/** what the recommendation turns into: the actions are drafts and proposals, never a live change */
export function describePoResult(res: FromSuggestionsResult): { title: string; description: string; variant: "success" | "warning" } {
  const created = res.orders.filter((o) => o.poNumber);
  if (created.length > 0) {
    const supplier = created.map((o) => `${o.poNumber} (${o.supplierName})`).join(", ");
    return { title: "Draft purchase order created", description: `${supplier}. Review and approve it in Procurement.`, variant: "success" };
  }
  if (res.unassigned.length > 0) {
    return { title: "No supplier to order from", description: "This variant has no preferred supplier. Add one in Procurement, then try again.", variant: "warning" };
  }
  return { title: "Nothing to order", description: "Stock is already enough for the lead time, so no purchase order was needed.", variant: "warning" };
}

export function describePricingResult(res: GenerateResponse): { title: string; description: string; variant: "success" | "warning" } {
  if (res.queued) return { title: "Price proposals are being prepared", description: "They will appear in Pricing shortly.", variant: "success" };
  const r = res.result;
  if (r.proposed > 0) return { title: "Price proposal created", description: `${formatNumber(r.proposed)} waiting for your review in Pricing.`, variant: "success" };
  if (r.autoApplied > 0) return { title: "Price updated by policy", description: `${formatNumber(r.autoApplied)} applied automatically. See the audit log in Pricing.`, variant: "success" };
  if (r.failed > 0) return { title: "The price proposal failed", description: "Open Pricing to see the reason.", variant: "warning" };
  return { title: "No price change proposed", description: "No active pricing policy proposes a change for this variant. Set one up in Pricing.", variant: "warning" };
}
