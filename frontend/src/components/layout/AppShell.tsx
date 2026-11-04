import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { refreshShell } from "@/lib/session";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationsPanel } from "./NotificationsPanel";
import { EmailVerificationBanner } from "./EmailVerificationBanner";

const SHELL_REFRESH_MS = 60_000;

export default function AppShell() {
  // sidebar badges and the notification dot follow the server while the workspace is open
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refreshShell().catch(() => undefined);
    };
    const timer = window.setInterval(tick, SHELL_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-white">
      {/* Desktop Sidebar (hidden on mobile) */}
      <Sidebar />

      {/* Main app column */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <div className="shrink-0">
          <Topbar />
        </div>
        <EmailVerificationBanner />

        {/* Scrollable page outlet */}
        <main className="flex-1 overflow-y-auto bg-[#FAFAFA]">
          <div className="w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-12 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile Slide-Out Navigation Drawer */}
      <MobileNavDrawer />

      {/* ⌘K Global search dialog */}
      <GlobalSearch />

      {/* Slide-out Notifications Panel */}
      <NotificationsPanel />
    </div>
  );
}
