import React, { useState } from "react";
import { Link, useInRouterContext, isRouteErrorResponse } from "react-router-dom";
import {
  Compass,
  AlertTriangle,
  RefreshCcw,
  ArrowLeft,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Settings,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import { ROUTES } from "@/constants/routes";

export interface ErrorPageProps {
  status?: number | string;
  title?: string;
  description?: string;
  error?: unknown;
  onRetry?: () => void;
  notFound?: boolean;
}

function SafeLink({
  to,
  children,
  className,
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
}) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={to} className={className}>
      {children}
    </a>
  );
}

export function ErrorPage({
  status: forcedStatus,
  title: forcedTitle,
  description: forcedDescription,
  error: passedError,
  onRetry,
  notFound: forcedNotFound,
}: ErrorPageProps = {}) {
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Determine error and 404 status
  const activeError = passedError;
  const isRouter404 =
    isRouteErrorResponse(activeError) && activeError.status === 404;
  const is404 = Boolean(
    forcedNotFound ||
      forcedStatus === 404 ||
      forcedStatus === "404" ||
      isRouter404
  );

  const statusCode = forcedStatus ?? (isRouter404 ? 404 : is404 ? 404 : 500);

  // Title & description: preserve exact strings for test assertions & clarity
  const title =
    forcedTitle ?? (is404 ? "Page not found" : "Something went wrong");

  const description =
    forcedDescription ??
    (is404
      ? "This address does not lead anywhere in the app. It may have been moved, or the link is incomplete."
      : "This page could not be displayed. Reloading usually fixes it; your data is safe.");

  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  // Diagnostic error string
  const errorMessageText =
    activeError instanceof Error
      ? activeError.message
      : isRouteErrorResponse(activeError)
        ? `${activeError.status} ${activeError.statusText || ""}`.trim()
        : typeof activeError === "string"
          ? activeError
          : null;

  // a stack trace is a developer aid: it never reaches the screen of a production build
  const stackTrace =
    import.meta.env.DEV && activeError instanceof Error ? activeError.stack : null;

  const handleCopyDiagnostics = () => {
    const diagnosticPayload = {
      status: statusCode,
      title,
      path: currentPath,
      timestamp: new Date().toISOString(),
      error: errorMessageText,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    };

    void navigator.clipboard.writeText(
      JSON.stringify(diagnosticPayload, null, 2)
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReload = () => {
    if (onRetry) {
      onRetry();
    } else if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const handleGoBack = () => {
    // the browser history is the router history, so this is the same as navigate(-1) and also works outside a router
    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = ROUTES.DASHBOARD;
      }
    }
  };

  const quickLinks = [
    {
      title: "Dashboard",
      description: "Live overview & sales activity",
      href: ROUTES.DASHBOARD,
      icon: LayoutDashboard,
    },
    {
      title: "Products",
      description: "Manage catalog, SKUs & channels",
      href: ROUTES.PRODUCTS,
      icon: Package,
    },
    {
      title: "Orders",
      description: "Fulfillment & order tracking",
      href: ROUTES.ORDERS,
      icon: ShoppingCart,
    },
    {
      title: "Settings",
      description: "Store settings & preferences",
      href: ROUTES.SETTINGS,
      icon: Settings,
    },
  ];

  return (
    <div
      role="alert"
      className="flex min-h-screen w-full flex-col bg-[#FAFAFA] text-[#0A0A0A] font-['Inter',sans-serif] selection:bg-neutral-900 selection:text-white"
    >
      {/* Top minimal navigation bar */}
      <header className="flex h-16 w-full items-center justify-between border-b border-[#EAEAEA] bg-white px-6 sm:px-10 shrink-0">
        <SafeLink
          to={ROUTES.DASHBOARD}
          className="flex items-center gap-2.5 no-underline group"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#0A0A0A] text-white font-bold text-xs tracking-tight shadow-sm">
            OS
          </div>
          <div className="flex flex-col">
            <span className="text-[14px] font-semibold tracking-tight text-[#0A0A0A] group-hover:text-neutral-700 transition-colors">
              [Product Name]
            </span>
            <span className="text-[10px] text-[#666666] tracking-wide uppercase">
              Commerce Operating System
            </span>
          </div>
        </SafeLink>

        <SafeLink
          to={ROUTES.DASHBOARD}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#666666] hover:text-[#0A0A0A] transition-colors no-underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to workspace
        </SafeLink>
      </header>

      {/* Main card container */}
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-xl">
          <div className="rounded-[16px] border border-[#EAEAEA] bg-white p-7 sm:p-10 shadow-sm">
            {/* Status badge & Icon header */}
            <div className="flex items-center justify-between pb-6 border-b border-[#EAEAEA]">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-[12px] border ${
                    is404
                      ? "border-amber-200 bg-amber-50/60 text-amber-600"
                      : "border-red-200 bg-red-50/60 text-red-600"
                  }`}
                >
                  {is404 ? (
                    <Compass className="h-6 w-6" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        is404 ? "bg-amber-500" : "bg-red-500 animate-pulse"
                      }`}
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#666666]">
                      {is404 ? `Error ${statusCode}` : `System Error ${statusCode}`}
                    </span>
                  </div>
                  <div className="text-[12px] text-[#666666] mt-0.5">
                    {is404 ? "Location not found" : "Runtime display interruption"}
                  </div>
                </div>
              </div>

              <span className="font-mono text-[11px] text-[#888888] bg-[#F5F5F5] border border-[#EAEAEA] px-2.5 py-1 rounded-[6px]">
                {statusCode}
              </span>
            </div>

            {/* Title & Body */}
            <div className="pt-6">
              <h1 className="text-xl font-bold tracking-tight text-[#0A0A0A] sm:text-2xl">
                {title}
              </h1>
              <p className="mt-2 text-[14px] leading-relaxed text-[#666666]">
                {description}
              </p>
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <SafeLink
                to={ROUTES.DASHBOARD}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#0A0A0A] px-5 text-[13px] font-semibold text-white no-underline hover:bg-neutral-800 transition-colors shadow-sm"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                Go to the dashboard
              </SafeLink>

              {!is404 ? (
                <button
                  type="button"
                  onClick={handleReload}
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-[#EAEAEA] bg-white px-4 text-[13px] font-medium text-[#0A0A0A] hover:bg-[#F5F5F5] transition-colors"
                >
                  <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reload
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-[#EAEAEA] bg-white px-4 text-[13px] font-medium text-[#0A0A0A] hover:bg-[#F5F5F5] transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Go back
                </button>
              )}
            </div>

            {/* Popular Destinations / Quick Links */}
            <div className="mt-8 pt-6 border-t border-[#EAEAEA]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#888888]">
                Quick navigation
              </span>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {quickLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <SafeLink
                      key={link.href}
                      to={link.href}
                      className="group flex items-center gap-3 rounded-[10px] border border-[#EAEAEA] p-3 text-left no-underline transition-all hover:border-[#0A0A0A] hover:bg-[#FAFAFA]"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-[#F5F5F5] text-[#0A0A0A] group-hover:bg-[#0A0A0A] group-hover:text-white transition-colors">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-[#0A0A0A] truncate">
                          {link.title}
                        </div>
                        <div className="text-[11px] text-[#666666] truncate">
                          {link.description}
                        </div>
                      </div>
                    </SafeLink>
                  );
                })}
              </div>
            </div>

            {/* Technical diagnostic details (collapsible) */}
            <div className="mt-6 pt-5 border-t border-[#EAEAEA]">
              <button
                type="button"
                onClick={() => setDetailsOpen(!detailsOpen)}
                className="flex w-full items-center justify-between text-left text-[12px] font-medium text-[#666666] hover:text-[#0A0A0A] transition-colors cursor-pointer"
              >
                <span>Diagnostic details</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
                    detailsOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {detailsOpen && (
                <div className="mt-3 rounded-[8px] bg-[#F9F9F9] border border-[#EAEAEA] p-3.5 font-mono text-[11px] text-[#444444]">
                  <div className="flex items-center justify-between pb-2 border-b border-[#EAEAEA] mb-2">
                    <span className="font-sans font-medium text-[11px] text-[#666666]">
                      Technical metadata
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyDiagnostics}
                      className="inline-flex items-center gap-1.5 text-[11px] text-[#0A0A0A] hover:underline cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span className="text-emerald-600 font-sans">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span className="font-sans">Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div>
                      <span className="text-[#888888]">Path:</span> {currentPath || "/"}
                    </div>
                    <div>
                      <span className="text-[#888888]">Status:</span> {statusCode}
                    </div>
                    {errorMessageText && (
                      <div className="break-words">
                        <span className="text-[#888888]">Message:</span> {errorMessageText}
                      </div>
                    )}
                    {stackTrace && (
                      <div className="mt-2 max-h-36 overflow-y-auto whitespace-pre rounded bg-white p-2 border border-[#EAEAEA] text-[10px] text-[#666666]">
                        {stackTrace}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Simple footer message */}
          <div className="mt-6 text-center text-[12px] text-[#888888]">
            Commerce Operating System · Need assistance? Contact workspace support
          </div>
        </div>
      </main>
    </div>
  );
}

export default ErrorPage;
