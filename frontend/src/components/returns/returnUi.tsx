import type { LedgerRow, PhysicalCondition } from "@/types/returns";
import type { DrawerKind } from "./returnParams";

/** what a row's action button says and which drawer it opens (from the ledger's own `action`) */
export function rowAction(row: Pick<LedgerRow, "action" | "refund" | "inspection" | "status">): { label: string; drawer: DrawerKind } {
  switch (row.action?.key) {
    case "inspect":
      return { label: row.inspection.status === "in_progress" ? "Resume →" : "Inspect →", drawer: "inspect" };
    case "review":
      return { label: "Review →", drawer: "inspect" };
    case "refund":
      return { label: row.refund.status === "failed" ? "Review failure →" : "Review refund →", drawer: "refund" };
    case "track":
      return { label: "Track →", drawer: "return" };
    default:
      return { label: "View →", drawer: "return" };
  }
}

export const PHYSICAL_LABEL: Record<PhysicalCondition, string> = {
  usable: "Usable · intact",
  damaged: "Damaged / defect",
  wrong_product: "Wrong product",
  incomplete: "Incomplete",
};

export const PHYSICAL_COLOR: Record<PhysicalCondition, string> = {
  usable: "text-[#16A34A]",
  damaged: "text-[#DC2626]",
  wrong_product: "text-[#DC2626]",
  incomplete: "text-[#D97706]",
};

/** what the receipt says: matched, or fewer units than requested (only known once the goods are in) */
export function systemCondition(row: Pick<LedgerRow, "quantity" | "receivedQuantity" | "receivedAt">): { label: string; color: string } {
  if (!row.receivedAt) return { label: "Awaiting receipt", color: "text-[#666666]" };
  return row.receivedQuantity < row.quantity ? { label: "Quantity mismatch", color: "text-[#D97706]" } : { label: "Receipt matched", color: "text-[#666666]" };
}

/** the suggestion of the Inspection table, by the same rule the API uses for the decision card (suggested only, never applied) */
export function recommendedDisposition(row: Pick<LedgerRow, "inspection" | "quantity" | "receivedQuantity" | "receivedAt">): { label: string; color: string } {
  if (row.receivedAt && row.receivedQuantity < row.quantity) return { label: "Quarantine - Suggested", color: "text-[#D97706]" };
  switch (row.inspection.status) {
    case "passed":
      return { label: "Sellable", color: "text-[#16A34A]" };
    case "failed":
      return { label: "Damaged", color: "text-[#DC2626]" };
    case "requires_review":
      return { label: "Quarantine - Suggested", color: "text-[#D97706]" };
    default:
      return { label: "Pending inspection", color: "text-[#2563EB]" };
  }
}
