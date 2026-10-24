import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useGuardedMutation, useSubmitGuard } from "./useSubmitGuard";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe("useSubmitGuard", () => {
  it("runs a second synchronous submit only once", async () => {
    const task = vi.fn(() => new Promise<string>((r) => setTimeout(() => r("ok"), 10)));
    const { result } = renderHook(() => useSubmitGuard());
    let first: Promise<string | undefined>;
    let second: Promise<string | undefined>;
    await act(async () => {
      first = result.current.run(task);
      second = result.current.run(task);
      await first;
    });
    expect(task).toHaveBeenCalledTimes(1);
    expect(await first!).toBe("ok");
    expect(await second!).toBeUndefined();
  });

  it("unlocks after a failure so the person can retry", async () => {
    const { result } = renderHook(() => useSubmitGuard());
    await act(async () => {
      await result.current.run(() => Promise.reject(new Error("nope"))).catch(() => undefined);
    });
    const retry = vi.fn(async () => 1);
    await act(async () => {
      await result.current.run(retry);
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("useGuardedMutation", () => {
  it("sends one request for two synchronous mutate calls with the same input", async () => {
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);
    const { result } = renderHook(() => useGuardedMutation({ mutationFn: (_: { a: number }) => fn() }), { wrapper });
    await act(async () => {
      result.current.mutate({ a: 1 });
      result.current.mutate({ a: 1 });
      d.resolve("done");
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("lets two different inputs run side by side", async () => {
    const fn = vi.fn(async (_: { a: number }) => "x");
    const { result } = renderHook(() => useGuardedMutation({ mutationFn: fn }), { wrapper });
    await act(async () => {
      result.current.mutate({ a: 1 });
      result.current.mutate({ a: 2 });
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("returns the first promise to a duplicate mutateAsync and allows a new call after it settles", async () => {
    const fn = vi.fn(async (_: string) => "r");
    const { result } = renderHook(() => useGuardedMutation({ mutationFn: fn }), { wrapper });
    await act(async () => {
      const a = result.current.mutateAsync("same");
      const b = result.current.mutateAsync("same");
      expect(b).toBe(a);
      await a;
    });
    expect(fn).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.mutateAsync("same");
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("tells two different files apart", async () => {
    const fn = vi.fn(async (_: { file: File }) => "x");
    const { result } = renderHook(() => useGuardedMutation({ mutationFn: fn }), { wrapper });
    await act(async () => {
      result.current.mutate({ file: new File(["a"], "a.csv") });
      result.current.mutate({ file: new File(["b"], "b.csv") });
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
