import { errorMessage, isApiError } from "@/api/errors";
import type { FulfillmentAction, QueueRow } from "@/types/fulfillment";

export const NO_WRITE_REASON = "Your role can view fulfillment but not change it.";
export const NO_SHIPPING_WRITE_REASON = "Your role cannot hand parcels over to a carrier.";

export const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

/** what a failed write says: the API's reason for a refused action, in the screen's words */
export function actionErrorMessage(e: unknown): string {
  if (isApiError(e)) {
    if (e.rule === "action_not_available") {
      const reason = e.details?.reason;
      return typeof reason === "string" && reason ? reason : e.message;
    }
    if (e.rule === "scan_required") return `${e.message} Tick the manual confirmation to continue without scanning.`;
  }
  return errorMessage(e);
}

/** these need scans or a weight, so a row opens the order workspace instead of acting */
const NEEDS_FORM: ReadonlyArray<FulfillmentAction> = ["pick_all", "pack", "exception"];
export const runsFromRow = (a: FulfillmentAction | null): boolean => a !== null && !NEEDS_FORM.includes(a);

/** why the selection cannot go into one pick list (null = it can): confirmed fulfillments of a single warehouse */
export function pickListBlock(rows: QueueRow[]): string | null {
  if (rows.some((r) => r.stage !== "awaiting_pick" || r.onHold)) return "Pick lists can only be made from orders awaiting pick (not on hold).";
  if (new Set(rows.map((r) => r.warehouse.id)).size > 1) return "A pick list covers one warehouse: select orders of the same warehouse.";
  return null;
}

/** why the selection cannot be handed over (null = it can): every order needs a label that is ready */
export function handoverBlock(rows: QueueRow[]): string | null {
  if (rows.some((r) => r.shipmentStatus !== "label_ready")) return "Hand-over needs orders in Ready to ship with a label created.";
  return null;
}
