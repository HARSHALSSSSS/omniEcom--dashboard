import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { ShellData } from "@/store/workspace.store";

export interface NotificationItem {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string | null;
  category: "order" | "inventory" | "connector" | "security" | "returns" | "system";
  actionUrl: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  nextBefore: string | number | null;
}

export interface SearchItem {
  id: string;
  title: string;
  subtitle: string | null;
  /** the kind of hit again ("Product", "Order"...) */
  meta?: string | null;
  badge?: { key: string; label: string; tone: string } | null;
  href: string;
}

export interface SearchGroup {
  type: "product" | "order" | "sku";
  label: string;
  total: number;
  items: SearchItem[];
}

export interface SearchResult {
  groups: SearchGroup[];
  total: number;
  shown: number;
}

export const workspaceApi = {
  shell: async () => unwrap<ShellData>(await client.get(ENDPOINTS.WORKSPACE_SHELL)),

  notifications: async (params: { limit?: number; before?: string | number | null; unread?: boolean; category?: string; severity?: string } = {}) => {
    const query: Record<string, string | number> = { limit: params.limit ?? 20 };
    if (params.before != null) query.before = params.before;
    if (params.unread) query["filter[unread]"] = "true";
    if (params.category) query["filter[category]"] = params.category;
    if (params.severity) query["filter[severity]"] = params.severity;
    return unwrap<NotificationPage>(await client.get(ENDPOINTS.NOTIFICATIONS, { params: query }));
  },
  unreadCount: async () => unwrap<{ total: number; bySeverity?: Record<string, number> }>(await client.get(ENDPOINTS.NOTIFICATIONS_UNREAD_COUNT)),
  markRead: async (ids: string[]) => {
    await client.post(ENDPOINTS.NOTIFICATIONS_READ, { ids });
  },
  markAllRead: async () => {
    await client.post(ENDPOINTS.NOTIFICATIONS_READ, { all: true });
  },

  search: async (q: string, scope: "all" | "products" | "orders" | "skus" = "all", signal?: AbortSignal) =>
    unwrap<SearchResult>(await client.get(ENDPOINTS.SEARCH, { params: { q, scope, limit: 8 }, signal })),
};
