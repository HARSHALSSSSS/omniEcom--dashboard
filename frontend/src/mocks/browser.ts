import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

/**
 * MSW browser worker.
 * Started in main.tsx only when VITE_USE_MOCKS=true.
 * All API calls go through this — app code is identical with real backend.
 */
export const worker = setupWorker(...handlers);
