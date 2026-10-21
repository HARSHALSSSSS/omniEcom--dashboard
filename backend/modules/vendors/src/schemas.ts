import { z } from 'zod';
import { schema } from '@oms/database';
import { EmailSchema, GstinSchema, IsoDate, PaginationQuerySchema, SearchQuerySchema, sortQuery } from '@oms/contracts';
import { CIN_PATTERN } from './gst';
import { FULFILLMENT_METHODS, NUMBER_FORMATS } from './settings-defaults';

export const AddressSchema = z
  .object({
    line1: z.string().trim().max(200).optional(),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().max(100).optional(),
    state: z.string().trim().max(100).optional(),
    pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'invalid PIN code').optional(),
    country: z.string().trim().length(2).toUpperCase().optional(),
  })
  .meta({ id: 'Address' });

const Flag = z.boolean().optional();
export const AlertsSchema = z
  .object({
    dispatchSlaBreach: z.object({ enabled: Flag, thresholdMinutes: z.number().int().min(5).max(1440).optional() }).strict().optional(),
    criticalStockouts: Flag,
    tokenRenewals: Flag,
    syncFailures: Flag,
    returns: Flag,
  })
  .strict()
  .meta({ id: 'AlertPreferences' });

export const OperationsSchema = z
  .object({
    autoAcknowledgeOrders: Flag,
    roundPriceToNine: Flag,
    defaultInventoryBufferPercent: z.number().int().min(0).max(100).optional(),
    defaultFulfillmentMethod: z.enum(FULFILLMENT_METHODS).nullable().optional(),
    defaultWarehouseId: z.uuid().nullable().optional(),
  })
  .strict()
  .meta({ id: 'OperationalPreferences' });

/** Business settings (validated; unknown keys rejected so the settings document cannot become a junk drawer). */
export const VendorSettingsSchema = z
  .object({
    numberFormat: z.enum(NUMBER_FORMATS).optional(),
    operations: OperationsSchema.optional(),
    alerts: AlertsSchema.optional(),
    lowStockThreshold: z.number().int().min(0).max(1_000_000).optional(),
    notifications: z.object({ lowStock: z.boolean().optional(), orderAlerts: z.boolean().optional(), syncFailures: z.boolean().optional() }).strict().optional(),
    catalog: z.object({ requireHsn: z.boolean().optional(), skuPrefix: z.string().trim().max(12).optional() }).strict().optional(),
    inventory: z.object({ mode: z.enum(['simple', 'warehouse']).optional(), startingMethod: z.enum(['manual', 'marketplace', 'file']).optional(), defaultLeadTimeDays: z.number().int().min(0).max(365).optional() }).strict().optional(),
    sla: z.object({ defaultHandlingHours: z.number().int().min(1).max(720).optional(), approachingMinutes: z.number().int().min(1).max(10080).optional(), atRiskMinutes: z.number().int().min(1).max(10080).optional() }).strict().optional(),
    returns: z.object({ highValueMinor: z.number().int().min(0).optional(), inspectionOverdueHours: z.number().int().min(1).max(720).optional() }).strict().optional(),
    shipping: z.object({ awaitingFirstScanHours: z.number().int().min(1).max(720).optional() }).strict().optional(),
  })
  .strict()
  .meta({ id: 'VendorSettings' });

export const VendorSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    displayName: z.string(),
    legalName: z.string(),
    status: z.enum(['pending', 'active', 'suspended', 'closed']),
    statusReason: z.string().nullable(),
    plan: z.string(),
    businessEmail: z.string().nullable(),
    phone: z.string().nullable(),
    gstin: z.string().nullable(),
    pan: z.string().nullable(),
    cin: z.string().nullable(),
    address: AddressSchema,
    businessType: z.enum(schema.BUSINESS_TYPES).nullable(),
    teamSize: z.enum(schema.TEAM_SIZES).nullable(),
    operatingLocation: z.string().nullable(),
    timezone: z.string(),
    currency: z.string(),
    settings: VendorSettingsSchema,
    version: z.number().int(),
    createdAt: IsoDate,
    updatedAt: IsoDate,
  })
  .meta({ id: 'Vendor' });

export const UpdateVendorBodySchema = z
  .object({
    displayName: z.string().trim().min(2).max(120),
    legalName: z.string().trim().min(2).max(200),
    businessEmail: EmailSchema,
    phone: z.string().trim().min(7).max(20),
    gstin: GstinSchema.nullable(),
    pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'invalid PAN').nullable(),
    cin: z.string().trim().toUpperCase().regex(CIN_PATTERN, 'invalid CIN (21 characters, e.g. U74999MH2021PTC368942)').nullable(),
    address: AddressSchema,
    businessType: z.enum(schema.BUSINESS_TYPES),
    teamSize: z.enum(schema.TEAM_SIZES),
    operatingLocation: z.string().trim().min(2).max(160),
    timezone: z.string().trim().min(2).max(64),
    currency: z.string().trim().toUpperCase().length(3),
    version: z.number().int().optional().describe('Optimistic lock: send the version you read; 409 if it changed'),
  })
  .partial();

export const VendorListQuerySchema = PaginationQuerySchema.extend(SearchQuerySchema.shape).extend({
  'filter[status]': z.enum(['pending', 'active', 'suspended', 'closed']).optional(),
  sort: sortQuery(['createdAt', 'displayName'] as const),
});

export const SetStatusBodySchema = z.object({
  status: z.enum(['active', 'suspended', 'closed']),
  reason: z.string().trim().max(500).optional(),
});
