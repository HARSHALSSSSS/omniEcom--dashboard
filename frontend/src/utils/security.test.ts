import { describe, it, expect } from "vitest";
import { isSafeExternalRedirect, isSafeInternalRedirect, isSafeUrl, sanitizeHtml } from "./security";

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
      expect(isSafeInternalRedirect("/\t/evil.com")).toBe(false);
      expect(isSafeInternalRedirect("/a\u0000b")).toBe(false);
    });

    it("rejects scripts, absolute URLs and anything that is not a path", () => {
      expect(isSafeInternalRedirect("javascript:alert(1)")).toBe(false);
      expect(isSafeInternalRedirect("  //evil.com")).toBe(false);
      expect(isSafeInternalRedirect("")).toBe(false);
      expect(isSafeInternalRedirect(null)).toBe(false);
      expect(isSafeInternalRedirect("dashboard")).toBe(false);
    });
  });

  describe("isSafeExternalRedirect", () => {
    it("allows valid https and http redirect URLs", () => {
      expect(isSafeExternalRedirect("https://sellercentral.amazon.in/apps/authorize")).toBe(true);
      expect(isSafeExternalRedirect("https://shop.myshopify.com/admin/oauth/authorize?state=123")).toBe(true);
      expect(isSafeExternalRedirect("http://localhost:3000/oauth")).toBe(true);
    });

    it("blocks javascript, data, and non-http schemes", () => {
      expect(isSafeExternalRedirect("javascript:alert(1)")).toBe(false);
      expect(isSafeExternalRedirect("data:text/html,evil")).toBe(false);
      expect(isSafeExternalRedirect("mailto:victim@example.com")).toBe(false);
      expect(isSafeExternalRedirect("ftp://example.com")).toBe(false);
    });

    it("blocks protocol-relative URLs and paths", () => {
      expect(isSafeExternalRedirect("//evil.com")).toBe(false);
      expect(isSafeExternalRedirect("/dashboard")).toBe(false);
      expect(isSafeExternalRedirect("")).toBe(false);
      expect(isSafeExternalRedirect(null)).toBe(false);
    });

    it("blocks URLs containing CRLF or control characters", () => {
      expect(isSafeExternalRedirect("https://example.com\r\nSet-Cookie:evil")).toBe(false);
    });

    it("blocks remote insecure HTTP and URLs with embedded userinfo", () => {
      expect(isSafeExternalRedirect("http://remote-insecure-site.com/auth")).toBe(false);
      expect(isSafeExternalRedirect("https://attacker:secret@example.com/auth")).toBe(false);
    });

    it("enforces allowed domain list when provided", () => {
      const allowed = ["amazon.in", "shopify.com"];
      expect(isSafeExternalRedirect("https://sellercentral.amazon.in/auth", allowed)).toBe(true);
      expect(isSafeExternalRedirect("https://my-store.shopify.com/auth", allowed)).toBe(true);
      expect(isSafeExternalRedirect("https://malicious-site.com/auth", allowed)).toBe(false);
    });
  });
});


