import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { refreshShell } from "@/lib/session";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
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
    <div className="flex h-screen w-full overflow-hidden bg-white">
      {/* Sidebar */}
      <Sidebar />

      {/* Main app column */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Topbar />
        <EmailVerificationBanner />

        {/* Scrollable page outlet */}
        <main className="flex-1 overflow-y-auto bg-[#FAFAFA]">
          <div className="w-full px-12 py-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ⌘K Global search dialog */}
      <GlobalSearch />

      {/* Slide-out Notifications Panel */}
      <NotificationsPanel />
    </div>
  );
}
