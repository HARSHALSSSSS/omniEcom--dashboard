// Handle undici / JSDOM AbortSignal mismatch in React Router navigation
const OriginalRequest = globalThis.Request;
if (OriginalRequest) {
  globalThis.Request = class Request extends OriginalRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (init && init.signal) {
        try {
          super(input, init);
          return;
        } catch (e: unknown) {
          if (e instanceof Error && e.message.includes("AbortSignal")) {
            const rest = { ...init };
            delete rest.signal;
            super(input, rest);
            return;
          }
          throw e;
        }
      }
      super(input, init);
    }
  } as typeof Request;
}

import "@testing-library/jest-dom";
import { beforeAll, afterAll, afterEach } from "vitest";
import { server } from "../mocks/server";

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

// Reset handlers between tests
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
