import { isApiError } from "@/api/errors";

/** 409 VERSION_CONFLICT: somebody saved a newer version while this was open */
export const isVersionConflict = (e: unknown): boolean => isApiError(e) && (e.code === "VERSION_CONFLICT" || e.rule === "version_conflict");

/** `{ "lines.0.quantity": "..." }` to the message of a form field (first match wins) */
export function fieldError(fields: Record<string, string> | null | undefined, ...names: string[]): string | null {
  if (!fields) return null;
  for (const n of names) if (fields[n]) return fields[n] ?? null;
  return null;
}
