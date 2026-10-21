import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Lock,
  Store,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import type { DirectoryItem } from "@/types/directory";
import { MAX_COMPARE, STATUS_LABEL, tagLabel } from "./directoryUtils";

interface Props {
  item: DirectoryItem;
  comparing: boolean;
  compareFull: boolean;
  canConnect: boolean;
  onToggleCompare: (id: string) => void;
  onConnect: (code: string) => void;
  onManage: (code: string) => void;
}

const CategoryIcon = ({ category }: { category: DirectoryItem["category"] }) =>
  category === "storefront" ? (
    <Layers className="h-6 w-6 text-[#1D4ED8]" aria-hidden />
  ) : category === "shipping" ? (
    <Truck className="h-6 w-6 text-purple-600" aria-hidden />
  ) : (
    <Store className="h-6 w-6 text-amber-600" aria-hidden />
  );

export function ConnectorCard({
  item,
  comparing,
  compareFull,
  canConnect,
  onToggleCompare,
  onConnect,
  onManage,
}: Props) {
  const unavailable = item.status === "unavailable";
  const hasAccounts =
    item.status === "connected" || item.status === "needs_attention";
  const compareBlocked = !comparing && compareFull;

  return (
    <article
      aria-label={item.name}
      className={cn(
        "flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md",
        unavailable && "opacity-80",
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/40">
            <CategoryIcon category={item.category} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {item.partnerGated && (
              <span className="flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                <Lock className="h-3 w-3" aria-hidden /> Gated Partner
              </span>
            )}
            {item.implementation === "planned" && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Coming soon
              </span>
            )}
            {item.implementation === "beta" && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-[#1D4ED8]">
                Beta
              </span>
            )}
          </div>
        </div>

        <h3 className="mt-4 text-base font-semibold text-foreground">
          {item.name}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
          {item.description}
        </p>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-1 font-semibold",
              item.status === "connected" && "text-emerald-600",
              item.status === "needs_attention" && "text-amber-600",
              (item.status === "available" || unavailable) &&
                "text-muted-foreground",
            )}
          >
            {item.status === "connected" && (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            )}
            {item.status === "needs_attention" && (
              <AlertTriangle className="h-4 w-4" aria-hidden />
            )}
            {STATUS_LABEL[item.status]}
          </span>
          {item.accountCount > 0 && (
            <span className="text-muted-foreground">
              {item.accountCount}{" "}
              {item.accountCount === 1 ? "account" : "accounts"}
            </span>
          )}
        </div>
        {item.statusReason && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {item.statusReason}
          </p>
        )}

        {item.capabilityTags.length > 0 && (
          <ul
            aria-label={`${item.name} capabilities`}
            className="mt-3 flex flex-wrap gap-1"
          >
            {item.capabilityTags.map((tag) => (
              <li
                key={tag}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground"
              >
                {tagLabel(tag)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => onToggleCompare(item.id)}
          disabled={compareBlocked}
          aria-pressed={comparing}
          title={
            compareBlocked
              ? `You can compare up to ${MAX_COMPARE} connectors at once`
              : undefined
          }
          className={cn(
            "text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            comparing
              ? "text-[#1D4ED8] underline"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {comparing ? "✓ Compared" : "+ Compare"}
        </button>

        {unavailable ? (
          <Button size="sm" variant="outline" disabled className="h-8 text-xs">
            Unavailable
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            {hasAccounts && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => onManage(item.id)}
              >
                Manage
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-primary text-xs text-primary-foreground hover:bg-primary/90"
              disabled={!canConnect}
              title={
                canConnect
                  ? undefined
                  : "Your role can view connectors but not connect them"
              }
              onClick={() => onConnect(item.id)}
            >
              {hasAccounts ? "Add account" : "Connect"}{" "}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
