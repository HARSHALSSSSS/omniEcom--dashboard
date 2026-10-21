import { manifest } from './manifest';
import { vendorRoutes } from './routes';

export { manifest };
export { vendorRoutes };
export { getVendor, toVendorDto, updateVendor, updateSettings, type VendorRow } from './service';
export { vendorGstRegistrations, type GstRegistration } from './gst-service';
export { stateNameForCode, listGstStates, checkGstin } from './gst';
export { resolveSettings, alertEnabled, ALERT_DEFAULTS, OPERATIONS_DEFAULTS, type AlertGate, type ResolvedSettings, type ResolvedAlerts } from './settings-defaults';

/** Vendor / Organization: tenant root, business profile, GST registry, settings and platform-level status administration. */
export const vendorsModule = { manifest, routes: vendorRoutes };
