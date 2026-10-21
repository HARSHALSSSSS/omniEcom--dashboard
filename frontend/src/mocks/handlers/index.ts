/**
 * MSW handler index. Every screen now talks to the real API, so there are no mock handlers left.
 * Set VITE_USE_MOCKS=true only if you add handlers here for an isolated UI experiment.
 */
import type { RequestHandler } from "msw";

export const handlers: RequestHandler[] = [];
