import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit, created, emit, ok, vendorTx } from '@oms/module-kit';
import { IdParamSchema, IsoDate, successEnvelope } from '@oms/contracts';
import { eq, schema } from '@oms/database';
import { AddressSchema } from './schemas';
import { checkGstin, listGstStates } from './gst';
import * as gst from './gst-service';

const GstinStatus = z.enum(schema.GSTIN_STATUSES);

export const GstinSchema = z
  .object({
    id: z.string(),
    gstin: z.string(),
    stateCode: z.string(),
    stateName: z.string(),
    legalName: z.string().nullable(),
    tradeName: z.string().nullable(),
    registeredAddress: z.string().nullable().describe('One line for tables: the free text entered, else the address parts joined'),
    address: z.record(z.string(), z.unknown()),
    isPrimary: z.boolean(),
    status: GstinStatus,
    verifiedAt: IsoDate.nullable(),
    notes: z.string().nullable(),
    version: z.number().int(),
    createdAt: IsoDate,
    updatedAt: IsoDate,
  })
  .meta({ id: 'VendorGstin' });

const Text = (max: number) => z.string().trim().max(max);
const GstinBody = z.string().trim().toUpperCase().min(15).max(15);

const CreateBody = z
  .object({
    gstin: GstinBody,
    legalName: Text(200).nullable().optional(),
    tradeName: Text(200).nullable().optional(),
    registeredAddress: Text(400).optional().describe('Free text, shown in the registrations table'),
    address: AddressSchema.optional(),
    status: GstinStatus.optional(),
    notes: Text(500).nullable().optional(),
    makePrimary: z.boolean().optional().describe('The first registration becomes primary automatically'),
  })
  .strict();

const PatchBody = z
  .object({
    gstin: GstinBody,
    legalName: Text(200).nullable(),
    tradeName: Text(200).nullable(),
    registeredAddress: Text(400),
    address: AddressSchema,
    status: GstinStatus,
    notes: Text(500).nullable(),
    version: z.number().int().describe('Optimistic lock: 409 when the registration changed since you read it'),
  })
  .partial()
  .strict();

const dto = gst.toGstinDto;

/** The GST registry of the business: one registration per state, one primary (mirrored into `vendors.gstin`). */
export const gstRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Vendors'];
  const snap = (g: { gstin: string; status: string; isPrimary: boolean; stateCode: string }) => ({ gstin: g.gstin, status: g.status, isPrimary: g.isPrimary, stateCode: g.stateCode.trim() });

  r.get('/vendor/gstins', {
    config: { access: { permission: 'vendors:read' } },
    schema: { tags: TAGS, summary: 'GST registrations of my business', description: 'Active first, the primary registration first. A GSTIN entered at sign-up appears here as the primary registration.', response: { 200: successEnvelope(z.array(GstinSchema)) } },
  }, async (req) => ok(req, (await vendorTx(req, (tx, vendorId) => gst.listGstins(tx, vendorId))).map(dto)));

  r.get('/vendor/gst-states', {
    config: { access: { permission: 'vendors:read' } },
    schema: { tags: TAGS, summary: 'GST state and union territory codes', description: 'The code table behind the first two digits of a GSTIN and the place of supply.', response: { 200: successEnvelope(z.array(z.object({ code: z.string(), name: z.string() }))) } },
  }, async (req) => ok(req, listGstStates()));

  r.post('/vendor/gstins/validate', {
    config: { access: { permission: 'vendors:read' } },
    schema: {
      tags: TAGS, summary: 'Check a GSTIN without saving it',
      description: 'Structure, state code and the mod-36 check character; `panMatchesBusiness` compares the PAN inside it with the PAN of the business (null when the business has no PAN yet).',
      body: z.object({ gstin: z.string().trim().max(30) }).strict(),
      response: { 200: successEnvelope(z.object({ valid: z.boolean(), gstin: z.string(), problem: z.enum(['format', 'state_code', 'checksum']).nullable(), stateCode: z.string().nullable(), stateName: z.string().nullable(), pan: z.string().nullable(), panMatchesBusiness: z.boolean().nullable(), expectedCheckChar: z.string().nullable() })) },
    },
  }, async (req) => {
    const c = checkGstin(req.body.gstin);
    const pan = await vendorTx(req, async (tx, vendorId) => (await tx.select({ pan: schema.vendors.pan }).from(schema.vendors).where(eq(schema.vendors.id, vendorId)))[0]?.pan ?? null);
    return ok(req, { valid: c.valid, gstin: c.gstin, problem: c.problem ?? null, stateCode: c.stateCode ?? null, stateName: c.stateName ?? null, pan: c.pan ?? null, panMatchesBusiness: c.pan && pan ? c.pan === pan.toUpperCase() : null, expectedCheckChar: c.expectedCheckChar ?? null });
  });

  r.post('/vendor/gstins', {
    config: { access: { permission: 'vendors:write' } },
    schema: {
      tags: TAGS, summary: 'Register a GSTIN',
      description: 'Validates the 15 character format, the state code, the check character and that the PAN inside equals the business PAN (when set). 409 `gstin_duplicate` when already registered. The first registration is the primary one.',
      body: CreateBody, response: { 201: successEnvelope(GstinSchema) },
    },
  }, async (req, reply) => {
    const b = req.body;
    const row = await vendorTx(req, async (tx, vendorId) => {
      const g = await gst.addGstin(tx, vendorId, { gstin: b.gstin, legalName: b.legalName, tradeName: b.tradeName, address: b.address, registeredAddress: b.registeredAddress, status: b.status, notes: b.notes, makePrimary: b.makePrimary });
      await audit(tx, req, { action: 'vendor.gstin_add', resourceType: 'vendor_gstin', resourceId: g.id, after: snap(g) });
      await emit(tx, req, { type: 'vendor.updated', aggregateType: 'vendor', aggregateId: vendorId, payload: { fields: ['gstins'] } });
      return g;
    });
    return created(req, reply, dto(row), `/api/v1/vendor/gstins/${row.id}`);
  });

  r.patch('/vendor/gstins/:id', {
    config: { access: { permission: 'vendors:write' } },
    schema: { tags: TAGS, summary: 'Change a GST registration', description: 'The primary registration cannot be deactivated (409 `gstin_primary_required`). Changing the GSTIN of the primary registration updates the business GSTIN.', params: IdParamSchema, body: PatchBody, response: { 200: successEnvelope(GstinSchema) } },
  }, async (req) => {
    const b = req.body;
    const row = await vendorTx(req, async (tx, vendorId) => {
      const { before, after } = await gst.updateGstin(tx, vendorId, req.params.id, {
        gstin: b.gstin, legalName: b.legalName, tradeName: b.tradeName, notes: b.notes, status: b.status, version: b.version, address: b.address, registeredAddress: b.registeredAddress,
      });
      await audit(tx, req, { action: 'vendor.gstin_update', resourceType: 'vendor_gstin', resourceId: after.id, before: snap(before), after: snap(after) });
      return after;
    });
    return ok(req, dto(row));
  });

  r.post('/vendor/gstins/:id/primary', {
    config: { access: { permission: 'vendors:write' } },
    schema: { tags: TAGS, summary: 'Make a registration the primary one', description: 'Exactly one primary registration exists; the business `gstin` follows it. Idempotent.', params: IdParamSchema, response: { 200: successEnvelope(GstinSchema) } },
  }, async (req) => {
    const row = await vendorTx(req, async (tx, vendorId) => {
      const g = await gst.setPrimaryGstin(tx, vendorId, req.params.id);
      await audit(tx, req, { action: 'vendor.gstin_primary', resourceType: 'vendor_gstin', resourceId: g.id, after: snap(g) });
      return g;
    });
    return ok(req, dto(row));
  });

  r.delete('/vendor/gstins/:id', {
    config: { access: { permission: 'vendors:write' } },
    schema: { tags: TAGS, summary: 'Remove a GST registration', description: 'The primary registration can only be removed when it is the last one (409 `gstin_primary_required` otherwise).', params: IdParamSchema, response: { 200: successEnvelope(z.object({ deleted: z.literal(true) })) } },
  }, async (req) => {
    await vendorTx(req, async (tx, vendorId) => {
      const g = await gst.removeGstin(tx, vendorId, req.params.id);
      await audit(tx, req, { action: 'vendor.gstin_remove', resourceType: 'vendor_gstin', resourceId: g.id, before: snap(g) });
    });
    return ok(req, { deleted: true as const });
  });
};
