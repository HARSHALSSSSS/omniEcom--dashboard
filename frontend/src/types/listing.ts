import { z } from "zod";

export type ListingStatus =
  | "live"
  | "ready"
  | "needs_review"
  | "syncing"
  | "failed"
  | "blocked"
  | "not_listed";

export interface ChannelListingItem {
  id: string;
  productId: string;
  productTitle: string;
  sku: string;
  barcode?: string;
  imageUrl?: string;
  channel: "amazon" | "flipkart" | "meesho" | "shopify";
  channelName: string;
  channelListingId?: string; // ASIN, FSN, Shopify Product ID
  channelSku?: string;
  category: string;
  status: ListingStatus;
  sellingPrice: number;
  mrp: number;
  stock: number;
  readinessScore: number; // 0 to 100
  lastSyncAt: string;
  publishedAt?: string;
  syncErrors?: string[];
  blockers?: string[];
  attributes?: Record<string, string>;
  qualityScore?: number; // 0 to 10
}

export interface ListingStudioData {
  listing: ChannelListingItem;
  content: {
    title: string;
    description: string;
    bulletPoints: string[];
    searchTerms: string[];
    brand: string;
    manufacturer: string;
  };
  attributes: Array<{
    key: string;
    label: string;
    value: string;
    isRequired: boolean;
    channelSpecific: boolean;
  }>;
  media: Array<{
    id: string;
    url: string;
    isPrimary: boolean;
    aspectRatio: string;
    sizeBytes: number;
  }>;
  variations: Array<{
    id: string;
    sku: string;
    name: string;
    size?: string;
    color?: string;
    price: number;
    stock: number;
    status: ListingStatus;
  }>;
  pricing: {
    sellingPrice: number;
    mrp: number;
    minPrice: number;
    maxPrice: number;
    channelCommissionPct: number;
    estimatedPayout: number;
  };
  readiness: {
    score: number;
    issues: Array<{
      id: string;
      field: string;
      severity: "blocker" | "warning";
      message: string;
      suggestedFix?: string;
    }>;
  };
  activity: Array<{
    id: string;
    timestamp: string;
    action: string;
    actor: string;
    details: string;
  }>;
}

export const updateListingSchema = z.object({
  title: z.string().min(3),
  sellingPrice: z.number().positive(),
  mrp: z.number().positive(),
  attributes: z.record(z.string()).optional(),
});
export type UpdateListingInput = z.infer<typeof updateListingSchema>;

export const publishListingSchema = z.object({
  listingId: z.string(),
  channel: z.enum(["amazon", "flipkart", "meesho", "shopify"]),
});
export type PublishListingInput = z.infer<typeof publishListingSchema>;
