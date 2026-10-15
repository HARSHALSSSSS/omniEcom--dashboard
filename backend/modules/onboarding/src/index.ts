import { manifest } from './manifest';
import { onboardingRoutes } from './routes';

export { manifest };
export { onboardingRoutes };
export { getState as getOnboardingState } from './service';

/**
 * Onboarding: the guided seller setup (business, channels, products, inventory, fulfillment, ready). It owns the setup progress and the
 * fulfillment preferences, and delegates everything else to the modules that own it (vendor profile, marketplace accounts, warehouses).
 */
export const onboardingModule = { manifest, routes: onboardingRoutes };
