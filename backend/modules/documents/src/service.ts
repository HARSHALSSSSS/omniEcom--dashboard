import { and, asc, desc, eq, gte, inArray, isNull, ne, or, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors, newId } from '@oms/shared';
import { sanitizeFileName, tenantKey, type ObjectStorage } from '@oms/storage';
import type { Container } from '@oms/module-kit';
import { getProductRow } from '@oms/mod-catalog';
import { detectImageKind, KIND_MIME, parseImage } from './image-meta';
import { PLACEHOLDER_FILE_NAME, PLACEHOLDER_MIME, PLACEHOLDER_SIZE_PX, renderPlaceholderSvg, sha256Hex } from './placeholder';

export type DocumentRow = typeof schema.productDocuments.$inferSelect;
const D = schema.productDocuments;

export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const DOCUMENT_MIME = ['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] as const;
export const ALLOWED_MIME: readonly string[] = [...IMAGE_MIME, ...DOCUMENT_MIME];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCS_PER_PRODUCT = 50;
/** Decision D13 */
export const MAX_IMAGES_PER_PRODUCT = 20;
export const MIN_SHORT_SIDE_PX = 200;
export const RECOMMENDED_LONG_SIDE_PX = 1000;
export const MAX_PIXELS = 100_000_000;
/** A registered upload that never completed stops counting / showing as "uploading" after this long. */
export const PENDING_UPLOAD_TTL_MS = 30 * 60 * 1000;

const EXT: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'], 'image/gif': ['gif'], 'application/pdf': ['pdf'], 'text/csv': ['csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
};

export const isImage = (mime: string): boolean => (IMAGE_MIME as readonly string[]).includes(mime);
export const maxBytesFor = (mime: string): number => (isImage(mime) ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES);

/** Content sniffing: the bytes must match the declared type (a .jpg that is really an executable/HTML is rejected). */
export function sniffMatches(mime: string, b: Buffer): boolean {
  switch (mime) {
    case 'image/jpeg': return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png': return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/gif': return b.length > 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1'));
    case 'image/webp': return b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
    case 'application/pdf': return b.subarray(0, 1024).toString('latin1').includes('%PDF-');
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b; // zip container
    case 'text/csv': return !b.subarray(0, 4096).includes(0); // text: no NUL bytes
    default: return false;
  }
}

/** Rejections carry a precise machine-readable `details.rule` (and `details.code`, same value). 415 for type problems, 422 for content problems. */
export class ImageRejected extends AppError {
  constructor(rule: 'mime_mismatch' | 'image_too_small' | 'image_too_large_pixels' | 'image_corrupt' | 'file_too_large', message: string, details: Record<string, unknown> = {}) {
    const mismatch = rule === 'mime_mismatch';
    super(mismatch ? 'UNSUPPORTED_MEDIA_TYPE' : rule === 'file_too_large' ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_FAILED', message, { details: { rule, code: rule, ...details } });
    if (!mismatch && rule !== 'file_too_large') Object.defineProperty(this, 'status', { value: 422, enumerable: true, writable: false });
  }
}

export interface ImageVerdict { width: number; height: number }

/** Full validation of image bytes against the declared MIME type. Throws ImageRejected. */
export function validateImageBytes(declaredMime: string, bytes: Buffer): ImageVerdict {
  const kind = detectImageKind(bytes);
  if (!kind || KIND_MIME[kind] !== declaredMime) throw new ImageRejected('mime_mismatch', 'File content does not match its declared type', { declared: declaredMime, detected: kind ? KIND_MIME[kind] : null });
  const parsed = parseImage(bytes);
  if (!parsed.ok) throw new ImageRejected('image_corrupt', 'The image file is damaged or incomplete', { reason: parsed.reason });
  const { width, height, complete } = parsed.info;
  if (width <= 0 || height <= 0) throw new ImageRejected('image_corrupt', 'The image declares a zero dimension', { width, height });
  if (width * height > MAX_PIXELS) throw new ImageRejected('image_too_large_pixels', `Images may have at most ${MAX_PIXELS / 1_000_000} megapixels`, { width, height, maxPixels: MAX_PIXELS });
  if (Math.min(width, height) < MIN_SHORT_SIDE_PX) throw new ImageRejected('image_too_small', `The shorter side must be at least ${MIN_SHORT_SIDE_PX} px`, { width, height, minShortSidePx: MIN_SHORT_SIDE_PX });
  if (!complete) throw new ImageRejected('image_corrupt', 'The image file is truncated', { reason: 'truncated', width, height });
  return { width, height };
}

export function imageWarnings(d: Pick<DocumentRow, 'kind' | 'isPlaceholder' | 'width' | 'height'>): 'low_resolution'[] {
  if (d.kind !== 'image' || d.isPlaceholder || !d.width || !d.height) return [];
  return Math.max(d.width, d.height) < RECOMMENDED_LONG_SIDE_PX ? ['low_resolution'] : [];
}

export async function toDocumentDto(c: Container, d: DocumentRow) {
  const ready = d.status === 'uploaded' || d.status === 'processed';
  let downloadUrl: string | null = null;
  const viaApi = `${c.config.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/v1/documents/${d.id}/content`;
  // generated SVGs are never handed out as storage URLs: only the API content route adds the hardening headers
  if (ready) downloadUrl = c.storage.supportsPresign && !d.isPlaceholder ? await c.storage.presignDownload(d.storageKey, 300, d.mimeType.startsWith('image/') ? {} : { attachmentName: d.fileName }) : viaApi;
  return {
    id: d.id,
    productId: d.productId,
    variantId: d.variantId,
    listingId: d.listingId,
    kind: d.kind as 'image' | 'document' | 'video',
    purpose: d.purpose as 'product_image' | 'product_document' | 'listing_document',
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    checksumSha256: d.checksumSha256,
    sortOrder: d.sortOrder,
    isPrimary: d.isPrimary,
    isPlaceholder: d.isPlaceholder,
    width: d.width,
    height: d.height,
    warnings: imageWarnings(d),
    status: d.status as 'pending_upload' | 'uploaded' | 'processed' | 'rejected',
    downloadUrl,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function getDocument(tx: Tx, vendorId: string, id: string): Promise<DocumentRow> {
  const [d] = await tx.select().from(D).where(and(eq(D.id, id), eq(D.vendorId, vendorId), isNull(D.deletedAt)));
  if (!d) throw Errors.notFound('Document', id);
  return d;
}

/** Same as getDocument but locks the row: concurrent upload / confirm / cancel on one document serialise. */
async function getDocumentForUpdate(tx: Tx, vendorId: string, id: string): Promise<DocumentRow> {
  const [d] = await tx.select().from(D).where(and(eq(D.id, id), eq(D.vendorId, vendorId), isNull(D.deletedAt))).for('update');
  if (!d) throw Errors.notFound('Document', id);
  return d;
}

/** Serialises everything that changes the image set / primary of one product (count limits, unique primary). */
async function lockProduct(tx: Tx, productId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${productId}::text, 0::bigint))`);
}

export interface CreateDocumentInput {
  fileName: string; mimeType: string; sizeBytes: number; purpose?: 'product_image' | 'product_document' | 'listing_document';
  variantId?: string | null; listingId?: string | null; sortOrder?: number;
}

export type Rejection = { rejected: AppError };
export const isRejection = (x: unknown): x is Rejection => typeof x === 'object' && x !== null && 'rejected' in x;
export interface Finalized { doc: DocumentRow; replaced: { id: string; storageKey: string }[]; already: boolean }

const pendingCutoff = () => new Date(Date.now() - PENDING_UPLOAD_TTL_MS);

/** Real (non-placeholder) product images that count toward the limit: finished ones plus recent pending reservations. */
async function countCountedImages(tx: Tx, vendorId: string, productId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(D).where(and(
    eq(D.vendorId, vendorId), eq(D.productId, productId), eq(D.purpose, 'product_image'), eq(D.kind, 'image'), isNull(D.deletedAt), eq(D.isPlaceholder, false), ne(D.status, 'rejected'),
    or(ne(D.status, 'pending_upload'), gte(D.createdAt, pendingCutoff())),
  ));
  return r?.n ?? 0;
}

export async function createDocument(tx: Tx, c: Container, vendorId: string, productId: string, input: CreateDocumentInput) {
  await getProductRow(tx, vendorId, productId);
  if (!ALLOWED_MIME.includes(input.mimeType)) throw new AppError('UNSUPPORTED_MEDIA_TYPE', `Unsupported type ${input.mimeType}`, { details: { allowed: ALLOWED_MIME } });
  if (input.sizeBytes > maxBytesFor(input.mimeType)) throw new AppError('PAYLOAD_TOO_LARGE', `Maximum size for ${input.mimeType} is ${maxBytesFor(input.mimeType) / 1024 / 1024} MB`);
  const fileName = sanitizeFileName(input.fileName);
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (!(EXT[input.mimeType] ?? []).includes(ext)) throw Errors.validation({ issues: [{ path: 'fileName', message: `extension .${ext} does not match ${input.mimeType}` }] });

  const kind = isImage(input.mimeType) ? 'image' : 'document';
  const purpose = input.purpose ?? (kind === 'image' ? 'product_image' : 'product_document');
  if (purpose === 'product_image' && kind !== 'image') throw Errors.validation({ issues: [{ path: 'purpose', message: 'product_image must be an image' }] });
  if (purpose === 'listing_document') {
    if (!input.listingId) throw Errors.validation({ issues: [{ path: 'listingId', message: 'listing_document needs a listingId' }] });
    const [l] = await tx.select({ id: schema.marketplaceListings.id, variantId: schema.marketplaceListings.variantId }).from(schema.marketplaceListings).where(and(eq(schema.marketplaceListings.id, input.listingId), eq(schema.marketplaceListings.vendorId, vendorId)));
    if (!l) throw Errors.notFound('Listing', input.listingId);
  } else if (input.listingId) throw Errors.validation({ issues: [{ path: 'listingId', message: 'listingId is only for listing_document' }] });
  if (input.variantId) {
    const [v] = await tx.select({ id: schema.productVariants.id }).from(schema.productVariants).where(and(eq(schema.productVariants.id, input.variantId), eq(schema.productVariants.productId, productId), eq(schema.productVariants.vendorId, vendorId), isNull(schema.productVariants.deletedAt)));
    if (!v) throw Errors.notFound('Variant', input.variantId);
  }
  await lockProduct(tx, productId);
  if (purpose === 'product_image') {
    const images = await countCountedImages(tx, vendorId, productId);
    if (images >= MAX_IMAGES_PER_PRODUCT) throw new AppError('CONFLICT', `A product can have at most ${MAX_IMAGES_PER_PRODUCT} images`, { details: { rule: 'image_limit', code: 'image_limit', max: MAX_IMAGES_PER_PRODUCT } });
  }
  const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(D).where(and(eq(D.vendorId, vendorId), eq(D.productId, productId), isNull(D.deletedAt)));
  if (n >= MAX_DOCS_PER_PRODUCT) throw new AppError('CONFLICT', `A product can have at most ${MAX_DOCS_PER_PRODUCT} files`, { details: { rule: 'max_files' } });

  const id = newId();
  const storageKey = tenantKey(vendorId, 'products', productId, id, fileName);
  const [row] = await tx
    .insert(D)
    .values({ id, vendorId, productId, variantId: input.variantId ?? null, listingId: input.listingId ?? null, kind, purpose, storageKey, fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes, sortOrder: input.sortOrder ?? n, isPrimary: false, status: 'pending_upload' })
    .returning();
  const upload = c.storage.supportsPresign
    ? { strategy: 'presigned' as const, ...(await c.storage.presignUpload({ key: storageKey, contentType: input.mimeType, maxBytes: maxBytesFor(input.mimeType), contentLength: input.sizeBytes, expiresInSeconds: 600 })) }
    : { strategy: 'api' as const, method: 'POST', url: `/api/v1/documents/${id}/upload`, headers: { 'Content-Type': input.mimeType } };
  return { row: row!, upload };
}

/** Unique-primary invariant: clear the old flag first, then set the new one (the partial unique index would reject two). */
async function makePrimary(tx: Tx, vendorId: string, doc: Pick<DocumentRow, 'id' | 'productId'>): Promise<void> {
  await tx.update(D).set({ isPrimary: false }).where(and(eq(D.vendorId, vendorId), eq(D.productId, doc.productId), eq(D.isPrimary, true), isNull(D.deletedAt), ne(D.id, doc.id)));
  await tx.update(D).set({ isPrimary: true }).where(and(eq(D.id, doc.id), eq(D.vendorId, vendorId)));
}

/** Store the bytes (API strategy) and finalise. Verifies declared type == sent type == sniffed content == parsed image. */
/** Rejections are RETURNED (not thrown) so the `rejected` status commits; the route throws after the transaction. */
export async function uploadContent(tx: Tx, c: Container, vendorId: string, id: string, body: Buffer, contentType: string, wantsPrimary: boolean): Promise<Finalized | Rejection> {
  const d = await getDocumentForUpdate(tx, vendorId, id);
  if (d.status !== 'pending_upload') throw new AppError('CONFLICT', `Document is ${d.status}; create a new document to upload another file`);
  if (contentType.split(';')[0]!.trim().toLowerCase() !== d.mimeType) throw new AppError('UNSUPPORTED_MEDIA_TYPE', `Content-Type must be ${d.mimeType} (as declared)`);
  if (body.length === 0) throw new AppError('BAD_REQUEST', 'Empty file');
  if (body.length > maxBytesFor(d.mimeType)) throw new AppError('PAYLOAD_TOO_LARGE', `Maximum size is ${maxBytesFor(d.mimeType) / 1024 / 1024} MB`);
  let dims: ImageVerdict | null = null;
  try {
    if (d.kind === 'image') dims = validateImageBytes(d.mimeType, body);
    else if (!sniffMatches(d.mimeType, body)) throw new ImageRejected('mime_mismatch', 'File content does not match its declared type');
  } catch (e) {
    if (!(e instanceof ImageRejected)) throw e;
    await tx.update(D).set({ status: 'rejected' }).where(eq(D.id, id)); // nothing was stored: validation happens before put()
    return { rejected: e };
  }
  const stored = await c.storage.put(d.storageKey, body, d.mimeType);
  return finalize(tx, vendorId, d, stored.size, stored.sha256, wantsPrimary, dims);
}

/** Presigned strategy: the client uploaded straight to storage; verify what actually landed there. */
export async function confirmUpload(tx: Tx, c: Container, vendorId: string, id: string): Promise<Finalized | Rejection> {
  const d = await getDocumentForUpdate(tx, vendorId, id);
  if (d.status !== 'pending_upload') return { doc: d, replaced: [], already: true };
  const head = await c.storage.head(d.storageKey);
  if (!head) throw new AppError('CONFLICT', 'No file found in storage yet; upload first', { details: { rule: 'file_missing' } });
  const reject = async (e: AppError): Promise<Rejection> => {
    await c.storage.delete(d.storageKey).catch(() => undefined);
    await tx.update(D).set({ status: 'rejected' }).where(eq(D.id, id));
    return { rejected: e };
  };
  const limit = maxBytesFor(d.mimeType);
  if (head.size > limit) return reject(new ImageRejected('file_too_large', 'File exceeds the size limit', { maxBytes: limit })); // never read an oversized object
  const bytes = await c.storage.get(d.storageKey);
  if (!bytes) throw new AppError('CONFLICT', 'No file found in storage yet; upload first', { details: { rule: 'file_missing' } });
  if (bytes.length > limit) return reject(new ImageRejected('file_too_large', 'File exceeds the size limit', { maxBytes: limit }));
  let dims: ImageVerdict | null = null;
  try {
    if (d.kind === 'image') dims = validateImageBytes(d.mimeType, bytes);
    else if (!sniffMatches(d.mimeType, bytes)) throw new ImageRejected('mime_mismatch', 'File content does not match its declared type');
  } catch (e) {
    if (!(e instanceof ImageRejected)) throw e;
    return reject(e);
  }
  return finalize(tx, vendorId, d, bytes.length, sha256Hex(bytes), false, dims);
}

async function finalize(tx: Tx, vendorId: string, d: DocumentRow, size: number, sha256: string, wantsPrimary: boolean, dims: ImageVerdict | null): Promise<Finalized> {
  await lockProduct(tx, d.productId);
  await tx.update(D).set({ status: 'uploaded', sizeBytes: size, checksumSha256: sha256, width: dims?.width ?? null, height: dims?.height ?? null }).where(eq(D.id, d.id));
  const replaced: { id: string; storageKey: string }[] = [];
  if (d.kind === 'image' && d.purpose === 'product_image') {
    // a placeholder is never kept next to a real image: the first real upload replaces it
    const placeholders = await tx.select({ id: D.id, storageKey: D.storageKey }).from(D).where(and(eq(D.vendorId, vendorId), eq(D.productId, d.productId), eq(D.purpose, 'product_image'), eq(D.isPlaceholder, true), isNull(D.deletedAt)));
    if (placeholders.length) {
      await tx.update(D).set({ deletedAt: new Date(), isPrimary: false }).where(and(eq(D.vendorId, vendorId), inArray(D.id, placeholders.map((p) => p.id))));
      replaced.push(...placeholders);
    }
    const [primary] = await tx.select({ id: D.id }).from(D).where(and(eq(D.vendorId, vendorId), eq(D.productId, d.productId), eq(D.isPrimary, true), isNull(D.deletedAt), ne(D.id, d.id))).limit(1);
    if (wantsPrimary || !primary) await makePrimary(tx, vendorId, d); // the first real image of a product becomes its primary image
  }
  return { doc: await getDocument(tx, vendorId, d.id), replaced, already: false };
}

export async function listDocuments(tx: Tx, vendorId: string, productId: string, filter: { purpose?: string; variantId?: string }) {
  await getProductRow(tx, vendorId, productId);
  return tx.select().from(D).where(and(eq(D.vendorId, vendorId), eq(D.productId, productId), isNull(D.deletedAt), filter.purpose ? eq(D.purpose, filter.purpose) : undefined, filter.variantId ? eq(D.variantId, filter.variantId) : undefined)).orderBy(asc(D.sortOrder), asc(D.createdAt), asc(D.id));
}

export async function updateDocument(tx: Tx, vendorId: string, id: string, patch: { sortOrder?: number; isPrimary?: boolean; fileName?: string }) {
  const d0 = await getDocument(tx, vendorId, id);
  await lockProduct(tx, d0.productId);
  const d = await getDocumentForUpdate(tx, vendorId, id);
  if (patch.isPrimary) {
    if (d.kind !== 'image' || d.status === 'pending_upload' || d.status === 'rejected') throw new AppError('CONFLICT', 'Only uploaded images can be primary');
    if (d.isPlaceholder) {
      const [real] = await tx.select({ id: D.id }).from(D).where(and(eq(D.vendorId, vendorId), eq(D.productId, d.productId), eq(D.purpose, 'product_image'), eq(D.isPlaceholder, false), inArray(D.status, ['uploaded', 'processed']), isNull(D.deletedAt))).limit(1);
      if (real) throw new AppError('CONFLICT', 'A placeholder cannot be primary while real images exist', { details: { rule: 'placeholder_not_primary' } });
    }
    await makePrimary(tx, vendorId, d);
  } else if (patch.isPrimary === false && d.isPrimary) {
    await tx.update(D).set({ isPrimary: false }).where(eq(D.id, id));
  }
  const set: Partial<typeof D.$inferInsert> = {};
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  if (patch.fileName !== undefined) set.fileName = sanitizeFileName(patch.fileName); // display name only; the storage key is immutable
  if (Object.keys(set).length) await tx.update(D).set(set).where(eq(D.id, id));
  return getDocument(tx, vendorId, id);
}

export interface DeleteOutcome { doc: DocumentRow; cancelled: boolean; already: boolean }

/**
 * DELETE /documents/{id}. A `pending_upload` document is an upload being cancelled: the record disappears and the
 * caller removes any partial object. Cancelling twice is a no-op (idempotent); a deleted finished document is 404.
 */
export async function deleteDocument(tx: Tx, vendorId: string, id: string, mode: 'delete' | 'cancel' = 'delete'): Promise<DeleteOutcome> {
  const [any] = await tx.select().from(D).where(and(eq(D.id, id), eq(D.vendorId, vendorId))).for('update');
  if (!any) throw Errors.notFound('Document', id);
  if (any.deletedAt) {
    if (any.status === 'pending_upload') return { doc: any, cancelled: true, already: true };
    throw Errors.notFound('Document', id);
  }
  if (mode === 'cancel' && any.status !== 'pending_upload') throw new AppError('CONFLICT', 'Only an upload in progress can be cancelled; delete the document instead', { details: { rule: 'not_pending_upload', status: any.status } });
  await lockProduct(tx, any.productId);
  await tx.update(D).set({ deletedAt: new Date(), isPrimary: false }).where(eq(D.id, id));
  return { doc: any, cancelled: any.status === 'pending_upload', already: false };
}

export async function readContent(tx: Tx, storage: ObjectStorage, vendorId: string, id: string) {
  const d = await getDocument(tx, vendorId, id);
  if (d.status !== 'uploaded' && d.status !== 'processed') throw new AppError('CONFLICT', 'Document has not been uploaded');
  const body = await storage.get(d.storageKey);
  if (!body) throw Errors.notFound('Stored file', id);
  return { doc: d, body };
}

export async function documentsOfProducts(tx: Tx, vendorId: string, productIds: string[]) {
  if (!productIds.length) return [];
  return tx.select().from(D).where(and(eq(D.vendorId, vendorId), inArray(D.productId, productIds), isNull(D.deletedAt)));
}

/**
 * Creates (or returns) the generated placeholder image of a product. `storedKeys` collects objects written to
 * storage so the route can clean them up if the surrounding transaction fails afterwards.
 */
export async function createPlaceholder(tx: Tx, c: Container, vendorId: string, productId: string, storedKeys: string[]): Promise<{ doc: DocumentRow; created: boolean; madePrimary: boolean }> {
  const product = await getProductRow(tx, vendorId, productId);
  await lockProduct(tx, productId);
  const images = await tx.select().from(D).where(and(eq(D.vendorId, vendorId), eq(D.productId, productId), eq(D.purpose, 'product_image'), isNull(D.deletedAt)));
  const readyReal = images.filter((i) => !i.isPlaceholder && (i.status === 'uploaded' || i.status === 'processed'));
  if (readyReal.some((i) => i.isPrimary)) throw new AppError('CONFLICT', 'The product already has a primary image', { details: { rule: 'has_primary_image', code: 'has_primary_image' } });
  if (readyReal.length) throw new AppError('CONFLICT', 'The product already has images; choose one as primary instead of generating a placeholder', { details: { rule: 'has_images', code: 'has_images' } });
  const existing = images.find((i) => i.isPlaceholder);
  if (existing) {
    const hasPrimary = images.some((i) => i.isPrimary);
    if (!hasPrimary) await makePrimary(tx, vendorId, existing);
    return { doc: await getDocument(tx, vendorId, existing.id), created: false, madePrimary: !hasPrimary };
  }
  const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(D).where(and(eq(D.vendorId, vendorId), eq(D.productId, productId), isNull(D.deletedAt)));
  if (n >= MAX_DOCS_PER_PRODUCT) throw new AppError('CONFLICT', `A product can have at most ${MAX_DOCS_PER_PRODUCT} files`, { details: { rule: 'max_files' } });
  const { svg } = renderPlaceholderSvg(product.productCode, product.title);
  const bytes = Buffer.from(svg, 'utf8');
  const id = newId();
  const storageKey = tenantKey(vendorId, 'products', productId, id, PLACEHOLDER_FILE_NAME);
  await tx.insert(D).values({
    id, vendorId, productId, variantId: null, listingId: null, kind: 'image', purpose: 'product_image', storageKey, fileName: PLACEHOLDER_FILE_NAME, mimeType: PLACEHOLDER_MIME,
    sizeBytes: bytes.length, checksumSha256: sha256Hex(bytes), width: PLACEHOLDER_SIZE_PX, height: PLACEHOLDER_SIZE_PX, sortOrder: 0, isPrimary: false, isPlaceholder: true, status: 'uploaded',
  });
  await c.storage.put(storageKey, bytes, PLACEHOLDER_MIME);
  storedKeys.push(storageKey);
  const [anyPrimary] = await tx.select({ id: D.id }).from(D).where(and(eq(D.vendorId, vendorId), eq(D.productId, productId), eq(D.isPrimary, true), isNull(D.deletedAt))).limit(1);
  if (!anyPrimary) await makePrimary(tx, vendorId, { id, productId });
  return { doc: await getDocument(tx, vendorId, id), created: true, madePrimary: !anyPrimary };
}

export type PrimaryImageState = 'none' | 'uploading' | 'placeholder' | 'ready';

/** Section 3 of the creation brief: ready > uploading (recent pending upload, no ready primary) > placeholder > none. */
export async function primaryImageState(tx: Tx, vendorId: string, productId: string): Promise<{ state: PrimaryImageState; doc: DocumentRow | null }> {
  await getProductRow(tx, vendorId, productId);
  const rows = await tx.select().from(D).where(and(eq(D.vendorId, vendorId), eq(D.productId, productId), eq(D.purpose, 'product_image'), eq(D.kind, 'image'), isNull(D.deletedAt))).orderBy(desc(D.createdAt), desc(D.id));
  const primary = rows.find((r) => r.isPrimary && (r.status === 'uploaded' || r.status === 'processed'));
  if (primary && !primary.isPlaceholder) return { state: 'ready', doc: primary };
  const cutoff = pendingCutoff();
  const pending = rows.find((r) => r.status === 'pending_upload' && r.createdAt >= cutoff);
  if (pending) return { state: 'uploading', doc: pending };
  if (primary) return { state: 'placeholder', doc: primary };
  return { state: 'none', doc: null };
}
