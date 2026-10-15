import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { GlobalSearch } from "./GlobalSearch";

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
          <div className="w-full max-w-[1216px] mx-auto px-10 py-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ⌘K Global search dialog */}
      <GlobalSearch />
    </div>
  );
}
