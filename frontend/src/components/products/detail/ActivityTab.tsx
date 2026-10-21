import { AlertCircle, FilePenLine, PackagePlus, RefreshCw, Boxes } from "lucide-react";
import { useProductActivity } from "@/hooks/useProductDetail";
import type { ActivityItem, ActivityScope, ActivityType, ProductOverview } from "@/types/productDetail";
import { Empty, LINK_BTN, SectionHead, TabError, TabLayout, TabSkeleton } from "./shared";
import { relative } from "./format";

const TYPE_LABEL: Record<ActivityType, string> = { inventory: "Inventory", content: "Content", listings: "Listings", variants: "Variants" };
const ICON = { inventory: Boxes, content: FilePenLine, listings: RefreshCw, variants: PackagePlus } as const;

const SCOPES: Array<{ key: ActivityScope; label: string }> = [
  { key: "all", label: "All activity" },
  { key: "master", label: "Master product" },
  { key: "variants", label: "Variants" },
  { key: "channels", label: "Channels" },
];

/** time · what happened · type. `compact` is the short list of the Overview tab. */
export function ActivityRows({ items, compact = false }: { items: ActivityItem[]; compact?: boolean }) {
  if (items.length === 0) return <Empty title="No activity yet" text="Changes to this product, its variants, stock and listings will show up here." />;
  return (
    <ul className="w-full border-t border-[#EAEAEA] divide-y divide-[#EAEAEA]">
      {items.map((a, i) => {
        const Icon = ICON[a.type] ?? AlertCircle;
        return (
          <li key={`${a.at}-${a.event}-${i}`} className={`w-full flex flex-row items-center gap-4 text-[12px] leading-[17px] ${compact ? "py-3" : "py-[22px]"}`}>
            {compact ? null : <Icon className="h-[18px] w-[18px] text-[#666666] shrink-0" aria-hidden="true" />}
            <time dateTime={a.at} title={new Date(a.at).toLocaleString()} className="w-[110px] text-[#666666] shrink-0">
              {relative(a.at)}
            </time>
            <span className="flex-1 text-[#000000] break-words">
              {a.text}
              {!compact && a.actor?.name ? <span className="text-[#666666]"> · {a.actor.name}</span> : null}
            </span>
            {compact ? null : <span className="w-[90px] text-[#666666] text-right shrink-0">{TYPE_LABEL[a.type]}</span>}
          </li>
        );
      })}
    </ul>
  );
}

interface Props {
  id: string;
  overview: ProductOverview;
  scope: ActivityScope;
  page: number;
  onScope: (scope: ActivityScope) => void;
  onPage: (page: number) => void;
}

export function ActivityTab({ id, overview, scope, page, onScope, onPage }: Props) {
  const q = useProductActivity(id, scope, page, true);

  if (q.isPending) return <TabSkeleton label="activity" />;
  const data = q.data;
  if (!data) return <TabError label="activity" error={q.error} onRetry={() => void q.refetch()} />;
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = from + data.items.length - 1;

  return (
    <TabLayout
      aside={
        <div className="w-full flex flex-col items-start gap-4">
          <SectionHead level={3} title="Activity scope" />
          <div className="flex flex-col items-start gap-1">
            <span className="text-[12px] font-semibold leading-[17px] text-[#000000]">{overview.product.title}</span>
            <span className="text-[12px] font-normal leading-[17px] text-[#666666]">Master SKU · {overview.product.productCode}</span>
          </div>
          <div className="w-full h-[1px] bg-[#EAEAEA]" />
          <p className="text-[12px] font-normal leading-[17px] text-[#666666]">Changes to master content, linked variants, inventory and channel listings appear in this product's activity.</p>
        </div>
      }
    >
      <div className="w-full flex flex-col items-start gap-4">
        <SectionHead title="Product activity" sub="Recent changes for this master product and its connected representations." />

        <div role="group" aria-label="Activity scope" className="w-full flex flex-row flex-wrap items-center gap-6 text-[12px] leading-[17px] pt-1">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={scope === s.key}
              onClick={() => onScope(s.key)}
              className={`cursor-pointer ${scope === s.key ? "font-semibold text-[#000000]" : "font-normal text-[#666666] hover:text-[#000000]"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className={`w-full ${q.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={q.isPlaceholderData}>
          <ActivityRows items={data.items} />
        </div>
      </div>

      {data.total > 0 ? (
        <div className="w-full flex flex-row items-center justify-between text-[12px] leading-[17px] text-[#666666]">
          <span>
            Showing {from}-{to} of {data.total} {data.total === 1 ? "event" : "events"}.
          </span>
          {data.pages > 1 ? (
            <span className="flex flex-row items-center gap-4">
              <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={LINK_BTN}>
                Previous
              </button>
              <span aria-live="polite">
                Page {data.page} of {data.pages}
              </span>
              <button type="button" disabled={page >= data.pages} onClick={() => onPage(page + 1)} className={LINK_BTN}>
                Next
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
    </TabLayout>
  );
}
