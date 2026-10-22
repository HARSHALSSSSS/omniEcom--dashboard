import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Search, ChevronDown, HelpCircle } from "lucide-react";
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

  // Check if we are on a product route
  const isProductsRoute = location.pathname.startsWith(ROUTES.PRODUCTS);
  const isProductDetail =
    isProductsRoute &&
    pathParts.length >= 2 &&
    pathParts[1] !== "new" &&
    pathParts[1] !== "import";

  const isCreateProduct = location.pathname === ROUTES.PRODUCTS_NEW;
  const isEditProduct = location.pathname.endsWith("/edit");
  const isVariantsPage = location.pathname.endsWith("/variants");

  return (
    <header className="flex h-[72px] items-center justify-between border-b border-[#EAEAEA] bg-white px-8 z-20 shrink-0 font-['Inter',sans-serif]">
      {/* Left: Breadcrumbs */}
      <div className="flex items-center gap-3 text-[12px] leading-[17px]">
        {isCreateProduct ? (
          <>
            <Link
              to={ROUTES.DASHBOARD}
              className="text-[#666666] hover:text-[#000000] transition-colors"
            >
              Workspace
            </Link>
            <span className="text-[#666666]">/</span>
            <Link
              to={ROUTES.PRODUCTS}
              className="text-[#666666] hover:text-[#000000] transition-colors"
            >
              Products
            </Link>
            <span className="text-[#666666]">/</span>
            <span className="font-semibold text-[#000000]">
              Create product
            </span>
          </>
        ) : isProductDetail ? (
          <>
            <Link
              to={ROUTES.DASHBOARD}
              className="text-[#666666] hover:text-[#000000] transition-colors"
            >
              Workspace
            </Link>
            <span className="text-[#666666]">/</span>
            <Link
              to={ROUTES.PRODUCTS}
              className="text-[#666666] hover:text-[#000000] transition-colors"
            >
              Products
            </Link>
            <span className="text-[#666666]">/</span>
            <Link
              to={`${ROUTES.PRODUCTS}/${pathParts[1]}`}
              className={`transition-colors ${
                isVariantsPage || isEditProduct
                  ? "text-[#666666] hover:text-[#000000]"
                  : "font-semibold text-[#000000]"
              }`}
            >
              {pathParts[1] === "prod-2"
                ? "Classic Backpack"
                : pathParts[1] === "prod-3"
                ? "Cotton Overshirt"
                : pathParts[1] === "prod-4"
                ? "Travel Organizer Set"
                : "Premium Travel Bag"}
            </Link>
            {isVariantsPage && (
              <>
                <span className="text-[#666666]">/</span>
                <span className="font-semibold text-[#000000]">
                  Variants &amp; SKU Management
                </span>
              </>
            )}
            {isEditProduct && (
              <>
                <span className="text-[#666666]">/</span>
                <span className="font-semibold text-[#000000]">
                  Edit
                </span>
              </>
            )}
          </>
        ) : location.pathname.startsWith(ROUTES.PRODUCTS_IMPORT) ? (
          <>
            <Link
              to={ROUTES.DASHBOARD}
              className="text-[#666666] hover:text-[#000000] transition-colors"
            >
              Workspace
            </Link>
            <span className="text-[#666666]">/</span>
            <Link
              to={ROUTES.PRODUCTS}
              className="text-[#666666] hover:text-[#000000] transition-colors"
            >
              Products
            </Link>
            <span className="text-[#666666]">/</span>
            <span className="font-semibold text-[#000000]">Import</span>
          </>
        ) : location.pathname.startsWith(ROUTES.LISTINGS) ? (
          <>
            <Link
              to={ROUTES.DASHBOARD}
              className="text-[#666666] hover:text-[#000000] transition-colors"
            >
              Workspace
            </Link>
            <span className="text-[#666666]">/</span>
            <Link
              to={ROUTES.LISTINGS}
              className="font-semibold text-[#000000]"
            >
              Listings
            </Link>
          </>
        ) : (
          <>
            <Link
              to={ROUTES.DASHBOARD}
              className="text-[#666666] hover:text-[#000000] transition-colors"
            >
              Workspace
            </Link>
            <span className="text-[#666666]">/</span>
            <span className="font-semibold text-[#000000] capitalize">
              {breadcrumbText.replace(/-/g, " ")}
            </span>
          </>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-[18px]">
        {/* Global Search trigger */}
        <button
          type="button"
          onClick={() => setGlobalSearchOpen(true)}
          className="flex h-9 w-[284px] items-center justify-between rounded-lg bg-[#F5F5F5] px-3 text-[12px] text-[#666666] hover:bg-neutral-200/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-[#666666] stroke-[1.5px]" />
            <span className="truncate">Search products, orders, SKUs...</span>
          </div>
          <span className="pointer-events-none text-[12px] font-mono text-[#666666]">
            ⌘ K
          </span>
        </button>

        {/* Notifications */}
        <button
          type="button"
          onClick={() => useUiStore.getState().toggleNotificationsPanel()}
          className="relative flex h-[16px] w-[16px] items-center justify-center text-[#666666] hover:text-[#0A0A0A] transition-colors"
          title="Notifications"
        >
          <Bell className="h-4 w-4 stroke-[1.5px]" />
        </button>

        {/* Help */}
        <button
          type="button"
          className="flex h-[16px] w-[16px] items-center justify-center text-[#666666] hover:text-[#0A0A0A] transition-colors"
          title="Help & Support"
        >
          <HelpCircle className="h-4 w-4 stroke-[1.5px]" />
        </button>

        {/* Business switcher */}
        <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
          <span className="text-[12px] font-semibold text-[#000000]">
            {businessName}
          </span>
          <ChevronDown className="h-3 w-3 text-[#666666] stroke-[1.5px]" />
        </div>

        {/* User avatar circle */}
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F5F5F5] text-[12px] font-normal text-[#000000]">
          {userInitial}
        </div>
      </div>
    </header>
  );
};

