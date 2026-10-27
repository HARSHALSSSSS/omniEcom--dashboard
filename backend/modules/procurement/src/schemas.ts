import { z } from 'zod';
import { schema } from '@oms/database';
import { IsoDate } from '@oms/contracts';
import { isGstin } from './domain';

// ---------------------------------------------------------------- shared bits
const Minor = z.number().int().min(0).max(1_000_000_000);
const Qty = z.number().int().min(1).max(1_000_000);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const Text = (max: number) => z.string().trim().max(max);

// ---------------------------------------------------------------- suppliers
const GstinSchema = z.string().trim().transform((v) => v.toUpperCase()).refine(isGstin, 'GSTIN must be 15 characters: state code, PAN, entity number, Z, check character');
const SupplierCode = z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'letters, digits, - and _').transform((v) => v.toUpperCase());
const SupplierFields = {
  contactPerson: Text(120).nullable(), email: z.email().max(200).nullable(), phone: Text(30).nullable(), gstin: GstinSchema.nullable(), city: Text(100).nullable(), state: Text(100).nullable(),
  address: z.record(z.string(), z.unknown()), paymentTerms: Text(100).nullable(), leadTimeDays: z.number().int().min(0).max(365), currency: z.string().length(3).toUpperCase(),
  status: z.enum(schema.SUPPLIER_STATUSES), notes: Text(2000).nullable(),
};
export const SupplierCreateBody = z.object(SupplierFields).partial().extend({ code: SupplierCode.optional().describe('Unique per business, case-insensitive; generated when omitted'), name: z.string().trim().min(2).max(160) });
export const SupplierUpdateBody = z.object({ code: SupplierCode, name: z.string().trim().min(2).max(160), ...SupplierFields, version: z.number().int().describe('Optimistic lock: the supplier version you read') }).partial();

export const SupplierSchema = z.object({
  id: z.string(), code: z.string(), name: z.string(), contactPerson: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), gstin: z.string().nullable(), city: z.string().nullable(), state: z.string().nullable(),
  location: z.string().nullable().describe('"City, State" for display'), address: z.record(z.string(), z.unknown()), paymentTerms: z.string().nullable(), leadTimeDays: z.number().int(), currency: z.string(),
  status: z.enum(schema.SUPPLIER_STATUSES), notes: z.string().nullable(), version: z.number().int(),
  activeSkusCount: z.number().int().describe('Products on the supplier price list'), openPurchaseOrders: z.number().int().describe('Submitted, acknowledged or part-received purchase orders'),
  deliveredPurchaseOrders: z.number().int().describe('Fully received purchase orders the scorecard is based on'), averageLeadTimeDays: z.number().nullable().describe('Real days from submitting to full receipt; null without deliveries'),
  onTimeRatePercent: z.number().nullable().describe('Share of deliveries received by the expected day; null with fewer than 3 delivered purchase orders'),
  rating: z.number().nullable().describe('0-5 from on-time rate (70%) and undamaged share (30%); null with fewer than 3 delivered purchase orders'),
  createdAt: IsoDate, updatedAt: IsoDate,
}).meta({ id: 'Supplier' });

export const SupplierProductSchema = z.object({
  id: z.string(), variantId: z.string(), sku: z.string(), productTitle: z.string(), supplierSku: z.string().nullable(), costMinor: z.number().int(), variantCostMinor: z.number().int().nullable().describe('The cost on the variant itself, for comparison'),
  leadTimeDays: z.number().int().nullable(), minOrderQuantity: z.number().int(), isPreferred: z.boolean(), updatedAt: IsoDate,
}).meta({ id: 'SupplierProduct' });
export const SupplierProductBody = z.object({
  items: z.array(z.object({ variantId: z.uuid(), supplierSku: Text(100).nullish(), costMinor: Minor, leadTimeDays: z.number().int().min(0).max(365).nullish(), minOrderQuantity: Qty.optional(), isPreferred: z.boolean().optional() })).min(1).max(500),
});

const PoLiteSchema = z.object({ id: z.string(), poNumber: z.string(), status: z.enum(schema.PURCHASE_ORDER_STATUSES), totalMinor: z.number().int(), currency: z.string(), orderDate: IsoDate, expectedAt: IsoDate.nullable() });
export const SupplierDetailSchema = SupplierSchema.extend({ products: z.array(SupplierProductSchema), recentPurchaseOrders: z.array(PoLiteSchema) }).meta({ id: 'SupplierDetail' });

export const SupplierListQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(), 'filter[status]': z.enum(schema.SUPPLIER_STATUSES).optional(), sort: z.enum(['name', '-name', 'createdAt', '-createdAt']).default('name'),
});

// ---------------------------------------------------------------- purchase orders
const LineBody = z.object({ variantId: z.uuid(), quantity: Qty, unitCostMinor: Minor.optional().describe('Defaults to the supplier price list, then the variant cost') });
const PoFields = {
  supplierId: z.uuid(), warehouseId: z.uuid().describe('Receiving warehouse; the default warehouse when omitted'), expectedAt: z.coerce.date().nullable(), shippingMinor: Minor,
  paymentTerms: Text(100).nullable(), reference: Text(100).nullable(), notes: Text(2000).nullable(),
};
export const PoCreateBody = z.object(PoFields).partial().extend({ lines: z.array(LineBody).min(1).max(200) });
export const PoUpdateBody = z.object({ ...PoFields, lines: z.array(LineBody).min(1).max(200).describe('Replaces all lines'), version: z.number().int() }).partial();
export const ApproveBody = z.object({ version: z.number().int().optional(), expectedAt: z.coerce.date().optional() });
export const AcknowledgeBody = z.object({ version: z.number().int().optional(), expectedAt: z.coerce.date().optional().describe('The date the supplier confirmed') });
export const ReceiveBody = z.object({
  items: z.array(z.object({ lineId: z.uuid().optional(), variantId: z.uuid().optional(), receivedQuantity: z.number().int().min(0).max(1_000_000).describe('Units that arrived now, good and damaged'), damagedQuantity: z.number().int().min(0).max(1_000_000).optional() })
    .refine((i) => !!i.lineId !== !!i.variantId, 'Send exactly one of lineId or variantId')).min(1).max(200),
  note: Text(1000).nullish(), receiptKey: z.string().trim().min(1).max(100).optional().describe('Repeating a key returns the original receipt and moves no stock'), version: z.number().int().optional(),
});
export const CancelBody = z.object({ reason: z.string().trim().min(3).max(500), version: z.number().int().optional() });
export const FromSuggestionsBody = z.object({ warehouseId: z.uuid().optional(), variantIds: z.array(z.uuid()).min(1).max(500).optional(), dryRun: z.boolean().default(false) });

export const PoListQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(), 'filter[status]': z.enum(schema.PURCHASE_ORDER_STATUSES).optional(), 'filter[supplierId]': z.uuid().optional(), 'filter[warehouseId]': z.uuid().optional(),
  'filter[orderDateFrom]': Day.optional(), 'filter[orderDateTo]': Day.optional().describe('Inclusive'),
  sort: z.enum(['orderDate', '-orderDate', 'expectedAt', '-expectedAt', 'totalMinor', '-totalMinor', 'poNumber', '-poNumber']).default('-orderDate'),
});

const PoStatus = z.enum(schema.PURCHASE_ORDER_STATUSES);
export const PoSummarySchema = z.object({
  id: z.string(), poNumber: z.string(), supplierId: z.string(), supplierName: z.string(), supplierCode: z.string(), warehouseId: z.string(), warehouseName: z.string(), warehouseCode: z.string(), status: PoStatus,
  itemsCount: z.number().int().describe('Lines'), unitsOrdered: z.number().int(), unitsReceived: z.number().int(), unitsDamaged: z.number().int(), unitsOutstanding: z.number().int(),
  currency: z.string(), subtotalMinor: z.number().int(), taxMinor: z.number().int(), shippingMinor: z.number().int(), totalMinor: z.number().int(),
  orderDate: IsoDate, expectedAt: IsoDate.nullable(), submittedAt: IsoDate.nullable(), receivedAt: IsoDate.nullable(), isLate: z.boolean().describe('Open and past the expected day'),
  reference: z.string().nullable(), notes: z.string().nullable(), version: z.number().int(), createdAt: IsoDate, updatedAt: IsoDate,
}).meta({ id: 'PurchaseOrderSummary' });

export const PoLineSchema = z.object({
  id: z.string(), variantId: z.string(), sku: z.string(), title: z.string(), quantityOrdered: z.number().int(), quantityReceived: z.number().int(), quantityDamaged: z.number().int(), quantityOutstanding: z.number().int(),
  unitCostMinor: z.number().int(), taxRateBps: z.number().int(), taxMinor: z.number().int(), totalMinor: z.number().int().describe('Quantity x unit cost, before tax'),
}).meta({ id: 'PurchaseOrderLine' });

export const PoSchema = PoSummarySchema.extend({
  paymentTerms: z.string().nullable(), cancelReason: z.string().nullable(), acknowledgedAt: IsoDate.nullable(), cancelledAt: IsoDate.nullable(), approvedBy: z.string().nullable(), approvedAt: IsoDate.nullable(), createdBy: z.string().nullable(),
  supplier: z.object({ id: z.string(), code: z.string(), name: z.string(), contactPerson: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), gstin: z.string().nullable(), city: z.string().nullable(), state: z.string().nullable(), status: z.string() }),
  warehouse: z.object({ id: z.string(), code: z.string(), name: z.string() }),
  lines: z.array(PoLineSchema),
  receipts: z.array(z.object({
    id: z.string(), receivedAt: IsoDate, receivedBy: z.object({ id: z.string(), name: z.string().nullable() }).nullable(), note: z.string().nullable(),
    items: z.array(z.object({ lineId: z.string(), variantId: z.string(), sku: z.string().nullable(), received: z.number().int(), damaged: z.number().int() })),
  })),
  timeline: z.array(z.object({ at: IsoDate, type: z.string(), label: z.string(), actorId: z.string().nullable(), actorName: z.string().nullable(), note: z.string().nullable() })),
}).meta({ id: 'PurchaseOrder' });

export const ReceiptResultSchema = z.object({ purchaseOrder: PoSchema, receiptId: z.string(), duplicate: z.boolean() });
export const CancelResultSchema = z.object({ purchaseOrder: PoSchema, releasedUnits: z.number().int() });

// ---------------------------------------------------------------- overview + suggestions
export const SuggestionSchema = z.object({
  variantId: z.string(), sku: z.string(), title: z.string().nullable(), available: z.number().int(), unitsPerDay: z.number(), daysOfCover: z.number().nullable(), reorderLevel: z.number().int().nullable(),
  suggestedUnits: z.number().int(), onOrderUnits: z.number().int().describe('Already owed by draft and open purchase orders'), netUnits: z.number().int(),
  supplier: z.object({ id: z.string(), name: z.string(), costMinor: z.number().int(), minOrderQuantity: z.number().int(), leadTimeDays: z.number().int(), isPreferred: z.boolean() }).nullable(),
}).meta({ id: 'ReorderSuggestion' });

export const OverviewSchema = z.object({
  openPurchaseOrders: z.number().int(), unitsInTransit: z.number().int(), valueInTransitMinor: z.number().int().describe('Outstanding units x unit cost of open purchase orders, before tax'), latePurchaseOrders: z.number().int(), dueThisWeek: z.number().int(),
  warehousesCount: z.number().int(), warehousesWithInbound: z.number().int(), activeSuppliers: z.number().int(), totalSuppliers: z.number().int(),
  averageLeadTimeDays: z.number().nullable().describe('From real receipts; null without a delivered purchase order'), configuredLeadTimeDays: z.number().nullable().describe('Average of the lead times set on active suppliers'),
  leadTimeBySupplier: z.array(z.object({ supplierId: z.string(), supplierName: z.string().nullable(), averageLeadTimeDays: z.number().nullable(), deliveredPurchaseOrders: z.number().int() })),
  statusCounts: z.record(z.string(), z.number().int()), reorderSuggestionsCount: z.number().int(),
  awaitingApproval: z.number().int().describe('Draft purchase orders: the lifecycle is draft -> approve (submitted) -> acknowledged -> received, so a draft is what waits for a person with procurement:approve'),
  belowCoverCount: z.number().int().describe('Reorder suggestions whose days of cover are shorter than the lead time of the supplier that would deliver them (a variant nobody supplies uses the average lead time of the active suppliers and is left out when there is none)'),
  setupIncompleteSuppliers: z.number().int().describe('Active suppliers that cannot be ordered from properly yet: no contact email, or no product on their list'),
}).meta({ id: 'ProcurementOverview' });

export const FromSuggestionsResultSchema = z.object({
  dryRun: z.boolean(), warehouseId: z.string(),
  orders: z.array(z.object({ id: z.string().nullable(), poNumber: z.string().nullable(), supplierId: z.string(), supplierName: z.string(), lines: z.number().int(), units: z.number().int(), totalMinor: z.number().int(), skus: z.array(z.string()) })),
  unassigned: z.array(z.object({ variantId: z.string(), sku: z.string(), suggestedUnits: z.number().int(), reason: z.literal('no_supplier') })),
});

// ---------------------------------------------------------------- line picker
export const VariantSearchQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(), 'filter[supplierId]': z.uuid().optional().describe('Adds that supplier\'s price, MOQ and lead time and lists its products first'),
  'filter[supplied]': z.enum(['true', 'false']).optional().describe('`true` (with a supplier) lists only products on the supplier price list').transform((v) => v === 'true'),
});
export const VariantOfferSchema = z.object({
  variantId: z.string(), sku: z.string(), title: z.string(), variantCostMinor: z.number().int().nullable(), taxRateBps: z.number().int().describe('GST rate the purchase order line will carry'),
  available: z.number().int(), onHand: z.number().int(), incoming: z.number().int(),
  offer: z.object({ costMinor: z.number().int(), supplierSku: z.string().nullable(), minOrderQuantity: z.number().int(), leadTimeDays: z.number().int().nullable(), isPreferred: z.boolean() }).nullable(),
}).meta({ id: 'PurchaseOrderVariantOffer' });

export const Day2Date =(day: string, addDays = 0): Date => new Date(Date.parse(`${day}T00:00:00.000Z`) + addDays * 86_400_000);
