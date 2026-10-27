/** Procurement screen: DTOs of the supplier, purchase order and reorder endpoints. Money is always integer minor units (paise). */

export const PO_STATUSES = ["draft", "submitted", "acknowledged", "partially_received", "received", "cancelled"] as const;
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];

export const SUPPLIER_STATUSES = ["active", "inactive", "blocked"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export type ProcurementTab = "overview" | "orders" | "suppliers" | "reorder";
export const PROCUREMENT_TABS: readonly ProcurementTab[] = ["overview", "orders", "suppliers", "reorder"];

export const PO_SORTS = ["-orderDate", "orderDate", "-expectedAt", "expectedAt", "-totalMinor", "totalMinor", "-poNumber", "poNumber"] as const;
export type PoSort = (typeof PO_SORTS)[number];

export const SUPPLIER_SORTS = ["name", "-name", "-createdAt", "createdAt"] as const;
export type SupplierSort = (typeof SUPPLIER_SORTS)[number];

// ---------------------------------------------------------------- overview
export interface ProcurementOverview {
  openPurchaseOrders: number;
  unitsInTransit: number;
  valueInTransitMinor: number;
  latePurchaseOrders: number;
  dueThisWeek: number;
  warehousesCount: number;
  warehousesWithInbound: number;
  activeSuppliers: number;
  totalSuppliers: number;
  averageLeadTimeDays: number | null;
  configuredLeadTimeDays: number | null;
  leadTimeBySupplier: Array<{ supplierId: string; supplierName: string | null; averageLeadTimeDays: number | null; deliveredPurchaseOrders: number }>;
  statusCounts: Record<string, number>;
  reorderSuggestionsCount: number;
}

// ---------------------------------------------------------------- purchase orders
export interface PurchaseOrderSummary {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  status: PurchaseOrderStatus;
  /** number of lines, not units */
  itemsCount: number;
  unitsOrdered: number;
  unitsReceived: number;
  unitsDamaged: number;
  unitsOutstanding: number;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  orderDate: string;
  expectedAt: string | null;
  submittedAt: string | null;
  receivedAt: string | null;
  isLate: boolean;
  reference: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderLine {
  id: string;
  variantId: string;
  sku: string;
  title: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityDamaged: number;
  quantityOutstanding: number;
  unitCostMinor: number;
  taxRateBps: number;
  taxMinor: number;
  /** quantity x unit cost, before tax */
  totalMinor: number;
}

export interface PurchaseOrderReceipt {
  id: string;
  receivedAt: string;
  receivedBy: { id: string; name: string | null } | null;
  note: string | null;
  items: Array<{ lineId: string; variantId: string; sku: string | null; received: number; damaged: number }>;
}

export interface PurchaseOrderTimelineEntry {
  at: string;
  type: string;
  label: string;
  actorId: string | null;
  actorName: string | null;
  note: string | null;
}

export interface PurchaseOrder extends PurchaseOrderSummary {
  paymentTerms: string | null;
  cancelReason: string | null;
  acknowledgedAt: string | null;
  cancelledAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  supplier: { id: string; code: string; name: string; contactPerson: string | null; email: string | null; phone: string | null; gstin: string | null; city: string | null; state: string | null; status: string };
  warehouse: { id: string; code: string; name: string };
  lines: PurchaseOrderLine[];
  receipts: PurchaseOrderReceipt[];
  timeline: PurchaseOrderTimelineEntry[];
}

export interface PoPage {
  items: PurchaseOrderSummary[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  /** per status and `all`, for the current filters except the status */
  counts: Record<string, number>;
}

export interface PoFilters {
  q?: string;
  status?: PurchaseOrderStatus;
  supplierId?: string;
  warehouseId?: string;
  /** YYYY-MM-DD */
  from?: string;
  to?: string;
}
export interface PoQuery extends PoFilters {
  sort: PoSort;
  page: number;
  pageSize: number;
}

export interface PoLineInput {
  variantId: string;
  quantity: number;
  /** minor units; left out the server uses the supplier price list, then the variant cost */
  unitCostMinor?: number;
}
export interface PoWrite {
  supplierId?: string;
  warehouseId?: string;
  expectedAt?: string | null;
  shippingMinor?: number;
  paymentTerms?: string | null;
  reference?: string | null;
  notes?: string | null;
  lines: PoLineInput[];
}
export interface PoUpdate extends Partial<PoWrite> {
  version: number;
}

export interface ReceiveInput {
  items: Array<{ lineId: string; receivedQuantity: number; damagedQuantity?: number }>;
  note?: string;
  version?: number;
}
export interface ReceiptResult {
  purchaseOrder: PurchaseOrder;
  receiptId: string;
  duplicate: boolean;
}
export interface CancelResult {
  purchaseOrder: PurchaseOrder;
  releasedUnits: number;
}

// ---------------------------------------------------------------- suppliers
export interface Supplier {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  city: string | null;
  state: string | null;
  location: string | null;
  address: Record<string, unknown>;
  paymentTerms: string | null;
  leadTimeDays: number;
  currency: string;
  status: SupplierStatus;
  notes: string | null;
  version: number;
  activeSkusCount: number;
  openPurchaseOrders: number;
  deliveredPurchaseOrders: number;
  averageLeadTimeDays: number | null;
  /** null until 3 purchase orders were fully received */
  onTimeRatePercent: number | null;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierProduct {
  id: string;
  variantId: string;
  sku: string;
  productTitle: string;
  supplierSku: string | null;
  costMinor: number;
  variantCostMinor: number | null;
  leadTimeDays: number | null;
  minOrderQuantity: number;
  isPreferred: boolean;
  updatedAt: string;
}

export interface SupplierDetail extends Supplier {
  products: SupplierProduct[];
  recentPurchaseOrders: Array<{ id: string; poNumber: string; status: PurchaseOrderStatus; totalMinor: number; currency: string; orderDate: string; expectedAt: string | null }>;
}

export interface SupplierPage {
  items: Supplier[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  counts: Record<string, number>;
}

export interface SupplierQuery {
  q?: string;
  status?: SupplierStatus;
  sort: SupplierSort;
  page: number;
  pageSize: number;
}

export interface SupplierWrite {
  name: string;
  code?: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  gstin?: string | null;
  city?: string | null;
  state?: string | null;
  paymentTerms?: string | null;
  leadTimeDays?: number;
  status?: SupplierStatus;
  notes?: string | null;
}
export type SupplierUpdate = Partial<SupplierWrite> & { version: number };

export interface SupplierProductInput {
  variantId: string;
  supplierSku?: string | null;
  costMinor: number;
  leadTimeDays?: number | null;
  minOrderQuantity?: number;
  isPreferred?: boolean;
}

// ---------------------------------------------------------------- picker, suggestions
export interface VariantOffer {
  variantId: string;
  sku: string;
  title: string;
  variantCostMinor: number | null;
  taxRateBps: number;
  available: number;
  onHand: number;
  incoming: number;
  offer: { costMinor: number; supplierSku: string | null; minOrderQuantity: number; leadTimeDays: number | null; isPreferred: boolean } | null;
}
export interface VariantOfferPage {
  items: VariantOffer[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface ReorderSuggestion {
  variantId: string;
  sku: string;
  title: string | null;
  available: number;
  unitsPerDay: number;
  daysOfCover: number | null;
  reorderLevel: number | null;
  suggestedUnits: number;
  onOrderUnits: number;
  netUnits: number;
  supplier: { id: string; name: string; costMinor: number; minOrderQuantity: number; leadTimeDays: number; isPreferred: boolean } | null;
}

export interface FromSuggestionsResult {
  dryRun: boolean;
  warehouseId: string;
  orders: Array<{ id: string | null; poNumber: string | null; supplierId: string; supplierName: string; lines: number; units: number; totalMinor: number; skus: string[] }>;
  unassigned: Array<{ variantId: string; sku: string; suggestedUnits: number; reason: "no_supplier" }>;
}

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  city: string | null;
  isDefault: boolean;
}
