import { Link } from "react-router-dom";
import { errorMessage, isApiError } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { Skeleton } from "@/components/ui/skeleton";

export function ProductNotFound() {
  return (
    <div role="alert" className="w-full flex flex-col items-start gap-3 py-16 font-['Inter',sans-serif]">
      <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">Product not found</h1>
      <p className="text-[12px] leading-[17px] text-[#666666]">This product does not exist or was removed. Check the link, or pick a product from your catalog.</p>
      <Link to={ROUTES.PRODUCTS} className="px-4 h-[36px] inline-flex items-center bg-[#000000] text-[#FFFFFF] rounded-[8px] text-[12px] font-semibold hover:bg-[#1A1A1A]">
        Back to products
      </Link>
    </div>
  );
}

export function ProductLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const forbidden = isApiError(error) && error.status === 403;
  return (
    <div role="alert" className="w-full flex flex-col items-start gap-3 py-16 font-['Inter',sans-serif]">
      <h1 className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">{forbidden ? "You cannot view this product" : "The product could not be loaded"}</h1>
      <p className="text-[12px] leading-[17px] text-[#666666]">{errorMessage(error)}</p>
      <div className="flex flex-row items-center gap-3">
        {forbidden ? null : (
          <button type="button" onClick={onRetry} className="px-4 h-[36px] bg-[#000000] text-[#FFFFFF] rounded-[8px] text-[12px] font-semibold hover:bg-[#1A1A1A]">
            Try again
          </button>
        )}
        <Link to={ROUTES.PRODUCTS} className="text-[12px] font-semibold text-[#000000] hover:underline">
          Back to products
        </Link>
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading product" className="w-full flex flex-col gap-6">
      <Skeleton className="h-4 w-56" />
      <div className="flex flex-row items-center gap-5">
        <Skeleton className="h-[100px] w-[100px] rounded-[8px]" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-80" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
