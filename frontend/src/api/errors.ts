/**
 * The one error type the app sees. Built from the backend envelope
 * { success:false, error:{ code, message, details }, requestId } (or from a network failure).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown> | null;
  /** field -> message, derived from details.issues (400) or details.errors (422) */
  readonly fields: Record<string, string> | null;
  readonly requestId: string | null;

  constructor(init: { code: string; message: string; status: number; details?: Record<string, unknown> | null; requestId?: string | null }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.details = init.details ?? null;
    this.requestId = init.requestId ?? null;
    this.fields = fieldErrors(this.details);
  }

  /** `details.rule` for business-rule conflicts (code_locked, confirmation_required, ...) */
  get rule(): string | null {
    const rule = this.details?.rule;
    return typeof rule === "string" ? rule : null;
  }
}

function fieldErrors(details: Record<string, unknown> | null): Record<string, string> | null {
  if (!details) return null;
  const out: Record<string, string> = {};
  const issues = details.issues;
  if (Array.isArray(issues)) {
    for (const i of issues as Array<{ path?: string; message?: string }>) {
      if (i?.path && i.message && !(i.path in out)) out[i.path] = i.message;
    }
  }
  const errors = details.errors;
  if (Array.isArray(errors)) {
    for (const e of errors as Array<{ field?: string; path?: string; message?: string }>) {
      const key = e?.field ?? e?.path;
      if (key && e.message && !(key in out)) out[key] = e.message;
    }
  }
  const field = details.field;
  if (typeof field === "string" && !(field in out)) out[field] = "Already in use";
  return Object.keys(out).length ? out : null;
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Friendly sentence for any error (falls back to the server message). */
export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!isApiError(e)) return e instanceof Error && e.message ? e.message : fallback;
  switch (e.code) {
    case "INVALID_CREDENTIALS":
      // the same code also answers "the marketplace rejected these credentials" / "wrong current password": keep their own message
      return !e.message || /e-?mail or password/i.test(e.message) ? "Incorrect email or password." : e.message;
    case "ACCOUNT_LOCKED":
      return "Too many failed attempts. This account is locked for a while, please try again later.";
    case "RATE_LIMITED":
      return "Too many requests. Please wait a moment and try again.";
    case "EMAIL_NOT_VERIFIED":
      return "Please verify your email address first.";
    case "TENANT_SUSPENDED":
      return "This business account is suspended. Contact support.";
    case "NETWORK_ERROR":
      return "Cannot reach the server. Check your connection and try again.";
    case "FORBIDDEN":
      return "You do not have permission to do that.";
    default:
      return e.message || fallback;
  }
}
