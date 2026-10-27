import { useWorkspaceStore } from "@/store/workspace.store";

/** the workspace defaults of Settings > General, read where a screen needs its starting point (the URL always wins over them) */
const prefs = () => useWorkspaceStore.getState().shell?.business.preferences;

/** the rows per page a table starts with: the workspace choice when this table offers that size, else the table's own default */
export function preferredPageSize(allowed: readonly number[], fallback: number): number {
  const size = prefs()?.pageSize;
  return size !== undefined && allowed.includes(size) ? size : fallback;
}

/** the screen to open after signing in (undefined = the dashboard) */
export function preferredLandingRoute(): string | undefined {
  const route = prefs()?.defaultRoute;
  return route && route.startsWith("/") ? route : undefined;
}

export type PreferredPeriod = "7d" | "30d" | "qtd" | "fytd";
export const preferredPeriod = (): PreferredPeriod => prefs()?.reportingPeriod ?? "30d";
