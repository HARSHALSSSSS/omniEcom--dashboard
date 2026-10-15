/**
 * MSW handler index — combines all module handlers.
 * Add new module handlers here as they are built.
 */
import { authHandlers } from "./auth.handlers";

export const handlers = [
  ...authHandlers,
  // TODO(backend): add handlers per module as they are built
  // ...productHandlers,
  // ...inventoryHandlers,
  // ...orderHandlers,
  // ...connectorHandlers,
  // ...listingHandlers,
];
