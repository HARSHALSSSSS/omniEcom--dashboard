import { Check, Minus } from "lucide-react";

const GROUP_LABEL: Record<string, string> = {
  account: "Seller account",
  catalog: "Catalogue",
  listings: "Listings",
  inventory: "Inventory",
  pricing: "Pricing",
  orders: "Orders",
  returns: "Returns",
  shipping: "Shipping",
};

const ORDER = Object.keys(GROUP_LABEL);

/** `requiresCategoryMapping` -> `Requires category mapping` */
const humanize = (key: string): string => {
  const words = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The connector's nested capability flags: what this marketplace can and cannot do. Auth and limits are shown elsewhere. */
export function CapabilityMatrix({ matrix }: { matrix: Record<string, Record<string, unknown>> }) {
  const groups = ORDER.filter((g) => matrix[g]);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {groups.map((g) => (
        <section key={g} aria-label={`${GROUP_LABEL[g]} capabilities`} className="rounded-lg border border-border p-3">
          <h4 className="text-xs font-semibold text-foreground">{GROUP_LABEL[g]}</h4>
          <ul className="mt-2 space-y-1">
            {Object.entries(matrix[g] ?? {}).map(([k, v]) => {
              if (typeof v === "boolean") {
                return (
                  <li key={k} className={`flex items-center gap-1.5 text-[11px] ${v ? "text-foreground" : "text-muted-foreground"}`}>
                    {v ? <Check className="h-3 w-3 text-green-600" aria-label="Supported" /> : <Minus className="h-3 w-3" aria-label="Not supported" />}
                    {humanize(k)}
                  </li>
                );
              }
              return (
                <li key={k} className="text-[11px] text-muted-foreground">
                  {humanize(k)}: <span className="font-mono text-foreground">{String(v)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
