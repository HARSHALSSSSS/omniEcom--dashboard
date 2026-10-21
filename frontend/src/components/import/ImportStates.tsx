import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";

export function StateBox({ title, description, children, role }: { title: string; description: string; children?: ReactNode; role?: "alert" | "status" }) {
  return (
    <div role={role} className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-8 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-[520px] text-xs text-muted-foreground">{description}</p>
      {children && <div className="flex flex-wrap items-center justify-center gap-2 pt-2">{children}</div>}
    </div>
  );
}

export function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <StateBox role="alert" title={title} description={message}>
      <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
        Retry
      </Button>
    </StateBox>
  );
}

export function NoAccess() {
  return (
    <StateBox role="alert" title="You do not have access to product imports." description="Ask an administrator for the imports permission to view or start imports.">
      <Link to={ROUTES.PRODUCTS} className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}>
        Back to products
      </Link>
    </StateBox>
  );
}

export function ImportNotFound() {
  return (
    <StateBox title="This import was not found." description="It may belong to another business or have been removed.">
      <Link to={ROUTES.PRODUCTS_IMPORT} className={buttonVariants({ size: "sm", className: "text-xs" })}>
        Back to imports
      </Link>
    </StateBox>
  );
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-6" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function Alert({ children, tone = "danger" }: { children: ReactNode; tone?: "danger" | "warning" | "info" }) {
  const cls = tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900";
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-xs ${cls}`}>
      {children}
    </div>
  );
}
