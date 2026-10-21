import type { MarketplaceConnector } from '@oms/marketplace-core';
import { MeeshoConnector, type MeeshoOptions } from './adapter';

export { MeeshoConnector, type MeeshoOptions } from './adapter';
export { meeshoControl, meeshoSimulator, meeshoWorld, createMeeshoSimulator } from './simulator';
export { capabilities as meeshoCapabilities, readiness as meeshoReadiness, polling as meeshoPolling } from './capabilities';
export { mapSubOrder as mapMeeshoOrder, toInternalOrderStatus as toInternalMeeshoOrderStatus, ORDER_STATUS_MAP as MEESHO_ORDER_STATUS_MAP } from './mappers';

export const createMeeshoConnector = (opts?: MeeshoOptions): MarketplaceConnector => new MeeshoConnector(opts);
