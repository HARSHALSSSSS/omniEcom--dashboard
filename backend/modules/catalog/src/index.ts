import type { FastifyPluginAsync } from 'fastify';
import { manifest } from './manifest';
import { catalogRoutes } from './routes';
import { dashboardRoutes } from './dashboard-routes';
import { dataJobRoutes } from './datajob-routes';
import { creationRoutes } from './creation-routes';
import { productAiRoutes } from './ai-description-routes';
import { exportProductsHandler, importProductsHandler } from './datajobs';

export { manifest };
export { getProductRow, getVariantRow, toProductDto, toVariantDto, createProduct, createVariant, updateVariant, type ProductRow, type VariantRow } from './service';
export { evaluateReadiness } from './readiness';
export { updateProduct, applyProductPatch } from './service';
export { getCreationDto, buildEditorProduct, type CreationDto, type EditorProduct } from './creation';
// product edit flow (docs/figma/51-edit-build-brief.md): the shared write path, field rules and content readiness, read through the entry point only
export { writeProductFields, validationError, versionConflict, findCodeConflict, duplicateCodeError, isCodeLocked, codeLockedError } from './service';
export { normalizeFields, collapseSpaces, nameKey, isPlaceholderCode, TITLE_MIN_STEP, type CustomAttribute, type NormalizedFields, type RawFields, type FieldIssue } from './fields';
export { ProductEditorSchema } from './creation-schemas';
export { PRODUCT_TYPES, productTypeOfAttributes, type ProductType } from './product-types';
export { categoryAttributeFields, planCategoryAttributes, writeCategoryAttributeValues, type CategoryAttributeField, type CategoryAttributeInput, type CategoryAttributeChange } from './category-attributes';
export { productContent, listingStatusOf, rollupStatus, type ChannelNameFn, type ChannelStatus } from './dashboard';
export { evaluateCreationReadiness } from './creation-readiness';
export { sanitizeDescription, toPlainText, DESCRIPTION_MAX_CHARS } from './description';
export { jobEffects, requestEffects, type Effects } from './effects';
export type { ProductInput, VariantInput } from './service';
export { loadCatalogRules, skuProblem, eanProblem, validGtin, assertCatalogRules, type CatalogRules } from './catalog-rules';

const routes: FastifyPluginAsync = async (app) => {
  await app.register(catalogRoutes);
  await app.register(dashboardRoutes);
  await app.register(creationRoutes);
  await app.register(productAiRoutes);
  await app.register(dataJobRoutes); // own plugin: it registers a raw-body (text/csv) content-type parser
};

/**
 * Product Catalog: canonical products + variants/SKUs, search/filter/sort/pagination, bulk operations,
 * marketplace readiness, marketplace-specific data (kept outside the core model) and CSV import/export jobs.
 */
export const catalogModule = { manifest, routes, jobs: [importProductsHandler, exportProductsHandler] };
