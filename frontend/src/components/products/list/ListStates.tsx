import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const GRID = "w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4";

export function CardSkeletons({ count }: { count: number }) {
  return (
    <div className={GRID} role="status" aria-label="Loading products">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="box-border flex flex-col justify-between p-4 h-[262px] bg-[#FFFFFF] border border-[#EAEAEA] rounded-[12px]">
          <div className="flex flex-col gap-6">
            <div className="flex justify-between gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-[26px] w-[72px]" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-[88px] w-[88px] rounded-[8px]" />
              <div className="flex flex-col gap-2 flex-1">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          </div>
          <Skeleton className="h-8 w-full rounded-[8px]" />
        </div>
      ))}
    </div>
  );
}

interface StateBoxProps {
  title: string;
  description: string;
  children?: ReactNode;
  role?: "alert";
}

function StateBox({ title, description, children, role }: StateBoxProps) {
  return (
    <div role={role} className="w-full box-border flex flex-col justify-center items-center min-h-[400px] border border-[#EAEAEA] rounded-[12px] bg-[#FFFFFF] gap-3.5 my-2 px-6">
      <div className="flex flex-row justify-center items-center w-[36px] h-[36px] bg-[#F5F5F5] rounded-full" aria-hidden>
        <div className="h-3.5 w-3.5 rounded-full border-[1.5px] border-[#666666]" />
      </div>
      <h2 className="max-w-[560px] text-[18px] font-semibold leading-[26px] text-center text-[#000000]">{title}</h2>
      <p className="max-w-[560px] text-[13px] font-normal leading-[19px] text-center text-[#666666]">{description}</p>
      {children && <div className="flex flex-row items-center gap-2 pt-2">{children}</div>}
    </div>
  );
}

export const PRIMARY_BUTTON =
  "flex flex-row justify-center items-center px-4 h-[36px] bg-[#000000] rounded-[8px] text-[12px] font-semibold text-[#FFFFFF] hover:bg-[#1A1A1A] transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const OUTLINE_BUTTON =
  "box-border flex flex-row justify-center items-center px-4 h-[36px] bg-[#FFFFFF] border border-[#666666] text-[#000000] rounded-[8px] text-[12px] font-semibold hover:bg-[#F5F5F5] transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <StateBox title="No products match these filters." description="Try a different filter combination to find the products you need.">
      <button type="button" onClick={onClear} className={OUTLINE_BUTTON}>
        Clear filters
      </button>
    </StateBox>
  );
}

export function EmptyTab({ label }: { label: string }) {
  return <StateBox title={`No ${label.toLowerCase()} products.`} description="Products that belong here will show up automatically." />;
}

interface EmptyCatalogProps {
  canCreate: boolean;
  reason: string;
  onCreate: () => void;
  onImport: () => void;
}

export function EmptyCatalog({ canCreate, reason, onCreate, onImport }: EmptyCatalogProps) {
  return (
    <StateBox title="No products yet." description="Create your first product or import your catalog from a file or a connected marketplace.">
      <button type="button" onClick={onCreate} disabled={!canCreate} title={canCreate ? undefined : reason} className={PRIMARY_BUTTON}>
        + Create product
      </button>
      <button type="button" onClick={onImport} disabled={!canCreate} title={canCreate ? undefined : reason} className={OUTLINE_BUTTON}>
        Import products
      </button>
    </StateBox>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StateBox role="alert" title="Products could not be loaded." description={message}>
      <button type="button" onClick={onRetry} className={OUTLINE_BUTTON}>
        Retry
      </button>
    </StateBox>
  );
}
