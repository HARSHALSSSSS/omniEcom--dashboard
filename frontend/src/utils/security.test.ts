import { describe, it, expect } from "vitest";
import { isSafeInternalRedirect, isSafeUrl, sanitizeHtml } from "./security";

describe("security utils", () => {
  describe("sanitizeHtml", () => {
    it("strips script tags and event handlers", () => {
      const malicious = '<p>Hello</p><script>alert("xss")</script><img src="x" onerror="alert(1)">';
      const clean = sanitizeHtml(malicious);
      expect(clean).not.toContain("<script>");
      expect(clean).not.toContain("onerror");
      expect(clean).toContain("<p>Hello</p>");
    });

    it("preserves safe formatting tags", () => {
      const formatted = "<p><strong>Bold</strong> and <em>italic</em> with a <a href=\"https://example.com\">link</a></p>";
      const clean = sanitizeHtml(formatted);
      expect(clean).toContain("<strong>Bold</strong>");
      expect(clean).toContain("<em>italic</em>");
      expect(clean).toContain('href="https://example.com"');
    });

    it("adds rel=noopener noreferrer to target=_blank links", () => {
      const link = '<a href="https://example.com" target="_blank">External</a>';
      const clean = sanitizeHtml(link);
      expect(clean).toContain('rel="noopener noreferrer"');
    });

    it("handles null and empty input safely", () => {
      expect(sanitizeHtml(null)).toBe("");
      expect(sanitizeHtml(undefined)).toBe("");
      expect(sanitizeHtml("")).toBe("");
    });
  });

  describe("isSafeUrl", () => {
    it("allows valid https and http URLs", () => {
      expect(isSafeUrl("https://example.com")).toBe(true);
      expect(isSafeUrl("http://example.com/path?param=1")).toBe(true);
      expect(isSafeUrl("mailto:support@example.com")).toBe(true);
    });

    it("allows safe internal relative URLs", () => {
      expect(isSafeUrl("/dashboard")).toBe(true);
      expect(isSafeUrl("/products/123?tab=info")).toBe(true);
    });

    it("rejects dangerous javascript: and data: schemes", () => {
      expect(isSafeUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeUrl("JAVASCRIPT:alert(1)")).toBe(false);
      expect(isSafeUrl("vbscript:msgbox")).toBe(false);
      expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    });

    it("rejects protocol-relative open redirect URLs", () => {
      expect(isSafeUrl("//evil.com")).toBe(false);
      expect(isSafeUrl("/\\evil.com")).toBe(false);
      expect(isSafeUrl("\\evil.com")).toBe(false);
    });

    it("rejects null, undefined, or blank strings", () => {
      expect(isSafeUrl(null)).toBe(false);
      expect(isSafeUrl(undefined)).toBe(false);
      expect(isSafeUrl("")).toBe(false);
      expect(isSafeUrl("   ")).toBe(false);
    });
  });

  describe("isSafeInternalRedirect", () => {
    it("allows safe root-relative paths", () => {
      expect(isSafeInternalRedirect("/dashboard")).toBe(true);
      expect(isSafeInternalRedirect("/orders?status=active")).toBe(true);
    });

    it("blocks protocol-relative and backslash bypasses", () => {
      expect(isSafeInternalRedirect("//attacker.com")).toBe(false);
      expect(isSafeInternalRedirect("/\\attacker.com")).toBe(false);
      expect(isSafeInternalRedirect("\\attacker.com")).toBe(false);
      expect(isSafeInternalRedirect("https://attacker.com")).toBe(false);
    });

    it("blocks paths with control characters", () => {
      expect(isSafeInternalRedirect("/path\r\nSet-Cookie: evil")).toBe(false);
    });
  });
});
