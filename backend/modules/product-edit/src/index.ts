import { manifest } from './manifest';
import { productEditRoutes } from './routes';

export { manifest };
export { productEditRoutes };

/** Product Edit: editor read, change-impact preview, atomic save with listing propagation, insights. */
export const productEditModule = { manifest, routes: productEditRoutes };
