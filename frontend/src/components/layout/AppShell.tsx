import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationsPanel } from "./NotificationsPanel";

export default function AppShell() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      {/* Sidebar */}
      <Sidebar />

      {/* Main app column */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Topbar />

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
