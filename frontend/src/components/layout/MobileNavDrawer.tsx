import React, { useEffect, useRef } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NAV_GROUPS, NAV_BOTTOM } from "@/constants/navigation";
import { useUiStore } from "@/store/ui.store";
import { useWorkspaceStore } from "@/store/workspace.store";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import { signOut } from "@/lib/session";
import { prefetchRoute } from "@/app/routePrefetch";

export const MobileNavDrawer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mobileNavOpen, setMobileNavOpen, toggleNotificationsPanel } = useUiStore();
  const { user, shell } = useWorkspaceStore();

  const businessName = shell?.business.name ?? user?.businessName ?? "Nova Living";
  const displayName = shell?.user.name ?? user?.fullName ?? "";
  const displayRole = shell?.user.roleLabel ?? "";
  const initial = (shell?.user.initials ?? displayName.charAt(0) ?? "U").toUpperCase();

  // Close the mobile drawer when navigating to a new route
  const lastPath = useRef(location.pathname);
  useEffect(() => {
    if (lastPath.current !== location.pathname) {
      lastPath.current = location.pathname;
      setMobileNavOpen(false);
    }
  }, [location.pathname, setMobileNavOpen]);

  const badgeFor = (href: string): number => {
    const b = shell?.badges;
    if (!b) return 0;
    if (href === ROUTES.NEEDS_ATTENTION) return b.needsAttention;
    if (href === ROUTES.ORDERS) return b.orders;
    if (href === ROUTES.RETURNS) return b.returns;
    if (href === "/notifications") return b.notifications;
    return 0;
  };

  const handleSignOut = async () => {
    setMobileNavOpen(false);
    await signOut();
    navigate(ROUTES.SIGN_IN, { replace: true });
  };

  return (
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <SheetContent
        side="left"
        className="flex w-[300px] max-w-[85vw] flex-col p-0 border-r border-[#EAEAEA] bg-white gap-0"
      >
        <SheetHeader className="border-b border-[#EAEAEA] px-5 py-4 text-left">
          <SheetTitle className="text-[17px] font-semibold leading-[22px] tracking-tight text-[#0A0A0A]">
            [Product Name]
          </SheetTitle>
          <SheetDescription className="text-[10px] leading-[14px] text-[#666666]">
            Commerce Operating System
          </SheetDescription>

          {/* Active Workspace / Business */}
          <div className="mt-2.5 flex items-center justify-between rounded-lg bg-neutral-100/80 px-2.5 py-1.5 text-left">
            <span className="text-[11px] font-semibold text-[#000000] truncate">
              {businessName}
            </span>
            <Link
              to={ROUTES.AI_ASSISTANT}
              onClick={() => setMobileNavOpen(false)}
              style={{ background: "linear-gradient(98deg, #E9D5FF 0%, #DBEAFE 48%, #93C5FD 100%)" }}
              className="flex h-5 items-center gap-1 text-[10px] font-medium text-[#111111] px-2 rounded-full shadow-xs shrink-0"
              title="AI Assistant"
            >
              <span className="text-[9px] leading-none">✦</span>
              <span>AI</span>
            </Link>
          </div>
        </SheetHeader>

        {/* Scrollable Navigation Groups */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <h3 className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-[#666666]">
                {group.label}
              </h3>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const count = badgeFor(item.href);

                  return (
                    <li key={item.href}>
                      <NavLink
                        to={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        onMouseEnter={() => prefetchRoute(item.href)}
                        className={({ isActive }) =>
                          cn(
                            "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[12px] leading-[17px] transition-colors",
                            isActive
                              ? "bg-[#F5F5F5] text-[#000000] font-semibold"
                              : "bg-white text-[#666666] font-normal hover:bg-neutral-50 hover:text-[#0A0A0A]",
                          )
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0 stroke-[1.5px]" />
                        <span className="truncate">{item.label}</span>
                        {count > 0 && (
                          <span className="ml-auto text-[11px] font-semibold text-[#000000] tabular-nums pl-1">
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Section: Notifications, Settings, Profile */}
        <div className="border-t border-[#EAEAEA] p-3 space-y-2 bg-[#FAFAFA]/70">
          <ul className="space-y-1">
            {NAV_BOTTOM.map((item) => {
              const Icon = item.icon;
              if (item.href === "/notifications") {
                const unread = badgeFor(item.href);
                return (
                  <li key={item.href}>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileNavOpen(false);
                        toggleNotificationsPanel();
                      }}
                      className="flex h-9 w-full items-center gap-2.5 rounded-lg bg-white px-2.5 text-[12px] leading-[17px] font-normal text-[#666666] transition-colors hover:bg-neutral-50 hover:text-[#0A0A0A]"
                    >
                      <Icon className="h-4 w-4 shrink-0 stroke-[1.5px]" />
                      <span className="truncate text-left">{item.label}</span>
                      {unread > 0 && (
                        <span className="ml-auto rounded-full bg-red-100 px-1.5 text-[10px] font-semibold leading-[16px] text-red-700">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </button>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <NavLink
                    to={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    onMouseEnter={() => prefetchRoute(item.href)}
                    className={({ isActive }) =>
                      cn(
                        "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[12px] leading-[17px] transition-colors",
                        isActive
                          ? "bg-[#F5F5F5] text-[#000000] font-semibold"
                          : "bg-white text-[#666666] font-normal hover:bg-neutral-50 hover:text-[#0A0A0A]",
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0 stroke-[1.5px]" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>

          {/* User Profile / Sign Out */}
          <div className="flex items-center justify-between rounded-lg p-2 hover:bg-neutral-50 transition-colors border-t border-[#EAEAEA]/60 pt-2.5">
            <Link
              to={ROUTES.SETTINGS_PROFILE}
              onClick={() => setMobileNavOpen(false)}
              onMouseEnter={() => prefetchRoute(ROUTES.SETTINGS_PROFILE)}
              title="Profile settings"
              className="flex flex-1 items-center gap-2.5 min-w-0 text-left cursor-pointer"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-800">
                {initial}
              </div>
              <div className="flex flex-1 flex-col overflow-hidden text-left">
                <span className="text-[12px] font-semibold text-[#0A0A0A] truncate">
                  {displayName}
                </span>
                <span className="text-[10px] text-[#666666] truncate">
                  {displayRole}
                </span>
              </div>
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              className="p-1.5 text-[#666666] hover:text-red-600 rounded transition-colors shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
