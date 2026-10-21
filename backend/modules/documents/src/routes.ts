import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { Tx } from '@oms/database';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit, created, emit, ok, vendorTx } from '@oms/module-kit';
import { IdParamSchema, IsoDate, successEnvelope } from '@oms/contracts';
import { AppError } from '@oms/shared';
import * as svc from './service';
import { PLACEHOLDER_CSP, PLACEHOLDER_MIME } from './placeholder';

const DocumentSchema = z
  .object({
    id: z.string(), productId: z.string(), variantId: z.string().nullable(), listingId: z.string().nullable(),
    kind: z.enum(['image', 'document', 'video']), purpose: z.enum(['product_image', 'product_document', 'listing_document']),
    fileName: z.string(), mimeType: z.string(), sizeBytes: z.number().nullable(), checksumSha256: z.string().nullable(),
    sortOrder: z.number().int(), isPrimary: z.boolean(),
    isPlaceholder: z.boolean().describe('A generated stand-in image: counts while drafting but always blocks publishing'),
    width: z.number().int().nullable().describe('Pixels, read from the image header (null for non-images)'),
    height: z.number().int().nullable(),
    warnings: z.array(z.enum(['low_resolution'])).describe('`low_resolution`: the longer side is below 1000 px (accepted, but marketplaces prefer larger images)'),
    status: z.enum(['pending_upload', 'uploaded', 'processed', 'rejected']),
    downloadUrl: z.string().nullable().describe('Short-lived pre-signed URL (or the API content endpoint when the storage provider cannot presign)'),
    createdAt: IsoDate,
  })
  .meta({ id: 'Document' });

const PrimaryImageSchema = z
  .object({ state: z.enum(['none', 'uploading', 'placeholder', 'ready']), document: DocumentSchema.nullable() })
  .meta({ id: 'ProductPrimaryImage' });

/** Hardening for generated SVG: never executable, never framed, never sniffed. */
const SVG_CSP = PLACEHOLDER_CSP;

const UploadInstructionSchema = z
  .object({ strategy: z.enum(['presigned', 'api']), method: z.string(), url: z.string(), headers: z.record(z.string(), z.string()) })
  .meta({ id: 'DocumentUploadInstruction', description: 'presigned: PUT the bytes to `url` with `headers`, then POST /documents/{id}/confirm. api: POST the raw bytes to `url` on this API (Content-Type must equal the declared mimeType).' });

const CreateBody = z.object({
  fileName: z.string().trim().min(3).max(200).meta({ example: 'front.jpg' }),
  mimeType: z.enum(svc.ALLOWED_MIME as [string, ...string[]]).meta({ example: 'image/jpeg' }),
  sizeBytes: z.number().int().positive().max(svc.MAX_DOCUMENT_BYTES),
  purpose: z.enum(['product_image', 'product_document', 'listing_document']).optional().describe('Defaults from the type: images → product_image, others → product_document'),
  variantId: z.uuid().nullish(),
  listingId: z.uuid().nullish().describe('Required for listing_document'),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
const UpdateBody = z.object({ sortOrder: z.number().int().min(0).max(1000), isPrimary: z.boolean(), fileName: z.string().trim().min(3).max(200) }).partial().refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });
const ListQuery = z.object({ 'filter[purpose]': z.enum(['product_image', 'product_document', 'listing_document']).optional(), 'filter[variantId]': z.uuid().optional() });

export const documentRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const TAGS = ['Documents'];

  // raw bytes for the API upload strategy (encapsulated: only these routes accept binary bodies)
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: svc.MAX_DOCUMENT_BYTES + 1024 }, (_req, body, done) => done(null, body));

  r.post('/products/:id/documents', {
    config: { access: { permission: 'documents:write' } },
    schema: {
      tags: TAGS,
      summary: 'Register a product image / document / listing document and get upload instructions',
      description: 'Step 1 of 2. Validates type (jpeg, png, webp, gif, pdf, csv, xlsx, docx), size (images 10 MB, documents 25 MB) and extension, then returns where to send the bytes. The first image of a product becomes its primary image automatically.',
      params: IdParamSchema,
      body: CreateBody,
      response: { 201: successEnvelope(z.object({ document: DocumentSchema, upload: UploadInstructionSchema })) },
    },
  }, async (req, reply) => {
    const out = await vendorTx(req, (tx, vendorId) => svc.createDocument(tx, c, vendorId, req.params.id, req.body));
    return created(req, reply, { document: await svc.toDocumentDto(c, out.row), upload: out.upload }, `/api/v1/documents/${out.row.id}`);
  });

  r.post('/documents/:id/upload', {
    config: { access: { permission: 'documents:write' } },
    schema: {
      tags: TAGS,
      summary: 'Upload the file bytes through the API (step 2, "api" strategy)',
      description: 'Send the raw file as the request body with `Content-Type` equal to the declared mimeType. The content is sniffed: a file that is not really what it claims is rejected. `?primary=true` makes an image the primary one.',
      params: IdParamSchema,
      querystring: z.object({ primary: z.enum(['true', 'false']).optional() }),
      response: { 200: successEnvelope(DocumentSchema) },
    },
  }, async (req) => {
    if (!Buffer.isBuffer(req.body)) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Send the file as the raw request body');
    const body = req.body;
    const outcome = await vendorTx(req, async (tx, vendorId) => {
      const f = await svc.uploadContent(tx, c, vendorId, req.params.id, body, req.headers['content-type'] ?? '', req.query.primary === 'true');
      if (svc.isRejection(f)) return f;
      const d = f.doc;
      await audit(tx, req, { action: 'document.upload', resourceType: 'document', resourceId: d.id, after: { productId: d.productId, fileName: d.fileName, sizeBytes: d.sizeBytes, width: d.width, height: d.height } });
      await emit(tx, req, { type: 'document.uploaded', aggregateType: 'document', aggregateId: d.id, payload: { productId: d.productId, kind: d.kind, purpose: d.purpose } });
      await recordReplaced(tx, req, f);
      return f;
    });
    if (svc.isRejection(outcome)) throw outcome.rejected;
    await dropObjects(req, outcome);
    return ok(req, await svc.toDocumentDto(c, outcome.doc));
  });

  r.post('/documents/:id/confirm', {
    config: { access: { permission: 'documents:write' } },
    schema: { tags: TAGS, summary: 'Confirm a direct (presigned) upload (step 2, "presigned" strategy)', description: 'Verifies what actually landed in object storage: size limit and content sniffing. Rejected files are deleted.', params: IdParamSchema, response: { 200: successEnvelope(DocumentSchema) } },
  }, async (req) => {
    const outcome = await vendorTx(req, async (tx, vendorId) => {
      const f = await svc.confirmUpload(tx, c, vendorId, req.params.id);
      if (svc.isRejection(f)) return f;
      const d = f.doc;
      if (!f.already && d.status === 'uploaded') {
        await audit(tx, req, { action: 'document.upload', resourceType: 'document', resourceId: d.id, after: { productId: d.productId, fileName: d.fileName, sizeBytes: d.sizeBytes, width: d.width, height: d.height, via: 'confirm' } });
        await emit(tx, req, { type: 'document.uploaded', aggregateType: 'document', aggregateId: d.id, payload: { productId: d.productId, kind: d.kind, purpose: d.purpose } });
        await recordReplaced(tx, req, f);
      }
      return f;
    });
    if (svc.isRejection(outcome)) throw outcome.rejected;
    await dropObjects(req, outcome);
    return ok(req, await svc.toDocumentDto(c, outcome.doc));
  });

  r.post('/products/:id/documents/placeholder', {
    config: { access: { permission: 'documents:write' } },
    schema: {
      tags: TAGS,
      summary: 'Generate a placeholder product image',
      description: 'Creates a server-generated SVG stand-in (product code initials + "Image required"), deterministic per product, at most one per product (idempotent: 200 with the existing one). It becomes the primary image only when the product has none, and is replaced automatically by the first real image. A placeholder always blocks publishing. 409 `has_primary_image` when a real primary image exists.',
      params: IdParamSchema,
      response: { 201: successEnvelope(DocumentSchema), 200: successEnvelope(DocumentSchema) },
    },
  }, async (req, reply) => {
    const storedKeys: string[] = [];
    let out: Awaited<ReturnType<typeof svc.createPlaceholder>>;
    try {
      out = await vendorTx(req, async (tx, vendorId) => {
        const res = await svc.createPlaceholder(tx, c, vendorId, req.params.id, storedKeys);
        if (res.created) {
          await audit(tx, req, { action: 'document.placeholder_created', resourceType: 'document', resourceId: res.doc.id, after: { productId: res.doc.productId, primary: res.doc.isPrimary } });
        }
        return res;
      });
    } catch (err) {
      await Promise.all(storedKeys.map((k) => c.storage.delete(k).catch(() => undefined)));
      throw err;
    }
    const dto = await svc.toDocumentDto(c, out.doc);
    if (out.created) return created(req, reply, dto, `/api/v1/documents/${out.doc.id}`);
    return ok(req, dto);
  });

  r.get('/products/:id/primary-image', {
    config: { access: { permission: 'documents:read' } },
    schema: {
      tags: TAGS,
      summary: 'State of the product\'s primary image',
      description: '`ready`: a real uploaded image is primary. `uploading`: no ready primary and an upload started less than 30 minutes ago (document = that upload). `placeholder`: the generated placeholder is primary (blocks publishing). `none`: nothing.',
      params: IdParamSchema,
      response: { 200: successEnvelope(PrimaryImageSchema) },
    },
  }, async (req) => {
    const s = await vendorTx(req, (tx, vendorId) => svc.primaryImageState(tx, vendorId, req.params.id));
    return ok(req, { state: s.state, document: s.doc ? await svc.toDocumentDto(c, s.doc) : null });
  });

  /** audit + event for placeholders replaced by a real upload (inside the transaction) */
  async function recordReplaced(tx: Tx, req: FastifyRequest, f: svc.Finalized): Promise<void> {
    for (const p of f.replaced) {
      await audit(tx, req, { action: 'document.placeholder_replaced', resourceType: 'document', resourceId: p.id, after: { productId: f.doc.productId, replacedBy: f.doc.id } });
      await emit(tx, req, { type: 'document.deleted', aggregateType: 'document', aggregateId: p.id, payload: { productId: f.doc.productId, reason: 'placeholder_replaced' } });
    }
  }
  /** storage cleanup after commit: replaced placeholders, and the object of a rejected upload (best effort, swept later) */
  async function dropObjects(req: FastifyRequest, x: svc.Finalized): Promise<void> {
    for (const p of x.replaced) await c.storage.delete(p.storageKey).catch((err) => req.log.warn({ err, key: p.storageKey }, 'placeholder object delete failed (orphaned, will be swept)'));
  }

  r.get('/products/:id/documents', {
    config: { access: { permission: 'documents:read' } },
    schema: { tags: TAGS, summary: 'List a product\'s images and documents', description: 'Ordered by sortOrder. Includes short-lived download URLs.', params: IdParamSchema, querystring: ListQuery, response: { 200: successEnvelope(z.array(DocumentSchema)) } },
  }, async (req) => {
    const rows = await vendorTx(req, (tx, vendorId) => svc.listDocuments(tx, vendorId, req.params.id, { purpose: req.query['filter[purpose]'], variantId: req.query['filter[variantId]'] }));
    return ok(req, await Promise.all(rows.map((d) => svc.toDocumentDto(c, d))));
  });

  r.get('/documents/:id', {
    config: { access: { permission: 'documents:read' } },
    schema: { tags: TAGS, summary: 'Get a document', params: IdParamSchema, response: { 200: successEnvelope(DocumentSchema) } },
  }, async (req) => ok(req, await svc.toDocumentDto(c, await vendorTx(req, (tx, vendorId) => svc.getDocument(tx, vendorId, req.params.id)))));

  r.get('/documents/:id/content', {
    config: { access: { permission: 'documents:read' } },
    schema: { tags: TAGS, summary: 'Download the file content', description: 'Streams the stored bytes through the API (any storage provider). Images are served inline, everything else as an attachment, always with nosniff.', params: IdParamSchema, response: { 200: z.any().describe('file bytes') } },
  }, async (req, reply) => {
    const { doc, body } = await vendorTx(req, (tx, vendorId) => svc.readContent(tx, c.storage, vendorId, req.params.id));
    // only the server-generated placeholder may be an SVG (user-supplied SVG is not in the MIME allow-list)
    const generatedSvg = doc.isPlaceholder && doc.mimeType === PLACEHOLDER_MIME;
    const inline = svc.isImage(doc.mimeType) || generatedSvg;
    reply
      .header('Content-Type', doc.mimeType)
      .header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${doc.fileName}"`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'private, max-age=300');
    if (generatedSvg) reply.header('Content-Security-Policy', SVG_CSP);
    return reply.send(body);
  });

  r.patch('/documents/:id', {
    config: { access: { permission: 'documents:write' } },
    schema: { tags: TAGS, summary: 'Reorder, rename or make an image primary', params: IdParamSchema, body: UpdateBody, response: { 200: successEnvelope(DocumentSchema) } },
  }, async (req) => {
    const d = await vendorTx(req, async (tx, vendorId) => {
      const out = await svc.updateDocument(tx, vendorId, req.params.id, req.body);
      await audit(tx, req, { action: 'document.update', resourceType: 'document', resourceId: out.id, after: req.body });
      return out;
    });
    return ok(req, await svc.toDocumentDto(c, d));
  });

  r.delete('/documents/:id', {
    config: { access: { permission: 'documents:write' } },
    schema: { tags: TAGS, summary: 'Delete a document (or cancel an upload in progress)', description: 'Soft-deletes the record and removes the stored object. On a `pending_upload` document this cancels the upload (idempotent): the record disappears and any partial object is removed.', params: IdParamSchema, response: { 200: successEnvelope(z.object({ message: z.string(), cancelled: z.boolean().optional() })) } },
  }, async (req) => {
    const res = await removeDocument(req, req.params.id, 'delete');
    return ok(req, res.cancelled ? { message: 'Upload cancelled', cancelled: true } : { message: 'Document deleted' });
  });

  r.post('/documents/:id/cancel', {
    config: { access: { permission: 'documents:write' } },
    schema: { tags: TAGS, summary: 'Cancel an upload in progress', description: 'Alias of DELETE for documents in `pending_upload`. Idempotent. 409 `not_pending_upload` when the document is already uploaded (delete it instead).', params: IdParamSchema, response: { 200: successEnvelope(z.object({ cancelled: z.literal(true) })) } },
  }, async (req) => {
    await removeDocument(req, req.params.id, 'cancel');
    return ok(req, { cancelled: true as const });
  });

  async function removeDocument(req: FastifyRequest, id: string, mode: 'delete' | 'cancel') {
    const res = await vendorTx(req, async (tx, vendorId) => {
      const out = await svc.deleteDocument(tx, vendorId, id, mode);
      if (out.already) return out;
      const d = out.doc;
      if (out.cancelled) {
        await audit(tx, req, { action: 'document.upload_cancelled', resourceType: 'document', resourceId: d.id, before: { fileName: d.fileName, productId: d.productId } });
      } else {
        await audit(tx, req, { action: 'document.delete', resourceType: 'document', resourceId: d.id, before: { fileName: d.fileName } });
        await emit(tx, req, { type: 'document.deleted', aggregateType: 'document', aggregateId: d.id, payload: { productId: d.productId } });
      }
      return out;
    });
    // also on a repeated cancel: removes a partial object that landed after the first attempt
    await c.storage.delete(res.doc.storageKey).catch((err) => req.log.warn({ err, key: res.doc.storageKey }, 'storage delete failed (object orphaned, will be swept)'));
    return res;
  }
};
