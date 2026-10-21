import { manifest } from './manifest';
import { listingRoutes } from './routes';
import { listingJobHandlers } from './runners';
import { listingConsumers } from './consumers';

export { manifest };
export { listingRoutes } from './routes';
export { applyStatusReport, createListing, getListingDto, listingsByStatus, toListingDto } from './service';
export { computeSellable, DEFAULT_POLICY, fromReport, validateListingInput, stableHash, type ChannelPolicy, type ListingStatus } from './domain';
export { markDirty, requestInventorySync, requestPriceSync } from './channel';
export { setListingPrice } from './channel';
export { getListingRow, type ListingRow } from './context';
export { systemCtx, ctxFromRequest, type Ctx } from './ctx';
export { requestImport } from './imports';
export { previewProductChange, applyProductChange, requestContentSync, productListingContentSummary, type ChangeOptions, type ProductChangePlan } from './content';
export { CONTENT_FIELDS, MAX_LISTINGS_PER_PRODUCT, type ContentField, type ProductChange, type ListingImpact } from './content-domain';

/**
 * Listings & Channels: the master-product -> marketplace-listing flow, category/attribute mapping, marketplace catalogue
 * import, and event-driven channel inventory/price synchronisation.
 */
export const listingsModule = { manifest, routes: listingRoutes, jobs: listingJobHandlers, consumers: listingConsumers };
