import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import type { EditorView } from "@/types/productEdit";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const IN_EDITOR_KEYS = new Set(["overview", "media", "details"]);

function hrefFor(key: string, id: string): string {
  switch (key) {
    case "overview":
      return `${ROUTES.PRODUCTS}/${id}/edit`;
    case "media":
      return `${ROUTES.PRODUCTS}/${id}/edit?tab=media`;
    case "details":
      return `${ROUTES.PRODUCTS}/${id}/edit?tab=details`;
    case "variants":
      return `${ROUTES.PRODUCTS}/${id}/variants`;
    case "listings":
      return `${ROUTES.LISTINGS}?productId=${id}`;
    default:
      return `${ROUTES.PRODUCTS}/${id}?tab=${key}`;
  }
}

interface EditSidebarProps {
  editor: EditorView;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

/** left column: section nav with counts and the product meta (master code, created, last updated) */
export function EditSidebar({ editor, activeTab = "overview", onTabChange }: EditSidebarProps) {
  const id = editor.product.id;
  const inEditorItems = editor.nav.filter((n) => IN_EDITOR_KEYS.has(n.key));
  const workspaceItems = editor.nav.filter((n) => !IN_EDITOR_KEYS.has(n.key));

  const renderItem = (n: { key: string; label: string; count?: number }, isExternal = false) => {
    const current = n.key === activeTab;
    const cls = cn(
      "flex items-center justify-between gap-1 h-8 px-2.5 rounded-[4px] text-left transition-colors text-[12px] leading-[145%]",
      current ? "bg-[#F5F5F5] font-semibold text-[#000000]" : "bg-white font-normal text-[#666666] hover:text-[#000000] hover:bg-neutral-50 cursor-pointer",
    );
    return (
      <li key={n.key} className="shrink-0 lg:w-full">
        {current ? (
          <span aria-current="page" className={cls}>
            <span className="truncate">{n.label}</span>
            {n.count !== undefined && <span className="text-[11px] shrink-0">{n.count}</span>}
          </span>
        ) : (
          <Link
            to={hrefFor(n.key, id)}
            onClick={(e) => {
              if (onTabChange && IN_EDITOR_KEYS.has(n.key)) {
                e.preventDefault();
                onTabChange(n.key);
              }
            }}
            className={cls}
            title={isExternal ? `Open ${n.label} workspace` : undefined}
          >
            <span className="truncate">{n.label}</span>
            <span className="flex items-center gap-1 shrink-0">
              {n.count !== undefined && <span className="text-[11px] shrink-0">{n.count}</span>}
              {isExternal && <ArrowUpRight className="w-3 h-3 text-[#9E9E9E] stroke-[2] shrink-0" aria-hidden="true" />}
            </span>
          </Link>
        )}
      </li>
    );
  };

  return (
    <aside aria-label="Product sections" className="flex flex-col sm:flex-row lg:flex-col justify-between sm:items-start gap-5 w-full lg:w-[120px] pb-5 lg:pb-0 border-b lg:border-b-0 border-[#EAEAEA] shrink-0">
      <nav aria-label="Product" className="flex flex-col gap-4 w-full sm:w-auto lg:w-full">
        <div className="flex flex-col gap-1.5 w-full">
          <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">Product</span>
          <ul className="flex flex-row flex-wrap lg:flex-col gap-1 w-full">
            {inEditorItems.map((n) => renderItem(n, false))}
          </ul>
        </div>

        {workspaceItems.length > 0 && (
          <div className="flex flex-col gap-1.5 w-full pt-1">
            <span className="text-[10px] font-semibold text-[#888888] leading-[145%] uppercase tracking-wider">
              Workspaces
            </span>
            <ul className="flex flex-row flex-wrap lg:flex-col gap-1 w-full">
              {workspaceItems.map((n) => renderItem(n, true))}
            </ul>
          </div>
        )}
      </nav>
      <div className="hidden lg:block w-full h-[1px] bg-[#EAEAEA]" />
      <dl className="flex flex-row flex-wrap lg:flex-col gap-4 w-full sm:w-auto lg:w-full">
        <div className="flex flex-col gap-1">
          <dt className="text-[11px] font-normal text-[#666666] leading-[145%]">Product ID</dt>
          <dd className="text-[11px] font-normal text-[#000000] leading-[145%] break-all">{editor.meta.productId}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[11px] font-normal text-[#666666] leading-[145%]">Created</dt>
          <dd className="text-[11px] font-normal text-[#000000] leading-[145%]">{fmt(editor.meta.createdAt)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[11px] font-normal text-[#666666] leading-[145%]">Last updated</dt>
          <dd className="text-[11px] font-normal text-[#000000] leading-[145%]">
            {fmt(editor.meta.updatedAt)}
            {editor.meta.updatedBy ? <span className="block text-[#666666]">by {editor.meta.updatedBy.name}</span> : null}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
