/** Types of the Edit product screen (GET /products/{id}/edit, change-impact, edit/save, insights, AI description). */

export type ProductType = "physical" | "digital" | "service";
export type ProductStatus = "draft" | "active" | "archived";

export interface CustomAttribute {
  name: string;
  value: string;
  confirmed: boolean;
}

/** the product as the editor shows it (display units: cm, kg) */
export interface EditorProduct {
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
  weight: { value: number; unit: "kg" } | null;
  material: string | null;
  standardCategory: string | null;
  customAttributes: CustomAttribute[];
  productType: ProductType;
  status: ProductStatus;
  productCodeLocked: boolean;
  variantCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string } | null;
  brandRecord: { id: string; name: string; confirmed: boolean } | null;
  primaryImage: { state: "none" | "uploading" | "placeholder" | "ready"; documentId: string | null; url: string | null };
}

export interface ReadinessAction {
  label: string;
  href: string;
}
export interface ReadinessItem {
  key: "core_information" | "product_media" | "required_attributes" | "marketplace_content";
  label: string;
  state: "done" | "pending";
  detail?: string;
  action?: ReadinessAction;
}
export interface EditReadiness {
  percent: number;
  items: ReadinessItem[];
  listings: { total: number; needsReview: number; syncPending: number; failed: number; needsRepublish: number; rejected: number };
}

export interface InsightAction {
  key: string;
  label: string;
  method: "GET" | "POST";
  href: string;
  body?: Record<string, unknown>;
}
export type InsightKey = "description_short" | "few_images";
export interface Insight {
  key: InsightKey;
  severity: "suggestion";
  message: string;
  detail: string;
  actions: InsightAction[];
  data: Record<string, unknown>;
}
export interface DismissedInsight {
  key: InsightKey;
  dismissedAt: string;
  until: string | null;
}

export type ChannelStatus = "active" | "attention" | "pending" | "draft" | "unpublished";

export interface EditorView {
  product: EditorProduct;
  version: number;
  status: ProductStatus;
  locks: { productCode: { locked: boolean; reason: string | null } };
  meta: { productId: string; createdAt: string; updatedAt: string; updatedBy: { id: string; name: string } | null };
  nav: Array<{ key: string; label: string; count?: number }>;
  attributes: {
    configured: number;
    customConfirmed: number;
    slots: Array<{ key: "material" | "dimensions" | "weight" | "countryOfOrigin" | "hsnCode" | "taxInformation"; label: string; supplied: boolean }>;
    note: string | null;
  };
  media: {
    primaryImageUrl: string | null;
    thumbnails: Array<{ id: string; url: string; isPrimary: boolean; isPlaceholder: boolean }>;
    total: number;
  };
  inheritance: {
    channels: Array<{ code: string; name: string; accountId: string; listingId: string; listings: number; listingStatus: ChannelStatus; independentFields: string[] }>;
    text: string;
    limited: boolean;
  };
  readiness: EditReadiness;
  insights: Insight[];
  dismissedInsights: DismissedInsight[];
}

/** the proposed values sent to change-impact and edit/save (only keys that differ from the baseline are sent) */
export interface EditChanges {
  productCode?: string;
  title?: string;
  productType?: ProductType;
  categoryId?: string | null;
  brand?: string | null;
  description?: string | null;
  descriptionHtml?: string | null;
  manufacturer?: string | null;
  material?: string | null;
  standardCategory?: string | null;
  countryOfOrigin?: string | null;
  hsnCode?: string | null;
  gstRateBps?: number | null;
  tags?: string[];
  dimensions?: { length: number; width: number; height: number; unit?: "cm" | "mm" | "in" } | null;
  weight?: { value: number; unit?: "kg" | "g" | "lb" } | null;
  customAttributes?: CustomAttribute[] | null;
}

export type ImpactEffect =
  | "name_inherited"
  | "description_inherited"
  | "brand_inherited"
  | "attribute_inherited"
  | "type_inherited"
  | "may_need_remapping"
  | "independent"
  | "not_live"
  | "unaffected";

export interface ImpactConfirmation {
  title: string;
  message: string;
  mapping?: { from: string | null; to: string | null };
  channels: Array<{ code: string; action: "category_mapping_review" }>;
}

export interface ChangeImpact {
  hasChanges: boolean;
  items: Array<{ field: string; label: string; message: string; formattingOnly?: boolean }>;
  summary: string;
  detail: string | null;
  listings: { potential: number; live: number };
  channels: Array<{
    code: string;
    name: string;
    accountId: string;
    accountName: string;
    listingId: string;
    listings: number;
    effect: ImpactEffect;
    independentFields: string[];
    supportsUpdate: boolean;
    mappingState?: "mapped" | "needs_review";
    suggested?: { marketplaceCategoryId: string | null; marketplaceCategoryName: string | null };
  }>;
  independentNote: string | null;
  notSentNote: string | null;
  requiresConfirmation: boolean;
  confirmation?: ImpactConfirmation;
  errors: Array<{ field: string; code: string; message: string }>;
}

export type SaveChannelState = "sync_pending" | "needs_review" | "needs_republish" | "independent" | "unchanged" | "not_live";

export interface SaveImpact {
  listingsQueued: number;
  channels: Array<{ code: string; name: string; accountId: string; listingId: string; listings: number; state: SaveChannelState }>;
  text: string;
  notSyncedYet: string | null;
  independentNote: string | null;
}

export interface EditSaveResult {
  saved: boolean;
  noChanges: boolean;
  savedAt?: string;
  version: number;
  product?: EditorProduct;
  impact?: SaveImpact;
  readiness?: EditReadiness;
  insights?: Insight[];
}

export interface InsightList {
  items: Insight[];
  dismissed: Array<Insight & DismissedInsight>;
}
export interface InsightDecision {
  key: InsightKey;
  dismissed: boolean;
  until: string | null;
  insights: Insight[];
}

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
  status: "suggested" | "applied" | "dismissed" | "expired";
  applied: boolean;
  note: string;
  explanation: string;
  provider: string;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  alternatives?: Array<Omit<AiSuggestion, "alternatives">>;
}
export interface AiApplied {
  suggestion: AiSuggestion;
  text: string;
  html: string;
}

export interface CategoryOption {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
}

/** details of a 409 VERSION_CONFLICT */
export interface VersionConflictDetails {
  currentVersion: number;
  current: EditorView;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
}
