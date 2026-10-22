import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/routes";

interface ListingsErrorStateProps {
  onRetry?: () => void;
  isRetrying?: boolean;
  /** what the server said, shown under the explanation */
  message?: string;
}

export function ListingsErrorState({ onRetry, isRetrying = false, message }: ListingsErrorStateProps) {
  const navigate = useNavigate();

  return (
    <div className="w-full flex flex-col items-start gap-4 font-['Inter',sans-serif] text-[#000000] pb-24">
      {/* =========================================================================
          1. PAGE HEADER (Matches Figma: COMMERCE eyebrow + Listings title only)
         ========================================================================= */}
      <header className="w-full flex flex-row justify-between items-center py-1">
        <div className="flex flex-col items-start gap-1">
          <span className="text-[10px] font-medium leading-[12px] tracking-wider text-[#707070] uppercase">
            COMMERCE
          </span>
          <h1 className="text-[26px] font-semibold leading-[31px] text-[#000000] tracking-tight">
            Listings
          </h1>
        </div>
      </header>

      {/* =========================================================================
          2. ERROR CONTAINER CARD (Exact Figma design: Listings couldn't be loaded)
         ========================================================================= */}
      <div role="alert" className="w-full border border-[#EAEAEA] rounded-xl bg-white flex flex-col items-center justify-center py-36 px-6 text-center shadow-none">
        <h2 className="text-[20px] font-semibold text-[#000000] tracking-tight leading-snug">
          Listings couldn't be loaded
        </h2>
        <p className="text-[13px] font-normal text-[#666666] mt-2 max-w-[500px] leading-normal">
          Your master catalog is safe. Try again to retrieve the latest marketplace listing state.
        </p>

        {message && <p className="text-[12px] font-normal text-[#666666] mt-2 max-w-[500px]">{message}</p>}

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={() => onRetry ? onRetry() : window.location.reload()}
            disabled={isRetrying}
            className="h-9 px-5 bg-[#000000] text-white text-[12px] font-semibold rounded-lg hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer shadow-none flex items-center justify-center gap-1.5"
          >
            {isRetrying ? "Retrying…" : "Try again"}
          </button>

          <button
            type="button"
            onClick={() => navigate(ROUTES.PRODUCTS)}
            className="h-9 px-5 bg-white border border-[#BDBDBD] text-[#000000] text-[12px] font-medium rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shadow-none"
          >
            Back to products
          </button>
        </div>
      </div>
    </div>
  );
}

export default ListingsErrorState;
