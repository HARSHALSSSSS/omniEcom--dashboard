import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { PanelLeft, LogOut } from "lucide-react";
import { NAV_GROUPS, NAV_BOTTOM } from "@/constants/navigation";
import { useUiStore } from "@/store/ui.store";
import { useWorkspaceStore } from "@/store/workspace.store";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import { signOut } from "@/lib/session";

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
        "relative flex flex-col border-r border-[#EAEAEA] bg-white transition-all duration-300 select-none z-30 shrink-0",
        sidebarCollapsed ? "w-14" : "w-[224px]",
      )}
    >
      {/* Brand header */}
      <div
        className={cn(
          "flex h-[72px] items-center border-b border-[#EAEAEA]",
          sidebarCollapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        {!sidebarCollapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="text-[17px] font-semibold leading-[22px] tracking-tight text-[#0A0A0A] truncate">
              [Product Name]
            </span>
            <span className="text-[10px] leading-[18px] text-[#666666] truncate mt-0.5">
              Commerce Operating System
            </span>
          </div>
        )}
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            {!sidebarCollapsed && (
              <h3 className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-[#666666]">
                {group.label}
              </h3>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;

                return (
                  <li key={item.href}>
                    <NavLink
                      to={item.href}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          "flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors",
                          isActive
                            ? "bg-[#E6F4FF] text-[#1D4ED8] font-semibold"
                            : "bg-white text-[#666666] font-normal hover:bg-neutral-50 hover:text-[#0A0A0A]",
                          sidebarCollapsed && "justify-center px-0",
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!sidebarCollapsed && (
                        <span className="flex-1 truncate">{item.label}</span>
                      )}
                      {!sidebarCollapsed && badgeFor(item.href) > 0 && (
                        <span className="ml-auto rounded-full bg-[#E4E4E7] px-1.5 text-[10px] font-semibold leading-[16px] text-[#18181B]">
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
      <div className="border-t border-[#EAEAEA] p-3 space-y-2">
        <ul className="space-y-1">
          {NAV_BOTTOM.map((item) => {
            const Icon = item.icon;
            if (item.href === "/notifications") {
              const unread = badgeFor(item.href);
              return (
                <li key={item.href}>
                  <button
                    type="button"
                    onClick={toggleNotificationsPanel}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      "flex h-[34px] w-full items-center gap-2.5 rounded-lg bg-white px-2.5 text-[13px] font-normal text-[#666666] transition-colors hover:bg-neutral-50 hover:text-[#0A0A0A]",
                      sidebarCollapsed && "justify-center px-0",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!sidebarCollapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
                    {!sidebarCollapsed && unread > 0 && (
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
                  title={sidebarCollapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      "flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors",
                      isActive
                        ? "bg-[#E6F4FF] text-[#1D4ED8] font-semibold"
                        : "bg-white text-[#666666] font-normal hover:bg-neutral-50 hover:text-[#0A0A0A]",
                      sidebarCollapsed && "justify-center px-0",
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>

        {/* User profile / Business Switcher */}
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-lg p-2 hover:bg-neutral-50 cursor-pointer transition-colors pt-2 border-t border-[#EAEAEA]/60",
            sidebarCollapsed && "justify-center p-1",
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-800">
            {initial}
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-1 flex-col overflow-hidden text-left">
              <span className="text-[12px] font-semibold text-[#0A0A0A] truncate">
                {displayName}
              </span>
              <span className="text-[10px] text-[#666666] truncate">
                {displayRole}
              </span>
            </div>
          )}
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              className="p-1 text-[#666666] hover:text-red-600 rounded transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
