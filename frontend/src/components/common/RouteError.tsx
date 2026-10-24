import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";
import { AlertTriangle, Compass } from "lucide-react";
import { ROUTES } from "@/constants/routes";

/**
 * What the router shows instead of its developer error page: a readable "page not found" for an address that does
 * not exist, and a calm retry screen when a page crashes while rendering.
 */
export function RouteError({ notFound: forced = false }: { notFound?: boolean }) {
  const error = useRouteError();
  const notFound = forced || (isRouteErrorResponse(error) && error.status === 404);
  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white p-8 text-center">
      {notFound ? <Compass className="h-10 w-10 text-neutral-400" aria-hidden /> : <AlertTriangle className="h-10 w-10 text-red-500" aria-hidden />}
      <h1 className="m-0 text-lg font-semibold text-neutral-900">{notFound ? "Page not found" : "Something went wrong"}</h1>
      <p className="m-0 max-w-md text-sm text-neutral-600">
        {notFound ? "This address does not lead anywhere in the app. It may have been moved, or the link is incomplete." : "This page could not be displayed. Reloading usually fixes it; your data is safe."}
      </p>
      <div className="mt-2 flex gap-2">
        <Link to={ROUTES.DASHBOARD} className="inline-flex h-9 items-center rounded-md bg-black px-4 text-sm font-medium text-white no-underline hover:bg-neutral-800">
          Go to the dashboard
        </Link>
        {!notFound && (
          <button type="button" onClick={() => window.location.reload()} className="inline-flex h-9 cursor-pointer items-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-50">
            Reload
          </button>
        )}
      </div>
    </div>
  );
}
