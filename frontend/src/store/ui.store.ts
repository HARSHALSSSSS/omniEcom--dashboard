import { create } from "zustand";

interface UiStore {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  globalSearchOpen: boolean;
  setGlobalSearchOpen: (open: boolean) => void;

  activeDrawer: { type: string; id: string } | null;
  openDrawer: (type: string, id: string) => void;
  closeDrawer: () => void;

  notificationsPanelOpen: boolean;
  setNotificationsPanelOpen: (open: boolean) => void;
  toggleNotificationsPanel: () => void;
}

/**
 * Global UI state — sidebar, search, drawer.
 * Never store server data here — use React Query for that.
 */
export const useUiStore = create<UiStore>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  globalSearchOpen: false,
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),

  // Drawer state — encodes ?drawer=order:ORD-001 style URL params
  activeDrawer: null,
  openDrawer: (type, id) => set({ activeDrawer: { type, id } }),
  closeDrawer: () => set({ activeDrawer: null }),

  notificationsPanelOpen: false,
  setNotificationsPanelOpen: (open) => set({ notificationsPanelOpen: open }),
  toggleNotificationsPanel: () =>
    set((s) => ({ notificationsPanelOpen: !s.notificationsPanelOpen })),
}));
