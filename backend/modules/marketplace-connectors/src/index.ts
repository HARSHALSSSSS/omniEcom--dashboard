import { manifest } from './manifest';
import { connectorRoutes, AuthFlowSchema } from './routes';
import { refreshExpiringTokensHandler } from './jobs';

export { manifest };
export { connectorRoutes, AuthFlowSchema };
export { ConnectorHost, rateLimitRemainingPct, signState, verifyState, type HostOptions } from './host';
export { connectorProfile, splitConnectInput, type AuthFlowDescriptor, type ConnectorProfile, type CredentialField } from './profiles';
export { refreshExpiringTokensHandler, JOB_REFRESH_EXPIRING } from './jobs';

/**
 * Marketplace Connectors (runtime): connector catalogue + capability matrix, the authorization lifecycle
 * (authorize / reconnect / refresh / health / disconnect) and the host that runs connector calls with
 * credential decryption, token rotation, rate limiting, retries and health tracking.
 */
export const marketplaceConnectorsModule = { manifest, routes: connectorRoutes, jobs: [refreshExpiringTokensHandler] };
