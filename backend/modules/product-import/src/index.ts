import { manifest } from './manifest';
import { productImportRoutes } from './http/routes';
import { commitHandler } from './application/commit';
import { validateHandler } from './application/validation';

export { manifest };

/**
 * Product Import wizard: upload a CSV / TSV / XLSX file, auto-map its columns, validate every row into reviewable issues with suggested
 * fixes, resolve or ignore them, then commit in the background through the catalogue, inventory and listings modules.
 * Nothing in here is exported for other modules: the wizard is reached over HTTP (`/api/v1/imports`).
 */
export const productImportModule = { manifest, routes: productImportRoutes, jobs: [validateHandler, commitHandler] };
