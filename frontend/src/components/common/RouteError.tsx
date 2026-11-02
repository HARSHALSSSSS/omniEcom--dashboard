import { useEffect } from "react";
import { useRouteError } from "react-router-dom";
import { ErrorPage } from "@/pages/error/ErrorPage";

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed")
  );
}

/**
 * RouteError: renders the Commerce OS styled error page for router-level
 * exceptions (crashed loader/component) and 404 unmatched addresses.
 */
export function RouteError({ notFound: forced = false }: { notFound?: boolean }) {
  const routeError = useRouteError();

  useEffect(() => {
    if (isChunkLoadError(routeError)) {
      const key = "route_chunk_retry";
      const lastRetry = sessionStorage.getItem(key);
      const now = Date.now();
      if (!lastRetry || now - Number(lastRetry) > 10000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
      }
    }
  }, [routeError]);

  return <ErrorPage notFound={forced} error={routeError} />;
}
