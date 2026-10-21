import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit, emit, ok, vendorTx } from '@oms/module-kit';
import { IsoDate, successEnvelope } from '@oms/contracts';
import { schema } from '@oms/database';
import { AppError } from '@oms/shared';
import { AddressSchema, AlertsSchema, OperationsSchema, UpdateVendorBodySchema } from './schemas';
import { FULFILLMENT_METHODS, NUMBER_FORMATS } from './settings-defaults';
import { GstinSchema } from './gst-routes';
import * as svc from './service';
import { applySettingsPatch, settingsOverview } from './settings-service';

const AlertRow = z.object({ key: z.string(), label: z.string(), description: z.string(), enabled: z.boolean(), thresholdMinutes: z.number().int().nullable(), events: z.array(z.string()) });
const ResolvedAlerts = z.object({
  dispatchSlaBreach: z.object({ enabled: z.boolean(), thresholdMinutes: z.number().int() }),
  criticalStockouts: z.boolean(), tokenRenewals: z.boolean(), syncFailures: z.boolean(), returns: z.boolean(),
});

const SettingsOverviewSchema = z
  .object({
    business: z.object({
      legalName: z.string(), displayName: z.string(), cin: z.string().nullable(), pan: z.string().nullable(), gstin: z.string().nullable(),
      supportEmail: z.string().nullable(), supportPhone: z.string().nullable(), address: AddressSchema, registeredCity: z.string().nullable(), operatingLocation: z.string().nullable(), businessType: z.enum(schema.BUSINESS_TYPES).nullable(),
    }),
    regional: z.object({ currency: z.string(), currencyLabel: z.string(), timezone: z.string(), timezoneLabel: z.string(), utcOffset: z.string(), numberFormat: z.enum(NUMBER_FORMATS), locked: z.array(z.string()).describe('Fields the screen shows read-only') }),
    gstins: z.array(GstinSchema),
    operations: z.object({
      autoAcknowledgeOrders: z.boolean(), roundPriceToNine: z.boolean(), defaultInventoryBufferPercent: z.number().int(), defaultFulfillmentMethod: z.enum(FULFILLMENT_METHODS).nullable(),
      defaultWarehouseId: z.string().nullable(), lowStockThreshold: z.number().int(), effectiveWarehouseId: z.string().nullable().describe('The chosen default warehouse, else the one flagged default'),
    }),
    alerts: ResolvedAlerts,
    alertMatrix: z.array(AlertRow),
    ai: z.object({ enabled: z.boolean(), mode: z.string(), manageUrl: z.string() }),
    warehouses: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), city: z.string().nullable(), isDefault: z.boolean(), status: z.string() })),
    version: z.number().int(),
    updatedAt: IsoDate,
  })
  .meta({ id: 'SettingsOverview' });

const SaveBody = z
  .object({
    // support email and phone can be cleared (null); every other field is optional as before
    business: UpdateVendorBodySchema.pick({ legalName: true, displayName: true, cin: true, pan: true, address: true, operatingLocation: true })
      .extend({ businessEmail: UpdateVendorBodySchema.shape.businessEmail.nullable(), phone: UpdateVendorBodySchema.shape.phone.nullable() })
      .partial()
      .optional(),
    regional: z.object({ timezone: UpdateVendorBodySchema.shape.timezone, currency: UpdateVendorBodySchema.shape.currency, numberFormat: z.enum(NUMBER_FORMATS).optional() }).strict().optional(),
    operations: OperationsSchema.extend({ lowStockThreshold: z.number().int().min(0).max(1_000_000).optional() }).optional(),
    alerts: AlertsSchema.optional(),
    version: z.number().int().optional().describe('Optimistic lock: send the `version` you read; 409 VERSION_CONFLICT when the settings changed meanwhile'),
  })
  .strict();

const vendorSnapshot = (v: svc.VendorRow) => ({ displayName: v.displayName, legalName: v.legalName, pan: v.pan, cin: v.cin, businessEmail: v.businessEmail, phone: v.phone, timezone: v.timezone, currency: v.currency.trim(), settings: v.settings });

/** The Settings screen: one read for all tabs, and the save endpoints behind its buttons. */
export const settingsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Vendors'];

  r.get('/settings', {
    config: { access: { permission: 'vendors:read' } },
    schema: {
      tags: TAGS, summary: 'Settings screen aggregate',
      description: 'Business profile, regional formats, GST registrations, operational preferences, the alert matrix, the AI switch (managed through /ai/settings) and the warehouses to choose a default from. `version` is the lock for the save calls.',
      response: { 200: successEnvelope(SettingsOverviewSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => settingsOverview(tx, vendorId))));

  r.patch('/settings', {
    config: { access: { permission: 'vendors:write' } },
    schema: {
      tags: TAGS, summary: 'Save the settings screen',
      description: 'One save for every tab (business, regional, operations, alerts); omitted sections are untouched, objects are merged. Validation errors name the field in `details.issues[].path`. Returns the refreshed aggregate.',
      body: SaveBody, response: { 200: successEnvelope(SettingsOverviewSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const { business, regional, operations, alerts, version } = req.body;
    const profile = { ...business, ...(regional?.timezone ? { timezone: regional.timezone } : {}), ...(regional?.currency ? { currency: regional.currency } : {}) };
    const before = await svc.getVendor(tx, vendorId);
    if (version !== undefined && version !== before.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: before.version } });
    if (Object.keys(profile).length > 0) await svc.updateVendor(tx, vendorId, profile);
    const patch: Record<string, unknown> = {};
    if (operations) {
      const { lowStockThreshold, ...ops } = operations;
      if (Object.keys(ops).length) patch.operations = ops;
      if (lowStockThreshold !== undefined) patch.lowStockThreshold = lowStockThreshold;
    }
    if (alerts) patch.alerts = alerts;
    if (regional?.numberFormat) patch.numberFormat = regional.numberFormat;
    if (Object.keys(patch).length > 0) await applySettingsPatch(tx, vendorId, patch);
    const after = await svc.getVendor(tx, vendorId);
    await audit(tx, req, { action: 'vendor.settings_update', resourceType: 'vendor', resourceId: vendorId, before: vendorSnapshot(before), after: vendorSnapshot(after) });
    await emit(tx, req, { type: 'vendor.updated', aggregateType: 'vendor', aggregateId: vendorId, payload: { fields: Object.keys(req.body).filter((k) => k !== 'version') } });
    return settingsOverview(tx, vendorId);
  })));

  r.put('/settings/alerts', {
    config: { access: { permission: 'vendors:write' } },
    schema: {
      tags: TAGS, summary: 'Save the alert preferences',
      description: 'Partial: only the flags you send change. `dispatchSlaBreach.thresholdMinutes` is 5 to 1440. The notification producers read these flags: switching one off stops new notifications of that family (existing ones stay).',
      body: AlertsSchema.extend({ version: z.number().int().optional() }).strict(),
      response: { 200: successEnvelope(z.object({ alerts: ResolvedAlerts, alertMatrix: z.array(AlertRow), version: z.number().int() })) },
    },
  }, async (req) => {
    const { version, ...alerts } = req.body;
    return ok(req, await vendorTx(req, async (tx, vendorId) => {
      const out = await applySettingsPatch(tx, vendorId, { alerts }, version);
      await audit(tx, req, { action: 'vendor.alerts_update', resourceType: 'vendor', resourceId: vendorId, before: (out.before.settings as { alerts?: unknown }).alerts ?? {}, after: (out.after.settings as { alerts?: unknown }).alerts ?? {} });
      const view = await settingsOverview(tx, vendorId);
      return { alerts: view.alerts, alertMatrix: view.alertMatrix, version: view.version };
    }));
  });
};
