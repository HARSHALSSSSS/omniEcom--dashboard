import DOMPurify from "dompurify";

/**
 * Security utilities: sanitization, safe URL checking, and open redirect defense.
 */

// Configure DOMPurify hooks to enforce noopener noreferrer on links
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.hasAttribute("target") && node.getAttribute("target") === "_blank") {
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/**
 * Sanitizes rich text HTML using DOMPurify to prevent XSS attacks while preserving
 * standard formatting tags (bold, italics, lists, links).
 */
export function sanitizeHtml(dirtyHtml: string | null | undefined): string {
  if (!dirtyHtml) return "";
  return DOMPurify.sanitize(dirtyHtml, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s",
      "ul", "ol", "li", "a", "span", "code", "pre",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "table", "thead", "tbody", "tr", "th", "td", "div",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class", "id"],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Validates that an external or API-provided URL uses a safe protocol (http/https/mailto)
 * and is not a dangerous scheme like javascript: or data:.
 */
export function isSafeUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Block dangerous schemes including javascript:, vbscript:, data:
  if (/^(javascript|vbscript|data):/i.test(trimmed)) {
    return false;
  }

  // Safe web protocols or mailto
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
    return true;
  }

  // Safe relative paths (e.g. /dashboard)
  if (isSafeInternalRedirect(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Validates that a path is a safe internal relative path and cannot be used
 * as an open redirect (blocks protocol-relative //evil.com or backslash /\\evil.com).
 */
export function isSafeInternalRedirect(path: string | null | undefined): boolean {
  if (!path || typeof path !== "string") return false;
  const trimmed = path.trim();
  // Must start with a single slash and not double-slash or backslash
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\") || trimmed.startsWith("\\")) {
    return false;
  }
  // Disallow CRLF / control characters
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

/**
 * Trusted domains for external OAuth authorization redirects.
 */
export const TRUSTED_OAUTH_DOMAINS = [
  "amazon.com",
  "amazon.in",
  "shopify.com",
  "myshopify.com",
  "flipkart.com",
  "myntra.com",
  "nykaa.com",
  "meesho.com",
  "localhost",
  "127.0.0.1",
] as const;

/**
 * Validates that an external redirect target (such as OAuth authorization URLs)
 * strictly uses a valid HTTP or HTTPS protocol, contains no control characters,
 * contains no embedded credentials, and optionally matches an allowlist of trusted domains.
 * Remote external destinations must use HTTPS; HTTP is only permitted on localhost.
 */
export function isSafeExternalRedirect(
  url: string | null | undefined,
  allowedHosts?: readonly string[],
): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Block control characters / CRLF injection
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return false;
  }

  try {
    const parsed = new URL(trimmed);
    const isLocal =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]";

    // Remote endpoints must use HTTPS; HTTP is only accepted for local dev/testing
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
      return false;
    }

    // Disallow userinfo (e.g. https://attacker@victim.com)
    if (parsed.username || parsed.password) {
      return false;
    }

    // If an allowlist of trusted domains is specified, enforce it
    if (allowedHosts && allowedHosts.length > 0) {
      const host = parsed.hostname.toLowerCase();
      const match = allowedHosts.some((allowed) => {
        const lower = allowed.toLowerCase();
        return host === lower || host.endsWith(`.${lower}`);
      });
      if (!match) return false;
    }

    return true;
  } catch {
    return false;
  }
}


