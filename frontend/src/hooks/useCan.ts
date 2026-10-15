import { useWorkspaceStore } from "@/store/workspace.store";

export type Role = "owner" | "admin" | "seller" | "viewer";

export type Permission =
  | "manage:workspace"
  | "manage:products"
  | "manage:orders"
  | "manage:inventory"
  | "manage:channels"
  | "manage:finance"
  | "manage:settings"
  | "view:analytics";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    "manage:workspace",
    "manage:products",
    "manage:orders",
    "manage:inventory",
    "manage:channels",
    "manage:finance",
    "manage:settings",
    "view:analytics",
  ],
  admin: [
    "manage:products",
    "manage:orders",
    "manage:inventory",
    "manage:channels",
    "manage:settings",
    "view:analytics",
  ],
  seller: [
    "manage:products",
    "manage:orders",
    "manage:inventory",
    "view:analytics",
  ],
  viewer: ["view:analytics"],
};

/**
 * Role-based permission hook.
 * Checks if the currently authenticated user has the requested permission.
 */
export function useCan(permission: Permission): boolean {
  const { user } = useWorkspaceStore();
  const role = (user?.role as Role) || "owner";
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.owner;
  return permissions.includes(permission);
}
