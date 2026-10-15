import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, HelpCircle, Search, ChevronDown } from "lucide-react";
import { useUiStore } from "@/store/ui.store";
import { useWorkspaceStore } from "@/store/workspace.store";
import { ROUTES } from "@/constants/routes";

export const Topbar: React.FC = () => {
  const location = useLocation();
  const { setGlobalSearchOpen } = useUiStore();
  const { user } = useWorkspaceStore();

  const businessName = user?.businessName ?? "Nova Living";
  const userInitial = (user?.fullName ?? "Abhishek").charAt(0).toUpperCase();

  // Generate breadcrumb text from pathname
  const pathParts = location.pathname.split("/").filter(Boolean);
  const breadcrumbText =
    pathParts.length === 0 ? "Dashboard" : pathParts[pathParts.length - 1];

  return (
    <header className="flex h-[72px] items-center justify-between border-b border-[#EAEAEA] bg-white px-8 z-20 shrink-0">
      {/* Left: Breadcrumbs */}
      <div className="flex items-center gap-2 text-[13px]">
        <Link
          to={ROUTES.DASHBOARD}
          className="text-[#71717A] hover:text-[#0A0A0A] transition-colors"
        >
          Workspace
        </Link>
        <span className="text-[#A1A1AA]">/</span>
        <span className="font-semibold text-[#0A0A0A] capitalize">
          {breadcrumbText.replace(/-/g, " ")}
        </span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-5">
        {/* Global Search trigger */}
        <button
          type="button"
          onClick={() => setGlobalSearchOpen(true)}
          className="flex h-9 w-[320px] items-center justify-between rounded-lg bg-[#F4F4F5] px-3.5 text-[12px] text-[#71717A] hover:bg-[#EBEBEF] transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Search className="h-4 w-4 text-[#71717A]" strokeWidth={1.75} />
            <span className="truncate">Search products, orders, SKUs...</span>
          </div>
          <span className="pointer-events-none text-[11px] font-mono text-[#71717A]">
            ⌘ K
          </span>
        </button>

        {/* Notifications */}
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#71717A] hover:bg-neutral-100 hover:text-[#0A0A0A] transition-colors"
          title="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

        {/* Help */}
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#71717A] hover:bg-neutral-100 hover:text-[#0A0A0A] transition-colors"
          title="Help & documentation"
        >
          <HelpCircle className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

        {/* Business switcher */}
        <div className="flex items-center gap-1.5 cursor-pointer rounded-lg px-1.5 py-1 hover:bg-neutral-100 transition-colors">
          <span className="text-[13px] font-semibold text-[#0A0A0A]">
            {businessName}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-[#71717A]" strokeWidth={2} />
        </div>

        {/* User avatar circle */}
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E4E4E7] text-[12px] font-semibold text-[#18181B]">
          {userInitial}
        </div>
      </div>
    </header>
  );
};

