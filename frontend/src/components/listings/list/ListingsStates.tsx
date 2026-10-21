import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";

function StateBox({ title, description, children, role }: { title: string; description: string; children?: ReactNode; role?: "alert" }) {
  return (
    <div role={role} className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-[520px] text-xs text-muted-foreground">{description}</p>
      {children && <div className="flex items-center gap-2 pt-2">{children}</div>}
    </div>
  );
}

export function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <StateBox title="No listings match these filters." description="Try a different search, marketplace or status to find the listings you need.">
      <Button variant="outline" size="sm" className="text-xs" onClick={onClear}>
        Clear filters
      </Button>
    </StateBox>
  );
}

/** nothing is listed on any marketplace yet */
export function EmptyListings() {
  return (
    <StateBox
      title="No listings yet."
      description="A listing puts one of your products on a connected marketplace. Add products, then connect a marketplace and create listings here, or import the listings you already have there."
    >
      <Link to={ROUTES.PRODUCTS} className={buttonVariants({ size: "sm", className: "text-xs" })}>
        Go to products
      </Link>
      <Link to={ROUTES.MARKETPLACE_HUB} className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}>
        Open marketplace hub
      </Link>
    </StateBox>
  );
}

/** the "Not listed" tab is empty: every product is listed, or no marketplace is connected */
export function EmptyNotListed({ hasAccounts }: { hasAccounts: boolean }) {
  return hasAccounts ? (
    <StateBox title="Everything is listed." description="Every active product already has a listing on each connected marketplace account that accepts listings." />
  ) : (
    <StateBox title="No marketplace connected." description="Connect a marketplace account to list your products on it.">
      <Link to={ROUTES.MARKETPLACE_HUB} className={buttonVariants({ size: "sm", className: "text-xs" })}>
        Open marketplace hub
      </Link>
    </StateBox>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StateBox role="alert" title="Listings could not be loaded." description={message}>
      <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
        Retry
      </Button>
    </StateBox>
  );
}
