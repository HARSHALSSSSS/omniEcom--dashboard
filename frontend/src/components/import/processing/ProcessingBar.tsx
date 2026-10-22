import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import type { ImportSession } from "@/types/import";
import { cn } from "@/utils/cn";
import { resumeUrl } from "../importParams";
import { isDone } from "./processingModel";

const PRIMARY = "h-[36px] bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black rounded-[5px] text-[12px] leading-[18px] font-medium px-5";

/** Sticky bottom reassurance bar: tells the seller they can leave, then offers the way on. */
export function ProcessingBar({ session }: { session: ImportSession }) {
  const finished = isDone(session.status);
  const failed = session.status === "failed";
  return (
    <div className="fixed bottom-0 left-0 lg:left-[224px] right-0 h-[72px] border-t border-[#E3E3E3] dark:border-border bg-white dark:bg-background px-10 z-40 flex items-center justify-between">
      <div className="flex items-center gap-2 text-[12px] leading-[18px] text-[#666666]">
        <span className={`w-2 h-2 rounded-full ${failed ? "bg-red-500" : finished ? "bg-emerald-500" : "bg-emerald-500 animate-pulse"}`} />
        <span>
          {failed
            ? "The import stopped. Nothing further is added to your catalog."
            : finished
              ? "Import complete. All records are confirmed in your catalog."
              : "Import continues in the background. You can safely leave this screen."}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {finished ? (
          <Link to={ROUTES.PRODUCTS} className={cn(buttonVariants(), PRIMARY)}>
            View imported products →
          </Link>
        ) : failed ? (
          <Link to={resumeUrl(session.id)} className={cn(buttonVariants(), PRIMARY)}>
            Back to the import
          </Link>
        ) : (
          <span className="text-[12px] leading-[18px] font-normal text-[#666666]">We'll notify you when it's complete.</span>
        )}
      </div>
    </div>
  );
}
