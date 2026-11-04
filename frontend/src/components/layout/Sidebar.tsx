import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { PanelLeft, LogOut } from "lucide-react";
import { NAV_GROUPS, NAV_BOTTOM } from "@/constants/navigation";
import { useUiStore } from "@/store/ui.store";
import { useWorkspaceStore } from "@/store/workspace.store";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import { signOut } from "@/lib/session";
import { prefetchRoute } from "@/app/routePrefetch";

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const { user, shell } = useWorkspaceStore();
  const { toggleNotificationsPanel } = useUiStore();

  const displayName = shell?.user.name ?? user?.fullName ?? "";
  const displayRole = shell?.user.roleLabel ?? "";
  const initial = (shell?.user.initials ?? displayName.charAt(0)).toUpperCase();

  // counters the shell endpoint keeps up to date; a badge only shows when there is something to look at
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
    await signOut();
    navigate(ROUTES.SIGN_IN, { replace: true });
  };

  return (
    <aside
      className={cn(
        "hidden md:flex relative flex-col h-full border-r border-[#EAEAEA] bg-white transition-all duration-300 select-none z-30 shrink-0",
        sidebarCollapsed ? "w-14" : "w-[224px]",
      )}
    >
      {/* Brand header */}
      <div
        className={cn(
          "flex h-14 md:h-[72px] items-center border-b border-[#EAEAEA] justify-between px-4",
          sidebarCollapsed && "justify-center px-2",
        )}
      >
        <div className={cn("flex flex-col overflow-hidden", sidebarCollapsed && "hidden")}>
          <span className="text-[17px] font-semibold leading-[22px] tracking-tight text-[#0A0A0A] truncate">
            [Product Name]
          </span>
          <span className="text-[10px] leading-[18px] text-[#666666] truncate mt-0.5">
            Commerce Operating System
          </span>
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md text-[#71717A] hover:bg-neutral-100 hover:text-[#0A0A0A] transition-colors shrink-0",
            sidebarCollapsed && "mx-auto",
          )}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
      </div>

      {/* Nav groups */}
      <div className="overflow-y-auto px-4 py-4 flex flex-col space-y-4 shrink flex-1 transition-all no-scrollbar">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col space-y-1 shrink-0">
            <h3 className={cn("px-2.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-[#666666]", sidebarCollapsed && "hidden")}>
              {group.label}
            </h3>
            <ul className="flex flex-col space-y-1 shrink-0">
              {group.items.map((item) => {
                const Icon = item.icon;

                return (
                  <li key={item.href} className="shrink-0">
                    <NavLink
                      to={item.href}
                      onMouseEnter={() => prefetchRoute(item.href)}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          "flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[12px] leading-[17px] transition-colors shrink-0 whitespace-nowrap",
                          isActive
                            ? "bg-[#F5F5F5] text-[#000000] font-semibold"
                            : "bg-white text-[#666666] font-normal hover:bg-neutral-50 hover:text-[#0A0A0A]",
                          sidebarCollapsed && "justify-center px-0",
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0 stroke-[1.5px]" />
                      <span className={cn("truncate", sidebarCollapsed && "hidden")}>{item.label}</span>
                      {badgeFor(item.href) > 0 && (
                        <span className={cn("ml-auto text-[11px] font-semibold text-[#000000] tabular-nums pl-1", sidebarCollapsed && "hidden")}>
                          {badgeFor(item.href) > 99 ? "99+" : badgeFor(item.href)}
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

      {/* Bottom section: Notifications, Settings, Profile */}
      <div className="border-t border-[#EAEAEA] p-3 flex flex-col space-y-2 shrink-0 bg-white">
        <ul className="flex flex-col space-y-1 shrink-0">
          {NAV_BOTTOM.map((item) => {
            const Icon = item.icon;
            if (item.href === "/notifications") {
              const unread = badgeFor(item.href);
              return (
                <li key={item.href} className="shrink-0">
                  <button
                    type="button"
                    onClick={toggleNotificationsPanel}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      "flex h-[34px] items-center gap-2.5 rounded-lg bg-white px-2.5 text-[12px] leading-[17px] font-normal text-[#666666] transition-colors hover:bg-neutral-50 hover:text-[#0A0A0A] shrink-0 whitespace-nowrap",
                      sidebarCollapsed && "justify-center px-0",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 stroke-[1.5px]" />
                    <span className={cn("truncate text-left", sidebarCollapsed && "hidden")}>{item.label}</span>
                    {unread > 0 && (
                      <span className={cn("ml-auto rounded-full bg-red-100 px-1.5 text-[10px] font-semibold leading-[16px] text-red-700", sidebarCollapsed && "hidden")}>
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </button>
                </li>
              );
            }
            return (
              <li key={item.href} className="shrink-0">
                <NavLink
                  to={item.href}
                  onMouseEnter={() => prefetchRoute(item.href)}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      "flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[12px] leading-[17px] transition-colors shrink-0 whitespace-nowrap",
                      isActive
                        ? "bg-[#F5F5F5] text-[#000000] font-semibold"
                        : "bg-white text-[#666666] font-normal hover:bg-neutral-50 hover:text-[#0A0A0A]",
                      sidebarCollapsed && "justify-center px-0",
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0 stroke-[1.5px]" />
                  <span className={cn("truncate", sidebarCollapsed && "hidden")}>{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>

        {/* User profile / Business Switcher */}
        <div
          className={cn(
            "flex items-center justify-between rounded-lg p-1.5 md:p-2 hover:bg-neutral-50 transition-colors pt-2 border-t border-[#EAEAEA]/60 shrink-0",
            sidebarCollapsed && "justify-center p-1",
          )}
        >
          <Link
            to={ROUTES.SETTINGS_PROFILE}
            onMouseEnter={() => prefetchRoute(ROUTES.SETTINGS_PROFILE)}
            title={sidebarCollapsed ? `${displayName || "Profile"} (Settings)` : "Profile settings"}
            className={cn(
              "flex flex-1 items-center gap-2.5 min-w-0 text-left cursor-pointer",
              sidebarCollapsed && "justify-center",
            )}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-800">
              {initial}
            </div>
            <div className={cn("flex flex-1 flex-col overflow-hidden text-left", sidebarCollapsed && "hidden")}>
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
            className={cn("p-1 text-[#666666] hover:text-red-600 rounded transition-colors shrink-0", sidebarCollapsed && "hidden")}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
