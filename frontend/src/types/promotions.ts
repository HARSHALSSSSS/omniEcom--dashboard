export type PromotionType = "percentage_discount" | "flat_discount" | "bogo" | "bundle";
export type PromotionStatus = "draft" | "active" | "scheduled" | "ended";

export interface PromotionCampaign {
  id: string;
  name: string;
  code: string;
  type: PromotionType;
  value: number; // e.g. 15 for 15% or 200 for ₹200
  channels: ("Amazon" | "Flipkart" | "Shopify" | "Meesho")[];
  startDate: string;
  endDate: string;
  status: PromotionStatus;
  budget?: number;
  spendToDate: number;
  revenueGenerated: number;
  unitsMoved: number;
  minOrderValue?: number;
}

export interface PromotionProductLink {
  id: string;
  campaignId: string;
  campaignName: string;
  productId: string;
  productName: string;
  sku: string;
  channel: string;
  originalPrice: number;
  promoPrice: number;
  status: "eligible" | "pending_sync" | "live" | "ineligible";
}
