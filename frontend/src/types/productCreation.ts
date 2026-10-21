/**
 * Types of the product creation flow (Create product screen). They mirror the API contract in
 * backend/modules/catalog/src/creation-schemas.ts, ai-description-routes.ts and modules/documents/src/routes.ts.
 */

export type ProductType = "physical" | "digital" | "service";
export type DimensionUnit = "cm" | "mm" | "in";
export type WeightUnit = "kg" | "g" | "lb";
export type CreationStep = "basic" | "variants" | "inventory" | "listings" | "channels";

export type ReadinessState = "done" | "pending" | "verify" | "confirm" | "duplicate" | "uploading" | "placeholder";
export type FixTarget = "primary_image" | "master_sku" | "category" | "product_name";
export type ImageState = "none" | "uploading" | "placeholder" | "ready";

// ------------------------------------------------------------------------------------------------ form options
export interface FormOptions {
  productTypes: string[];
  gstSlabs: Array<{ bps: number; label: string }>;
  countries: Array<{ code: string; name: string }>;
  materials: Array<{ value: string; label: string }>;
  units: { dimension: "cm"; weight: "kg"; accepted: { dimension: string[]; weight: string[] } };
  limits: {
    titleMin: number;
    titleMax: number;
    descriptionMaxChars: number;
    brandMax: number;
    codeMax: number;
    hsnLengths: number[];
    materialMax: number;
    standardCategoryMax: number;
    gstMaxBps: number;
    customAttributes: { max: number; nameMax: number; valueMax: number };
    dimensionMaxMm: number;
    weightMaxGrams: number;
  };
  image: { maxBytes: number; mimeTypes: string[]; maxPerProduct: number; minShortSidePx: number; recommendedLongSidePx: number };
}

export interface StandardCategorySuggestion {
  value: string;
  productCount: number;
}

/** GET /categories/tree node */
export interface CategoryNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  children: CategoryNode[];
}

export interface Brand {
  id: string;
  name: string;
  confirmed: boolean;
  confirmedAt: string | null;
  productCount?: number;
  createdAt: string;
}

// ------------------------------------------------------------------------------------------------ SKU
export interface SkuCheck {
  code: string;
  normalized: string;
  valid: boolean;
  reason: string | null;
  message: string | null;
  available: boolean;
  conflict: { type: "product"; id: string; title: string; code: string } | null;
  similar: Array<{ type: "variant"; sku: string; productId: string }>;
  suggestion: string | null;
}
export type SkuVerify = SkuCheck & { verified: true };

// ------------------------------------------------------------------------------------------------ readiness
export interface ReadinessItem {
  key: string;
  label: string;
  state: ReadinessState;
  tag?: string;
}
export interface ReadinessBlocker {
  key: string;
  state: ReadinessState;
  message: string;
  fixTarget: FixTarget;
}
export interface CreationReadiness {
  percent: number;
  required: ReadinessItem[];
  recommended: ReadinessItem[];
  blockers: ReadinessBlocker[];
  hints: string[];
  channels: Array<{ code: string; name: string }>;
  chain: string[];
}

// ------------------------------------------------------------------------------------------------ the product in the editor
export interface CustomAttribute {
  name: string;
  value: string;
  confirmed: boolean;
}

export interface ProductEditor {
  id: string;
  productCode: string;
  title: string;
  description: string | null;
  descriptionHtml: string | null;
  brand: string | null;
  manufacturer: string | null;
  countryOfOrigin: string | null;
  categoryId: string | null;
  hsnCode: string | null;
  gstRateBps: number | null;
  tags: string[];
  dimensions: { length: number; width: number; height: number; unit: "cm" } | null;
  dimensionsMm: { length: number; width: number; height: number } | null;
  weight: { value: number; unit: "kg" } | null;
  weightGrams: number | null;
  material: string | null;
  standardCategory: string | null;
  customAttributes: CustomAttribute[];
  productType: ProductType;
  status: "draft" | "active" | "archived";
  productCodeLocked: boolean;
  variantCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string } | null;
  brandRecord: { id: string; name: string; confirmed: boolean } | null;
  primaryImage: { state: ImageState; documentId: string | null; url: string | null };
}

export interface CreationDto {
  product: ProductEditor;
  creation: {
    currentStep: CreationStep;
    completedSteps: string[];
    savedAt: string;
    version: number;
    codeIsPlaceholder: boolean;
  };
  readiness: CreationReadiness;
}

export interface DraftListItem {
  id: string;
  title: string;
  code: string;
  codeIsPlaceholder: boolean;
  thumbnailUrl: string | null;
  savedAt: string;
  readinessPercent: number;
  currentStep: CreationStep;
  version: number;
}

// ------------------------------------------------------------------------------------------------ request bodies
export interface DimensionsBody {
  length: number;
  width: number;
  height: number;
  unit: DimensionUnit;
}
export interface WeightBody {
  value: number;
  unit: WeightUnit;
}

/** the fields of a draft save / step values; `undefined` = not sent, `null` = clear */
export interface DraftValues {
  productCode?: string | null;
  title?: string;
  description?: string | null;
  descriptionHtml?: string | null;
  brand?: string | null;
  countryOfOrigin?: string | null;
  categoryId?: string | null;
  hsnCode?: string | null;
  gstRateBps?: number | null;
  productType?: ProductType;
  material?: string | null;
  standardCategory?: string | null;
  dimensions?: DimensionsBody | null;
  weight?: WeightBody | null;
  customAttributes?: Array<{ name: string; value: string; confirmed?: boolean }> | null;
}

export interface PreviewValues {
  productCode?: string | null;
  title?: string | null;
  categoryId?: string | null;
  productType?: ProductType;
  brand?: string | null;
  description?: string | null;
  descriptionHtml?: string | null;
  customAttributes?: Array<{ name?: string; value?: string }> | null;
}

export interface StepIssue {
  field: string;
  code: string;
  message: string;
}
export interface ValidateStepResult {
  valid: boolean;
  errors: StepIssue[];
  warnings: StepIssue[];
  readiness: CreationReadiness;
}

// ------------------------------------------------------------------------------------------------ documents
export interface DocumentDto {
  id: string;
  productId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  isPrimary: boolean;
  isPlaceholder: boolean;
  width: number | null;
  height: number | null;
  warnings: Array<"low_resolution">;
  status: "pending_upload" | "uploaded" | "processed" | "rejected";
  downloadUrl: string | null;
  createdAt: string;
}
export interface UploadInstruction {
  strategy: "presigned" | "api";
  method: string;
  url: string;
  headers: Record<string, string>;
}
export interface RegisteredDocument {
  document: DocumentDto;
  upload: UploadInstruction;
}
export interface PrimaryImage {
  state: ImageState;
  document: DocumentDto | null;
}

// ------------------------------------------------------------------------------------------------ AI
export type AiMode = "rewrite" | "concise" | "benefits";
export interface AiSuggestion {
  id: string;
  productId: string;
  mode: AiMode;
  text: string;
  html: string;
  basis: string[];
  needsFacts: boolean;
  unchanged: boolean;
  status: string;
  applied: boolean;
  note: string;
  explanation: string;
  provider: string;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
}
export interface AiApplied {
  suggestion: AiSuggestion;
  text: string;
  html: string;
  product?: { id: string; description: string | null; descriptionHtml: string | null; status: string; version: number; updatedAt: string };
}
