import { z } from "zod";

export type ProductStatus = "active" | "draft" | "incomplete" | "archived";

export interface ChannelListingStatus {
  channelId: string;
  channelName: "Amazon" | "Flipkart" | "Shopify" | "Meesho" | "Snapdeal" | "QuickCommerce";
  status: "live" | "syncing" | "failed" | "not_listed" | "blocked";
  marketplaceSku?: string;
  price?: number;
  stock?: number;
  lastSyncedAt?: string;
  errors?: string[];
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  barcode?: string;
  title: string;
  options: Record<string, string>; // e.g. { Size: "L", Color: "Black" }
  price: number;
  mrp: number;
  costPrice?: number;
  inventory: number;
  weightGrams?: number;
  status: "active" | "draft" | "archived";
}

export interface ProductMedia {
  id: string;
  url: string;
  isPrimary: boolean;
  altText?: string;
}

export interface ProductAuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export interface Product {
  id: string;
  sku: string;
  title: string;
  brand: string;
  category: string;
  description: string;
  bullets: string[];
  status: ProductStatus;
  price: number;
  mrp: number;
  costPrice: number;
  taxRatePercent: number;
  hsnCode: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
  coverDays: number;
  readinessScore: number; // 0 to 100
  blockers: string[];
  media: ProductMedia[];
  variants: ProductVariant[];
  channels: ChannelListingStatus[];
  attributes: Record<string, string>;
  activity: ProductAuditLog[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductsKpiSummary {
  totalProducts: number;
  activeListings: number;
  lowStockCount: number;
  incompleteCatalogCount: number;
}

export interface ProductFilterParams {
  search?: string;
  status?: string;
  category?: string;
  channel?: string;
  readiness?: "all" | "ready" | "incomplete";
  stockFilter?: "all" | "in_stock" | "low_stock" | "out_of_stock";
  page?: number;
  limit?: number;
  sortBy?: "updatedAt" | "title" | "price" | "stock" | "readinessScore";
  sortOrder?: "asc" | "desc";
}

export const createProductSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  sku: z.string().min(2, "Master SKU is required").regex(/^[A-Z0-9_-]+$/, "SKU must contain only uppercase letters, numbers, hyphens or underscores"),
  brand: z.string().min(1, "Brand is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  bullets: z.array(z.string()).default([]),
  price: z.number().min(0, "Selling price must be non-negative"),
  mrp: z.number().min(0, "MRP must be non-negative"),
  costPrice: z.number().min(0, "Cost price must be non-negative").default(0),
  hsnCode: z.string().min(4, "Valid 4-8 digit HSN code is required"),
  taxRatePercent: z.number().default(18),
  stock: z.number().int().min(0, "Stock must be a positive integer").default(0),
  attributes: z.record(z.string()).default({}),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
