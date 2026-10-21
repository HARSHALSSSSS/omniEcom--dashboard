import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import type { EditorView } from "@/types/productEdit";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function hrefFor(key: string, id: string): string {
  switch (key) {
    case "variants":
      return `${ROUTES.PRODUCTS}/${id}/variants`;
    case "listings":
      return `${ROUTES.LISTINGS}?productId=${id}`;
    default:
      return `${ROUTES.PRODUCTS}/${id}?tab=${key}`;
  }
}

/** left column: section nav with counts and the product meta (master code, created, last updated) */
export function EditSidebar({ editor }: { editor: EditorView }) {
  const id = editor.product.id;
  return (
    <aside aria-label="Product sections" className="space-y-5 text-xs">
      <nav aria-label="Product">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product</p>
        <ul className="space-y-0.5">
          {editor.nav.map((n) => {
            const current = n.key === "overview";
            const cls = cn("flex items-center justify-between rounded-md px-3 py-1.5", current ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground");
            return (
              <li key={n.key}>
                {current ? (
                  <span aria-current="page" className={cls}>
                    {n.label}
                  </span>
                ) : (
                  <Link to={hrefFor(n.key, id)} className={cls}>
                    {n.label}
                    {n.count !== undefined && <span className="text-[11px]">{n.count}</span>}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <dl className="space-y-2 border-t border-border pt-4">
        <div>
          <dt className="text-muted-foreground">Product ID</dt>
          <dd className="font-mono font-medium text-foreground">{editor.meta.productId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd className="font-medium text-foreground">{fmt(editor.meta.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last updated</dt>
          <dd className="font-medium text-foreground">
            {fmt(editor.meta.updatedAt)}
            {editor.meta.updatedBy ? <span className="block text-muted-foreground">by {editor.meta.updatedBy.name}</span> : null}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
