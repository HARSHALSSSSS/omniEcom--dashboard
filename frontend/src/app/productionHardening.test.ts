import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("production hardening", () => {
  it("keeps the component gallery out of production routes", () => {
    const router = read("src/app/router.tsx");
    expect(router).not.toContain("ComponentsDevPage");
    expect(router).not.toContain("/dev/components");
  });

  it("asks search engines not to index the app", () => {
    expect(read("index.html")).toContain('<meta name="robots" content="noindex"');
  });

  it("drops the mock service worker from production builds unless mocks are on", () => {
    const config = read("vite.config.ts");
    expect(config).toContain("mockServiceWorker.js");
    expect(config).toContain('VITE_USE_MOCKS === "true"');
  });
});
