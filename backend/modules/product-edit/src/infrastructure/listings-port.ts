import type { ChangeOptions, ProductChangePlan } from '@oms/mod-listings';

/**
 * The listings side of the edit flow: the entry points of `@oms/mod-listings` (contract in docs/figma/51-edit-build-brief.md section 2).
 * This module never marks listings and never writes `marketplace_listings`: it only asks the listings module to preview / apply a product
 * change in the caller's transaction and to sync content after the commit.
 */
export {
  previewProductChange, applyProductChange, requestContentSync, productListingContentSummary,
  type ContentField, type ListingImpact, type ProductChange,
} from '@oms/mod-listings';

export type ListingPlan = ProductChangePlan;
export type ListingPlanState = ProductChangePlan['listings'][number]['state'];
/** the connector registry of the running container and who changed the product (the listings module audits listings that need a decision) */
export type ListingOpts = Pick<ChangeOptions, 'connectors' | 'actor' | 'requestId'>;
