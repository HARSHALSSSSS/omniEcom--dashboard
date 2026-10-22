import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { toAppPath } from "@/lib/links";
import type { EditReadiness } from "@/types/productEdit";

/** Product readiness: the same percent as the product's Content tab, grouped into the four checks of the design */
export function ReadinessPanel({ readiness }: { readiness: EditReadiness }) {
  const open = readiness.items.filter((i) => i.state !== "done" && (i.detail || i.action));
  return (
    <section aria-labelledby="product-readiness" className="flex flex-col gap-2.5 w-full">
      <span id="product-readiness" className="text-[12px] font-semibold text-[#000000] leading-[145%]">
        Product readiness
      </span>
      <div className="text-[18px] font-semibold text-[#000000] leading-[145%]">{readiness.percent}% complete</div>

      <div className="w-full h-[3px] bg-[#EAEAEA] rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readiness.percent} aria-label="Product readiness">
        <div className="h-full bg-[#000000]" style={{ width: `${readiness.percent}%` }} />
      </div>

      <ul className="flex flex-col gap-2.5 w-full pt-1">
        {readiness.items.map((item) => (
          <li key={item.key} className="flex flex-row items-center gap-2.5 text-[12px] leading-[145%]">
            {item.state === "done" ? (
              <Check className="w-3.5 h-3.5 text-[#000000] stroke-[2.5] shrink-0" aria-label="Done" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border border-[#666666] shrink-0" role="img" aria-label="Open" />
            )}
            <span className="text-[#000000]">{item.label}</span>
          </li>
        ))}
      </ul>

      {open.map((item) => (
        <div key={item.key} className="flex flex-col gap-1.5">
          {item.detail && <p className="text-[11px] font-normal text-[#666666] leading-[145%]">{item.detail}</p>}
          {item.action && (
            <Link to={toAppPath(item.action.href)} className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer text-left">
              {item.action.label} &rarr;
            </Link>
          )}
        </div>
      ))}
    </section>
  );
}
