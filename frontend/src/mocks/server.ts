import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * MSW Node server for Vitest tests.
 * Mirrors the browser worker but runs in Node.
 */
export const server = setupServer(...handlers);
