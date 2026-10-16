/**
 * MSW handler index — combines all module handlers.
 * Add new module handlers here as they are built.
 */
import { authHandlers } from "./auth.handlers";
import { productHandlers } from "./product.handlers";
import { importHandlers } from "./import.handlers";
import { connectorHandlers } from "./connector.handlers";
import { listingHandlers } from "./listing.handlers";
import { inventoryHandlers } from "./inventory.handlers";
import { orderHandlers } from "./order.handlers";
import { attentionHandlers } from "./attention.handlers";
import { hardeningHandlers } from "./hardening.handlers";

export const handlers = [
  ...authHandlers,
  ...productHandlers,
  ...importHandlers,
  ...connectorHandlers,
  ...listingHandlers,
  ...inventoryHandlers,
  ...orderHandlers,
  ...attentionHandlers,
  ...hardeningHandlers,
];
