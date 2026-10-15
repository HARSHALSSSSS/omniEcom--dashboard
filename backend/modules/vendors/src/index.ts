import { manifest } from './manifest';
import { vendorRoutes } from './routes';

export { manifest };
export { vendorRoutes };
export { getVendor, toVendorDto, updateVendor, updateSettings, type VendorRow } from './service';

/** Vendor / Organization: tenant root, business profile, settings and platform-level status administration. */
export const vendorsModule = { manifest, routes: vendorRoutes };
