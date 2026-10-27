/**
 * Where the session tokens live.
 *  - access token: memory only (never written to storage; lost on reload, re-issued from the refresh token)
 *  - refresh token: single-use and rotated by the server on every refresh. It survives a reload in localStorage
 *    ("remember this device") or sessionStorage (this tab only).
 */
const REFRESH_KEY = "omni.refresh-token";
const LEGACY_KEYS = ["omni-ecom-workspace-store"];

let accessToken: string | null = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function getRefreshToken(): string | null {
  return safe(() => window.localStorage.getItem(REFRESH_KEY) ?? window.sessionStorage.getItem(REFRESH_KEY), null);
}

/** Where a rotated token goes: the same place the previous one lived (or `remember` for a fresh login). */
export function setRefreshToken(token: string, remember?: boolean): void {
  if (!token || typeof token !== "string" || token.trim() === "") return;
  safe(() => {
    const inLocal = window.localStorage.getItem(REFRESH_KEY) !== null;
    const persist = remember ?? inLocal;
    if (persist) {
      window.localStorage.setItem(REFRESH_KEY, token.trim());
      window.sessionStorage.removeItem(REFRESH_KEY);
    } else {
      window.sessionStorage.setItem(REFRESH_KEY, token.trim());
      window.localStorage.removeItem(REFRESH_KEY);
    }
  }, undefined);
}

export function clearTokens(): void {
  accessToken = null;
  safe(() => {
    window.localStorage.removeItem(REFRESH_KEY);
    window.sessionStorage.removeItem(REFRESH_KEY);
  }, undefined);
}

/** drops state left behind by the prototype (a persisted fake login) */
export function purgeLegacyStorage(): void {
  safe(() => LEGACY_KEYS.forEach((k) => window.localStorage.removeItem(k)), undefined);
}
