import type { CatalogProduct } from "@/types/product";

export type RowAction = "duplicate" | "archive" | "unarchive" | "delete";

export type Tone = "healthy" | "warning" | "critical" | "draft" | "archived";

/** the pill follows the API: product status first, then the inventory status of an active product */
export function statusPill(p: CatalogProduct): { label: string; tone: Tone } {
  if (p.status === "draft") return { label: "Draft", tone: "draft" };
  if (p.status === "archived") return { label: "Archived", tone: "archived" };
  if (p.summary.inventoryStatus === "low") return { label: "Low stock", tone: "warning" };
  if (p.summary.inventoryStatus === "out") return { label: "Out of stock", tone: "critical" };
  return { label: "Active", tone: "healthy" };
}

export const NO_EDIT_REASON = "You do not have permission to change products";
export const NO_DELETE_REASON = "You do not have permission to delete products";

