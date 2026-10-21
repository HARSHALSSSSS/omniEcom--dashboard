import { useWorkspaceStore } from "@/store/workspace.store";

/**
 * Permission check against what the server granted this session (GET /me -> permissions, strings like
 * "products:write" or "pricing:approve"). Nothing is allowed until the session has loaded: the default is deny.
 * The server stays the authority; this only decides what to show or disable.
 */
export function useCan(permission: string): boolean {
  return useWorkspaceStore((s) => s.permissions.includes(permission));
}

/** true when the session holds at least one of the permissions */
export function useCanAny(...permissions: string[]): boolean {
  return useWorkspaceStore((s) => permissions.some((p) => s.permissions.includes(p)));
}

/** true when a platform feature flag from the shell is on (e.g. "ai.enabled", "automation.enabled") */
export function useFeature(flag: string): boolean {
  return useWorkspaceStore((s) => s.shell?.features?.[flag] === true);
}
