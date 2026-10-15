import axios from "axios";

/**
 * The ONE Axios instance for the whole app.
 * All api/*.api.ts functions use this — nothing else calls the network.
 */
export const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // sends the httpOnly refresh-token cookie
});

// ---- Access token storage (in-memory only, never localStorage) ----
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken() {
  return _accessToken;
}

// ---- Request interceptor: attach access token ----
client.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

// ---- Response interceptor: normalize errors, handle 401 ----
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as typeof error.config & {
      _retry?: boolean;
    };

    // 401 → attempt token refresh once
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true },
        );
        setAccessToken(data.data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return client(originalRequest);
      } catch {
        // Refresh failed → clear token, redirect to sign-in
        setAccessToken(null);
        window.location.href = "/signin";
        return Promise.reject(error);
      }
    }

    // Normalize error shape → AppError
    const appError = {
      code: error.response?.data?.error?.code ?? "UNKNOWN_ERROR",
      message:
        error.response?.data?.error?.message ??
        error.message ??
        "An unexpected error occurred",
      details: error.response?.data?.error?.details ?? null,
      fields: error.response?.data?.error?.fields ?? null,
      status: error.response?.status ?? 0,
    };

    return Promise.reject(appError);
  },
);
