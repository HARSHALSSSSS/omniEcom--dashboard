import { manifest } from './manifest';
import { documentRoutes } from './routes';

export { manifest };
export { documentRoutes };
/** media use-cases other modules may call (the product import attaches uploaded images to the products it creates) */
export { createDocument, uploadContent, isRejection, validateImageBytes, ImageRejected } from './service';

/**
 * Documents & Media: product images, documents and listing documents. Bytes live in object storage behind the
 * `ObjectStorage` port (S3/MinIO/memory...); this module owns metadata, validation (type, size, content sniffing),
 * primary-image rules and short-lived download URLs.
 */
export const documentsModule = { manifest, routes: documentRoutes };
