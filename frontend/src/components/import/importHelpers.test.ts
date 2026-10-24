import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { fileNameFromDisposition } from "@/api/import.api";
import { session, validated } from "@/test/importFixtures";
import type { ImportSession } from "@/types/import";
import { formatBytes, formatEta, importErrorMessage, importOutcomeText } from "./importFormat";
import { readIssuesUrl, readWizardUrl, resolveStep, stepBounds } from "./importParams";

describe("import helpers", () => {
  it("reads the file name of a download", () => {
    expect(fileNameFromDisposition('attachment; filename="product-import-template.csv"', "x.csv")).toBe("product-import-template.csv");
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''my%20file.csv", "x.csv")).toBe("my file.csv");
    expect(fileNameFromDisposition(undefined, "fallback.csv")).toBe("fallback.csv");
  });

  it("formats sizes and estimates", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
    expect(formatEta(null)).toBe("Estimating…");
    expect(formatEta(42)).toBe("about 45 seconds left");
    expect(formatEta(300)).toBe("about 5 min left");
  });

  it("words 413 and 415 for the seller", () => {
    expect(importErrorMessage(new ApiError({ code: "PAYLOAD_TOO_LARGE", message: "x", status: 413 }))).toMatch(/25 MB/);
    expect(importErrorMessage(new ApiError({ code: "UNSUPPORTED_MEDIA_TYPE", message: "x", status: 415 }))).toMatch(/\.xlsx/);
    expect(importErrorMessage(new ApiError({ code: "CONFLICT", message: "Upload the file first", status: 409 }))).toBe("Upload the file first");
  });

  it("keeps the wizard step inside what the status allows", () => {
    expect(stepBounds(undefined)).toEqual({ max: 1, natural: 0 });
    expect(stepBounds(session({ status: "created", headers: [] }))).toEqual({ max: 1, natural: 1 });
    expect(stepBounds(session())).toEqual({ max: 2, natural: 2 });
    expect(stepBounds(session({ status: "validating" }))).toEqual({ max: 3, natural: 3 });
    expect(stepBounds(validated())).toEqual({ max: 4, natural: 3 });
    expect(stepBounds(validated({ status: "committed" }))).toEqual({ max: 4, natural: 4 });
    expect(resolveStep("review", session())).toBe(2);
    expect(resolveStep("upload", undefined)).toBe(1);
    expect(resolveStep("import", undefined)).toBe(1);
    expect(resolveStep("source", validated())).toBe(0);
    expect(resolveStep(null, validated())).toBe(3);
  });

  it("reads only well-formed URL state", () => {
    expect(readWizardUrl(new URLSearchParams("import=nope&step=mapping")).importId).toBeNull();
    expect(readWizardUrl(new URLSearchParams("import=11111111-1111-4111-8111-111111111111&step=bogus"))).toMatchObject({ importId: "11111111-1111-4111-8111-111111111111", requestedStep: null });
    expect(readIssuesUrl(new URLSearchParams("status=bogus&severity=error&page=0&size=7&view=rows"))).toMatchObject({ status: "open", severity: "error", page: 1, pageSize: 25, view: "rows" });
    expect(readIssuesUrl(new URLSearchParams("status=all")).status).toBe("all");
  });
});

describe("importOutcomeText", () => {
  const finished = (results: Partial<ImportSession["results"]>, counters: Partial<ImportSession["counters"]> = {}) =>
    ({
      status: "committed",
      results: { productsCreated: 0, productsUpdated: 0, variantsCreated: 0, variantsUpdated: 0, ...results },
      counters: { total: 10, processed: 10, valid: 10, warning: 0, error: 0, ignored: 0, skipped: 0, committed: 10, failed: 0, percent: 100, etaSeconds: null, ...counters },
    }) as Pick<ImportSession, "status" | "results" | "counters">;

  it("says what was created, updated, skipped and failed", () => {
    expect(importOutcomeText(finished({ productsCreated: 1, variantsCreated: 3 }, { skipped: 1, ignored: 1, failed: 2 }))).toBe("Import finished: 1 product created, 3 variants created. 2 rows skipped, 2 failed.");
  });

  it("is truthful when nothing changed", () => {
    expect(importOutcomeText(finished({}))).toBe("Import finished: no product or variant was created or updated.");
  });
});
