import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { ApiError } from "./errors";
import { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken, clearTokens } from "@/lib/tokens";

/** `/api/v1` in development (Vite proxies it to the API) or the absolute API URL in staging / production. */
export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

/**
 * The ONE Axios instance. Every api/*.api.ts goes through it.
 * Bearer tokens only: the API does not use cookies, so credentials are never sent.
 */
export const client = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
});

/** the token pair the server returns from a login or a refresh */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

type SessionEvent = { type: "refreshed"; data: unknown } | { type: "expired" };
let listener: ((event: SessionEvent) => void) | null = null;
/** the session layer subscribes here, so this file never imports stores or routers */
export const onSessionEvent = (fn: ((event: SessionEvent) => void) | null) => {
  listener = fn;
};

const PUBLIC_AUTH_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/forgot-password", "/auth/reset-password", "/auth/verify-email"];
const isPublicAuth = (url: string | undefined) => !!url && PUBLIC_AUTH_PATHS.some((p) => url.includes(p));

// Endpoint constants already carry the API base; send those as-is instead of prefixing the base a second time.
client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof config.url === "string" && config.url.startsWith(API_BASE)) config.baseURL = "";
  const token = getAccessToken();
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let inflight: Promise<unknown> | null = null;

/**
 * Trades the refresh token for a new pair. The server rotates the refresh token on every call and treats a reused
 * token as theft (the whole session dies), so concurrent callers MUST share one request.
 */
export function refreshSession(): Promise<unknown> {
  inflight ??= (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new ApiError({ code: "UNAUTHENTICATED", message: "Not signed in", status: 401 });
    try {
      const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken }, { withCredentials: false });
      const data = res.data.data as SessionTokens & Record<string, unknown>;
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      listener?.({ type: "refreshed", data });
      return data;
    } catch (e) {
      const err = toApiError(e);
      // only a definitive "no" ends the session; a network blip keeps the stored token for the next attempt
      if (err.status === 401 || err.status === 403 || err.status === 400) {
        clearTokens();
        listener?.({ type: "expired" });
      }
      throw err;
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** a response without the API's error envelope (a gateway page, a proxy failure): say it in words, not "Request failed with status code 502" */
function fallbackMessage(status: number): string {
  if (status === 502 || status === 503 || status === 504) return "The service is temporarily unavailable. Please try again in a moment.";
  if (status >= 500) return "The server had a problem. Please try again in a moment.";
  return "The request could not be completed.";
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const err = e as AxiosError<{ error?: { code?: string; message?: string; details?: Record<string, unknown> }; requestId?: string }>;
  const body = err.response?.data;
  if (err.response) {
    return new ApiError({
      code: body?.error?.code ?? "UNKNOWN_ERROR",
      message: body?.error?.message ?? fallbackMessage(err.response.status),
      status: err.response.status,
      details: body?.error?.details ?? null,
      requestId: body?.requestId ?? null,
    });
  }
  return new ApiError({ code: "NETWORK_ERROR", message: "Cannot reach the server", status: 0 });
}

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried && !isPublicAuth(original.url) && getRefreshToken()) {
      original._retried = true;
      try {
        await refreshSession();
        original.headers.Authorization = `Bearer ${getAccessToken()}`;
        return client(original);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(toApiError(error));
  },
);

/** unwraps the success envelope: { success, data } -> data */
export const unwrap = <T>(res: { data: { data: T } }): T => res.data.data;
