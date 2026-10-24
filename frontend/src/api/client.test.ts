import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { client, onSessionEvent, API_BASE } from "./client";
import { ApiError } from "./errors";
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken, setRefreshToken } from "@/lib/tokens";

type Reply = { status: number; data: unknown };

/** replaces the network: answers by a function of the request, records every call */
function fakeServer(answer: (config: InternalAxiosRequestConfig) => Reply) {
  const calls: Array<{ url: string; auth: string | undefined }> = [];
  const adapter: AxiosAdapter = async (config) => {
    calls.push({ url: String(config.url), auth: config.headers.Authorization as string | undefined });
    const reply = answer(config);
    const response = { data: reply.data, status: reply.status, statusText: "", headers: {}, config };
    if (reply.status >= 400) throw new AxiosError("failed", "ERR_BAD_REQUEST", config, null, response);
    return response;
  };
  client.defaults.adapter = adapter;
  return calls;
}

const envelope = (data: unknown) => ({ success: true, data });
const failure = (code: string, message: string, details?: unknown) => ({ success: false, error: { code, message, details }, requestId: "req-1" });
const pair = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresIn: 900, sessionId: "s1", user: {}, vendor: null });

describe("api client", () => {
  const original = client.defaults.adapter;
  let refresh: MockInstance<typeof axios.post>;
  let refreshCount: number;

  beforeEach(() => {
    clearTokens();
    refreshCount = 0;
    refresh = vi.spyOn(axios, "post").mockImplementation(async () => {
      refreshCount += 1;
      await new Promise((r) => setTimeout(r, 10));
      return { data: envelope(pair(refreshCount)) };
    });
  });

  afterEach(() => {
    client.defaults.adapter = original;
    refresh.mockRestore();
    onSessionEvent(null);
    clearTokens();
  });

  it("sends the bearer token and never sends credentials", async () => {
    setAccessToken("access-0");
    const calls = fakeServer(() => ({ status: 200, data: envelope({ ok: true }) }));
    await client.get(`${API_BASE}/me`);
    expect(calls[0]?.auth).toBe("Bearer access-0");
    expect(client.defaults.withCredentials).toBe(false);
  });

  it("refreshes once on a 401 and retries the request with the new token", async () => {
    setAccessToken("expired");
    setRefreshToken("refresh-0", true);
    const calls = fakeServer((c) => (c.headers.Authorization === "Bearer access-1" ? { status: 200, data: envelope({ ok: true }) } : { status: 401, data: failure("UNAUTHENTICATED", "expired") }));
    const res = await client.get(`${API_BASE}/me`);
    expect(res.data.data).toEqual({ ok: true });
    expect(refreshCount).toBe(1);
    expect(calls).toHaveLength(2);
    expect(getAccessToken()).toBe("access-1");
    expect(getRefreshToken()).toBe("refresh-1");
  });

  it("shares ONE refresh between parallel requests (the server treats a reused refresh token as theft)", async () => {
    setAccessToken("expired");
    setRefreshToken("refresh-0", true);
    fakeServer((c) => (c.headers.Authorization === "Bearer access-1" ? { status: 200, data: envelope({ ok: true }) } : { status: 401, data: failure("UNAUTHENTICATED", "expired") }));
    const results = await Promise.all([client.get(`${API_BASE}/a`), client.get(`${API_BASE}/b`), client.get(`${API_BASE}/c`)]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(refreshCount).toBe(1);
  });

  it("does not try to refresh when the login itself is refused", async () => {
    setRefreshToken("refresh-0", true);
    fakeServer(() => ({ status: 401, data: failure("INVALID_CREDENTIALS", "Invalid email or password") }));
    const error = await client.post(`${API_BASE}/auth/login`, { email: "a@b.co", password: "x" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("INVALID_CREDENTIALS");
    expect(refreshCount).toBe(0);
  });

  it("ends the session when the refresh token is refused", async () => {
    setAccessToken("expired");
    setRefreshToken("refresh-0", true);
    const events: string[] = [];
    onSessionEvent((e) => events.push(e.type));
    refresh.mockImplementation(async () => {
      throw new AxiosError("no", "ERR_BAD_REQUEST", undefined, null, { data: failure("UNAUTHENTICATED", "refresh token reused"), status: 401, statusText: "", headers: {}, config: {} as InternalAxiosRequestConfig });
    });
    fakeServer(() => ({ status: 401, data: failure("UNAUTHENTICATED", "expired") }));
    const error = await client.get(`${API_BASE}/me`).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(events).toEqual(["expired"]);
    expect(getRefreshToken()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it("keeps the stored refresh token through a network failure", async () => {
    setAccessToken("expired");
    setRefreshToken("refresh-0", true);
    refresh.mockImplementation(async () => {
      throw new AxiosError("Network Error", "ERR_NETWORK");
    });
    fakeServer(() => ({ status: 401, data: failure("UNAUTHENTICATED", "expired") }));
    const error = (await client.get(`${API_BASE}/me`).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("NETWORK_ERROR");
    expect(getRefreshToken()).toBe("refresh-0");
  });

  it("words a gateway or proxy failure (no API envelope) instead of the raw axios text", async () => {
    fakeServer(() => ({ status: 502, data: "<html>Bad Gateway</html>" }));
    const bad = (await client.get(`${API_BASE}/orders`).catch((e: unknown) => e)) as ApiError;
    expect(bad.status).toBe(502);
    expect(bad.message).toBe("The service is temporarily unavailable. Please try again in a moment.");
    fakeServer(() => ({ status: 500, data: "" }));
    const boom = (await client.get(`${API_BASE}/orders`).catch((e: unknown) => e)) as ApiError;
    expect(boom.message).toBe("The server had a problem. Please try again in a moment.");
    // the API's own message still wins
    fakeServer(() => ({ status: 500, data: failure("INTERNAL", "Something broke on our side") }));
    expect(((await client.get(`${API_BASE}/orders`).catch((e: unknown) => e)) as ApiError).message).toBe("Something broke on our side");
  });

  it("turns validation details into per-field messages", async () => {
    fakeServer(() => ({
      status: 400,
      data: failure("VALIDATION_FAILED", "Invalid request", { location: "body", issues: [{ path: "password", message: "must be at least 10 characters" }, { path: "email", message: "invalid email" }] }),
    }));
    const error = (await client.post(`${API_BASE}/auth/register`, {}).catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(400);
    expect(error.fields).toEqual({ password: "must be at least 10 characters", email: "invalid email" });
    expect(error.requestId).toBe("req-1");
  });

  it("exposes the business rule behind a 409", async () => {
    fakeServer(() => ({ status: 409, data: failure("CONFLICT", "Product code is locked", { rule: "code_locked" }) }));
    const error = (await client.patch(`${API_BASE}/products/1`, {}).catch((e: unknown) => e)) as ApiError;
    expect(error.rule).toBe("code_locked");
  });

  it("calls an unreachable server a network error", async () => {
    client.defaults.adapter = async (config) => {
      throw new AxiosError("Network Error", "ERR_NETWORK", config);
    };
    const error = (await client.get(`${API_BASE}/me`).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.status).toBe(0);
  });
});
