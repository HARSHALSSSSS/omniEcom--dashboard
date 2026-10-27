import { useRouteError } from "react-router-dom";
import { ErrorPage } from "@/pages/error/ErrorPage";

/**
 * RouteError: renders the Commerce OS styled error page for router-level
 * exceptions (crashed loader/component) and 404 unmatched addresses.
 */
export function RouteError({ notFound: forced = false }: { notFound?: boolean }) {
  const routeError = useRouteError();
  return <ErrorPage notFound={forced} error={routeError} />;
}
