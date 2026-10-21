import { Link } from "react-router-dom";
import { Check, Circle } from "lucide-react";
import { toAppPath } from "@/lib/links";
import type { EditReadiness } from "@/types/productEdit";

/** Product readiness: the same percent as the product's Content tab, grouped into the four checks of the design */
export function ReadinessPanel({ readiness }: { readiness: EditReadiness }) {
  return (
    <section aria-labelledby="product-readiness" className="space-y-3 rounded-xl border border-border bg-card p-5 text-xs shadow-xs">
      <div className="flex items-baseline justify-between">
        <h2 id="product-readiness" className="text-sm font-bold text-foreground">
          Product readiness
        </h2>
        <span className="font-semibold text-foreground">{readiness.percent}% complete</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readiness.percent} aria-label="Product readiness">
        <div className="h-full rounded-full bg-primary" style={{ width: `${readiness.percent}%` }} />
      </div>
      <ul className="space-y-2">
        {readiness.items.map((item) => (
          <li key={item.key} className="flex items-start gap-2">
            {item.state === "done" ? (
              <Check className="mt-0.5 h-3.5 w-3.5 text-emerald-600" aria-label="Done" />
            ) : (
              <Circle className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" aria-label="Open" />
            )}
            <div className="flex-1">
              <p className="font-medium text-foreground">{item.label}</p>
              {item.detail && <p className="text-muted-foreground">{item.detail}</p>}
            </div>
            {item.action && (
              <Link to={toAppPath(item.action.href)} className="font-medium text-primary hover:underline">
                {item.action.label} &rarr;
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
