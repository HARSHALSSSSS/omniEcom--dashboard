import { z } from "zod";

export type ImportSourceType = "marketplace" | "csv_excel" | "shopify" | "erp";

export type ImportJobStatus =
  | "pending"
  | "uploading"
  | "analyzing"
  | "mapping"
  | "processing"
  | "completed"
  | "needs_attention"
  | "failed";

export type ImportIssueType =
  | "missing_sku"
  | "category_unmapped"
  | "invalid_image"
  | "duplicate_barcode"
  | "pricing_invalid";

export type IssueResolutionStatus = "open" | "resolved" | "ignored";

export interface ColumnMappingField {
  sourceColumn: string;
  targetField: string;
  confidence: number; // 0 to 100
  sampleValues: string[];
  isRequired: boolean;
  status: "matched" | "unmatched" | "manual";
}

export interface ImportIssue {
  id: string;
  rowNumber: number;
  type: ImportIssueType;
  title: string;
  description: string;
  sourceValue: string | null;
  suggestedFix?: string | null;
  currentFix?: string | null;
  status: IssueResolutionStatus;
  affectedFields: string[];
  productData: {
    sku?: string;
    title: string;
    category?: string;
    price?: number;
    barcode?: string;
    imageUrl?: string;
  };
}

export interface ImportSettings {
  duplicateStrategy: "skip" | "overwrite" | "create_variant";
  defaultCategory: string;
  assignToAllChannels: boolean;
  autoPublishWhenReady: boolean;
  defaultWarehouseId?: string;
}

export interface ImportJob {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  sourceType: ImportSourceType;
  status: ImportJobStatus;
  totalRows: number;
  processedRows: number;
  validRows: number;
  errorRows: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  mappings: ColumnMappingField[];
  settings: ImportSettings;
  issuesCount: {
    total: number;
    resolved: number;
    remaining: number;
  };
}

export const updateMappingSchema = z.object({
  sourceColumn: z.string(),
  targetField: z.string(),
});
export type UpdateMappingInput = z.infer<typeof updateMappingSchema>;

export const resolveIssueSchema = z.object({
  issueId: z.string(),
  action: z.enum(["accept_suggestion", "custom_value", "ignore"]),
  customValue: z.string().optional(),
});
export type ResolveIssueInput = z.infer<typeof resolveIssueSchema>;

export const importSettingsSchema = z.object({
  duplicateStrategy: z.enum(["skip", "overwrite", "create_variant"]),
  defaultCategory: z.string(),
  assignToAllChannels: z.boolean(),
  autoPublishWhenReady: z.boolean(),
  defaultWarehouseId: z.string().optional(),
});
