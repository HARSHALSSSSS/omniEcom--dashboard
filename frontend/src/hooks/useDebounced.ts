import { useEffect, useState } from "react";

/**
 * Returns a debounced version of `value` that only updates after `ms` milliseconds
 * of inactivity. Useful for debouncing search inputs and form fields before API calls.
 */
export interface UseDebouncedOptions {
  /** If specified and value is a string, suppress values shorter than minLength (resetting to empty string) */
  minLength?: number;
}

export function useDebounced<T>(value: T, ms: number, options?: UseDebouncedOptions): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(() => {
    if (
      options?.minLength !== undefined &&
      typeof value === "string" &&
      value.length > 0 &&
      value.length < options.minLength
    ) {
      return "" as unknown as T;
    }
    return value;
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        options?.minLength !== undefined &&
        typeof value === "string" &&
        value.length > 0 &&
        value.length < options.minLength
      ) {
        setDebouncedValue("" as unknown as T);
      } else {
        setDebouncedValue(value);
      }
    }, ms);
    return () => clearTimeout(timer);
  }, [value, ms, options?.minLength]);

  return debouncedValue;
}

export const useDebounce = useDebounced;
