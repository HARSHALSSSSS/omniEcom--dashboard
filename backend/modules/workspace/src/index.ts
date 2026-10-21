import { manifest } from './manifest';
import { workspaceRoutes } from './routes';

export { manifest };
export { workspaceRoutes };

/** Workspace: dashboard shell data, global search, saved views, dashboard aggregate and side panels. */
export const workspaceModule = { manifest, routes: workspaceRoutes };
