import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Search, ChevronDown, Menu } from "lucide-react";
import { useUiStore } from "@/store/ui.store";
import { useWorkspaceStore } from "@/store/workspace.store";
import { ROUTES } from "@/constants/routes";
import { useProductOverview } from "@/hooks/useProductDetail";
import { prefetchRoute } from "@/app/routePrefetch";

export const Topbar: React.FC = () => {
  const location = useLocation();
  const { setGlobalSearchOpen, setMobileNavOpen } = useUiStore();
  const { user, shell } = useWorkspaceStore();

  const businessName = shell?.business.name ?? user?.businessName ?? "";
  const userInitial = (shell?.user.initials ?? user?.fullName.charAt(0) ?? "").toUpperCase();
  const unread = shell?.badges.notifications ?? 0;
  const alerts = shell?.badges.needsAttention ?? 0;

  // Generate breadcrumb text from pathname
  const pathParts = location.pathname.split("/").filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1];
  // a raw id is no label: name the screen instead
  const looksLikeId = !!lastPart && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lastPart);
  const breadcrumbText =
    pathParts.length === 0
      ? "Dashboard"
      : looksLikeId
        ? pathParts[0] === "listings"
          ? "Listing studio"
          : "Details"
        : lastPart;

  // Check if we are on a product route
  const isProductsRoute = location.pathname.startsWith(ROUTES.PRODUCTS);
  const isProductDetail =
    isProductsRoute &&
    pathParts.length >= 2 &&
    pathParts[1] !== "new" &&
    pathParts[1] !== "import";

  // the real product title: the same cache entry as the detail page, so no second request
  const productId = isProductDetail ? pathParts[1] : undefined;
  const { data: productOverview } = useProductOverview(productId);
  const productTitle = productOverview?.product.title ?? "Product details";

  const isCreateProduct = location.pathname === ROUTES.PRODUCTS_NEW;
  const isEditProduct = location.pathname.endsWith("/edit");
  const isVariantsPage = location.pathname.endsWith("/variants");
  const isListingsRoute = location.pathname.startsWith(ROUTES.LISTINGS);
  const isMarketplaceHubRoute = location.pathname.startsWith(ROUTES.MARKETPLACE_HUB);
  const isConnectorMarketplace = location.pathname === ROUTES.MARKETPLACE_HUB_CONNECTORS;
  const isConnectorSetup = location.pathname.startsWith(`${ROUTES.MARKETPLACE_HUB}/connect/`);
  const isConnectionHealth = location.pathname === ROUTES.MARKETPLACE_HUB_HEALTH;
  const isConnectorDetail = location.pathname.startsWith(`${ROUTES.MARKETPLACE_HUB_CONNECTORS}/`);

  return (
    <header className="flex h-14 md:h-[72px] items-center justify-between border-b border-[#EAEAEA] bg-white px-3 sm:px-6 lg:px-8 z-20 shrink-0 font-['Inter',sans-serif] gap-2">
      {/* Left: Hamburger (mobile) & Breadcrumbs */}
      <div className="flex items-center gap-1.5 sm:gap-3 text-[12px] leading-[17px] min-w-0 truncate">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[#666666] hover:bg-neutral-100 hover:text-[#000000] md:hidden shrink-0 transition-colors -ml-1 sm:ml-0"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5 stroke-[1.75px]" />
        </button>

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
              className={`transition-colors max-w-[320px] truncate ${
                isVariantsPage || isEditProduct
                  ? "text-[#666666] hover:text-[#000000]"
                  : "font-semibold text-[#000000]"
              }`}
              title={productTitle}
            >
              {productTitle}
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
                <span className="font-semibold text-[#000000]">Edit</span>
              </>
            )}
          </>
        ) : isListingsRoute ? (
          <>
            <Link
              to={ROUTES.DASHBOARD}
              className="text-[#666666] hover:text-[#000000] transition-colors"
            >
              Workspace
            </Link>
            <span className="text-[#666666]">/</span>
            {looksLikeId ? (
              <>
                <Link
                  to={ROUTES.LISTINGS}
                  className="text-[#666666] hover:text-[#000000] transition-colors"
                >
                  Listings
                </Link>
                <span className="text-[#666666]">/</span>
                <span className="font-semibold text-[#000000]">Listing studio</span>
              </>
            ) : (
              <Link to={ROUTES.LISTINGS} className="font-semibold text-[#000000]">
                Listings
              </Link>
            )}
          </>
        ) : isMarketplaceHubRoute ? (
          <>
            <Link
              to={ROUTES.DASHBOARD}
              className="text-[#666666] hover:text-[#000000] transition-colors"
            >
              Workspace
            </Link>
            <span className="text-[#666666]">/</span>
            {isConnectorMarketplace ? (
              <>
                <Link
                  to={ROUTES.MARKETPLACE_HUB}
                  className="text-[#666666] hover:text-[#000000] transition-colors"
                >
                  Marketplace Hub
                </Link>
                <span className="text-[#666666]">/</span>
                <span className="font-semibold text-[#000000]">
                  Connector Marketplace
                </span>
              </>
            ) : isConnectorSetup ? (
              <>
                <Link
                  to={ROUTES.MARKETPLACE_HUB}
                  className="text-[#666666] hover:text-[#000000] transition-colors"
                >
                  Marketplace Hub
                </Link>
                <span className="text-[#666666]">/</span>
                <Link
                  to={ROUTES.MARKETPLACE_HUB_CONNECTORS}
                  className="text-[#666666] hover:text-[#000000] transition-colors"
                >
                  Connector Marketplace
                </Link>
                <span className="text-[#666666]">/</span>
                <span className="font-semibold text-[#000000]">Connect</span>
              </>
            ) : isConnectorDetail ? (
              <>
                <Link
                  to={ROUTES.MARKETPLACE_HUB}
                  className="text-[#666666] hover:text-[#000000] transition-colors"
                >
                  Marketplace Hub
                </Link>
                <span className="text-[#666666]">/</span>
                <Link
                  to={ROUTES.MARKETPLACE_HUB_CONNECTORS}
                  className="text-[#666666] hover:text-[#000000] transition-colors"
                >
                  Connector Marketplace
                </Link>
                <span className="text-[#666666]">/</span>
                <span className="font-semibold text-[#000000] capitalize">
                  {lastPart}
                </span>
              </>
            ) : isConnectionHealth ? (
              <>
                <Link
                  to={ROUTES.MARKETPLACE_HUB}
                  className="text-[#666666] hover:text-[#000000] transition-colors"
                >
                  Marketplace Hub
                </Link>
                <span className="text-[#666666]">/</span>
                <span className="font-semibold text-[#000000]">
                  Connection Health
                </span>
              </>
            ) : (
              <span className="font-semibold text-[#000000]">
                Marketplace Hub
              </span>
            )}
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
      <div className="flex items-center gap-2 sm:gap-3 lg:gap-[18px] shrink-0">
        {/* Global Search trigger */}
        <button
          type="button"
          onClick={() => setGlobalSearchOpen(true)}
          className="flex h-9 w-9 sm:w-[180px] lg:w-[278px] items-center justify-center sm:justify-between rounded-lg bg-[#F5F5F5] px-2 sm:px-3 text-[12px] text-[#666666] hover:bg-neutral-200/60 transition-colors"
          title="Search products, orders, SKUs..."
        >
          <div className="flex items-center gap-2 min-w-0">
            <Search className="h-4 w-4 text-[#666666] stroke-[1.5px] shrink-0" />
            <span className="truncate hidden sm:inline">Search products, orders, SKUs...</span>
          </div>
          <span className="pointer-events-none text-[12px] font-mono text-[#666666] hidden lg:inline">
            ⌘K
          </span>
        </button>

        {/* Global status text: real count from the workspace shell */}
        {alerts > 0 && (
          <Link
            to={ROUTES.NEEDS_ATTENTION}
            className="text-[12px] text-[#666666] hover:text-[#000000] hidden md:inline"
          >
            {alerts} {alerts === 1 ? "alert requires" : "alerts require"} review
          </Link>
        )}

        {/* Notifications */}
        <button
          type="button"
          onClick={() => useUiStore.getState().toggleNotificationsPanel()}
          className="relative flex h-9 w-9 sm:h-[15px] sm:w-[15px] lg:h-[15px] lg:w-[15px] items-center justify-center text-[#666666] hover:text-[#0A0A0A] transition-colors"
          title="Notifications"
        >
          <Bell className="h-[15px] w-[15px] stroke-[1.5px]" />
          {unread > 0 && <span className="absolute 1 sm:-top-1 sm:-right-1 h-2 w-2 rounded-full bg-red-500" aria-label={`${unread} unread notifications`} />}
        </button>

        {/* AI assistant trigger */}
        <Link
          to={ROUTES.AI_ASSISTANT}
          style={{ background: "linear-gradient(98deg, #E9D5FF 0%, #DBEAFE 48%, #93C5FD 100%)" }}
          className="hidden sm:flex h-7 items-center gap-1.5 text-[12px] font-medium text-[#111111] hover:opacity-90 transition-opacity px-2.5 rounded-full shadow-xs"
          title="AI Assistant"
        >
          <span className="text-[11px] leading-none text-[#222222]">✦</span>
          <span className="text-[12px] font-medium">AI</span>
        </Link>

        {/* Business switcher */}
        <div className="hidden md:flex items-center gap-1 sm:gap-2 cursor-pointer hover:opacity-80 transition-opacity">
          <span className="text-[12px] font-semibold text-[#000000] max-w-[70px] sm:max-w-[120px] lg:max-w-none truncate">
            {businessName}
          </span>
          <ChevronDown className="h-3 w-3 text-[#666666] stroke-[1.5px] shrink-0" />
        </div>

        {/* User avatar circle */}
        <Link
          to={ROUTES.SETTINGS_PROFILE}
          onMouseEnter={() => prefetchRoute(ROUTES.SETTINGS_PROFILE)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F5F5F5] text-[12px] font-normal text-[#000000] shrink-0 hover:bg-neutral-200/80 transition-colors cursor-pointer"
          title="Profile settings"
          aria-label="Profile settings"
        >
          {userInitial}
        </Link>
      </div>
    </header>
  );
};

