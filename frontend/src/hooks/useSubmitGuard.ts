import {
  useMutation,
  type DefaultError,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

/**
 * Double-submit protection.
 *
 * A double click (or Enter + click) can fire a handler twice inside one task, before React has re-rendered the
 * button as disabled. Both helpers below lock synchronously with a ref, so the second call never starts.
 */

/**
 * Lock for a submit handler that is written with try/catch: `const release = acquire(); if (!release) return;`
 * then call `release()` in `finally`. A second call before the first releases gets null (a duplicate).
 */
export function useSubmitLock() {
  const locked = useRef(false);
  return useCallback((): (() => void) | null => {
    if (locked.current) return null;
    locked.current = true;
    return () => {
      locked.current = false;
    };
  }, []);
}

/** Wrap a submit handler: while one run is in flight a second `run()` is ignored (returns undefined). */
export function useSubmitGuard() {
  const acquire = useSubmitLock();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T>(task: () => Promise<T> | T): Promise<T | undefined> => {
      const release = acquire();
      if (!release) return undefined;
      setBusy(true);
      try {
        return await task();
      } finally {
        release();
        setBusy(false);
      }
    },
    [acquire],
  );

  return { run, busy };
}

const blobIds = new WeakMap<object, number>();
let nextBlobId = 0;

/** Stable identity of a mutation's variables; files and other non-JSON values are told apart by identity. */
function variablesKey(variables: unknown): string | null {
  try {
    return JSON.stringify(variables ?? null, (_k, value: unknown) => {
      if (typeof value === "function") return undefined;
      if (typeof Blob !== "undefined" && value instanceof Blob) {
        if (!blobIds.has(value)) blobIds.set(value, (nextBlobId += 1));
        return `blob:${blobIds.get(value)}`;
      }
      if (typeof AbortSignal !== "undefined" && value instanceof AbortSignal) return "signal";
      return value;
    });
  } catch {
    return null; // not serialisable: cannot be compared, so it is never treated as a duplicate
  }
}

/**
 * Drop-in `useMutation` that ignores a second identical call while the first is still in flight.
 * `mutate` ignores the duplicate; `mutateAsync` hands back the first call's promise. Calls with different
 * variables (two different rows, say) still run side by side.
 */
export function useGuardedMutation<TData = unknown, TError = DefaultError, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const mutation = useMutation(options);
  const inFlight = useRef(new Map<string, Promise<TData>>());
  const { mutateAsync: rawMutateAsync } = mutation;

  const mutateAsync = useCallback(
    (...args: Parameters<typeof rawMutateAsync>) => {
      const key = variablesKey(args[0]);
      const existing = key === null ? undefined : inFlight.current.get(key);
      if (existing) return existing;
      const promise = rawMutateAsync(...args);
      if (key !== null) {
        inFlight.current.set(key, promise);
        const release = () => {
          if (inFlight.current.get(key) === promise) inFlight.current.delete(key);
        };
        promise.then(release, release);
      }
      return promise;
    },
    [rawMutateAsync],
  ) as typeof rawMutateAsync;

  const mutate = useCallback(
    (...args: Parameters<typeof rawMutateAsync>) => {
      const key = variablesKey(args[0]);
      if (key !== null && inFlight.current.has(key)) return;
      mutateAsync(...args).catch(() => undefined); // the error is on the mutation state, as with plain mutate
    },
    [mutateAsync],
  ) as typeof mutation.mutate;

  return { ...mutation, mutate, mutateAsync };
}
