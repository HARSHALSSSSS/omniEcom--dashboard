import { and, asc, desc, eq, isNull, inArray, schema, type Tx } from '@oms/database';

const D = schema.productDocuments;

export interface ImageDoc { id: string; isPrimary: boolean; isPlaceholder: boolean }

export const imageHref = (docId: string) => `/api/v1/documents/${docId}/content`;

/** the usable images of a product (uploaded / processed, not deleted), primary first: ONE query for the media panel, the nav count and the insights */
export async function loadImages(tx: Tx, vendorId: string, productId: string): Promise<ImageDoc[]> {
  return tx
    .select({ id: D.id, isPrimary: D.isPrimary, isPlaceholder: D.isPlaceholder })
    .from(D)
    .where(and(eq(D.vendorId, vendorId), eq(D.productId, productId), eq(D.kind, 'image'), inArray(D.status, ['uploaded', 'processed']), isNull(D.deletedAt)))
    .orderBy(desc(D.isPrimary), asc(D.sortOrder), asc(D.createdAt), asc(D.id));
}
