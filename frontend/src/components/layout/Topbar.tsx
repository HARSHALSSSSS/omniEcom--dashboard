import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, HelpCircle, Search, ChevronDown } from "lucide-react";
import { useUiStore } from "@/store/ui.store";
import { useWorkspaceStore } from "@/store/workspace.store";
import { ROUTES } from "@/constants/routes";
import { useProductOverview } from "@/hooks/useProductDetail";

export const Topbar: React.FC = () => {
  const location = useLocation();
  const { setGlobalSearchOpen } = useUiStore();
  const { user, shell } = useWorkspaceStore();

  const businessName = shell?.business.name ?? user?.businessName ?? "";
  const userInitial = (shell?.user.initials ?? user?.fullName.charAt(0) ?? "").toUpperCase();
  const unread = shell?.badges.notifications ?? 0;

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
              className={`transition-colors max-w-[320px] truncate ${
                isVariantsPage
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
          onClick={() => useUiStore.getState().toggleNotificationsPanel()}
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[#71717A] hover:bg-neutral-100 hover:text-[#0A0A0A] transition-colors"
          title="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
          {unread > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" aria-label={`${unread} unread notifications`} />}
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

