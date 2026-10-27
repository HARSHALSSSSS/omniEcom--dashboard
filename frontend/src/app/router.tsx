import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ROUTES } from "@/constants/routes";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PublicOnlyRoute } from "@/components/auth/PublicOnlyRoute";
import { useWorkspaceStore } from "@/store/workspace.store";
import { RouteError } from "@/components/common/RouteError";

// Layouts
const AppShell = lazy(() => import("@/components/layout/AppShell"));
// Auth
const SignUpPage = lazy(() => import("@/pages/auth/SignUpPage"));
const SignInPage = lazy(() => import("@/pages/auth/SignInPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage"));
const VerifyEmailPage = lazy(() => import("@/pages/auth/VerifyEmailPage"));
// Onboarding
const OnboardingPage = lazy(() => import("@/pages/onboarding/OnboardingPage"));
import DashboardPage from "@/pages/dashboard/DashboardPage";
const RecommendationsPage = lazy(
  () => import("@/pages/recommendations/RecommendationsPage"),
);
const NeedsAttentionPage = lazy(
  () => import("@/pages/needs-attention/NeedsAttentionPage"),
);
const ProductsPage = lazy(() => import("@/pages/products/ProductsPage"));
const ProductDetailPage = lazy(
  () => import("@/pages/products/ProductDetailPage"),
);
const CreateProductPage = lazy(
  () => import("@/pages/products/CreateProductPage"),
);
const EditProductPage = lazy(() => import("@/pages/products/EditProductPage"));
const VariantsPage = lazy(() => import("@/pages/products/VariantsPage"));
const ImportWizardPage = lazy(() => import("@/pages/import/ImportWizardPage"));
const ImportIssuesPage = lazy(() => import("@/pages/import/ImportIssuesPage"));
const ImportProcessingPage = lazy(
  () => import("@/pages/import/ImportProcessingPage"),
);
const InventoryPage = lazy(() => import("@/pages/inventory/InventoryPage"));
const OrdersPage = lazy(() => import("@/pages/orders/OrdersPage"));
const FulfillmentPage = lazy(
  () => import("@/pages/fulfillment/FulfillmentPage"),
);
const ShippingPage = lazy(() => import("@/pages/shipping/ShippingPage"));
const ReturnsPage = lazy(() => import("@/pages/returns/ReturnsPage"));
// Commerce
const ListingsPage = lazy(() => import("@/pages/listings/ListingsPage"));
const BulkSelectedListingsPage = lazy(() => import("@/pages/listings/BulkSelectedListingsPage"));
const PublishingPreparationPage = lazy(() => import("@/pages/listings/PublishingPreparationPage"));
const ListingReadinessPage = lazy(() => import("@/pages/listings/ListingReadinessPage"));
const ListingBlockerPage = lazy(() => import("@/pages/listings/ListingBlockerPage"));
const ListingSyncPage = lazy(() => import("@/pages/listings/ListingSyncPage"));
const ListingUnlistedPage = lazy(() => import("@/pages/listings/ListingUnlistedPage"));
const ListingStudioPage = lazy(
  () => import("@/pages/listings/ListingStudioPage"),
);
const MarketplaceHubPage = lazy(
  () => import("@/pages/marketplace-hub/MarketplaceHubPage"),
);
const ConnectorMarketplacePage = lazy(
  () => import("@/pages/marketplace-hub/ConnectorMarketplacePage"),
);
const ConnectorDetailPage = lazy(
  () => import("@/pages/marketplace-hub/ConnectorDetailPage"),
);
const ConnectionSetupPage = lazy(
  () => import("@/pages/marketplace-hub/ConnectionSetupPage"),
);
const OAuthCallbackPage = lazy(
  () => import("@/pages/marketplace-hub/OAuthCallbackPage"),
);
const ConnectionHealthPage = lazy(
  () => import("@/pages/marketplace-hub/ConnectionHealthPage"),
);
const PricingPage = lazy(() => import("@/pages/pricing/PricingPage"));
const PromotionsPage = lazy(() => import("@/pages/promotions/PromotionsPage"));
const ProcurementPage = lazy(
  () => import("@/pages/procurement/ProcurementPage"),
);
// Intelligence
const ReportsPage = lazy(() => import("@/pages/reports/ReportsPage"));
const ProfitabilityPage = lazy(
  () => import("@/pages/profitability/ProfitabilityPage"),
);
const ProductIntelligencePage = lazy(
  () => import("@/pages/product-intelligence/ProductIntelligencePage"),
);
const AiAssistantPage = lazy(
  () => import("@/pages/ai-assistant/AiAssistantPage"),
);
const AutomationPage = lazy(() => import("@/pages/automation/AutomationPage"));
// Settings
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
// Error & Fallback pages
const NotFoundPage = lazy(() => import("@/pages/error/NotFoundPage"));

function OnboardingIndex() {
  const step = useWorkspaceStore((s) => s.onboardingResumeStep);
  return <Navigate to={`${ROUTES.ONBOARDING}/${step}`} replace />;
}

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

function withSuspense(Component: React.ComponentType) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

// the pathless root only carries the friendly error screen (unknown address / a page that crashes) for every route below
export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
  // Auth routes (no shell)
  {
    path: ROUTES.SIGN_UP,
    element: (
      <PublicOnlyRoute>
        {withSuspense(SignUpPage)}
      </PublicOnlyRoute>
    ),
  },
  {
    path: ROUTES.SIGN_IN,
    element: (
      <PublicOnlyRoute>
        {withSuspense(SignInPage)}
      </PublicOnlyRoute>
    ),
  },
  {
    path: ROUTES.FORGOT_PASSWORD,
    element: (
      <PublicOnlyRoute>
        {withSuspense(ForgotPasswordPage)}
      </PublicOnlyRoute>
    ),
  },
  { path: ROUTES.RESET_PASSWORD, element: withSuspense(ResetPasswordPage) },
  { path: ROUTES.VERIFY_EMAIL, element: withSuspense(VerifyEmailPage) },
  // Onboarding (wizard layout, no app shell)
  {
    path: ROUTES.ONBOARDING,
    element: (
      <ProtectedRoute requireOnboarding={false}>
        <OnboardingIndex />
      </ProtectedRoute>
    ),
  },
  {
    path: `${ROUTES.ONBOARDING}/:step`,
    element: (
      <ProtectedRoute requireOnboarding={false}>
        {withSuspense(OnboardingPage)}
      </ProtectedRoute>
    ),
  },
  // App shell routes
  {
    element: (
      <ProtectedRoute requireOnboarding={true}>
        <Suspense fallback={<PageLoader />}>
          <AppShell />
        </Suspense>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "dashboard", element: <DashboardPage /> },
      {
        path: ROUTES.RECOMMENDATIONS,
        element: withSuspense(RecommendationsPage),
      },
      {
        path: ROUTES.NEEDS_ATTENTION,
        element: withSuspense(NeedsAttentionPage),
      },
      // Products
      { path: ROUTES.PRODUCTS, element: withSuspense(ProductsPage) },
      { path: ROUTES.PRODUCTS_NEW, element: withSuspense(CreateProductPage) },
      { path: ROUTES.PRODUCTS_IMPORT, element: withSuspense(ImportWizardPage) },
      {
        path: `${ROUTES.PRODUCTS_IMPORT}/:importId/issues`,
        element: withSuspense(ImportIssuesPage),
      },
      {
        path: ROUTES.PRODUCTS_IMPORT_PROCESSING,
        element: withSuspense(ImportProcessingPage),
      },
      {
        path: `${ROUTES.PRODUCTS}/:id`,
        element: withSuspense(ProductDetailPage),
      },
      {
        path: `${ROUTES.PRODUCTS}/:id/edit`,
        element: withSuspense(EditProductPage),
      },
      {
        path: `${ROUTES.PRODUCTS}/:id/variants`,
        element: withSuspense(VariantsPage),
      },
      // Inventory
      { path: ROUTES.INVENTORY, element: withSuspense(InventoryPage) },
      // Orders
      { path: ROUTES.ORDERS, element: withSuspense(OrdersPage) },
      // Shipping
      // Fulfillment
      { path: ROUTES.FULFILLMENT, element: withSuspense(FulfillmentPage) },
      { path: ROUTES.SHIPPING, element: withSuspense(ShippingPage) },
      // Returns
      { path: ROUTES.RETURNS, element: withSuspense(ReturnsPage) },
      // Listings
      { path: ROUTES.LISTINGS, element: withSuspense(ListingsPage) },
      { path: ROUTES.LISTINGS_BULK, element: withSuspense(BulkSelectedListingsPage) },
      { path: ROUTES.LISTINGS_PUBLISH, element: withSuspense(PublishingPreparationPage) },
      { path: ROUTES.LISTINGS_READINESS, element: withSuspense(ListingReadinessPage) },
      { path: ROUTES.LISTING_BLOCKED, element: withSuspense(ListingBlockerPage) },
      { path: ROUTES.LISTING_SYNC, element: withSuspense(ListingSyncPage) },
      { path: ROUTES.LISTING_UNLISTED, element: withSuspense(ListingUnlistedPage) },
      {
        path: `${ROUTES.LISTINGS}/:id`,
        element: withSuspense(ListingStudioPage),
      },
      // Marketplace Hub
      {
        path: ROUTES.MARKETPLACE_HUB,
        element: withSuspense(MarketplaceHubPage),
      },
      {
        path: ROUTES.MARKETPLACE_HUB_CONNECTORS,
        element: withSuspense(ConnectorMarketplacePage),
      },
      {
        path: `${ROUTES.MARKETPLACE_HUB_CONNECTORS}/:id`,
        element: withSuspense(ConnectorDetailPage),
      },
      {
        path: `${ROUTES.MARKETPLACE_HUB}/connect/:id`,
        element: withSuspense(ConnectionSetupPage),
      },
      {
        path: ROUTES.MARKETPLACE_HUB_OAUTH_CALLBACK,
        element: withSuspense(OAuthCallbackPage),
      },
      {
        path: ROUTES.MARKETPLACE_HUB_HEALTH,
        element: withSuspense(ConnectionHealthPage),
      },
      // Commerce intelligence
      { path: ROUTES.PRICING, element: withSuspense(PricingPage) },
      { path: ROUTES.PROMOTIONS, element: withSuspense(PromotionsPage) },
      { path: ROUTES.PROCUREMENT, element: withSuspense(ProcurementPage) },
      // Intelligence
      { path: ROUTES.REPORTS, element: withSuspense(ReportsPage) },
      { path: ROUTES.PROFITABILITY, element: withSuspense(ProfitabilityPage) },
      {
        path: ROUTES.PRODUCT_INTELLIGENCE,
        element: withSuspense(ProductIntelligencePage),
      },
      { path: ROUTES.AI_ASSISTANT, element: withSuspense(AiAssistantPage) },
      { path: ROUTES.AUTOMATION, element: withSuspense(AutomationPage) },
      // Settings
      {
        path: `${ROUTES.SETTINGS}/:module`,
        element: withSuspense(SettingsPage),
      },
      { path: ROUTES.SETTINGS, element: withSuspense(SettingsPage) },
    ],
  },
  // explicit not-found address (the catch-all below covers every other unknown URL)
  { path: ROUTES.NOT_FOUND, element: withSuspense(NotFoundPage) },
  { path: "*", element: <RouteError notFound /> },
    ],
  },
]);
